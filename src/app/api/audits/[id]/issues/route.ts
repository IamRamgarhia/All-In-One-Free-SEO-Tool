import { asc, eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import { cabinetAuditIssues } from "@/db/cabinet/schema";
import { jsonError, jsonOk } from "@/lib/cabinet/api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const severity = url.searchParams.get("severity");
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");

    const db = requireCabinetDb();
    let issues = await db
      .select()
      .from(cabinetAuditIssues)
      .where(eq(cabinetAuditIssues.auditRunId, id))
      .orderBy(asc(cabinetAuditIssues.severity));

    if (severity) issues = issues.filter((i) => i.severity === severity);
    if (category) issues = issues.filter((i) => i.category === category);
    if (status) issues = issues.filter((i) => i.status === status);

    const pageUrl = url.searchParams.get("url");
    if (pageUrl) {
      issues = issues.filter((i) =>
        (i.affectedUrls ?? []).some((u) => u.includes(pageUrl)),
      );
    }

    return jsonOk({ issues });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
