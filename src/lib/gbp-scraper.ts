import { withBrowserContext } from "./browser-pool";

/**
 * Public Google Business Profile scraper. Pulls rating, review count, hours,
 * categories, address, top recent reviews from the Maps page. Best-effort —
 * Google's GBP HTML is fragile, so missing fields are normal.
 */

export type GbpReview = {
  author: string;
  rating: number | null;
  text: string;
  relativeTime: string | null;
};

export type GbpReport = {
  ok: boolean;
  error?: string;
  url: string;
  finalUrl: string | null;
  name: string | null;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string[] | null;
  reviews: GbpReview[];
  /**
   * Google served the signed-out view, which omits the review list.
   *
   * Found by running this against a real profile: the page loads, the
   * name, address, hours and phone all read correctly, and the reviews
   * are simply not in the DOM — the panel says "You're seeing a limited
   * view of Google Maps. Sign in." Without this flag the result is an
   * empty review list and `ok: true`, which reads as "this business has
   * no reviews" and is a different fact entirely.
   */
  limitedView: boolean;
  /**
   * Has this profile genuinely never been reviewed?
   *
   * Distinguished from the above because the two look identical in the
   * output and lead to opposite actions: one means go and ask customers
   * for reviews, the other means Google would not show them to us.
   */
  noReviewsYet: boolean;
  /** What could not be read, in words, for the UI to show. */
  couldNotRead: string[];
};

export async function scrapeGbp(rawUrl: string): Promise<GbpReport> {
  const out: GbpReport = {
    ok: false,
    url: rawUrl,
    finalUrl: null,
    name: null,
    rating: null,
    reviewCount: null,
    category: null,
    address: null,
    phone: null,
    website: null,
    hours: null,
    reviews: [],
    limitedView: false,
    noReviewsYet: false,
    couldNotRead: [],
  };

  if (!rawUrl?.trim()) {
    out.error = "URL required";
    return out;
  }

  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  return withBrowserContext(async (context) => {
    const page = await context.newPage();

    try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);

    out.finalUrl = page.url();

    // Name — usually in the page title or h1
    out.name = await page
      .evaluate(() => {
        const h1 = document.querySelector("h1");
        if (h1) return (h1.textContent ?? "").trim() || null;
        const title = document.title;
        return title ? title.split(" - ")[0].trim() : null;
      })
      .catch(() => null);

    // Rating + review count
    const ratingData = await page
      .evaluate(() => {
        // Try aria-label patterns first ("4.5 stars")
        const ratingLabel = document.querySelector(
          "[role='img'][aria-label*='star']",
        );
        if (ratingLabel) {
          const lbl = ratingLabel.getAttribute("aria-label") ?? "";
          const m = lbl.match(/([\d.]+)\s*star/i);
          if (m) {
            const reviewCountEl = ratingLabel.parentElement?.querySelector("button, span");
            const cnt = (reviewCountEl?.textContent ?? "").match(
              /([\d,]+)\s*review/i,
            );
            const rating = parseFloat(m[1]);
            const count = cnt ? parseInt(cnt[1].replace(/,/g, ""), 10) : null;
            return {
              rating: Number.isFinite(rating) ? rating : null,
              count: count != null && Number.isFinite(count) ? count : null,
            };
          }
        }
        return null;
      })
      .catch(() => null);

    if (ratingData && ratingData.rating !== null) {
      out.rating = ratingData.rating;
      out.reviewCount = ratingData.count;
    }

    // Address — look for a button with aria-label="Address: ..."
    out.address = await page
      .evaluate(() => {
        const btn = document.querySelector("button[aria-label^='Address']");
        if (btn) {
          const lbl = btn.getAttribute("aria-label") ?? "";
          return lbl.replace(/^Address:\s*/i, "").trim() || null;
        }
        return null;
      })
      .catch(() => null);

    // Phone
    out.phone = await page
      .evaluate(() => {
        const btn = document.querySelector("button[aria-label^='Phone']");
        if (btn) {
          const lbl = btn.getAttribute("aria-label") ?? "";
          return lbl.replace(/^Phone:\s*/i, "").trim() || null;
        }
        return null;
      })
      .catch(() => null);

    // Website
    out.website = await page
      .evaluate(() => {
        const a = document.querySelector("a[aria-label^='Website']");
        if (a) {
          return (a as HTMLAnchorElement).href || null;
        }
        return null;
      })
      .catch(() => null);

    // Reviews — first try clicking the Reviews tab to load them.
    try {
      const reviewsTab = await page.$("button[aria-label^='Reviews']");
      if (reviewsTab) {
        await reviewsTab.click();
        await page.waitForTimeout(2000);
      }
    } catch {
      // ignore
    }

    out.reviews = await page
      .$$eval("[data-review-id], div[jsaction*='review']", (els) => {
        const result: {
          author: string;
          rating: number | null;
          text: string;
          relativeTime: string | null;
        }[] = [];
        for (const el of els as HTMLElement[]) {
          const authorEl = el.querySelector("button[jsaction*='reviewerLink'], div[class*='author']");
          const author = (authorEl?.textContent ?? "").trim();
          if (!author) continue;
          const ratingEl = el.querySelector("[role='img'][aria-label*='star']");
          let rating: number | null = null;
          if (ratingEl) {
            const m = (ratingEl.getAttribute("aria-label") ?? "").match(
              /([\d.]+)\s*star/i,
            );
            if (m) rating = parseFloat(m[1]);
          }
          const textEl = el.querySelector("span[class*='wiI7pd'], div[class*='MyEned']");
          const text = (textEl?.textContent ?? "").trim();
          const timeEl = el.querySelector("span[class*='rsqaWe']");
          const relativeTime = (timeEl?.textContent ?? "").trim() || null;
          result.push({ author, rating, text, relativeTime });
          if (result.length >= 12) break;
        }
        return result;
      })
      .catch(() => [] as GbpReview[]);

      // Why the review list is empty, when it is.
      //
      // An empty list with ok:true says "this business has no reviews",
      // and that is one of three different facts. Establishing which
      // costs one DOM read and decides what the user should do: chase
      // reviews, sign in, or report a broken scraper.
      if (out.reviews.length === 0) {
        const bodyText = await page
          .evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " "))
          .catch(() => "");
        const d = diagnoseEmptyReviews(bodyText);
        out.limitedView = d.limitedView;
        out.noReviewsYet = d.noReviewsYet;
        out.couldNotRead.push(d.note);
      }
      if (out.rating == null && !out.noReviewsYet) {
        out.couldNotRead.push("The star rating was not readable from the public page.");
      }

      out.ok = true;
      return out;
    } catch (err) {
      out.error = (err as Error).message;
      return out;
    } finally {
      await page.close().catch(() => {});
    }
  });
}

/**
 * Why the review list came back empty.
 *
 * Three different facts produce the same empty array, and they lead to
 * opposite actions: chase reviews, connect Google, or fix this scraper.
 * Reporting all three as "no reviews extracted" told a business with
 * reviews that it had none.
 *
 * A pure function of the page text so it can be tested against the real
 * markup without a browser. The "limited view" string below is verbatim
 * from a live profile.
 */
export function diagnoseEmptyReviews(bodyText: string): {
  limitedView: boolean;
  noReviewsYet: boolean;
  note: string;
} {
  const body = bodyText.replace(/\s+/g, " ");

  if (/limited view of Google Maps/i.test(body)) {
    return {
      limitedView: true,
      noReviewsYet: false,
      note:
        "Google served the signed-out view of Maps, which leaves the reviews out of the page entirely. That is a limit of reading a public link, not a fault on the profile — connecting Google reads them properly.",
    };
  }

  // A rating on the page means the reviews are there and we failed to
  // read them. Blaming the profile here would send somebody chasing
  // reviews they already have.
  const hasRating = /\d(?:\.\d)?\s*stars?\b/i.test(body) || /\(\s*[\d,]+\s*\)/.test(body);
  const invitesAReview = /Write a review/i.test(body);

  if (!hasRating && invitesAReview) {
    return {
      limitedView: false,
      noReviewsYet: true,
      note: "This profile has no reviews yet. Nothing is missing — there is nothing there to read.",
    };
  }

  return {
    limitedView: false,
    noReviewsYet: false,
    note:
      "The reviews were not in the page. Google changes this markup without notice, so this is more likely a scraper that needs updating than a profile without reviews.",
  };
}
