/**
 * Missions: what was agreed on a project (a client's site).
 *
 * Pure rules only, so they can be tested without a database: when a
 * mission may be created, and which one the audit points to. The reads
 * and writes are in projects.ts.
 */

import type { MissionKind } from "./mission-kinds";

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
  /** Open findings of the latest completed audit, by severity. */
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
 *   score below 80, or any critical finding           -> the whole circuit
 *   otherwise                                         -> monthly monitoring
 *
 * The thresholds follow the report's own colours (below 50 red, below 80
 * amber), so the suggestion never contradicts what the client reads.
 */
export function suggestMission(a: AuditFacts): MissionSuggestion | null {
  if (!auditDone(a) || a.score === null) return null;
  // Nothing was read: there is nothing to base a suggestion on. The site
  // may only be refusing the crawler (firewall, bot protection).
  if (a.pagesCrawled === 0) return null;
  if (a.score < 50) return { kind: "redesign", reason: "weak_site", then: "monitoring" };
  if (a.score < 80 || a.critical > 0) return { kind: "full", reason: "many_fixable" };
  return { kind: "monitoring", reason: "healthy" };
}

/** Recurring missions have no end; the others are finished at some point. */
export function isRecurring(kind: MissionKind): boolean {
  return kind === "monitoring" || kind === "full";
}
