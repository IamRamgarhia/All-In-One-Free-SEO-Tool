/**
 * Drives the agent's loop-closing step against a real database and a
 * real HTTP server.
 *
 * The unit tests for close-loop.ts read the source: they prove the
 * refusals are written down. That is not the same as proving they fire.
 * This module resolves audit findings — a claim about a live website,
 * repeated in the audit score, the task list and the monthly report — so
 * the branches that must NOT resolve are worth executing, not reading.
 *
 * Three of them look like success if they are wrong:
 *
 *   still_present  the CMS accepted the write but a cache still serves
 *                  the old title
 *   unreachable    the page would not load, so there is no evidence
 *   not_applied    the change is still queued and never happened
 *
 * Runs against a COPY of data.db (SEO_DB_PATH), never the real one, and
 * serves its own page on a loopback port so the "fixed" and "not fixed"
 * states are exact rather than hoped for.
 *
 *   pnpm exec tsx scripts/close-loop-check.ts
 */
import { createServer, type Server } from "node:http";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Before any import that opens the database.
const dataDir = mkdtempSync(join(tmpdir(), "close-loop-"));
const dbPath = join(dataDir, "copy.db");
const source = process.env.SEO_DB_PATH ?? join(process.cwd(), "data.db");
if (!existsSync(source)) {
  console.error(`No database at ${source}. Run the app once first.`);
  process.exit(1);
}
copyFileSync(source, dbPath);
// The WAL holds recent writes; without it the copy can be missing rows
// that the live file has. Copied when present, same reason the backup
// path uses VACUUM INTO.
for (const suffix of ["-wal", "-shm"]) {
  if (existsSync(source + suffix)) copyFileSync(source + suffix, dbPath + suffix);
}
process.env.SEO_DB_PATH = dbPath;
process.env.SEO_DATA_DIR = dataDir;
process.env.SEO_DISABLE_SCHEDULER = "1";
// The fixture page is on 127.0.0.1, which guardedFetch refuses by
// design. This is the same documented opt-in the executor's CMS
// read-back uses for self-hosted and LAN sites — not a test-only hole.
process.env.SEO_ALLOW_PRIVATE_WP_ENDPOINT = "1";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${got === undefined ? "" : ` — got ${JSON.stringify(got)}`}`);
  }
}

/** A page whose <title> we can flip between too-long and fine. */
let titleIsLong = true;
const LONG_TITLE =
  "This title is deliberately far longer than the sixty character limit that the audit enforces, so it reports title_too_long";
const SHORT_TITLE = "A fine title";

function startPage(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      const title = titleIsLong ? LONG_TITLE : SHORT_TITLE;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>${title}</title>` +
          `<meta name="description" content="A description long enough not to trip the too-short check on this fixture page, which is all it needs to do.">` +
          `<link rel="canonical" href="PLACEHOLDER"></head>` +
          `<body><h1>Fixture</h1><p>${"Body text. ".repeat(60)}</p></body></html>`,
      );
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function main() {
  const { server, url } = await startPage();
  console.log(`\nFixture page on ${url}`);
  console.log(`Database copy at ${dbPath}\n`);

  const { db } = await import("../src/db/client");
  const { clients, audits, auditIssues, agentActions, agentRuns, tasks } =
    await import("../src/db/schema");
  const { closeLoopForAction, closeFinishedAgentTasks } = await import(
    "../src/lib/agent/close-loop"
  );
  const { recheckUrl } = await import("../src/lib/audit");
  const { eq } = await import("drizzle-orm");

  // ---- sanity: the fixture really does produce the finding we key on
  console.log("The fixture page behaves as the test assumes");
  const longCheck = await recheckUrl(url, { allowPrivateHosts: true });
  check(
    "a long title produces long_title",
    Boolean(longCheck?.findings.some((f) => f.type === "long_title")),
    longCheck?.findings.map((f) => f.type),
  );
  titleIsLong = false;
  const shortCheck = await recheckUrl(url, { allowPrivateHosts: true });
  check(
    "a short title does not",
    !shortCheck?.findings.some((f) => f.type === "long_title"),
  );
  titleIsLong = true;

  // ---- seed
  const [client] = await db
    .insert(clients)
    .values({ name: "Close-loop fixture", url })
    .returning({ id: clients.id });

  const [run] = await db
    .insert(agentRuns)
    .values({ clientId: client.id, mode: "apply_safe", trigger: "manual", startedAt: new Date() })
    .returning({ id: agentRuns.id });

  const [audit] = await db
    .insert(audits)
    .values({ clientId: client.id, status: "completed", createdAt: new Date() })
    .returning({ id: audits.id });

  async function seedIssue() {
    const [issue] = await db
      .insert(auditIssues)
      .values({
        auditId: audit.id,
        severity: "medium",
        type: "long_title",
        url,
        message: "Title is longer than 60 characters.",
        status: "new",
      })
      .returning({ id: auditIssues.id });
    return issue.id;
  }

  async function seedAction(status: "verified" | "queued") {
    const [a] = await db
      .insert(agentActions)
      .values({
        runId: run.id,
        clientId: client.id,
        kind: "write_title",
        targetUrl: url,
        risk: "safe",
        status,
        appliedAt: status === "verified" ? new Date() : null,
      })
      .returning({ id: agentActions.id });
    return a.id;
  }

  const issueStatus = async (id: number) =>
    (
      await db
        .select({ status: auditIssues.status })
        .from(auditIssues)
        .where(eq(auditIssues.id, id))
        .limit(1)
    )[0]?.status;

  // ---- 1. queued action: nothing may be confirmed
  console.log("\nAn action that was never applied");
  const queuedIssue = await seedIssue();
  const queuedAction = await seedAction("queued");
  const r1 = await closeLoopForAction(queuedAction);
  check("refuses a queued action", r1.result === "not_applied", r1.result);
  check(
    "leaves the finding open",
    (await issueStatus(queuedIssue)) === "new",
    await issueStatus(queuedIssue),
  );

  // ---- 2. applied, but the live page still shows the problem
  console.log("\nApplied, but the live page still shows the old title");
  titleIsLong = true;
  const staleAction = await seedAction("verified");
  const r2 = await closeLoopForAction(staleAction);
  check("reports still_present", r2.result === "still_present", r2.result);
  check(
    "does NOT resolve the finding",
    (await issueStatus(queuedIssue)) === "new",
    await issueStatus(queuedIssue),
  );
  check("the note names a cache as the likely cause", /cache/i.test(r2.note), r2.note);

  // ---- 3. the live page agrees: now it may resolve
  console.log("\nThe live page now serves the fixed title");
  titleIsLong = false;
  const goodAction = await seedAction("verified");
  const r3 = await closeLoopForAction(goodAction);
  check("reports resolved", r3.result === "resolved", r3.result);
  check(
    "the finding is marked resolved",
    (await issueStatus(queuedIssue)) === "resolved",
    await issueStatus(queuedIssue),
  );

  // ---- 4. idempotent
  console.log("\nRunning it again changes nothing");
  const r4 = await closeLoopForAction(goodAction);
  check("still reports resolved", r4.result === "resolved", r4.result);
  check("says it was already confirmed", /already/i.test(r4.note), r4.note);

  // ---- 5. unreachable page: no evidence, no resolution
  console.log("\nThe page cannot be fetched at all");
  const deadIssueUrl = "http://127.0.0.1:1/";
  const [deadIssue] = await db
    .insert(auditIssues)
    .values({
      auditId: audit.id,
      severity: "medium",
      type: "long_title",
      url: deadIssueUrl,
      message: "Title is longer than 60 characters.",
      status: "new",
    })
    .returning({ id: auditIssues.id });
  const [deadAction] = await db
    .insert(agentActions)
    .values({
      runId: run.id,
      clientId: client.id,
      kind: "write_title",
      targetUrl: deadIssueUrl,
      risk: "safe",
      status: "verified",
      appliedAt: new Date(),
    })
    .returning({ id: agentActions.id });
  const r5 = await closeLoopForAction(deadAction.id);
  check("reports unreachable", r5.result === "unreachable", r5.result);
  check(
    "leaves that finding open",
    (await issueStatus(deadIssue.id)) === "new",
    await issueStatus(deadIssue.id),
  );

  // ---- 6. the task closes only once every finding of its type is gone
  console.log("\nThe task closes when, and only when, its findings are gone");
  const [task] = await db
    .insert(tasks)
    .values({
      clientId: client.id,
      title: "Shorten long titles",
      status: "todo",
      source: "agent",
      sourceRef: "agent:long_title",
    })
    .returning({ id: tasks.id });

  const taskStatus = async () =>
    (
      await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, task.id))
        .limit(1)
    )[0]?.status;

  const closedWhileOpen = await closeFinishedAgentTasks();
  check(
    "stays open while the unreachable finding is still new",
    (await taskStatus()) === "todo",
    await taskStatus(),
  );
  check("closes nothing", closedWhileOpen === 0, closedWhileOpen);

  // Resolve the last open one the honest way: serve the fix and confirm.
  await db
    .update(auditIssues)
    .set({ url })
    .where(eq(auditIssues.id, deadIssue.id));
  await db
    .update(agentActions)
    .set({ targetUrl: url })
    .where(eq(agentActions.id, deadAction.id));
  const r6 = await closeLoopForAction(deadAction.id);
  check("the last finding confirms once its page answers", r6.result === "resolved", r6.result);

  const closedNow = await closeFinishedAgentTasks();
  check("the task is now closed", (await taskStatus()) === "done", await taskStatus());
  check("and it reports closing one", closedNow === 1, closedNow);

  server.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(
    `\nRan against a copy of the database, not the real one. The live\n` +
      `data.db was never opened for writing.\n`,
  );
  // Not removed: better-sqlite3 still holds the file open and Windows
  // refuses to unlink it, which turned a passing run into an EPERM
  // stack trace after the results had already printed. The OS clears
  // its own temp directory.
  console.log(`Copy left at ${dbPath} — the OS temp dir is cleaned by Windows.
`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
