/**
 * Which unattended checks fail every night, and why.
 *
 * The scheduler reports "27 of 38 checks ran — 11 could not" and that
 * number is the only trace: `tool_runs` has no status column, so a
 * failed check writes NO row. Which tools are broken, and for what
 * reason, is recorded nowhere — the sweep captures `{ toolId, ok, error }`
 * and summariseSweep reduces it to a count.
 *
 * This runs the real sweep against a COPY and prints the per-check
 * outcome, which is the first time anyone can see it.
 *
 *   pnpm exec tsx scripts/sweep-failures-check.ts [daily|weekly]
 *
 * Hits the network — it crawls and calls APIs exactly as the nightly
 * sweep does — so it takes minutes.
 */
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "sweep-check-"));
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

const CADENCE = (process.argv[2] === "weekly" ? "weekly" : "daily") as
  | "daily"
  | "weekly";

async function main() {
  const { tickToolSweep } = await import("../src/lib/tool-sweep");
  const { summariseSweep, sweepDegraded } = await import("../src/lib/sweep-summary");
  const { db } = await import("../src/db/client");
  const { clients } = await import("../src/db/schema");

  const names = new Map(
    (await db.select({ id: clients.id, name: clients.name }).from(clients)).map(
      (c) => [c.id, c.name],
    ),
  );

  console.log(`\nRunning the ${CADENCE} sweep (minutes — it crawls)…\n`);
  const started = Date.now();
  const out = await tickToolSweep(CADENCE);
  const mins = ((Date.now() - started) / 60000).toFixed(1);

  const failed = out.filter((o) => !o.ok);
  const ok = out.filter((o) => o.ok);

  console.log(`${out.length} checks in ${mins} min — ${ok.length} ok, ${failed.length} failed\n`);

  if (failed.length > 0) {
    console.log("FAILED:");
    // Grouped by reason, because 11 failures are usually two causes.
    const byReason = new Map<string, string[]>();
    for (const f of failed) {
      const reason = (f.error ?? "(no reason recorded)").slice(0, 120);
      const label = `${f.toolId} · ${names.get(f.clientId) ?? f.clientId}`;
      byReason.set(reason, [...(byReason.get(reason) ?? []), label]);
    }
    for (const [reason, tools] of [...byReason].sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      console.log(`\n  ${tools.length}×  ${reason}`);
      for (const t of tools) console.log(`        ${t}`);
    }
  }

  console.log(`\n\nOK: ${ok.map((o) => o.toolId).join(", ")}`);

  console.log(`\n\nWhat the scheduler would say: ${summariseSweep(out)}`);
  console.log(`Degraded: ${sweepDegraded(out)}`);

  // ── and what the user is actually told about it ─────────────────────
  //
  // The whole point of recording the failures is that "11 could not"
  // becomes something a person can act on. Run in the same process
  // against the same copy, so the record the sweep just wrote is the one
  // being read back.
  console.log("\n\nWhat the health report makes of it:\n");
  const { readSweepFailures } = await import("../src/lib/tool-sweep");
  const record = await readSweepFailures();
  console.log(
    `  recorded: ${
      record
        ? `${record.failures.length} failures of ${record.total} checks`
        : "NOTHING — the record was not written"
    }`,
  );

  const { runHealthChecks } = await import("../src/lib/install-health");
  const issues = (await runHealthChecks()).filter((i) =>
    i.id.startsWith("sweep_failing_"),
  );
  if (issues.length === 0) {
    console.log("  no sweep issue raised — the grouping did not fire");
  }
  for (const i of issues) {
    console.log(`\n  [${i.severity}] ${i.title}`);
    console.log(`     ${i.evidence.slice(0, 230)}`);
    console.log(`     → ${i.fixLabel}: ${i.fixHref}`);
  }

  console.log(`\nRan against ${dbPath}, not the live database.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
