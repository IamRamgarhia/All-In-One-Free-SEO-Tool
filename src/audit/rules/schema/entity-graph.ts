import type { AuditContext } from "@/audit/types";

export const NEEDS_ENTITY_CRAWL = "Schema identity across pages needs a crawl of at least two pages - only available in a site audit, not a single-page check";
export const NO_SCHEMA_NODES = "No structured data on the crawled pages to compare";
export function loadSchemaNodes(context: AuditContext) {
  const site = context.site;
  if (!site?.pages || site.pageCount < 2) return null;
  const nodes = [];
  for (const info of site.pages.values()) {
    if (info.schemaNodes) nodes.push(...info.schemaNodes);
  }
  return nodes;
}
export function isAbsoluteId(value: string) {
  return /^https?:\/\//i.test(value);
}
