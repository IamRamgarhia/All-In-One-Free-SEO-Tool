import { registerRule } from "@/audit/engine/rule-registry";
import { httpOkRule, soft404Rule } from "./http-status";
import { httpsRule, mixedContentRule } from "./https";
import {
  robotsTxtExistsRule,
  robotsTxtValidRule,
  sitemapExistsRule,
  sitemapValidRule,
} from "./robots-sitemap";
import {
  emptyHtmlRule,
  contentTypeRule,
  redirectChainRule,
  wwwConsistencyRule,
  trailingSlashRule,
} from "./misc";

const TECHNICAL_RULES = [
  httpOkRule,
  soft404Rule,
  httpsRule,
  mixedContentRule,
  robotsTxtExistsRule,
  robotsTxtValidRule,
  sitemapExistsRule,
  sitemapValidRule,
  emptyHtmlRule,
  contentTypeRule,
  redirectChainRule,
  wwwConsistencyRule,
  trailingSlashRule,
];

export function registerTechnicalRules(): void {
  for (const rule of TECHNICAL_RULES) registerRule(rule);
}

export { TECHNICAL_RULES };
