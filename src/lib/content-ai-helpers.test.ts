/**
 * The bulk-alt output budget.
 *
 * This is the regression test for a bug that hid behind a bad fixture.
 * generateBulkAlt accepted up to 30 images and asked for a flat 1200
 * output tokens, while the model has to echo each image's src back
 * alongside its alt text. On a real page — 15 images with ordinary long
 * URLs — the completion ran out mid-JSON and the whole run failed with
 * "AI provider didn't respond."
 *
 * Nothing caught it because scripts/ai-tools-check.ts pointed bulk-alt at
 * a page with no images on it, so the case reported "No images on this
 * page" and never produced a single row. A check that cannot exercise
 * the thing it names proves nothing about it.
 *
 * These assertions are about the budget growing with the work. They do
 * not call a model — that is ai-tools-check's job.
 */

import { describe, expect, it } from "vitest";
import { ALT_MAX_IMAGES, altTokenBudget } from "./content-ai-helpers";

describe("altTokenBudget", () => {
  it("grows with the number of images", () => {
    expect(altTokenBudget(20)).toBeGreaterThan(altTokenBudget(5));
    expect(altTokenBudget(5)).toBeGreaterThan(altTokenBudget(1));
  });

  it("never shrinks as images are added", () => {
    let last = -1;
    for (let n = 0; n <= ALT_MAX_IMAGES + 5; n++) {
      const b = altTokenBudget(n);
      expect(b).toBeGreaterThanOrEqual(last);
      last = b;
    }
  });

  it("covers a full page of images, which the old flat 1200 did not", () => {
    // One row is a src URL plus up to 160 characters of alt plus JSON
    // punctuation. ~110 tokens is the working estimate; the budget has to
    // clear that for the largest run the tool will accept.
    expect(altTokenBudget(ALT_MAX_IMAGES)).toBeGreaterThanOrEqual(
      ALT_MAX_IMAGES * 110,
    );
    // The size that actually failed in the wild.
    expect(altTokenBudget(15)).toBeGreaterThan(1200);
  });

  it("is capped, so a pathological page cannot ask for an enormous completion", () => {
    expect(altTokenBudget(100_000)).toBeLessThanOrEqual(8000);
    expect(altTokenBudget(Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(8000);
  });

  it("stays positive for junk input rather than asking for zero tokens", () => {
    // A zero or negative budget is a request the provider rejects, which
    // would turn a silly input into an opaque provider error.
    for (const n of [0, -1, -999, Number.NaN]) {
      expect(altTokenBudget(n)).toBeGreaterThan(0);
    }
  });
});
