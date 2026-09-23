/**
 * What the page monitor calls a change, and how serious.
 *
 * Pages are constructed. The rules under test come from claude-seo's
 * drift comparison rules (MIT); the two failures they close were real in
 * this code — an erroring page recorded nothing, and noindex was never
 * read.
 */

import { describe, expect, it } from "vitest";
import { diffSnapshots, similarity, snapshotFromHtml, type Snapshot } from "./page-monitor";

const page = (opts: {
  title?: string;
  description?: string;
  h1?: string;
  canonical?: string;
  robots?: string;
  schema?: string;
  body?: string;
}) =>
  [
    "<html><head>",
    opts.title !== undefined ? `<title>${opts.title}</title>` : "",
    opts.description !== undefined ? `<meta name="description" content="${opts.description}">` : "",
    opts.canonical !== undefined ? `<link rel="canonical" href="${opts.canonical}">` : "",
    opts.robots !== undefined ? `<meta name="robots" content="${opts.robots}">` : "",
    opts.schema !== undefined ? `<script type="application/ld+json">${opts.schema}</script>` : "",
    "</head><body>",
    opts.h1 !== undefined ? `<h1>${opts.h1}</h1>` : "",
    `<p>${opts.body ?? "Kraft paper tape for sealing cartons."}</p>`,
    "</body></html>",
  ].join("");

const ORG = '{"@context":"https://schema.org","@type":"Organization","name":"Prateek Tapes"}';
const base = {
  title: "Kraft paper tape manufacturer",
  description: "Kraft paper tape made in Delhi.",
  h1: "Kraft paper tape",
  canonical: "https://example.com/kraft-tape",
  schema: ORG,
};
const good = snapshotFromHtml(page(base), 200);
const bySeverity = (d: ReturnType<typeof diffSnapshots>, field: string) =>
  d.find((x) => x.field === field)?.severity;

describe("reading a page", () => {
  it("records robots from meta tags and the header, normalised", () => {
    const s = snapshotFromHtml(page({ ...base, robots: "NOINDEX, follow" }), 200, "googlebot: noarchive");
    expect(s.robots).toBe("follow, noarchive, noindex");
  });

  it("keeps directives that carry a value, as WordPress SEO plugins send them", () => {
    // Verbatim from the robots meta on two live client sites. The first
    // version read it as "-1, follow, index, large".
    const s = snapshotFromHtml(
      page({ ...base, robots: "index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large" }),
      200,
    );
    expect(s.robots).toBe("follow, index, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  });

  it("strips a crawler name from the header, and applies it to what follows", () => {
    const s = snapshotFromHtml(page({ title: "x" }), 200, "googlebot: noindex, nofollow");
    expect(s.robots).toBe("nofollow, noindex");
  });

  it("notices a changed snippet limit without calling it a noindex", () => {
    const before = snapshotFromHtml(page({ ...base, robots: "index, follow, max-snippet:-1" }), 200);
    const after = snapshotFromHtml(page({ ...base, robots: "index, follow, max-snippet:50" }), 200);
    expect(diffSnapshots(before, after).find((d) => d.field === "robots")?.severity).toBe("warning");
  });

  it("lists JSON-LD types, including arrays and @graph members", () => {
    const graph = '{"@graph":[{"@type":["Corporation","Organization"]},{"@type":"WebSite"}]}';
    expect(snapshotFromHtml(page({ ...base, schema: graph }), 200).schemaTypes).toBe(
      "Corporation, Organization, WebSite",
    );
  });

  it("has no robots or schema when the page has none", () => {
    const s = snapshotFromHtml(page({ title: "x" }), 200);
    expect(s.robots).toBeNull();
    expect(s.schemaTypes).toBeNull();
    expect(s.schemaHash).toBeNull();
  });
});

describe("a page that starts erroring", () => {
  it("is a critical change, and the only one reported", () => {
    // Before, fetchSnapshot returned null on a 404 and nothing was saved.
    const d = diffSnapshots(good, snapshotFromHtml("<html>Not found</html>", 404));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ field: "status", severity: "critical", oldValue: "200", newValue: "404" });
  });

  it("recovering is information, and fields compare against the last good snapshot", () => {
    const erroring: Snapshot = { ...good, status: 500 };
    const d = diffSnapshots(erroring, good);
    expect(d).toEqual([expect.objectContaining({ field: "status", severity: "info" })]);
  });
});

describe("severity", () => {
  it("noindex added is critical", () => {
    const d = diffSnapshots(good, snapshotFromHtml(page({ ...base, robots: "noindex" }), 200));
    expect(bySeverity(d, "robots")).toBe("critical");
  });

  it("noindex removed is a warning, not silence", () => {
    const blocked = snapshotFromHtml(page({ ...base, robots: "noindex" }), 200);
    expect(bySeverity(diffSnapshots(blocked, good), "robots")).toBe("warning");
  });

  it("a removed or repointed canonical is critical; a new one is information", () => {
    const { canonical: _gone, ...noCanonical } = base;
    expect(bySeverity(diffSnapshots(good, snapshotFromHtml(page(noCanonical), 200)), "canonical")).toBe("critical");
    expect(
      bySeverity(diffSnapshots(good, snapshotFromHtml(page({ ...base, canonical: "https://example.com/" }), 200)), "canonical"),
    ).toBe("critical");
    expect(bySeverity(diffSnapshots(snapshotFromHtml(page(noCanonical), 200), good), "canonical")).toBe("info");
  });

  it("removing all structured data is critical; editing it is a warning", () => {
    const { schema: _gone, ...noSchema } = base;
    expect(bySeverity(diffSnapshots(good, snapshotFromHtml(page(noSchema), 200)), "schema")).toBe("critical");
    const edited = snapshotFromHtml(page({ ...base, schema: ORG.replace("Prateek Tapes", "Prateek Tapes Pvt Ltd") }), 200);
    expect(bySeverity(diffSnapshots(good, edited), "schema")).toBe("warning");
  });

  it("a title change is a warning and a removed title critical", () => {
    expect(bySeverity(diffSnapshots(good, snapshotFromHtml(page({ ...base, title: "Kraft tape" }), 200)), "title")).toBe("warning");
    const { title: _gone, ...noTitle } = base;
    expect(bySeverity(diffSnapshots(good, snapshotFromHtml(page(noTitle), 200)), "title")).toBe("critical");
  });

  it("an H1 rewrite is critical and a small edit a warning", () => {
    expect(bySeverity(diffSnapshots(good, snapshotFromHtml(page({ ...base, h1: "Contact our sales team" }), 200)), "h1")).toBe("critical");
    expect(bySeverity(diffSnapshots(good, snapshotFromHtml(page({ ...base, h1: "Kraft paper tapes" }), 200)), "h1")).toBe("warning");
  });

  it("a body text change is information only", () => {
    const d = diffSnapshots(good, snapshotFromHtml(page({ ...base, body: "New stock arrived." }), 200));
    expect(d).toEqual([expect.objectContaining({ field: "content", severity: "info" })]);
  });
});

describe("snapshots stored before this existed", () => {
  it("does not raise noindex or schema alarms against values never read", () => {
    // An old row has title/description/h1/canonical/contentHash only.
    const legacy = {
      title: good.title,
      description: good.description,
      h1: good.h1,
      canonical: good.canonical,
      contentHash: good.contentHash,
    };
    const now = snapshotFromHtml(page({ ...base, robots: "noindex" }), 200);
    expect(diffSnapshots(legacy, now).map((d) => d.field)).toEqual([]);
  });
});

describe("similarity", () => {
  it("is 1 for identical text and low for unrelated text", () => {
    expect(similarity("Kraft paper tape", "Kraft paper tape")).toBe(1);
    expect(similarity("Kraft paper tape", "Contact our sales team")).toBeLessThan(0.5);
    expect(similarity("Kraft paper tape", "Kraft paper tapes")).toBeGreaterThan(0.8);
  });
});
