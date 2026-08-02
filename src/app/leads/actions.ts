"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, graderLeads } from "@/db/schema";
import { currentUser, canEdit } from "@/lib/auth";

export type LeadStatus = "new" | "contacted" | "won" | "lost" | "spam";

async function assertCanEdit(): Promise<string | null> {
  const me = await currentUser();
  // Solo installs have no user; a client-viewer shouldn't be triaging
  // the agency's sales pipeline.
  if (me && !canEdit(me.role)) return "You have read-only access.";
  return null;
}

export async function setLeadStatus(
  id: number,
  status: LeadStatus,
): Promise<{ ok: boolean; error?: string }> {
  const denied = await assertCanEdit();
  if (denied) return { ok: false, error: denied };

  await db
    .update(graderLeads)
    .set({
      status,
      contactedAt: status === "contacted" ? new Date() : undefined,
    })
    .where(eq(graderLeads.id, id));
  revalidatePath("/leads");
  return { ok: true };
}

export async function setLeadNotes(
  id: number,
  notes: string,
): Promise<{ ok: boolean; error?: string }> {
  const denied = await assertCanEdit();
  if (denied) return { ok: false, error: denied };

  await db
    .update(graderLeads)
    .set({ notes: notes.slice(0, 4000) })
    .where(eq(graderLeads.id, id));
  revalidatePath("/leads");
  return { ok: true };
}

/**
 * Turn a lead into a client.
 *
 * The whole point of the widget. Carries the URL across so the agency
 * isn't retyping it, and marks the lead won rather than leaving it in
 * the inbox competing for attention with live prospects.
 */
export async function convertLeadToClient(
  id: number,
): Promise<{ ok: boolean; clientId?: number; error?: string }> {
  const denied = await assertCanEdit();
  if (denied) return { ok: false, error: denied };

  const [lead] = await db
    .select()
    .from(graderLeads)
    .where(eq(graderLeads.id, id))
    .limit(1);
  if (!lead) return { ok: false, error: "No such lead." };

  let name: string;
  try {
    name = new URL(lead.url).hostname.replace(/^www\./i, "");
  } catch {
    name = lead.url;
  }

  const [created] = await db
    .insert(clients)
    .values({
      name,
      url: lead.url,
      email: lead.email,
    })
    .returning({ id: clients.id });

  await db
    .update(graderLeads)
    .set({ status: "won" })
    .where(eq(graderLeads.id, id));

  revalidatePath("/leads");
  revalidatePath("/clients");
  return { ok: true, clientId: created.id };
}

export async function deleteLead(
  id: number,
): Promise<{ ok: boolean; error?: string }> {
  const denied = await assertCanEdit();
  if (denied) return { ok: false, error: denied };
  await db.delete(graderLeads).where(eq(graderLeads.id, id));
  revalidatePath("/leads");
  return { ok: true };
}
