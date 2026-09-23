/**
 * Every per-client tool link carries the client id.
 *
 * A tool opened from a client's rail without one records its run, and
 * any findings it writes, against no client. Those findings then fail
 * `loadActionableToolFindings`'s clientId filter and reach neither the
 * agent nor the ranked list — while still rendering correctly on the
 * tool's own page, which is why this went unnoticed.
 *
 * The launcher builds roughly forty links by hand. This asserts the
 * property rather than the list, so a tool added tomorrow is covered
 * without anyone remembering to come back here.
 */

import { describe, expect, it } from "vitest";
import { buildClientToolGroups } from "@/app/clients/[id]/client-tools-launcher";
import { SWEPT_TOOL_IDS } from "@/lib/swept-tools";

const CLIENT = {
  id: 42,
  name: "A client",
  url: "https://example.com",
  gscProperty: null,
  gbpUrl: null,
  ga4PropertyId: null,
  wpEndpoint: null,
};

function allHrefs(): string[] {
  return buildClientToolGroups(CLIENT as never).flatMap((g) =>
    g.tools.map((t) => t.href),
  );
}

describe("per-client tool links", () => {
  it("builds a non-trivial number of links", () => {
    // Guards the guard: if the builder ever returns nothing, every
    // assertion below passes vacuously.
    expect(allHrefs().length).toBeGreaterThan(20);
  });

  it("names the client on every /tools/ link", () => {
    const missing = allHrefs().filter(
      (h) => h.startsWith("/tools/") && !/[?&]clientId=42(&|$)/.test(h),
    );
    expect(
      missing,
      `these would record findings against no client:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("keeps the pre-filled url alongside the client id", () => {
    // Both matter. The url saves retyping; the clientId is what makes
    // the result reachable from anywhere else in the app.
    const withUrl = allHrefs().filter((h) => h.includes("url="));
    expect(withUrl.length).toBeGreaterThan(0);
    for (const h of withUrl) expect(h).toMatch(/[?&]clientId=42(&|$)/);
  });

  it("marks exactly the tools the scheduler actually sweeps", () => {
    // The badge says "you never have to open this". If it drifted from
    // the scheduler's list it would be telling the user a check happens
    // that does not — the most expensive kind of wrong this app can be.
    const marked = buildClientToolGroups(CLIENT as never)
      .flatMap((g) => g.tools)
      .filter((t) => t.autoRuns)
      .map((t) => t.href.slice("/tools/".length).split(/[?#]/)[0]);
    for (const slug of marked) expect(SWEPT_TOOL_IDS).toContain(slug);
    // And every swept tool that appears in the rail is marked.
    const railSlugs = new Set(
      buildClientToolGroups(CLIENT as never)
        .flatMap((g) => g.tools)
        .filter((t) => t.href.startsWith("/tools/"))
        .map((t) => t.href.slice("/tools/".length).split(/[?#]/)[0]),
    );
    for (const swept of SWEPT_TOOL_IDS) {
      if (railSlugs.has(swept)) expect(marked).toContain(swept);
    }
  });

  it("does not add a second clientId to links that already had one", () => {
    for (const h of allHrefs()) {
      expect(h.match(/clientId=/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });
});
