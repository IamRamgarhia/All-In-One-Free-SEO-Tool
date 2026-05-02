"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contentBriefs } from "@/db/schema";
import { generateContentBrief } from "@/lib/content-brief";

export type GenerateBriefResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function generateBriefAction(
  _prev: GenerateBriefResult | null,
  formData: FormData,
): Promise<GenerateBriefResult> {
  const clientId = Number(formData.get("clientId"));
  const targetKeyword = String(formData.get("targetKeyword") ?? "").trim();

  if (!Number.isFinite(clientId) || clientId <= 0) {
    return { ok: false, error: "Pick a client" };
  }
  if (targetKeyword.length < 2) {
    return { ok: false, error: "Enter a target keyword" };
  }

  const brief = await generateContentBrief(targetKeyword);
  if (!brief) {
    return {
      ok: false,
      error:
        "Couldn't fetch SERP results. Try again or rephrase the keyword — DuckDuckGo may have rate-limited us briefly.",
    };
  }

  const [row] = await db
    .insert(contentBriefs)
    .values({
      clientId,
      targetKeyword,
      title: brief.suggestedTitle,
      status: "idea",
      targetWordCount: brief.targetWordCount,
      outline: brief.outline,
      paaQuestions: brief.paaQuestions,
      competitorTitles: brief.competitorTitles,
    })
    .returning({ id: contentBriefs.id });

  revalidatePath("/content");
  return { ok: true, id: row.id };
}

export async function setBriefStatus(
  briefId: number,
  status: "idea" | "outline" | "draft" | "review" | "published",
) {
  await db
    .update(contentBriefs)
    .set({ status, updatedAt: new Date() })
    .where(eq(contentBriefs.id, briefId));
  revalidatePath("/content");
}

export async function deleteBrief(briefId: number) {
  await db.delete(contentBriefs).where(eq(contentBriefs.id, briefId));
  revalidatePath("/content");
}
