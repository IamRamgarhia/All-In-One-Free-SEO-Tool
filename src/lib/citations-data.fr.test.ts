import { describe, expect, it } from "vitest";
import { CITATIONS } from "./citations-data";
import { CITATION_NOTES_FR } from "./citations-data.fr";

describe("French directory notes", () => {
  it("translates the note of every directory that has one", () => {
    const withNotes = CITATIONS.filter((c) => c.notes).map((c) => c.name);
    expect(Object.keys(CITATION_NOTES_FR).sort()).toEqual([...withNotes].sort());
  });
});
