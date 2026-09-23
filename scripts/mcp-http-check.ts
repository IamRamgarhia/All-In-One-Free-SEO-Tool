/**
 * Speaks real MCP over HTTP to the running app, the way a remote
 * connector would. Proves the /api/mcp route actually works rather than
 * merely compiling.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
// The registered list, not a number typed here. This asserted "12 tools"
// while 22 were registered — a check that only fails once somebody adds
// a tool is a check that reports the wrong thing for months.
import { MCP_TOOL_LIST, READ_ONLY_TOOLS } from "../src/lib/mcp/server";

const URL_ = process.env.MCP_URL ?? "http://localhost:63140/api/mcp";
const TOKEN = process.argv[2] ?? "";
/** Optional second argument: the read-only token, checked if given. */
const READ_ONLY_TOKEN = process.argv[3] ?? "";

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
  const expected = MCP_TOOL_LIST.map((t) => t.name).sort();
  const served = tools.tools.map((t) => t.name).sort();
  check(
    `tools/list serves all ${expected.length} registered tools`,
    served.length === expected.length,
    `got ${served.length}`,
  );
  check(
    "the remote transport serves exactly what stdio serves",
    JSON.stringify(served) === JSON.stringify(expected),
    [
      ...served.filter((n) => !expected.includes(n)).map((n) => `extra: ${n}`),
      ...expected.filter((n) => !served.includes(n)).map((n) => `missing: ${n}`),
    ].join(", "),
  );

  const res = await client.callTool({ name: "list_clients", arguments: {} });
  const text = (res.content as { type: string; text?: string }[])?.[0]?.text ?? "";
  check("tools/call list_clients returns data", !res.isError && text.length > 0,
    res.isError ? text.slice(0, 120) : "");
  check("returned JSON parses", (() => { try { JSON.parse(text); return true; } catch { return false; } })());

  const bogus = await client.callTool({ name: "no_such_tool", arguments: {} });
  check("unknown tool errors cleanly", bogus.isError === true);

  await client.close();

  // 4. The read-only token, if one was supplied. This is the token meant
  //    for a chat app, and its whole promise is that it cannot write.
  if (READ_ONLY_TOKEN) {
    const roTransport = new StreamableHTTPClientTransport(new URL(URL_), {
      requestInit: { headers: { authorization: `Bearer ${READ_ONLY_TOKEN}` } },
    });
    const ro = new Client({ name: "http-check-ro", version: "1.0.0" }, { capabilities: {} });
    await ro.connect(roTransport);

    const roTools = (await ro.listTools()).tools.map((t) => t.name).sort();
    const roExpected = READ_ONLY_TOOLS.map((t) => t.name).sort();
    check(
      `a read-only token sees only the ${roExpected.length} read tools`,
      JSON.stringify(roTools) === JSON.stringify(roExpected),
      roTools.filter((n) => !roExpected.includes(n)).join(", "),
    );

    const readable = await ro.callTool({ name: "list_clients", arguments: {} });
    check("a read-only token can still read", readable.isError !== true);

    // Named outright rather than looked up, because the point is that a
    // client which knows the name anyway cannot use it.
    const blocked = await ro.callTool({ name: "run_agent", arguments: { clientId: 1 } });
    const blockedText =
      (blocked.content as { type: string; text?: string }[])?.[0]?.text ?? "";
    check(
      "a read-only token cannot run the agent",
      blocked.isError === true && /read-only/i.test(blockedText),
      blockedText.slice(0, 120),
    );

    await ro.close();
  } else {
    console.log("  SKIP  read-only token checks (no second token passed)");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
