/**
 * The MCP server: its tool list, and the dispatch that runs them.
 *
 * This lives in src/ rather than scripts/ because it has two callers now.
 * The stdio entry point (scripts/mcp-server.ts) serves local clients —
 * Claude Desktop, Claude Code, Cursor. The route at /api/mcp serves remote
 * ones — the claude.ai and ChatGPT connectors, which cannot spawn a local
 * process and speak Streamable HTTP instead.
 *
 * Both build the same server from the same list. Keeping a second copy of
 * twelve tool schemas in scripts/ would have been the seventh duplicated
 * list in this repo, and the one whose drift would show up as a tool that
 * silently does not exist over one transport.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  applyProposedFix,
  getAiVisibility,
  getCitationLandscape,
  getClientOverview,
  getKeywordRankings,
  getRecentAgentRuns,
  listAgentActions,
  listAuditIssues,
  listClients,
  listProposedFixes,
  getClientKnowledge,
  getReviewBacklog,
  replyToReview,
  saveReviewDraft,
  logClientResearch,
  revertAgentActionById,
  updateClientKnowledge,
  runAgent,
  type McpToolResult,
} from "./tools";
const clientIdArg = {
  type: "object" as const,
  properties: {
    clientId: { type: "number", description: "Which site. Get ids from list_clients." },
  },
  required: ["clientId"],
};

const TOOLS = [
  {
    name: "list_clients",
    description:
      "List the websites managed in this SEO tool, with their ids. Call this first — every other tool takes a clientId.",
    inputSchema: { type: "object" as const, properties: {} },
    handler: () => listClients(),
  },
  {
    name: "get_client_overview",
    description:
      "Health summary for one site: latest audit score, open issues by severity, how many keywords are tracked, and whether Search Console and a CMS are connected. Says plainly when there is no audit rather than implying health.",
    inputSchema: clientIdArg,
    handler: (a: { clientId: number }) => getClientOverview(a.clientId),
  },
  {
    name: "list_audit_issues",
    description:
      "Technical SEO problems found by the most recent crawl of a site. Rule-based findings from our own crawler, not model output. Filterable by severity and issue type.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        severity: {
          type: "string",
          enum: ["critical", "high", "medium", "low"],
        },
        type: { type: "string", description: 'Issue type, e.g. "missing_title".' },
        limit: { type: "number", description: "Default 50, max 200." },
      },
      required: ["clientId"],
    },
    handler: (a: { clientId: number; severity?: string; type?: string; limit?: number }) =>
      listAuditIssues(a),
  },
  {
    name: "get_keyword_rankings",
    description:
      "Tracked keyword positions with movement over a window. Every row states its source — a Search Console average and a browser scrape are different measurements and must not be compared or averaged; movement is reported as null when the two ends of the window came from different sources.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        days: { type: "number", description: "Look-back window. Default 30." },
        limit: { type: "number", description: "Default 50, max 200." },
      },
      required: ["clientId"],
    },
    handler: (a: { clientId: number; days?: number; limit?: number }) =>
      getKeywordRankings(a),
  },
  {
    name: "get_ai_visibility",
    description:
      "Whether AI assistants cite this site for its tracked queries, and who they cite instead. Each check says whether the model actually searched the web ('live') or answered from training memory — only the former tells you anything about AI search today.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        limit: { type: "number", description: "Default 40, max 100." },
      },
      required: ["clientId"],
    },
    handler: (a: { clientId: number; limit?: number }) => getAiVisibility(a),
  },
  {
    name: "get_citation_landscape",
    description:
      "Which domains AI assistants cite for this site's tracked topics, ranked, with the site's own share. Answers 'who is being cited instead of me'. Counts only answers where the model actually searched the web, and states the sample size — a ranking drawn from three answers is labelled as such rather than presented as a share of voice.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        limit: { type: "number", description: "Checks to aggregate. Default 300." },
      },
      required: ["clientId"],
    },
    handler: (a: { clientId: number; limit?: number }) => getCitationLandscape(a),
  },
  {
    name: "list_agent_actions",
    description:
      "Changes the automated agent has made to a site, with before and after values, status, and whether each one can still be undone.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        limit: { type: "number", description: "Default 30, max 100." },
      },
      required: ["clientId"],
    },
    handler: (a: { clientId: number; limit?: number }) => listAgentActions(a),
  },
  {
    name: "get_recent_agent_runs",
    description: "Recent automated agent runs for a site, with their summaries.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        limit: { type: "number", description: "Default 10, max 50." },
      },
      required: ["clientId"],
    },
    handler: (a: { clientId: number; limit?: number }) => getRecentAgentRuns(a),
  },
  {
    name: "run_agent",
    description:
      "Ask the automated agent to work on a site now: find fixable problems, draft the fixes, and apply what the configured autonomy level permits. It cannot exceed that level from here — at the default 'suggest' setting nothing is written to the live site, and every applied change records an undo. The response states which level was in force and what that meant.",
    inputSchema: clientIdArg,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    handler: (a: { clientId: number }) => runAgent(a.clientId),
  },
  {
    name: "list_proposed_fixes",
    description:
      "Changes the agent has decided to make but has no wording for. Each one says what is wrong, why, the current value, and the rules your replacement must satisfy. Use this when the install has no AI key of its own: the agent decides WHAT to change from measurable audit findings, and you write the words. Run run_agent first if nothing is listed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        limit: { type: "number", description: "Default 20, max 50." },
      },
      required: ["clientId"],
    },
    handler: (a: { clientId: number; limit?: number }) => listProposedFixes(a),
  },
  {
    name: "apply_fix",
    description:
      "Apply wording you wrote to a fix from list_proposed_fixes. Your text is checked against the same rules the tool applies to its own drafts — a title still over the display limit is refused, whoever wrote it — then written to the site, read back to confirm it took effect, and recorded so it can be undone.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fixId: { type: "number", description: "From list_proposed_fixes." },
        newValue: {
          type: "string",
          description: "The replacement text. For schema, a JSON-LD object as a string.",
        },
      },
      required: ["fixId", "newValue"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    handler: (a: { fixId: number; newValue: string }) => applyProposedFix(a),
  },
  {
    name: "revert_agent_action",
    description:
      "Undo one change the agent made, restoring the previous value on the live site. Use list_agent_actions to find the id and to check it is still reversible.",
    inputSchema: {
      type: "object" as const,
      properties: {
        actionId: { type: "number", description: "From list_agent_actions." },
      },
      required: ["actionId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    handler: (a: { actionId: number }) => revertAgentActionById(a.actionId),
  },
  {
    name: "get_client_knowledge",
    description:
      "What is known about this business: what it sells, who it sells to, which pages matter, and what has already been looked into. Every part says where it came from — confirmed by a person, or read off the site — because a guess and a stated fact must not be treated alike. Call this before writing any copy or proposing keywords for a client.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number", description: "Which site. Get ids from list_clients." },
        researchLimit: { type: "number", description: "Log entries to return. Default 20, max 50." },
      },
      required: ["clientId"],
    },
    annotations: { readOnlyHint: true },
    handler: (a: { clientId: number; researchLimit?: number }) => getClientKnowledge(a),
  },
  {
    name: "update_client_knowledge",
    description:
      "Record what you established about the business, so the next session does not work it out again. Writes only the half a person owns — a scheduled crawl of the site can never overwrite it. Omitted fields are left alone; pass null to clear one. Write what you confirmed, not what you assumed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        businessOverview: {
          type: "string",
          description: "What the business does, in a sentence or two.",
        },
        audience: { type: "string", description: "Who it sells to." },
        notes: { type: "string", description: "Anything else that should not be re-derived." },
        keyPages: {
          type: "array",
          description: "Pages that matter, and why.",
          items: {
            type: "object",
            properties: { url: { type: "string" }, why: { type: "string" } },
            required: ["url"],
          },
        },
        by: { type: "string", description: "Who is writing this. Defaults to 'mcp'." },
      },
      required: ["clientId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: (a: Parameters<typeof updateClientKnowledge>[0]) => updateClientKnowledge(a),
  },
  {
    name: "log_client_research",
    description:
      "Note that something has been looked into, in one line, with what it concluded. Read back by get_client_knowledge. Three sessions asking the same question about the same client will otherwise re-run the same crawl and the same AI calls, and on an install with a spend cap that is the cap gone on work already done.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        summary: {
          type: "string",
          description: "What was looked into and what it concluded. One line.",
        },
        by: { type: "string", description: "Who looked. Defaults to 'mcp'." },
      },
      required: ["clientId", "summary"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    handler: (a: { clientId: number; summary: string; by?: string }) =>
      logClientResearch(a),
  },
  {
    name: "get_review_backlog",
    description:
      "Reviews on this client's Google Business Profile and which still need an answer, worst-rated first. Reads what has been pulled and stored, not Google — so it is the same queue the app shows, and it says plainly when nothing has ever been pulled. Distinguishes replies this tool sent from replies typed into Google's own app.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number", description: "Which site. Get ids from list_clients." },
        filter: {
          type: "string",
          enum: ["unanswered", "drafted", "answered", "all"],
          description: "Default 'unanswered'.",
        },
        limit: { type: "number", description: "Default 20, max 100." },
      },
      required: ["clientId"],
    },
    annotations: { readOnlyHint: true },
    handler: (a: {
      clientId: number;
      filter?: "unanswered" | "drafted" | "answered" | "all";
      limit?: number;
    }) => getReviewBacklog(a),
  },
  {
    name: "save_review_draft",
    description:
      "Store a reply for a person to read before it goes anywhere. Sends nothing. Use this rather than reply_to_review whenever you have not been asked to publish — a reply on Google is under the business's name and cannot be withdrawn.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        reviewId: { type: "string", description: "From get_review_backlog." },
        text: { type: "string", description: "The reply. Under 80 words." },
      },
      required: ["clientId", "reviewId", "text"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    handler: (a: { clientId: number; reviewId: string; text: string }) =>
      saveReviewDraft(a),
  },
  {
    name: "reply_to_review",
    description:
      "Publish a reply to one review. It appears on Google immediately, under the business's name, and cannot be withdrawn — only replaced. Ask the user before calling this. Never promise refunds, discounts or compensation, and never dispute the reviewer's account of what happened.",
    inputSchema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number" },
        reviewId: { type: "string", description: "From get_review_backlog." },
        text: { type: "string", description: "The reply. Under 80 words." },
      },
      required: ["clientId", "reviewId", "text"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    handler: (a: { clientId: number; reviewId: string; text: string }) =>
      replyToReview(a),
  },
];

/**
 * What each tool does to the world, for clients that gate on it.
 *
 * Everything here reads unless it says otherwise. Three tools do not:
 * `run_agent` and `apply_fix` change a live website, and
 * `revert_agent_action` changes it back. An assistant deciding whether
 * to ask permission has no way to tell those from a lookup unless we say
 * so, and "rewrote the homepage title without asking" is not a mistake
 * worth finding out about afterwards.
 *
 * `destructiveHint` is true only where the change overwrites something
 * that was there. An undo is recorded for every one of them, which makes
 * them reversible, not harmless.
 */
const DEFAULT_ANNOTATIONS = { readOnlyHint: true } as const;

/** Tool names and schemas, without the handlers. */
export const MCP_TOOL_LIST = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
  annotations: t.annotations ?? DEFAULT_ANNOTATIONS,
}));

/**
 * A configured server, ready to connect to any transport.
 *
 * A fresh instance per call: the Streamable HTTP transport is per-session,
 * and sharing one Server across concurrent sessions would cross their
 * request handlers.
 */
/**
 * Notes that a client actually used the server, whatever transport it
 * came in on.
 *
 * This is what the "connected" badge in Settings reads. It lived only in
 * the HTTP route at first, which meant a Claude Desktop or Cursor setup —
 * stdio, a child process that never touches /api/mcp — left the badge
 * reading "waiting for your chat app" forever while working perfectly.
 * The badge would have been wrong for the most common way to connect.
 *
 * Best-effort and silent: a failed write must never break a tool call,
 * and on stdio it must never write to stdout, which is the protocol
 * channel.
 */
async function noteContact(source: string): Promise<void> {
  try {
    const { setSetting } = await import("../settings-store");
    await setSetting("mcp.last_seen_at", new Date().toISOString());
    await setSetting("mcp.last_client", source);
  } catch {
    // Nothing to do, and nowhere safe to say so.
  }
}

/**
 * @param source How this server was reached, shown in Settings —
 *   e.g. "stdio (Claude Desktop / Cursor)" or a remote client's
 *   user-agent.
 */
export function createMcpServer(source = "unknown"): Server {
  const server = new Server(
    { name: "seo-tool", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  /**
   * Who is on the other end, in the client's own words.
   *
   * MCP clients identify themselves in `initialize`, so ask rather than
   * label by transport. "stdio (Claude Desktop / Cursor)" was true but
   * useless: it could not tell a real chat app from a test script that
   * happened to run, which is exactly the question the badge is asked.
   * Falls back to the transport when a client sends nothing.
   */
  function who(): string {
    const info = server.getClientVersion();
    if (!info?.name) return source;
    return info.version ? `${info.name} ${info.version}` : info.name;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Listing tools is the first thing every client does after the
    // handshake, so this is the earliest honest evidence of a connection.
    void noteContact(who());
    return { tools: MCP_TOOL_LIST };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    void noteContact(who());
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [
          { type: "text" as const, text: `No such tool: ${req.params.name}` },
        ],
      };
    }

    let result: McpToolResult;
    try {
      result = await tool.handler((req.params.arguments ?? {}) as never);
    } catch (err) {
      // A thrown error must come back as a readable message, not as a
      // dead connection. The commonest cause is an unmigrated or missing
      // database, which is worth saying out loud.
      const message = (err as Error).message ?? String(err);
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `The SEO tool couldn't answer that: ${message}

If this mentions a missing table, run "pnpm db:migrate" in the tool's directory.`,
          },
        ],
      };
    }

    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: result.error }],
      };
    }
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result.data, null, 2) },
      ],
    };
  });

  return server;
}
