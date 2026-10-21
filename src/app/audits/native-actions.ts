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
 * Launch the native Wave 1 audit engine (ported SEOmator expertise).
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

  const result = await runNativeAudit({
    site: { id: client.id, name: client.name, url: client.url },
    config: {
      mode,
      maxPages: mode === "quick" ? 1 : 25,
      render: false,
      measureCwv: false,
      // Wave 1+2 categories (core/technical/crawlability/links/redirect/url)
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
