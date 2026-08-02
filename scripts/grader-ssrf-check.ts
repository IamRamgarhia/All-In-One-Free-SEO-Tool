/**
 * The public grader's two safety properties, exercised against the real
 * code path.
 *
 * Separate from grader-embed-check.mjs, and the split is the point. That
 * script's first version POSTed a plain form to /embed/grader and read
 * the response — but a Next server action needs its Next-Action id, so
 * the action never ran. Every SSRF target came back "refused" because
 * nothing had happened, and the script printed a row of green ticks for
 * code it had not executed.
 *
 * A green check on code that didn't run is worse than no check: it
 * actively certifies the thing it never tested. So this one imports the
 * action and calls it.
 *
 *   pnpm exec tsx scripts/grader-ssrf-check.ts
 *
 * Writes lead rows for anything that grades successfully; cleans up
 * after itself.
 */

import { inArray } from "drizzle-orm";
import { db } from "../src/db/client";
import { graderLeads } from "../src/db/schema";
import { gradeForVisitor } from "../src/app/embed/grader/actions";
import { __resetRateLimit, ipPrefix } from "../src/lib/grader-public";

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


const created: number[] = [];

async function main() {
  section("ipPrefix — visitors are not stored precisely");
  // A lead form should not turn a privacy-first tool into a visitor log.
  const cases: [string, string][] = [
    ["203.0.113.47", "203.0.113.0/24"],
    ["203.0.113.47, 70.41.3.18", "203.0.113.0/24"],
    ["2001:db8:85a3:8d3:1319:8a2e:370:7348", "2001:db8:85a3::/48"],
  ];
  for (const [input, expected] of cases) {
    const got = ipPrefix(input);
    if (got === expected) ok(`truncates ${input}`, got);
    else bad(`truncated ${input} wrongly`, `${got} != ${expected}`);
  }
  if (ipPrefix(null) === "unknown") ok("handles a missing IP");
  else bad("missing IP not handled");

  section("SSRF — a public crawler pointed inward");
  __resetRateLimit();
  const internal = [
    "http://127.0.0.1:22/",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.0.1/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "http://metadata.google.internal/",
  ];

  for (const target of internal) {
    __resetRateLimit(); // isolate SSRF from the rate limiter
    const r = await gradeForVisitor({ url: target, ip: "203.0.113.9", referer: null });
    if (r.ok) {
      created.push(r.leadId);
      bad(`GRADED AN INTERNAL ADDRESS: ${target}`, `score ${r.score}`);
    } else {
      ok(`refused ${target}`, r.error.slice(0, 46));
    }
  }

  section("The refusal must not confirm what's there");
  __resetRateLimit();
  const blocked = await gradeForVisitor({ url: "http://192.168.0.1/", ip: "203.0.113.9", referer: null });
  __resetRateLimit();
  const missing = await gradeForVisitor({ url: "https://nonexistent.invalid/", ip: "203.0.113.9", referer: null });
  if (!blocked.ok && !missing.ok && blocked.error === missing.error) {
    ok("internal and unreachable give the same message", "no address oracle");
  } else if (blocked.ok || missing.ok) {
    bad("one of the two unexpectedly graded");
  } else {
    bad(
      "different messages for internal vs unreachable",
      "an anonymous caller could map the network",
    );
  }

  section("Rate limiting");
  __resetRateLimit();
  let limitedAt: number | null = null;
  for (let i = 0; i < 10; i++) {
    const r = await gradeForVisitor({ url: `https://nonexistent-${i}.invalid/`, ip: "203.0.113.9", referer: null });
    if (r.ok) created.push(r.leadId);
    if (!r.ok && /quick succession/i.test(r.error)) {
      limitedAt = i + 1;
      break;
    }
  }
  if (limitedAt !== null) {
    ok("the limiter engages", `after ${limitedAt} attempts`);
  } else {
    bad(
      "no rate limit after 10 attempts",
      "an agency's VPS could be used as a free crawler",
    );
  }

  section("Cleanup");
  if (created.length) {
    await db.delete(graderLeads).where(inArray(graderLeads.id, created));
    ok(`removed ${created.length} test lead row(s)`);
  } else {
    ok("no lead rows created", "nothing graded, as expected");
  }

  console.log("\n" + "=".repeat(70));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("CRASHED:", e);
  if (created.length) {
    await db
      .delete(graderLeads)
      .where(inArray(graderLeads.id, created))
      .catch(() => undefined);
  }
  process.exit(1);
});
