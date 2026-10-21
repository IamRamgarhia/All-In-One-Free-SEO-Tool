import { registerRule } from "@/audit/engine/rule-registry";
import { titlePresentRule } from "./title-present";
import { titleLengthRule } from "./title-length";
import { titleUniqueRule } from "./title-unique";
import { descriptionPresentRule } from "./description-present";
import { descriptionLengthRule } from "./description-length";
import { h1PresentRule } from "./h1-present";
import { h1SingleRule } from "./h1-single";
import { headingOrderRule } from "./heading-order";
import { canonicalPresentRule } from "./canonical-present";
import { canonicalValidRule } from "./canonical-valid";
import { canonicalMultipleRule } from "./canonical-multiple";
import { canonicalOutsideHeadRule } from "./canonical-outside-head";
import { canonicalHttpMismatchRule } from "./canonical-http-mismatch";
import { canonicalToHomepageRule } from "./canonical-to-homepage";
import { canonicalLoopRule } from "./canonical-loop";
import { canonicalConflictingRule } from "./canonical-conflicting";
import { robotsMetaRule } from "./robots-meta";
import { robotsDirectiveMismatchRule } from "./robots-directive-mismatch";
import { viewportPresentRule } from "./viewport-present";
import { faviconPresentRule } from "./favicon-present";
import { openGraphBasicRule } from "./open-graph-basic";
import { nosnippetRule } from "./nosnippet";

const CORE_RULES = [
  titlePresentRule,
  titleLengthRule,
  titleUniqueRule,
  descriptionPresentRule,
  descriptionLengthRule,
  h1PresentRule,
  h1SingleRule,
  headingOrderRule,
  canonicalPresentRule,
  canonicalValidRule,
  canonicalMultipleRule,
  canonicalOutsideHeadRule,
  canonicalHttpMismatchRule,
  canonicalToHomepageRule,
  canonicalLoopRule,
  canonicalConflictingRule,
  robotsMetaRule,
  robotsDirectiveMismatchRule,
  viewportPresentRule,
  faviconPresentRule,
  openGraphBasicRule,
  nosnippetRule,
];

export function registerCoreRules(): void {
  for (const rule of CORE_RULES) registerRule(rule);
}

export { CORE_RULES };
