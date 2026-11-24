/**
 * The developer ticket.
 *
 * CLAUDE.md Part 3.5 promised this and it was never built: "For
 * everything we can't auto-fix: generate exact code/instructions
 * specific to their CMS... Plus 'give my developer instructions' button
 * generating a clear ticket they can email/Slack."
 *
 * The risk in a document generator is not a crash, it is a ticket that
 * looks complete and is not — a heading with no steps under it, a
 * promised snippet that is missing, or advice presented as certain when
 * its explainer rated it "worth testing". A developer who gets one of
 * those once stops reading the next.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDevTicket, buildTicketForType, taskDescriptionFor } from "./dev-ticket";
import { AUDIT_FINDING_TYPES } from "./audit-finding-types";
import { getExplainer } from "./issue-explainers";

const f = (type: string, url: string, severity = "high") => ({
  type,
  severity,
  url,
  message: `${type} on ${url}`,
});

describe("every finding type produces a usable ticket", () => {
  it("all 68 crawler types yield steps, not just a heading", () => {
    // The generator is only as good as the explainers behind it, and
    // this is the assertion that keeps the two honest together. A type
    // with no reachable explainer would emit a section that states a
    // problem and offers nothing.
    const thin: string[] = [];
    for (const type of AUDIT_FINDING_TYPES as readonly string[]) {
      const md = buildTicketForType(type, [f(type, "https://example.com/a")], {
        clientName: "Test Co",
      });
      const hasSteps = /\n1\. /.test(md);
      const hasWhat = md.includes("**What it is.**");
      if (!hasSteps || !hasWhat) thin.push(type);
    }
    expect(
      thin,
      `These types produce a ticket with no actionable steps:\n  ${thin.join("\n  ")}`,
    ).toEqual([]);
  });

  it("carries the confidence level, so a reader can triage", () => {
    // "Definitely fix this" and "worth testing" deserve different
    // amounts of someone's afternoon. Dropping the distinction is how a
    // ticket turns into 40 equally-urgent lines.
    const md = buildTicketForType("missing_title", [f("missing_title", "https://example.com/")], {
      clientName: "Test Co",
    });
    expect(md).toContain("**Confidence.**");
  });

  it("includes the code snippet and its undo when the explainer has one", () => {
    const withSnippet = (AUDIT_FINDING_TYPES as readonly string[]).find(
      (t) => getExplainer(t)?.snippet,
    );
    expect(withSnippet, "no explainer has a snippet any more").toBeTruthy();
    const md = buildTicketForType(withSnippet!, [f(withSnippet!, "https://example.com/")], {
      clientName: "Test Co",
    });
    expect(md).toContain("```");
    // An undo line is not optional. Handing someone code to paste into a
    // live theme without telling them how to reverse it is the part that
    // would make this irresponsible rather than helpful.
    expect(md).toContain("**To undo.**");
  });

  it("links Google's own documentation when the explainer cites it", () => {
    const withDoc = (AUDIT_FINDING_TYPES as readonly string[]).find(
      (t) => getExplainer(t)?.googleDoc,
    );
    const md = buildTicketForType(withDoc!, [f(withDoc!, "https://example.com/")], {
      clientName: "Test Co",
    });
    expect(md).toContain("https://");
  });
});

describe("grouping and ordering", () => {
  it("groups by type rather than emitting one ticket per URL", () => {
    // 40 pages missing a meta description is one job. Forty sections for
    // it is how a developer learns to ignore the tool.
    const md = buildDevTicket(
      [
        f("missing_meta_description", "https://example.com/a"),
        f("missing_meta_description", "https://example.com/b"),
        f("missing_meta_description", "https://example.com/c"),
      ],
      { clientName: "Test Co" },
    );
    expect((md.match(/^## /gm) ?? []).length).toBe(1);
    expect(md).toContain("Affects 3 pages");
  });

  it("puts critical before high before medium", () => {
    const md = buildDevTicket(
      [
        f("long_title", "https://example.com/a", "medium"),
        f("missing_title", "https://example.com/b", "critical"),
        f("missing_canonical", "https://example.com/c", "high"),
      ],
      { clientName: "Test Co" },
    );
    const order = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(order[0]).toMatch(/Missing title/i);
    expect(order[1]).toMatch(/Missing canonical/i);
  });

  it("at equal severity, the issue affecting more pages comes first", () => {
    const md = buildDevTicket(
      [
        f("long_title", "https://example.com/a"),
        f("missing_canonical", "https://example.com/b"),
        f("missing_canonical", "https://example.com/c"),
      ],
      { clientName: "Test Co" },
    );
    const order = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(order[0]).toMatch(/Missing canonical/i);
  });

  it("caps the URL list and says how many were left out", () => {
    // A 400-page site would otherwise produce a ticket nobody scrolls.
    const many = Array.from({ length: 40 }, (_, i) =>
      f("long_title", `https://example.com/p${i}`),
    );
    const md = buildTicketForType("long_title", many, {
      clientName: "Test Co",
      maxUrlsPerType: 5,
    });
    expect(md).toContain("…and 35 more");
  });

  it("deduplicates repeated URLs rather than inflating the count", () => {
    const md = buildTicketForType(
      "long_title",
      [f("long_title", "https://example.com/x"), f("long_title", "https://example.com/x")],
      { clientName: "Test Co" },
    );
    expect(md).toContain("Affects 1 page");
  });

  it("says so plainly when there is nothing to report", () => {
    expect(buildDevTicket([], { clientName: "Test Co" })).toContain(
      "No outstanding findings",
    );
  });

  it("names the client and the site in the header", () => {
    const md = buildDevTicket([f("long_title", "https://example.com/")], {
      clientName: "Acme Ltd",
      siteUrl: "https://acme.example",
    });
    expect(md).toContain("# SEO fixes for Acme Ltd");
    expect(md).toContain("https://acme.example");
  });
});

describe("the task description the agent writes", () => {
  it("leads with what to do, not with a list of URLs", () => {
    // It used to be "- url / message" lines only. These are the findings
    // the agent CANNOT fix, so the task is all the user gets.
    const d = taskDescriptionFor("missing_meta_description", [
      f("missing_meta_description", "https://example.com/a"),
    ]);
    expect(d).toContain("What to do:");
    expect(d).toMatch(/\n1\. /);
    const firstUrlAt = d.indexOf("https://example.com/a");
    const stepsAt = d.indexOf("What to do:");
    expect(stepsAt).toBeLessThan(firstUrlAt);
  });

  it("still lists the affected pages, with a count", () => {
    const d = taskDescriptionFor("long_title", [
      f("long_title", "https://example.com/a"),
      f("long_title", "https://example.com/b"),
    ]);
    expect(d).toContain("Affected pages (2):");
    expect(d).toContain("https://example.com/b");
  });

  it("names the file when the fix is code", () => {
    const withSnippet = (AUDIT_FINDING_TYPES as readonly string[]).find(
      (t) => getExplainer(t)?.snippet,
    )!;
    const d = taskDescriptionFor(withSnippet, [f(withSnippet, "https://example.com/")]);
    expect(d).toContain("Code goes in:");
  });

  it("works for a type with no explainer rather than throwing", () => {
    // Should not happen — all 68 are covered — but a task that fails to
    // render would stop the whole agent run.
    const d = taskDescriptionFor("not_a_real_finding_type", [
      f("not_a_real_finding_type", "https://example.com/a"),
    ]);
    expect(d).toContain("https://example.com/a");
  });
});

describe("the audit page offers it", () => {
  it("builds the ticket from open findings only", () => {
    // Including resolved work wastes the reader's time and makes them
    // distrust the rest of the document.
    const src = readFileSync(
      join(process.cwd(), "src/app/audits/[id]/page.tsx"),
      "utf8",
    );
    expect(src).toContain("buildDevTicket");
    expect(src).toContain('i.status === "new"');
    expect(src).toContain("DevTicketButton");
  });
});

describe("in French (added in this fork)", () => {
  it("writes the whole ticket in French, from the French guides", () => {
    const md = buildDevTicket(
      [f("missing_meta_description", "https://example.com/a"), f("missing_meta_description", "https://example.com/b")],
      { clientName: "Acme", siteUrl: "https://acme.example", locale: "fr" },
    );
    expect(md).toContain("# Corrections SEO pour Acme");
    expect(md).toContain("**Concerne 2 pages** de Acme");
    expect(md).toContain("**Comment corriger**");
    expect(md).toContain("gravité : élevée");
    expect(md).not.toMatch(/What it is|Why it matters|How to fix|Affects/);
    // Advice, not an obligation.
    expect(md).toContain("recommandations, pas des obligations");
  });

  it("says « et N autres » when the list is capped", () => {
    const many = Array.from({ length: 8 }, (_, i) => f("long_title", `https://example.com/p${i}`));
    expect(buildTicketForType("long_title", many, { clientName: "Acme", maxUrlsPerType: 5, locale: "fr" })).toContain(
      "- … et 3 autres",
    );
  });

  it("follows an impact order when one is given, severity otherwise", () => {
    const list = [f("long_title", "https://example.com/a", "high"), f("missing_canonical", "https://example.com/b", "high")];
    const ordered = buildDevTicket(list, { clientName: "Acme", order: ["long_title", "missing_canonical"] });
    expect(ordered.indexOf("## Long title")).toBeLessThan(ordered.indexOf("## Missing canonical"));
  });

  it("the agent's task description is French too", () => {
    const d = taskDescriptionFor("long_title", [f("long_title", "https://example.com/a")], "fr");
    expect(d).toContain("À faire :");
    expect(d).toContain("Page concernée (1) :");
  });
});
