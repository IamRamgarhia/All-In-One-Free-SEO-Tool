/**
 * Drive the MCP server the way a real client does.
 *
 * Spawns it, speaks JSON-RPC over stdio, and checks the answers. Not a
 * unit test of the handlers — those could all be correct while the
 * server fails to hand-shake, or writes something to stdout that
 * corrupts the stream, and the user would see "server disconnected"
 * with no clue why.
 *
 * The assertions that matter most are about what the tool refuses to
 * imply. A rank number without its source, or a suggest-only run
 * reported as if nothing worked, are the ways this becomes a machine
 * for producing confident wrong answers.
 *
 *   pnpm exec tsx scripts/mcp-check.ts
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "mcp-check-"));
process.env.SEO_DATA_DIR = dataDir;
process.env.SEO_DB_PATH = join(dataDir, "mcp.db");

let pass = 0;
let fail = 0;
const ok = (m: string, d = "") => {
  pass++;
  console.log(`  PASS  ${m}${d ? "  — " + d : ""}`);
};
const bad = (m: string, d = "") => {
  fail++;
  console.log(`  FAIL  ${m}${d ? "  — " + d : ""}`);
};
const info = (m: string) => console.log(`        ${m}`);
const section = (t: string) =>
  console.log("\n" + "=".repeat(70) + "\n" + t + "\n" + "=".repeat(70));

let child: ChildProcessWithoutNullStreams | null = null;
let buffer = "";
const pending = new Map<number, (v: unknown) => void>();
let nextId = 1;

function send(method: string, params?: unknown): Promise<Record<string, unknown>> {
  const id = nextId++;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  child!.stdin.write(msg);
  return new Promise((resolve) => {
    pending.set(id, resolve as (v: unknown) => void);
    setTimeout(() => {
      if (pending.delete(id)) resolve({ error: { message: "timed out" } });
    }, 30_000);
  });
}

function notify(method: string, params?: unknown): void {
  child!.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

/** Text payload of a tools/call response, parsed if it is JSON. */
function payload(res: Record<string, unknown>): {
  isError: boolean;
  text: string;
  json: Record<string, unknown> | null;
} {
  const result = (res.result ?? {}) as {
    isError?: boolean;
    content?: { type: string; text: string }[];
  };
  const text = result.content?.[0]?.text ?? "";
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Errors come back as prose, which is correct.
  }
  return { isError: Boolean(result.isError), text, json };
}

async function main() {
  section("Handshake");

  execFileSync(process.execPath, [join(HERE, "migrate.cjs")], {
    env: process.env,
    stdio: "pipe",
  });

  child = spawn(
    process.execPath,
    [join(HERE, "..", "node_modules", "tsx", "dist", "cli.mjs"), join(HERE, "mcp-server.ts")],
    { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
  ) as ChildProcessWithoutNullStreams;

  // Anything the server prints to stdout that isn't protocol breaks the
  // stream. Collect stderr separately so a crash is readable.
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += String(d)));
  child.stdout.on("data", (d) => {
    buffer += String(d);
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        bad("NON-PROTOCOL OUTPUT ON STDOUT", line.slice(0, 90));
      }
    }
  });

  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp-check", version: "1.0.0" },
  });
  if ((init.result as { serverInfo?: { name?: string } })?.serverInfo?.name === "seo-tool") {
    ok("server handshakes", "seo-tool");
  } else {
    bad("handshake failed", JSON.stringify(init).slice(0, 160) + " | stderr: " + stderr.slice(0, 160));
    return finish();
  }
  notify("notifications/initialized");

  section("Tool list");

  const listed = await send("tools/list");
  const tools = ((listed.result as { tools?: { name: string; description: string }[] })?.tools ?? []);
  info(tools.map((t) => t.name).join(", "));
  if (tools.length >= 10) ok(`${tools.length} tools advertised`);
  else bad("too few tools", String(tools.length));

  // Every tool needs a description a model can route on. An unnamed or
  // undescribed tool is one the assistant will never call correctly.
  const undescribed = tools.filter((t) => !t.description || t.description.length < 40);
  if (undescribed.length === 0) ok("every tool explains what it is for");
  else bad("tools with thin descriptions", undescribed.map((t) => t.name).join(","));

  section("Empty install — must say so, not imply health");

  const empty = payload(await send("tools/call", { name: "list_clients", arguments: {} }));
  if (empty.json && Array.isArray(empty.json.clients) && empty.json.clients.length === 0) {
    ok("reports no clients");
    if (typeof empty.json.note === "string" && empty.json.note.length > 20) {
      ok("and says what to do about it", String(empty.json.note).slice(0, 54));
    } else {
      bad("no explanation for an empty result");
    }
  } else {
    bad("unexpected list_clients payload", empty.text.slice(0, 120));
  }

  const noClient = payload(
    await send("tools/call", { name: "get_client_overview", arguments: { clientId: 999 } }),
  );
  if (noClient.isError && /no client/i.test(noClient.text)) {
    ok("an unknown client is a clear error, not an empty success");
  } else {
    bad("unknown client handled wrongly", noClient.text.slice(0, 90));
  }

  section("With real data");

  const { db } = await import("../src/db/client");
  const { clients, audits, auditIssues, keywords, keywordRankings } = await import(
    "../src/db/schema"
  );

  const [client] = await db
    .insert(clients)
    .values({ name: "Soap Co", url: "https://example.com" })
    .returning();
  const [audit] = await db
    .insert(audits)
    .values({
      clientId: client.id,
      status: "completed",
      score: 61,
      issuesCount: 2,
      pagesCrawled: 12,
      completedAt: new Date(),
    })
    .returning();
  await db.insert(auditIssues).values([
    {
      auditId: audit.id,
      severity: "critical",
      type: "missing_title",
      url: "https://example.com/",
      message: "No title tag",
    },
    {
      auditId: audit.id,
      severity: "low",
      type: "missing_favicon",
      url: "https://example.com/",
      message: "No favicon",
    },
  ]);

  const [kw] = await db
    .insert(keywords)
    .values({ clientId: client.id, query: "handmade soap" })
    .returning();
  // Two rankings from DIFFERENT sources, deliberately. A tool that
  // subtracts these reports a 6-place rise that never happened.
  await db.insert(keywordRankings).values([
    {
      keywordId: kw.id,
      position: 18,
      source: "scrape",
      checkedAt: new Date(Date.now() - 20 * 86_400_000),
    },
    { keywordId: kw.id, position: 12, source: "gsc", checkedAt: new Date() },
  ]);

  const overview = payload(
    await send("tools/call", { name: "get_client_overview", arguments: { clientId: client.id } }),
  );
  const audits_ = (overview.json?.audit ?? {}) as Record<string, unknown>;
  if (audits_.score === 61 && audits_.pagesCrawled === 12) {
    ok("overview returns the real audit figures", "score 61, 12 pages");
  } else {
    bad("overview figures wrong", JSON.stringify(audits_).slice(0, 120));
  }
  if (typeof audits_.freshness === "string" && audits_.freshness.length > 0) {
    ok("audit age is stated in words", String(audits_.freshness));
  } else {
    bad("no freshness on the audit");
  }

  const issues = payload(
    await send("tools/call", {
      name: "list_audit_issues",
      arguments: { clientId: client.id, severity: "critical" },
    }),
  );
  const issueRows = (issues.json?.issues ?? []) as { type: string }[];
  if (issueRows.length === 1 && issueRows[0].type === "missing_title") {
    ok("severity filter works", "1 critical, not both");
  } else {
    bad("filter wrong", JSON.stringify(issueRows).slice(0, 120));
  }
  if (typeof issues.json?.provenance === "string") {
    ok("findings say where they came from");
  } else {
    bad("no provenance on findings");
  }

  section("The number that must not be invented");

  const ranks = payload(
    await send("tools/call", {
      name: "get_keyword_rankings",
      arguments: { clientId: client.id, days: 60 },
    }),
  );
  const row = ((ranks.json?.keywords ?? []) as Record<string, unknown>[])[0];
  if (row?.latestPosition === 12) {
    ok("returns the latest position", "12");
  } else {
    bad("wrong position", JSON.stringify(row).slice(0, 120));
  }
  if (typeof row?.source === "string" && typeof row?.provenance === "string") {
    ok("every rank states its source", String(row.source));
  } else {
    bad("RANK WITHOUT PROVENANCE", "a model will call this today's Google position");
  }
  // 18 → 12 looks like a six-place gain. It is a scrape compared with a
  // GSC average, which is not a comparison at all.
  if (row?.change === null) {
    ok("refuses to compute movement across two different sources");
    if (typeof row?.changeNote === "string") {
      ok("and explains why", String(row.changeNote).slice(0, 56));
    } else {
      bad("no explanation for the null change");
    }
  } else {
    bad(
      "INVENTED A RANK MOVEMENT",
      `reported ${String(row?.change)} places by subtracting a scrape from a GSC average`,
    );
  }

  section("Citation landscape — who gets cited instead of you");

  const { aiVisibilityChecks } = await import("../src/db/schema");
  await db.insert(aiVisibilityChecks).values([
    // Grounded: the model searched. These count.
    {
      keywordId: kw.id,
      provider: "perplexity",
      prompt: "best handmade soap",
      response: "…",
      citations: ["https://reddit.com/r/soap/1", "https://reddit.com/r/soap/2"],
      grounding: "live",
    },
    {
      keywordId: kw.id,
      provider: "google_ai_mode",
      prompt: "handmade soap uk",
      response: "…",
      citations: ["https://reddit.com/x", "https://example.com/us"],
      grounding: "live",
    },
    // Memory-only: the model answered from training. Must be excluded —
    // it says nothing about what AI search cites today.
    {
      keywordId: kw.id,
      provider: "openai",
      prompt: "soap making",
      response: "…",
      citations: ["https://wikipedia.org/soap"],
      grounding: "memory",
    },
  ]);

  const land = payload(
    await send("tools/call", {
      name: "get_citation_landscape",
      arguments: { clientId: client.id },
    }),
  );
  const L = land.json as Record<string, unknown> | null;
  if (L?.groundedAnswers === 2 && L?.memoryAnswersIgnored === 1) {
    ok("counts only answers where the model searched", "2 grounded, 1 memory excluded");
  } else {
    bad("grounding not respected", JSON.stringify(L).slice(0, 140));
  }

  const comps = (L?.competitors ?? []) as { domain: string; answersCiting: number }[];
  if (comps[0]?.domain === "reddit.com" && comps[0]?.answersCiting === 2) {
    ok("ranks the most-cited domain", "reddit.com in 2 of 2 answers");
  } else {
    bad("competitor ranking wrong", JSON.stringify(comps).slice(0, 140));
  }
  if (!comps.some((c) => c.domain === "wikipedia.org")) {
    ok("a memory-only citation never reaches the ranking");
  } else {
    bad("MEMORY CITATION COUNTED", "the ranking describes training data, not AI search");
  }
  if (!comps.some((c) => c.domain === "example.com") && L?.yourAnswersCiting === 1) {
    ok("your own domain is reported separately, not as a competitor", "cited in 1 of 2");
  } else {
    bad("own-domain handling wrong", JSON.stringify(L).slice(0, 140));
  }
  if (L?.confidence === "low" && /too few/i.test(String(L?.note))) {
    ok("labels a two-answer sample as too small to call", "no invented share of voice");
  } else {
    bad("SMALL SAMPLE PRESENTED AS A PATTERN", String(L?.note).slice(0, 90));
  }

  section("Writing — the agent's gates, not new ones");

  const tool = tools.find((t) => t.name === "run_agent");
  if (tool && /autonomy/i.test(tool.description)) {
    ok("run_agent's description states it cannot exceed the autonomy level");
  } else {
    bad("run_agent does not mention autonomy", "the model will assume it can write");
  }
  const writeTools = tools.filter((t) =>
    /^(set|write|update|edit)_/.test(t.name),
  );
  if (writeTools.length === 0) {
    ok("no direct field-writing tools exist", "every change goes through the agent");
  } else {
    bad("DIRECT WRITE TOOLS BYPASS THE AGENT", writeTools.map((t) => t.name).join(","));
  }

  const run = payload(
    await send("tools/call", { name: "run_agent", arguments: { clientId: client.id } }),
  );
  if (run.json && typeof run.json.autonomyLevel === "string") {
    ok("a run reports the autonomy level in force", String(run.json.autonomyLevel));
  } else {
    bad("run did not report autonomy", run.text.slice(0, 120));
  }
  if (run.json?.applied === 0 && run.json?.autonomyLevel === "suggest") {
    ok("default autonomy wrote nothing", "as suggest-only promises");
  } else if (run.json?.autonomyLevel === "suggest") {
    bad("SUGGEST-ONLY APPLIED CHANGES", String(run.json?.applied));
  }
  if (typeof run.json?.autonomyMeans === "string") {
    ok("explains why nothing was applied", String(run.json.autonomyMeans).slice(0, 54));
  } else {
    bad("no explanation — 'applied: 0' reads as a malfunction");
  }

  section("Failures are readable");

  const badRevert = payload(
    await send("tools/call", { name: "revert_agent_action", arguments: { actionId: 987654 } }),
  );
  if (badRevert.isError && badRevert.text.length > 10) {
    ok("reverting a nonexistent action explains itself", badRevert.text.slice(0, 50));
  } else {
    bad("unclear revert failure", badRevert.text.slice(0, 90));
  }

  const unknown = payload(
    await send("tools/call", { name: "no_such_tool", arguments: {} }),
  );
  if (unknown.isError) ok("an unknown tool is an error, not a silent empty result");
  else bad("unknown tool did not error");

  if (stderr.includes("ready on stdio")) {
    ok("diagnostics went to stderr", "stdout stayed clean for the protocol");
  } else {
    info("stderr: " + stderr.slice(0, 120));
  }

  finish();
}

function finish() {
  child?.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows can hold the sqlite file a moment longer.
  }
  console.log("\n" + "=".repeat(70));
  console.log(`${pass} passed, ${fail} failed`);
  console.log(
    "\nSpeaks the real protocol to the real server against a real database.\n" +
      "Does NOT prove any particular MCP client renders it well — that needs\n" +
      "Claude Desktop or Cursor pointed at it.",
  );
  process.exitCode = fail > 0 ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
}

main().catch((e) => {
  child?.kill();
  console.error("CRASHED:", e);
  process.exit(1);
});
