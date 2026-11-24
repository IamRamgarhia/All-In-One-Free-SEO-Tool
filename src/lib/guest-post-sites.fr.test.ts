import { describe, expect, it } from "vitest";
import { GUEST_POST_SITES } from "./guest-post-sites";
import { GUEST_POST_TONES_FR } from "./guest-post-sites.fr";

describe("French guest-post tones", () => {
  it("gives the tone of every platform", () => {
    expect(Object.keys(GUEST_POST_TONES_FR).sort()).toEqual(GUEST_POST_SITES.map((s) => s.id).sort());
  });
});
