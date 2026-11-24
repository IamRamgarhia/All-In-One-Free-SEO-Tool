import { describe, expect, it } from "vitest";
import { scorePassage } from "./aio-passage-scorer";

const TEXT =
  "Schema markup is structured data that helps search engines understand a page. " +
  "Google documents it at [schema](https://developers.google.com/search). ".repeat(3) +
  "It describes products, reviews and events in a format that machines can read. ".repeat(4);

describe("passage notes in French", () => {
  it("writes every note in French with the same scores", () => {
    const en = scorePassage(TEXT, 0);
    const fr = scorePassage(TEXT, 0, "fr");
    expect(fr.score).toBe(en.score);
    for (const k of Object.keys(en.criteria) as (keyof typeof en.criteria)[]) {
      expect(fr.criteria[k].score, k).toBe(en.criteria[k].score);
      expect(fr.criteria[k].note, k).not.toBe(en.criteria[k].note);
    }
  });
});
