import "server-only";

import { getRuleById } from "@seomator/seo-audit";
import { getFixSuggestion } from "@/lib/seomator-fix-suggestions";
import { categoryLabel } from "@/lib/seomator-meta";
import {
  getStaticExplainer,
  type IssueExplainer,
} from "@/lib/issue-explainers";

function seomatorExplainer(ruleId: string): IssueExplainer | null {
  const rule = getRuleById(ruleId);
  if (!rule) return null;
  return {
    whatIsIt: rule.description || rule.name,
    whyItMatters: `SEOmator technical rule in ${categoryLabel(rule.category)} — part of the 373-rule deep audit.`,
    howToFix: [getFixSuggestion(ruleId)],
    confidence: "definitely",
  };
}

/**
 * Look up explainer with graceful fallback for unknown types.
 * SEOmator findings (`seomator:rule-id`) use the rule registry + fix map
 * instead of maintaining a second 373-entry hand-written table.
 */
export function getExplainer(type: string): IssueExplainer | null {
  const builtIn = getStaticExplainer(type);
  if (builtIn) return builtIn;
  if (type.startsWith("seomator:")) {
    return seomatorExplainer(type.slice("seomator:".length));
  }
  return null;
}
