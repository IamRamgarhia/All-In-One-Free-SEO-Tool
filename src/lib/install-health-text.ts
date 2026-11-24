/**
 * Turns a stored install-health issue into the sentences a surface shows.
 *
 * One function for both surfaces (the dashboard banner and Settings →
 * System health), so they cannot word the same issue two ways. Pure: the
 * caller passes the translator for `installHealth`, a tool-name lookup
 * and a date formatter, all in the viewer's language.
 */

import type { HealthIssue } from "./install-health";

export type LooseT = (key: string, values?: Record<string, string | number>) => string;

export type IssueText = {
  title: string;
  evidence: string;
  fixLabel: string;
  /** The outside world's own words, labelled, or null. */
  detail: string | null;
};

export function issueText(
  issue: HealthIssue,
  t: LooseT,
  opts: {
    toolName: (toolId: string) => string;
    formatDate: (iso: string) => string;
    listFormat: (items: string[]) => string;
  },
): IssueText {
  const base = `issues.${issue.kind}`;
  const values: Record<string, string | number> = { ...issue.params };

  if (issue.kind === "audit_failed") {
    const iso = String(issue.params.date ?? "");
    values.date = iso ? opts.formatDate(iso) : "—";
  }
  if (issue.tools) {
    values.tools = opts.listFormat(issue.tools.map((id) => opts.toolName(id)));
  }
  if (issue.kind === "sweep_unreachable") {
    values.cause = t(`network.${issue.networkKind ?? "no_response"}`);
  }

  return {
    title: t(`${base}.title`, values),
    evidence: t(`${base}.evidence`, values),
    fixLabel: t(`${base}.fix`),
    detail: issue.detail ? t("detail", { detail: issue.detail }) : null,
  };
}
