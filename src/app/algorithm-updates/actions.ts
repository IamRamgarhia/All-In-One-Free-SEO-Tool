"use server";

import { revalidatePath } from "next/cache";
import { refreshRankingUpdates } from "@/lib/google-updates-store";

export type RefreshUpdatesResult =
  | { ok: true; fetched: number; added: number }
  | { ok: false; error: string };

export async function refreshGoogleUpdatesAction(): Promise<RefreshUpdatesResult> {
  try {
    const r = await refreshRankingUpdates();
    revalidatePath("/algorithm-updates");
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
