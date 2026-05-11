"use server";

import { z } from "zod";
import {
  validateSchemaFromUrl,
  type SchemaValidationResult,
} from "@/lib/page-inspectors";
import { saveToolRun } from "@/lib/tool-runs";

const schema = z.object({
  url: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
});

export type ValidateState =
  | { ok: true; result: SchemaValidationResult }
  | { ok: false; error: string };

export async function runValidate(
  _prev: ValidateState | null,
  formData: FormData,
): Promise<ValidateState> {
  const parsed = schema.safeParse({ url: formData.get("url") });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid URL" };
  const r = await validateSchemaFromUrl(parsed.data.url);
  if (!r.ok && r.error) return { ok: false, error: r.error };
  await saveToolRun({
    toolId: "schema-validate",
    label: parsed.data.url,
    input: { url: parsed.data.url },
    result: { ok: true, result: r },
  }).catch(() => undefined);
  return { ok: true, result: r };
}
