/**
 * The first thing a user ever does: add a site and run an audit.
 *
 * This path had the worst bug in the product and nothing tested it.
 * A user adds their site, the audit gets interrupted — a restart, a
 * closed tab, a slow site — and the row is left `running`. From then
 * on:
 *
 *   - every click of "Run audit" returned silently, for a full hour.
 *     No new audit, no error, no message.
 *   - the audit page had branches for `completed` and `failed` and none
 *     for `running`, so it rendered an empty shell.
 *
 * Nothing threw. In the reporter's words: "it just stops in this place
 * and doesn't go anywhere."
 *
 * These assertions are about a click always doing something the user
 * can see. A silent no-op is the failure mode, so "returned normally"
 * is what fails here, not what passes.
 *
 *   pnpm exec tsx scripts/first-run-check.ts
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "first-run-"));
process.env.SEO_DATA_DIR = dataDir;
process.env.SEO_DB_PATH = join(dataDir, "first-run.db");

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
const section = (t: string) =>
  console.log("\n" + "=".repeat(70) + "\n" + t + "\n" + "=".repeat(70));

/** What a click actually did, from the caller's point of view. */
type ClickOutcome =
  | { kind: "redirect"; to: string }
  | { kind: "returned" }
  | { kind: "threw"; message: string };

async function clickRunAudit(clientId: number): Promise<ClickOutcome> {
  const { runAuditForClient } = await import("../src/app/audits/actions");
  try {
    await runAuditForClient(clientId);
    return { kind: "returned" };
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    // Next's redirect() signals by throwing. That's a real outcome the
    // user sees, not an error.
    if (/NEXT_REDIRECT/.test(message)) {
      return { kind: "redirect", to: message };
    }
    // revalidatePath needs a Next request context, which a standalone
    // script has no way to provide. It runs after the audit is already
    // written, so it doesn't affect what is being asserted here.
    if (/static generation store/i.test(message)) {
      return { kind: "returned" };
    }
    return { kind: "threw", message };
  }
}

async function main() {
  execFileSync(process.execPath, [join(HERE, "migrate.cjs")], {
    env: process.env,
    stdio: "pipe",
  });

  const { db } = await import("../src/db/client");
  const { clients, audits } = await import("../src/db/schema");
  const { eq, desc } = await import("drizzle-orm");

  const seed = async (name: string, runningAgeMs: number | null) => {
    const [c] = await db
      .insert(clients)
      .values({ name, url: "https://example.com" })
      .returning();
    if (runningAgeMs !== null) {
      await db.insert(audits).values({
        clientId: c.id,
        status: "running",
        startedAt: new Date(Date.now() - runningAgeMs),
      });
    }
    return c.id;
  };

  const rowsFor = (clientId: number) =>
    db
      .select({ id: audits.id, status: audits.status })
      .from(audits)
      .where(eq(audits.clientId, clientId))
      .orderBy(desc(audits.id));

  // =================================================================
  section("An audit is genuinely running");

  const busy = await seed("Busy Co", 30_000);
  const busyOutcome = await clickRunAudit(busy);

  if (busyOutcome.kind === "redirect") {
    ok("the click sends the user to the running audit", "not a silent no-op");
  } else if (busyOutcome.kind === "returned") {
    bad(
      "THE CLICK DID NOTHING VISIBLE",
      "this is the original bug: no audit, no error, no message",
    );
  } else {
    bad("the click threw", busyOutcome.message.slice(0, 80));
  }

  const busyRows = await rowsFor(busy);
  if (busyRows.length === 1) {
    ok("no duplicate audit was started", "the guard still guards");
  } else {
    bad("started a second concurrent audit", JSON.stringify(busyRows));
  }

  // =================================================================
  section("An audit stalled and will never finish");

  // Nothing reports progress mid-crawl, so a row still "running" long
  // afterwards is dead. Making someone wait an hour to retry is a
  // lockout, not a guard.
  const stalled = await seed("Stalled Co", 45 * 60_000);
  const stalledOutcome = await clickRunAudit(stalled);

  if (stalledOutcome.kind === "threw") {
    bad("the click threw", stalledOutcome.message.slice(0, 80));
  } else {
    ok("the click was accepted");
  }

  const stalledRows = await rowsFor(stalled);
  const failedOld = stalledRows.some((r) => r.status === "failed");
  const freshRun = stalledRows.some(
    (r) => r.status === "completed" || r.status === "running",
  );

  if (failedOld) {
    ok("the dead audit is recorded as failed", "history stays honest");
  } else {
    bad("the stalled audit was left as 'running'", JSON.stringify(stalledRows));
  }
  if (freshRun && stalledRows.length === 2) {
    ok("a new audit took over", JSON.stringify(stalledRows));
  } else {
    bad("no new audit was started", JSON.stringify(stalledRows));
  }

  // =================================================================
  section("A clean first run");

  const fresh = await seed("Fresh Co", null);
  const freshOutcome = await clickRunAudit(fresh);
  if (freshOutcome.kind === "threw") {
    bad("first audit threw", freshOutcome.message.slice(0, 80));
  } else {
    ok("the first audit runs");
  }
  const freshRows = await rowsFor(fresh);
  if (freshRows.length === 1 && freshRows[0].status === "completed") {
    ok("and completes", `status=${freshRows[0].status}`);
  } else {
    bad("did not complete", JSON.stringify(freshRows));
  }

  // =================================================================
  section("The audit page can render every state it stores");

  // The page rendered nothing at all for `running`, which is how an
  // interrupted audit became a blank screen. Rather than boot Next to
  // check markup, assert the source handles each status the schema
  // allows — the omission was structural, not cosmetic.
  const { readFileSync } = await import("node:fs");
  const pageSrc = readFileSync(
    join(HERE, "..", "src", "app", "audits", "[id]", "page.tsx"),
    "utf8",
  );
  for (const status of ["running", "completed", "failed"]) {
    if (pageSrc.includes(`audit.status === "${status}"`)) {
      ok(`the page has a branch for "${status}"`);
    } else {
      bad(
        `NO BRANCH FOR "${status}"`,
        "an audit in this state renders an empty page",
      );
    }
  }

  finish();
}

function finish() {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows may hold the sqlite file a moment longer.
  }
  console.log("\n" + "=".repeat(70));
  console.log(`${pass} passed, ${fail} failed`);
  console.log(
    "\nCovers the click and the database. Does NOT prove the rendered page\nlooks right — that needs a browser.",
  );
  process.exitCode = fail > 0 ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
}

main().catch((e) => {
  console.error("CRASHED:", e);
  process.exit(1);
});
