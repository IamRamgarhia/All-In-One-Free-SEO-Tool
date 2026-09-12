/**
 * Why the review list is empty.
 *
 * The scraper returned an empty list and `ok: true`, and the screen said
 * "No reviews extracted". That one sentence covered three different
 * facts, which lead to three opposite actions:
 *
 *   - The business has no reviews. Go and ask customers for some.
 *   - Google served the signed-out view, which leaves reviews out of the
 *     page entirely. Connect Google; the link cannot do it.
 *   - Google changed its markup and our selectors are stale. Fix the
 *     scraper.
 *
 * Found by running it against a real profile. The page loaded, the name,
 * address, phone and website all read correctly, and the reviews were
 * simply not in the DOM — the panel said "You're seeing a limited view
 * of Google Maps. Sign in." Reported as "no reviews", that is a tool
 * telling a business with reviews that it has none.
 *
 * The diagnosis is a pure function of the page text, so it is tested
 * against the text rather than against a browser.
 */

import { describe, expect, it } from "vitest";
import { diagnoseEmptyReviews } from "./gbp-scraper";

// Verbatim from the live page, cut down.
const LIMITED =
  "Lalit Jain Industries Private Limited-Delhi Manufacturer Directions Save " +
  "B-124, DSIIDC Industrial Area, Sector 1, Bawana, Delhi, 110039 Closed · Opens 9:30 am " +
  "prateektapes.com 099992 28490 Suggest an edit Photos Write a review About this data " +
  "You're seeing a limited view of Google Maps. Learn more Get the most out of Google Maps Sign in";

const NO_REVIEWS_YET =
  "Some New Cafe Coffee shop Directions Save 12 High Street Open · Closes 5 pm " +
  "Write a review Suggest an edit Photos About this data";

const HAS_REVIEWS =
  "Some Old Cafe 4.6 stars (1,204) Coffee shop Directions Save 12 High Street " +
  "Write a review Reviews Photos About";

describe("telling the three empty states apart", () => {
  it("names the signed-out view for what it is", () => {
    const d = diagnoseEmptyReviews(LIMITED);
    expect(d.limitedView).toBe(true);
    expect(d.noReviewsYet).toBe(false);
    expect(d.note).toMatch(/signed-out view/i);
    // The action the user should take, in the sentence itself.
    expect(d.note).toMatch(/connecting google/i);
  });

  it("says plainly when a profile has simply never been reviewed", () => {
    const d = diagnoseEmptyReviews(NO_REVIEWS_YET);
    expect(d.noReviewsYet).toBe(true);
    expect(d.limitedView).toBe(false);
    expect(d.note).toMatch(/no reviews yet/i);
  });

  it("admits it might be our fault when the page shows a rating", () => {
    // A rating on the page and no reviews in our list means the reviews
    // are there and we failed to read them. Blaming the profile would
    // send somebody chasing reviews they already have.
    const d = diagnoseEmptyReviews(HAS_REVIEWS);
    expect(d.limitedView).toBe(false);
    expect(d.noReviewsYet).toBe(false);
    expect(d.note).toMatch(/scraper/i);
  });

  it("does not guess from an empty page", () => {
    const d = diagnoseEmptyReviews("");
    expect(d.limitedView).toBe(false);
    expect(d.noReviewsYet).toBe(false);
    expect(d.note).toMatch(/scraper/i);
  });
});
