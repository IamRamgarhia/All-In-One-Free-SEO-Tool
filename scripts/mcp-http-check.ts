/**
 * Speaks real MCP over HTTP to the running app, the way a remote
 * connector would. Proves the /api/mcp route actually works rather than
 * merely compiling.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.MCP_URL ?? "http://localhost:63140/api/mcp";
const TOKEN = process.argv[2] ?? "";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}

async function main() {
  // 1. No token at all must be refused.
  const anon = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check("unauthenticated request is refused", anon.status === 401, `got ${anon.status}`);

  // 2. A wrong token must be refused too.
  const bad = await fetch(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer seo_mcp_wrong",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check("wrong token is refused", bad.status === 401, `got ${bad.status}`);

  // 3. A real client, with the real token, over the real transport.
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: "http-check", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  check("handshake completes", true);

  const tools = await client.listTools();
  check("tools/list returns 12 tools", tools.tools.length === 12, `got ${tools.tools.length}`);
  check(
    "tool names match the stdio server",
    tools.tools.some((t) => t.name === "list_clients") &&
      tools.tools.some((t) => t.name === "apply_fix"),
  );

  const res = await client.callTool({ name: "list_clients", arguments: {} });
  const text = (res.content as { type: string; text?: string }[])?.[0]?.text ?? "";
  check("tools/call list_clients returns data", !res.isError && text.length > 0,
    res.isError ? text.slice(0, 120) : "");
  check("returned JSON parses", (() => { try { JSON.parse(text); return true; } catch { return false; } })());

  const bogus = await client.callTool({ name: "no_such_tool", arguments: {} });
  check("unknown tool errors cleanly", bogus.isError === true);

  await client.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
