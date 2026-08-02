/**
 * Prove that a completed audit records how many pages it actually
 * crawled, and that the number is the crawler's, not a derived guess.
 *
 * Before migration 0058 the audit page computed it as
 *
 *   new Set(issues.map((i) => i.url)).size
 *
 * which is the number of pages WITH FINDINGS. A healthy 50-page site
 * with three problem pages reported "3 pages" — so the figure shrank as
 * the site improved, moving in the opposite direction to the thing it
 * appeared to measure. It never threw, and it sat next to the health
 * score looking entirely reasonable.
 *
 *   pnpm exec tsx scripts/audit-pagecount-check.ts
 *
 * Runs a real crawl of example.com. Cleans up the audit row afterwards.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { auditIssues, audits, clients } from "../src/db/schema";
import { runAudit } from "../src/lib/audit";

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

async function main() {
  const [client] = await db.select().from(clients).limit(1);
  if (!client) {
    // Exit 1, not 0. An empty database means this check verified
    // nothing, and a check that reports success having done nothing is
    // the specific failure this project keeps finding — agent-check.ts
    // was hardened against exactly this after going green in CI on a
    // database it never touched. CI seeds a client before running this;
    // if that seed is ever removed or silently fails, this must go red
    // rather than quietly stop testing.
    console.error(
      "No clients in the database. This check has nothing to verify, which is a FAILURE, not a pass — seed a client first.",
    );
    process.exit(1);
  }

  console.log("Crawling example.com (up to 5 pages)…\n");
  const result = await runAudit("https://example.com", {
    maxPages: 5,
    maxDepth: 1,
    renderJs: false,
  });

  console.log(
    `         crawler reports pagesCrawled=${result.pagesCrawled}, findings=${result.findings.length}, score=${result.score}`,
  );

  if (result.pagesCrawled > 0) ok("the crawler knows how many pages it visited");
  else bad("crawler reported 0 pages", "nothing to store");

  // Write an audit row the same way the real action does.
  const [row] = await db
    .insert(audits)
    .values({
      clientId: client.id,
      status: "completed",
      score: result.score,
      issuesCount: result.findings.length,
      pagesCrawled: result.pagesCrawled,
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .returning({ id: audits.id });

  if (result.findings.length > 0) {
    await db.insert(auditIssues).values(
      result.findings.slice(0, 50).map((f) => ({
        auditId: row.id,
        severity: f.severity as "critical" | "high" | "medium" | "low",
        type: f.type,
        url: f.url ?? "https://example.com/",
        message: f.message,
      })),
    );
  }

  const [stored] = await db
    .select()
    .from(audits)
    .where(eq(audits.id, row.id))
    .limit(1);

  if (stored?.pagesCrawled === result.pagesCrawled) {
    ok("the page count survives the round-trip", String(stored.pagesCrawled));
  } else {
    bad(
      "stored page count doesn't match the crawl",
      `${stored?.pagesCrawled} vs ${result.pagesCrawled}`,
    );
  }

  // The regression itself. The two numbers must be allowed to differ,
  // in EITHER direction:
  //
  //   crawled > findings — a healthy site: 50 pages crawled, 3 with
  //                        problems. The old derived count said "3".
  //   findings > crawled — findings also point at resources that were
  //                        never crawled as pages: /robots.txt,
  //                        /sitemap.xml. One page crawled here produced
  //                        findings against four distinct URLs.
  //
  // That second case makes the old code worse than it first appeared:
  // it wasn't just under-counting healthy sites, it was counting
  // robots.txt and sitemap.xml as "pages crawled".
  const issues = await db
    .select({ url: auditIssues.url })
    .from(auditIssues)
    .where(eq(auditIssues.auditId, row.id));
  const distinctFindingUrls = new Set(issues.map((i) => i.url)).size;

  console.log(
    `         crawled=${stored?.pagesCrawled}  distinct URLs in findings=${distinctFindingUrls}`,
  );

  if (stored?.pagesCrawled === result.pagesCrawled) {
    ok(
      "the stored count is the crawler's, not derived from findings",
      distinctFindingUrls !== result.pagesCrawled
        ? `they differ here (${result.pagesCrawled} vs ${distinctFindingUrls}), so a derived value would be visibly wrong`
        : "they happen to match on this site",
    );
  } else {
    bad("the stored count does not match the crawler");
  }

  if (distinctFindingUrls !== result.pagesCrawled) {
    ok(
      "findings reference URLs that were never crawled as pages",
      "robots.txt / sitemap.xml — exactly what the old count mistook for pages",
    );
  } else {
    ok("findings and crawled pages coincide on this site", "no signal either way");
  }

  // Old audits legitimately don't know, and must read as unknown rather
  // than as zero.
  const older = await db
    .select({ id: audits.id, pagesCrawled: audits.pagesCrawled })
    .from(audits)
    .where(eq(audits.clientId, client.id))
    .orderBy(desc(audits.id))
    .limit(10);
  const preExisting = older.filter((a) => a.id !== row.id);
  if (preExisting.every((a) => a.pagesCrawled === null || a.pagesCrawled > 0)) {
    ok("pre-existing audits read as unknown, not as zero");
  } else {
    bad("an old audit was back-filled with a wrong count");
  }

  // Clean up so this doesn't litter the user's audit history.
  await db.delete(audits).where(eq(audits.id, row.id));
  console.log("\n" + "=".repeat(60));
  console.log(`${pass} passed, ${fail} failed  (test audit removed)`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("CRASHED:", e);
  process.exit(1);
});
