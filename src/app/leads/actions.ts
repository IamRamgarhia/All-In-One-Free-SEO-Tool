"use server";

import { actionTx } from "@/lib/action-tx";
import type { Tx } from "@/lib/tx";
import { requireSignedIn } from "@/lib/action-guard";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, graderLeads } from "@/db/schema";
import { currentUser, userMayEdit } from "@/lib/auth";

export type LeadStatus = "new" | "contacted" | "won" | "lost" | "spam";

async function assertCanEdit(tx: Tx): Promise<string | null> {
  const me = await currentUser();
  // Solo installs have no user; a client-viewer shouldn't be triaging
  // the agency's sales pipeline.
  if (!userMayEdit(me)) return tx("youHaveReadOnlyAccess");
  return null;
}

export async function setLeadStatus(
  id: number,
  status: LeadStatus,
): Promise<{ ok: boolean; error?: string }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_leads_actions");
  const denied = await assertCanEdit(tx);
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
  await requireSignedIn();
  const tx = await actionTx("ui.app_leads_actions");
  const denied = await assertCanEdit(tx);
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
  await requireSignedIn();
  const tx = await actionTx("ui.app_leads_actions");
  const denied = await assertCanEdit(tx);
  if (denied) return { ok: false, error: denied };

  const [lead] = await db
    .select()
    .from(graderLeads)
    .where(eq(graderLeads.id, id))
    .limit(1);
  if (!lead) return { ok: false, error: tx("noSuchLead") };

  // @ai-optional: adding the client may ask a model for a description;
  // the leads page, its prospecting and its audits work without one.
  // The same path as the "Add a client" button: site details read,
  // targeting inferred, templates seeded, the creation audit started.
  // This used to insert a bare row named after the domain, with no audit,
  // so the onboarding opened on nothing.
  const { quickAddClient } = await import("@/app/clients/actions");
  const added = await quickAddClient(lead.url, { name: lead.name, email: lead.email });
  let clientId: number;
  if (added.ok) {
    clientId = added.id;
  } else if (added.existingClientId) {
    clientId = added.existingClientId;
  } else {
    // The site did not answer: still a client, named as the lead was.
    let name = lead.name ?? lead.url;
    if (!lead.name) {
      try {
        name = new URL(lead.url).hostname.replace(/^www\./i, "");
      } catch {
        // keep the URL as the name
      }
    }
    const [created] = await db
      .insert(clients)
      .values({ name, url: lead.url, email: lead.email })
      .returning({ id: clients.id });
    clientId = created.id;
  }

  await db
    .update(graderLeads)
    .set({ status: "won" })
    .where(eq(graderLeads.id, id));

  revalidatePath("/leads");
  revalidatePath("/clients");
  return { ok: true, clientId };
}

export async function deleteLead(
  id: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_leads_actions");
  const denied = await assertCanEdit(tx);
  if (denied) return { ok: false, error: denied };
  await db.delete(graderLeads).where(eq(graderLeads.id, id));
  revalidatePath("/leads");
  return { ok: true };
}
