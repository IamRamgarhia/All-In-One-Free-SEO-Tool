/**
 * Build a proposal from a real audit and render it.
 *
 * The property being checked is restraint. A proposal is the one
 * document a prospect keeps and holds you to, so the failure that
 * matters isn't a crash — it's a scope line for work the site doesn't
 * need, or a promise nothing can support. Both read as professional.
 *
 *   pnpm exec tsx scripts/proposal-check.ts
 *
 * Creates a proposal row and deletes it afterwards.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { auditIssues, audits, clients, proposals } from "../src/db/schema";
import { buildProposal } from "../src/app/proposals/actions";
import { generateProposalPdf } from "../src/lib/proposal-pdf";
import { deriveScope } from "../src/lib/proposal-scope";

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

let createdId: number | null = null;

async function main() {
  const [client] = await db.select().from(clients).limit(1);
  if (!client) {
    console.log("No clients — add one and re-run.");
    process.exit(0);
  }

  section("Build from the latest audit");
  const created = await buildProposal({ clientId: client.id });
  if (!created.ok) {
    bad("could not create a proposal", created.error);
    finish();
    return;
  }
  createdId = created.id;
  ok("created", `id ${created.id}`);

  if (created.unmapped.length > 0) {
    // Not a failure — but it means the proposal understates the work,
    // and the person sending it needs to know.
    ok(
      `${created.unmapped.length} finding type(s) had no scope line`,
      created.unmapped.slice(0, 4).join(", "),
    );
  } else {
    ok("every finding type mapped to a scope line");
  }

  const [row] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, created.id))
    .limit(1);
  if (!row) {
    bad("the proposal row vanished");
    finish();
    return;
  }

  section("Scope traces to real findings");
  const [latest] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, client.id), eq(audits.status, "completed")))
    .orderBy(desc(audits.id))
    .limit(1);

  const findings = latest
    ? await db
        .select({ type: auditIssues.type, severity: auditIssues.severity })
        .from(auditIssues)
        .where(
          and(eq(auditIssues.auditId, latest.id), eq(auditIssues.status, "new")),
        )
    : [];

  const expected = deriveScope(findings);
  const stored = row.scopeJson ?? [];

  if (stored.length === expected.length) {
    ok("scope line count matches what the findings support", String(stored.length));
  } else {
    bad("scope doesn't match the findings", `${stored.length} vs ${expected.length}`);
  }

  const inflated = stored.filter((s) => s.findings <= 0);
  if (inflated.length === 0) ok("no scope line claims zero findings");
  else bad("a scope line covers nothing", `${inflated.length} line(s)`);

  const totalScoped = stored.reduce((n, s) => n + s.findings, 0);
  if (totalScoped <= findings.length) {
    ok(
      "scope never counts more findings than the audit produced",
      `${totalScoped} of ${findings.length}`,
    );
  } else {
    bad(
      "SCOPE OVERSTATES THE AUDIT",
      `${totalScoped} claimed vs ${findings.length} found`,
    );
  }

  if (row.basedOnAt) ok("cites the date it was based on");
  else bad("no date cited", "a proposal quoting an undated crawl invites doubt");

  section("Pricing is the user's, not ours");
  const pricing = row.pricingJson ?? [];
  if (pricing.length === 0) {
    ok("starts with no pricing", "the tool doesn't price someone else's labour");
  } else {
    bad("the tool invented pricing", JSON.stringify(pricing).slice(0, 80));
  }

  section("Renders to a PDF");
  const pdf = await generateProposalPdf({
    prospectName: row.prospectName,
    prospectUrl: row.prospectUrl,
    title: row.title,
    intro: "We looked at your site and here's what we'd tackle first.",
    scope: stored,
    pricing: [
      { label: "Initial technical fixes", detail: "One-off", amount: 1200 },
      { label: "Monthly retainer", detail: "Ongoing", amount: 900 },
    ],
    currency: "GBP",
    terms: "30 days notice either way.",
    basedOnScore: row.basedOnScore,
    basedOnAt: row.basedOnAt,
  });

  if (pdf.byteLength > 3000) {
    ok("PDF rendered", `${(pdf.byteLength / 1024).toFixed(0)} KB`);
  } else {
    bad("PDF is suspiciously small", `${pdf.byteLength} bytes`);
  }
  if (pdf.subarray(0, 4).toString() === "%PDF") ok("it is a real PDF");
  else bad("output isn't a PDF", pdf.subarray(0, 8).toString());

  // Currency formatting must survive a bad code rather than throwing —
  // a typo in a currency field should not break the document someone is
  // about to send a client.
  const oddCurrency = await generateProposalPdf({
    prospectName: "Test",
    prospectUrl: null,
    title: "Test",
    intro: null,
    scope: [],
    pricing: [{ label: "Work", detail: "", amount: 100 }],
    currency: "NOTACURRENCY",
    terms: null,
    basedOnScore: null,
    basedOnAt: null,
  });
  if (oddCurrency.byteLength > 1000) ok("a bad currency code doesn't break the PDF");
  else bad("a bad currency code broke rendering");

  finish();
}

function finish() {
  console.log("\n" + "=".repeat(70));
  console.log(`${pass} passed, ${fail} failed`);
  void cleanup().then(() => process.exit(fail > 0 ? 1 : 0));
}

async function cleanup() {
  if (createdId !== null) {
    await db
      .delete(proposals)
      .where(eq(proposals.id, createdId))
      .catch(() => undefined);
    console.log("(test proposal removed)");
  }
}

main().catch(async (e) => {
  console.error("CRASHED:", e);
  await cleanup();
  process.exit(1);
});
