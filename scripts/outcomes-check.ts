/**
 * Runs the fix-outcome measurement against a copy of the real database.
 *
 * The pure logic has 23 tests. What this checks is the part that can
 * only be wrong against real data: that a client whose Search Console
 * cannot be read gets an EXPLANATION rather than an empty report, and
 * that applied changes with no measurable window are reported as too
 * early rather than as zero effect.
 *
 * Those two are the whole risk. "Your changes did nothing" and "we
 * cannot see your Search Console" rendering the same thing is a claim
 * that would be quoted to a paying client.
 *
 *   pnpm exec tsx scripts/outcomes-check.ts
 */
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "outcomes-check-"));
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
  const { measureFixOutcomes } = await import("../src/lib/fix-outcomes-data");
  const { eq, inArray, and } = await import("drizzle-orm");

  const rows = await db
    .select({ id: clients.id, name: clients.name, gsc: clients.gscProperty })
    .from(clients);

  console.log();
  for (const c of rows) {
    const applied = await db
      .select({ id: agentActions.id })
      .from(agentActions)
      .where(
        and(
          eq(agentActions.clientId, c.id),
          inArray(agentActions.status, ["applied", "verified"]),
        ),
      );

    console.log(
      `── ${c.name}: ${applied.length} applied change(s), gsc ${c.gsc ? "set" : "none"}`,
    );

    const r = await measureFixOutcomes(c.id);

    if (applied.length === 0) {
      check(
        `${c.name}: nothing applied, so nothing claimed`,
        r.outcomes.length === 0 && r.unavailable === null,
        { outcomes: r.outcomes.length, unavailable: r.unavailable },
      );
      check(
        `${c.name}: says so rather than reporting a zero result`,
        r.rollup.summary.includes("No changes have been applied"),
        r.rollup.summary,
      );
      console.log();
      continue;
    }

    // With changes applied, the one thing that must never happen is a
    // silent empty report.
    const explained = r.unavailable !== null || r.outcomes.length > 0;
    check(`${c.name}: applied changes are either measured or explained`, explained, {
      unavailable: r.unavailable?.slice(0, 80),
      outcomes: r.outcomes.length,
    });

    if (r.unavailable) {
      // On this install every client 403s, so this is the live path.
      check(
        `${c.name}: the explanation names Search Console as the reason`,
        /search console/i.test(r.unavailable),
        r.unavailable.slice(0, 120),
      );
      check(
        `${c.name}: and does NOT claim the changes had no effect`,
        !/no effect|did nothing|0 clicks/i.test(r.unavailable),
        r.unavailable.slice(0, 120),
      );
      console.log(`     ${r.unavailable}`);
    } else {
      console.log(`     ${r.rollup.summary}`);
      const measured = r.outcomes.filter((o) => o.confidence === "measured");
      check(
        `${c.name}: every measured row carries the no-attribution caveat`,
        measured.every((o) => o.summary.includes("not attributed")),
      );
      check(
        `${c.name}: no row reports a percentage while too early`,
        r.outcomes
          .filter((o) => o.confidence === "too_early")
          .every((o) => !/up \d+%|down \d+%/.test(o.summary)),
      );
      for (const o of r.outcomes.slice(0, 4)) {
        console.log(`       [${o.confidence}] ${o.kind} ${o.url}`);
      }
    }
    console.log();
  }

  // ── Seeded cases ────────────────────────────────────────────────────
  //
  // Every client on this install has ZERO applied changes, so the
  // branches that matter most here — "applied, but Search Console will
  // not answer" and "applied too recently to judge" — were not executed
  // by any of the above. A check that only runs the paths the current
  // data happens to reach is a check that passes for the wrong reason.
  console.log("── Seeded: applied changes with no Search Console property");
  const [noGsc] = await db
    .insert(clients)
    .values({ name: "Outcomes fixture (no GSC)", url: "https://fixture.invalid" })
    .returning({ id: clients.id });

  const old = new Date();
  old.setUTCDate(old.getUTCDate() - 90);
  await db.insert(agentActions).values({
    clientId: noGsc.id,
    kind: "write_title",
    targetUrl: "https://fixture.invalid/page",
    risk: "safe",
    status: "verified",
    appliedAt: old,
  });

  const rNoGsc = await measureFixOutcomes(noGsc.id);
  check(
    "no property: explains itself instead of returning an empty report",
    rNoGsc.unavailable !== null,
    rNoGsc.unavailable,
  );
  check(
    "no property: names Search Console",
    /search console/i.test(rNoGsc.unavailable ?? ""),
  );
  check(
    "no property: does not claim the change had no effect",
    !/no effect|did nothing/i.test(rNoGsc.unavailable ?? ""),
  );
  check(
    "no property: the rollup reports nothing measured",
    rNoGsc.rollup.measured === 0,
    rNoGsc.rollup.measured,
  );
  console.log(`     ${rNoGsc.unavailable}`);
  console.log();

  console.log("── Seeded: a change applied yesterday (too early to judge)");
  const [gscClient] = await db
    .insert(clients)
    .values({
      name: "Outcomes fixture (too early)",
      url: "https://fixture2.invalid",
      // A property string is enough to get past the no-property branch;
      // the API call then fails, which is the other path worth covering.
      gscProperty: "https://fixture2.invalid/",
    })
    .returning({ id: clients.id });

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  await db.insert(agentActions).values({
    clientId: gscClient.id,
    kind: "write_meta_description",
    targetUrl: "https://fixture2.invalid/page",
    risk: "safe",
    status: "verified",
    appliedAt: yesterday,
  });

  const rEarly = await measureFixOutcomes(gscClient.id);
  check(
    "too early: reported as too_early, not as zero effect",
    rEarly.outcomes.length === 1 && rEarly.outcomes[0].confidence === "too_early",
    rEarly.outcomes.map((o) => o.confidence),
  );
  check(
    "too early: no API call was needed to say so",
    rEarly.unavailable === null,
    rEarly.unavailable,
  );
  check(
    "too early: the summary says how long to wait",
    /day/.test(rEarly.outcomes[0]?.summary ?? ""),
    rEarly.outcomes[0]?.summary,
  );
  check(
    "too early: the rollup says none measurable rather than a zero total",
    rEarly.rollup.summary.includes("none measurable yet"),
    rEarly.rollup.summary,
  );
  console.log(`     ${rEarly.outcomes[0]?.summary}`);
  console.log(`     rollup: ${rEarly.rollup.summary}`);
  console.log();

  console.log(`${pass} passed, ${fail} failed`);
  console.log(`\nRan against ${dbPath}, not the live database.\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
