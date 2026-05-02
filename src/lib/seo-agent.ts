import { eq, desc, and, inArray } from "drizzle-orm";
import { db } from "./../db/client";
import {
  clients,
  audits,
  auditIssues,
  aiSuggestions,
  type NewAiSuggestion,
  type Client,
} from "./../db/schema";
import { callAI } from "./ai-call";
import {
  getGscTopQueries,
  getGscQuickWins,
  type GscKeyword,
} from "./google-data";
import { logActivity } from "./activity";

/**
 * The SEO agent — runs once per click (or scheduled), pulls every signal we
 * have on a client, asks the user's active LLM for concrete actionable fixes,
 * and writes them as `ai_suggestions` rows the user can apply or dismiss.
 *
 * Designed to do the boring repetitive work an SEO would do manually:
 * rewriting bad titles, drafting meta descriptions, picking quick-win
 * improvements, and proposing internal links.
 */

export type AgentRunResult =
  | { ok: true; created: number; reused: number }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You are an autonomous SEO agent. You analyze a client's site, their audit findings, and their real Search Console data, then output a concrete, prioritized to-do list as STRICT JSON.

## Output rules (non-negotiable)

Return ONLY a single JSON array. No prose, no preamble, no markdown fences. Each element is an object with:

- "type": one of "title_rewrite" | "meta_description_rewrite" | "quick_win_action" | "content_idea" | "internal_link" | "schema_markup" | "h1_rewrite" | "general"
- "priority": "high" | "medium" | "low"
- "targetUrl": string or null — the page this applies to, when known. Use null for general suggestions.
- "currentValue": string or null — the current title/meta/H1 if you're rewriting it. Use null for new content.
- "suggestedValue": string (REQUIRED) — the actual new text, action, or content to use. Concrete, not abstract.
- "rationale": string — 1-2 sentences explaining WHY. Reference real data when possible (e.g. "Currently ranks position 6 for 'X' with 1.2k impressions").

## Quality bar

- BE SPECIFIC. "Improve the title" is bad. "Rewrite from 'Home - Acme' to 'Sustainable Coffee Subscriptions | Acme — Free Shipping'" is good.
- Title rewrites: ≤60 chars, primary keyword near the front, brand at the end.
- Meta description rewrites: ≤160 chars, must include primary keyword + a value prop or hook.
- Quick win actions: cite the keyword + current position, propose a SPECIFIC tweak (add an FAQ section answering X, expand the section about Y with a comparison table, change H2 to "Z" so it matches search intent).
- Content ideas: include the target keyword and a strong angle, not just the topic.
- Internal links: suggest the source page and the target page when both are known.

## Strict avoid

- Don't repeat suggestions across rows.
- Don't propose generic things like "improve speed", "add alt text", "use more keywords" — those belong in the audit, not the agent.
- Don't suggest features the user can't act on (e.g., "buy more backlinks").
- Don't include AI-tells in the suggestedValue text: "delve", "tapestry", "in conclusion", em-dash overuse.

Cap at 12 suggestions. Sort by priority high → low.`;

type AgentSignals = {
  client: Client;
  recentAuditIssues: { type: string; message: string; severity: string; url: string }[];
  topQueries: GscKeyword[];
  quickWins: GscKeyword[];
};

export async function runSeoAgent(
  clientId: number,
): Promise<AgentRunResult> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };

  // Pull all the signals we'll feed to the model.
  const signals = await collectSignals(client);

  if (
    signals.recentAuditIssues.length === 0 &&
    signals.topQueries.length === 0 &&
    signals.quickWins.length === 0
  ) {
    return {
      ok: false,
      error:
        "Not enough data yet. Run an audit and/or connect Google Search Console first — the agent needs real signals to work with.",
    };
  }

  const userPrompt = buildUserPrompt(signals);

  const raw = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 3000,
    temperature: 0.5,
    timeoutMs: 60_000,
  });

  if (!raw) {
    return {
      ok: false,
      error:
        "The active AI provider didn't respond. Check Settings → AI provider keys.",
    };
  }

  let suggestions: ParsedSuggestion[];
  try {
    suggestions = parseSuggestions(raw);
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't parse model output: ${(err as Error).message}`,
    };
  }

  if (suggestions.length === 0) {
    return {
      ok: false,
      error: "The model returned no actionable suggestions.",
    };
  }

  // Don't duplicate suggestions we already have for this client (de-dupe by
  // type + targetUrl + suggestedValue).
  const existing = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.clientId, clientId));
  const existingKeys = new Set(
    existing.map((e) => suggestionKey(e.type, e.targetUrl, e.suggestedValue)),
  );

  const toInsert: NewAiSuggestion[] = [];
  let reused = 0;
  for (const s of suggestions) {
    const key = suggestionKey(s.type, s.targetUrl ?? null, s.suggestedValue);
    if (existingKeys.has(key)) {
      reused += 1;
      continue;
    }
    toInsert.push({
      clientId,
      type: s.type,
      priority: s.priority,
      targetUrl: s.targetUrl ?? null,
      currentValue: s.currentValue ?? null,
      suggestedValue: s.suggestedValue,
      rationale: s.rationale ?? null,
      source: "agent",
      status: "new",
    });
    existingKeys.add(key);
  }

  if (toInsert.length > 0) {
    await db.insert(aiSuggestions).values(toInsert);
  }

  await logActivity({
    kind: "report.generated",
    message: `AI agent generated ${toInsert.length} suggestions for ${client.name}.`,
    level: "success",
    clientId,
    entityType: "client",
    entityId: clientId,
  });

  return { ok: true, created: toInsert.length, reused };
}

async function collectSignals(client: Client): Promise<AgentSignals> {
  // Latest completed audit + its issues
  const [latest] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, client.id), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt))
    .limit(1);

  let issues: AgentSignals["recentAuditIssues"] = [];
  if (latest) {
    const rows = await db
      .select()
      .from(auditIssues)
      .where(
        and(
          eq(auditIssues.auditId, latest.id),
          inArray(auditIssues.status, ["new"]),
        ),
      )
      .orderBy(desc(auditIssues.severity));
    issues = rows.slice(0, 30).map((i) => ({
      type: i.type,
      message: i.message,
      severity: i.severity,
      url: i.url,
    }));
  }

  // GSC signals (best-effort — return empty on failure)
  let topQueries: GscKeyword[] = [];
  let quickWins: GscKeyword[] = [];
  if (client.gscProperty) {
    [topQueries, quickWins] = await Promise.all([
      getGscTopQueries({
        siteUrl: client.gscProperty,
        days: 28,
        limit: 15,
      }).catch(() => []),
      getGscQuickWins({
        siteUrl: client.gscProperty,
        days: 28,
        limit: 10,
        minImpressions: 50,
      }).catch(() => []),
    ]);
  }

  return {
    client,
    recentAuditIssues: issues,
    topQueries,
    quickWins,
  };
}

function buildUserPrompt(signals: AgentSignals): string {
  const lines: string[] = [];

  lines.push("# Client context");
  lines.push(`Name: ${signals.client.name}`);
  lines.push(`URL: ${signals.client.url}`);
  if (signals.client.niche) lines.push(`Niche: ${signals.client.niche}`);
  if (signals.client.description)
    lines.push(`About: ${signals.client.description}`);
  if (signals.client.techStack?.length)
    lines.push(`Tech stack: ${signals.client.techStack.join(", ")}`);
  lines.push("");

  if (signals.recentAuditIssues.length > 0) {
    lines.push("# Audit findings (latest run)");
    for (const i of signals.recentAuditIssues) {
      lines.push(
        `- [${i.severity}] ${i.type} on ${i.url}: ${i.message}`,
      );
    }
    lines.push("");
  }

  if (signals.topQueries.length > 0) {
    lines.push("# Top organic queries (Search Console, last 28 days)");
    for (const q of signals.topQueries) {
      lines.push(
        `- "${q.query}" — ${q.clicks} clicks, ${q.impressions} impressions, position ${q.position.toFixed(1)}, CTR ${(q.ctr * 100).toFixed(1)}%`,
      );
    }
    lines.push("");
  }

  if (signals.quickWins.length > 0) {
    lines.push("# Quick-win opportunities (positions 4-15 with traffic)");
    for (const q of signals.quickWins) {
      lines.push(
        `- "${q.query}" — position ${q.position.toFixed(1)}, ${q.impressions} impressions, ${q.clicks} clicks, CTR ${(q.ctr * 100).toFixed(1)}%`,
      );
    }
    lines.push("");
  }

  lines.push(
    "Generate the prioritized JSON suggestion array now. JSON only.",
  );
  return lines.join("\n");
}

type ParsedSuggestion = {
  type: NewAiSuggestion["type"];
  priority: NewAiSuggestion["priority"];
  targetUrl?: string | null;
  currentValue?: string | null;
  suggestedValue: string;
  rationale?: string | null;
};

const VALID_TYPES = new Set<NewAiSuggestion["type"]>([
  "title_rewrite",
  "meta_description_rewrite",
  "quick_win_action",
  "content_idea",
  "internal_link",
  "schema_markup",
  "h1_rewrite",
  "general",
]);

function parseSuggestions(raw: string): ParsedSuggestion[] {
  // Strip markdown fences if the model added them despite instructions
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error("Output was not a JSON array");
  }

  const out: ParsedSuggestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = String(o.type ?? "") as NewAiSuggestion["type"];
    if (!VALID_TYPES.has(type)) continue;
    const suggestedValue = String(o.suggestedValue ?? "").trim();
    if (!suggestedValue) continue;
    const priorityRaw = String(o.priority ?? "medium").toLowerCase();
    const priority: NewAiSuggestion["priority"] = (
      ["high", "medium", "low"] as const
    ).includes(priorityRaw as "high" | "medium" | "low")
      ? (priorityRaw as NewAiSuggestion["priority"])
      : "medium";
    out.push({
      type,
      priority,
      targetUrl:
        typeof o.targetUrl === "string" && o.targetUrl.trim()
          ? o.targetUrl.trim()
          : null,
      currentValue:
        typeof o.currentValue === "string" && o.currentValue.trim()
          ? o.currentValue.trim()
          : null,
      suggestedValue,
      rationale:
        typeof o.rationale === "string" && o.rationale.trim()
          ? o.rationale.trim()
          : null,
    });
  }
  return out.slice(0, 24); // hard ceiling
}

function suggestionKey(
  type: string,
  targetUrl: string | null | undefined,
  suggestedValue: string,
): string {
  return `${type}|${targetUrl ?? ""}|${suggestedValue.slice(0, 200)}`;
}
