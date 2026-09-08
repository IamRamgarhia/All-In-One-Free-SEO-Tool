/**
 * What to do next, across every client, and why.
 *
 * The tool finds a great deal — 415 open findings and 164 overdue tasks
 * on this machine as I write this — and until now it presented all of it
 * flat. A list of 415 problems is not more useful than a list of 5; it
 * is considerably less, because nobody reads it twice.
 *
 * This ranks. Every item says what to do, why it is worth doing, roughly
 * how long it takes, and — the part that matters — whether the agent
 * will do it tonight or whether it needs a person. Work a human must do
 * used to fall out of the agent's plan and simply vanish.
 *
 * It is deliberately NOT a second ranking system. Where the agent can
 * act, the weights come from the planner's own FIXABLE map, so the boss
 * and the agent cannot disagree about what matters. Everything here is
 * the superset: the things the agent cannot do, which is most of SEO.
 *
 * Read-only. It decides nothing and writes nothing — it is the thing
 * that tells you what deciding would look like.
 */

import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditIssues,
  audits,
  clients,
  keywordRankings,
  keywords,
  proposals,
  tasks,
} from "@/db/schema";
import { FIXABLE } from "./agent/planner";

export type ActionOwner = "agent" | "you";

export type NextAction = {
  /** Stable id, so the UI can key rows without re-deriving them. */
  id: string;
  clientId: number;
  clientName: string;
  title: string;
  /** One sentence. Why this is worth doing, not what it is. */
  why: string;
  /** Higher runs first. See `rank` below for how it is built. */
  score: number;
  /** Roughly how long, in minutes. Used to break ties toward quick wins. */
  minutes: number;
  owner: ActionOwner;
  href: string;
  /** What produced this — shown so a ranking can be argued with. */
  because: string;
};

/**
 * How the ordering works, in one place so it can be argued with.
 *
 * impact  what changes if it is done, 0-100
 * effort  minutes, floored at 5 so a two-minute task cannot dominate
 *
 * Score is impact weighted against effort, not impact alone. A 60-impact
 * job that takes five minutes should outrank an 80-impact job that takes
 * a day, because the first one will actually get done today. Blocked
 * setup beats everything because nothing else works until it is cleared.
 */
export function rank(impact: number, minutes: number): number {
  return Math.round((impact * 100) / Math.max(5, minutes));
}

/**
 * The most any ordinary item can score.
 *
 * impact is capped at 100 and effort is floored at 5, so nothing weighed
 * by `rank` can exceed this. Blockers are placed above it deliberately.
 */
export const MAX_ORDINARY_SCORE = 2000;

/**
 * Work that has to happen before the rest of the list means anything.
 *
 * A site that cannot be reached and a client that has never been crawled
 * are not "high impact work" — they are the reason every other row for
 * that client is fiction. Weighed on impact-against-effort alone, a
 * five-minute keyword check outranked "we cannot reach this site at all",
 * which is an arithmetically defensible score and a useless list.
 *
 * Blockers still order among themselves by the same formula; they are
 * simply lifted clear of everything that is downstream of them.
 */
export const BLOCKING_FLOOR = 10_000;

function blocking(impact: number, minutes: number): number {
  return BLOCKING_FLOOR + rank(impact, minutes);
}

type ClientRow = {
  id: number;
  name: string;
  gscProperty: string | null;
  wpEndpoint: string | null;
  niche: string | null;
};

export async function nextActions(opts: {
  /** One client, or every client when omitted. */
  clientId?: number;
  /** Cap. The point is a short list. */
  limit?: number;
} = {}): Promise<NextAction[]> {
  const limit = opts.limit ?? 12;

  const clientRows: ClientRow[] = await db
    .select({
      id: clients.id,
      name: clients.name,
      gscProperty: clients.gscProperty,
      wpEndpoint: clients.wpEndpoint,
      niche: clients.niche,
    })
    .from(clients)
    .where(opts.clientId ? eq(clients.id, opts.clientId) : sql`1=1`);

  if (clientRows.length === 0) return [];

  const out: NextAction[] = [];
  const now = Date.now();

  for (const c of clientRows) {
    const add = (a: Omit<NextAction, "clientId" | "clientName">) =>
      out.push({ ...a, clientId: c.id, clientName: c.name });

    // ---- 1. Has this client ever been audited? ------------------------
    const [latest] = await db
      .select({ id: audits.id, completedAt: audits.completedAt })
      .from(audits)
      // kind matters: the AI site audit writes into this table too, with
      // its own check ids that nothing downstream can act on. Ranking off
      // one hides the crawl completely.
      .where(
        and(
          eq(audits.clientId, c.id),
          eq(audits.status, "completed"),
          eq(audits.kind, "crawler"),
        ),
      )
      .orderBy(desc(audits.completedAt))
      .limit(1);

    if (!latest) {
      add({
        id: `audit-first-${c.id}`,
        title: "Run the first audit",
        why: "Nothing else here has anything to work from until the site has been crawled once.",
        score: blocking(100, 5),
        minutes: 5,
        owner: "agent",
        href: `/audits?clientId=${c.id}`,
        because: "no completed audit for this client",
      });
      // Everything below reads from an audit. No point ranking it.
      continue;
    }

    const ageDays = latest.completedAt
      ? Math.floor((now - latest.completedAt.getTime()) / 86_400_000)
      : 999;

    if (ageDays > 30) {
      add({
        id: `audit-stale-${c.id}`,
        title: `Re-crawl — the last audit is ${ageDays} days old`,
        why: "Findings older than a month describe a site that may already have changed, and acting on them means fixing problems that are gone.",
        score: rank(60, 5),
        minutes: 5,
        owner: "agent",
        href: `/audits?clientId=${c.id}`,
        because: `last audit ${ageDays} days ago`,
      });
    }

    // ---- 2. Open findings, split by who can act on them ---------------
    const openIssues = await db
      .select({
        type: auditIssues.type,
        severity: auditIssues.severity,
        message: auditIssues.message,
      })
      .from(auditIssues)
      .where(
        and(eq(auditIssues.auditId, latest.id), eq(auditIssues.status, "new")),
      );

    const byType = new Map<
      string,
      { count: number; severity: string; message: string }
    >();
    for (const i of openIssues) {
      const prev = byType.get(i.type);
      byType.set(i.type, {
        count: (prev?.count ?? 0) + 1,
        severity: prev?.severity ?? i.severity,
        message: prev?.message ?? i.message ?? "",
      });
    }

    // The crawl reached nothing at all. Everything derived from this
    // audit is therefore derived from zero pages, and a client whose site
    // could not be fetched otherwise presents as a client with almost no
    // problems — which is the most dangerous thing this list could say.
    const unreachable = byType.get("fetch_failed");
    if (unreachable) {
      add({
        id: `unreachable-${c.id}`,
        title: "The site could not be reached at all",
        why: "The last crawl fetched no pages, so every number on this client is describing nothing. Usually a wrong URL, a site that is down, or a firewall blocking us.",
        score: blocking(100, 10),
        minutes: 10,
        owner: "you",
        href: `/clients/${c.id}`,
        because: unreachable.message || "the crawler fetched zero pages",
      });
    }

    let agentFixable = 0;
    const humanOnly: {
      type: string;
      count: number;
      severity: string;
      message: string;
    }[] = [];
    for (const [type, info] of byType) {
      if (FIXABLE[type]) agentFixable += info.count;
      else humanOnly.push({ type, ...info });
    }

    if (agentFixable > 0 && !unreachable) {
      add({
        id: `agent-queue-${c.id}`,
        title: `${agentFixable} findings the agent can fix itself`,
        why: "These need no decision from you. Turn the agent on for this client and they get done overnight, with an undo on every change.",
        score: rank(80, 10),
        minutes: 10,
        owner: "you",
        href: `/agent/c/${c.id}`,
        because: `${agentFixable} open findings match a fixable type`,
      });
    }

    // The worst thing only a person can do. One item, not fifty.
    const worst = unreachable
      ? undefined
      : humanOnly
          .filter((h) => h.severity === "critical" || h.severity === "high")
          .sort((a, b) => b.count - a.count)[0];
    if (worst) {
      add({
        id: `human-${c.id}-${worst.type}`,
        title: describeIssue(worst),
        why: "The agent has no way to do this one — it needs a decision, a server change, or a person who knows the business.",
        score: rank(worst.severity === "critical" ? 75 : 55, 45),
        minutes: 45,
        owner: "you",
        href: `/audits?clientId=${c.id}`,
        because: `${worst.count} open ${worst.severity} findings of one type`,
      });
    }

    // ---- 3. Search Console: the single biggest unlock -----------------
    if (!c.gscProperty) {
      add({
        id: `gsc-${c.id}`,
        title: "Connect Search Console",
        why: "Free, ten minutes, and it is the only source of what people actually searched to reach this site. Half the tools here stay guesses without it.",
        score: rank(90, 10),
        minutes: 10,
        owner: "you",
        href: "/settings/google",
        because: "no Search Console property connected",
      });
    }

    // ---- 4. Tracked keywords that have never been checked -------------
    const [kw] = await db
      .select({ n: sql<number>`count(*)` })
      .from(keywords)
      .where(eq(keywords.clientId, c.id));
    const [ranked] = await db
      .select({ n: sql<number>`count(*)` })
      .from(keywordRankings)
      .innerJoin(keywords, eq(keywords.id, keywordRankings.keywordId))
      .where(eq(keywords.clientId, c.id));

    if ((kw?.n ?? 0) > 0 && (ranked?.n ?? 0) === 0) {
      add({
        id: `ranks-${c.id}`,
        title: `Check where ${kw.n} tracked keyword${kw.n === 1 ? "" : "s"} actually rank${kw.n === 1 ? "s" : ""}`,
        why: "They have been tracked since onboarding and never once checked, so every report about them is currently blank.",
        score: rank(70, 5),
        minutes: 5,
        owner: "agent",
        href: `/keywords/c/${c.id}`,
        because: `${kw.n} keywords tracked, 0 rank checks recorded`,
      });
    }

    // ---- 5. Rank drops, once there is history to compare --------------
    // No position filter in SQL. A keyword that fell out of the results
    // entirely is stored with a null position, and one that fell to #40 is
    // outside any top-N window — so filtering here would drop exactly the
    // rows that represent the worst falls. Filtering happens in
    // detectDrops, on the baseline rather than on every row.
    const recentRanks = await db
      .select({
        query: keywords.query,
        position: keywordRankings.position,
      })
      .from(keywordRankings)
      .innerJoin(keywords, eq(keywords.id, keywordRankings.keywordId))
      .where(eq(keywords.clientId, c.id))
      .orderBy(desc(keywordRankings.checkedAt))
      // Generous: this window is shared across every keyword for the
      // client, so a small cap means the long tail gets no rows at all
      // and silently never reports a drop.
      .limit(2000);

    const dropped = detectDrops(recentRanks);
    if (dropped.length > 0) {
      const worstDrop = dropped[0];
      add({
        id: `drops-${c.id}`,
        title: `${dropped.length} keyword${dropped.length === 1 ? "" : "s"} lost ground in search`,
        why: "A page that was ranking and now is not is the cheapest traffic to win back — it already had whatever it needed once.",
        score: rank(85, 30),
        minutes: 30,
        owner: "you",
        href: `/keywords/c/${c.id}`,
        because: `worst: "${worstDrop.query}" ${describeMove(worstDrop)}`,
      });
    }

    // ---- 6. Overdue work ---------------------------------------------
    const [overdue] = await db
      .select({ n: sql<number>`count(*)` })
      .from(tasks)
      .where(
        and(
          eq(tasks.clientId, c.id),
          eq(tasks.status, "todo"),
          lt(tasks.dueDate, new Date()),
        ),
      );
    if ((overdue?.n ?? 0) >= 5) {
      add({
        id: `overdue-${c.id}`,
        title: `${overdue.n} tasks are past their due date`,
        why: "A plan nobody is following is worse than no plan — it hides the things that do still matter. Clear them or move the dates.",
        score: rank(40, 20),
        minutes: 20,
        owner: "you",
        href: `/tasks?client=${c.id}`,
        because: `${overdue.n} todo tasks past due`,
      });
    }

    // ---- 7. The client has not been told the plan ---------------------
    const [doc] = await db
      .select({ id: proposals.id, status: proposals.status })
      .from(proposals)
      .where(eq(proposals.clientId, c.id))
      .orderBy(desc(proposals.id))
      .limit(1);

    if (!doc) {
      add({
        id: `doc-${c.id}`,
        title: "Write the plan this client signs off",
        why: "One document with what we found, where their keywords stand and what happens in which week. It also freezes the starting numbers, so next month has something to be measured against.",
        score: rank(65, 15),
        minutes: 15,
        owner: "you",
        href: `/clients/${c.id}/onboarding`,
        because: "no approval document exists for this client",
      });
    } else if (doc.status === "draft") {
      add({
        id: `doc-send-${c.id}`,
        title: "Send the plan — it is still a draft",
        why: "It is written and the client has not seen it. Work agreed in writing is work you do not have to justify later.",
        score: rank(55, 5),
        minutes: 5,
        owner: "you",
        href: `/proposals`,
        because: "approval document exists but status is draft",
      });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * A label a person can read.
 *
 * Both vocabularies in audit_issues have names that are useless as a
 * title. The AI site audit names the CHECK rather than the fault, so a
 * failing "schema_valid" row rendered as "Fix 1 × schema valid", which
 * reads as an instruction to break something. And the crawler's names
 * are jargon: "fetch_failed" became "fetch failed", which is what a bug
 * looks like, not what advice looks like.
 *
 * Both write a real sentence into `message`, so prefer that whenever it
 * is short enough to be a label, and fall back to the type only for the
 * rows whose message is a paragraph of explanation.
 */
export function describeIssue(worst: {
  type: string;
  count: number;
  message: string;
}): string {
  // Most messages are "what is wrong. what to do about it." — the first
  // sentence is the label and the rest belongs in the why. Taking the
  // whole thing pushed good messages over the length cap and back to the
  // jargon: "Pages link to /?p=123 (default permalink). Switch to
  // %postname% for readable, keyword-friendly URLs." is 108 characters
  // and became "wp default permalinks".
  const readable = firstSentence(worst.message.trim());
  const useMessage = readable.length > 0 && readable.length <= 90;
  const what = useMessage
    ? readable.replace(/\.$/, "")
    : worst.type.replace(/_/g, " ");
  // Many messages already carry their own count — "4 pages share the same
  // meta description". Appending ours produced "4 pages share the same
  // meta description — on 14 pages", which names two different numbers
  // for the same thing and trusts neither.
  const saysItsOwnCount = /\b\d+\s+(pages?|images?|links?|headings?)\b/i.test(what);
  return worst.count > 1 && !saysItsOwnCount
    ? `${what} — on ${worst.count} pages`
    : what;
}

/**
 * A position that means "we looked and it was not there".
 *
 * The rank checker stores null when a query does not appear in the
 * results it scanned. That is not missing data — it is the single worst
 * outcome, and treating it as missing is how a keyword that fell off the
 * face of Google came to be reported as no change at all.
 *
 * 100 rather than Infinity so the arithmetic below stays finite and the
 * reported drop is a number a person can read.
 */
export const OFF_RESULTS = 100;

/** Was this position good enough that losing it costs real traffic? */
const WAS_RANKING = 20;

export type RankPoint = { query: string; position: number | null };

export type Drop = {
  query: string;
  /** Where it used to be. Always a real position. */
  from: number;
  /** Where it is now. OFF_RESULTS means it is no longer in the results. */
  to: number;
  /** Positions lost. Larger is worse. */
  lost: number;
};

/**
 * Keywords that were ranking and now rank worse.
 *
 * `rows` must be newest-first — that is the order the query above asks
 * for, and reversing it turns every recovery into a drop.
 *
 * Two rules, both learned from the version this replaces:
 *
 * - A null position is a fall to `OFF_RESULTS`, not a row to skip. The
 *   old code skipped it, so the biggest possible drop was the one it
 *   could never report.
 * - The filter is on the BASELINE, not on every row. Requiring every
 *   position to be inside the top 20 meant a fall from #4 to #40 was
 *   discarded for being too large, which is precisely backwards.
 */
export function detectDrops(
  rows: readonly RankPoint[],
  minLost = 5,
): Drop[] {
  const byQuery = new Map<string, number[]>();
  for (const r of rows) {
    const pos = r.position ?? OFF_RESULTS;
    const seen = byQuery.get(r.query);
    if (seen) seen.push(pos);
    else byQuery.set(r.query, [pos]);
  }

  const out: Drop[] = [];
  for (const [query, positions] of byQuery) {
    if (positions.length < 2) continue;
    const to = positions[0]; // newest
    const from = positions[positions.length - 1]; // oldest in the window
    // It has to have been worth having. A slide from #78 to #91 is noise.
    if (from > WAS_RANKING) continue;
    const lost = to - from;
    if (lost < minLost) continue;
    out.push({ query, from, to, lost });
  }

  // Worst first, so the caller can name one without sorting again.
  return out.sort((a, b) => b.lost - a.lost);
}

/** "#4 → off the results" or "#4 → #22". */
export function describeMove(d: Drop): string {
  return d.to >= OFF_RESULTS
    ? `fell from #${d.from} out of the results entirely`
    : `fell from #${d.from} to #${d.to}`;
}

/**
 * The first sentence, or the whole string if it is one sentence.
 *
 * Splits on a full stop followed by a space, so decimals, "e.g." and a
 * trailing period all survive. Anything that leaves nothing behind is
 * returned unchanged rather than emptied.
 */
function firstSentence(text: string): string {
  const cut = text.search(/\.\s+\S/);
  if (cut === -1) return text;
  const head = text.slice(0, cut + 1).trim();
  return head.length > 0 ? head : text;
}

/** Split for display: what runs by itself, and what needs a person. */
export function partitionByOwner(items: NextAction[]): {
  agent: NextAction[];
  you: NextAction[];
} {
  return {
    agent: items.filter((i) => i.owner === "agent"),
    you: items.filter((i) => i.owner === "you"),
  };
}
