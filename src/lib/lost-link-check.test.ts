/**
 * When a backlink counts as gone.
 *
 * Both directions of this are a lie somebody reads. A false "lost"
 * creates a high-priority recovery task nobody needs and puts a line in
 * the client's report saying work was undone that never was. A missed
 * one hides a link that really has gone, which is the cheapest link to
 * win back and the one with a deadline.
 *
 * The network half is exercised against real pages separately; this is
 * the rule it applies.
 */

import { describe, expect, it } from "vitest";
import {
  MISSES_BEFORE_LOST,
  decideLink,
  linkPresent,
} from "./lost-link-check";

describe("linkPresent", () => {
  const target = "example.com";

  it("finds a plain https link", () => {
    expect(linkPresent(`<a href="https://example.com/x">hi</a>`, target)).toBe(true);
  });

  it("finds single-quoted and protocol-relative forms", () => {
    // Real pages use all of these, and missing one reads as a lost link.
    expect(linkPresent(`<a href='https://example.com/'>x</a>`, target)).toBe(true);
    expect(linkPresent(`<a href="//example.com/">x</a>`, target)).toBe(true);
    expect(linkPresent(`<a href='//example.com/'>x</a>`, target)).toBe(true);
    expect(linkPresent(`<a href="http://example.com/">x</a>`, target)).toBe(true);
  });

  it("does not count the domain merely being mentioned", () => {
    // A page that names the site without linking to it is not a backlink.
    expect(linkPresent(`<p>we like example.com a lot</p>`, target)).toBe(false);
  });

  it("treats an unread page as absent, not as present", () => {
    // The caller distinguishes the two; this must not claim a link it
    // never saw.
    expect(linkPresent("", target)).toBe(false);
  });
});

describe("decideLink", () => {
  it("clears the streak the moment the link is seen", () => {
    expect(decideLink({ present: true, missStreak: 1 })).toEqual({
      action: "seen",
      missStreak: 0,
    });
  });

  it("does not call a link lost on the first miss", () => {
    // The bug this exists to stop. A JS-rendered source page, a consent
    // wall and a bot-block page all look exactly like a removed link.
    expect(decideLink({ present: false, missStreak: 0 })).toEqual({
      action: "strike",
      missStreak: 1,
    });
  });

  it("calls it lost on the second consecutive miss", () => {
    expect(decideLink({ present: false, missStreak: 1 })).toEqual({
      action: "lost",
      missStreak: 2,
    });
  });

  it("stays lost rather than resetting on further misses", () => {
    expect(decideLink({ present: false, missStreak: 5 }).action).toBe("lost");
  });

  it("needs more than one miss, whatever the threshold is set to", () => {
    // Guards the constant itself: setting it to 1 restores the original
    // false-positive behaviour, and this is the line that says so.
    expect(MISSES_BEFORE_LOST).toBeGreaterThan(1);
  });

  it("a miss then a sighting then a miss does not flag", () => {
    // Consecutive, not cumulative. An intermittent source page would
    // otherwise accumulate strikes forever and eventually be called lost.
    const first = decideLink({ present: false, missStreak: 0 });
    expect(first.action).toBe("strike");
    const seen = decideLink({ present: true, missStreak: first.missStreak });
    expect(seen.missStreak).toBe(0);
    expect(decideLink({ present: false, missStreak: seen.missStreak }).action).toBe(
      "strike",
    );
  });
});
