"use server";

import {
  suggestAutoLinks,
  type AutoLinkSuggestion,
} from "@/lib/content-ai-helpers";
import { saveToolRun } from "@/lib/tool-runs";

export type AutoLinkState =
  | { ok: true; suggestions: AutoLinkSuggestion[] }
  | { ok: false; error: string };

function parsePages(raw: string): { url: string; title: string }[] {
  const out: { url: string; title: string }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(/\t+|\s{2,}/);
    if (parts.length >= 2) {
      out.push({ url: parts[0].trim(), title: parts.slice(1).join(" ").trim() });
    } else {
      // URL only — title falls back to the URL path
      try {
        const u = new URL(parts[0]);
        out.push({ url: parts[0].trim(), title: u.pathname.replace(/^\//, "") || u.hostname });
      } catch {
        // skip
      }
    }
  }
  return out.slice(0, 100);
}

export async function runAutoLink(
  _prev: AutoLinkState | null,
  formData: FormData,
): Promise<AutoLinkState> {
  const content = String(formData.get("content") ?? "").trim();
  const pagesRaw = String(formData.get("pages") ?? "").trim();
  if (!content) return { ok: false, error: "Paste content." };
  if (!pagesRaw) return { ok: false, error: "Paste internal pages." };
  const pages = parsePages(pagesRaw);
  if (pages.length === 0) return { ok: false, error: "No valid pages parsed." };
  const r = await suggestAutoLinks({ content, internalPages: pages });
  if (!r.ok) return { ok: false, error: r.error };
  await saveToolRun({
    toolId: "auto-link",
    label: `${r.suggestions.length} link suggestions · ${pages.length} pages`,
    input: { contentLen: content.length, pageCount: pages.length },
    result: { ok: true, suggestions: r.suggestions },
  }).catch(() => undefined);
  return { ok: true, suggestions: r.suggestions };
}
