import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRAWLER_ISSUE_NAMES_FR } from "./crawler-issue-names.fr";

describe("French names of the crawler's findings", () => {
  it("names every type the crawler emits", () => {
    const source = readFileSync("src/lib/audit.ts", "utf8");
    const types = new Set([...source.matchAll(/type: "([a-z_0-9]+)"/g)].map((m) => m[1]));
    expect(types.size).toBeGreaterThan(40);
    for (const type of types) expect(CRAWLER_ISSUE_NAMES_FR[type], type).toBeTruthy();
  });
});
