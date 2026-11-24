import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, extractVariables } from "./outreach";
import { DEFAULT_TEMPLATES_FR } from "./outreach.fr";

describe("French default outreach templates", () => {
  it("translates every default template", () => {
    expect(Object.keys(DEFAULT_TEMPLATES_FR).sort()).toEqual(DEFAULT_TEMPLATES.map((t) => t.name).sort());
  });

  it("uses only variables the sender can fill", () => {
    for (const t of DEFAULT_TEMPLATES) {
      const fr = DEFAULT_TEMPLATES_FR[t.name];
      for (const v of extractVariables(fr.subject, fr.body)) {
        expect(extractVariables(t.subject, t.body), `${t.name}: ${v}`).toContain(v);
      }
    }
  });
});
