"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { backlinks } from "@/db/schema";

const backlinkInput = z.object({
  clientId: z.coerce.number().int().positive(),
  sourceUrl: z
    .string()
    .trim()
    .min(1)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  targetUrl: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  anchorText: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  domainAuthority: z.coerce
    .number()
    .min(0)
    .max(100)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .or(z.nan().transform(() => undefined)),
  notes: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});

export type AddBacklinkResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function addBacklink(
  _prev: AddBacklinkResult | null,
  formData: FormData,
): Promise<AddBacklinkResult> {
  const raw = {
    clientId: formData.get("clientId"),
    sourceUrl: formData.get("sourceUrl"),
    targetUrl: formData.get("targetUrl") ?? undefined,
    anchorText: formData.get("anchorText") ?? undefined,
    domainAuthority: formData.get("domainAuthority") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  };
  const parsed = backlinkInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const sourceDomain = new URL(parsed.data.sourceUrl).hostname.replace(
    /^www\./i,
    "",
  );

  const [row] = await db
    .insert(backlinks)
    .values({
      clientId: parsed.data.clientId,
      sourceUrl: parsed.data.sourceUrl,
      sourceDomain,
      targetUrl: parsed.data.targetUrl,
      anchorText: parsed.data.anchorText,
      domainAuthority: parsed.data.domainAuthority,
      notes: parsed.data.notes,
    })
    .returning({ id: backlinks.id });

  revalidatePath("/backlinks");
  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, id: row.id };
}

export async function setBacklinkStatus(
  backlinkId: number,
  status: "active" | "lost" | "disavow",
) {
  await db
    .update(backlinks)
    .set({ status, updatedAt: new Date() })
    .where(eq(backlinks.id, backlinkId));
  revalidatePath("/backlinks");
}

export async function deleteBacklink(backlinkId: number) {
  await db.delete(backlinks).where(eq(backlinks.id, backlinkId));
  revalidatePath("/backlinks");
}
