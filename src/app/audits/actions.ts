"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, auditIssues, clients, tasks } from "@/db/schema";
import { runAudit } from "@/lib/audit";
import { findingsToTasks } from "@/lib/audit-to-task";
import { confidenceForIssue } from "@/lib/audit-confidence";
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

  // Concurrency guard: if a "running" audit already exists for this
  // client AND it was started in the last hour, skip — the user double-
  // clicked or two tabs are racing. Older "running" rows are treated
  // as orphans (the daily-agent sweeper marks them failed).
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const [inFlight] = await db
    .select({ id: audits.id, startedAt: audits.startedAt })
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "running")))
    .orderBy(desc(audits.startedAt))
    .limit(1);
  if (
    inFlight?.startedAt &&
    Date.now() - inFlight.startedAt.getTime() < ONE_HOUR_MS
  ) {
    return; // an audit is already in progress
  }

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
    // Carry forward issue status (ignored / resolved / false_positive)
    // from prior audits — same (type, url) on the same client. Without
    // this, every re-run resurrects issues the user previously dismissed.
    const priorIssues = await db
      .select({
        type: auditIssues.type,
        url: auditIssues.url,
        status: auditIssues.status,
      })
      .from(auditIssues)
      .innerJoin(audits, eq(audits.id, auditIssues.auditId))
      .where(
        and(
          eq(audits.clientId, clientId),
          ne(auditIssues.status, "new"),
        ),
      );
    const statusByKey = new Map<string, string>();
    for (const p of priorIssues) {
      if (p.type && p.url) statusByKey.set(`${p.type}::${p.url}`, p.status);
    }
    await db.insert(auditIssues).values(
      result.findings.map((f) => {
        const inheritedStatus = statusByKey.get(`${f.type}::${f.url}`);
        return {
          auditId: auditRow.id,
          type: f.type,
          severity: f.severity,
          url: f.url,
          message: f.message,
          confidence: confidenceForIssue({
            type: f.type,
            aiGenerated: false,
            severity: f.severity,
          }),
          ...(inheritedStatus
            ? { status: inheritedStatus as "ignored" | "resolved" | "false_positive" }
            : {}),
        };
      }),
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
