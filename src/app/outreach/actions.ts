"use server";

import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";

import { revalidatePath } from "next/cache";
import { eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  outreachContacts,
  outreachMessages,
  outreachTemplates,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import {
  DEFAULT_TEMPLATES,
  extractVariables,
  sendOutreachEmail,
} from "@/lib/outreach";
import { getSetting } from "@/lib/settings-store";
import { DEFAULT_TEMPLATES_FR } from "@/lib/outreach.fr";
import { getReportLocale } from "@/lib/report-i18n";

const inputSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  website: z
    .string()
    .trim()
    .min(1)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url())
    .optional()
    .or(z.literal("").transform(() => undefined)),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type AddContactResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function addOutreachContact(
  _prev: AddContactResult | null,
  formData: FormData,
): Promise<AddContactResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_outreach_actions");
  const parsed = inputSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    website: formData.get("website") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? tx("invalidInput"),
    };
  }

  const [row] = await db
    .insert(outreachContacts)
    .values({
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      email: parsed.data.email,
      website: parsed.data.website,
      notes: parsed.data.notes,
    })
    .returning({ id: outreachContacts.id });

  revalidatePath("/outreach");
  revalidatePath(`/outreach/c/${parsed.data.clientId}`);
  return { ok: true, id: row.id };
}

export async function setContactStatus(
  contactId: number,
  status: "prospect" | "contacted" | "replied" | "won" | "lost",
) {
  await requireSignedIn();
  const tx = await actionTx("ui.app_outreach_actions");
  if (!Number.isFinite(contactId) || contactId <= 0) return;
  const updates: {
    status: typeof status;
    updatedAt: Date;
    lastContactedAt?: Date;
  } = { status, updatedAt: new Date() };
  if (status === "contacted") updates.lastContactedAt = new Date();

  const [row] = await db
    .update(outreachContacts)
    .set(updates)
    .where(eq(outreachContacts.id, contactId))
    .returning({
      id: outreachContacts.id,
      name: outreachContacts.name,
      clientId: outreachContacts.clientId,
    });

  if (row) {
    if (status === "contacted") {
      await logActivity({
        kind: "outreach.contacted",
        message: tx("outreachContacted", { name: row.name }),
        clientId: row.clientId,
        entityType: "outreach",
        entityId: row.id,
      });
    } else if (status === "replied" || status === "won") {
      await logActivity({
        kind: "outreach.replied",
        message: `Outreach: ${row.name} ${status === "won" ? "won" : "replied"}.`,
        messageFr: `Prospection : ${row.name} ${status === "won" ? "a été converti" : "a répondu"}.`,
        level: "success",
        clientId: row.clientId,
        entityType: "outreach",
        entityId: row.id,
      });
    }
  }

  revalidatePath("/outreach");
  if (row) revalidatePath(`/outreach/c/${row.clientId}`);
}

export async function deleteOutreachContact(contactId: number) {
  await requireSignedIn();
  if (!Number.isFinite(contactId) || contactId <= 0) return;
  const [row] = await db
    .select({ clientId: outreachContacts.clientId })
    .from(outreachContacts)
    .where(eq(outreachContacts.id, contactId))
    .limit(1);
  await db.delete(outreachContacts).where(eq(outreachContacts.id, contactId));
  revalidatePath("/outreach");
  if (row) revalidatePath(`/outreach/c/${row.clientId}`);
}

// =============== templates ===============

const templateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
  clientId: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type SaveTemplateResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function saveOutreachTemplate(
  _prev: SaveTemplateResult | null,
  formData: FormData,
): Promise<SaveTemplateResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_outreach_actions");
  const idRaw = formData.get("id");
  const id = idRaw ? Number(idRaw) : null;

  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    clientId: formData.get("clientId") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? tx("invalidInput"),
    };
  }

  const variables = extractVariables(parsed.data.subject, parsed.data.body);

  if (id && Number.isFinite(id) && id > 0) {
    await db
      .update(outreachTemplates)
      .set({
        name: parsed.data.name,
        subject: parsed.data.subject,
        body: parsed.data.body,
        variables,
        clientId: parsed.data.clientId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(outreachTemplates.id, id));
    revalidatePath("/outreach/templates");
    return { ok: true, id };
  }

  const [row] = await db
    .insert(outreachTemplates)
    .values({
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      variables,
      clientId: parsed.data.clientId ?? null,
    })
    .returning({ id: outreachTemplates.id });

  revalidatePath("/outreach/templates");
  return { ok: true, id: row.id };
}

export async function deleteOutreachTemplate(id: number) {
  await requireSignedIn();
  if (!Number.isFinite(id) || id <= 0) return;
  await db.delete(outreachTemplates).where(eq(outreachTemplates.id, id));
  revalidatePath("/outreach/templates");
}

/**
 * Seed the four built-in templates the first time the templates page is
 * opened. Idempotent — once the table has any row, never re-seeds.
 */
export async function seedDefaultTemplatesIfEmpty(): Promise<void> {
  await requireSignedIn();
  const existing = await db
    .select({ id: outreachTemplates.id })
    .from(outreachTemplates)
    .limit(1);
  if (existing.length > 0) return;
  // These emails go to third-party sites: seed them in the workspace
  // language (French text, English as fallback).
  const fr = (await getReportLocale()) === "fr";
  await db.insert(outreachTemplates).values(
    DEFAULT_TEMPLATES.map((en) => (fr ? (DEFAULT_TEMPLATES_FR[en.name] ?? en) : en)).map((t) => ({
      name: t.name,
      subject: t.subject,
      body: t.body,
      variables: extractVariables(t.subject, t.body),
    })),
  );
}

// =============== send ===============

export type SendResultState =
  | { ok: true; messageId: number }
  | { ok: false; error: string }
  | null;

const sendSchema = z.object({
  contactId: z.coerce.number().int().positive(),
  templateId: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
});

export async function sendOutreachAction(
  _prev: SendResultState,
  formData: FormData,
): Promise<SendResultState> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_outreach_actions");
  const parsed = sendSchema.safeParse({
    contactId: formData.get("contactId"),
    templateId: formData.get("templateId") || undefined,
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? tx("invalidInput"),
    };
  }

  const myName =
    (await getSetting<string>("outreach.sender_name")) ?? undefined;

  const [contact] = await db
    .select({ clientId: outreachContacts.clientId })
    .from(outreachContacts)
    .where(eq(outreachContacts.id, parsed.data.contactId))
    .limit(1);

  const result = await sendOutreachEmail({
    contactId: parsed.data.contactId,
    templateId: parsed.data.templateId ?? null,
    subject: parsed.data.subject,
    body: parsed.data.body,
    myName,
  });

  revalidatePath("/outreach");
  if (contact) revalidatePath(`/outreach/c/${contact.clientId}`);
  return result;
}

/**
 * Loads templates available for a given client: the client's own templates
 * plus workspace-wide ones (clientId IS NULL).
 */
export async function loadTemplatesForClient(clientId: number) {
  await requireSignedIn();
  return db
    .select()
    .from(outreachTemplates)
    .where(
      or(
        isNull(outreachTemplates.clientId),
        eq(outreachTemplates.clientId, clientId),
      ),
    )
    .orderBy(outreachTemplates.name);
}

export async function loadMessagesForContact(contactId: number) {
  await requireSignedIn();
  return db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.contactId, contactId))
    .orderBy(outreachMessages.sentAt);
}

export async function setSenderName(formData: FormData) {
  await requireSignedIn();
  const name = String(formData.get("senderName") ?? "").trim().slice(0, 120);
  const { setSetting } = await import("@/lib/settings-store");
  await setSetting("outreach.sender_name", name);
  revalidatePath("/outreach");
  revalidatePath("/outreach/templates");
}

