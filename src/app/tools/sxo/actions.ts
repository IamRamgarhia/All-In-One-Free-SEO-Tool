"use server";

import { callAI } from "@/lib/ai-call";
import { scanCwv } from "@/lib/pagespeed";
import { saveToolRun } from "@/lib/tool-runs";
import { db } from "@/db/client";
import { toolFindings, type ToolFinding } from "@/db/schema";

export type SxoAudit = {
  url: string;
  primaryPersona: string;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  pagePromise: { ok: boolean; note: string };
  timeToAnswer: { score: number; note: string };
  nextStep: { ok: boolean; note: string };
  friction: { score: number; items: string[] };
  cwv: { score: number; lcpMs: number | null; cls: number | null };
  /** Composite 0-100. */
  sxoScore: number;
  recommendations: string[];
  /** Persisted run id — caller uses it to render the FindingsChecklist. */
  runId?: number;
  /** Persisted findings (one row per actionable check). */
  findings?: ToolFinding[];
};

export type SxoState =
  | { ok: true; audit: SxoAudit }
  | { ok: false; error: string }
  | null;

/**
 * Build the raw checklist of findings from the SXO signals computed
 * above. Each check produces ONE finding (pass or fail). Passing
 * checks are kept (with severity="pass") so the user sees a green
 * row for what's already working — important for trust after re-checks.
 */
type RawFinding = {
  signature: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "pass";
  details: string;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function detectFriction(html: string): string[] {
  const items: string[] = [];
  // Cookie banner
  if (
    /cookie/i.test(html) &&
    /(consent|banner|gdpr|accept[^<]{0,30}(all|cookies))/i.test(html)
  ) {
    items.push("Cookie banner likely covers initial viewport");
  }
  // Pop-up / modal
  if (/<div[^>]*class=["'][^"']*(popup|modal|overlay|lightbox)/i.test(html)) {
    items.push("Pop-up / modal markup present — verify it isn't on initial load");
  }
  // Newsletter signup interstitial
  if (
    /subscribe[^<]{0,30}newsletter|sign up[^<]{0,30}email/i.test(html) &&
    /<form[^>]*>/i.test(html)
  ) {
    items.push("Newsletter signup detected — common dwell-time killer when interstitial");
  }
  // Excessive ad slots
  const adSlots = (html.match(/adsbygoogle|google_ad_|data-ad-slot/g) ?? []).length;
  if (adSlots >= 4) {
    items.push(`${adSlots} ad slots detected — heavy ads correlate with pogo-sticking`);
  }
  // Auto-playing video
  if (/<video[^>]+autoplay/i.test(html)) {
    items.push("Auto-playing video on the page");
  }
  // No clear CTA on the page (no buttons with action-y text)
  const ctas = (
    html.match(
      /<(?:a|button)[^>]*>[^<]*(?:buy|sign\s*up|get started|download|book|contact|try|start|learn more)[^<]*<\/(?:a|button)>/gi,
    ) ?? []
  ).length;
  if (ctas === 0) {
    items.push("No clear action button detected — users have no obvious next step");
  }
  return items;
}

function detectIntent(
  url: string,
  html: string,
): "informational" | "commercial" | "transactional" | "navigational" {
  const u = url.toLowerCase();
  if (
    u.includes("/buy") ||
    u.includes("/checkout") ||
    u.includes("/cart") ||
    u.includes("/order")
  )
    return "transactional";
  if (
    u.includes("/pricing") ||
    u.includes("/plans") ||
    u.includes("/compare") ||
    u.includes("/vs") ||
    u.includes("/alternative")
  )
    return "commercial";
  if (
    u.includes("/login") ||
    u.includes("/sign-in") ||
    u.includes("/contact") ||
    u.includes("/about")
  )
    return "navigational";
  if (
    u.includes("/blog/") ||
    u.includes("/guide") ||
    u.includes("/learn") ||
    u.includes("/how-to") ||
    u.includes("/what-is")
  )
    return "informational";
  // Look at content
  if (/(?:add to cart|buy now|checkout|book now)/i.test(html)) return "transactional";
  if (/(?:pricing|plans|free trial|start trial)/i.test(html)) return "commercial";
  return "informational";
}

function detectFirstParagraphLength(html: string): number {
  // Strip head & nav before measuring "above-the-fold" content density
  const body =
    html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html;
  const firstPara = body.match(
    /<(?:p|h2|h1)[^>]*>([\s\S]{20,600}?)<\/(?:p|h2|h1)>/i,
  )?.[1];
  if (!firstPara) return 0;
  return firstPara.replace(/<[^>]+>/g, "").trim().length;
}

export async function runSxoAudit(
  _prev: SxoState,
  formData: FormData,
): Promise<SxoState> {
  const urlRaw = String(formData.get("url") ?? "").trim();
  if (!urlRaw) return { ok: false, error: "URL required." };
  let url: string;
  try {
    url = new URL(/^https?:\/\//i.test(urlRaw) ? urlRaw : `https://${urlRaw}`)
      .toString();
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  const html = await fetchHtml(url);
  if (!html) return { ok: false, error: `Couldn't fetch ${url}` };

  const intent = detectIntent(url, html);

  // Page promise: H1 + first paragraph cohesion
  const h1 = html.match(/<h1[^>]*>([\s\S]{2,200}?)<\/h1>/i)?.[1] ?? "";
  const h1Text = h1.replace(/<[^>]+>/g, "").trim();
  const firstParaLen = detectFirstParagraphLength(html);
  const pagePromise = {
    ok: !!h1Text && firstParaLen >= 60,
    note: h1Text
      ? `H1: "${h1Text.slice(0, 80)}". First content block: ${firstParaLen} chars.`
      : "No H1 — page promise unclear.",
  };

  // Time-to-answer — look for TL;DR / summary / definition opener
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const opensWithDef = /^[^.]{20,200}\b(is|are|means|measures)\b/i.test(
    stripped.slice(0, 500),
  );
  const hasTldr = /tl;?dr|in short|summary[:\s]|key takeaway/i.test(
    stripped.slice(0, 1500),
  );
  let ttaScore = 40;
  if (opensWithDef) ttaScore += 30;
  if (hasTldr) ttaScore += 30;
  const timeToAnswer = {
    score: Math.min(100, ttaScore),
    note: `${opensWithDef ? "Opens with a direct definition. " : "Doesn't open with a direct answer. "}${hasTldr ? "Has TL;DR / summary." : "No TL;DR found."}`,
  };

  // Next step
  const ctaCount = (
    html.match(
      /<(?:a|button)[^>]*>[^<]*(?:buy|sign\s*up|get started|download|book|contact|try|start|learn more|read more|explore|browse|shop|order)[^<]*<\/(?:a|button)>/gi,
    ) ?? []
  ).length;
  const nextStep = {
    ok: ctaCount >= 1,
    note: ctaCount > 0
      ? `${ctaCount} action-oriented CTAs detected.`
      : "No clear CTA — dead-end page risk.",
  };

  // Friction
  const frictionItems = detectFriction(html);
  const frictionScore = Math.max(0, 100 - frictionItems.length * 15);

  // CWV (PSI lab score)
  let cwvScore = 50;
  let lcpMs: number | null = null;
  let cls: number | null = null;
  try {
    const cwv = await scanCwv({ url });
    if (cwv.ok) {
      cwvScore = cwv.performance ?? 50;
      lcpMs = cwv.lcpMs;
      cls = cwv.cls !== null ? cwv.cls / 100 : null;
    }
  } catch {
    // fallback
  }

  // AI step — derive primary persona + recommendations
  const aiPrompt = `Page: ${url}
Intent: ${intent}
H1: ${h1Text}
First content opens with definition: ${opensWithDef ? "yes" : "no"}
CTA buttons: ${ctaCount}
Friction items: ${frictionItems.join("; ") || "none"}
PSI performance: ${cwvScore}/100

Output a JSON object with: { "primaryPersona": "<one phrase>", "recommendations": ["<specific fix>", ...] }. 3-5 recommendations, each <120 chars. Prioritize SXO (search experience optimization) actions: opening clarity, removing friction, sharpening next step, satisfying intent.`;

  let primaryPersona = "Default persona — couldn't infer.";
  let recommendations: string[] = [
    "Open the page with a direct definition or value statement.",
    "Ensure at least one prominent CTA is visible in the first viewport.",
    "Remove or delay non-essential interstitials (cookies, popups).",
  ];
  const aiText = await callAI({
    system:
      "You are an SXO (Search Experience Optimization) consultant. Return only JSON.",
    user: aiPrompt,
    maxTokens: 600,
    temperature: 0.3,
    feature: "general",
  });
  if (aiText) {
    const m = aiText.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]) as {
          primaryPersona?: string;
          recommendations?: string[];
        };
        if (j.primaryPersona) primaryPersona = j.primaryPersona;
        if (Array.isArray(j.recommendations) && j.recommendations.length > 0) {
          recommendations = j.recommendations
            .map((r) => String(r).slice(0, 200))
            .slice(0, 6);
        }
      } catch {
        // ignore
      }
    }
  }

  // SXO composite
  const sxoScore = Math.round(
    (pagePromise.ok ? 100 : 30) * 0.2 +
      timeToAnswer.score * 0.2 +
      (nextStep.ok ? 100 : 20) * 0.2 +
      frictionScore * 0.2 +
      cwvScore * 0.2,
  );

  const audit: SxoAudit = {
    url,
    primaryPersona,
    intent,
    pagePromise,
    timeToAnswer,
    nextStep,
    friction: { score: frictionScore, items: frictionItems },
    cwv: { score: cwvScore, lcpMs, cls },
    sxoScore,
    recommendations,
  };

  // Build per-finding rows. Each signature is stable across runs so
  // re-checks can match findings back to prior status (resolved/ignored).
  const raw: RawFinding[] = [
    {
      signature: "sxo.page_promise",
      title: pagePromise.ok
        ? "Page promise is clear"
        : "Page promise is unclear — missing or weak H1",
      category: "Page promise",
      severity: pagePromise.ok ? "pass" : "critical",
      details: pagePromise.note,
    },
    {
      signature: "sxo.time_to_answer",
      title:
        timeToAnswer.score >= 70
          ? "Time-to-answer is solid"
          : "Slow time-to-answer — readers wait for the point",
      category: "Time-to-answer",
      severity:
        timeToAnswer.score >= 70
          ? "pass"
          : timeToAnswer.score >= 40
            ? "medium"
            : "high",
      details: timeToAnswer.note,
    },
    {
      signature: "sxo.next_step",
      title: nextStep.ok
        ? "Clear next step on the page"
        : "No clear next step — dead-end risk",
      category: "Next step",
      severity: nextStep.ok ? "pass" : "high",
      details: nextStep.note,
    },
    ...frictionItems.map((item, i): RawFinding => ({
      signature: `sxo.friction.${i}.${item.slice(0, 32).replace(/\W+/g, "_").toLowerCase()}`,
      title: item,
      category: "Friction",
      severity: "medium",
      details: "Detected on initial page render — verify it isn't blocking the above-the-fold experience.",
    })),
    {
      signature: "sxo.cwv",
      title:
        cwvScore >= 80
          ? "Core Web Vitals look healthy"
          : cwvScore >= 50
            ? "Core Web Vitals need attention"
            : "Poor Core Web Vitals — speed is hurting rankings",
      category: "Core Web Vitals",
      severity: cwvScore >= 80 ? "pass" : cwvScore >= 50 ? "medium" : "high",
      details:
        `PSI performance ${cwvScore}/100` +
        (lcpMs !== null ? ` · LCP ${(lcpMs / 1000).toFixed(1)}s` : "") +
        (cls !== null ? ` · CLS ${cls.toFixed(2)}` : ""),
    },
  ];

  // Persist the run first so we have a runId to attach findings to.
  const runId = await saveToolRun({
    toolId: "sxo",
    label: `${url} · SXO ${sxoScore}/100`,
    input: { url },
    result: { ok: true, audit },
  }).catch(() => null);

  let savedFindings: ToolFinding[] = [];
  if (runId !== null) {
    // Ask the AI for plain-English fix steps + optional copy-paste
    // snippet for each non-passing finding. One batched call to keep
    // cost low. Failing AI = fall back to recommendations.
    const fixMap = await generateFixSteps(
      url,
      raw.filter((f) => f.severity !== "pass"),
    );

    const rows = raw.map((f) => ({
      runId,
      toolId: "sxo",
      signature: f.signature,
      title: f.title,
      category: f.category,
      severity: f.severity,
      details: f.details,
      fixSteps: f.severity === "pass" ? null : fixMap[f.signature]?.steps ?? null,
      codeSnippet:
        f.severity === "pass" ? null : fixMap[f.signature]?.code ?? null,
      status: "new" as const,
    }));
    try {
      const inserted = await db
        .insert(toolFindings)
        .values(rows)
        .returning();
      savedFindings = inserted;
    } catch {
      // Don't fail the whole audit if the findings table write fails
      savedFindings = [];
    }
  }

  return {
    ok: true,
    audit: {
      ...audit,
      runId: runId ?? undefined,
      findings: savedFindings,
    },
  };
}

/**
 * Ask the AI for plain-English fix steps + optional copy-paste snippet
 * for each finding. Returns a signature→{steps, code} map. Best-effort —
 * if the AI fails, the findings still render without guidance and the
 * user can mark them done manually.
 */
async function generateFixSteps(
  url: string,
  failingFindings: RawFinding[],
): Promise<Record<string, { steps: string; code: string | null }>> {
  if (failingFindings.length === 0) return {};
  const prompt = `Page: ${url}
For each finding below, write a "How to fix" section with 2-4 numbered plain-English steps. When a copy-paste HTML/JSON-LD/robots.txt/CSS snippet would help, include it.

Return JSON with this shape:
{
  "fixes": [
    { "signature": "<sig>", "steps": "1. …\\n2. …", "code": "<snippet or empty>" }
  ]
}

Findings:
${failingFindings
  .map(
    (f, i) =>
      `${i + 1}. [${f.signature}] ${f.title}\n   Details: ${f.details}`,
  )
  .join("\n")}`;

  const aiText = await callAI({
    system:
      "You are an SXO consultant. Output JSON only — no preamble, no markdown fences.",
    user: prompt,
    maxTokens: 1500,
    temperature: 0.3,
    feature: "general",
  });
  if (!aiText) return {};
  const out: Record<string, { steps: string; code: string | null }> = {};
  try {
    const cleaned = aiText.replace(/```(?:json)?/g, "").trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const parsed = JSON.parse(m[0]) as {
      fixes?: { signature?: string; steps?: string; code?: string }[];
    };
    for (const fix of parsed.fixes ?? []) {
      if (!fix.signature) continue;
      out[fix.signature] = {
        steps: (fix.steps ?? "").slice(0, 2000),
        code: fix.code && fix.code.trim().length > 0 ? fix.code.slice(0, 2000) : null,
      };
    }
  } catch {
    // ignore
  }
  return out;
}
