"use server";

import { scanCwv } from "@/lib/pagespeed";
import { fetchCruxData } from "@/lib/crux";
import { recordToolRun } from "@/lib/tool-findings";
import { perfBudgetFindings } from "@/lib/tool-finding-builders";

export type BudgetLine = {
  label: string;
  budget: string;
  actual: string;
  passed: boolean;
};

export type BudgetState =
  | { ok: true; fails: number; lines: BudgetLine[] }
  | { ok: false; error: string }
  | null;

export async function runBudget(
  _prev: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { ok: false, error: "URL required." };
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }

  const num = (k: string) => Number(formData.get(k) ?? 0);
  const budgets = {
    htmlKb: num("htmlKb"),
    cssKb: num("cssKb"),
    jsKb: num("jsKb"),
    imageKb: num("imageKb"),
    fontKb: num("fontKb"),
    totalKb: num("totalKb"),
    requests: num("requests"),
    lcpMs: num("lcpMs"),
    inpMs: num("inpMs"),
    cls: num("cls"),
  };

  // Pull PageSpeed Insights for byte/request breakdown + lab metrics.
  const psi = await scanCwv({ url: parsed.toString() });
  if (!psi.ok) {
    return {
      ok: false,
      error:
        psi.error ??
        "PageSpeed Insights didn't return data. Check the URL or configure your Google API key in Settings.",
    };
  }

  const lines: BudgetLine[] = [];

  function add(
    label: string,
    actualNum: number,
    budgetNum: number,
    fmt: (n: number) => string,
    lowerIsBetter = true,
  ) {
    const passed = lowerIsBetter
      ? actualNum <= budgetNum
      : actualNum >= budgetNum;
    lines.push({
      label,
      budget: fmt(budgetNum),
      actual: fmt(actualNum),
      passed,
    });
  }

  const kb = (n: number) => `${Math.round(n)} KB`;
  const ms = (n: number) => `${Math.round(n)} ms`;

  if (psi.bytesByType) {
    if (budgets.htmlKb)
      add("HTML bytes", (psi.bytesByType.document ?? 0) / 1024, budgets.htmlKb, kb);
    if (budgets.cssKb)
      add("CSS bytes", (psi.bytesByType.stylesheet ?? 0) / 1024, budgets.cssKb, kb);
    if (budgets.jsKb)
      add("JavaScript bytes", (psi.bytesByType.script ?? 0) / 1024, budgets.jsKb, kb);
    if (budgets.imageKb)
      add("Image bytes", (psi.bytesByType.image ?? 0) / 1024, budgets.imageKb, kb);
    if (budgets.fontKb)
      add("Font bytes", (psi.bytesByType.font ?? 0) / 1024, budgets.fontKb, kb);
  }

  if (budgets.totalKb && typeof psi.totalBytes === "number") {
    add("Total bytes", psi.totalBytes / 1024, budgets.totalKb, kb);
  }
  if (budgets.requests && typeof psi.requestCount === "number") {
    add("Total requests", psi.requestCount, budgets.requests, (n) =>
      String(Math.round(n)),
    );
  }

  // Lab metrics from PSI
  if (budgets.lcpMs && typeof psi.lcpMs === "number") {
    add("LCP (lab)", psi.lcpMs, budgets.lcpMs, ms);
  }
  if (budgets.cls && typeof psi.cls === "number") {
    // CLS in scanCwv is stored × 100 (percent-style). Normalize back to
    // the standard 0..1 scale for budget comparison.
    add("CLS (lab)", psi.cls / 100, budgets.cls, (n) => n.toFixed(3));
  }

  // INP isn't a lab metric — use CrUX field data
  if (budgets.inpMs) {
    try {
      const crux = await fetchCruxData({ url: parsed.toString() });
      const inp = crux.metrics?.inp?.p75;
      if (typeof inp === "number") {
        add("INP (CrUX field, p75)", inp, budgets.inpMs, ms);
      }
    } catch {
      // skip if CrUX unavailable
    }
  }

  if (lines.length === 0) {
    return {
      ok: false,
      error:
        "No measurable signals returned from PageSpeed. Check that the URL is publicly reachable.",
    };
  }
  const fails = lines.filter((l) => !l.passed).length;
  const result: BudgetState = { ok: true, fails, lines };
  await recordToolRun({
    toolId: "perf-budget",
    label: `${parsed.toString()} · ${fails} fail${fails === 1 ? "" : "s"}`,
    input: { url: parsed.toString(), budgets },
    result,
    findings: perfBudgetFindings(lines),
  });
  return result;
}
