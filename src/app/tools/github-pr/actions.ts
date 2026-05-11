"use server";

import {
  openSeoFixesPr,
  type SeoFixSuggestion,
} from "@/lib/github-pr-generator";
import { saveToolRun } from "@/lib/tool-runs";

export type PrState =
  | { ok: true; prNumber: number; prUrl: string; branch: string; manifestPath: string }
  | { ok: false; error: string }
  | null;

export async function runOpenPr(
  _prev: PrState,
  formData: FormData,
): Promise<PrState> {
  const owner = String(formData.get("owner") ?? "").trim();
  const repo = String(formData.get("repo") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const baseBranch = String(formData.get("baseBranch") ?? "").trim();
  const fixesJson = String(formData.get("fixesJson") ?? "").trim();
  if (!owner || !repo || !token || !domain || !fixesJson) {
    return { ok: false, error: "All fields except base branch are required." };
  }
  let fixes: SeoFixSuggestion[];
  try {
    const parsed = JSON.parse(fixesJson);
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "Fixes JSON must be an array." };
    }
    fixes = parsed as SeoFixSuggestion[];
  } catch {
    return { ok: false, error: "Fixes JSON is not valid JSON." };
  }
  const r = await openSeoFixesPr({
    target: { owner, repo, token },
    fixes,
    domain,
    baseBranch: baseBranch || undefined,
  });
  if (r && (r as { ok: boolean }).ok) {
    const ok = r as Extract<PrState, { ok: true }>;
    await saveToolRun({
      toolId: "github-pr",
      label: `PR #${ok.prNumber} · ${owner}/${repo} · ${fixes.length} fixes`,
      input: { owner, repo, domain, fixCount: fixes.length },
      result: ok,
    }).catch(() => undefined);
  }
  return r as PrState;
}
