/**
 * Runs the real audit engine against a site built to be broken.
 *
 * The crawler emits 72 finding types. Before this, nothing in the repo
 * proved it detected any of them on an actual page — the tests checked
 * that the *lists* of finding names agreed with one another, which
 * catches drift and would not catch the crawler silently failing to
 * notice a missing title.
 *
 * Three things are checked, and the second matters as much as the first:
 *
 *   1. Every fixture produces the findings it says it should.
 *   2. No fixture produces findings it did not declare. A page built to
 *      have one problem that reports three has two false positives, and
 *      a crawler that cries wolf gets ignored — which is a worse failure
 *      than missing something.
 *   3. Coverage: which of the 72 types no fixture exercises. Printed
 *      every run so the untested surface is a number rather than a
 *      feeling.
 *
 *     pnpm test:fixtures
 */

import { runAudit, type AuditFinding } from "../src/lib/audit";
import { AUDIT_FINDING_TYPES } from "../src/lib/audit-finding-types";
import { FIXTURES, SITE_EXPECTATIONS } from "../fixtures/pages";
import { startFixtureServer } from "../fixtures/server";
import { VARIANTS } from "../fixtures/variants";

const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

async function main() {
  const fixtures = await startFixtureServer();
  console.log(c.dim(`fixture site on ${fixtures.baseUrl}`));

  let result;
  try {
    result = await runAudit(fixtures.baseUrl, {
      // The fixture server is on 127.0.0.1 and the guard blocks private
      // hosts by default, for good reasons that do not apply here.
      allowPrivateHosts: true,
      // Static HTML: a browser would add 20 seconds and change nothing.
      renderJs: false,
      maxPages: FIXTURES.length + 5,
      // Zero, and that is not a typo.
      //
      // The crawler seeds from sitemap.xml, so every fixture is already
      // at depth 0 — depth counts hops beyond the seed set, not clicks
      // from the home page. At depth 1 the crawler also visits the 404
      // that /http/broken-link points at, and once a URL has been
      // visited it reports bad_status on the target rather than
      // broken_link on the page that linked to it. Depth 0 crawls every
      // fixture and nothing else, which is exactly the shape this needs.
      maxDepth: 0,
    });
  } finally {
    await fixtures.close();
  }

  // Findings are reported per URL. Group them so each fixture can be
  // compared against its own declaration.
  const byPath = new Map<string, AuditFinding[]>();
  for (const f of result.findings) {
    let path: string;
    try {
      path = new URL(f.url).pathname;
    } catch {
      path = f.url;
    }
    byPath.set(path, [...(byPath.get(path) ?? []), f]);
  }

  let failures = 0;
  let checks = 0;
  const seenTypes = new Set<string>();
  let lastCategory = "";

  for (const fixture of FIXTURES) {
    if (fixture.category !== lastCategory) {
      console.log(`\n${c.bold(fixture.category)}`);
      lastCategory = fixture.category;
    }

    const got = new Set((byPath.get(fixture.path) ?? []).map((f) => f.type));
    for (const t of got) seenTypes.add(t);

    const missing = fixture.expect.filter((t) => !got.has(t));
    const tolerated = new Set<string>([
      ...fixture.expect,
      ...(fixture.tolerate ?? []),
      // The fixture server speaks plain HTTP, so every page legitimately
      // trips this. Tolerated everywhere rather than listed on each
      // fixture, because it says nothing about the page under test.
      "no_https",
    ]);
    const unexpected = [...got].filter((t) => !tolerated.has(t));

    checks++;
    if (missing.length === 0 && unexpected.length === 0) {
      console.log(`  ${c.green("ok")}    ${fixture.name}`);
      continue;
    }

    failures++;
    console.log(`  ${c.red("FAIL")}  ${fixture.name}  ${c.dim(fixture.path)}`);
    if (missing.length) {
      console.log(`        ${c.red("not detected:")} ${missing.join(", ")}`);
      console.log(`        ${c.dim(fixture.lesson)}`);
    }
    if (unexpected.length) {
      console.log(
        `        ${c.yellow("also reported:")} ${unexpected.join(", ")}`,
      );
      console.log(
        c.dim(
          "        Either the page is broken in a way it did not mean to be,\n" +
            "        or this is a false positive worth fixing in the crawler.",
        ),
      );
    }
  }

  // ---- findings nobody claimed ----------------------------------------
  //
  // The loop above only looks at paths that have a fixture, so anything
  // reported against /robots.txt, /sitemap.xml or a URL outside the
  // fixture set went unread. That hid a real bug: the site-wide checks
  // were fetching robots.txt without the private-host allowance, failing,
  // and reporting a robots.txt that was being served perfectly well.
  //
  // A finding with no fixture is not automatically wrong — but it is
  // always something nobody has looked at.
  const fixturePaths = new Set(FIXTURES.map((f) => f.path));
  const unclaimed = [...byPath.entries()].filter(([path]) => !fixturePaths.has(path));
  if (unclaimed.length > 0) {
    console.log(`\n${c.bold("Findings on paths with no fixture")}`);
    for (const [path, findings] of unclaimed) {
      const declared = new Set<string>(SITE_EXPECTATIONS[path] ?? []);
      const types = [...new Set(findings.map((f) => f.type))].filter(
        (t) => !declared.has(t),
      );
      if (types.length === 0) continue;
      console.log(`  ${c.yellow("?")}     ${path}  ${c.dim(types.join(", "))}`);
      failures++;
    }
    console.log(
      c.dim(
        "        Give each a fixture that declares it, or work out why the\n" +
          "        crawler is reporting it at all.",
      ),
    );
  }

  // ---- whole-site scenarios --------------------------------------------
  //
  // A site has one robots.txt, so "no robots.txt", "a malformed one" and
  // "one with a crawl-delay" cannot all be pages in the set above. Each
  // gets its own crawl of a deliberately tiny, otherwise-correct site.
  console.log(`\n${c.bold("Whole-site scenarios")}`);
  for (const v of VARIANTS) {
    const site = await startFixtureServer({ robots: v.robots, sitemap: v.sitemap });
    let r;
    try {
      r = await runAudit(site.baseUrl, {
        allowPrivateHosts: true,
        renderJs: false,
        maxPages: 5,
        maxDepth: 1,
      });
    } finally {
      await site.close();
    }

    const got = new Set(r.findings.map((f) => f.type));
    const missing = v.expect.filter((t) => !got.has(t));
    checks++;
    if (missing.length === 0) {
      console.log(`  ${c.green("ok")}    ${v.name}`);
    } else {
      failures++;
      console.log(`  ${c.red("FAIL")}  ${v.name}`);
      console.log(`        ${c.red("not detected:")} ${missing.join(", ")}`);
      console.log(`        ${c.dim(v.lesson)}`);
    }
  }

  // ---- coverage --------------------------------------------------------
  const declared = new Set([
    ...FIXTURES.flatMap((f) => f.expect),
    ...Object.values(SITE_EXPECTATIONS).flat(),
    ...VARIANTS.flatMap((v) => v.expect),
  ]);
  const uncovered = (AUDIT_FINDING_TYPES as readonly string[]).filter(
    (t) => !declared.has(t as never),
  );

  console.log(
    `\n${failures === 0 ? c.green(c.bold(`all ${checks} fixtures passed`)) : c.red(c.bold(`${failures} of ${checks} fixtures FAILED`))}`,
  );
  console.log(
    c.dim(
      `finding-type coverage: ${AUDIT_FINDING_TYPES.length - uncovered.length}/${AUDIT_FINDING_TYPES.length}`,
    ),
  );
  if (uncovered.length) {
    console.log(c.dim(`  no fixture yet for: ${uncovered.join(", ")}`));
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
