"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { keywords } from "@/db/schema";
import { researchKeywords } from "@/lib/keyword-research";

export type ResearchActionResult =
  | {
      ok: true;
      seed: string;
      country: string;
      source: "google" | "youtube" | "reddit" | "wikipedia";
      suggestions: Array<{
        query: string;
        intent: "informational" | "commercial" | "transactional" | "navigational";
        wordCount: number;
        isLongTail: boolean;
      }>;
    }
  | { ok: false; error: string };

export async function researchAction(
  _prev: ResearchActionResult | null,
  formData: FormData,
): Promise<ResearchActionResult> {
  const seed = String(formData.get("seed") ?? "").trim();
  const country = String(formData.get("country") ?? "US")
    .trim()
    .toUpperCase();
  const expand = formData.get("expand") === "on";
  const modeRaw = String(formData.get("mode") ?? "none");
  const mode: "none" | "alphabet" | "lsi" =
    modeRaw === "alphabet" || modeRaw === "lsi" ? modeRaw : "none";
  const sourceRaw = String(formData.get("source") ?? "google");
  const source: "google" | "youtube" | "reddit" | "wikipedia" =
    sourceRaw === "youtube" || sourceRaw === "reddit" || sourceRaw === "wikipedia"
      ? sourceRaw
      : "google";

  if (seed.length < 2) {
    return { ok: false, error: "Enter at least 2 characters." };
  }
  if (seed.length > 100) {
    return { ok: false, error: "Seed is too long." };
  }

  try {
    const r = await researchKeywords(seed, { country, expand, mode, source });
    return {
      ok: true,
      seed: r.seed,
      country: r.country,
      source: r.source,
      suggestions: r.suggestions,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function trackKeyword(formData: FormData) {
  const clientId = Number(formData.get("clientId"));
  const query = String(formData.get("query") ?? "").trim();
  const country = String(formData.get("country") ?? "US")
    .trim()
    .toUpperCase();
  const device = (String(formData.get("device") ?? "desktop") as
    | "desktop"
    | "mobile") || "desktop";

  if (!Number.isFinite(clientId) || clientId <= 0) return;
  if (!query) return;

  // Skip if same client+query already tracked
  const existing = await db
    .select({ id: keywords.id })
    .from(keywords)
    .where(and(eq(keywords.clientId, clientId), eq(keywords.query, query)))
    .limit(1);
  if (existing.length > 0) {
    revalidatePath("/keywords");
    return;
  }

  await db.insert(keywords).values({
    clientId,
    query,
    country,
    device,
  });

  revalidatePath("/keywords");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
}

export async function untrackKeyword(keywordId: number) {
  if (!Number.isFinite(keywordId) || keywordId <= 0) return;
  await db.delete(keywords).where(eq(keywords.id, keywordId));
  revalidatePath("/keywords");
  revalidatePath("/");
}
