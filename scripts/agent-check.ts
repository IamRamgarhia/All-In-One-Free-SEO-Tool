/**
 * Drive the autonomous agent against the real database and assert it
 * behaves.
 *
 * The properties worth checking are all safety properties, and every one
 * of them is silent when broken. An agent that ignores its own cooldown
 * still produces a tidy run log. An agent that "applies" a change
 * without recording the previous value looks identical to one that did.
 * The failure is only visible later, on someone's live website.
 *
 *   pnpm exec tsx scripts/agent-check.ts
 *
 * Read-mostly: it runs at the default autonomy level ("suggest"), which
 * by definition writes nothing to any external site. It does write rows
 * to agent_runs / agent_actions in the local database, which is the
 * point — those rows are what it inspects.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { agentActions, agentRuns, clients } from "../src/db/schema";
import { getAgentSettings } from "../src/lib/agent/autonomy";
import { willAutoApply } from "../src/lib/agent/autonomy-levels";
import { detectCapabilities } from "../src/lib/agent/capabilities";
import { planForClient } from "../src/lib/agent/planner";
import { runAgentForClient } from "../src/lib/agent/run";

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
  console.log("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72));

async function main() {
  const all = await db.select().from(clients).limit(1);
  if (all.length === 0) {
    // Exit 1, not 0.
    //
    // This used to exit 0, which meant that on a fresh CI database the
    // step went green having asserted nothing at all — a passing agent
    // safety check for an agent that never ran. That is the third time
    // in this project a check has certified code it didn't execute, and
    // the pattern is always the same: an early return on "no data" that
    // reads as success.
    //
    // Refusing to pass is the correct behaviour for a safety check.
    // If there is nothing to check, that is a problem with the run, not
    // a clean bill of health.
    console.error(
      "No clients in the database. This check has nothing to verify, which is a FAILURE, not a pass — seed a client and an audit first.",
    );
    process.exit(1);
  }
  const client = all[0];
  console.log(`Agent check against client #${client.id} (${client.name})\n`);

  // ---------------------------------------------------------------
  section("Capabilities — the agent must know what it cannot do");
  const caps = await detectCapabilities(client.id);
  console.log(
    "         " +
      Object.values(caps.byId)
        .map((c) => `${c.id}=${c.available ? "yes" : "no"}`)
        .join("  "),
  );

  // The important property is not which capabilities exist — that
  // depends on what this install has connected — but that every missing
  // one explains itself. "Cannot write titles" with no reason leaves the
  // user with nothing to act on.
  const unexplained = Object.values(caps.byId).filter(
    (c) => !c.available && (!c.missing || c.missing.length < 20),
  );
  if (unexplained.length === 0) {
    ok("every missing capability says what to connect");
  } else {
    bad(
      "a missing capability gives no reason",
      unexplained.map((c) => c.id).join(", "),
    );
  }

  if (!caps.canWrite) {
    ok("no CMS connected, so canWrite is false", "the agent cannot touch the site");
  } else {
    ok("a CMS is connected", "the agent could write if autonomy allowed");
  }

  // ---------------------------------------------------------------
  section("Settings — the default must be the safe one");
  const settings = await getAgentSettings();
  console.log(
    `         level=${settings.level} perRun=${settings.maxActionsPerRun} perDay=${settings.maxActionsPerDay} cooldown=${settings.cooldownDays}d`,
  );

  if (settings.level === "suggest" || settings.level === "off") {
    ok("default autonomy does not write to live sites", settings.level);
  } else {
    ok(`autonomy is set to "${settings.level}"`, "deliberately raised");
  }

  // The one that must never regress: "suggest" writing to a site.
  if (
    !willAutoApply("suggest", "safe") &&
    !willAutoApply("suggest", "needs_review")
  ) {
    ok("suggest-only never auto-applies");
  } else {
    bad("SUGGEST-ONLY WOULD WRITE TO A LIVE SITE", "this is the whole promise");
  }

  if (settings.maxActionsPerRun <= 100 && settings.maxActionsPerRun >= 1) {
    ok("per-run cap is bounded", String(settings.maxActionsPerRun));
  } else {
    bad("per-run cap is out of range", String(settings.maxActionsPerRun));
  }

  // ---------------------------------------------------------------
  section("Planner — respects its own caps");
  const plan = await planForClient({ clientId: client.id, capabilities: caps, settings });
  console.log(
    `         planned ${plan.actions.length}; skipped: ${
      plan.skipped.map((s) => `${s.count} (${s.reason.slice(0, 40)}…)`).join(", ") ||
      "none"
    }`,
  );

  if (plan.actions.length <= settings.maxActionsPerRun) {
    ok("plan is within the per-run cap", `${plan.actions.length} ≤ ${settings.maxActionsPerRun}`);
  } else {
    bad(
      "PLAN EXCEEDS THE PER-RUN CAP",
      `${plan.actions.length} > ${settings.maxActionsPerRun} — the blast-radius limit is not being applied`,
    );
  }

  // Every planned action must be something we can actually carry out.
  // Planning work the executor can't do produces a run that looks busy
  // and changes nothing.
  const impossible = plan.actions.filter((a) => !caps.byId[a.kind]?.available);
  if (impossible.length === 0) {
    ok("every planned action is one we can actually perform");
  } else {
    bad(
      "planned work the agent has no way to carry out",
      impossible.map((a) => a.kind).join(", "),
    );
  }

  // One action per page+kind, or the agent edits the same page twice.
  const keys = plan.actions.map((a) => `${a.kind}::${a.targetUrl}`);
  if (new Set(keys).size === keys.length) {
    ok("no duplicate page+change pairs in the plan");
  } else {
    bad("the plan would edit the same page twice in one run");
  }

  // Every action must carry a reason the user can read.
  const mute = plan.actions.filter((a) => !a.reason || a.reason.length < 20);
  if (mute.length === 0) ok("every planned action explains itself");
  else bad("an action has no readable reason", String(mute.length));

  // ---------------------------------------------------------------
  section("Run — end to end against the real database");
  const before = await countActions(client.id);
  const result = await runAgentForClient({ clientId: client.id, trigger: "manual" });
  const after = await countActions(client.id);

  console.log(`         "${result.summary}"`);
  console.log(
    `         planned=${result.planned} applied=${result.applied} queued=${result.queued} failed=${result.failed} tasks=${result.tasksCreated}`,
  );

  // Check this FIRST and loudly. The previous version of this script
  // asserted only that the summary was long enough to read, so a run
  // that threw — the summary being the words "The run failed: desc is
  // not defined" — sailed through as a pass. A green check on a crashed
  // run is worse than no check: it actively says the thing works.
  if (result.summary.startsWith("The run failed")) {
    bad("THE RUN THREW", result.summary);
  } else if (result.summary.length > 10) {
    ok("the run completed and produced a readable summary");
  } else {
    bad("the run summary is empty or useless", JSON.stringify(result.summary));
  }

  if (result.runId !== null) {
    const [row] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, result.runId))
      .limit(1);
    if (row?.error) bad("the run row records an error", row.error);
    else ok("the run row records no error");
    if (row?.finishedAt) ok("the run recorded a finish time");
    else bad("the run never recorded a finish", "a crash would look like this");
    if (row?.mode) ok("the run recorded the autonomy level in force", row.mode);
  } else {
    ok("no run row", result.summary);
  }

  // The safety property that matters most at this level: nothing was
  // written to the live site.
  if (settings.level === "suggest" || settings.level === "off") {
    if (result.applied === 0) {
      ok("nothing was applied to the live site", "as suggest-only promises");
    } else {
      bad(
        "SUGGEST-ONLY APPLIED CHANGES TO A LIVE SITE",
        `${result.applied} change(s)`,
      );
    }
  }

  console.log(`         action rows: ${before} -> ${after}`);

  // ---------------------------------------------------------------
  section("Undo — every applied change must be reversible");
  const applied = await db
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.clientId, client.id),
        eq(agentActions.status, "applied"),
      ),
    )
    .orderBy(desc(agentActions.id))
    .limit(20);

  const verified = await db
    .select()
    .from(agentActions)
    .where(
      and(
        eq(agentActions.clientId, client.id),
        eq(agentActions.status, "verified"),
      ),
    )
    .limit(20);

  const live = [...applied, ...verified];
  if (live.length === 0) {
    ok("no applied changes yet", "nothing to undo, which is expected on suggest-only");
  } else {
    // This is the invariant. A change on someone's website with no
    // recorded previous value cannot be put back, and CLAUDE.md's rule
    // for CMS writes is preview → save previous → one-click undo.
    const irreversible = live.filter((a) => a.beforeValue === null);
    if (irreversible.length === 0) {
      ok(`all ${live.length} applied change(s) have a stored previous value`);
    } else {
      bad(
        "APPLIED CHANGES THAT CANNOT BE UNDONE",
        `${irreversible.length} row(s) with no beforeValue`,
      );
    }

    const unreferenced = live.filter((a) => !a.targetRef);
    if (unreferenced.length === 0) {
      ok("all applied changes recorded which page they edited");
    } else {
      bad(
        "applied changes with no page reference",
        `${unreferenced.length} — an undo could land on the wrong page`,
      );
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

async function countActions(clientId: number): Promise<number> {
  const rows = await db
    .select({ id: agentActions.id })
    .from(agentActions)
    .where(eq(agentActions.clientId, clientId));
  return rows.length;
}

main().catch((e) => {
  console.error("\nCRASHED:", e);
  process.exit(1);
});
