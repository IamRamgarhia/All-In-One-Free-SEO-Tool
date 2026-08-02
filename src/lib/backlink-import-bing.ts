/**
 * Import a client's backlinks from Bing Webmaster Tools.
 *
 * Backlinks are this project's weakest data and the README says so
 * rather than implying parity with Ahrefs. Bing fixes that for one
 * specific, common case: a site the user has verified in Bing Webmaster
 * Tools. Microsoft hands over their own link graph for it, free.
 *
 * The honest limits, which the UI states rather than burying:
 *
 *   - Only sites the user has VERIFIED. This does nothing for
 *     competitors, which is half of what people want backlink data for.
 *   - Bing's index, not Google's. They overlap heavily but not
 *     completely, and a link Bing hasn't found isn't necessarily absent.
 *   - No authority metric. Bing doesn't publish one, and inventing a
 *     number here would be worse than leaving the column empty.
 *
 * A partial, honest picture beats no picture — but only if the user
 * knows which one they're looking at.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { backlinks, clients } from "@/db/schema";
import {
  getBingApiKey,
  getBingInboundLinks,
  getBingLinkCounts,
  listBingSites,
} from "./bing-webmaster";
import { logActivity } from "./activity";

export type BingImportResult = {
  ok: boolean;
  added: number;
  updated: number;
  scannedPages: number;
  error?: string;
  /** Shown verbatim to the user when we couldn't do the whole job. */
  note?: string;
};

/**
 * How many of the client's own pages to fetch link details for.
 *
 * Each one is a separate API call, and a large site has thousands. The
 * link counts come back sorted, so the most-linked pages — the ones that
 * matter — are covered first. Bounded rather than exhaustive on purpose:
 * an import that hammers an API for ten minutes is one users cancel.
 */
const MAX_TARGET_PAGES = 50;
/** Pagination depth per target page. */
const MAX_LINK_PAGES = 5;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Match the client's site against the properties verified in Bing.
 *
 * Bing wants the siteUrl exactly as verified — "https://example.com/"
 * will not match a property registered as "http://www.example.com". So
 * compare on domain and hand back Bing's own string.
 */
export async function resolveBingSite(
  clientUrl: string,
): Promise<{ siteUrl: string } | { error: string }> {
  const target = domainOf(clientUrl);
  if (!target) return { error: "That client's URL doesn't parse." };

  let sites;
  try {
    sites = await listBingSites();
  } catch (err) {
    return {
      error: `Couldn't reach Bing Webmaster Tools: ${(err as Error).message}`,
    };
  }

  const match = sites.find((s) => domainOf(s.Url) === target);
  if (!match) {
    return {
      error:
        sites.length === 0
          ? "No sites found on that Bing account. Add and verify the site at bing.com/webmasters first."
          : `This client's domain isn't verified in Bing Webmaster Tools. Verified there: ${sites
              .map((s) => domainOf(s.Url))
              .filter(Boolean)
              .join(", ")}.`,
    };
  }
  if (!match.IsVerified) {
    return {
      error:
        "That site is in Bing Webmaster Tools but hasn't been verified yet. Bing only shares link data for verified sites.",
    };
  }

  return { siteUrl: match.Url };
}

export async function importBingBacklinks(
  clientId: number,
): Promise<BingImportResult> {
  const empty = { added: 0, updated: 0, scannedPages: 0 };

  if (!(await getBingApiKey())) {
    return {
      ok: false,
      ...empty,
      error:
        "No Bing Webmaster Tools API key. Get one free at bing.com/webmasters → Settings → API access, then add it in Settings.",
    };
  }

  const [client] = await db
    .select({ id: clients.id, url: clients.url, name: clients.name })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, ...empty, error: "No such client." };

  const resolved = await resolveBingSite(client.url);
  if ("error" in resolved) {
    return { ok: false, ...empty, error: resolved.error };
  }

  let counts;
  try {
    counts = await getBingLinkCounts({ siteUrl: resolved.siteUrl });
  } catch (err) {
    return {
      ok: false,
      ...empty,
      error: `Bing rejected the link-counts request: ${(err as Error).message}`,
    };
  }

  if (counts.length === 0) {
    return {
      ok: true,
      ...empty,
      note: "Bing doesn't know of any inbound links to this site yet. That's normal for a new site, and it doesn't mean there are none — Bing's index isn't Google's.",
    };
  }

  // Most-linked pages first: bounded work, spent where it counts.
  const targets = counts
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TARGET_PAGES);

  const seen = new Map<string, { sourceUrl: string; anchorText: string | null; targetUrl: string }>();

  for (const target of targets) {
    for (let page = 0; page < MAX_LINK_PAGES; page++) {
      let links;
      try {
        links = await getBingInboundLinks({
          siteUrl: resolved.siteUrl,
          targetUrl: target.url,
          page,
        });
      } catch {
        // One page failing shouldn't discard everything already
        // collected — move on to the next target.
        break;
      }
      if (links.length === 0) break;

      for (const l of links) {
        const domain = domainOf(l.sourceUrl);
        if (!domain) continue;
        // Self-links are not backlinks. Bing includes internal links in
        // this endpoint, and importing them would inflate the count with
        // the client's own pages — a number that looks like progress and
        // isn't.
        if (domain === domainOf(client.url)) continue;
        if (!seen.has(l.sourceUrl)) {
          seen.set(l.sourceUrl, {
            sourceUrl: l.sourceUrl,
            anchorText: l.anchorText,
            targetUrl: target.url,
          });
        }
      }
    }
  }

  if (seen.size === 0) {
    return {
      ok: true,
      added: 0,
      updated: 0,
      scannedPages: targets.length,
      note: "Bing reported inbound link counts but returned no individual links. That usually means the data is still being compiled on their side — try again in a few days.",
    };
  }

  // Existing rows, so a re-import refreshes rather than duplicating.
  const incoming = [...seen.keys()];
  const existing = await db
    .select({ id: backlinks.id, sourceUrl: backlinks.sourceUrl })
    .from(backlinks)
    .where(
      and(
        eq(backlinks.clientId, clientId),
        inArray(backlinks.sourceUrl, incoming),
      ),
    );
  const existingByUrl = new Map(existing.map((e) => [e.sourceUrl, e.id]));

  let added = 0;
  let updated = 0;
  const now = new Date();

  for (const link of seen.values()) {
    const existingId = existingByUrl.get(link.sourceUrl);
    if (existingId) {
      // Only touch lastSeen and status. Anything the user edited by hand
      // — notes, method, the authority they looked up elsewhere — stays.
      await db
        .update(backlinks)
        .set({ lastSeen: now, status: "active", updatedAt: now })
        .where(eq(backlinks.id, existingId));
      updated++;
    } else {
      await db.insert(backlinks).values({
        clientId,
        sourceUrl: link.sourceUrl,
        sourceDomain: domainOf(link.sourceUrl),
        targetUrl: link.targetUrl,
        anchorText: link.anchorText,
        // No authority score: Bing doesn't publish one, and inventing a
        // number would be worse than an empty column.
        domainAuthority: null,
        status: "active",
        source: "bing_wmt",
        firstSeen: now,
        lastSeen: now,
      });
      added++;
    }
  }

  await logActivity({
    kind: "client.created",
    message: `Imported ${added} new backlink${added === 1 ? "" : "s"} for ${client.name} from Bing Webmaster Tools.`,
    clientId,
    level: "success",
    dedupe: false,
  });

  return {
    ok: true,
    added,
    updated,
    scannedPages: targets.length,
    note:
      counts.length > MAX_TARGET_PAGES
        ? `Checked the ${MAX_TARGET_PAGES} most-linked pages out of ${counts.length}. Run it again later to go deeper.`
        : undefined,
  };
}
