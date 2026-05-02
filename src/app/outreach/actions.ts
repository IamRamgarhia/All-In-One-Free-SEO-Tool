"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { outreachContacts } from "@/db/schema";
import { logActivity } from "@/lib/activity";

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
      error: parsed.error.issues[0]?.message ?? "Invalid input",
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
  return { ok: true, id: row.id };
}

export async function setContactStatus(
  contactId: number,
  status: "prospect" | "contacted" | "replied" | "won" | "lost",
) {
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
        message: `Outreach: contacted ${row.name}.`,
        clientId: row.clientId,
        entityType: "outreach",
        entityId: row.id,
      });
    } else if (status === "replied" || status === "won") {
      await logActivity({
        kind: "outreach.replied",
        message: `Outreach: ${row.name} ${status === "won" ? "won 🎉" : "replied"}.`,
        level: "success",
        clientId: row.clientId,
        entityType: "outreach",
        entityId: row.id,
      });
    }
  }

  revalidatePath("/outreach");
}

export async function deleteOutreachContact(contactId: number) {
  if (!Number.isFinite(contactId) || contactId <= 0) return;
  await db.delete(outreachContacts).where(eq(outreachContacts.id, contactId));
  revalidatePath("/outreach");
}
