import { eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import {
  cabinetActions,
  cabinetAuditIssues,
} from "@/db/cabinet/schema";
import { jsonError, jsonOk, readJson } from "@/lib/cabinet/api";
import { effortForPriority, priorityForIssue } from "@/lib/cabinet/priority";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      siteId?: string;
      issueId?: string;
      title?: string;
      priority?: string;
      effort?: string;
      owner?: string;
      dueDate?: string;
      notes?: string;
    }>(request);

    if (!body.siteId) return jsonError("siteId is required");

    const db = requireCabinetDb();
    let title = body.title?.trim();
    let priority = body.priority;
    let effort = body.effort;
    let issueId = body.issueId ?? null;

    if (issueId) {
      const [issue] = await db
        .select()
        .from(cabinetAuditIssues)
        .where(eq(cabinetAuditIssues.id, issueId))
        .limit(1);
      if (!issue) return jsonError("Issue not found", 404);
      if (!title) title = issue.title ?? issue.ruleId;
      if (!priority) {
        priority = priorityForIssue({
          ruleId: issue.ruleId,
          category: issue.category,
          severity: issue.severity,
          status: issue.status,
        });
      }
    }

    if (!title) return jsonError("title is required");
    const prio = (priority ?? "P2") as "P0" | "P1" | "P2" | "P3";
    if (!effort) effort = effortForPriority(prio);

    const [action] = await db
      .insert(cabinetActions)
      .values({
        siteId: body.siteId,
        issueId,
        title,
        priority: prio,
        effort,
        owner: body.owner ?? null,
        dueDate: body.dueDate ?? null,
        notes: body.notes ?? null,
        status: "todo",
      })
      .returning();

    return jsonOk({ action }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
