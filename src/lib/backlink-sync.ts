/**
 * Turning backlink discovery into a backlink profile.
 *
 * `backlink-discovery.ts` is a genuinely good engine — DuckDuckGo plus
 * Common Crawl, then a crawl-to-confirm pass that promotes a mention to
 * a verified link and pulls its anchor text. No paid index, no key.
 *
 * And its results went nowhere. The tool page rendered them and the tab
 * was closed, so the `backlinks` table held one row, entered by hand.
 * Every question a client report actually asks — what did we gain this
 * month, what did we lose — had no source, while the code to answer both
 * sat finished and unplugged.
 *
 * This is the plug. It runs discovery, writes what is new, refreshes
 * what is still there, and brings back anything previously marked lost
 * that has reappeared.
 *
 * What it deliberately does NOT do is delete. A link missing from one
 * discovery run has not necessarily gone: this index is partial by
 * design and a run that finds fewer links usually means the search
 * results moved, not that the web did. Marking links lost is
 * `lost-link-check.ts`'s job, and it does it by fetching the source page
 * and looking — which is evidence, where absence from a scrape is not.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { backlinks, clients } from "@/db/schema";
import { discoverBacklinks } from "./backlink-discovery";

export type BacklinkSyncResult = {
  clientId: number;
  /** Links discovery confirmed with a real <a href>. */
  verified: number;
  /** Rows written for the first time. */
  added: number;
  /** Already known, timestamp refreshed. */
  refreshed: number;
  /** Previously marked lost, found again. */
  recovered: number;
  errors: string[];
};

/**
 * Only verified links are stored.
 *
 * Discovery returns "mention" rows too — pages that name the domain
 * without linking to it. Those are worth a person's attention as
 * outreach targets, but writing them into `backlinks` would inflate
 * every count in every report with links that do not exist. A backlink
 * table that overstates is worse than a small one.
 */
const STORE_ONLY_VERIFIED = true;

export async function syncBacklinks(opts: {
  clientId: number;
  /** Defaults to the client's own URL. */
  targetDomain?: string;
  limit?: number;
}): Promise<BacklinkSyncResult> {
  const [client] = await db
    .select({ id: clients.id, url: clients.url })
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);

  const target = opts.targetDomain ?? client?.url;
  const empty: BacklinkSyncResult = {
    clientId: opts.clientId,
    verified: 0,
    added: 0,
    refreshed: 0,
    recovered: 0,
    errors: [],
  };
  if (!client || !target) {
    return { ...empty, errors: ["No client URL to discover links for."] };
  }

  const found = await discoverBacklinks({
    targetDomain: target,
    limit: opts.limit ?? 60,
  });

  const links = STORE_ONLY_VERIFIED
    ? found.links.filter((l) => l.status === "verified")
    : found.links;

  if (links.length === 0) {
    return { ...empty, errors: found.errors };
  }

  // What we already hold for this client, keyed the same way we compare.
  const existing = await db
    .select({
      id: backlinks.id,
      sourceUrl: backlinks.sourceUrl,
      status: backlinks.status,
    })
    .from(backlinks)
    .where(eq(backlinks.clientId, opts.clientId));

  const now = new Date();
  const { toInsert, refreshIds, recoverIds } = planSync({
    clientId: opts.clientId,
    target,
    links,
    existing,
    now,
  });

  // Chunked to stay under SQLite's parameter ceiling, the same way the
  // Ahrefs CSV import does.
  const CHUNK = 200;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    await db.insert(backlinks).values(toInsert.slice(i, i + CHUNK));
  }

  for (let i = 0; i < refreshIds.length; i += CHUNK) {
    await db
      .update(backlinks)
      .set({ lastSeen: now })
      .where(inArray(backlinks.id, refreshIds.slice(i, i + CHUNK)));
  }

  for (let i = 0; i < recoverIds.length; i += CHUNK) {
    await db
      .update(backlinks)
      .set({ lastSeen: now, status: "active" })
      .where(
        and(
          inArray(backlinks.id, recoverIds.slice(i, i + CHUNK)),
          eq(backlinks.clientId, opts.clientId),
        ),
      );
  }

  return {
    clientId: opts.clientId,
    verified: links.length,
    added: toInsert.length,
    refreshed: refreshIds.length,
    recovered: recoverIds.length,
    errors: found.errors,
  };
}

export type KnownLink = {
  id: number;
  sourceUrl: string;
  status: "active" | "lost" | "disavow";
};

export type SyncPlan = {
  toInsert: (typeof backlinks.$inferInsert)[];
  refreshIds: number[];
  recoverIds: number[];
};

/**
 * What to write, given what was found and what is already held.
 *
 * Split out from the database work so the three outcomes can be tested
 * without the network, because all three are numbers a client reads and
 * all three fail quietly. A link counted as new when it was only
 * refreshed inflates the month's work; a recovery counted as new claims
 * credit for a link somebody else earned; a duplicate doubles the
 * profile on the second sync and never again, which reads as a spike
 * nobody can account for.
 *
 * A link already marked "disavow" is left completely alone. Somebody
 * decided that link was harmful, and quietly reactivating it because a
 * scrape found it again would override a deliberate choice.
 */
export function planSync(opts: {
  clientId: number;
  target: string;
  links: readonly {
    url: string;
    domain: string;
    anchorText: string | null;
    rel: string | null;
  }[];
  existing: readonly KnownLink[];
  now: Date;
}): SyncPlan {
  const known = new Map(
    opts.existing.map((r) => [normaliseUrl(r.sourceUrl), r]),
  );

  const toInsert: SyncPlan["toInsert"] = [];
  const refreshIds: number[] = [];
  const recoverIds: number[] = [];
  const seen = new Set<string>();

  for (const l of opts.links) {
    const key = normaliseUrl(l.url);
    // One discovery run can return the same page twice — once from each
    // source. Writing both would double the count on the first sync and
    // then never again.
    if (seen.has(key)) continue;
    seen.add(key);

    const hit = known.get(key);
    if (hit) {
      // Somebody's decision to disavow outranks a scrape finding it.
      if (hit.status === "disavow") continue;
      // A link we had marked lost that is demonstrably back. Reporting a
      // recovery as a new link would overstate the month's work.
      if (hit.status === "lost") recoverIds.push(hit.id);
      else refreshIds.push(hit.id);
      continue;
    }

    toInsert.push({
      clientId: opts.clientId,
      sourceUrl: l.url,
      sourceDomain: l.domain,
      targetUrl: opts.target,
      anchorText: l.anchorText,
      rel: l.rel,
      status: "active",
      source: "discovered",
      firstSeen: opts.now,
      lastSeen: opts.now,
    });
  }

  return { toInsert, refreshIds, recoverIds };
}

/**
 * The form two URLs are compared in.
 *
 * Case and a trailing slash are not a different page, and treating them
 * as one is how a profile grows a duplicate of every link on its second
 * sync. Matches the normaliser the CSV importer already uses, so a link
 * imported from Ahrefs and the same link found by discovery collapse
 * rather than both being stored.
 */
export function normaliseUrl(u: string): string {
  return u.trim().toLowerCase().replace(/\/$/, "");
}

/** Sync every client that has a URL. One failure never stops the rest. */
export async function tickBacklinkSync(): Promise<BacklinkSyncResult[]> {
  const rows = await db
    .select({ id: clients.id, url: clients.url })
    .from(clients);

  const out: BacklinkSyncResult[] = [];
  for (const c of rows) {
    if (!c.url) continue;
    try {
      out.push(await syncBacklinks({ clientId: c.id }));
    } catch (err) {
      out.push({
        clientId: c.id,
        verified: 0,
        added: 0,
        refreshed: 0,
        recovered: 0,
        errors: [(err as Error).message],
      });
    }
  }
  return out;
}
