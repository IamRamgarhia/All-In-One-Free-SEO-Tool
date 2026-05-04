"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { titleTests } from "@/db/schema";
import { logActivity } from "@/lib/activity";

const createSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  pageUrl: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  titles: z.string().trim().min(1),
  durationDays: z.coerce.number().int().min(7).max(60).default(14),
});

export type CreateTitleTestResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function createTitleTest(
  _prev: CreateTitleTestResult | null,
  formData: FormData,
): Promise<CreateTitleTestResult> {
  const parsed = createSchema.safeParse({
    clientId: formData.get("clientId"),
    pageUrl: formData.get("pageUrl"),
    titles: formData.get("titles"),
    durationDays: formData.get("durationDays") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const titles = parsed.data.titles
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 5);
  if (titles.length < 2) {
    return {
      ok: false,
      error: "Need at least 2 candidate titles to run a test.",
    };
  }

  const variants = titles.map((t) => ({ title: t, appliedAt: null }));
  const [row] = await db
    .insert(titleTests)
    .values({
      clientId: parsed.data.clientId,
      pageUrl: parsed.data.pageUrl,
      variants,
      currentVariantIdx: 0,
      variantDurationDays: parsed.data.durationDays,
      status: "running",
    })
    .returning({ id: titleTests.id });

  await logActivity({
    kind: "task.created",
    message: `Started title test on ${parsed.data.pageUrl} (${variants.length} variants)`,
    clientId: parsed.data.clientId,
    entityType: "title_test",
    entityId: row.id,
  });

  revalidatePath("/title-tests");
  revalidatePath(`/title-tests/c/${parsed.data.clientId}`);
  return { ok: true, id: row.id };
}

export async function cancelTitleTest(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  await db
    .update(titleTests)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(titleTests.id, id));
  revalidatePath("/title-tests");
}

export async function deleteTitleTest(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  await db.delete(titleTests).where(eq(titleTests.id, id));
  revalidatePath("/title-tests");
}
