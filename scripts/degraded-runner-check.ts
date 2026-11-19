/**
 * Proves the partly-failed scheduler signal end to end, against a COPY.
 *
 * WHY NOT JUST THE UNIT TEST: sweepDegraded is five lines and already
 * tested. What was wrong was not the arithmetic — it was that nothing
 * carried the answer from the runner to the icon. Measured on this
 * install, a green CheckCircle2 sat beside "27 of 38 checks ran — 11
 * could not" on the same row, because the icon keyed off `lastError`
 * (null, since nothing threw) and the note was the only place the
 * failure appeared.
 *
 * So this checks the chain: a runner reports degraded → the scheduler
 * stores it → schedulerStatus() hands it to the view.
 *
 *   pnpm exec tsx scripts/degraded-runner-check.ts
 */
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "degraded-check-"));
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
process.env.SEO_DB_PATH = dbPath;
process.env.SEO_DATA_DIR = dataDir;
process.env.SEO_DISABLE_SCHEDULER = "1";

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

async function main() {
  const { setSetting } = await import("../src/lib/settings-store");
  const { schedulerStatus } = await import("../src/lib/scheduler");
  const { sweepDegraded, summariseSweep } = await import("../src/lib/sweep-summary");

  // The real shape the sweep returns: 27 of 38 ok, 11 not — the exact
  // numbers this install reported under a green tick.
  const realistic = [
    ...Array.from({ length: 27 }, () => ({ ok: true })),
    ...Array.from({ length: 11 }, () => ({ ok: false, error: "site unreachable" })),
  ];

  console.log("\nThe runner's own verdict on that result");
  const note = summariseSweep(realistic);
  check("the note names the failures", note === "27 of 38 checks ran — 11 could not", note);
  check("and it is flagged degraded", sweepDegraded(realistic) === true);

  console.log("\nThe scheduler carries it to the view");
  await setSetting("scheduler.tool_sweep.last_note", note);
  await setSetting("scheduler.tool_sweep.degraded", true);
  await setSetting("scheduler.tool_sweep.last_error", null);
  await setSetting("scheduler.tool_sweep.finished_at", Date.now());

  const rows = await schedulerStatus();
  const sweep = rows.find((r) => r.id === "tool_sweep");
  check("the runner is listed", Boolean(sweep), rows.map((r) => r.id).slice(0, 5));
  if (sweep) {
    check("degraded reaches schedulerStatus", sweep.degraded === true, sweep.degraded);
    check("lastError is still null, so this is NOT a thrown failure", sweep.lastError === null, sweep.lastError);
    check("the note travels with it", sweep.lastNote === note, sweep.lastNote);
    // This is the combination that used to paint green.
    console.log(
      `\n    icon decision: lastError=${sweep.lastError} running=${sweep.running} ` +
        `degraded=${sweep.degraded} → amber, not green`,
    );
  }

  console.log("\nA fully successful run goes back to green");
  const allOk = Array.from({ length: 38 }, () => ({ ok: true }));
  await setSetting("scheduler.tool_sweep.last_note", summariseSweep(allOk));
  await setSetting("scheduler.tool_sweep.degraded", sweepDegraded(allOk));
  const rows2 = await schedulerStatus();
  const sweep2 = rows2.find((r) => r.id === "tool_sweep");
  check("degraded clears", sweep2?.degraded === false, sweep2?.degraded);
  check(
    "a stale flag cannot outlive the run it described",
    sweep2?.lastNote === "38 of 38 checks ran",
    sweep2?.lastNote,
  );

  console.log("\nRunners that were never flagged read as not degraded");
  const other = rows2.find((r) => r.id === "uptime_ping");
  check("absent flag is false, not undefined", other?.degraded === false, other?.degraded);

  console.log("\nThe view branches on it");
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    join(process.cwd(), "src/app/automations/overview/scheduler-status.tsx"),
    "utf8",
  );
  check("the icon chain consults degraded", src.includes("r.degraded ?"));
  check("before falling through to the green tick", src.indexOf("r.degraded ?") < src.indexOf("text-emerald-300"));

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`\nRan against ${dbPath}, not the live database.\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
