import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SURFACES,
  allMappedGroups,
  defaultSurfaces,
  groupsForSurfaces,
  splitSurfaces,
  surfacesFor,
} from "./engagement-surfaces";

/**
 * Surfaces have to agree with the tool rail they order.
 *
 * The failure this guards against has already happened twice in this
 * codebase in other guises: a hand-written list of names drifts from the
 * thing it names, nothing throws, and the only symptom is work quietly
 * not happening. Here that would look like a surface whose tools simply
 * never sort to the top, with no error anywhere.
 */

const RAIL = readFileSync(
  join(process.cwd(), "src/app/clients/[id]/client-tools-launcher.tsx"),
  "utf8",
);

/** Group labels the rail actually defines, read from its source. */
function railGroupLabels(): Set<string> {
  const out = new Set<string>();
  // `label: "Run an audit",` at the group level — two-space-indented
  // inside the returned array, distinct from a tool's own `title:`.
  for (const m of RAIL.matchAll(/^ {6}label: "([^"]+)",$/gm)) out.add(m[1]);
  if (out.size === 0) throw new Error("Parsed no group labels from the rail");
  return out;
}

describe("every surface points at rail groups that exist", () => {
  it("no surface names a group the rail does not define", () => {
    const real = railGroupLabels();
    const missing = allMappedGroups().filter((g) => !real.has(g));
    expect(
      missing,
      `${missing.join(", ")} is claimed by a surface but no longer exists ` +
        `in buildGroups(). Renaming a rail group without updating ` +
        `engagement-surfaces.ts drops that surface's tools out of the ` +
        `ordering silently — nothing errors, they just stop sorting first.`,
    ).toEqual([]);
  });

  it("the rail has groups no surface claims, and that is allowed", () => {
    // "Paid ads & growth" belongs to no surface. Unmapped must not be
    // treated as out-of-scope, or a tool nobody decided about gets
    // demoted below a "not in this engagement" divider.
    const real = railGroupLabels();
    const mapped = new Set(allMappedGroups());
    expect([...real].some((g) => !mapped.has(g))).toBe(true);
  });
});

describe("defaults follow the niche", () => {
  it("a local business gets local, an e-commerce one does not", () => {
    expect(defaultSurfaces("local")).toContain("local");
    expect(defaultSurfaces("local")).not.toContain("ecommerce");
    expect(defaultSurfaces("ecommerce")).toContain("ecommerce");
    expect(defaultSurfaces("ecommerce")).not.toContain("local");
  });

  it("website is in scope no matter what, including an unknown niche", () => {
    for (const n of ["local", "ecommerce", "saas", "blog", "services", null, "wat"]) {
      expect(defaultSurfaces(n)).toContain("website");
    }
  });
});

describe("reading a stored value back", () => {
  it("null falls back to the niche default, not to nothing", () => {
    // An empty scope would render a document saying we will do no work.
    expect(surfacesFor(null, "local")).toEqual(defaultSurfaces("local"));
    expect(surfacesFor(undefined, "blog")).toEqual(defaultSurfaces("blog"));
  });

  it("an explicitly empty choice is respected", () => {
    // Different from "never asked". Someone who unticked everything gets
    // what they asked for.
    expect(surfacesFor([], "local")).toEqual([]);
  });

  it("an id that no longer exists is dropped, not carried", () => {
    expect(surfacesFor(["website", "myspace"], "local")).toEqual(["website"]);
  });
});

describe("what the client reads", () => {
  it("in-scope and out-of-scope together cover every surface exactly once", () => {
    const { inScope, outOfScope } = splitSurfaces(["website", "local"]);
    expect(inScope.map((s) => s.id)).toEqual(["website", "local"]);
    expect(inScope.length + outOfScope.length).toBe(SURFACES.length);
    const ids = [...inScope, ...outOfScope].map((s) => s.id);
    expect(new Set(ids).size).toBe(SURFACES.length);
  });

  it("both lists keep the declared order, so the document reads the same every time", () => {
    const order = SURFACES.map((s) => s.id);
    const { inScope } = splitSurfaces([...order].reverse());
    expect(inScope.map((s) => s.id)).toEqual(order);
  });

  it("every surface has a detail line a client could actually read", () => {
    for (const s of SURFACES) {
      expect(s.detail.length, `${s.id} needs a real explanation`).toBeGreaterThan(40);
      expect(s.detail).toMatch(/[.!]$/);
    }
  });
});

describe("group ordering", () => {
  it("returns groups in surface order with no duplicates", () => {
    const groups = groupsForSurfaces(["website", "content", "local"]);
    expect(new Set(groups).size).toBe(groups.length);
    expect(groups[0]).toBe("Run an audit");
  });

  it("an empty scope orders nothing rather than throwing", () => {
    expect(groupsForSurfaces([])).toEqual([]);
  });
});
