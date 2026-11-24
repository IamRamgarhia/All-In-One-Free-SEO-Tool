"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { requireSignedIn } from "@/lib/action-guard";

import {
  scoreAllPassages,
  suggestRewriteHint,
  type PassageScore,
} from "@/lib/aio-passage-scorer";
import { extractMainContent } from "@/lib/main-content-extractor";
import { saveToolRun } from "@/lib/tool-runs";

export type AnalyzeState =
  | { ok: true; passages: PassageScore[]; sourceUrl?: string; sourceTitle?: string }
  | { ok: false; error: string }
  | null;

export async function analyzePassages(
  _prev: AnalyzeState,
  formData: FormData,
): Promise<AnalyzeState> {
  await requireSignedIn();
  const t = await getTranslations("tools.ui.aio-passage");
  const md = String(formData.get("markdown") ?? "").trim();
  if (!md) return { ok: false, error: t("pasteDraftFirst") };
  const passages = scoreAllPassages(md, await getLocale());
  if (passages.length === 0) {
    return {
      ok: false,
      error: t("noPassages"),
    };
  }
  const avg = Math.round(
    passages.reduce((s, p) => s + p.score, 0) / passages.length,
  );
  await saveToolRun({
    toolId: "aio-passage",
    label: t("runLabelDraft", { count: passages.length, avg }),
    input: { markdown: md.slice(0, 4000) },
    result: { ok: true, passages },
  }).catch(() => undefined);
  return { ok: true, passages };
}

export async function suggestRewrite(
  passage: string,
  score: number,
): Promise<{ ok: true; rewrite: string } | { ok: false; error: string }> {
  await requireSignedIn();
  const r = await suggestRewriteHint(passage, score);
  if (!r)
    return {
      ok: false,
      error: (await getTranslations("tools.ui.aio-passage"))("noRewrite"),
    };
  return { ok: true, rewrite: r };
}

/**
 * Fetch a live URL, extract its readable main content, and run the
 * passage scorer against it. Same result shape as analyzePassages,
 * plus source metadata so the UI can show "analyzed: <title>".
 */
export async function analyzeUrl(
  _prev: AnalyzeState,
  formData: FormData,
): Promise<AnalyzeState> {
  await requireSignedIn();
  const t = await getTranslations("tools.ui.aio-passage");
  const rawUrl = String(formData.get("url") ?? "").trim();
  if (!rawUrl) return { ok: false, error: t("enterUrlFirst") };
  let url = rawUrl;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    return { ok: false, error: t("invalidUrl") };
  }
  const extracted = await extractMainContent(url);
  if (!extracted.ok) {
    return {
      ok: false,
      error: extracted.error ?? t("fetchFailed"),
    };
  }
  const passages = scoreAllPassages(extracted.markdown, await getLocale());
  if (passages.length === 0) {
    return {
      ok: false,
      error: t("noPassagesUrl"),
    };
  }
  const avg = Math.round(
    passages.reduce((s, p) => s + p.score, 0) / passages.length,
  );
  await saveToolRun({
    toolId: "aio-passage",
    label: t("runLabelUrl", {
      source: extracted.title || url,
      count: passages.length,
      avg,
    }),
    input: { url },
    result: { ok: true, passages, sourceUrl: url, sourceTitle: extracted.title },
  }).catch(() => undefined);
  return {
    ok: true,
    passages,
    sourceUrl: url,
    sourceTitle: extracted.title,
  };
}

/**
 * Batch-rewrite every passage scoring below `threshold` in parallel,
 * so the user gets a full "before → after" report in one click
 * instead of clicking "Rewrite" one passage at a time.
 *
 * Runs at most 8 concurrent AI calls so we don't burst the free-tier
 * rate limits (Gemini free = 15 rpm, Groq = 30 rpm).
 */
export async function batchRewrite(
  passages: PassageScore[],
  threshold = 70,
): Promise<{
  ok: true;
  rewrites: { index: number; before: string; after: string | null }[];
} | { ok: false; error: string }> {
  await requireSignedIn();
  const targets = passages.filter((p) => p.score < threshold);
  if (targets.length === 0) {
    return {
      ok: true,
      rewrites: [],
    };
  }
  const MAX_CONCURRENT = 8;
  const rewrites: { index: number; before: string; after: string | null }[] = [];
  for (let i = 0; i < targets.length; i += MAX_CONCURRENT) {
    const batch = targets.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.all(
      batch.map((p) => suggestRewriteHint(p.text, p.score).catch(() => null)),
    );
    batch.forEach((p, j) => {
      rewrites.push({ index: p.index, before: p.text, after: results[j] });
    });
  }
  return { ok: true, rewrites };
}
