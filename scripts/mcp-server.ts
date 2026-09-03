#!/usr/bin/env node
/**
 * MCP server — lets Claude Code, Claude Desktop, Cursor or any other MCP
 * client work directly against this install's data.
 *
 * Transport is stdio, so the client spawns this process locally and
 * there is no port, no network surface and no second authentication
 * story: it runs as whoever owns the database file, and that is exactly
 * the person allowed to read it. An HTTP transport would need its own
 * auth, and getting that wrong on a process that can edit live websites
 * is not a trade worth making for convenience.
 *
 * Configure it in an MCP client with:
 *
 *   {
 *     "mcpServers": {
 *       "seo-tool": {
 *         "command": "npx",
 *         "args": ["tsx", "scripts/mcp-server.ts"],
 *         "cwd": "/path/to/this/repo",
 *         "env": { "SEO_DB_PATH": "/path/to/data.db" }
 *       }
 *     }
 *   }
 *
 * NOTHING may be written to stdout except protocol messages. A stray
 * console.log corrupts the JSON-RPC stream and the client sees a parse
 * error rather than a useful failure, so all diagnostics go to stderr.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  revertAgentActionById,
  runAgent,
  type McpToolResult,
} from "../src/lib/mcp/tools";

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
    handler: (a: { actionId: number }) => revertAgentActionById(a.actionId),
  },
];

const server = new Server(
  { name: "seo-tool", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `No such tool: ${req.params.name}` }],
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
          text: `The SEO tool couldn't answer that: ${message}\n\nIf this mentions a missing table, run "pnpm db:migrate" in the tool's directory.`,
        },
      ],
    };
  }

  if (!result.ok) {
    return { isError: true, content: [{ type: "text" as const, text: result.error }] };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
  };
});

async function main() {
  await server.connect(new StdioServerTransport());
  // stderr, never stdout — stdout is the protocol channel.
  console.error("seo-tool MCP server ready on stdio");
}

main().catch((err) => {
  console.error("seo-tool MCP server failed to start:", err);
  process.exit(1);
});
