import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { getSetting, setSetting } from "@/lib/settings-store";

/**
 * The MCP endpoint remote clients connect to.
 *
 * Local clients (Claude Desktop, Claude Code, Cursor) spawn
 * scripts/mcp-server.ts over stdio. The claude.ai and ChatGPT connectors
 * cannot spawn a process — they call a URL — so they need this. Both
 * serve the identical tool list from lib/mcp/server.ts.
 *
 * Auth is a bearer token, checked here rather than by the session
 * middleware: an MCP client sends `Authorization: Bearer <token>`, never
 * a browser cookie, so the session gate would reject every real call.
 * /api/mcp is in the middleware's PUBLIC_PATHS for that reason, which
 * makes the check below the only thing standing in front of an endpoint
 * that can read every client and apply fixes to live websites. It refuses
 * outright until a token exists — an unconfigured endpoint is closed, not
 * open.
 *
 * Stateless: a fresh Server and transport per request, no session id.
 * Sharing one Server across concurrent sessions would cross their request
 * handlers, and a single-user self-hosted tool has no reason to keep
 * per-session state between calls.
 */

// The DB and the MCP SDK are Node-only; this cannot run on the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compares in constant time.
 *
 * A plain `===` on a secret leaks its length and prefix through timing.
 * The endpoint is reachable by anyone who can reach the host, so the
 * comparison is worth doing properly.
 */
function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorize(req: Request): Promise<Response | null> {
  const expected = await getSetting<string>("mcp.access_token");
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Remote MCP is off. Turn it on in Settings → AI connection to generate a token.",
      },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !tokensMatch(token, expected)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      // Tells a spec-compliant client how to authenticate rather than
      // leaving it to guess at a bare 401.
      headers: { "WWW-Authenticate": 'Bearer realm="seo-tool"' },
    });
  }
  return null;
}

/**
 * Records that a client actually reached us.
 *
 * This is what the "connected" badge reads. A token existing proves only
 * that somebody pressed generate; this proves a chat app is on the other
 * end. Best-effort — a failed write must never fail the call.
 */
async function recordContact(req: Request): Promise<void> {
  try {
    await setSetting("mcp.last_seen_at", new Date().toISOString());
    const ua = req.headers.get("user-agent");
    if (ua) await setSetting("mcp.last_client", ua.slice(0, 200));
  } catch {
    // Non-fatal: the badge going stale is better than a dropped session.
  }
}

async function handle(req: Request): Promise<Response> {
  const denied = await authorize(req);
  if (denied) return denied;
  await recordContact(req);

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless — see the note above.
    sessionIdGenerator: undefined,
    // Plain JSON responses rather than an SSE stream. These tools return
    // one result each; nothing here streams partial output, and JSON is
    // far easier for a proxy or tunnel in front of this to carry intact.
    enableJsonResponse: true,
  });

  const server = createMcpServer();
  await server.connect(transport);

  try {
    return await transport.handleRequest(req);
  } finally {
    // The transport is per-request; leaving it connected would leak a
    // server instance for every call the endpoint ever serves.
    await server.close().catch(() => {});
  }
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

/**
 * GET is how a client opens the server-to-client stream. In stateless
 * JSON mode there is nothing to stream, so the transport answers it
 * correctly — 405 with an Allow header — rather than us guessing.
 */
export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(req);
}
