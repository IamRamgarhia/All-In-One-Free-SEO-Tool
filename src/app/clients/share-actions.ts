"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db/client";
import { clients } from "@/db/schema";

function generateToken(): string {
  // 24 random bytes → 32 chars urlsafe base64. Plenty of entropy for an
  // unlisted share link.
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function generateShareToken(clientId: number): Promise<void> {
  if (!Number.isFinite(clientId) || clientId <= 0) return;
  let attempts = 0;
  while (attempts < 5) {
    const token = generateToken();
    try {
      await db
        .update(clients)
        .set({ shareToken: token, updatedAt: new Date() })
        .where(eq(clients.id, clientId));
      revalidatePath(`/clients/${clientId}`);
      return;
    } catch {
      attempts++;
    }
  }
}

export async function revokeShareToken(clientId: number): Promise<void> {
  if (!Number.isFinite(clientId) || clientId <= 0) return;
  await db
    .update(clients)
    .set({ shareToken: null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  revalidatePath(`/clients/${clientId}`);
}
