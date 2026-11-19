/**
 * Runs the nightly sweep against a COPY of the real database and prints
 * what every job did.
 *
 * WHY: the sweep runs 24 jobs and, until now, discarded every result —
 * only a timestamp was stored, the scheduler runner had no `summarise`,
 * and no screen showed a step. So an install where twenty of them failed
 * nightly looked identical to one where none did, and the README's
 * "~20 automated jobs every day" was true and unverifiable.
 *
 * This is the first time anyone has seen the per-job outcome. It is also
 * the only way to know whether the new reporting is accurate, because a
 * report of 24 successes on a machine where rank sources are blocked
 * would itself be the bug.
 *
 *   pnpm exec tsx scripts/nightly-jobs-check.ts
 *
 * Writes to the COPY only. Hits the network: it crawls, checks ranks and
 * reads RSS, exactly as the real sweep does, so it takes minutes.
 */
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "nightly-check-"));
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
  const { tickDailyAgent, readDailyReport, summariseDailyReport } = await import(
    "../src/lib/daily-agent"
  );

  // The tick refuses to run if one happened in the last 24h, which it
  // did on the real install. Cleared on the COPY so the sweep actually
  // runs — the point is to see the jobs execute.
  await setSetting("daily_agent_runner.last_run", 0);

  console.log("\nRunning the nightly sweep (this takes a few minutes)…\n");
  const started = Date.now();
  const report = await tickDailyAgent();
  const mins = ((Date.now() - started) / 60000).toFixed(1);

  check("the sweep ran rather than skipping", report !== null, report);
  if (!report) {
    console.log("\n  Nothing ran, so there is nothing to report on.\n");
    process.exit(1);
  }

  console.log(`\nFinished in ${mins} min — ${report.steps.length} jobs\n`);

  const failed = report.steps.filter((s) => !s.ok);
  const okSteps = report.steps.filter((s) => s.ok);

  for (const s of report.steps) {
    const mark = s.ok ? "\x1b[32m ok \x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    console.log(
      `  ${mark} ${s.name.padEnd(24)} ${String(Math.round(s.durationMs / 1000) + "s").padStart(5)}  ${(s.detail ?? "").slice(0, 86)}`,
    );
  }

  console.log();
  check("it ran roughly the two dozen jobs the README claims", report.steps.length >= 20, report.steps.length);
  check("every job reported a boolean outcome", report.steps.every((s) => typeof s.ok === "boolean"));

  // The claim worth testing: a job that did nothing useful must not
  // report ok with no explanation. Every successful step should say what
  // it found, because "ok" with no detail is indistinguishable from a
  // no-op.
  const silentOk = okSteps.filter((s) => !s.detail);
  check(
    "no job reports success without saying what it did",
    silentOk.length === 0,
    silentOk.map((s) => s.name),
  );

  // ── the new persistence ──────────────────────────────────────────
  console.log("\nThe result is kept, which it was not before");
  const stored = await readDailyReport();
  check("a report was stored", stored !== null);
  if (stored) {
    check(
      "it holds every job, not a count",
      stored.steps.length === report.steps.length,
      `${stored.steps.length} vs ${report.steps.length}`,
    );
    check(
      "it keeps each job's own sentence",
      stored.steps.some((s) => Boolean(s.detail)),
    );
    const summary = summariseDailyReport(stored);
    check("the one-line summary names failures when there are any",
      failed.length === 0 ? !summary.includes("failed") : summary.includes("failed"),
      summary);
    console.log(`\n  summary: ${summary}`);
  }

  // ── and reaches the health report ─────────────────────────────────
  console.log("\nAnd a failing job surfaces as an install problem");
  const { runHealthChecks } = await import("../src/lib/install-health");
  const issues = await runHealthChecks();
  const nightly = issues.find((i) => i.id === "nightly_jobs_failing");
  if (failed.length > 0) {
    check("the health report mentions it", Boolean(nightly), issues.map((i) => i.id));
    if (nightly) {
      check(
        "and names the jobs, not just a count",
        failed.some((f) => nightly.evidence.includes(f.name)),
        nightly.evidence.slice(0, 160),
      );
      console.log(`\n  ${nightly.title}`);
      console.log(`  ${nightly.evidence.slice(0, 200)}`);
    }
  } else {
    check("nothing failed, so nothing is reported", !nightly, nightly?.id);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`\nRan against ${dbPath}, not the live database.\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
