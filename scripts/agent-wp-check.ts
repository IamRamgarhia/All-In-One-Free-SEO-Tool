/**
 * The agent's automation loop, executed end to end.
 *
 * scripts/agent-check.ts runs the agent at its default autonomy, which
 * is suggest-only — so it proves the agent doesn't write, and never
 * touches the code that does. The write path is the entire product
 * claim: an SEO tool that fixes things rather than listing them. It had
 * never run.
 *
 * Two stand-ins make that testable with no keys and no live site:
 *   fake-wordpress.mjs  the CMS, speaking the plugin's REST protocol
 *   fake-ollama.mjs     the model, since Ollama's URL is configurable
 *
 * With those, this drives the real thing: capability detection, the
 * planner, per-image expansion, drafting, validation, the write, the
 * verification read-back, and undo — against a real SQLite database.
 *
 * The most important assertions here are the negative ones. Run with a
 * model that returns copy breaking every rule, and the agent must write
 * NOTHING. A "fix" that leaves a title still truncated, recorded as
 * success, is worse than no fix: the run log says it's handled and
 * nobody looks again.
 *
 *   pnpm exec tsx scripts/agent-wp-check.ts
 */

import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const WP_PORT = 8797;
// Two model servers on two ports, both up for the whole run. Switching
// between them is a change to OLLAMA_URL, which is read per call. The
// first version of this script restarted one server on one port and the
// OS hadn't released it yet — the replacement died on EADDRINUSE while
// the original kept answering, so a scenario ran against the wrong model
// and still looked like it passed.
const AI_GOOD_PORT = 8798;
const AI_BAD_PORT = 8799;
const WP_KEY = "fake-bridge-key";

// Must be set before anything imports the db client or reads config.
const dataDir = mkdtempSync(join(tmpdir(), "agent-wp-"));
process.env.SEO_DATA_DIR = dataDir;
process.env.SEO_DB_PATH = join(dataDir, "agent-wp.db");
process.env.OLLAMA_URL = `http://localhost:${AI_GOOD_PORT}`;
// Both stand-ins are on loopback, which the SSRF guard refuses by
// default and should. Same opt-in a self-hoster running WordPress in the
// same compose stack would set.
process.env.SEO_ALLOW_PRIVATE_WP_ENDPOINT = "1";

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
  console.log("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72));

const procs: ChildProcess[] = [];

function start(script: string, args: string[]): ChildProcess {
  const p = spawn(process.execPath, [join(HERE, script), ...args], {
    stdio: "ignore",
    env: process.env,
  });
  p.on("error", () => {});
  procs.push(p);
  return p;
}

function stopAll() {
  for (const p of procs) p.kill();
  procs.length = 0;
}

async function waitFor(check: () => Promise<boolean>): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/** The fake site's current state, read straight from its REST API. */
async function wpGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`http://localhost:${WP_PORT}/seo-tool/v1${path}`, {
    headers: { "x-stb-key": WP_KEY },
  });
  return (await res.json()) as Record<string, unknown>;
}

async function main() {
  section("Standing up a site and a model");

  start("fake-wordpress.mjs", [String(WP_PORT)]);
  const wpUp = await waitFor(async () => {
    const r = await fetch(`http://localhost:${WP_PORT}/seo-tool/v1/ping`, {
      headers: { "x-stb-key": WP_KEY },
    });
    return r.ok;
  });
  if (!wpUp) {
    bad("the fake WordPress never came up");
    return finish();
  }
  ok("fake WordPress is serving", `port ${WP_PORT}`);

  const modelUp = (port: number) =>
    waitFor(async () => {
      const r = await fetch(`http://localhost:${port}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "title" }] }),
      });
      return r.ok;
    });

  start("fake-ollama.mjs", [String(AI_GOOD_PORT)]);
  start("fake-ollama.mjs", [String(AI_BAD_PORT), "--bad"]);
  if (!(await modelUp(AI_GOOD_PORT)) || !(await modelUp(AI_BAD_PORT))) {
    bad("a fake model never came up");
    return finish();
  }
  ok("both fake models are answering", `${AI_GOOD_PORT} valid, ${AI_BAD_PORT} invalid`);

  // Prove they differ, so a scenario can't silently run against the
  // wrong one. Without this, the two phases below could both be talking
  // to the same server and every assertion would still look sane.
  const sample = async (port: number) => {
    const r = await fetch(`http://localhost:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: "You write page titles" }],
      }),
    });
    const j = (await r.json()) as { message?: { content?: string } };
    return j.message?.content ?? "";
  };
  const goodTitle = await sample(AI_GOOD_PORT);
  const badTitle = await sample(AI_BAD_PORT);
  if (goodTitle !== badTitle && goodTitle.length > 0 && badTitle.length > 0) {
    ok("the two models really are different", `${goodTitle.length} vs ${badTitle.length} chars`);
  } else {
    bad("both ports answer identically", "the scenarios below would be meaningless");
    return finish();
  }

  // Migrate before importing anything that opens the database.
  execFileSync(process.execPath, [join(HERE, "migrate.cjs")], {
    env: process.env,
    stdio: "pipe",
  });
  ok("schema migrated", "fresh database");

  section("Seeding a client with a CMS connected");

  const { db } = await import("../src/db/client");
  const { clients, audits, auditIssues, agentActions } = await import(
    "../src/db/schema"
  );
  const { eq } = await import("drizzle-orm");

  const [client] = await db
    .insert(clients)
    .values({
      name: "Soap Co",
      url: `http://localhost:${WP_PORT}`,
      wpEndpoint: `http://localhost:${WP_PORT}/seo-tool/v1`,
      wpKey: WP_KEY,
    })
    .returning();
  ok("client created with WordPress credentials", `id ${client.id}`);

  const [audit] = await db
    .insert(audits)
    .values({
      clientId: client.id,
      status: "completed",
      score: 42,
      issuesCount: 4,
      pagesCrawled: 1,
      completedAt: new Date(),
    })
    .returning();

  const pageUrl = `http://localhost:${WP_PORT}/hello-world`;
  await db.insert(auditIssues).values([
    {
      auditId: audit.id,
      severity: "high",
      type: "missing_title",
      url: pageUrl,
      message: "No title tag",
    },
    {
      auditId: audit.id,
      severity: "high",
      type: "missing_meta_description",
      url: pageUrl,
      message: "No meta description",
    },
    {
      auditId: audit.id,
      severity: "medium",
      type: "missing_image_alt",
      url: pageUrl,
      message: "Images without alt text",
    },
  ]);
  ok("audit seeded with three fixable findings");

  section("Capability detection — against a live plugin");

  const { detectCapabilities } = await import("../src/lib/agent/capabilities");
  const caps = await detectCapabilities(client.id);
  info(
    Object.entries(caps.byId)
      .map(([k, v]) => `${k}=${v.available}`)
      .join(" "),
  );
  if (caps.gaps.length > 0) info("gaps: " + caps.gaps.join(" | "));

  const titleCap = caps.byId.write_title;
  const altCap = caps.byId.write_image_alt;

  if (caps.canWrite) ok("the agent can write to this site");
  else bad("the agent reports it cannot write", caps.gaps.join(" | "));

  if (titleCap?.available) ok("title writing is available");
  else bad("title writing reported unavailable", "the plugin is connected");

  // This is the one that was silently false on every real site, because
  // /ping sends `plugin_version` and the client read `version`.
  if (altCap?.available) {
    ok("alt-text writing is available", "the 0.3.0 version gate opened");
  } else {
    bad("ALT TEXT REPORTED UNAVAILABLE", altCap?.missing ?? "no reason given");
  }

  section("A model that breaks every rule — the agent must write nothing");

  // Point the agent at the model that breaks every rule. No restarts:
  // getOllamaUrl reads this per call.
  process.env.OLLAMA_URL = `http://localhost:${AI_BAD_PORT}`;
  await wpGet("/reset");

  const { setAgentSettings } = await import("../src/lib/agent/autonomy");
  const raised = await setAgentSettings({ level: "apply_safe" });
  if (raised.level === "apply_safe") {
    info(
      `autonomy raised to "apply_safe" — perRun=${raised.maxActionsPerRun} perDay=${raised.maxActionsPerDay}`,
    );
  } else {
    bad("could not raise autonomy", raised.level);
    return finish();
  }

  const titleBefore = (await wpGet("/post/101/seo")).title;
  const { runAgentForClient } = await import("../src/lib/agent/run");
  const badRun = await runAgentForClient({
    clientId: client.id,
    trigger: "manual",
  });
  info(
    `planned=${badRun.planned} applied=${badRun.applied} failed=${badRun.failed}`,
  );

  const badActions = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.clientId, client.id));
  for (const a of badActions) {
    info(
      `${a.kind} status=${a.status} error=${(a.error ?? "(none)").slice(0, 70)}`,
    );
  }

  // Check EVERY field the agent could have touched, not just the title.
  // Asserting on one field would let a bad write to another pass as a
  // clean refusal — the narrow-assertion mistake this project has made
  // before.
  const seoAfterBad = await wpGet("/post/101/seo");
  const imagesAfterBad = (await wpGet("/post/101/images")) as {
    images: { attachmentId: number; alt: string }[];
  };
  const altsAfterBad = imagesAfterBad.images.map((i) => i.alt).join("|");
  if (
    seoAfterBad.title === titleBefore &&
    seoAfterBad.meta_description === "" &&
    altsAfterBad === "|Existing alt text"
  ) {
    ok("nothing on the site was modified", "title, description and alt all intact");
  } else {
    bad(
      "WROTE COPY THAT BREAKS ITS OWN RULES",
      `title="${seoAfterBad.title}" desc="${seoAfterBad.meta_description}" alts="${altsAfterBad}"`,
    );
  }
  if (badRun.applied === 0) ok("nothing was recorded as applied");
  else bad("recorded applied changes", String(badRun.applied));
  if (badRun.failed > 0) {
    ok("the refusals were counted as failures", `${badRun.failed}`);
  } else {
    bad("refusals were not reported", "a silent skip reads as 'nothing to do'");
  }

  const allRows = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.clientId, client.id));

  // Only failures need a reason. A `proposed` row is the agent working
  // correctly — see below.
  const rejected = allRows.filter((a) => a.status === "failed");
  const withReason = rejected.filter((a) => a.error && a.error.length > 10);
  if (rejected.length > 0 && withReason.length === rejected.length) {
    ok("every refusal says why", withReason[0].error?.slice(0, 58) ?? "");
  } else if (rejected.length === 0) {
    bad("no action rows at all", "a refusal that leaves no trace is invisible");
  } else {
    bad("some refusals recorded no reason");
  }

  // Internal linking edits the article body, so it is `needs_review` and
  // apply_safe must NOT write it — it goes to a human instead. This is
  // the safety property that makes the default autonomy level safe to
  // leave on for a site whose content someone cares about.
  const bodyEdits = allRows.filter((a) => a.kind === "write_internal_links");
  if (bodyEdits.length > 0 && bodyEdits.every((a) => a.status === "proposed")) {
    ok(
      "at apply_safe, a body edit is queued for review rather than written",
      `${bodyEdits.length} proposed`,
    );
  } else if (bodyEdits.length === 0) {
    info("no body edits were planned in this run");
  } else {
    bad(
      "A BODY EDIT WAS APPLIED AT apply_safe",
      bodyEdits.map((a) => a.status).join(","),
    );
  }

  section("A model that behaves — the agent must write, verify, and be able to undo");

  process.env.OLLAMA_URL = `http://localhost:${AI_GOOD_PORT}`;
  await wpGet("/reset");

  // Clear the previous run's actions and re-open the findings, so this
  // run plans the same work against a fresh site.
  await db.delete(agentActions).where(eq(agentActions.clientId, client.id));
  await db
    .update(auditIssues)
    .set({ status: "new" })
    .where(eq(auditIssues.auditId, audit.id));

  // apply_all, not apply_safe.
  //
  // Internal linking is deliberately `needs_review` — it edits the
  // article body, so at apply_safe it is queued for a human and nothing
  // is written. That is the right default, and it means the write path
  // can only be exercised at the top autonomy level. The risk level
  // itself is pinned in contract.test.ts so raising it here can't
  // quietly become raising it everywhere.
  await setAgentSettings({ level: "apply_all", maxActionsPerRun: 8 });
  info('autonomy raised to "apply_all" — body edits apply without review');

  const goodRun = await runAgentForClient({
    clientId: client.id,
    trigger: "manual",
  });
  info(
    `planned=${goodRun.planned} applied=${goodRun.applied} queued=${goodRun.queued} failed=${goodRun.failed}`,
  );
  info(goodRun.summary?.slice(0, 200) ?? "(no summary)");

  if (goodRun.applied > 0) {
    ok("the agent applied changes to the site", `${goodRun.applied}`);
  } else {
    bad(
      "THE AGENT APPLIED NOTHING",
      "with a working CMS, a working model and autonomy raised",
    );
  }

  const seoNow = await wpGet("/post/101/seo");
  if (seoNow.title && seoNow.title !== titleBefore) {
    ok("the title on the site actually changed", `"${seoNow.title}"`);
  } else {
    bad("the site's title is unchanged", String(seoNow.title));
  }

  const actions = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.clientId, client.id));
  info(
    "actions: " +
      actions.map((a) => `${a.kind}:${a.status}`).join(" ") || "(none)",
  );

  // "verified" means the executor read the value back off the site and
  // it matched. "applied" alone means we wrote and took the CMS's word
  // for it, which is how a write that silently did nothing looks.
  const verified = actions.filter((a) => a.status === "verified");
  if (verified.length > 0) {
    ok("at least one change was verified by reading it back", `${verified.length}`);
  } else {
    bad(
      "NOTHING WAS VERIFIED",
      "every write took the CMS's word for it",
    );
  }

  const altActions = actions.filter((a) => a.kind === "write_image_alt");
  if (altActions.length > 0) {
    ok("one page finding expanded into per-image actions", `${altActions.length}`);
    const images = (await wpGet("/post/101/images")) as {
      images: { attachmentId: number; alt: string }[];
    };
    const nowHasAlt = images.images.filter((i) => i.alt.trim() !== "").length;
    if (nowHasAlt === images.images.length) {
      ok("every image on the page now has alt text", `${nowHasAlt}`);
    } else {
      info(`${nowHasAlt}/${images.images.length} images have alt text`);
    }
  } else {
    bad("no alt-text actions were produced", "expansion didn't run");
  }

  section("Internal links — the orphan page");

  const linkActions = actions.filter((a) => a.kind === "write_internal_links");
  if (linkActions.length > 0) {
    ok("the agent found an orphan and planned a link to it", `${linkActions.length}`);
  } else {
    bad(
      "NO ORPHAN WAS FOUND",
      "/cold-process-soap is in the sitemap and linked from nowhere",
    );
  }

  // The link must be in the article body on the live page, not merely
  // accepted by the API.
  const linkedPage = await fetch(`http://localhost:${WP_PORT}/hello-world`);
  const linkedHtml = await linkedPage.text();
  if (/<a[^>]+href="[^"]*cold-process-soap"[^>]*>/i.test(linkedHtml)) {
    ok("the link is live on the page", "not just accepted by the API");
  } else {
    bad("THE LINK IS NOT ON THE PAGE", linkedHtml.slice(0, 120));
  }

  // The anchor must be words that were already on the page. Inventing
  // text and inserting it into someone's article is the thing this must
  // never do.
  const anchorMatch = linkedHtml.match(
    /<a[^>]+href="[^"]*cold-process-soap"[^>]*>([^<]+)<\/a>/i,
  );
  if (anchorMatch) {
    const anchor = anchorMatch[1];
    info(`anchor: "${anchor}"`);
    if (/cold process soap/i.test(anchor)) {
      ok("the anchor is text that was already in the article");
    } else {
      bad("UNEXPECTED ANCHOR", anchor);
    }
  }

  for (const a of linkActions) {
    if (a.cmsRevisionId !== null) {
      ok("the WordPress revision id was stored", `rev ${a.cmsRevisionId}`);
    } else {
      bad("NO REVISION ID STORED", "undo would have nothing to work with");
    }
  }

  // Every applied change must record enough to undo it. There are two
  // mechanisms: replay the previous value, or ask the CMS to restore
  // its own revision. A body edit can only use the second.
  const applied = actions.filter(
    (a) => a.status === "applied" || a.status === "verified",
  );
  const undoable = applied.filter((a) =>
    a.kind === "write_internal_links"
      ? a.cmsRevisionId !== null
      : a.beforeValue !== null && a.targetRef,
  );
  if (applied.length > 0 && undoable.length === applied.length) {
    ok("every applied change recorded enough to undo it", `${undoable.length}`);
  } else {
    bad(
      "SOME CHANGES CANNOT BE UNDONE",
      `${undoable.length} of ${applied.length} are reversible`,
    );
  }

  section("Undo — through the agent, not the bridge");

  const { revertAction } = await import("../src/lib/agent/executor");
  let reverted = 0;
  const revertFailed: string[] = [];
  for (const a of applied) {
    const r = await revertAction(a.id);
    if (r.ok) reverted++;
    else revertFailed.push(`${a.kind}: ${r.error}`);
  }
  if (revertFailed.length === 0 && reverted === applied.length) {
    ok("every applied change was undone", `${reverted}`);
  } else {
    bad("SOME UNDOS FAILED", revertFailed.join(" | ").slice(0, 150));
  }

  // Undoing a body edit goes through the CMS's own revision, not a
  // value we saved. If it doesn't work, the agent has edited someone's
  // article with no way back.
  const afterUndo = await fetch(`http://localhost:${WP_PORT}/hello-world`);
  const afterUndoHtml = await afterUndo.text();
  if (linkActions.length > 0) {
    if (!/href="[^"]*cold-process-soap"/i.test(afterUndoHtml)) {
      ok("the inserted link is gone from the article");
    } else {
      bad("THE LINK SURVIVED UNDO", "the article was left edited");
    }
    if (/handmade soap and cold process soap/i.test(afterUndoHtml)) {
      ok("the original sentence is intact", "restored, not just stripped");
    } else {
      bad("THE ARTICLE TEXT WAS NOT RESTORED");
    }
  }

  const seoReverted = await wpGet("/post/101/seo");
  if (seoReverted.title === titleBefore) {
    ok("the site is back to its original title", `"${seoReverted.title}"`);
  } else {
    bad(
      "UNDO DID NOT RESTORE THE SITE",
      `title is "${seoReverted.title}", was "${titleBefore}"`,
    );
  }

  finish();
}

function finish() {
  stopAll();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows sometimes holds the sqlite file open a moment longer.
  }
  console.log("\n" + "=".repeat(72));
  console.log(`${pass} passed, ${fail} failed`);
  console.log(
    "\nDrives the real planner, executor and undo against stand-ins for the\n" +
      "CMS and the model. Does NOT prove the WordPress PHP or any real model\n" +
      "behaves as assumed — both still need the real thing.",
  );
  // See wp-bridge-check.ts: exiting mid-socket-close trips a libuv
  // assertion on Windows and reports a crash for a run that passed.
  process.exitCode = fail > 0 ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
}

main().catch((e) => {
  stopAll();
  console.error("CRASHED:", e);
  process.exit(1);
});
