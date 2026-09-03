import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { getSetting } from "@/lib/settings-store";

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

/**
 * Refuses a cross-origin browser request.
 *
 * The transport spec makes this a MUST: "Servers MUST validate the Origin
 * header on all incoming connections to prevent DNS rebinding attacks."
 * Without it, a page the user happens to be visiting can rebind DNS to
 * 127.0.0.1 and POST to this endpoint from their browser — and the
 * browser attaches no Origin restriction of its own.
 *
 * A real MCP client sends no Origin header at all (it is not a browser),
 * so absent is allowed; only a *mismatched* one is refused. This matters
 * because the dev server binds every interface, not just loopback, so the
 * endpoint is reachable from the local network too.
 */
function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // not a browser — the normal case for MCP
  const host = req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function authorize(req: Request): Promise<Response | null> {
  if (!originAllowed(req)) {
    return new NextResponse("Forbidden: cross-origin request refused", {
      status: 403,
    });
  }

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
    // Deliberately a plain Bearer challenge, with no `resource_metadata`
    // pointer.
    //
    // The MCP authorization spec requires that pointer — but of servers
    // that implement OAuth, and this one does not. Authorization is
    // OPTIONAL in MCP, and this uses a static bearer token, which is the
    // mode Anthropic calls `static_headers`. Advertising
    // resource_metadata here would send a client to a discovery document
    // that cannot name an authorization server, because there is no
    // authorization server: a promise of an OAuth flow that does not
    // exist, which fails later and less clearly than not promising it.
    //
    // If OAuth 2.1 + DCR is built later, this is where the pointer goes,
    // alongside /.well-known/oauth-protected-resource.
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="seo-tool"' },
    });
  }
  return null;
}

async function handle(req: Request): Promise<Response> {
  const denied = await authorize(req);
  if (denied) return denied;
  // Contact is recorded by the shared server on tools/list and
  // tools/call — one writer, and it fires for stdio clients too.

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless — see the note above.
    sessionIdGenerator: undefined,
    // Plain JSON responses rather than an SSE stream. These tools return
    // one result each; nothing here streams partial output, and JSON is
    // far easier for a proxy or tunnel in front of this to carry intact.
    enableJsonResponse: true,
  });

  const server = createMcpServer(req.headers.get("user-agent") ?? "remote client");
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
