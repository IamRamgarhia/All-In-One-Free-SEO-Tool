"use server";

import {
  generateCoverImagePrompts,
  suggestCategoriesAndTags,
  type CategoryResult,
  type ImagePromptResult,
} from "@/lib/content-helpers";
import { saveToolRun } from "@/lib/tool-runs";

export async function getCoverImagePrompts(formData: FormData): Promise<ImagePromptResult> {
  const title = String(formData.get("title") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  const niche = String(formData.get("niche") ?? "").trim() || null;
  if (!title) return { ok: false, error: "Post title required." };
  const r = await generateCoverImagePrompts({ title, brief, niche });
  if (r.ok) {
    await saveToolRun({
      toolId: "content-helpers",
      label: `Cover prompts · ${title.slice(0, 60)}`,
      input: { title, niche },
      result: r,
    }).catch(() => undefined);
  }
  return r;
}

export async function getCategorySuggestions(
  formData: FormData,
): Promise<CategoryResult> {
  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const existingRaw = String(formData.get("existingCategories") ?? "").trim();
  const existingCategories = existingRaw
    ? existingRaw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (!title) return { ok: false, error: "Title required." };
  const r = await suggestCategoriesAndTags({ title, excerpt, existingCategories });
  if (r.ok) {
    await saveToolRun({
      toolId: "content-helpers",
      label: `Categories · ${title.slice(0, 60)}`,
      input: { title },
      result: r,
    }).catch(() => undefined);
  }
  return r;
}
