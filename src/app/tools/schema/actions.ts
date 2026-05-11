"use server";

import { fetchSiteMetadata } from "@/lib/site-metadata";
import { callAI } from "@/lib/ai-call";
import { saveToolRun } from "@/lib/tool-runs";

export type SchemaType =
  | "Article"
  | "LocalBusiness"
  | "FAQPage"
  | "Product"
  | "Recipe"
  | "Event"
  | "Organization";

export type GenerateSchemaResult =
  | { ok: true; jsonld: string }
  | { ok: false; error: string };

const SYSTEM = `You generate valid schema.org JSON-LD structured data.

Rules:
- Output ONLY a single JSON object. No markdown fences. No prose.
- Always include @context: "https://schema.org" and @type.
- Required fields per type must be filled. Use null for unknown values.
- Use the data the user provides; don't invent facts.
- Strings must be properly escaped JSON.`;

export async function generateSchema(opts: {
  type: SchemaType;
  url?: string;
  notes?: string;
}): Promise<GenerateSchemaResult> {
  const lines: string[] = [];
  lines.push(`Type: ${opts.type}`);

  if (opts.url) {
    const meta = await fetchSiteMetadata(opts.url).catch(() => null);
    if (meta) {
      lines.push(`Page URL: ${meta.url}`);
      if (meta.name) lines.push(`Site name: ${meta.name}`);
      if (meta.description) lines.push(`Description: ${meta.description}`);
      if (meta.logoUrl) lines.push(`Logo URL: ${meta.logoUrl}`);
      if (meta.address) lines.push(`Address: ${meta.address}`);
      if (meta.phone) lines.push(`Phone: ${meta.phone}`);
      if (meta.email) lines.push(`Email: ${meta.email}`);
      const social = meta.socialLinks ?? {};
      const socialUrls = Object.values(social).filter(Boolean);
      if (socialUrls.length > 0) {
        lines.push(`Social profiles (sameAs): ${socialUrls.join(", ")}`);
      }
    }
  }

  if (opts.notes) {
    lines.push("");
    lines.push("Additional notes from the user:");
    lines.push(opts.notes);
  }

  lines.push("");
  lines.push(
    "Generate the JSON-LD now. JSON object only, no prose, no markdown.",
  );

  const raw = await callAI({
    system: SYSTEM,
    user: lines.join("\n"),
    maxTokens: 1500,
    temperature: 0.3,
    timeoutMs: 60_000,
  });

  if (!raw) {
    return {
      ok: false,
      error: "AI provider didn't respond. Set up an API key in Settings.",
    };
  }

  // Try to extract a JSON object from the response
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const jsonld = JSON.stringify(parsed, null, 2);
    await saveToolRun({
      toolId: "schema",
      label: `${opts.type}${opts.url ? ` · ${opts.url}` : ""}`,
      input: { type: opts.type, url: opts.url ?? null },
      result: { ok: true, jsonld },
    }).catch(() => undefined);
    return { ok: true, jsonld };
  } catch {
    return { ok: false, error: "Model output wasn't valid JSON." };
  }
}
