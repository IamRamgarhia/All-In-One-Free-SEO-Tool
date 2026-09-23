"use server";

import { revalidatePath } from "next/cache";
import { rotateEdgeToken } from "@/lib/edge-token";
import { logActivity } from "@/lib/activity";

/**
 * Mint a new edge token and hand it back once.
 *
 * The value is returned to the caller and never read back by the page.
 * A secret rendered on every load is a secret in every screenshot and
 * every screen share, and this one authorises reading the rewrite set
 * for every site on the install.
 */
export async function rotateEdgeTokenAction(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  try {
    const token = await rotateEdgeToken();
    await logActivity({
      kind: "edge.token_rotated",
      // The token itself is deliberately absent. An activity log is a
      // place people paste into support threads.
      message: "Generated a new edge worker token. Any existing worker will stop applying fixes until it is updated.",
      level: "warning",
    });
    revalidatePath("/settings/edge");
    return { ok: true, token };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
