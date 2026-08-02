import { describe, expect, it } from "vitest";
import {
  GROUP_BLURBS,
  GROUP_LABELS,
  INTEGRATIONS,
  integrationById,
  TIER_LABELS,
} from "./integrations";

/**
 * This catalog exists because setup guidance was scattered across six
 * places and one of them was wrong: the backlink import I shipped told
 * people to add their Bing key "in Settings", where it isn't — it lives
 * on /tools/bing. Nobody would have hit an error; they'd have hunted
 * through the wrong page and given up.
 *
 * So the tests are mostly about the copy being correct and honest,
 * because that's the failure mode a catalog can still have.
 */

describe("every integration is set up to be followed", () => {
  it("has a destination inside this app", () => {
    for (const i of INTEGRATIONS) {
      expect(i.setupHref, i.id).toMatch(/^\//);
      expect(i.setupLabel.length, i.id).toBeGreaterThan(3);
    }
  });

  it("points at real routes, not invented ones", () => {
    // The whole reason this file exists. A plausible-looking href that
    // doesn't resolve is exactly the bug being fixed.
    const known = [
      "/settings#ai",
      "/settings#email",
      "/settings/google",
      "/tools/bing",
      "/clients",
    ];
    for (const i of INTEGRATIONS) {
      expect(known, `${i.id} points somewhere unverified`).toContain(
        i.setupHref,
      );
    }
  });

  it("gives numbered steps a beginner could follow", () => {
    for (const i of INTEGRATIONS) {
      expect(i.steps.length, i.id).toBeGreaterThanOrEqual(3);
      for (const step of i.steps) {
        // Long enough to be an instruction rather than a label.
        expect(step.length, `${i.id}: "${step}"`).toBeGreaterThan(25);
      }
    }
  });

  it("says how long it takes, so nobody starts something open-ended", () => {
    for (const i of INTEGRATIONS) {
      expect(i.minutes, i.id).toBeGreaterThan(0);
      expect(i.minutes, i.id).toBeLessThanOrEqual(15);
    }
  });

  it("links out to where the credential comes from, where there is one", () => {
    // Two integrations legitimately have no vendor URL, because their
    // credential comes from something the user already controls rather
    // than a sign-up page:
    //
    //   wordpress — the companion plugin generates the key on their site
    //   smtp      — whichever mail provider they already use
    //
    // Sending them to an arbitrary vendor would be worse than sending
    // them nowhere.
    const noVendorPage = ["wordpress", "smtp"];
    for (const i of INTEGRATIONS) {
      if (noVendorPage.includes(i.id)) {
        expect(i.keyUrl, `${i.id} shouldn't link to a vendor`).toBeUndefined();
        continue;
      }
      expect(i.keyUrl, i.id).toMatch(/^https:\/\//);
      expect(i.keyUrlLabel?.length ?? 0, i.id).toBeGreaterThan(3);
    }
  });

  it("tells the ones with no vendor page where to look instead", () => {
    // Since they get no "Get the key" button, the steps have to carry
    // the whole answer.
    for (const id of ["wordpress", "smtp"]) {
      const i = INTEGRATIONS.find((x) => x.id === id)!;
      expect(i.steps.join(" "), id).toMatch(
        /plugin|provider|App Password|host/i,
      );
    }
  });
});

describe("the copy is honest", () => {
  it("says what you lose by skipping, for every one", () => {
    // Someone deciding whether to spend five minutes deserves to know
    // what they're trading. In most cases here the answer is "less than
    // you'd think", which is worth saying out loud.
    for (const i of INTEGRATIONS) {
      expect(i.withoutIt.length, i.id).toBeGreaterThan(50);
    }
  });

  it("never claims something is required", () => {
    // Nothing in this catalog is. CLAUDE.md's rule is that the tool must
    // be fully usable without entering any API keys, and copy that
    // implies otherwise quietly breaks that promise.
    const text = INTEGRATIONS.map(
      (i) => `${i.withoutIt} ${i.whatYouGet.join(" ")}`,
    ).join(" ");
    expect(text).not.toMatch(/\brequired\b/i);
    expect(text).not.toMatch(/\byou must\b/i);
    expect(text).not.toMatch(/\bwon't work\b/i);
  });

  it("describes benefits in the user's terms, not the API's", () => {
    // "Enables the Search Console API" tells a freelancer nothing.
    const benefits = INTEGRATIONS.flatMap((i) => i.whatYouGet);
    for (const b of benefits) {
      expect(b, b).not.toMatch(/\benables? the\b/i);
      expect(b.length, b).toBeGreaterThan(20);
    }
  });

  it("marks the free ones as free", () => {
    // Every integration a user genuinely needs is free, and the badge
    // is what stops someone assuming otherwise and skipping it.
    const ids = INTEGRATIONS.filter((i) => i.tier === "free").map((i) => i.id);
    expect(ids).toContain("ai");
    expect(ids).toContain("google");
    expect(ids).toContain("bing");
  });

  it("puts the two highest-value ones in 'start here'", () => {
    const start = INTEGRATIONS.filter((i) => i.group === "start").map(
      (i) => i.id,
    );
    expect(start).toEqual(["ai", "google"]);
  });
});

describe("catalog integrity", () => {
  it("has no duplicate ids", () => {
    const ids = INTEGRATIONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every group used has a label and a blurb", () => {
    for (const i of INTEGRATIONS) {
      expect(GROUP_LABELS[i.group], i.group).toBeTruthy();
      expect(GROUP_BLURBS[i.group]?.length ?? 0, i.group).toBeGreaterThan(20);
    }
  });

  it("every tier used has a label", () => {
    for (const i of INTEGRATIONS) {
      expect(TIER_LABELS[i.tier], i.tier).toBeTruthy();
    }
  });

  it("looks up by id, and returns undefined for nonsense", () => {
    expect(integrationById("bing")?.label).toMatch(/bing/i);
    expect(integrationById("not-a-thing")).toBeUndefined();
  });
});
