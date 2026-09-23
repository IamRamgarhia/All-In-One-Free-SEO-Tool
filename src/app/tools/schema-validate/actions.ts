"use server";

import { z } from "zod";
import {
  validateSchemaFromUrl,
  type SchemaValidationResult,
} from "@/lib/page-inspectors";
import { recordToolRun, type FindingDraft } from "@/lib/tool-findings";
import { clientIdFrom } from "@/lib/client-id-field";

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

/**
 * Structured data that will not do what it was added for.
 *
 * Deliberately NOT mapped to the agent's write_schema. That capability
 * writes a block where none exists; this tool reports blocks that exist
 * and are wrong, and overwriting somebody's hand-written schema because
 * one field is missing is a different and much larger decision than
 * filling an empty slot.
 *
 * Errors and warnings are separate findings because they mean different
 * things: an error means Google will not use the block at all, a warning
 * means it will use it and show less.
 */
function schemaFindings(r: SchemaValidationResult): FindingDraft[] {
  const out: FindingDraft[] = [];

  if (r.blocks.length === 0) {
    out.push({
      signature: "schema-validate.none",
      title: "No structured data on this page",
      severity: "low",
      category: "structured-data",
      details:
        "No JSON-LD blocks found. Schema is what makes a result eligible for the richer " +
        "listings — review stars, FAQ dropdowns, product prices — rather than a plain link.",
    });
    return out;
  }

  const broken = r.blocks.filter((b) => b.errors.length > 0);
  if (broken.length > 0) {
    out.push({
      signature: "schema-validate.errors",
      title: `${broken.length} structured-data block${broken.length === 1 ? "" : "s"} ${broken.length === 1 ? "has" : "have"} errors`,
      // An invalid block is not partially useful. Google discards it, so
      // the markup is doing nothing at all.
      severity: "medium",
      category: "structured-data",
      details:
        broken
          .map(
            (b) =>
              `${typeName(b.type)}: ${b.errors.slice(0, 3).join("; ")}`,
          )
          .join(" | ") +
        ". Google ignores a block it cannot parse, so this markup is currently doing nothing.",
    });
  }

  const warned = r.blocks.filter(
    (b) => b.errors.length === 0 && b.warnings.length > 0,
  );
  if (warned.length > 0) {
    out.push({
      signature: "schema-validate.warnings",
      title: `${warned.length} block${warned.length === 1 ? "" : "s"} missing recommended fields`,
      severity: "low",
      category: "structured-data",
      details:
        warned
          .map((b) => `${typeName(b.type)}: ${b.warnings.slice(0, 3).join("; ")}`)
          .join(" | ") +
        ". These are valid but incomplete — Google will use them and show less.",
    });
  }

  return out;
}

function typeName(t: string | string[] | null): string {
  if (Array.isArray(t)) return t.join("/") || "block";
  return t ?? "block";
}

export async function runValidate(
  _prev: ValidateState | null,
  formData: FormData,
): Promise<ValidateState> {
  const parsed = schema.safeParse({ url: formData.get("url") });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid URL" };
  const r = await validateSchemaFromUrl(parsed.data.url);
  if (!r.ok && r.error) return { ok: false, error: r.error };
  const clientId = clientIdFrom(formData);
  await recordToolRun({
    toolId: "schema-validate",
    label: `${parsed.data.url} · ${r.totalErrors} error${r.totalErrors === 1 ? "" : "s"}`,
    clientId,
    input: { url: parsed.data.url, clientId },
    result: { ok: true, result: r },
    findings: schemaFindings(r),
  });
  return { ok: true, result: r };
}
