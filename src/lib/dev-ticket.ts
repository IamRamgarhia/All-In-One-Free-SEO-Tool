/**
 * Turns findings the agent cannot fix into work a developer can do.
 *
 * WHY: the agent can auto-fix 30 of 72 finding types. For the rest, a
 * scheduled run on this install reported "Findings the agent has no way
 * to fix automatically" — 24 of them per client — and then did nothing
 * with them. That sentence reads as "your site is fine" when it means
 * "we can't touch this", and it is the single biggest gap between what
 * the tool knows and what the user gets.
 *
 * CLAUDE.md Part 3.5 already promised the remedy: "For everything we
 * can't auto-fix: generate exact code/instructions specific to their
 * CMS, with copy-to-clipboard. Plus 'give my developer instructions'
 * button generating a clear ticket they can email/Slack." That was never
 * built — checked 19 Nov 2026, no devTicket or equivalent anywhere in
 * src.
 *
 * None of the content here is new. All 68 crawler finding types already
 * carry an explainer with `whatIsIt`, `whyItMatters`, `howToFix` steps,
 * a confidence level, a Google documentation link, and for 8 of them an
 * exact code snippet with its own undo instructions. This assembles
 * them. Writing a second set of explanations would have been another
 * hand-kept list of the same facts — the fourth standing rule — and the
 * one in issue-explainers.ts is already tested for reachability.
 */

import { getExplainer } from "./issue-explainers";

export type TicketFinding = {
  type: string;
  severity: string;
  url: string | null;
  message: string;
};

export type DevTicketOptions = {
  clientName: string;
  siteUrl?: string | null;
  /** Cap on URLs listed per finding type. */
  maxUrlsPerType?: number;
};

/** How many example URLs to list before saying "and N more". */
const DEFAULT_MAX_URLS = 15;

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Plain-language label for a finding type, from its own explainer. */
function humanType(type: string): string {
  return type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * A ticket for ONE finding type across however many pages it affects.
 *
 * Grouped by type rather than by URL on purpose: "add a meta description
 * to these 40 pages" is one job, and forty tickets for it is how a
 * developer learns to ignore the tool.
 */
export function buildTicketForType(
  type: string,
  findings: TicketFinding[],
  opts: DevTicketOptions,
): string {
  const explainer = getExplainer(type);
  const max = opts.maxUrlsPerType ?? DEFAULT_MAX_URLS;
  const urls = findings.map((f) => f.url).filter((u): u is string => Boolean(u));
  const unique = [...new Set(urls)];
  const shown = unique.slice(0, max);
  const hidden = unique.length - shown.length;

  const lines: string[] = [];

  lines.push(`## ${humanType(type)}`);
  lines.push("");
  lines.push(
    `**Affects ${unique.length || findings.length} page${(unique.length || findings.length) === 1 ? "" : "s"}** on ${opts.clientName}` +
      `${findings[0]?.severity ? ` · severity: ${findings[0].severity}` : ""}`,
  );
  lines.push("");

  if (explainer) {
    lines.push(`**What it is.** ${explainer.whatIsIt}`);
    lines.push("");
    lines.push(`**Why it matters.** ${explainer.whyItMatters}`);
    lines.push("");
    // The confidence level travels with the advice, because "worth
    // testing" and "definitely fix this" deserve different amounts of a
    // developer's afternoon.
    lines.push(`**Confidence.** ${confidenceLabel(explainer.confidence)}`);
    lines.push("");
    lines.push("**How to fix**");
    lines.push("");
    explainer.howToFix.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push("");

    if (explainer.snippet) {
      const s = explainer.snippet;
      lines.push(`**Code** — ${s.where}`);
      lines.push("");
      lines.push("```" + s.language);
      lines.push(s.code.trim());
      lines.push("```");
      lines.push("");
      lines.push(`**To undo.** ${s.undo}`);
      if (s.caution) lines.push(`**Careful.** ${s.caution}`);
      lines.push("");
    }

    if (explainer.googleDoc) {
      lines.push(`**Google's documentation.** ${explainer.googleDoc}`);
      lines.push("");
    }
  } else {
    // Should not happen — all 68 crawler types have an explainer, and
    // audit-finding-types.test.ts enforces it. Said plainly rather than
    // emitting a ticket that looks complete and is not.
    lines.push(
      `_No written guidance exists for this finding type yet, so this ` +
        `ticket is the finding only. The crawler's message: ${findings[0]?.message ?? "—"}_`,
    );
    lines.push("");
  }

  if (shown.length > 0) {
    lines.push("**Pages**");
    lines.push("");
    for (const u of shown) lines.push(`- ${u}`);
    if (hidden > 0) lines.push(`- …and ${hidden} more`);
    lines.push("");
  }

  return lines.join("\n");
}

function confidenceLabel(c: "definitely" | "probably" | "test"): string {
  if (c === "definitely") return "Definitely fix this.";
  if (c === "probably") return "Probably worth fixing.";
  return "Worth testing — the effect varies by site.";
}

/**
 * One ticket covering every finding handed in, grouped by type and
 * ordered worst first.
 *
 * Markdown, because that is what pastes usefully into GitHub, Linear,
 * Jira, Slack and email, and renders as plain text where it does not.
 */
export function buildDevTicket(
  findings: TicketFinding[],
  opts: DevTicketOptions,
): string {
  if (findings.length === 0) {
    return `No outstanding findings for ${opts.clientName}.`;
  }

  const byType = new Map<string, TicketFinding[]>();
  for (const f of findings) {
    const list = byType.get(f.type) ?? [];
    list.push(f);
    byType.set(f.type, list);
  }

  const groups = [...byType.entries()].sort((a, b) => {
    const sa = SEVERITY_ORDER[a[1][0].severity] ?? 2;
    const sb = SEVERITY_ORDER[b[1][0].severity] ?? 2;
    if (sa !== sb) return sa - sb;
    // Then by how many pages it affects — same job, more value.
    return b[1].length - a[1].length;
  });

  const header: string[] = [];
  header.push(`# SEO fixes for ${opts.clientName}`);
  header.push("");
  if (opts.siteUrl) header.push(`Site: ${opts.siteUrl}`);
  header.push(
    `${findings.length} finding${findings.length === 1 ? "" : "s"} across ` +
      `${groups.length} issue type${groups.length === 1 ? "" : "s"}, worst first.`,
  );
  header.push("");
  // Said once, at the top, because a developer receiving this needs to
  // know whether to trust it and where it came from.
  header.push(
    `Generated from an automated crawl. Each section says what the ` +
      `problem is, why it matters, and the exact steps — plus how ` +
      `confident the recommendation is, so you can triage rather than ` +
      `treating every line as equally urgent.`,
  );
  header.push("");
  header.push("---");
  // Two blank entries, not one: join("\n") turns a single trailing ""
  // into one newline, which left the header's rule touching the first
  // "##" while every later section had a blank line after its rule.
  header.push("");
  header.push("");

  // Joined with the separator BEFORE each section rather than between
  // them, so the first section gets the same blank line after the rule
  // as the rest. Without it the header's "---" ran straight into the
  // first "##", which some markdown renderers read as a setext heading
  // and others as a horizontal rule — either way the first section
  // looked different from every other one.
  const body = groups
    .map(([type, list]) => buildTicketForType(type, list, opts))
    .join("---\n\n");

  return header.join("\n") + body;
}

/**
 * A short description for the task row itself.
 *
 * The agent's unfixable-findings tasks used to carry a bare list of
 * "- url\n  message" lines, which tells a reader what is wrong and
 * nothing about what to do. This gives the task the first fix step and
 * points at the full ticket.
 */
export function taskDescriptionFor(
  type: string,
  findings: TicketFinding[],
): string {
  const explainer = getExplainer(type);
  const urls = [...new Set(findings.map((f) => f.url).filter(Boolean))];
  const lines: string[] = [];

  if (explainer) {
    lines.push(explainer.whatIsIt);
    lines.push("");
    lines.push("What to do:");
    explainer.howToFix.slice(0, 4).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    if (explainer.snippet) {
      lines.push("");
      lines.push(`Code goes in: ${explainer.snippet.where}`);
    }
    lines.push("");
  }

  lines.push(`Affected page${urls.length === 1 ? "" : "s"} (${urls.length}):`);
  for (const u of urls.slice(0, 20)) lines.push(`- ${u}`);
  if (urls.length > 20) lines.push(`- …and ${urls.length - 20} more`);

  return lines.join("\n");
}
