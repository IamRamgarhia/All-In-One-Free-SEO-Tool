"use server";

import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brandMentions, clients } from "@/db/schema";
import { monitorBrand } from "@/lib/brand-monitor";

export type RunResult =
  | { ok: true; added: number; total: number; errors: string[] }
  | { ok: false; error: string };

export async function runBrandMonitor(clientId: number): Promise<RunResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_brand-monitor_actions");
  if (!Number.isFinite(clientId) || clientId <= 0)
    return { ok: false, error: tx("invalidClient") };

  const [c] = await db
    .select({
      id: clients.id,
      name: clients.name,
      url: clients.url,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!c) return { ok: false, error: tx("clientNotFound") };

  let domain: string | null = null;
  try {
    domain = new URL(/^https?:\/\//i.test(c.url) ? c.url : `https://${c.url}`)
      .hostname.replace(/^www\./, "");
  } catch {
    domain = null;
  }

  const r = await monitorBrand({
    clientId: c.id,
    brandName: c.name,
    domain,
  });

  revalidatePath(`/brand-monitor/c/${clientId}`);
  return { ok: true, ...r };
}

export async function deleteMention(id: number): Promise<void> {
  await requireSignedIn();
  if (!Number.isFinite(id) || id <= 0) return;
  await db.delete(brandMentions).where(eq(brandMentions.id, id));
  revalidatePath("/brand-monitor");
}

/**
 * Convert a brand mention into an outreach contact. Author name maps to
 * the contact name, the mention URL becomes the website, sentiment is
 * carried into the notes so the user knows whether it's a "thank them"
 * or a "address concerns" outreach.
 */
export async function mentionToOutreach(opts: {
  mentionId: number;
  clientId: number;
  authorName: string | null;
  url: string;
}): Promise<{ ok: boolean; contactId?: number; error?: string }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_brand-monitor_actions");
  const { outreachContacts } = await import("@/db/schema");
  const { logActivity } = await import("@/lib/activity");

  const [m] = await db
    .select()
    .from(brandMentions)
    .where(eq(brandMentions.id, opts.mentionId))
    .limit(1);
  if (!m) return { ok: false, error: tx("mentionNotFound") };

  const note =
    `Found via ${m.source} brand monitor. Sentiment: ${m.sentiment > 0 ? "positive" : m.sentiment < 0 ? "negative" : "neutral"}.` +
    (m.title ? ` Original: "${m.title.slice(0, 120)}".` : "") +
    ` Source URL: ${opts.url}`;

  const [row] = await db
    .insert(outreachContacts)
    .values({
      clientId: opts.clientId,
      name: opts.authorName ?? tx("unknownAuthor"),
      website: opts.url,
      notes: note.slice(0, 500),
    })
    .returning({ id: outreachContacts.id });

  await logActivity({
    kind: "task.created",
    message: `Brand mention → outreach: ${opts.authorName ?? "anon"} (${m.source})`,
    messageFr: `Mention de marque → prospection : ${opts.authorName ?? "anonyme"} (${m.source})`,
    clientId: opts.clientId,
    entityType: "outreach",
    entityId: row.id,
  });

  revalidatePath(`/brand-monitor/c/${opts.clientId}`);
  revalidatePath(`/outreach/c/${opts.clientId}`);
  return { ok: true, contactId: row.id };
}
