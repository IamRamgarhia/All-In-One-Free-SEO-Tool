import { describe, expect, it } from "vitest";
import findings from "./data/findings.json";
import tiers from "./data/tiers.json";
import { GEO_TEXT_FR } from "./text.fr";

type Entry = { name?: string; title?: string; remediation?: string; strength?: string; partial?: { title?: string; remediation?: string } };

describe("French text of the GEO audit", () => {
  it("covers every title, advice, name and strength of the data files", () => {
    const texts: string[] = [];
    for (const group of [findings.signals, findings.checks] as Record<string, Entry>[]) {
      for (const e of Object.values(group)) {
        texts.push(...[e.name, e.title, e.remediation, e.strength, e.partial?.title, e.partial?.remediation].filter((t): t is string => Boolean(t)));
      }
    }
    for (const t of tiers.tiers) texts.push(t.meaning);
    expect(texts.filter((t) => !GEO_TEXT_FR[t])).toEqual([]);
  });
});
