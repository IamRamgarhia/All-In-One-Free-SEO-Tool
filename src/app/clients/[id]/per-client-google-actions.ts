"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { logActivity } from "@/lib/activity";

export async function disconnectPerClientGoogle(
  clientId: number,
): Promise<void> {
  if (!Number.isFinite(clientId) || clientId <= 0) return;
  await db
    .update(clients)
    .set({
      googleRefreshToken: null,
      googleAccessToken: null,
      googleAccessTokenExpiresAt: null,
      googleConnectedEmail: null,
    })
    .where(eq(clients.id, clientId));

  await logActivity({
    kind: "google.disconnected",
    message: "Disconnected per-client Google account.",
    level: "info",
    clientId,
  });
  revalidatePath(`/clients/${clientId}`);
}
