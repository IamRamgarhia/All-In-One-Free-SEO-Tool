import "server-only";

import { getFixSuggestion, getRuleById } from "@/audit/catalog";
import { categoryLabel } from "@/lib/seomator-meta";
import {
  getStaticExplainer,
  type IssueExplainer,
} from "@/lib/issue-explainers";
import { ruleNamesFr } from "@/lib/rule-names.fr";
import { FIX_SUGGESTIONS_FR } from "@/audit/engine/fix-suggestions.fr";
import auditUiFr from "../../messages/audit-ui.fr.json";

/** The engine's categories in French (the audit page's own labels). */
const CATEGORY_FR: Record<string, string> = (auditUiFr as { categories: Record<string, string> }).categories;

function seomatorExplainer(ruleId: string, locale: string): IssueExplainer | null {
  const rule = getRuleById(ruleId);
  if (!rule) return null;
  if (locale === "fr") {
    const name = ruleNamesFr[ruleId] ?? rule.name;
    return {
      whatIsIt: `Règle « ${name} » du moteur d’audit technique.`,
      whyItMatters: `Contrôle de la rubrique « ${CATEGORY_FR[rule.category] ?? categoryLabel(rule.category)} ».`,
      howToFix: [FIX_SUGGESTIONS_FR[ruleId] ?? getFixSuggestion(ruleId)],
      confidence: "definitely",
    };
  }
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
export function getExplainer(type: string, locale = "en"): IssueExplainer | null {
  const builtIn = getStaticExplainer(type);
  if (builtIn) return builtIn;
  if (type.startsWith("seomator:")) {
    return seomatorExplainer(type.slice("seomator:".length), locale);
  }
  return null;
}
