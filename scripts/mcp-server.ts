/**
 * The stdio entry point for the MCP server.
 *
 * Serves local clients that can spawn a process — Claude Desktop, Claude
 * Code, Cursor. stdio is the safest transport for those: the connection is
 * a pipe to a child process, so the only thing that can talk to it is the
 * person who launched it.
 *
 * Remote clients — the claude.ai and ChatGPT connectors — cannot spawn a
 * process, so they are served over Streamable HTTP by /api/mcp instead.
 * Both transports build the same server from src/lib/mcp/server.ts; the
 * tool list used to live here, where the route could not import it.
 *
 * Configure it in a local MCP client with:
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
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../src/lib/mcp/server";

async function main() {
  await createMcpServer("stdio (Claude Desktop / Cursor)").connect(
    new StdioServerTransport(),
  );
  // stderr, never stdout — stdout is the protocol channel.
  console.error("seo-tool MCP server ready on stdio");
}

main().catch((err) => {
  console.error("seo-tool MCP server failed to start:", err);
  process.exit(1);
});
