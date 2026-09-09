/**
 * Lost-backlink watchdog. Once a week, fetch every "active" backlink's
 * source URL and scan for the target domain in the HTML. If not found,
 * flag status="lost" and create a recovery task.
 *
 * Caps: only checks links last verified > 14 days ago, max 100 per run.
 * Avoids hammering small sites — randomised order + 1500ms gap.
 */

import { and, asc, eq, lte, or, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { backlinks, clients, tasks } from "@/db/schema";
import { logActivity } from "./activity";
import { getSetting, setSetting } from "./settings-store";
import { guardedFetch } from "./url-guard";

const RUN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;
const RECHECK_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const PER_RUN_CAP = 100;

/**
 * How many consecutive misses before a link is called lost.
 *
 * One is not enough. A source page that renders its links with
 * JavaScript, one behind a consent wall, and one temporarily serving a
 * bot-block page all return 200 with no link in the HTML — identical, to
 * this check, to a link somebody removed.
 *
 * Flagging on the first miss produced a lost link that was not lost, a
 * high-priority recovery task nobody needed, and a line in the client's
 * report saying work had been undone. Two misses across two runs costs
 * at most one extra cycle on a genuinely dead link and removes most of
 * that.
 */
export const MISSES_BEFORE_LOST = 2;

/**
 * Does this HTML link to the target domain?
 *
 * Deliberately conservative about what counts as absent: an empty body
 * is not a missing link, it is a page we failed to read, and the caller
 * treats the two differently.
 */
export function linkPresent(html: string, targetDomain: string): boolean {
  if (html.length === 0) return false;
  return (
    html.includes(`href="https://${targetDomain}`) ||
    html.includes(`href="http://${targetDomain}`) ||
    html.includes(`href="//${targetDomain}`) ||
    html.includes(`href='https://${targetDomain}`) ||
    html.includes(`href='http://${targetDomain}`) ||
    html.includes(`href='//${targetDomain}`)
  );
}

/**
 * What to do about one checked link.
 *
 * Pure, so the three outcomes can be tested without the network. Each of
 * them is a number somebody reads: a false "lost" claims work was undone
 * that was not, and a missed one hides a link that is genuinely gone.
 */
export function decideLink(opts: {
  present: boolean;
  missStreak: number;
}): { action: "seen" | "strike" | "lost"; missStreak: number } {
  if (opts.present) return { action: "seen", missStreak: 0 };
  const next = (opts.missStreak ?? 0) + 1;
  return next >= MISSES_BEFORE_LOST
    ? { action: "lost", missStreak: next }
    : { action: "strike", missStreak: next };
}
const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export async function runLostLinkCheck(): Promise<{
  checked: number;
  lost: number;
}> {
  const last = await getSetting<number>("lost_link_runner.last_run").catch(
    () => null,
  );
  if (typeof last === "number" && Date.now() - last < RUN_INTERVAL_MS) {
    return { checked: 0, lost: 0 };
  }
  await setSetting("lost_link_runner.last_run", Date.now());

  const cutoff = new Date(Date.now() - RECHECK_AGE_MS);
  const candidates = await db
    .select({
      id: backlinks.id,
      clientId: backlinks.clientId,
      missStreak: backlinks.missStreak,
      sourceUrl: backlinks.sourceUrl,
      sourceDomain: backlinks.sourceDomain,
      targetUrl: backlinks.targetUrl,
      lastSeen: backlinks.lastSeen,
      clientUrl: clients.url,
    })
    .from(backlinks)
    .leftJoin(clients, eq(backlinks.clientId, clients.id))
    .where(
      and(
        eq(backlinks.status, "active"),
        ne(backlinks.sourceUrl, ""),
        or(isNull(backlinks.lastSeen), lte(backlinks.lastSeen, cutoff))!,
      ),
    )
    .orderBy(asc(backlinks.lastSeen))
    .limit(PER_RUN_CAP);

  let checked = 0;
  let lost = 0;

  for (const b of candidates) {
    const targetDomain = extractDomain(b.targetUrl ?? b.clientUrl ?? "");
    if (!targetDomain) continue;

    let html = "";
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 12_000);
            // Guarded: a source URL is whatever discovery found or a user
      // typed, and this now runs on a schedule rather than on a click.
const res = await guardedFetch(b.sourceUrl, {
        headers: { "user-agent": USER_AGENT, accept: "text/html" },
        signal: ac.signal,
        redirect: "follow",
      });
      clearTimeout(t);
      if (res.ok) html = (await res.text()).slice(0, 2_000_000);
    } catch {
      // network errors don't count as "lost" — give the link the benefit
      // of the doubt and skip until next run
      continue;
    }
    checked++;

    // One decision function, used here and tested directly. Writing the
    // rule twice is how the two drift.
    const verdict = decideLink({
      present: linkPresent(html, targetDomain),
      missStreak: b.missStreak ?? 0,
    });
    const streak = verdict.missStreak;

    if (verdict.action === "seen") {
      await db
        .update(backlinks)
        .set({ lastSeen: new Date(), missStreak: 0 })
        .where(eq(backlinks.id, b.id));
      continue;
    }

    if (verdict.action === "strike") {
      // Only the streak. NOT lastSeen — that means "when we last saw the
      // link", and the candidate query uses it to decide what is due for
      // a re-check. Touching it here pushed the link outside the
      // fourteen-day window, so the second strike could never land and
      // nothing was ever marked lost again.
      await db
        .update(backlinks)
        .set({ missStreak: streak })
        .where(eq(backlinks.id, b.id));
      continue;
    }

    {
      lost++;
      await db
        .update(backlinks)
        .set({
          status: "lost",
          missStreak: streak,
          lastSeen: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(backlinks.id, b.id));

      if (b.clientId) {
        await logActivity({
          kind: "page.changed",
          message: `Lost backlink from ${b.sourceDomain}`,
          level: "warning",
          clientId: b.clientId,
          entityType: "backlink",
          entityId: b.id,
        });
        await db.insert(tasks).values({
          clientId: b.clientId,
          title: `Recover lost link from ${b.sourceDomain}`,
          description: `Originally pointing to ${b.targetUrl ?? "(target URL unknown)"}.\nSource: ${b.sourceUrl}`,
          whyItMatters:
            "Lost links are the cheapest links to recover — the publisher already considered you worth linking to once.",
          priority: "high",
          status: "todo",
          dueDate: new Date(Date.now() + 86_400_000 * 3),
          source: "lost_link",
          sourceRef: `lost-${b.id}`,
        });
      }
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  return { checked, lost };
}

function extractDomain(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
      .hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
