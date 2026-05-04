"use server";

import { z } from "zod";
import {
  discoverBacklinks,
  type DiscoveryResult,
} from "@/lib/backlink-discovery";

const inputSchema = z.object({
  targetDomain: z.string().trim().min(3).max(255),
  skipVerify: z
    .union([z.literal("on"), z.literal("off"), z.undefined()])
    .transform((v) => v === "on"),
});

export type DiscoveryState =
  | { ok: true; result: DiscoveryResult }
  | { ok: false; error: string };

export async function runBacklinkDiscovery(
  _prev: DiscoveryState | null,
  formData: FormData,
): Promise<DiscoveryState> {
  const parsed = inputSchema.safeParse({
    targetDomain: formData.get("targetDomain"),
    skipVerify: formData.get("skipVerify"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await discoverBacklinks({
      targetDomain: parsed.data.targetDomain,
      skipVerify: parsed.data.skipVerify,
      limit: 80,
    });
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "Discovery failed" };
  }
}
