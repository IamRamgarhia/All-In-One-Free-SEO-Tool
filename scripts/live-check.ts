/**
 * Live smoke check against real external services.
 *
 * Unit tests use fixtures, which is right — they must not break because
 * a third party had a bad day. But fixtures also can't tell you that
 * Google changed its SERP markup, and that is the failure mode this
 * codebase is most exposed to. This script is the deliberate other half:
 * run it by hand when you want to know whether the real world still
 * matches our assumptions.
 *
 *   pnpm exec tsx scripts/live-check.ts            # no API key needed
 *   pnpm exec tsx scripts/live-check.ts --ai       # also exercise AI
 *   pnpm exec tsx scripts/live-check.ts --rank     # also hit a SERP
 *
 * Deliberately NOT part of CI: it depends on external sites being up
 * and would produce red builds for reasons nobody can fix.
 *
 * Plain .ts, not .mts: .mts forces strict ESM, and named imports from
 * the app's transpiled modules fail to resolve under that loader.
 */

import { runAudit } from "../src/lib/audit";
import { guardUrl } from "../src/lib/url-guard";
import { fetchRobotsPolicy, isAllowed } from "../src/lib/robots-policy";

const AI = process.argv.includes("--ai");
const RANK = process.argv.includes("--rank");

let pass = 0;
let fail = 0;

function ok(label: string, detail = "") {
  pass++;
  console.log(`  PASS  ${label}${detail ? "  — " + detail : ""}`);
}
function bad(label: string, detail = "") {
  fail++;
  console.log(`  FAIL  ${label}${detail ? "  — " + detail : ""}`);
}
function section(t: string) {
  console.log("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72));
}

async function ssrf() {
  section("SSRF guard — every one of these must be refused");
  const targets = [
    "http://localhost:3000/",
    "http://127.0.0.1:6379/",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.1/",
    "http://10.0.0.1/",
    "file:///etc/passwd",
    "http://metadata.google.internal/",
  ];
  for (const t of targets) {
    const v = await guardUrl(t);
    if (v.ok) bad(`allowed ${t}`);
    else ok(`refused ${t}`, v.reason.slice(0, 52));
  }

  // And a real public URL must still be allowed — a guard that blocks
  // everything passes the tests above while breaking the product.
  const good = await guardUrl("https://example.com/");
  if (good.ok) ok("allowed https://example.com");
  else bad("blocked a public URL!", good.reason);
}

async function robots() {
  section("robots.txt — parsed from live sites");
  for (const origin of ["https://www.wikipedia.org", "https://www.bbc.co.uk"]) {
    try {
      const p = await fetchRobotsPolicy(origin, "SeoToolBot");
      if (p.unreachable) {
        bad(`${origin} robots.txt unreachable`);
        continue;
      }
      const root = isAllowed(p, "/");
      ok(
        `${origin}`,
        `${p.rules.length} rules, crawl-delay=${p.crawlDelaySec ?? "none"}, "/" ${root ? "allowed" : "disallowed"}`,
      );
    } catch (e) {
      bad(`${origin}`, (e as Error).message);
    }
  }
}

async function audit() {
  section("Audit crawler — real site, real findings");
  const t0 = Date.now();
  const r = await runAudit("https://example.com", {
    maxPages: 3,
    maxDepth: 1,
    renderJs: false,
  });
  const ms = Date.now() - t0;

  if (r.pagesCrawled > 0) ok("crawled", `${r.pagesCrawled} page(s) in ${ms}ms`);
  else bad("crawled nothing", r.findings[0]?.message ?? "");

  if (r.score >= 0 && r.score <= 100) ok("score in range", `${r.score}/100`);
  else bad("score out of range", String(r.score));

  if (r.findings.length > 0) {
    ok("produced findings", `${r.findings.length}`);
    for (const f of r.findings.slice(0, 6)) {
      console.log(`         [${f.severity.padEnd(8)}] ${f.type}`);
    }
  } else bad("no findings at all");

  // Score stability is the property the audit fix was about: crawling
  // deeper must not change the grade for the same site.
  const deep = await runAudit("https://example.com", {
    maxPages: 10,
    maxDepth: 2,
    renderJs: false,
  });
  const drift = Math.abs(deep.score - r.score);
  if (drift <= 5)
    ok("score stable across crawl depth", `${r.score} vs ${deep.score}`);
  else
    bad(
      "score moved with crawl depth",
      `${r.score} -> ${deep.score} (the sqrt bug's signature)`,
    );
}

async function rank() {
  section("Rank tracking — live SERP (slow, launches a browser)");
  const { checkRank } = await import("../src/lib/rank-checker");
  const r = await checkRank("wikipedia", "wikipedia.org", { device: "desktop" });
  console.log(`         engine=${r.engine} scanned=${r.resultsScanned} pos=${r.position}`);
  if (r.error) {
    bad("rank check errored", r.error.slice(0, 80));
    return;
  }
  if (r.resultsScanned === 0) {
    bad("scanned 0 results", "selector drift, or blocked — the exact bug we fixed");
    return;
  }
  ok("scanned results", `${r.resultsScanned} on ${r.engine}`);
  if (r.position !== null && r.position <= 5)
    ok("found wikipedia.org near the top", `position ${r.position}`);
  else if (r.position !== null) ok("found, lower than expected", `position ${r.position}`);
  else bad("did not find wikipedia.org for query 'wikipedia'", "suspicious");
}

async function ai() {
  section("AI provider — live call through the real dispatch path");
  const { callAIResult } = await import("../src/lib/ai-call");
  const { getActiveProvider } = await import("../src/lib/api-keys");

  const provider = await getActiveProvider();
  if (!provider) {
    bad("no AI provider configured", "add a key in Settings → AI first");
    return;
  }
  ok("active provider", provider);

  const t0 = Date.now();
  const r = await callAIResult({
    system: "You are terse. Answer in exactly one short sentence.",
    user: "In one sentence: what is a canonical tag in SEO?",
    maxTokens: 120,
    feature: "general",
  });
  const ms = Date.now() - t0;

  if (r.ok) {
    ok("AI call succeeded", `${ms}ms`);
    console.log(`         "${r.text.slice(0, 140)}"`);
  } else {
    bad("AI call failed", `[${r.failure.reason}] ${r.failure.message}`);
    console.log("         ^ this is the readable failure the audit added;");
    console.log("           it used to surface as an empty box.");
  }

  // The failure path is worth exercising too — a bad model id should
  // produce a specific, actionable message, not a generic null.
  const bogus = await callAIResult({
    system: "x",
    user: "x",
    maxTokens: 10,
    modelOverride: "definitely-not-a-real-model-9z8x",
  });
  if (!bogus.ok && bogus.failure.reason === "unknown_model")
    ok("bad model id classified correctly", bogus.failure.message.slice(0, 60));
  else if (!bogus.ok)
    ok(`bad model id -> ${bogus.failure.reason}`, bogus.failure.message.slice(0, 60));
  else bad("a nonsense model id somehow succeeded");
}

async function main() {
  await ssrf();
  await robots();
  await audit();
  if (RANK) await rank();
  else console.log("\n(skipping live SERP — pass --rank to include it)");
  if (AI) await ai();
  else console.log("(skipping AI — pass --ai to include it)");

  console.log("\n" + "=".repeat(72));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nCRASHED:", e);
  process.exit(1);
});
