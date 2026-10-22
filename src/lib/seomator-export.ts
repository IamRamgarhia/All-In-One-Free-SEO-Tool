import type { AuditResult as SeomatorAuditResult } from "@seomator/seo-audit";
import {
  categoryLabel,
  extractScoreCap,
  ruleDisplayName,
  ruleFix,
  verdictForScore,
} from "@/lib/seomator-meta";

export type SeomatorExportInput = {
  url: string;
  score: number | null;
  pagesCrawled: number | null;
  summary: string | null;
  rawReport: Record<string, unknown> | SeomatorAuditResult | null;
};

function asSeomatorResult(
  raw: SeomatorExportInput["rawReport"],
): SeomatorAuditResult | null {
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray((raw as SeomatorAuditResult).categoryResults)) return null;
  return raw as SeomatorAuditResult;
}

/**
 * Markdown report (SEOmator-style) for download / sharing.
 */
export function formatSeomatorAuditMarkdown(input: SeomatorExportInput): string {
  const raw = asSeomatorResult(input.rawReport);
  const lines: string[] = [
    "# SEOmator technical audit",
    "",
    `- **URL:** ${input.url}`,
    `- **Score:** ${input.score ?? "—"}/100`,
    `- **Pages crawled:** ${input.pagesCrawled ?? "—"}`,
  ];

  if (input.score != null) {
    const v = verdictForScore(input.score);
    lines.push(`- **Verdict:** ${v.grade} — ${v.label}`);
  }

  const cap = raw ? extractScoreCap(raw) : null;
  if (cap?.reasons.length) {
    lines.push(`- **Score caps:** ${cap.reasons.join("; ")}`);
  }

  lines.push("", "## Category scores", "");
  if (raw) {
    lines.push("| Category | Score | Pass | Warn | Fail |");
    lines.push("|---|---:|---:|---:|---:|");
    for (const c of raw.categoryResults) {
      lines.push(
        `| ${categoryLabel(c.categoryId)} | ${c.score} | ${c.passCount} | ${c.warnCount} | ${c.failCount} |`,
      );
    }
  } else if (input.summary) {
    lines.push(input.summary);
  }

  lines.push("", "## Issues (fail / warn)", "");
  if (raw) {
    for (const cat of raw.categoryResults) {
      const bad = cat.results.filter(
        (r) => r.status === "fail" || r.status === "warn",
      );
      if (bad.length === 0) continue;
      lines.push(`### ${categoryLabel(cat.categoryId)}`, "");
      for (const rule of bad) {
        const pageUrl =
          typeof rule.details?.pageUrl === "string"
            ? rule.details.pageUrl
            : input.url;
        lines.push(
          `- **${ruleDisplayName(rule.ruleId)}** (${rule.status}) — ${rule.message}`,
        );
        lines.push(`  - URL: ${pageUrl}`);
        lines.push(`  - Fix: ${ruleFix(rule.ruleId, rule.details?.fix as string | undefined)}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Compact LLM-oriented report (headings + bullet fixes).
 */
export function formatSeomatorAuditLlm(input: SeomatorExportInput): string {
  const raw = asSeomatorResult(input.rawReport);
  const lines: string[] = [
    "SEO_AUDIT_LLM",
    `url: ${input.url}`,
    `score: ${input.score ?? "unknown"}`,
    `pages_crawled: ${input.pagesCrawled ?? "unknown"}`,
  ];

  if (!raw) {
    if (input.summary) lines.push("", input.summary);
    return lines.join("\n");
  }

  lines.push("", "categories:");
  for (const c of raw.categoryResults) {
    lines.push(
      `- ${c.categoryId}: score=${c.score} pass=${c.passCount} warn=${c.warnCount} fail=${c.failCount}`,
    );
  }

  lines.push("", "action_items:");
  for (const cat of raw.categoryResults) {
    for (const rule of cat.results) {
      if (rule.status !== "fail" && rule.status !== "warn") continue;
      const pageUrl =
        typeof rule.details?.pageUrl === "string"
          ? rule.details.pageUrl
          : input.url;
      lines.push(
        `- rule=${rule.ruleId} status=${rule.status} severity_category=${cat.categoryId} page=${pageUrl}`,
      );
      lines.push(`  message: ${rule.message}`);
      lines.push(
        `  fix: ${ruleFix(rule.ruleId, rule.details?.fix as string | undefined)}`,
      );
    }
  }

  return lines.join("\n").trim() + "\n";
}
