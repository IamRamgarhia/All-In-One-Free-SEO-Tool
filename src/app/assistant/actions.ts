"use server";

import { desc, eq, ne, count } from "drizzle-orm";
import { db } from "@/db/client";
import { callGemini as sharedCallGemini } from "@/lib/providers/gemini";
import { callAnthropic as sharedCallAnthropic } from "@/lib/providers/anthropic";
import { callOpenAICompat as sharedCallOpenAICompat } from "@/lib/providers/openai-compat";
import {
  audits,
  auditIssues,
  clients,
  keywordRankings,
  keywords,
  pageChanges,
  monitoredPages,
  tasks,
} from "@/db/schema";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult =
  | { ok: true; reply: string; provider: string }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You are an SEO assistant embedded in the user's local SEO tool.
You have read access to a snapshot of their data (provided in <context>).

Style:
- Plain language. Direct. Short paragraphs. Use bullets where helpful.
- When you reference a fact, ground it in the data — name the client, the score, the keyword, etc.
- If the user asks about something you don't have data for, say so plainly.
- Never invent numbers. If a metric isn't in the context, say "I don't have that data — try connecting GSC or running an audit first."
- For SEO advice, prefer Google's confirmed guidance over folklore. Skip "keyword density" and similar myths.
- Don't pad. 4 short sentences usually beats a wall of text.`;

async function loadContext(): Promise<string> {
  const lines: string[] = [];

  // Clients overview
  const clientList = await db
    .select({
      id: clients.id,
      name: clients.name,
      url: clients.url,
      niche: clients.niche,
      techStack: clients.techStack,
    })
    .from(clients)
    .limit(20);
  if (clientList.length === 0) {
    lines.push("No clients added yet.");
  } else {
    lines.push(`# Clients (${clientList.length})`);
    for (const c of clientList) {
      lines.push(
        `- ${c.name} · ${c.url} · niche=${c.niche ?? "—"} · stack=[${(c.techStack ?? []).join(", ")}]`,
      );
    }
  }

  // Recent audits
  const recentAudits = await db
    .select({
      id: audits.id,
      clientName: clients.name,
      score: audits.score,
      issuesCount: audits.issuesCount,
      status: audits.status,
      completedAt: audits.completedAt,
    })
    .from(audits)
    .leftJoin(clients, eq(audits.clientId, clients.id))
    .orderBy(desc(audits.createdAt))
    .limit(8);
  if (recentAudits.length > 0) {
    lines.push(`\n# Recent audits`);
    for (const a of recentAudits) {
      lines.push(
        `- audit#${a.id} · ${a.clientName ?? "—"} · score=${a.score ?? "—"} · ${a.issuesCount} issues · ${a.status} · ${a.completedAt?.toLocaleDateString() ?? "—"}`,
      );
    }
  }

  // Top issues from latest audits per client
  const topIssues = await db
    .select({
      type: auditIssues.type,
      severity: auditIssues.severity,
      message: auditIssues.message,
      url: auditIssues.url,
    })
    .from(auditIssues)
    .where(ne(auditIssues.status, "resolved"))
    .orderBy(desc(auditIssues.createdAt))
    .limit(15);
  if (topIssues.length > 0) {
    lines.push(`\n# Recent open issues (from audits)`);
    for (const i of topIssues) {
      lines.push(`- [${i.severity}] ${i.type}: ${i.message.slice(0, 120)}`);
    }
  }

  // Open tasks summary
  const [{ value: openTaskCount }] = await db
    .select({ value: count() })
    .from(tasks)
    .where(ne(tasks.status, "done"));
  const topOpenTasks = await db
    .select({
      title: tasks.title,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      clientName: clients.name,
    })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .where(ne(tasks.status, "done"))
    .orderBy(desc(tasks.createdAt))
    .limit(10);
  if (openTaskCount > 0) {
    lines.push(`\n# Open tasks (${openTaskCount} total, top 10)`);
    for (const t of topOpenTasks) {
      lines.push(
        `- [${t.priority}] ${t.title} · ${t.clientName ?? "—"}${t.dueDate ? ` · due ${t.dueDate.toLocaleDateString()}` : ""}`,
      );
    }
  }

  // Tracked keywords with latest position
  const allKw = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      country: keywords.country,
      clientName: clients.name,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .limit(30);
  const allRankings = await db
    .select({
      keywordId: keywordRankings.keywordId,
      position: keywordRankings.position,
      checkedAt: keywordRankings.checkedAt,
    })
    .from(keywordRankings)
    .orderBy(keywordRankings.checkedAt);
  const latestPos = new Map<number, number | null>();
  for (const r of allRankings) latestPos.set(r.keywordId, r.position);
  if (allKw.length > 0) {
    lines.push(`\n# Tracked keywords (${allKw.length})`);
    for (const k of allKw.slice(0, 20)) {
      const pos = latestPos.get(k.id);
      lines.push(
        `- "${k.query}" · ${k.country} · ${k.clientName ?? "—"} · latest pos=${pos ?? "—"}`,
      );
    }
  }

  // Recent page changes
  const recentChanges = await db
    .select({
      field: pageChanges.field,
      oldValue: pageChanges.oldValue,
      newValue: pageChanges.newValue,
      detectedAt: pageChanges.detectedAt,
      url: monitoredPages.url,
      clientName: clients.name,
    })
    .from(pageChanges)
    .leftJoin(
      monitoredPages,
      eq(pageChanges.monitoredPageId, monitoredPages.id),
    )
    .leftJoin(clients, eq(monitoredPages.clientId, clients.id))
    .orderBy(desc(pageChanges.detectedAt))
    .limit(8);
  if (recentChanges.length > 0) {
    lines.push(`\n# Recent page changes`);
    for (const c of recentChanges) {
      if (c.field === "content") continue;
      lines.push(
        `- ${c.field} on ${c.url}: "${(c.oldValue ?? "—").slice(0, 50)}" → "${(c.newValue ?? "—").slice(0, 50)}"`,
      );
    }
  }

  return lines.join("\n");
}

const MAX_CONTEXT_CHARS = 8_000;

// All four OpenAI-compat providers + Anthropic share one helper each.
// SYSTEM_PROMPT + context is built once and passed as the `system` field.

function buildSystem(context: string): string {
  return `${SYSTEM_PROMPT}\n\n<context>\n${context.slice(0, MAX_CONTEXT_CHARS)}\n</context>`;
}

async function callAnthropic(
  apiKey: string,
  context: string,
  history: ChatMessage[],
): Promise<string | null> {
  return sharedCallAnthropic({
    apiKey,
    system: buildSystem(context),
    messages: history,
    maxTokens: 800,
    temperature: 0.3,
    timeoutMs: 30_000,
    caller: "assistant",
  });
}

async function callOpenAI(
  apiKey: string,
  context: string,
  history: ChatMessage[],
): Promise<string | null> {
  return sharedCallOpenAICompat({
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKey,
    model: "gpt-4o-mini",
    system: buildSystem(context),
    messages: history,
    maxTokens: 800,
    temperature: 0.3,
    timeoutMs: 30_000,
    caller: "assistant",
  });
}

async function callOllama(
  baseUrl: string,
  context: string,
  history: ChatMessage[],
): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 60_000);
  try {
    const models = ["llama3.2", "llama3.1", "mistral", "phi3"];
    for (const model of models) {
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          signal: c.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              {
                role: "system",
                content: `${SYSTEM_PROMPT}\n\n<context>\n${context.slice(0, MAX_CONTEXT_CHARS)}\n</context>`,
              },
              ...history.map((m) => ({
                role: m.role,
                content: m.content,
              })),
            ],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            message?: { content?: string };
          };
          const text = data.message?.content?.trim();
          if (text && text.length > 0) return text;
        }
      } catch {
        /* try next model */
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function chat(history: ChatMessage[]): Promise<ChatResult> {
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return { ok: false, error: "No user message to respond to." };
  }

  const context = await loadContext();
  const { getActiveProvider, getApiKey, getOllamaUrl } = await import(
    "@/lib/api-keys"
  );

  const active = await getActiveProvider();
  if (!active) {
    return {
      ok: false,
      error:
        "No active AI provider. Open Settings → AI provider, configure a free Gemini or Groq key, then pick it as active.",
    };
  }

  try {
    if (active === "gemini") {
      const k = await getApiKey("gemini");
      if (k) {
        const r = await callGemini(k, context, history);
        if (r) return { ok: true, reply: r, provider: "Gemini" };
      }
    } else if (active === "groq") {
      const k = await getApiKey("groq");
      if (k) {
        const r = await callGroq(k, context, history);
        if (r) return { ok: true, reply: r, provider: "Groq" };
      }
    } else if (active === "anthropic") {
      const k = await getApiKey("anthropic");
      if (k) {
        const r = await callAnthropic(k, context, history);
        if (r) return { ok: true, reply: r, provider: "Anthropic" };
      }
    } else if (active === "openai") {
      const k = await getApiKey("openai");
      if (k) {
        const r = await callOpenAI(k, context, history);
        if (r) return { ok: true, reply: r, provider: "OpenAI" };
      }
    } else if (active === "openrouter") {
      const k = await getApiKey("openrouter");
      if (k) {
        const r = await callOpenRouter(k, context, history);
        if (r) return { ok: true, reply: r, provider: "OpenRouter" };
      }
    } else if (active === "ollama") {
      const url = await getOllamaUrl();
      const r = await callOllama(url, context, history);
      if (r) return { ok: true, reply: r, provider: "Ollama (local)" };
    }
  } catch {
    /* fall through */
  }

  return {
    ok: false,
    error: `Active provider "${active}" didn't respond. Check the key in Settings or pick a different provider as active.`,
  };
}

async function callGemini(
  apiKey: string,
  context: string,
  history: ChatMessage[],
): Promise<string | null> {
  return sharedCallGemini({
    apiKey,
    system: `${SYSTEM_PROMPT}\n\n<context>\n${context.slice(0, MAX_CONTEXT_CHARS)}\n</context>`,
    messages: history,
    maxTokens: 800,
    temperature: 0.3,
    timeoutMs: 30_000,
    caller: "assistant",
  });
}

async function callGroq(
  apiKey: string,
  context: string,
  history: ChatMessage[],
): Promise<string | null> {
  return sharedCallOpenAICompat({
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model: "llama-3.3-70b-versatile",
    system: buildSystem(context),
    messages: history,
    maxTokens: 800,
    temperature: 0.3,
    timeoutMs: 30_000,
    caller: "assistant",
  });
}

async function callOpenRouter(
  apiKey: string,
  context: string,
  history: ChatMessage[],
): Promise<string | null> {
  return sharedCallOpenAICompat({
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model: "meta-llama/llama-3.3-70b-instruct:free",
    system: buildSystem(context),
    messages: history,
    maxTokens: 800,
    temperature: 0.3,
    timeoutMs: 30_000,
    extraHeaders: { "x-title": "SEO Tool" },
    caller: "assistant",
  });
}
