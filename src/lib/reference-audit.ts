/**
 * Which audit a project's numbers rest on.
 *
 * A project can have three kinds of completed audit: the quick crawl run
 * when it is added, a full crawl started by hand, and the AI checklist.
 * Taking "whichever finished last" mixed them: a report scored the site on
 * the AI checklist, and a full crawl after a quick one showed "+457
 * problems" that were only the extra pages it read.
 *
 * The rule, everywhere the score or the findings are shown or compared:
 *   - crawls only, never the AI audit (it measures something else);
 *   - the latest full crawl when there is one, otherwise the latest quick one;
 *   - compared with the previous crawl of the same mode, never across modes.
 *
 * Pure: give it the project's completed audits, newest first.
 */

export type AuditRow = {
  kind: string | null;
  /** "quick" or "full"; rows written before the column existed are full. */
  mode: string | null;
};

/** Crawl kinds: our crawler, and audits from the engine's earlier integration. */
export const CRAWL_KINDS = ["crawler", "seomator"] as const;
const isCrawl = (a: AuditRow) => a.kind === null || (CRAWL_KINDS as readonly string[]).includes(a.kind);
const isQuick = (a: AuditRow) => a.mode === "quick";

export function pickReferenceAudits<T extends AuditRow>(
  doneNewestFirst: readonly T[],
): { latest: T | null; previous: T | null; crawls: T[] } {
  const crawls = doneNewestFirst.filter(isCrawl);
  const latest = crawls.find((a) => !isQuick(a)) ?? crawls[0] ?? null;
  if (!latest) return { latest: null, previous: null, crawls };
  const sameMode = crawls.filter((a) => isQuick(a) === isQuick(latest));
  const previous = sameMode[sameMode.indexOf(latest) + 1] ?? null;
  return { latest, previous, crawls };
}

/**
 * Findings that are problems to show: the AI audit stores its passed checks
 * as "resolved" rows next to the failed ones, and people mark findings as
 * ignored or false positives. Only "new" ones are open problems.
 */
export const OPEN_ISSUE_STATUS = "new" as const;
