"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { runNativeAudit } from "@/audit/engine/audit-runner";
import { saveNativeAuditRun } from "@/audit/storage/audit-repository";
import { safeRevalidatePath } from "@/lib/safe-revalidate";
import { logActivity } from "@/lib/activity";

/**
 * Launch the native Wave 1–3 audit engine (ported SEOmator expertise).
 * Quick stays HTML-only (no Playwright). Full enables optional render + CWV.
 * Does not replace the legacy crawler or the temporary npm bridge.
 */
export async function runNativeAuditForClient(
  clientId: number,
  mode: "quick" | "full" = "quick",
) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return;

  const isFull = mode === "full";
  const result = await runNativeAudit({
    site: { id: client.id, name: client.name, url: client.url },
    config: {
      mode,
      maxPages: isFull ? 25 : 1,
      // Playwright only on full — quick must not require a browser.
      render: isFull,
      measureCwv: isFull,
    },
  });

  const { runId } = await saveNativeAuditRun({ clientId, result });

  await logActivity({
    kind: "audit.completed",
    message: `Native ${mode} audit #${runId} for ${client.name} — ${result.score.globalScore}/100, ${result.issues.length} issues (${result.pagesCrawled} pages).`,
    level: "success",
    clientId,
    entityType: "native_audit",
    entityId: runId,
  });

  safeRevalidatePath(`/clients/${clientId}`);
  safeRevalidatePath(`/audits/native/${runId}`);
  redirect(`/audits/native/${runId}`);
}
