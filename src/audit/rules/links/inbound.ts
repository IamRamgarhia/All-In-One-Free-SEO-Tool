import type { AuditContext } from "@/audit/types";

export function getInboundEdges(context: AuditContext) {
  const site = context.site;
  if (!site?.inboundEdgesByUrl) return null;
  return site.inboundEdgesByUrl.get(site.normalize(context.url)) ?? [];
}
export const NEEDS_SITE_GRAPH_MESSAGE = "Inbound link analysis needs the site-wide link graph - only available in a site audit, not a single-page check";
