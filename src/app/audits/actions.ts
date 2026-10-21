"use server";

import { redirect } from "next/navigation";
import { safeRevalidatePath } from "@/lib/safe-revalidate";
import { and, desc, eq, inArray, like, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, auditIssues, auditRuleHistory, clients, tasks } from "@/db/schema";
import { runAudit } from "@/lib/audit";
import { findingsToTasks } from "@/lib/audit-to-task";
import { withoutInfrastructure } from "@/lib/infrastructure-urls";
import { confidenceForIssue } from "@/lib/audit-confidence";
import { notify, type NotificationField } from "@/lib/notifier";
import { logActivity } from "@/lib/activity";
import { runAutomations } from "@/lib/automation-engine";
import {
  runSeomatorAudit,
  seomatorFindingsToTasks,
} from "@/lib/seomator-audit";
import { normalizeSeomatorReport } from "@/lib/cabinet/normalize";
import { QUICK_AUDIT_CATEGORIES } from "@/lib/seomator-meta";

const SCORE_DROP_THRESHOLD = 5;
const STALLED_AFTER_MS = 10 * 60 * 1000;

/**
 * If an audit is genuinely in flight, send the user there. If it has
 * stalled, mark it failed and return null so a new run can start.
 */
async function takeOverOrRedirectInFlight(clientId: number): Promise<void> {
  const [inFlight] = await db
    .select({ id: audits.id, startedAt: audits.startedAt })
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "running")))
    .orderBy(desc(audits.startedAt))
    .limit(1);

  if (inFlight?.startedAt) {
    const age = Date.now() - inFlight.startedAt.getTime();
    if (age < STALLED_AFTER_MS) {
      redirect(`/audits/${inFlight.id}`);
    }
    await db
      .update(audits)
      .set({
        status: "failed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(audits.id, inFlight.id));
  }
}

export async function runAuditForClient(clientId: number) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) return;

  await takeOverOrRedirectInFlight(clientId);

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
    // Write the running page count as the crawl goes, so the client page
    // and the onboarding wizard can show a real progress bar. A crawl can
    // run for minutes; with no signal it is indistinguishable from a hang.
    // Fire-and-forget: a slow write must never pace the crawler, and a
    // failed one must never fail the audit.
    let lastWrite = 0;
    result = await runAudit(client.url, {
      onProgress: (crawled) => {
        const now = Date.now();
        // 300ms, not 700: at 700 a fast 8-page crawl landed exactly one
        // write, so the bar sat at 1 and then jumped to done. Writes are
        // local SQLite and bounded by the crawl rate either way.
        if (now - lastWrite < 300) return; // cap DB writes, not the crawl
        lastWrite = now;
        void db
          .update(audits)
          .set({ pagesCrawled: crawled })
          .where(eq(audits.id, auditRow.id))
          .catch(() => {});
      },
    });
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

    safeRevalidatePath(`/clients/${clientId}`);
    return;
  }

  // Infrastructure URLs out before anything is stored or turned into work.
  //
  // The crawler skips them now, but this is the one place every finding
  // passes through on its way into the database, so a guard here catches
  // every source. Before it, a Cloudflare email-protection link became a
  // "critical" finding on every crawl and four generators made tasks of it.
  const realFindings = withoutInfrastructure(result.findings);

  if (realFindings.length > 0) {
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
      realFindings.map((f) => {
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

    const generatedTasks = findingsToTasks(realFindings);
    if (generatedTasks.length > 0) {
      // One open task per finding type, however many times the site is
      // audited. This inserted every blueprint again on every run and
      // tagged none of them, so a client audited twice had "Fix server
      // error on homepage" twice — and one audited weekly would have had
      // it fifty times. A task somebody finished may come back if the
      // problem does; an open one is never doubled.
      const open = await db
        .select({ sourceRef: tasks.sourceRef })
        .from(tasks)
        .where(
          and(
            eq(tasks.clientId, clientId),
            like(tasks.sourceRef, "audit:%"),
            inArray(tasks.status, ["todo", "in_progress"]),
          ),
        );
      const alreadyOpen = new Set(open.map((t) => t.sourceRef));
      const fresh = generatedTasks.filter(
        (t) => !alreadyOpen.has(`audit:${t.type}`),
      );

      const now = Date.now();
      const dayMs = 86_400_000;
      if (fresh.length > 0) {
        await db.insert(tasks).values(
          fresh.map((t) => ({
            clientId,
            title: t.title,
            description: t.description,
            whyItMatters: t.whyItMatters,
            priority: t.priority,
            toolPath: t.toolPath,
            status: "todo" as const,
            sourceRef: `audit:${t.type}`,
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
  }

  await db
    .update(audits)
    .set({
      status: "completed",
      score: result.score,
      issuesCount: realFindings.length,
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
      issuesCount: realFindings.length,
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

  safeRevalidatePath(`/clients/${clientId}`);
  safeRevalidatePath("/");
  redirect(`/audits/${auditRow.id}`);
}

/**
 * Technical audit powered by SEOmator (373 rules / 20 categories).
 *
 * Stored as `kind = "seomator"` so the agent planner keeps reading crawler
 * audits for auto-fixes, while humans get the mature technical report here.
 *
 * `mode: "quick"` still uses SEOmator — same tables — but only core /
 * technical / security / crawl / perf (faster smoke with CWV).
 */
export async function runSeomatorAuditForClient(
  clientId: number,
  mode: "full" | "quick" = "full",
) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) return;

  await takeOverOrRedirectInFlight(clientId);

  const [previousAudit] = await db
    .select()
    .from(audits)
    .where(
      and(
        eq(audits.clientId, clientId),
        eq(audits.status, "completed"),
        eq(audits.kind, "seomator"),
      ),
    )
    .orderBy(desc(audits.completedAt))
    .limit(1);
  const previousScore = previousAudit?.score ?? null;
  const isQuick = mode === "quick";

  const startedAt = new Date();
  const [auditRow] = await db
    .insert(audits)
    .values({
      clientId,
      status: "running",
      kind: "seomator",
      targetUrl: client.url,
      startedAt,
    })
    .returning({ id: audits.id });

  let result;
  try {
    let lastWrite = 0;
    result = await runSeomatorAudit(client.url, {
      crawl: true,
      maxPages: isQuick ? 8 : 20,
      concurrency: 3,
      measureCwv: true,
      categories: isQuick ? [...QUICK_AUDIT_CATEGORIES] : [],
      onCrawlProgress: (crawled) => {
        const now = Date.now();
        if (now - lastWrite < 300) return;
        lastWrite = now;
        void db
          .update(audits)
          .set({ pagesCrawled: crawled })
          .where(eq(audits.id, auditRow.id))
          .catch(() => {});
      },
    });
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "SEOmator audit failed unexpectedly.";
    await db
      .update(audits)
      .set({
        status: "failed",
        summary: reason.slice(0, 2000),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(audits.id, auditRow.id));

    notify({
      title: `Audit failed for ${client.name}`,
      body: reason.slice(0, 400),
      level: "error",
      fields: [{ label: "Client", value: client.name }],
    }).catch(() => {});

    await logActivity({
      kind: "audit.failed",
      message: `SEOmator audit failed for ${client.name}: ${reason.slice(0, 200)}`,
      level: "error",
      clientId,
      entityType: "audit",
      entityId: auditRow.id,
    });

    await runAutomations("audit_failed", {
      clientId,
      clientName: client.name,
      data: { url: client.url, auditId: auditRow.id, engine: "seomator" },
    });

    safeRevalidatePath(`/clients/${clientId}`);
    return;
  }

  const realFindings = withoutInfrastructure(result.findings);

  if (realFindings.length > 0) {
    const priorIssues = await db
      .select({
        type: auditIssues.type,
        url: auditIssues.url,
        status: auditIssues.status,
      })
      .from(auditIssues)
      .innerJoin(audits, eq(audits.id, auditIssues.auditId))
      .where(
        and(eq(audits.clientId, clientId), ne(auditIssues.status, "new")),
      );
    const statusByKey = new Map<string, string>();
    for (const p of priorIssues) {
      if (p.type && p.url) statusByKey.set(`${p.type}::${p.url}`, p.status);
    }

    await db.insert(auditIssues).values(
      realFindings.map((f) => {
        const inheritedStatus = statusByKey.get(`${f.type}::${f.url}`);
        return {
          auditId: auditRow.id,
          type: f.type,
          severity: f.severity,
          url: f.url,
          message: f.message,
          category: f.category,
          fixSteps: f.fixSteps,
          confidence: f.confidence,
          aiGenerated: false,
          ...(inheritedStatus
            ? {
                status: inheritedStatus as
                  | "ignored"
                  | "resolved"
                  | "false_positive",
              }
            : {}),
        };
      }),
    );

    const generatedTasks = seomatorFindingsToTasks(realFindings);
    if (generatedTasks.length > 0) {
      const open = await db
        .select({ sourceRef: tasks.sourceRef })
        .from(tasks)
        .where(
          and(
            eq(tasks.clientId, clientId),
            like(tasks.sourceRef, "seomator:%"),
            inArray(tasks.status, ["todo", "in_progress"]),
          ),
        );
      const alreadyOpen = new Set(open.map((t) => t.sourceRef));
      const fresh = generatedTasks.filter(
        (t) => !alreadyOpen.has(`seomator:${t.type}`),
      );
      const now = Date.now();
      const dayMs = 86_400_000;
      if (fresh.length > 0) {
        await db.insert(tasks).values(
          fresh.map((t) => ({
            clientId,
            title: t.title,
            description: t.description,
            whyItMatters: t.whyItMatters,
            priority: t.priority,
            toolPath: t.toolPath,
            status: "todo" as const,
            sourceRef: `seomator:${t.type}`,
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
  }

  await db
    .update(audits)
    .set({
      status: "completed",
      score: result.score,
      issuesCount: realFindings.length,
      pagesCrawled: result.pagesCrawled,
      summary: result.summary,
      categoryScores: result.categoryScores,
      rawReport: result.raw as unknown as Record<string, unknown>,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(audits.id, auditRow.id));

  const normalized = normalizeSeomatorReport(result.raw);
  if (normalized.history.length > 0) {
    await db.insert(auditRuleHistory).values(
      normalized.history.map((h) => ({
        clientId,
        auditId: auditRow.id,
        ruleId: h.ruleId,
        category: h.category,
        status: h.status,
        score: h.score,
      })),
    );
  }

  const score = result.score;
  const delta = previousScore !== null ? score - previousScore : null;
  const topIssue =
    realFindings.find((f) => f.severity === "critical")?.message ??
    realFindings.find((f) => f.severity === "high")?.message ??
    null;
  const isScoreDrop = delta !== null && delta <= -SCORE_DROP_THRESHOLD;

  const engineLabel = isQuick
    ? "SEOmator quick (core/tech/security/crawl/perf)"
    : "SEOmator (373 rules)";

  notify({
    title: `${isScoreDrop ? "Audit score dropped" : "Audit completed"} — ${client.name}`,
    body: `Technical audit (${engineLabel}) on ${client.url}: ${score}/100, ${realFindings.length} issues.`,
    level: isScoreDrop ? "warning" : "success",
    fields: [
      { label: "Score", value: `${score}/100` },
      { label: "Issues", value: `${realFindings.length} found` },
      { label: "Engine", value: engineLabel },
    ] satisfies NotificationField[],
  }).catch(() => {});

  await logActivity({
    kind: "audit.completed",
    message: `Audit #${auditRow.id} for ${client.name} — ${engineLabel} ${score}/100, ${realFindings.length} issues.`,
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
      issuesCount: realFindings.length,
      topIssue: topIssue ?? "",
      engine: "seomator",
      mode: isQuick ? "quick" : "full",
    },
  });

  safeRevalidatePath(`/clients/${clientId}`);
  safeRevalidatePath("/");
  redirect(`/audits/${auditRow.id}`);
}
