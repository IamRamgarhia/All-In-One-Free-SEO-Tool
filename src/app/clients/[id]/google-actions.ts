"use server";

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

export async function fetchGoogleProperties(): Promise<FetchPropertiesResult> {
  try {
    const [gsc, ga4] = await Promise.all([
      listGscProperties().catch(() => []),
      listGa4Properties().catch(() => []),
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
  if (!Number.isFinite(opts.clientId) || opts.clientId < 1) {
    return { ok: false, error: "Invalid client" };
  }
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
