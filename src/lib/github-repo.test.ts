import { describe, expect, it } from "vitest";
import { isSafeBranch, normalizeGithubRepo } from "./github-repo";

describe("normalizeGithubRepo", () => {
  it.each([
    ["Galbir/mono", "Galbir/mono"],
    ["https://github.com/Galbir/mono", "Galbir/mono"],
    ["https://github.com/Galbir/mono.git", "Galbir/mono"],
    ["github.com/Galbir/mono/", "Galbir/mono"],
    ["git@github.com:Galbir/mono.git", "Galbir/mono"],
    ["https://github.com/Galbir/mono/tree/main", "Galbir/mono"],
  ])("accepts %s", (input, out) => {
    expect(normalizeGithubRepo(input)).toBe(out);
  });

  it.each(["", "mono", "a/b/c", "https://gitlab.com/a/b", "a b/c", "a/b;rm -rf", "$(x)/y", "a/b$(x)"])(
    "rejects %j",
    (input) => {
      expect(normalizeGithubRepo(input)).toBeNull();
    },
  );
});

describe("isSafeBranch", () => {
  it("allows ordinary names and rejects shell-ish ones", () => {
    expect(isSafeBranch("main")).toBe(true);
    expect(isSafeBranch("release/2.x")).toBe(true);
    expect(isSafeBranch("-rf")).toBe(false);
    expect(isSafeBranch("a;b")).toBe(false);
    expect(isSafeBranch("a..b")).toBe(false);
  });
});
