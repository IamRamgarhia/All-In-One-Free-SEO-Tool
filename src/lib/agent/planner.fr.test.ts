import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CAPABILITY_GAPS_FR, FIXABLE_REASONS_FR, RUN_SUMMARY_FR } from "./planner.fr";

const src = (f: string) => readFileSync(join(process.cwd(), "src/lib/agent", f), "utf8");

/** FIXABLE keys, read the same way planner-coverage.test.ts reads them. */
function fixableTypes(): string[] {
  const planner = src("planner.ts");
  const rest = planner.slice(planner.indexOf("const FIXABLE"));
  const end = rest.search(/^\};/m);
  return [...(end === -1 ? rest : rest.slice(0, end)).matchAll(/^  ([a-z0-9_]+): \{/gm)].map((m) => m[1]);
}

describe("French agent text", () => {
  it("gives a French reason for every fixable finding", () => {
    const types = fixableTypes();
    expect(types.length).toBeGreaterThan(10);
    expect(Object.keys(FIXABLE_REASONS_FR).sort()).toEqual([...types].sort());
  });

  it("names every write gated on plugin 0.5.0", () => {
    const ids = [...src("capabilities.ts").matchAll(/\{ id: "(write_[a-z_]+)", needs:/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(CAPABILITY_GAPS_FR.needs[id], id).toBeTruthy();
  });

  it("writes the run summary with French plurals", () => {
    expect(RUN_SUMMARY_FR.tasks(1)).toBe("1 tâche créée");
    expect(RUN_SUMMARY_FR.tasks(10)).toBe("10 tâches créées");
  });
});
