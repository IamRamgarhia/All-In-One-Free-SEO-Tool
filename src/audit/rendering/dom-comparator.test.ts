import { describe, expect, it } from "vitest";
import { compareRawVsRendered } from "./dom-comparator";

describe("compareRawVsRendered", () => {
  it("detects content that only appears after JS", () => {
    const raw = "<html><body><div id='root'></div></body></html>";
    const rendered = `<html><body><h1>Hello world</h1>${" word".repeat(60)}</body></html>`;
    const diff = compareRawVsRendered(raw, rendered);
    expect(diff.contentAppearsOnlyAfterJs).toBe(true);
    expect(diff.renderedH1).toBe("Hello world");
  });

  it("flags title / canonical changes", () => {
    const raw =
      '<html><head><title>A</title><link rel="canonical" href="https://a.example/"/></head><body>content enough words here for a pass</body></html>';
    const rendered =
      '<html><head><title>B</title><link rel="canonical" href="https://b.example/"/></head><body>content enough words here for a pass</body></html>';
    const diff = compareRawVsRendered(raw, rendered);
    expect(diff.titleChanged).toBe(true);
    expect(diff.canonicalChanged).toBe(true);
    expect(diff.rawTitle).toBe("A");
    expect(diff.renderedTitle).toBe("B");
  });
});
