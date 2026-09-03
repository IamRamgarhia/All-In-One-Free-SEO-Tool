import { describe, it, expect } from "vitest";
import { DOC_GUIDES, GUIDE_GROUPS, guideBySlug } from "./docs-guides";
import {
  TOOL_CAPABILITIES,
  capabilityOf,
  copyOf,
} from "./tool-capabilities";
import { isRetired } from "./tool-categories";

describe("docs guides", () => {
  it("every related link points at a route that exists", () => {
    // A dead link in the docs is worse than a missing one: it looks like
    // the feature exists and the user goes looking for it.
    const dead = DOC_GUIDES.flatMap((g) =>
      (g.related ?? []).map((href) => ({ guide: g.slug, href })),
    ).filter(({ href }) => capabilityOf(href) === null);
    expect(dead).toEqual([]);
  });

  it("slugs are unique and resolvable", () => {
    const slugs = DOC_GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(guideBySlug(s)?.slug).toBe(s);
    expect(guideBySlug("no-such-guide")).toBeNull();
  });

  it("every guide sits in a group the index renders", () => {
    // A guide in an unlisted group is written, shipped, and invisible.
    for (const g of DOC_GUIDES) {
      expect(GUIDE_GROUPS).toContain(g.group);
    }
  });

  it("no guide is empty or unbounded", () => {
    for (const g of DOC_GUIDES) {
      expect(g.steps.length, `${g.slug} has no steps`).toBeGreaterThan(0);
      expect(g.steps.length, `${g.slug} is too long to follow`).toBeLessThan(12);
      expect(g.minutes).toBeGreaterThan(0);
      for (const s of g.steps) expect(s.do.trim()).not.toBe("");
    }
  });

  it("the docs cover every tool the grid shows", () => {
    // The reference list is built from the generated table, so this
    // fails when a tool is added to the grid without copy the parser can
    // read — which is how a tool would silently go undocumented.
    const undocumented = TOOL_CAPABILITIES.filter(
      (c) =>
        /^\/tools\/[^/]+$/.test(c.route) &&
        !isRetired(c.route) &&
        !copyOf(capabilityOf(c.route)),
    ).map((c) => c.route);

    // /tools/geo-swot is reached from a client page and has no card in
    // the grid, so there is no copy to read. That is legitimate.
    expect(undocumented).toEqual(["/tools/geo-swot"]);
  });
});
