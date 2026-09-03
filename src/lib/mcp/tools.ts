/**
 * What this tool exposes to an AI assistant over MCP.
 *
 * The point isn't to be another Search Console wrapper — there are a
 * dozen of those. It's that this install already holds a *joined*
 * history: crawl findings, rank movements from two different sources,
 * AI-citation checks, and a log of every change the agent made to the
 * live site. Answering "why did this page drop" needs all of that in one
 * place, and that is what we have and a single-API wrapper doesn't.
 *
 * Two rules run through every handler here.
 *
 * **Provenance travels with the number.** Every row that came from
 * somewhere says where, and how old it is. A model handed a bare "12"
 * will confidently call it today's Google position; it might be a
 * three-week-old scrape from our IP, or an impression-weighted average
 * from GSC, and those are not the same claim. The UI already carries
 * this (`ConfidenceBadge`, `FreshnessBadge`, `source` on rankings) and
 * dropping it at the MCP boundary would undo that work at exactly the
 * moment it matters most.
 *
 * **Writing reuses the agent's gates, it does not invent new ones.**
 * There is deliberately no `set_title` tool. The only way to change a
 * site from here is to ask the agent to run, which means autonomy
 * levels, per-run and per-day caps, cooldowns, risk classification and
 * the recorded undo all still apply. A second permission system would
 * be a second thing to get wrong, on the path that edits live websites.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  agentActions,
  agentRuns,
  aiVisibilityChecks,
  auditIssues,
  audits,
  clients,
  keywordRankings,
  keywords,
} from "@/db/schema";

export type McpToolResult = { ok: true; data: unknown } | { ok: false; error: string };

/** How stale something is, in words rather than a raw timestamp. */
function freshness(at: Date | null | undefined): string {
  if (!at) return "unknown age";
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * What a rank number actually is.
 *
 * These are not interchangeable and a model must not average them. GSC
 * is an impression-weighted daily average across everyone who saw the
 * result; a scrape is one position our IP was shown at one moment.
 */
function rankProvenance(source: string): string {
  return source === "gsc"
    ? "Google Search Console — impression-weighted average position for the day, across real searchers"
    : "browser scrape — the position this server was shown at one moment, from one location";
}

async function resolveClient(clientId: number) {
  const [c] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  return c ?? null;
}

// =====================================================================
// Read tools
// =====================================================================

export async function listClients(): Promise<McpToolResult> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      url: clients.url,
      niche: clients.niche,
    })
    .from(clients)
    .orderBy(clients.name);

  if (rows.length === 0) {
    return {
      ok: true,
      data: {
        clients: [],
        note: "No sites are set up in this install yet. Add one in the web UI before asking for data about it.",
      },
    };
  }
  return { ok: true, data: { clients: rows } };
}

export async function getClientOverview(clientId: number): Promise<McpToolResult> {
  const client = await resolveClient(clientId);
  if (!client) return { ok: false, error: `No client with id ${clientId}.` };

  const [latestAudit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "completed")))
    .orderBy(desc(audits.id))
    .limit(1);

  const severityCounts = latestAudit
    ? await db
        .select({
          severity: auditIssues.severity,
          n: sql<number>`count(*)`,
        })
        .from(auditIssues)
        .where(
          and(
            eq(auditIssues.auditId, latestAudit.id),
            eq(auditIssues.status, "new"),
          ),
        )
        .groupBy(auditIssues.severity)
    : [];

  const trackedKeywords = await db
    .select({ n: sql<number>`count(*)` })
    .from(keywords)
    .where(eq(keywords.clientId, clientId));

  return {
    ok: true,
    data: {
      client: { id: client.id, name: client.name, url: client.url },
      audit: latestAudit
        ? {
            score: latestAudit.score,
            pagesCrawled: latestAudit.pagesCrawled,
            openIssuesBySeverity: Object.fromEntries(
              severityCounts.map((s) => [s.severity, s.n]),
            ),
            ranAt: latestAudit.completedAt,
            freshness: freshness(latestAudit.completedAt),
            provenance:
              latestAudit.pagesCrawled === null
                ? "Page count unknown — this audit predates the column that records it. Do not infer a crawl size."
                : `Our own crawler, ${latestAudit.pagesCrawled} pages.`,
          }
        : {
            note: "No completed audit for this client yet. Anything about its technical health would be a guess.",
          },
      keywordsTracked: trackedKeywords[0]?.n ?? 0,
      searchConsoleConnected: Boolean(client.gscProperty),
      cmsConnected: Boolean(client.wpEndpoint),
    },
  };
}

export async function listAuditIssues(opts: {
  clientId: number;
  severity?: string;
  type?: string;
  limit?: number;
}): Promise<McpToolResult> {
  const client = await resolveClient(opts.clientId);
  if (!client) return { ok: false, error: `No client with id ${opts.clientId}.` };

  const [latestAudit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, opts.clientId), eq(audits.status, "completed")))
    .orderBy(desc(audits.id))
    .limit(1);

  if (!latestAudit) {
    return {
      ok: true,
      data: {
        issues: [],
        note: "No completed audit for this client. Run one in the web UI first.",
      },
    };
  }

  const filters = [
    eq(auditIssues.auditId, latestAudit.id),
    eq(auditIssues.status, "new"),
  ];
  if (opts.severity) filters.push(eq(auditIssues.severity, opts.severity as never));
  if (opts.type) filters.push(eq(auditIssues.type, opts.type));

  const rows = await db
    .select({
      type: auditIssues.type,
      severity: auditIssues.severity,
      url: auditIssues.url,
      message: auditIssues.message,
    })
    .from(auditIssues)
    .where(and(...filters))
    .limit(Math.min(opts.limit ?? 50, 200));

  return {
    ok: true,
    data: {
      issues: rows,
      auditRan: freshness(latestAudit.completedAt),
      provenance: "Our own crawler. Findings are rule-based, not model output.",
      // A truncated list read as a complete one is how "you have 12
      // issues" gets said about a site with 300.
      truncated: rows.length === Math.min(opts.limit ?? 50, 200),
    },
  };
}

export async function getKeywordRankings(opts: {
  clientId: number;
  days?: number;
  limit?: number;
}): Promise<McpToolResult> {
  const client = await resolveClient(opts.clientId);
  if (!client) return { ok: false, error: `No client with id ${opts.clientId}.` };

  const since = new Date(Date.now() - (opts.days ?? 30) * 86_400_000);

  const kws = await db
    .select({ id: keywords.id, query: keywords.query, country: keywords.country })
    .from(keywords)
    .where(eq(keywords.clientId, opts.clientId))
    .limit(Math.min(opts.limit ?? 50, 200));

  if (kws.length === 0) {
    return {
      ok: true,
      data: { keywords: [], note: "No keywords are tracked for this client." },
    };
  }

  const ranks = await db
    .select()
    .from(keywordRankings)
    .where(
      and(
        inArray(
          keywordRankings.keywordId,
          kws.map((k) => k.id),
        ),
        gte(keywordRankings.checkedAt, since),
      ),
    )
    .orderBy(desc(keywordRankings.checkedAt));

  const byKeyword = new Map<number, typeof ranks>();
  for (const r of ranks) {
    const list = byKeyword.get(r.keywordId) ?? [];
    list.push(r);
    byKeyword.set(r.keywordId, list);
  }

  return {
    ok: true,
    data: {
      keywords: kws.map((k) => {
        const history = byKeyword.get(k.id) ?? [];
        const latest = history[0];
        const oldest = history[history.length - 1];
        return {
          query: k.query,
          country: k.country,
          latestPosition: latest?.position ?? null,
          checkedAt: latest?.checkedAt ?? null,
          freshness: freshness(latest?.checkedAt),
          // Movement only where both ends came from the same source.
          // A "rise" that is really a switch from scrape to GSC is an
          // invented result, and it reads exactly like a real one.
          change:
            latest && oldest && latest.source === oldest.source && latest.position && oldest.position
              ? oldest.position - latest.position
              : null,
          changeNote:
            latest && oldest && latest.source !== oldest.source
              ? "Not comparable — the start and end of this window came from different sources."
              : undefined,
          source: latest?.source ?? null,
          provenance: latest ? rankProvenance(latest.source) : "never checked",
        };
      }),
    },
  };
}

export async function getAiVisibility(opts: {
  clientId: number;
  limit?: number;
}): Promise<McpToolResult> {
  const client = await resolveClient(opts.clientId);
  if (!client) return { ok: false, error: `No client with id ${opts.clientId}.` };

  const kws = await db
    .select({ id: keywords.id, query: keywords.query })
    .from(keywords)
    .where(eq(keywords.clientId, opts.clientId));
  if (kws.length === 0) {
    return { ok: true, data: { checks: [], note: "No keywords tracked." } };
  }

  const rows = await db
    .select()
    .from(aiVisibilityChecks)
    .where(
      inArray(
        aiVisibilityChecks.keywordId,
        kws.map((k) => k.id),
      ),
    )
    .orderBy(desc(aiVisibilityChecks.id))
    .limit(Math.min(opts.limit ?? 40, 100));

  return {
    ok: true,
    data: {
      checks: rows.map((r) => ({
        provider: r.provider,
        prompt: r.prompt,
        citations: r.citations ?? [],
        grounding: r.grounding,
        // The distinction most tools blur, and the one that decides
        // whether the answer means anything about AI *search*.
        groundingMeans:
          r.grounding === "live"
            ? "The model searched the web for this answer, so the citations are real fetched sources."
            : "The model answered from memory without searching. This says what it absorbed in training, not what AI search shows today.",
      })),
    },
  };
}

/**
 * Who AI assistants cite for this site's topics, and how often it isn't
 * the site itself.
 *
 * The question the dedicated GEO tools sell on. Grounded answers only —
 * see ai-citation-landscape.ts for why mixing in model-memory answers
 * produces a number that describes neither thing.
 */
export async function getCitationLandscape(opts: {
  clientId: number;
  limit?: number;
}): Promise<McpToolResult> {
  const client = await resolveClient(opts.clientId);
  if (!client) return { ok: false, error: `No client with id ${opts.clientId}.` };

  const kws = await db
    .select({ id: keywords.id })
    .from(keywords)
    .where(eq(keywords.clientId, opts.clientId));
  if (kws.length === 0) {
    return {
      ok: true,
      data: {
        note: "No keywords are tracked for this client, so no AI visibility checks exist to aggregate.",
      },
    };
  }

  const rows = await db
    .select({
      provider: aiVisibilityChecks.provider,
      prompt: aiVisibilityChecks.prompt,
      citations: aiVisibilityChecks.citations,
      grounding: aiVisibilityChecks.grounding,
    })
    .from(aiVisibilityChecks)
    .where(
      inArray(
        aiVisibilityChecks.keywordId,
        kws.map((k) => k.id),
      ),
    )
    .orderBy(desc(aiVisibilityChecks.id))
    .limit(Math.min(opts.limit ?? 300, 1000));

  const { summariseCitations } = await import("../ai-citation-landscape");
  const landscape = summariseCitations(
    rows.map((r) => ({
      provider: r.provider,
      prompt: r.prompt,
      citations: r.citations,
      grounding: r.grounding,
    })),
    client.url,
  );

  return { ok: true, data: landscape };
}

export async function listAgentActions(opts: {
  clientId: number;
  limit?: number;
}): Promise<McpToolResult> {
  const client = await resolveClient(opts.clientId);
  if (!client) return { ok: false, error: `No client with id ${opts.clientId}.` };

  const rows = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.clientId, opts.clientId))
    .orderBy(desc(agentActions.id))
    .limit(Math.min(opts.limit ?? 30, 100));

  return {
    ok: true,
    data: {
      actions: rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        status: a.status,
        targetUrl: a.targetUrl,
        reason: a.reason,
        before: a.beforeValue,
        after: a.afterValue,
        error: a.error,
        appliedAt: a.appliedAt,
        // Whether revert_agent_action would actually work, rather than
        // leaving the model to guess from the status.
        reversible:
          (a.status === "applied" || a.status === "verified") &&
          (a.cmsRevisionId !== null || (a.beforeValue !== null && Boolean(a.targetRef))),
      })),
    },
  };
}

// =====================================================================
// Write tools — everything goes through the agent's own gates
// =====================================================================

export async function runAgent(clientId: number): Promise<McpToolResult> {
  const client = await resolveClient(clientId);
  if (!client) return { ok: false, error: `No client with id ${clientId}.` };

  const { getAgentSettings } = await import("../agent/autonomy");
  const settings = await getAgentSettings();

  const { runAgentForClient } = await import("../agent/run");
  const result = await runAgentForClient({ clientId, trigger: "manual" });

  return {
    ok: true,
    data: {
      summary: result.summary,
      planned: result.planned,
      applied: result.applied,
      queued: result.queued,
      skipped: result.skipped,
      failed: result.failed,
      tasksCreated: result.tasksCreated,
      autonomyLevel: settings.level,
      // Says plainly why nothing was written, so "applied: 0" doesn't
      // read as a malfunction when it is the configured behaviour.
      autonomyMeans:
        settings.level === "off"
          ? "The agent is turned off. It planned nothing and changed nothing."
          : settings.level === "suggest"
            ? "Suggest-only: changes were proposed for a human to approve, and nothing was written to the live site. This is the default."
            : settings.level === "apply_safe"
              ? "Safe fixes were applied automatically; judgement calls, including anything that edits article text, were queued for review."
              : "All fixes were applied automatically, including ones that edit article content.",
    },
  };
}

export async function revertAgentActionById(
  actionId: number,
): Promise<McpToolResult> {
  const { revertAction } = await import("../agent/executor");
  const r = await revertAction(actionId);
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    data: { reverted: actionId, note: "The previous value was restored on the live site." },
  };
}

export async function getRecentAgentRuns(opts: {
  clientId: number;
  limit?: number;
}): Promise<McpToolResult> {
  const rows = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.clientId, opts.clientId))
    .orderBy(desc(agentRuns.id))
    .limit(Math.min(opts.limit ?? 10, 50));

  return {
    ok: true,
    data: {
      runs: rows.map((r) => ({
        id: r.id,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        mode: r.mode,
        summary: r.summary,
        error: r.error,
      })),
    },
  };
}

// =====================================================================
// Fixes the caller's own model writes
// =====================================================================

/**
 * Work the agent has decided on but has no words for.
 *
 * This is the whole point of connecting a subscription rather than
 * buying an API key. The agent still decides WHAT to change and WHY —
 * that comes from measurable audit findings, and no model is asked for
 * an opinion about it. What it cannot do without a model of its own is
 * write the replacement title. So it asks the caller's.
 *
 * The response carries the rules the text must satisfy, so a client can
 * meet them first time instead of guessing and being refused.
 */
export async function listProposedFixes(opts: {
  clientId: number;
  limit?: number;
}): Promise<McpToolResult> {
  const client = await resolveClient(opts.clientId);
  if (!client) return { ok: false, error: `No client with id ${opts.clientId}.` };

  const { draftRulesFor } = await import("../agent/executor");

  const rows = await db
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.clientId, opts.clientId),
        eq(agentActions.status, "proposed"),
      ),
    )
    .orderBy(desc(agentActions.id))
    .limit(Math.min(opts.limit ?? 20, 50));

  const awaiting = rows.filter((r) => r.afterValue === null);

  if (awaiting.length === 0) {
    return {
      ok: true,
      data: {
        fixes: [],
        note:
          rows.length > 0
            ? "Everything proposed already has text written and is waiting for approval in the app."
            : "Nothing is waiting. Run the agent first with run_agent — it finds the work; this tool is where you supply the wording.",
      },
    };
  }

  return {
    ok: true,
    data: {
      fixes: awaiting.map((r) => ({
        fixId: r.id,
        kind: r.kind,
        page: r.targetUrl,
        whyItNeedsChanging: r.reason,
        currentValue: r.beforeValue,
        // The same rules our own drafts are held to. A value that breaks
        // them is refused whoever wrote it.
        rules: draftRulesFor(r.kind) ?? "No specific rules for this kind.",
      })),
      howToApply:
        "Write the replacement, then call apply_fix with the fixId and your text. It is checked against the rules above, written to the site, read back to confirm, and recorded so it can be undone.",
    },
  };
}

/**
 * Apply text the caller's model wrote.
 *
 * Everything that makes a write safe stays on this side: the length and
 * quality rules, reading the previous value, verifying by reading the
 * page back, and recording the undo. The only thing that moved is where
 * the words came from.
 *
 * That matters because a model asked for a replacement title returns a
 * plausible one every time, including a 95-character one for a page
 * whose problem was that the title was too long. Trusting the caller to
 * self-police would reintroduce exactly the bug the agent's own
 * validation exists to prevent.
 */
export async function applyProposedFix(opts: {
  fixId: number;
  newValue: string;
}): Promise<McpToolResult> {
  const [row] = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.id, opts.fixId))
    .limit(1);

  if (!row) return { ok: false, error: `No proposed fix with id ${opts.fixId}.` };
  if (row.status !== "proposed") {
    return {
      ok: false,
      error: `That fix is "${row.status}", not waiting for text. Use list_proposed_fixes to see what is.`,
    };
  }
  if (row.afterValue !== null) {
    return {
      ok: false,
      error:
        "That fix already has text and is waiting for approval in the app — applying it from here would bypass that review.",
    };
  }

  const { validateDraftedValue, executeAction } = await import("../agent/executor");

  const checked = validateDraftedValue(row.kind, opts.newValue);
  if (!checked.ok) {
    return {
      ok: false,
      error: `${checked.error} Write a replacement that satisfies the rules and call apply_fix again.`,
    };
  }

  const client = await resolveClient(row.clientId);
  if (!client) return { ok: false, error: "That client no longer exists." };

  // Hand it to the same executor the scheduler uses. Reusing it is the
  // point: undo, verification and the CMS quirks are all handled there,
  // and a second write path would be a second thing to get wrong on the
  // one code path that edits live websites.
  const outcome = await executeAction({
    runId: row.runId,
    clientId: row.clientId,
    action: {
      kind: row.kind as never,
      targetUrl: row.targetUrl ?? "",
      reason: row.reason ?? "",
      risk: row.risk,
      weight: 0,
      currentValue: row.beforeValue,
      targetRef: row.targetRef ?? undefined,
    },
    newValue: checked.value,
    apply: true,
    siteName: client.name,
  });

  // The proposal has been acted on; executeAction wrote its own row.
  // Leaving this one "proposed" would offer the same fix again forever.
  await db
    .update(agentActions)
    .set({
      status: outcome.status === "failed" ? "failed" : "applied",
      afterValue: checked.value,
      error: outcome.error ?? null,
    })
    .where(eq(agentActions.id, opts.fixId));

  if (outcome.status === "failed") {
    return { ok: false, error: outcome.error ?? "The CMS rejected the change." };
  }

  return {
    ok: true,
    data: {
      applied: true,
      status: outcome.status,
      // "verified" means we read the page back and saw it. "applied"
      // means the CMS accepted it and the read-back didn't confirm —
      // usually a cache. The caller should not report these as the same.
      verified: outcome.status === "verified",
      wrote: checked.value,
      previousValue: row.beforeValue,
      undoWith: `revert_agent_action with actionId ${outcome.actionId}`,
    },
  };
}
