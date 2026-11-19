/**
 * Drives the REMOTE MCP endpoint with a READ-ONLY token.
 *
 * WHY: the read-only token is the one you paste into a chat app. The
 * whole point of it is that a connector holding it can answer questions
 * about every client and change nothing — "asking questions is what the
 * endpoint exists for, and a token that can also edit a live website is
 * a bad thing to leave in someone's connector settings".
 *
 * That claim has never been tested against a running server. The
 * existing mcp-http-check.ts takes the read-only token as an OPTIONAL
 * second argument and skips those assertions when it is absent — and on
 * this install it is always absent, because no read-only token has ever
 * been generated. So the step prints:
 *
 *   SKIP  read-only token checks (no second token passed)
 *
 * A security boundary nobody has exercised is a security boundary you
 * are assuming. This generates one on a COPY, boots a real server
 * against that copy, and checks the boundary holds from the outside.
 *
 *   pnpm exec tsx scripts/mcp-readonly-check.ts
 *
 * Never prints either token.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";

const dataDir = mkdtempSync(join(tmpdir(), "mcp-ro-"));
const dbPath = join(dataDir, "copy.db");
const source = process.env.SEO_DB_PATH ?? join(process.cwd(), "data.db");
if (!existsSync(source)) {
  console.error(`No database at ${source}.`);
  process.exit(1);
}
copyFileSync(source, dbPath);
for (const sfx of ["-wal", "-shm"]) {
  if (existsSync(source + sfx)) copyFileSync(source + sfx, dbPath + sfx);
}

/**
 * A port the OS says is free, not a fixed one.
 *
 * With a fixed 63141, a leftover server from a previous run held the
 * port, the new server died with EADDRINUSE, and every request went to
 * the OLD server — which had the OLD run's tokens, so all five auth
 * assertions failed with 401 while the code was correct. Measured: PID
 * 19976 still listening half an hour later.
 *
 * Same lesson as the Windows host: ask for 0 and read back what you
 * were given, because "something answered" is not "ours answered".
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const a = srv.address();
      const port = typeof a === "object" && a ? a.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

let PORT = 0;
let BASE = "";
let MCP = "";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    fail++;
    console.log(
      `  \x1b[31mFAIL\x1b[0m  ${name}${got === undefined ? "" : ` — got ${JSON.stringify(got)}`}`,
    );
  }
}

/** Redacts both tokens from anything printed. */
let redactions: string[] = [];
/**
 * Kills the server AND its children.
 *
 * `shell: true` on Windows means the spawned process is cmd.exe, so
 * kill() ends the shell and leaves node running — which is exactly how
 * the stale server above survived. Same reason the Windows host uses
 * Kill(entireProcessTree: true).
 */
function stopServer(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    // Nothing useful to do; the OS reclaims it at exit.
  }
}

function safe(s: string): string {
  let out = s;
  for (const r of redactions) if (r) out = out.split(r).join("<redacted>");
  return out;
}

async function rpc(token: string, method: string, params?: unknown) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  return { status: res.status, text };
}


/**
 * Tool names from a tools/list response, parsed rather than matched.
 *
 * The first version used /"name":"(\w+)"/g over the raw body, which also
 * matches PARAMETER names inside each tool's inputSchema — so the list
 * was inflated with argument names and the fact that its length happened
 * to equal the tool count was luck. The read-only assertions passed for
 * the right reason and the full-access one failed for the wrong one.
 *
 * The endpoint may answer as JSON or as a single SSE frame, so both
 * shapes are handled.
 */
function toolNames(body: string): string[] {
  let json = body.trim();
  if (json.startsWith("event:") || json.startsWith("data:")) {
    const line = json
      .split("\n")
      .map((l) => l.replace(/\r$/, ""))
      .find((l) => l.startsWith("data:"));
    json = line ? line.slice(5).trim() : "";
  }
  try {
    const parsed = JSON.parse(json) as {
      result?: { tools?: { name?: unknown }[] };
    };
    return (parsed.result?.tools ?? [])
      .map((t) => t.name)
      .filter((n): n is string => typeof n === "string");
  } catch {
    return [];
  }
}

let server: ChildProcess | null = null;

async function main() {
  // ── mint both tokens on the copy ────────────────────────────────────
  process.env.SEO_DB_PATH = dbPath;
  process.env.SEO_DATA_DIR = dataDir;
  const { setSetting } = await import("../src/lib/settings-store");
  const full = `seo_mcp_${randomBytes(32).toString("hex")}`;
  const ro = `seo_mcp_ro_${randomBytes(32).toString("hex")}`;
  redactions = [full, ro];
  await setSetting("mcp.access_token", full);
  await setSetting("mcp.readonly_token", ro);
  console.log("\nMinted a full-access and a read-only token on the copy.");
  console.log("(neither is printed by this script)\n");

  // ── which tools the server says are read-only ───────────────────────
  const { MCP_TOOL_LIST, READ_ONLY_TOOLS } = await import("../src/lib/mcp/server");
  const writers = MCP_TOOL_LIST.filter(
    (t) => !READ_ONLY_TOOLS.some((r) => r.name === t.name),
  ).map((t) => t.name);
  console.log(`${MCP_TOOL_LIST.length} tools, ${writers.length} of them writers:`);
  console.log(`  ${writers.join(", ")}\n`);
  check("there are writers to exclude, or this proves nothing", writers.length > 0);

  // ── boot a real server against the copy ─────────────────────────────
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  MCP = `${BASE}/api/mcp`;
  console.log(`Booting a server against the copy on ${PORT}…`);
  server = spawn(
    process.platform === "win32" ? "node_modules\\.bin\\next.cmd" : "node_modules/.bin/next",
    ["start", "-p", String(PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SEO_DB_PATH: dbPath,
        SEO_DATA_DIR: dataDir,
        SEO_DISABLE_SCHEDULER: "1",
        PORT: String(PORT),
      },
      stdio: "ignore",
      shell: process.platform === "win32",
    },
  );

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try {
      const r = await fetch(`${BASE}/api/v1/health`);
      if (r.ok) up = true;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  check("the server came up", up);
  if (!up) throw new Error("server never answered");

  // ── the boundary ────────────────────────────────────────────────────
  console.log("\nThe read-only token can read");
  const list = await rpc(ro, "tools/list");
  check("tools/list is allowed", list.status === 200, list.status);
  const listed = toolNames(list.text);
  check(
    "it is served FEWER tools than exist",
    listed.length > 0 && listed.length < MCP_TOOL_LIST.length,
    `${listed.length} of ${MCP_TOOL_LIST.length}`,
  );
  const leaked = writers.filter((w) => listed.includes(w));
  check(
    "no writer appears in its tool list",
    leaked.length === 0,
    leaked,
  );

  const read = await rpc(ro, "tools/call", {
    name: "list_clients",
    arguments: {},
  });
  check("a read tool returns data", read.status === 200 && /Dice|client|\[/i.test(read.text), read.status);

  console.log("\nThe read-only token cannot write");
  for (const writer of writers.slice(0, 4)) {
    const r = await rpc(ro, "tools/call", { name: writer, arguments: {} });
    // Refused is the requirement. HOW it refuses matters less than that
    // the refusal is not a silent success — so both an error status and
    // a JSON-RPC error body count, and a 200 with a result does not.
    const refused =
      r.status >= 400 ||
      /"error"/.test(r.text) ||
      /not available|unknown tool|read-only|not permitted/i.test(r.text);
    check(`${writer} is refused`, refused, { status: r.status, body: safe(r.text).slice(0, 120) });
  }

  console.log("\nThe full-access token still works, so the gate is the token");
  const fullList = await rpc(full, "tools/list");
  const fullListed = toolNames(fullList.text);
  check(
    "it is served every tool",
    fullListed.length === MCP_TOOL_LIST.length,
    `${fullListed.length} of ${MCP_TOOL_LIST.length}`,
  );
  check(
    "including the writers",
    writers.every((w) => fullListed.includes(w)),
  );

  console.log("\nNo token and a wrong token are both refused");
  const anon = await rpc("", "tools/list");
  check("unauthenticated is 401", anon.status === 401, anon.status);
  const bad = await rpc("seo_mcp_ro_wrong", "tools/list");
  check("a wrong read-only-shaped token is 401", bad.status === 401, bad.status);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`\nRan against ${dbPath}, not the live database.\n`);
}

main()
  .then(() => {
    stopServer(server);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(safe(String(e)));
    stopServer(server);
    process.exit(1);
  });
