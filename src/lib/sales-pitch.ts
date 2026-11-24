/**
 * The pre-sale page for a prospect: what to say to a shop owner in five
 * minutes, from the express audit of their home page.
 *
 * The full audit lists dozens of findings; nobody shows that to a baker.
 * Here: the three most serious problems, each with what it costs and what
 * the agency would do, and up to three quick wins (cheap, visible fixes
 * that build trust in the first week). Nothing is invented: every line is
 * a finding the audit made, and the "what it costs" sentence is the same
 * measured wording the 30-day plan uses (severityRationale).
 *
 * Pure.
 */

import { blueprintsFr, quickWinTitlesFr } from "./audit-to-task.fr";
import { CRAWLER_ISSUE_NAMES_FR } from "./crawler-issue-names.fr";
import { issueMessage } from "./issue-display";
import { severityRationale } from "./seo-calendar";
import { CRAWLER_FIX_FR, severityRationaleFr } from "./seo-calendar.fr";

export type PitchFinding = { type: string; severity: string; message: string };

export type PitchPoint = {
  type: string;
  severity: string;
  name: string;
  /** What the audit saw, in the reader's language when known. */
  detail: string;
  /** Why it matters, in proportion to its severity. */
  cost: string;
  /** What the agency would do. */
  action: string | null;
};

export type Pitch = { problems: PitchPoint[]; quickWins: PitchPoint[] };

const RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function point(f: PitchFinding, fr: boolean): PitchPoint {
  const name = fr ? (CRAWLER_ISSUE_NAMES_FR[f.type] ?? f.type.replace(/_/g, " ")) : f.type.replace(/_/g, " ");
  const action = fr
    ? (quickWinTitlesFr[f.type]?.("la page d’accueil") ??
      blueprintsFr[f.type]?.title("la page d’accueil") ??
      CRAWLER_FIX_FR[f.type]?.("la page d’accueil") ??
      null)
    : null;
  return {
    type: f.type,
    severity: f.severity,
    name,
    detail: issueMessage(f.type, f.message, fr ? "fr" : "en"),
    cost: fr ? severityRationaleFr(f.severity) : severityRationale(f.severity),
    action,
  };
}

export function buildPitch(findings: readonly PitchFinding[], locale: string): Pitch {
  const fr = locale === "fr";
  const seen = new Set<string>();
  const unique = [...findings]
    .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9))
    .filter((f) => (seen.has(f.type) ? false : (seen.add(f.type), true)));
  const problems = unique.filter((f) => f.severity !== "low").slice(0, 3);
  const shown = new Set(problems.map((p) => p.type));
  const quickWins = unique.filter((f) => !shown.has(f.type) && quickWinTitlesFr[f.type]).slice(0, 3);
  return { problems: problems.map((f) => point(f, fr)), quickWins: quickWins.map((f) => point(f, fr)) };
}
