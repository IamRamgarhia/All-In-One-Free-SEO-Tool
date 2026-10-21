/**
 * Map a SEOmator finding to an action priority (P0–P3).
 *
 * P0 = indexing / availability blockers
 * P1 = on-page fundamentals + link equity
 * P2 = CWV, schema, security, hreflang
 * P3 = social / hygiene / polish
 */

export type ActionPriority = "P0" | "P1" | "P2" | "P3";
export type ActionEffort = "S" | "M" | "L" | "XL";

const P0_RULES = [
  "noindex",
  "robots",
  "canonical-loop",
  "canonical-conflicting",
  "canonical-invalid",
  "http-error",
  "soft-404",
  "security-https",
  "technical-robots-txt",
];

const P1_RULES = [
  "core-title",
  "core-h1",
  "core-description",
  "duplicate",
  "thin-content",
  "links-broken",
  "links-orphan",
  "content-word-count",
];

const P2_CATEGORIES = new Set([
  "perf",
  "schema",
  "security",
  "i18n",
  "crawl",
  "js",
  "a11y",
]);

const P3_CATEGORIES = new Set(["social", "url", "htmlval", "legal", "geo"]);

export function priorityForIssue(input: {
  ruleId: string;
  category: string | null | undefined;
  severity: string | null | undefined;
  status: string | null | undefined;
}): ActionPriority {
  const rule = input.ruleId.toLowerCase();
  const cat = (input.category ?? "").toLowerCase();

  if (P0_RULES.some((p) => rule.includes(p))) return "P0";
  if (input.severity === "critical" && (cat === "core" || cat === "technical" || cat === "crawl")) {
    return "P0";
  }
  if (P1_RULES.some((p) => rule.includes(p))) return "P1";
  if (input.severity === "critical" || input.severity === "high") {
    if (P2_CATEGORIES.has(cat)) return "P2";
    return "P1";
  }
  if (P2_CATEGORIES.has(cat)) return "P2";
  if (P3_CATEGORIES.has(cat)) return "P3";
  return "P2";
}

export function effortForPriority(priority: ActionPriority): ActionEffort {
  switch (priority) {
    case "P0":
      return "M";
    case "P1":
      return "M";
    case "P2":
      return "L";
    case "P3":
      return "S";
    default: {
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}
