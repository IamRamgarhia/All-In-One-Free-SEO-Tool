/**
 * Every tool path here must be a real route.
 *
 * The failure is quiet and it is the whole risk of adding this map: a
 * typo does not throw, it renders a button that 404s. The user clicks,
 * lands on nothing, and concludes the tool is broken — which is a worse
 * outcome than the button never existing, because it costs the click
 * and the trust.
 *
 * This repo has been bitten by exactly this shape before: the swept-tool
 * list carries the same test for the same reason.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findingFromSourceRef,
  mappedEngineRules,
  mappedFindingTypes,
  mappedGeoSignals,
  taskPageUrl,
  taskToolLink,
  toolForAnyFinding,
  toolForFinding,
  toolLink,
  toolVerb,
  withToolContext,
} from "./finding-tool-map";
import { getRuleById } from "@/audit/catalog";
import {
  AUDIT_FINDING_TYPES,
  NON_CRAWLER_FINDING_TYPES,
} from "./audit-finding-types";

const APP = join(process.cwd(), "src/app");

describe("the routes exist", () => {
  it("every mapped tool is a real page", () => {
    const broken: string[] = [];
    for (const type of mappedFindingTypes()) {
      const route = toolForFinding(type)!;
      // "/tools/robots" → src/app/tools/robots/page.tsx
      const page = join(APP, route.replace(/^\//, ""), "page.tsx");
      if (!existsSync(page)) broken.push(`${type} → ${route}`);
    }
    expect(
      broken,
      `These map to a route with no page, so the button 404s:\n  ${broken.join("\n  ")}`,
    ).toEqual([]);
  });

  it("maps at least one finding, so the test above can fail", () => {
    // Guards the guard. An empty map passes every assertion here.
    expect(mappedFindingTypes().length).toBeGreaterThan(20);
  });
});

describe("the finding types are real", () => {
  it("maps nothing the crawler never emits", () => {
    // A mapping for a type that does not exist is dead weight that reads
    // as coverage — the same inflation audit-finding-types.test.ts
    // exists to stop in the planner.
    const known = new Set<string>([
      ...AUDIT_FINDING_TYPES,
      ...NON_CRAWLER_FINDING_TYPES,
    ]);
    const unreal = mappedFindingTypes().filter((t) => !known.has(t));
    expect(
      unreal,
      `${unreal.join(", ")} is mapped to a tool but nothing emits it.`,
    ).toEqual([]);
  });
});

describe("what it declines to answer", () => {
  it("returns null rather than guessing", () => {
    expect(toolForFinding("not_a_real_finding")).toBeNull();
  });

  it("offers no tool for findings fixed in somebody else's repo", () => {
    // next_* and shopify_* findings are fixed in that platform's source,
    // not in this app. A button opening one of our tools would waste the
    // click and the trust.
    for (const t of ["next_raw_img_tags", "shopify_liquid_debug"]) {
      expect(toolForFinding(t), t).toBeNull();
    }
  });
});

describe("engine rules and GEO signals", () => {
  it("every mapped engine rule exists and opens a real page", () => {
    const unknown = mappedEngineRules().filter((id) => !getRuleById(id));
    expect(unknown, `Not rules of the engine: ${unknown.join(", ")}`).toEqual([]);
    const broken = mappedEngineRules()
      .map((id) => toolForAnyFinding(`seomator:${id}`)!)
      .filter((route) => !existsSync(join(APP, route.replace(/^\//, ""), "page.tsx")));
    expect(broken).toEqual([]);
  });

  it("every mapped GEO signal is one the GEO engine emits, and opens a real page", () => {
    const geoSource = readFileSync(join(process.cwd(), "src/lib/geo-audit/audit.ts"), "utf8");
    const scoring = existsSync(join(process.cwd(), "src/lib/geo-audit/scoring"))
      ? readdirSync(join(process.cwd(), "src/lib/geo-audit/scoring"), { recursive: true })
          .filter((f) => String(f).endsWith(".ts"))
          .map((f) => readFileSync(join(process.cwd(), "src/lib/geo-audit/scoring", String(f)), "utf8"))
          .join("\n")
      : "";
    const all = geoSource + scoring;
    const unknown = mappedGeoSignals().filter((id) => !all.includes(`"${id}"`));
    expect(unknown, `Not GEO signals: ${unknown.join(", ")}`).toEqual([]);
    for (const id of mappedGeoSignals()) {
      const route = toolForAnyFinding(`geo:${id}`)!;
      expect(existsSync(join(APP, route.replace(/^\//, ""), "page.tsx")), route).toBe(true);
    }
  });

  it("offers nothing where no tool helps", () => {
    expect(toolForAnyFinding("seomator:a11y-color-contrast")).toBeNull();
    expect(toolForAnyFinding("seomator:url-uppercase")).toBeNull();
    expect(toolForAnyFinding("geo:brand.community")).toBeNull();
    expect(toolForAnyFinding("seomator:not-a-rule")).toBeNull();
  });

  it("keeps the crawler map as it was", () => {
    expect(toolForAnyFinding("missing_title")).toBe(toolForFinding("missing_title"));
  });
});

describe("toolLink", () => {
  it("opens the tool on the client's page, with the task and the finding", () => {
    const link = toolLink("broken_link", { clientId: 2, url: "https://nd-prestige.fr/contact", taskId: 41 });
    expect(link?.toolPath).toBe("/tools/link-checker");
    const u = new URL(link!.href, "http://x");
    expect(u.pathname).toBe("/tools/link-checker");
    expect(u.searchParams.get("clientId")).toBe("2");
    expect(u.searchParams.get("url")).toBe("https://nd-prestige.fr/contact");
    expect(u.searchParams.get("task")).toBe("41");
    expect(u.searchParams.get("finding")).toBe("broken_link");
  });

  it("says fix for a tool that changes things, dig for one that shows them", () => {
    expect(toolLink("missing_title")?.verb).toBe("fix");
    expect(toolLink("broken_link")?.verb).toBe("dig");
    expect(toolVerb("/tools/schema?clientId=2")).toBe("fix");
  });

  it("returns null when no tool helps", () => {
    expect(toolLink("next_raw_img_tags", { clientId: 2 })).toBeNull();
  });

  it("drops a URL that is not http(s)", () => {
    const href = withToolContext("/tools/crux", { clientId: 2, url: "javascript:alert(1)" });
    expect(new URL(href, "http://x").searchParams.has("url")).toBe(false);
  });

  it("adds only the client to a path outside /tools, and keeps what is there", () => {
    expect(withToolContext("/content/c/2", { clientId: 2, url: "https://a.fr/", taskId: 3 })).toBe("/content/c/2?clientId=2");
    expect(withToolContext("/tools/crux?mode=local", { clientId: 2 })).toBe("/tools/crux?mode=local&clientId=2");
  });
});

describe("taskToolLink", () => {
  it("reads the finding back from the task's source", () => {
    expect(findingFromSourceRef("audit:broken_link")).toBe("broken_link");
    expect(findingFromSourceRef("seomator:core-title-length")).toBe("seomator:core-title-length");
    expect(findingFromSourceRef("geo:schema.presence")).toBe("geo:schema.presence");
    expect(findingFromSourceRef("quick_win")).toBeNull();
    expect(findingFromSourceRef("tool:link-checker|broken_link")).toBe("broken_link");
    expect(findingFromSourceRef("tool:mobile-friendly|seomator:mobile-font-size")).toBe("seomator:mobile-font-size");
    expect(findingFromSourceRef("tool:crux")).toBeNull();
  });

  it("opens the first page still to fix", () => {
    expect(taskPageUrl([{ url: "https://a.fr/", done: true }, { url: "https://a.fr/b", done: false }])).toBe("https://a.fr/b");
    expect(taskPageUrl([{ url: "https://a.fr/", done: true }])).toBe("https://a.fr/");
    expect(taskPageUrl(null)).toBeNull();
  });

  it("sends an engine task stored with /audits to the rule's tool", () => {
    const link = taskToolLink({
      id: 9,
      toolPath: "/audits",
      sourceRef: "seomator:core-title-length",
      clientId: 2,
      pageUrl: "https://nd-prestige.fr/",
    });
    expect(link?.toolPath).toBe("/tools/meta-tag-generator");
    expect(link?.isTool).toBe(true);
  });

  it("keeps a stored tool, and gives nothing without one", () => {
    expect(taskToolLink({ id: 1, toolPath: "/tools/crux", clientId: 2 })?.toolPath).toBe("/tools/crux");
    expect(taskToolLink({ id: 1, toolPath: null, clientId: 2 })).toBeNull();
    expect(taskToolLink({ id: 1, toolPath: "/audits", sourceRef: "seomator:url-uppercase", clientId: 2 })?.isTool).toBe(false);
  });
});
