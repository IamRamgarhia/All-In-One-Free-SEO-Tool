"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiVisibilityChecks,
  clients,
  keywords,
} from "@/db/schema";
import {
  checkAllProviders,
  type LlmProvider,
} from "@/lib/llm-citation";
import { configuredProviders } from "@/lib/api-keys";
import { logActivity } from "@/lib/activity";
import { classifySentiment } from "@/lib/ai-sentiment";

export type RunCheckResult =
  | {
      ok: true;
      keywordId: number;
      providersChecked: number;
      mentionsFound: number;
    }
  | { ok: false; error: string };

export async function runAiCheck(keywordId: number): Promise<RunCheckResult> {
  if (!Number.isFinite(keywordId) || keywordId <= 0) {
    return { ok: false, error: "Invalid keyword id" };
  }

  const [row] = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      clientId: keywords.clientId,
      clientName: clients.name,
      clientUrl: clients.url,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .where(eq(keywords.id, keywordId))
    .limit(1);

  if (!row || !row.clientUrl) {
    return { ok: false, error: "Keyword or client not found" };
  }

  const { ids } = await configuredProviders();
  if (ids.length === 0) {
    return {
      ok: false,
      error:
        "No AI provider configured. Open Settings → AI provider keys and paste a free Gemini, Groq, or Perplexity key.",
    };
  }

  const domain = row.clientUrl
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0];

  const results = await checkAllProviders(
    row.query,
    domain,
    ids as LlmProvider[],
  );

  // Classify sentiment for every response that actually mentioned the
  // brand. Done in parallel — each classification is a small extra
  // LLM call (~200 tokens) on the user's already-configured free
  // provider. Failures (rate limit, model returned bad JSON) are
  // tolerated; the visibility row still gets inserted with null
  // sentiment fields.
  const brandName = row.clientName ?? domain;
  const sentimentByIdx = await Promise.all(
    results.map(async (r) =>
      r.mentionsDomain && !r.error
        ? await classifySentiment(r.response, brandName, {
            clientId: row.clientId,
          }).catch(() => null)
        : null,
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const sent = sentimentByIdx[i];
    await db.insert(aiVisibilityChecks).values({
      keywordId,
      provider: r.provider,
      prompt: r.prompt,
      response: r.response,
      citations: r.citations,
      mentionsDomain: r.mentionsDomain,
      citationsForDomain: r.citationsForDomain,
      error: r.error ?? null,
      sentiment: sent?.sentiment ?? null,
      sentimentScore: sent?.score ?? null,
      sentimentReason: sent?.reason ?? null,
    });
  }

  const mentionsFound = results.filter((r) => r.mentionsDomain).length;

  await logActivity({
    kind: "audit.completed",
    message: `AI visibility check on "${row.query}" ran across ${results.length} providers · ${mentionsFound} mentioned ${row.clientName}.`,
    level: mentionsFound > 0 ? "success" : "info",
    clientId: row.clientId,
    entityType: "ai_visibility",
    entityId: keywordId,
  });

  revalidatePath("/ai-visibility");

  return {
    ok: true,
    keywordId,
    providersChecked: results.length,
    mentionsFound,
  };
}

/**
 * Run AI visibility checks across a workspace's keywords.
 *
 * Bug-fix: the previous version of this function fired one runAiCheck
 * per keyword across the ENTIRE workspace with no scope, no cap, no
 * throttle. With 5 clients × 50 keywords × 3 providers, a single user
 * click triggered ~750 AI calls. That's a self-DDoS on free-tier rate
 * limits and a runaway monthly-cap event waiting to happen.
 *
 * Now: optional `clientId` filter (callers should ALWAYS scope per
 * client in normal use), a hard cap on total keyword-runs per
 * invocation, and a 250ms inter-keyword sleep so we never burst the
 * provider rate limit.
 *
 * Returns { ran, errored, capped } so the UI can show "Ran N checks
 * (M errored, capped at LIMIT)" instead of fire-and-forget.
 */
const RUN_ALL_HARD_CAP = 100;
const INTER_KEYWORD_SLEEP_MS = 250;

export async function runAllAiChecks(opts?: {
  clientId?: number;
}): Promise<{ ran: number; errored: number; capped: boolean }> {
  const whereClause =
    typeof opts?.clientId === "number" && Number.isFinite(opts.clientId)
      ? eq(keywords.clientId, opts.clientId)
      : undefined;

  const allKeywords = await db
    .select({ id: keywords.id })
    .from(keywords)
    .where(whereClause)
    .limit(RUN_ALL_HARD_CAP + 1);

  const capped = allKeywords.length > RUN_ALL_HARD_CAP;
  const work = capped ? allKeywords.slice(0, RUN_ALL_HARD_CAP) : allKeywords;

  let ran = 0;
  let errored = 0;
  for (const k of work) {
    const r = await runAiCheck(k.id).catch(() => null);
    if (r && r.ok) {
      ran++;
    } else {
      errored++;
    }
    // Light throttle so 100 sequential calls don't burst the free-tier
    // rate limit. ~250ms × 100 keywords = ~25s overhead, dwarfed by
    // the AI calls themselves.
    if (INTER_KEYWORD_SLEEP_MS > 0) {
      await new Promise((res) => setTimeout(res, INTER_KEYWORD_SLEEP_MS));
    }
  }

  revalidatePath("/ai-visibility");
  return { ran, errored, capped };
}

export async function deleteVisibilityCheck(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  await db.delete(aiVisibilityChecks).where(eq(aiVisibilityChecks.id, id));
  revalidatePath("/ai-visibility");
}
