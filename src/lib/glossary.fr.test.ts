import { describe, expect, it } from "vitest";
import { GLOSSARY_KEYS, lookupTerm } from "./glossary";
import { GLOSSARY_FR } from "./glossary.fr";

describe("French glossary", () => {
  it("defines every term of the glossary", () => {
    expect(Object.keys(GLOSSARY_FR).sort()).toEqual([...GLOSSARY_KEYS].sort());
  });

  it("is what a French reader gets", () => {
    expect(lookupTerm("Title", "fr")?.short).toBe(GLOSSARY_FR.title.short);
    expect(lookupTerm("title", "en")?.short).not.toBe(GLOSSARY_FR.title.short);
  });
});
