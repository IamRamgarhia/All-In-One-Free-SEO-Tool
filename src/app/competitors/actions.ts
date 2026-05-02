"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { competitors } from "@/db/schema";

const competitorInput = z.object({
  clientId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .min(1)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  notes: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});

export type AddCompetitorResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function addCompetitor(
  _prev: AddCompetitorResult | null,
  formData: FormData,
): Promise<AddCompetitorResult> {
  const raw = {
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    url: formData.get("url"),
    notes: formData.get("notes") ?? undefined,
  };
  const parsed = competitorInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [row] = await db
    .insert(competitors)
    .values({
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      url: parsed.data.url,
      notes: parsed.data.notes,
    })
    .returning({ id: competitors.id });

  revalidatePath("/competitors");
  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, id: row.id };
}

export async function deleteCompetitor(competitorId: number) {
  await db.delete(competitors).where(eq(competitors.id, competitorId));
  revalidatePath("/competitors");
}
