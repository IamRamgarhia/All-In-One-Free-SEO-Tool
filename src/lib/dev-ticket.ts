/**
 * Turns open findings into work a developer can do.
 *
 * Ported from the original project (a33a8b7, "turn unfixable findings
 * into a developer ticket") and written in both languages: the ticket is
 * read by someone who did not run the audit, often outside the tool, so
 * it carries its own explanation.
 *
 * None of the content here is new. Every crawler finding type carries an
 * explainer with what it is, why it matters, the steps, a confidence
 * level, often Google's documentation and sometimes an exact snippet with
 * its undo instructions (issue-explainers.ts, .fr.ts, -tech.ts); the
 * engine's rules carry their fix (issue-explainers.server.ts). This
 * assembles them, so the ticket and the audit page cannot disagree.
 */

import {
  getStaticExplainer,
  localizeExplainer,
  type IssueExplainer,
} from "./issue-explainers";
import { issueFix, issueMessage, issueTypeName } from "./issue-display";

export type TicketFinding = {
  type: string;
  severity: string;
  url: string | null;
  message: string;
  /** Fix steps the finding carries itself (GEO and AI audits write them per page). */
  fixSteps?: string | null;
};

export type DevTicketOptions = {
  clientName: string;
  siteUrl?: string | null;
  /** Cap on URLs listed per finding type. */
  maxUrlsPerType?: number;
  /** "fr" or English (default). */
  locale?: string;
  /**
   * How to find the written guide for a type. Defaults to the hand-written
   * guides; the audit page passes the server lookup, which also knows the
   * engine's rules (`seomator:<rule>`).
   */
  explain?: (type: string) => IssueExplainer | null;
};

/** How many example URLs to list before saying "and N more". */
const DEFAULT_MAX_URLS = 15;

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type Words = {
  affects: (n: number, client: string) => string;
  severity: (s: string) => string;
  what: string;
  why: string;
  confidence: string;
  howToFix: string;
  code: string;
  undo: string;
  careful: string;
  googleDoc: string;
  noGuide: (message: string) => string;
  pages: string;
  more: (n: number) => string;
  conf: Record<IssueExplainer["confidence"], string>;
  none: (client: string) => string;
  title: (client: string) => string;
  site: (url: string) => string;
  count: (findings: number, types: number) => string;
  intro: string;
  whatToDo: string;
  codeGoesIn: (where: string) => string;
  affected: (n: number) => string;
};

const EN: Words = {
  affects: (n, client) => `**Affects ${n} page${n === 1 ? "" : "s"}** on ${client}`,
  severity: (s) => ` · severity: ${s}`,
  what: "**What it is.**",
  why: "**Why it matters.**",
  confidence: "**Confidence.**",
  howToFix: "**How to fix**",
  code: "**Code**",
  undo: "**To undo.**",
  careful: "**Careful.**",
  googleDoc: "**Google's documentation.**",
  noGuide: (m) =>
    `_No written guidance exists for this finding type yet, so this ticket is the finding only. The crawler's message: ${m}_`,
  pages: "**Pages**",
  more: (n) => `- …and ${n} more`,
  conf: {
    definitely: "Definitely fix this.",
    probably: "Probably worth fixing.",
    test: "Worth testing — the effect varies by site.",
  },
  none: (c) => `No outstanding findings for ${c}.`,
  title: (c) => `# SEO fixes for ${c}`,
  site: (u) => `Site: ${u}`,
  count: (f, t) =>
    `${f} finding${f === 1 ? "" : "s"} across ${t} issue type${t === 1 ? "" : "s"}, worst first.`,
  intro:
    "Generated from an automated crawl. Each section says what the problem is, why it matters, and the " +
    "steps — plus how confident the recommendation is, so you can triage rather than treating every " +
    "line as equally urgent.",
  whatToDo: "What to do:",
  codeGoesIn: (w) => `Code goes in: ${w}`,
  affected: (n) => `Affected page${n === 1 ? "" : "s"} (${n}):`,
};

const SEVERITY_FR: Record<string, string> = {
  critical: "critique",
  high: "élevée",
  medium: "moyenne",
  low: "faible",
};

const FR: Words = {
  affects: (n, client) => `**Concerne ${n} page${n > 1 ? "s" : ""}** de ${client}`,
  severity: (s) => ` · gravité : ${SEVERITY_FR[s] ?? s}`,
  what: "**De quoi s’agit-il ?**",
  why: "**Pourquoi c’est important.**",
  confidence: "**Niveau de confiance.**",
  howToFix: "**Comment corriger**",
  code: "**Code**",
  undo: "**Pour revenir en arrière.**",
  careful: "**Attention.**",
  googleDoc: "**Documentation de Google.**",
  noGuide: (m) =>
    `_Aucun guide n’est encore rédigé pour ce type de constat : ce ticket ne contient que le constat. Message de l’audit : ${m}_`,
  pages: "**Pages**",
  more: (n) => `- … et ${n} autre${n > 1 ? "s" : ""}`,
  conf: {
    definitely: "À corriger.",
    probably: "Correction probablement utile.",
    test: "À tester : l’effet varie selon les sites.",
  },
  none: (c) => `Aucun constat en attente pour ${c}.`,
  title: (c) => `# Corrections SEO pour ${c}`,
  site: (u) => `Site : ${u}`,
  count: (f, t) =>
    `${f} constat${f > 1 ? "s" : ""} répartis en ${t} type${t > 1 ? "s" : ""}, du plus grave au moins grave.`,
  intro:
    "Généré à partir d’une exploration automatique du site. Chaque section indique le problème, pourquoi " +
    "il compte et les étapes à suivre, avec le niveau de confiance de la recommandation : vous pouvez " +
    "ainsi trier, plutôt que de traiter chaque ligne comme également urgente. Ce sont des recommandations, " +
    "pas des obligations.",
  whatToDo: "À faire :",
  codeGoesIn: (w) => `Emplacement du code : ${w}`,
  affected: (n) => `Page${n > 1 ? "s" : ""} concernée${n > 1 ? "s" : ""} (${n}) :`,
};

function words(locale: string | undefined): Words {
  return locale === "fr" ? FR : EN;
}

function defaultExplain(locale: string) {
  return (type: string): IssueExplainer | null => {
    const e = getStaticExplainer(type);
    return e ? localizeExplainer(e, type, locale) : null;
  };
}

/** A finding type as a heading, capitalised. */
function heading(type: string, locale: string): string {
  return issueTypeName(type, locale).replace(/^./, (c) => c.toUpperCase());
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
  const locale = opts.locale ?? "en";
  const w = words(locale);
  const explainer = (opts.explain ?? defaultExplain(locale))(type);
  const max = opts.maxUrlsPerType ?? DEFAULT_MAX_URLS;
  const urls = findings.map((f) => f.url).filter((u): u is string => Boolean(u));
  const unique = [...new Set(urls)];
  const shown = unique.slice(0, max);
  const hidden = unique.length - shown.length;

  const lines: string[] = [];

  lines.push(`## ${heading(type, locale)}`);
  lines.push("");
  lines.push(
    w.affects(unique.length || findings.length, opts.clientName) +
      (findings[0]?.severity ? w.severity(findings[0].severity) : ""),
  );
  lines.push("");

  if (explainer && explainer.howToFix.length > 0) {
    lines.push(`${w.what} ${explainer.whatIsIt}`);
    lines.push("");
    lines.push(`${w.why} ${explainer.whyItMatters}`);
    lines.push("");
    // The confidence level travels with the advice, because "worth
    // testing" and "definitely fix this" deserve different amounts of a
    // developer's afternoon.
    lines.push(`${w.confidence} ${w.conf[explainer.confidence]}`);
    lines.push("");
    lines.push(w.howToFix);
    lines.push("");
    explainer.howToFix.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push("");

    if (explainer.snippet) {
      const s = explainer.snippet;
      lines.push(`${w.code} — ${s.where}`);
      lines.push("");
      lines.push("```" + s.language);
      lines.push(s.code.trim());
      lines.push("```");
      lines.push("");
      lines.push(`${w.undo} ${s.undo}`);
      if (s.caution) lines.push(`${w.careful} ${s.caution}`);
      lines.push("");
    }

    if (explainer.googleDoc) {
      lines.push(`${w.googleDoc} ${explainer.googleDoc}`);
      lines.push("");
    }
  } else if (findings.some((f) => f.fixSteps?.trim())) {
    // No written guide, but the finding carries its own steps (the same
    // ones the audit page shows under it).
    const withSteps = findings.find((f) => f.fixSteps?.trim())!;
    lines.push(`${w.what} ${issueMessage(withSteps.type, withSteps.message, locale)}`);
    lines.push("");
    lines.push(w.howToFix);
    lines.push("");
    lines.push(issueFix(withSteps.type, withSteps.fixSteps!.trim(), locale));
    lines.push("");
  } else {
    // Said plainly rather than emitting a ticket that looks complete and
    // is not.
    const sample = findings[0];
    lines.push(w.noGuide(sample ? issueMessage(sample.type, sample.message, locale) : "—"));
    lines.push("");
  }

  if (shown.length > 0) {
    lines.push(w.pages);
    lines.push("");
    for (const u of shown) lines.push(`- ${u}`);
    if (hidden > 0) lines.push(w.more(hidden));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * One ticket covering every finding handed in, grouped by type and
 * ordered worst first, then by how many pages each type affects — unless
 * the caller hands an `order` (types by measured impact, see
 * finding-priority.ts), which then decides.
 *
 * Markdown, because it pastes usefully into GitHub, Linear, Jira, Slack
 * and email, and reads as plain text where it does not render.
 */
export function buildDevTicket(
  findings: TicketFinding[],
  opts: DevTicketOptions & { order?: string[] },
): string {
  const w = words(opts.locale);
  if (findings.length === 0) return w.none(opts.clientName);

  const byType = new Map<string, TicketFinding[]>();
  for (const f of findings) {
    const list = byType.get(f.type) ?? [];
    list.push(f);
    byType.set(f.type, list);
  }

  const rank = opts.order ? new Map(opts.order.map((t, i) => [t, i])) : null;
  const groups = [...byType.entries()].sort((a, b) => {
    if (rank) {
      const ra = rank.get(a[0]) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b[0]) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
    }
    const sa = SEVERITY_ORDER[a[1][0].severity] ?? 2;
    const sb = SEVERITY_ORDER[b[1][0].severity] ?? 2;
    if (sa !== sb) return sa - sb;
    // Then by how many pages it affects — same job, more value.
    return b[1].length - a[1].length;
  });

  const header: string[] = [];
  header.push(w.title(opts.clientName));
  header.push("");
  if (opts.siteUrl) header.push(w.site(opts.siteUrl));
  header.push(w.count(findings.length, groups.length));
  header.push("");
  header.push(w.intro);
  header.push("");
  header.push("---");
  // Two blank entries: join("\n") turns a single trailing "" into one
  // newline, which left the rule touching the first "##".
  header.push("");
  header.push("");

  const body = groups
    .map(([type, list]) => buildTicketForType(type, list, opts))
    // A blank line before each rule: right after a list line, "---"
    // would read as a heading underline in some renderers.
    .join("\n---\n\n");

  return header.join("\n") + body;
}

/**
 * A short description for a task row: the first fix steps, then the
 * pages. The agent's tasks for findings it cannot fix used to carry a
 * bare "- url / message" list, which says what is wrong and nothing
 * about what to do.
 */
export function taskDescriptionFor(
  type: string,
  findings: TicketFinding[],
  locale: string = "en",
): string {
  const w = words(locale);
  const explainer = defaultExplain(locale)(type);
  const urls = [...new Set(findings.map((f) => f.url).filter(Boolean))];
  const lines: string[] = [];

  if (explainer) {
    lines.push(explainer.whatIsIt);
    lines.push("");
    lines.push(w.whatToDo);
    explainer.howToFix.slice(0, 4).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    if (explainer.snippet) {
      lines.push("");
      lines.push(w.codeGoesIn(explainer.snippet.where));
    }
    lines.push("");
  }

  lines.push(w.affected(urls.length));
  for (const u of urls.slice(0, 20)) lines.push(`- ${u}`);
  if (urls.length > 20) lines.push(w.more(urls.length - 20));

  return lines.join("\n");
}
