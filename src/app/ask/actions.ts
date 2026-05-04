"use server";

import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  clients,
  keywords,
  keywordRankings,
  tasks,
} from "@/db/schema";
import { callAI } from "@/lib/ai-call";

export type AskResult =
  | { ok: true; answer: string; contextUsed: string }
  | { ok: false; error: string };

/**
 * Builds a compact, AI-friendly context summary of a single client's data.
 * Pulls the most relevant signals: last audit, keyword count + top wins,
 * task counts, recent rank deltas. Keeps payload small to respect
 * credit-saver mode.
 */
async function buildClientContext(clientId: number): Promise<string | null> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return null;

  const [latestAudit] = await db
    .select()
    .from(audits)
    .where(eq(audits.clientId, clientId))
    .orderBy(desc(audits.createdAt))
    .limit(1);

  const [{ value: openTasks }] = await db
    .select({ value: count() })
    .from(tasks)
    .where(eq(tasks.clientId, clientId));

  const trackedKeywords = await db
    .select({
      query: keywords.query,
      latestPosition: keywordRankings.position,
      checkedAt: keywordRankings.checkedAt,
    })
    .from(keywords)
    .leftJoin(
      keywordRankings,
      eq(keywords.id, keywordRankings.keywordId),
    )
    .where(eq(keywords.clientId, clientId))
    .orderBy(desc(keywordRankings.checkedAt))
    .limit(50);

  // Best-effort dedupe — pick the most recent reading per query
  const byQuery = new Map<
    string,
    { latest: number | null; checkedAt: Date | null }
  >();
  for (const r of trackedKeywords) {
    if (!byQuery.has(r.query)) {
      byQuery.set(r.query, {
        latest: r.latestPosition ?? null,
        checkedAt: r.checkedAt ?? null,
      });
    }
  }

  const winningKeywords = Array.from(byQuery.entries())
    .filter(([, v]) => v.latest !== null)
    .sort(([, a], [, b]) => (a.latest ?? 999) - (b.latest ?? 999))
    .slice(0, 10);

  const lines: string[] = [];
  lines.push(`Client: ${client.name} (${client.url})`);
  if (client.niche) lines.push(`Niche: ${client.niche}`);
  if (client.techStack && client.techStack.length > 0) {
    lines.push(`Tech stack: ${client.techStack.slice(0, 5).join(", ")}`);
  }
  if (latestAudit) {
    lines.push(
      `Latest audit: score ${latestAudit.score ?? "?"}/100, ${latestAudit.issuesCount ?? 0} issues, ran ${latestAudit.createdAt.toISOString().slice(0, 10)}`,
    );
  } else {
    lines.push("No audit run yet.");
  }
  lines.push(`Open tasks: ${openTasks}`);
  lines.push(`Tracked keywords: ${byQuery.size}`);
  if (winningKeywords.length > 0) {
    lines.push(
      `Top ranking keywords: ${winningKeywords
        .map(([q, v]) => `"${q}" #${v.latest}`)
        .join(", ")}`,
    );
  }
  return lines.join("\n");
}

export async function askTheTool(input: {
  clientId?: number | null;
  question: string;
}): Promise<AskResult> {
  const question = input.question.trim();
  if (!question) {
    return { ok: false, error: "Type a question first." };
  }
  if (question.length > 2000) {
    return { ok: false, error: "Question is too long (max 2000 chars)." };
  }

  let context = "";
  if (input.clientId) {
    const c = await buildClientContext(input.clientId);
    if (c) context = c;
  }

  const system = context
    ? `You are an SEO consultant analyzing a specific client's data inside a self-hosted SEO tool. Use the client snapshot below as ground truth — don't invent metrics. If the data doesn't answer the question, say so honestly and suggest what to check.

Client snapshot:
${context}

Be specific, action-oriented, and concise. Cite which data point you're reasoning from.`
    : `You are an SEO consultant inside a self-hosted SEO tool. The user hasn't picked a client, so answer in general terms and suggest connecting their site for specific recommendations.`;

  const answer = await callAI({
    system,
    user: question,
    maxTokens: 800,
    temperature: 0.4,
  });

  if (!answer) {
    return {
      ok: false,
      error:
        "No AI provider responded. Configure an API key in Settings → AI.",
    };
  }

  return { ok: true, answer, contextUsed: context };
}
