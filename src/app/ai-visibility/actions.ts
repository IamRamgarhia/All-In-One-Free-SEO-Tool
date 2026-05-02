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

  for (const r of results) {
    await db.insert(aiVisibilityChecks).values({
      keywordId,
      provider: r.provider,
      prompt: r.prompt,
      response: r.response,
      citations: r.citations,
      mentionsDomain: r.mentionsDomain,
      citationsForDomain: r.citationsForDomain,
      error: r.error ?? null,
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

export async function runAllAiChecks(): Promise<void> {
  const allKeywords = await db
    .select({ id: keywords.id })
    .from(keywords);

  for (const k of allKeywords) {
    await runAiCheck(k.id).catch(() => {});
  }

  revalidatePath("/ai-visibility");
}

export async function deleteVisibilityCheck(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  await db.delete(aiVisibilityChecks).where(eq(aiVisibilityChecks.id, id));
  revalidatePath("/ai-visibility");
}
