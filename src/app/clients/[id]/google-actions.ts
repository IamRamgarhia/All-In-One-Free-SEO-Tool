"use server";

import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";
import { requireClientAccess } from "@/lib/auth";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { listGscProperties, listGa4Properties } from "@/lib/google-oauth";

export type FetchPropertiesResult =
  | {
      ok: true;
      gsc: { siteUrl: string; permissionLevel: string }[];
      ga4: { id: string; displayName: string; accountName: string }[];
    }
  | { ok: false; error: string };

/**
 * The properties offered in a project's Google settings.
 *
 * With `clientId`, they come from the account that project actually uses:
 * its own Google account when it has one, the workspace account otherwise.
 * Listing the workspace account's properties for a project connected to
 * its own account offered properties the project could not read, which is
 * exactly the silent 403 the install-health check reports.
 */
export async function fetchGoogleProperties(
  clientId?: number,
): Promise<FetchPropertiesResult> {
  await requireSignedIn();
  const scope =
    typeof clientId === "number" && Number.isFinite(clientId) && clientId > 0
      ? clientId
      : undefined;
  if (scope !== undefined) await requireClientAccess(scope);
  try {
    const [gsc, ga4] = await Promise.all([
      listGscProperties(scope).catch(() => []),
      listGa4Properties(scope).catch(() => []),
    ]);
    return {
      ok: true,
      gsc: gsc.map((g) => ({
        siteUrl: g.siteUrl,
        permissionLevel: g.permissionLevel,
      })),
      ga4: ga4.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        accountName: p.accountName,
      })),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveGoogleProperties(opts: {
  clientId: number;
  gscProperty: string | null;
  ga4PropertyId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_google-actions");
  if (!Number.isFinite(opts.clientId) || opts.clientId < 1) {
    return { ok: false, error: tx("invalidClient") };
  }
  // Which Search Console and Analytics a project reads is an edit of that
  // project: same check as the WordPress and report-schedule actions.
  await requireClientAccess(opts.clientId, { edit: true });
  await db
    .update(clients)
    .set({
      gscProperty: opts.gscProperty,
      ga4PropertyId: opts.ga4PropertyId,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, opts.clientId));
  revalidatePath(`/clients/${opts.clientId}`);
  return { ok: true };
}
