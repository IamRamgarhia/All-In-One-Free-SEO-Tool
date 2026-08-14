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

  // Concurrency guard.
  //
  // This used to `return` silently when an audit was already running,
  // with a one-hour window. That produced the worst first-run
  // experience in the product: a user adds their site, the audit gets
  // interrupted (a restart, a navigation, a slow site), the row is left
  // "running" — and from then on every click of "Run audit" does
  // absolutely nothing, with no message, for a full hour. Reproduced in
  // 3ms: one click, no new audit row, no error, no feedback.
  //
  // Two changes. A genuinely in-flight audit now sends the user to it,
  // so clicking Run shows them the audit that is already running
  // instead of appearing to do nothing. And a stalled one is taken over
  // rather than blocking: nothing reports progress mid-crawl, so an
  // audit still "running" after this long is dead, and making a person
  // wait an hour to retry is not a guard, it's a lockout.
  const STALLED_AFTER_MS = 10 * 60 * 1000;
  const [inFlight] = await db
    .select({ id: audits.id, startedAt: audits.startedAt })
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "running")))
    .orderBy(desc(audits.startedAt))
    .limit(1);

  if (inFlight?.startedAt) {
    const age = Date.now() - inFlight.startedAt.getTime();
    if (age < STALLED_AFTER_MS) {
      // Really running — show it, don't swallow the click.
      redirect(`/audits/${inFlight.id}`);
    }
    // Stalled. Mark it failed so the history is honest about what
    // happened, then fall through and start a fresh one.
    await db
      .update(audits)
      .set({
        status: "failed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(audits.id, inFlight.id));
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
      pagesCrawled: result.pagesCrawled,
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
