/**
 * A proposed change must say what it is replacing.
 *
 * MEASURED 19 Nov 2026 on a live install: nine queued changes, every
 * one of them a title or a meta description, and every one with
 * `before_value` NULL — including a home page that has had a title all
 * along. The approval panel hides the Before row entirely when the
 * value is null, so a reviewer saw only:
 *
 *     After  Dice Codes: Web Design, SEO & Digital Marketing
 *
 * with nothing to say a title already existed. Approving a REPLACEMENT
 * felt like filling a gap.
 *
 * The second consequence is worse than the display. `run.ts` builds the
 * drafting context's `pageTitle` from this same field, so the model
 * writing the replacement was told `Page title: (unknown)` and
 * `Current description: (none)`. It was writing from a URL and a
 * finding message, having never been shown the page.
 *
 * On that install it produced "Active Dice Codes for Free Rewards" as a
 * proposed home-page title for a digital agency — the brand name read
 * as dice-game promo codes, which is a reasonable guess from a domain
 * alone. It sat in the queue marked `risk: safe` for 68 days.
 *
 * These assert the wiring, because the fetch itself needs a server and
 * the planner's own tests cover the surrounding flow.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PLANNER = readFileSync(join(ROOT, "src/lib/agent/planner.ts"), "utf8");
const PANEL = readFileSync(
  join(ROOT, "src/app/agent/autopilot/panel.tsx"),
  "utf8",
);
const RUN = readFileSync(join(ROOT, "src/lib/agent/run.ts"), "utf8");

describe("the planner reads the page before proposing a replacement", () => {
  it("has the enrichment step, and calls it", () => {
    expect(PLANNER).toContain("async function attachCurrentValues");
    expect(
      PLANNER,
      "attachCurrentValues is defined but never called",
    ).toMatch(/await attachCurrentValues\(actions\)/);
  });

  it("runs AFTER the per-run limit, so it fetches only what is planned", () => {
    // Before the slice it would fetch a page for every candidate the
    // run then throws away — on a site with hundreds of findings that
    // is hundreds of requests to someone else's server for nothing.
    const slice = PLANNER.indexOf("const actions = notPending.slice(0, limit)");
    const call = PLANNER.indexOf("await attachCurrentValues(actions)");
    expect(slice).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(slice);
  });

  it("covers exactly the kinds whose draft prompt asks for it", () => {
    // run.ts feeds pageTitle from currentValue, and the description
    // prompt prints "Current description". Any kind named in those
    // prompts needs enriching, or the model is told "(unknown)".
    expect(PLANNER).toMatch(/write_title:\s*"title"/);
    expect(PLANNER).toMatch(/write_meta_description:\s*"description"/);
    expect(RUN).toContain("pageTitle: action.currentValue");
  });

  it("reuses recheckUrl, which defeats a CDN", () => {
    // A cached read would record a stale "before" value — the same
    // class of wrong this fix is for, arrived at from the other side.
    const fn = PLANNER.slice(
      PLANNER.indexOf("async function attachCurrentValues"),
      PLANNER.indexOf("function siteWideTarget"),
    );
    expect(fn).toContain("recheckUrl");
    expect(fn, "a bare fetch would be served by the cache").not.toMatch(
      /\bawait fetch\(/,
    );
  });

  it("fetches once per URL, not once per action", () => {
    // A page with both a long title and a long description produces two
    // actions. Two GETs for one page, on every planning run, is a cost
    // paid against someone else's site.
    const fn = PLANNER.slice(
      PLANNER.indexOf("async function attachCurrentValues"),
      PLANNER.indexOf("function siteWideTarget"),
    );
    expect(fn).toMatch(/byUrl/);
    expect(fn).toMatch(/new Map</);
  });

  it("never overwrites a currentValue that is already set", () => {
    // Redirect actions carry their own, built from the finding rather
    // than the page.
    const fn = PLANNER.slice(
      PLANNER.indexOf("async function attachCurrentValues"),
      PLANNER.indexOf("function siteWideTarget"),
    );
    expect(fn).toMatch(/currentValue != null[\s\S]{0,40}continue/);
  });
});

describe("the approval panel distinguishes three states", () => {
  it("renders the Before row even when the value is null", () => {
    // The bug: `{action.beforeValue != null && (...)}` hid the row, so
    // the reviewer saw only an After with no context at all.
    expect(
      PANEL,
      "the Before row is conditional on a non-null value again",
    ).not.toMatch(/\{action\.beforeValue != null && \(/);
  });

  it("says it could not read the page, rather than implying empty", () => {
    expect(PANEL).toMatch(/couldn&apos;t read the live page/);
    expect(PANEL).toContain("this may be replacing");
  });

  it("has a separate wording for a genuinely blank value", () => {
    // "we did not look" and "there is nothing there" must not share a
    // rendering — the distinction this whole file is about.
    expect(PANEL).toContain("nothing there yet");
    expect(PANEL).toMatch(/beforeValue === ""/);
  });

  it("shows the old value struck through, with its length", () => {
    // Length matters: half these findings are "too long", and a
    // reviewer comparing 65 characters against 47 wants both numbers.
    expect(PANEL).toMatch(/line-through/);
    expect(PANEL).toMatch(/action\.beforeValue\.length/);
  });
});
