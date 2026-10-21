"use server";

/**
 * Compatibility entry points formerly used by the incomplete Waves 1–5
 * parallel engine. They now run the real 373-rule SEOmator audit into the
 * existing `/audits` tables (quick/full modes) — no more `/audits/native`
 * sidecar or `native_audit_*` writes on the primary path.
 */

import { runSeomatorAuditForClient } from "@/app/audits/actions";

/** Audit rapide → SEOmator quick (subset categories, same tables). */
export async function runNativeAuditForClient(
  clientId: number,
  mode: "quick" | "full" = "quick",
) {
  await runSeomatorAuditForClient(
    clientId,
    mode === "quick" ? "quick" : "full",
  );
}
