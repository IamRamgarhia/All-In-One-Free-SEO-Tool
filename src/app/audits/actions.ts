"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, auditIssues, clients, tasks } from "@/db/schema";
import { runAudit } from "@/lib/audit";
import { findingsToTasks } from "@/lib/audit-to-task";
import { notify, type NotificationField } from "@/lib/notifier";
import { logActivity } from "@/lib/activity";
import { runAutomations } from "@/lib/automation-engine";

const SCORE_DROP_THRESHOLD = 5;

export async function runAuditForClient(clientId: number) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) return;

  // Look up previous completed audit BEFORE running the new one,
  // so we can compute score delta on completion.
  const [previousAudit] = await db
    .select()
    .from(audits)
    .where(
      and(eq(audits.clientId, clientId), eq(audits.status, "completed")),
    )
    .orderBy(desc(audits.completedAt))
    .limit(1);
  const previousScore = previousAudit?.score ?? null;

  const startedAt = new Date();
  const [auditRow] = await db
    .insert(audits)
    .values({
      clientId,
      status: "running",
      startedAt,
    })
    .returning({ id: audits.id });

  let result;
  try {
    result = await runAudit(client.url);
  } catch {
    await db
      .update(audits)
      .set({
        status: "failed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(audits.id, auditRow.id));

    // Fire-and-forget — don't block the UI on a webhook failure
    notify({
      title: `Audit failed for ${client.name}`,
      body: `Couldn't reach ${client.url}. Try running the audit again, or check the site is online.`,
      level: "error",
      fields: [{ label: "Client", value: client.name }],
    }).catch(() => {});

    await logActivity({
      kind: "audit.failed",
      message: `Audit failed for ${client.name} — site unreachable.`,
      level: "error",
      clientId,
      entityType: "audit",
      entityId: auditRow.id,
    });

    await runAutomations("audit_failed", {
      clientId,
      clientName: client.name,
      data: { url: client.url, auditId: auditRow.id },
    });

    revalidatePath(`/clients/${clientId}`);
    return;
  }

  if (result.findings.length > 0) {
    await db.insert(auditIssues).values(
      result.findings.map((f) => ({
        auditId: auditRow.id,
        type: f.type,
        severity: f.severity,
        url: f.url,
        message: f.message,
      })),
    );

    const generatedTasks = findingsToTasks(result.findings);
    if (generatedTasks.length > 0) {
      const now = Date.now();
      const dayMs = 86_400_000;
      await db.insert(tasks).values(
        generatedTasks.map((t) => ({
          clientId,
          title: t.title,
          description: t.description,
          whyItMatters: t.whyItMatters,
          priority: t.priority,
          status: "todo" as const,
          dueDate:
            t.priority === "high"
              ? new Date(now + 7 * dayMs)
              : t.priority === "medium"
                ? new Date(now + 30 * dayMs)
                : null,
        })),
      );
    }
  }

  await db
    .update(audits)
    .set({
      status: "completed",
      score: result.score,
      issuesCount: result.findings.length,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(audits.id, auditRow.id));

  // Build webhook notification (best effort)
  const score = result.score;
  const delta = previousScore !== null ? score - previousScore : null;
  const topIssue =
    result.findings.find((f) => f.severity === "critical")?.message ??
    result.findings.find((f) => f.severity === "high")?.message ??
    null;

  const isScoreDrop = delta !== null && delta <= -SCORE_DROP_THRESHOLD;
  const level: "success" | "warning" = isScoreDrop ? "warning" : "success";
  const titlePrefix = isScoreDrop
    ? "Score dropped"
    : delta !== null && delta > 0
      ? "Score improved"
      : "Audit completed";

  const fields: NotificationField[] = [
    { label: "Score", value: `${score}/100` },
    {
      label: "Issues",
      value: `${result.findings.length} found`,
    },
  ];
  if (delta !== null) {
    const sign = delta > 0 ? "+" : "";
    fields.push({
      label: "Vs last audit",
      value: `${sign}${delta}`,
    });
  }
  if (topIssue) {
    fields.push({ label: "Top issue", value: topIssue.slice(0, 200) });
  }

  notify({
    title: `${titlePrefix} — ${client.name}`,
    body: `Audit run on ${client.url}.`,
    level,
    fields,
  }).catch(() => {});

  await logActivity({
    kind: "audit.completed",
    message: `Audit #${auditRow.id} for ${client.name} — score ${score}/100, ${result.findings.length} issues.`,
    level: isScoreDrop ? "warning" : "success",
    clientId,
    entityType: "audit",
    entityId: auditRow.id,
  });

  await runAutomations("audit_completed", {
    clientId,
    clientName: client.name,
    data: {
      auditId: auditRow.id,
      score,
      previousScore,
      issuesCount: result.findings.length,
      topIssue: topIssue ?? "",
    },
  });

  if (isScoreDrop) {
    await runAutomations("score_drop", {
      clientId,
      clientName: client.name,
      data: {
        auditId: auditRow.id,
        score,
        previousScore,
        delta,
        topIssue: topIssue ?? "",
      },
    });
  }

  // Refresh quick-wins from the new audit so the "Fix today" list stays
  // current. Best-effort — never block the redirect.
  try {
    const { applyQuickWins } = await import("@/lib/quick-wins");
    await applyQuickWins({ clientId });
  } catch {
    // ignore
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
  redirect(`/audits/${auditRow.id}`);
}
