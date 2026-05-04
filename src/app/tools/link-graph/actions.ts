"use server";

import { z } from "zod";
import {
  analyseInternalLinks,
  type LinkAnalysis,
} from "@/lib/internal-link-graph";

const inputSchema = z.object({
  startUrl: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  maxPages: z.coerce.number().int().min(20).max(500).default(150),
});

export type LinkGraphState =
  | { ok: true; analysis: LinkAnalysis }
  | { ok: false; error: string };

export async function runLinkGraph(
  _prev: LinkGraphState | null,
  formData: FormData,
): Promise<LinkGraphState> {
  const parsed = inputSchema.safeParse({
    startUrl: formData.get("startUrl"),
    maxPages: formData.get("maxPages") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const analysis = await analyseInternalLinks({
      startUrl: parsed.data.startUrl,
      maxPages: parsed.data.maxPages,
    });
    return { ok: true, analysis };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Analysis failed",
    };
  }
}
