"use server";

import { z } from "zod";
import {
  estimateBulk,
  type VolumeEstimate,
} from "@/lib/search-volume";

const inputSchema = z.object({
  queries: z.string().trim().min(1).max(20_000),
  country: z.string().trim().min(2).max(8).default("US"),
});

export type EstimateState =
  | { ok: true; estimates: VolumeEstimate[] }
  | { ok: false; error: string };

export async function estimateVolumes(
  _prev: EstimateState | null,
  formData: FormData,
): Promise<EstimateState> {
  const parsed = inputSchema.safeParse({
    queries: formData.get("queries"),
    country: formData.get("country") || "US",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const queries = parsed.data.queries
    .split(/\r?\n|,/)
    .map((q) => q.trim())
    .filter((q) => q.length > 1 && q.length < 200)
    .slice(0, 30);
  if (queries.length === 0) {
    return { ok: false, error: "No queries to estimate." };
  }

  const estimates = await estimateBulk({
    queries,
    country: parsed.data.country,
  });
  return { ok: true, estimates };
}
