/**
 * Missions: what was agreed on a project (a client's site).
 *
 * Pure rules only, so they can be tested without a database: when a
 * mission may be created, and which one the audit points to. The reads
 * and writes are in projects.ts.
 */

import type { MissionKind, MissionStatus } from "./mission-kinds";

/** What the rules need to know about a project's audits. */
export type AuditFacts = {
  /** A completed full audit exists: the deeper crawl, started by hand. */
  fullAuditDone: boolean;
  /**
   * A completed quick audit exists: the one every project gets when it is
   * added. It is enough to judge the site and choose a mission.
   */
  quickAuditDone: boolean;
  /**
   * Score of the reference audit, 0 to 100: the latest full audit when
   * there is one, otherwise the latest quick audit. Never the AI audit.
   */
  score: number | null;
  /**
   * Open problems of the reference audit, by severity, counted once each:
   * a rule that fails on 18 pages is one problem, not 18. Counting findings
   * made one repeated rule look like a site in trouble, or many.
   */
  critical: number;
  high: number;
  /** Pages the latest audit crawled; 0 means the site was unreachable. */
  pagesCrawled: number | null;
};

export type ProjectStage = "to_audit" | "auditing" | "audited";

/**
 * Every project starts with an audit: the quick crawl run when the project
 * is added. Once it is done the site has been judged and a mission can be
 * proposed; the full audit goes deeper later, when the work calls for it.
 * ("auditing" is kept for stored labels; no audit state returns it now.)
 */
export function projectStage(a: Pick<AuditFacts, "fullAuditDone" | "quickAuditDone">): ProjectStage {
  return auditDone(a) ? "audited" : "to_audit";
}

/** A quick or full audit is done: the site has been judged. */
export function auditDone(a: Pick<AuditFacts, "fullAuditDone" | "quickAuditDone">): boolean {
  return a.fullAuditDone || a.quickAuditDone;
}

export function canCreateMission(a: Pick<AuditFacts, "fullAuditDone" | "quickAuditDone">): boolean {
  return auditDone(a);
}

export type MissionSuggestion = {
  kind: MissionKind;
  /** Why, as a key into the `missions.reasons` messages. */
  reason: "unreachable" | "weak_site" | "many_fixable" | "healthy";
  /** A redesign is followed by monthly SEO on the new site. */
  then?: MissionKind;
};

/**
 * The mission the reference audit points to (the quick audit of a new
 * project, the full audit once there is one). A suggestion: the agency decides,
 * and "audit only" is always available when the client wants nothing more.
 *
 *   the site could not be crawled                     -> no suggestion
 *   score below 50                                    -> redesign, then monitoring
 *   score below 80, any critical problem,
 *   or HIGH_PROBLEMS_FOR_FULL high problems or more   -> the whole circuit
 *   otherwise                                         -> monthly monitoring
 *
 * The score thresholds follow the report's own colours (below 50 red, below
 * 80 amber), so the suggestion never contradicts what the client reads. The
 * score alone is not enough: it averages hundreds of rules, so a site can
 * keep 95 with several serious problems, and be called "healthy" next to
 * them.
 */
export function suggestMission(a: AuditFacts): MissionSuggestion | null {
  if (!auditDone(a) || a.score === null) return null;
  // Nothing was read: there is nothing to base a suggestion on. The site
  // may only be refusing the crawler (firewall, bot protection).
  if (a.pagesCrawled === 0) return null;
  if (a.score < 50) return { kind: "redesign", reason: "weak_site", then: "monitoring" };
  if (a.score < 80 || a.critical > 0 || a.high >= HIGH_PROBLEMS_FOR_FULL) {
    return { kind: "full", reason: "many_fixable" };
  }
  return { kind: "monitoring", reason: "healthy" };
}

/** Distinct high-severity problems from which a site needs the whole circuit. */
export const HIGH_PROBLEMS_FOR_FULL = 3;

/**
 * The suggestion, unless the project already has that mission under way
 * (proposed, active or paused): offering it again only invites a second
 * copy. A cancelled or finished one brings the suggestion back.
 */
export function pendingSuggestion(
  suggestion: MissionSuggestion | null,
  missions: ReadonlyArray<{ kind: MissionKind; status: MissionStatus }>,
): MissionSuggestion | null {
  if (!suggestion) return null;
  const underWay = missions.some(
    (m) => m.kind === suggestion.kind && m.status !== "cancelled" && m.status !== "done",
  );
  return underWay ? null : suggestion;
}

/** Recurring missions have no end; the others are finished at some point. */
export function isRecurring(kind: MissionKind): boolean {
  return kind === "monitoring" || kind === "full";
}
