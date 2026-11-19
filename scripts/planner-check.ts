/**
 * Runs the real planner against a copy of the real database.
 *
 * The traffic re-weighting and the already-queued dedupe both sit inside
 * planForClient, between filters, where a mistake does not throw — it
 * just plans the wrong work, or none. The unit tests cover the scorer in
 * isolation; this proves the planner still produces a plan with the new
 * steps in the path, against the actual findings on this install (789 of
 * them across three clients).
 *
 * It also checks the two things that are easy to get wrong and silent:
 *
 *   - with no Search Console property, the order must be LEFT ALONE
 *     rather than every page treated as zero-traffic. Every client here
 *     403s, so this is the live behaviour, not a hypothetical.
 *   - an action already queued must not be planned again. Five of the
 *     fourteen queued actions on this install were duplicates.
 *
 *   pnpm exec tsx scripts/planner-check.ts
 *
 * Read-only against a COPY. The live data.db is never opened.
 */
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "planner-check-"));
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
  const { db } = await import("../src/db/client");
  const { clients, agentActions } = await import("../src/db/schema");
  const { planForClient } = await import("../src/lib/agent/planner");
  const { detectCapabilities } = await import("../src/lib/agent/capabilities");
  const { AGENT_DEFAULTS } = await import("../src/lib/agent/autonomy-levels");
  const { eq } = await import("drizzle-orm");

  const rows = await db
    .select({ id: clients.id, name: clients.name, gsc: clients.gscProperty })
    .from(clients);
  console.log(`\n${rows.length} client(s) in the copy\n`);

  for (const c of rows) {
    console.log(`── ${c.name} (gsc ${c.gsc ? "set" : "none"})`);
    const capabilities = await detectCapabilities(c.id);
    // A generous cap so the per-run limit does not hide ordering.
    const settings = { ...AGENT_DEFAULTS, maxActionsPerRun: 50, maxActionsPerDay: 200 };

    const plan = await planForClient({ clientId: c.id, capabilities, settings });
    check(`${c.name}: planForClient returns a plan`, Array.isArray(plan.actions));
    console.log(
      `     planned ${plan.actions.length}, skipped ${plan.skipped.reduce((n, s) => n + s.count, 0)}`,
    );
    for (const s of plan.skipped) console.log(`       - ${s.count}× ${s.reason}`);

    // Weights must be finite and positive, or the sort is meaningless.
    const bad = plan.actions.filter(
      (a) => !Number.isFinite(a.weight) || a.weight <= 0,
    );
    check(`${c.name}: every weight is a positive finite number`, bad.length === 0, bad.map((a) => a.kind));

    // Descending by weight, which is what the ordering promises.
    const sorted = plan.actions.every(
      (a, i) => i === 0 || plan.actions[i - 1].weight >= a.weight,
    );
    check(`${c.name}: actions are ordered highest weight first`, sorted);

    // With no GSC property the reason lines must NOT claim impressions.
    if (!c.gsc) {
      const claimsTraffic = plan.actions.filter((a) =>
        /impression/i.test(a.reason),
      );
      check(
        `${c.name}: no traffic claims without a Search Console property`,
        claimsTraffic.length === 0,
        claimsTraffic.map((a) => a.reason.slice(0, 80)),
      );
    }

    // Nothing already queued may be re-planned.
    const queued = await db
      .select({ kind: agentActions.kind, targetUrl: agentActions.targetUrl })
      .from(agentActions)
      .where(eq(agentActions.clientId, c.id));
    const pending = new Set(
      queued.map((q) => `${q.kind}::${q.targetUrl ?? ""}`),
    );
    const redundant = plan.actions.filter((a) =>
      pending.has(`${a.kind}::${a.targetUrl ?? ""}`),
    );
    check(
      `${c.name}: nothing already in the queue was planned again`,
      redundant.length === 0,
      redundant.map((a) => `${a.kind} ${a.targetUrl}`),
    );

    if (plan.actions.length > 0) {
      console.log(`     top 3:`);
      for (const a of plan.actions.slice(0, 3)) {
        console.log(
          `       ${String(Math.round(a.weight)).padStart(4)}  ${a.kind.padEnd(24)} ${(a.targetUrl ?? "").slice(0, 46)}`,
        );
      }
    }
    console.log();
  }

  console.log(`${pass} passed, ${fail} failed`);
  console.log(`\nRan against ${dbPath}, not the live database.\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
