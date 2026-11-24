import type { AuditContext, RuleResult } from "@/audit/types";
import type { CheerioAPI } from "cheerio";
import { notMeasured } from "@/audit/engine/define-rule";

export type ParityInputs =
  | { available: false; result: RuleResult }
  | { available: true; desktop: CheerioAPI; mobile: CheerioAPI };
export function parityInputs(ruleId: string, context: AuditContext): ParityInputs {
  if (!context.rendered$ || !context.mobile$) {
    return {
      available: false as const,
      result: notMeasured(
        ruleId,
        "Mobile parity not measured - available in a full audit, which renders desktop and mobile in a browser and compares them"
      )
    };
  }
  return { available: true as const, desktop: context.rendered$, mobile: context.mobile$ };
}
export function firstText($: CheerioAPI, selector: string) {
  return $(selector).first().text().replace(/\s+/g, " ").trim();
}
export function firstAttr($: CheerioAPI, selector: string, attr: string) {
  return ($(selector).first().attr(attr) ?? "").trim();
}
