"use server";

import { z } from "zod";
import { checkMobileFriendliness, type MobileFriendlyCheck } from "@/lib/page-inspectors";
import { recordToolRun } from "@/lib/tool-findings";
import { mobileFindings } from "@/lib/tool-finding-builders";

const schema = z.object({
  url: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
});

export type MobileState =
  | { ok: true; result: MobileFriendlyCheck }
  | { ok: false; error: string };

export async function runMobile(
  _prev: MobileState | null,
  formData: FormData,
): Promise<MobileState> {
  const parsed = schema.safeParse({ url: formData.get("url") });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid URL" };
  const r = await checkMobileFriendliness(parsed.data.url);
  if (!r.ok && r.error) return { ok: false, error: r.error };
  await recordToolRun({
    toolId: "mobile-friendly",
    label: parsed.data.url,
    input: { url: parsed.data.url },
    result: { ok: true, result: r },
    findings: mobileFindings(r),
  });
  return { ok: true, result: r };
}
