import { describe, expect, it } from "vitest";
import { SCHEMA_ADVISORIES } from "./schema-deprecations-2026";
import { SCHEMA_ADVISORIES_FR } from "./schema-deprecations-2026.fr";

describe("French schema advisories", () => {
  it("translates every advisory", () => {
    expect(Object.keys(SCHEMA_ADVISORIES_FR).sort()).toEqual(Object.keys(SCHEMA_ADVISORIES).sort());
  });
});
