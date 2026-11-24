/**
 * Runs the nightly sweep against a COPY of the database and checks that
 * its result is kept, job by job.
 *
 * Ported from upstream. The sweep used to discard every job's outcome:
 * only a timestamp was stored. This runs it for real, then reads the
 * stored report back and checks it reaches the install-health report.
 *
 *   SEO_DB_PATH=/path/to/copy.db pnpm exec tsx scripts/nightly-jobs-check.ts
 *
 * Copies the database it is given (or ./data.db) into a temporary folder
 * and works on that copy only. It still hits the network — audits, rank
 * checks, RSS, sitemaps — like the real sweep, so it takes minutes.
 *
 * DIFFERENCE FROM UPSTREAM: this fork's sweep also publishes queued
 * content to WordPress, rotates page titles on live sites, sends e-mail
 * digests, reads Gmail and calls the AI provider. Those jobs act on the
 * clients' real sites and accounts whatever database they run from, so
 * they are left out here (SKIP below). The check is about the report
 * being kept, which the remaining jobs exercise fully.
 */
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SKIP = new Set([
  "automations.publish", // publishes to clients' WordPress sites
  "automations.generate", // calls the AI provider
  "title_tests.rotate", // changes page titles on live sites
  "mentions.digest", // sends e-mail
  "outreach.reply_poll", // reads the connected Gmail
  "ai.suggestions", // runs the agent, which can queue or apply changes
  "ai.distill_preferences", // calls the AI provider
  "ai_audit.weekly", // calls the AI provider
  "local_grid.scheduled", // may spend a paid results API
]);

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
  const { runDailyAgentBody, persistDailyReport } = await import("../src/lib/daily-agent");
  const { readDailyReport, summariseDailyReport } = await import("../src/lib/daily-report");
  const { deleteSetting } = await import("../src/lib/settings-store");
  // On the COPY: no webhook (an audit posts to Slack/Discord when it
  // finishes) and no outgoing mail server, so nothing leaves this machine
  // in the user's name.
  for (const key of ["webhook.url", "smtp.host", "smtp.password"] as const) {
    await deleteSetting(key);
  }

  console.log(`\nRunning the nightly sweep without: ${[...SKIP].join(", ")}\n`);
  const started = Date.now();
  const report = await runDailyAgentBody({ skip: SKIP });
  await persistDailyReport(report);
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`Finished in ${mins} min — ${report.steps.length} jobs\n`);

  for (const s of report.steps) {
    const mark = s.ok ? "\x1b[32m ok \x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    const what = s.ok ? `${s.note?.key ?? "—"} ${JSON.stringify(s.note?.params ?? {})}` : s.error ?? "";
    console.log(
      `  ${mark} ${s.name.padEnd(24)} ${String(Math.round(s.durationMs / 1000) + "s").padStart(5)}  ${what.slice(0, 90)}`,
    );
  }
  console.log();

  check("no skipped job ran", report.steps.every((s) => !SKIP.has(s.name)));
  check("every job reported a boolean outcome", report.steps.every((s) => typeof s.ok === "boolean"));
  // "ok" with no note is indistinguishable from a no-op.
  const silent = report.steps.filter((s) => s.ok && !s.note);
  check("no job reports success without saying what it did", silent.length === 0, silent.map((s) => s.name));

  console.log("\nThe result is kept");
  const stored = await readDailyReport();
  check("a report was stored", stored !== null);
  if (stored) {
    check("it holds every job, not a count", stored.steps.length === report.steps.length);
    check("it keeps each job's note", stored.steps.every((s) => !s.ok || Boolean(s.note)));
    console.log(`\n  summary: ${summariseDailyReport(stored)}`);
  }

  console.log("\nA failing job reaches the install-health report");
  const { setSetting } = await import("../src/lib/settings-store");
  const { runHealthChecks } = await import("../src/lib/install-health");
  // Force one failure on the COPY, so the path is exercised even when
  // every job passed.
  if (stored) {
    await setSetting("daily_agent.last_report", {
      ...stored,
      steps: [
        ...stored.steps,
        { name: "sitemap.health", ok: false, error: "forced failure (check script)", durationMs: 1 },
      ],
    });
  }
  const issues = await runHealthChecks();
  const nightly = issues.find((i) => i.kind === "nightly_jobs_failing");
  check("the health report mentions it", Boolean(nightly), issues.map((i) => i.kind));
  check("and names the job", Boolean(nightly?.jobs?.includes("sitemap.health")), nightly?.jobs);
  // Put the real result back.
  if (stored) await setSetting("daily_agent.last_report", stored);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`\nRan against ${dbPath}, not the live database.\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
