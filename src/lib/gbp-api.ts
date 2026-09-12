/**
 * Google Business Profile API — official, free. Requires the user to
 * connect Google with the `business.manage` scope (asked at OAuth time
 * if they want to manage GBP). Returns canonical, write-back-capable data
 * the public scraper can never match.
 *
 * Docs: https://developers.google.com/my-business
 *
 * Endpoints used:
 *   - mybusinessaccountmanagement.googleapis.com/v1/accounts
 *   - mybusinessbusinessinformation.googleapis.com/v1/{name}/locations
 *   - mybusiness.googleapis.com/v4/{name}/reviews          (legacy v4 still required for reviews)
 *
 * The scope `https://www.googleapis.com/auth/business.manage` MUST be
 * granted — if it isn't, calls will return 403. We fall back to the
 * existing scraper in that case, so users without GBP access still see
 * data on the page.
 */

import { getAccessToken } from "./google-oauth";

export type GbpAccount = {
  /** "accounts/12345" */
  name: string;
  accountName: string;
  type: string;
};

export type GbpLocation = {
  /** "accounts/12345/locations/67890" */
  name: string;
  title: string;
  storefrontAddress: {
    addressLines: string[];
    locality: string;
    administrativeArea: string;
    postalCode: string;
    regionCode: string;
  } | null;
  websiteUri: string | null;
  primaryPhone: string | null;
  primaryCategory: string | null;
  rating: number | null;
  reviewCount: number | null;
};

export type GbpReview = {
  reviewId: string;
  reviewer: { displayName: string; profilePhotoUrl?: string };
  starRating: 1 | 2 | 3 | 4 | 5 | null;
  comment: string | null;
  createTime: string;
  updateTime: string;
  reply: { comment: string; updateTime: string } | null;
};

export class GbpScopeMissingError extends Error {
  constructor() {
    super(
      "Google Business Profile scope not granted. Reconnect Google with the business.manage scope.",
    );
    this.name = "GbpScopeMissingError";
  }
}

/**
 * List the GBP accounts the connected Google identity manages. An "account"
 * is a top-level container — businesses with multiple locations all live
 * under one account.
 */
export async function listGbpAccounts(opts?: {
  clientIdScope?: number;
}): Promise<GbpAccount[]> {
  const token = await getAccessToken(opts?.clientIdScope);
  const res = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=50",
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (res.status === 403) throw new GbpScopeMissingError();
  if (!res.ok) {
    throw new Error(`GBP accounts list failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    accounts?: Array<{ name: string; accountName: string; type: string }>;
  };
  return data.accounts ?? [];
}

/**
 * Locations under an account. Includes basic info, no reviews. Reviews
 * require a second call per location.
 */
export async function listGbpLocations(opts: {
  accountName: string;
  clientIdScope?: number;
}): Promise<GbpLocation[]> {
  const token = await getAccessToken(opts.clientIdScope);
  // readMask drives which fields come back — we ask for everything we render
  const params = new URLSearchParams({
    pageSize: "100",
    readMask:
      "name,title,storefrontAddress,websiteUri,phoneNumbers,categories,metadata",
  });
  const res = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${opts.accountName}/locations?${params}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (res.status === 403) throw new GbpScopeMissingError();
  if (!res.ok) {
    throw new Error(`GBP locations list failed: ${res.status}`);
  }
  type RawLoc = {
    name?: string;
    title?: string;
    storefrontAddress?: GbpLocation["storefrontAddress"];
    websiteUri?: string;
    phoneNumbers?: { primaryPhone?: string };
    categories?: { primaryCategory?: { displayName?: string } };
  };
  const data = (await res.json()) as { locations?: RawLoc[] };
  return (data.locations ?? []).map((l) => ({
    name: l.name ?? "",
    title: l.title ?? "",
    storefrontAddress: l.storefrontAddress ?? null,
    websiteUri: l.websiteUri ?? null,
    primaryPhone: l.phoneNumbers?.primaryPhone ?? null,
    primaryCategory: l.categories?.primaryCategory?.displayName ?? null,
    rating: null, // not in the readMask we requested; fetch separately if needed
    reviewCount: null,
  }));
}

const STAR_RATING_MAP: Record<string, 1 | 2 | 3 | 4 | 5> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

/**
 * Reviews for a location. The legacy v4 endpoint is still the only one
 * exposing reviews — Google has been "migrating" this for years.
 */
export async function listGbpReviews(opts: {
  /** Format: accounts/{id}/locations/{id} */
  locationName: string;
  pageSize?: number;
  clientIdScope?: number;
  /** Continue a previous page. Returned as `nextPageToken`. */
  pageToken?: string;
}): Promise<GbpReview[]> {
  return (await listGbpReviewPage(opts)).reviews;
}

/**
 * One page of reviews, plus the token for the next.
 *
 * Split out because "did we see every review" is a question with real
 * consequences: a sync that marks unseen reviews as deleted must know
 * whether it reached the end, or it will mark everything past the first
 * fifty as gone.
 */
export async function listGbpReviewPage(opts: {
  locationName: string;
  pageSize?: number;
  clientIdScope?: number;
  pageToken?: string;
}): Promise<{
  reviews: GbpReview[];
  nextPageToken: string | null;
  averageRating: number | null;
  totalReviewCount: number | null;
}> {
  const token = await getAccessToken(opts.clientIdScope);
  const params = new URLSearchParams({ pageSize: String(opts.pageSize ?? 50) });
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  const url = `https://mybusiness.googleapis.com/v4/${opts.locationName}/reviews?${params}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 403) throw new GbpScopeMissingError();
  if (!res.ok) {
    throw new Error(`GBP reviews fetch failed: ${res.status}`);
  }
  type RawReview = {
    reviewId?: string;
    reviewer?: { displayName?: string; profilePhotoUrl?: string };
    starRating?: string;
    comment?: string;
    createTime?: string;
    updateTime?: string;
    reviewReply?: { comment?: string; updateTime?: string };
  };
  const data = (await res.json()) as {
    reviews?: RawReview[];
    nextPageToken?: string;
    averageRating?: number;
    totalReviewCount?: number;
  };
  const reviews = (data.reviews ?? []).map((r) => ({
    reviewId: r.reviewId ?? "",
    reviewer: {
      displayName: r.reviewer?.displayName ?? "Anonymous",
      profilePhotoUrl: r.reviewer?.profilePhotoUrl,
    },
    starRating: r.starRating ? STAR_RATING_MAP[r.starRating] ?? null : null,
    comment: r.comment ?? null,
    createTime: r.createTime ?? "",
    updateTime: r.updateTime ?? "",
    reply: r.reviewReply
      ? {
          comment: r.reviewReply.comment ?? "",
          updateTime: r.reviewReply.updateTime ?? "",
        }
      : null,
  }));
  return {
    reviews,
    nextPageToken: data.nextPageToken ?? null,
    averageRating: data.averageRating ?? null,
    totalReviewCount: data.totalReviewCount ?? null,
  };
}

/**
 * Every review on a location, paged to the end.
 *
 * `complete` says whether it really got to the end. It is false when the
 * page cap was hit, and the sync uses it to decide whether it is allowed
 * to mark anything as deleted — the difference between "this review is
 * gone" and "I stopped reading" is the whole queue.
 */
export async function fetchAllGbpReviews(opts: {
  locationName: string;
  clientIdScope?: number;
  /** Safety stop. 20 pages of 50 is a thousand reviews. */
  maxPages?: number;
}): Promise<{
  reviews: GbpReview[];
  complete: boolean;
  averageRating: number | null;
  totalReviewCount: number | null;
}> {
  const maxPages = opts.maxPages ?? 20;
  const all: GbpReview[] = [];
  let pageToken: string | undefined;
  let averageRating: number | null = null;
  let totalReviewCount: number | null = null;

  for (let page = 0; page < maxPages; page++) {
    const res = await listGbpReviewPage({ ...opts, pageSize: 50, pageToken });
    all.push(...res.reviews);
    averageRating ??= res.averageRating;
    totalReviewCount ??= res.totalReviewCount;
    if (!res.nextPageToken) {
      return { reviews: all, complete: true, averageRating, totalReviewCount };
    }
    pageToken = res.nextPageToken;
  }
  return { reviews: all, complete: false, averageRating, totalReviewCount };
}

/**
 * Reply to a review (write-back). The reply replaces any prior reply.
 */
export async function replyToGbpReview(opts: {
  reviewName: string; // accounts/{id}/locations/{id}/reviews/{id}
  comment: string;
  clientIdScope?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const token = await getAccessToken(opts.clientIdScope);
  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${opts.reviewName}/reply`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ comment: opts.comment }),
    },
  );
  if (res.status === 403) {
    return {
      ok: false,
      error: "GBP scope not granted. Reconnect Google with business.manage.",
    };
  }
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

/**
 * Convenience: pull the canonical location summary (locations.list returns
 * one row that matches our scraper's shape, so callers can swap one for
 * the other without reshaping data).
 */
export async function fetchGbpLocationSummary(opts: {
  locationName: string;
  clientIdScope?: number;
}): Promise<GbpLocation | null> {
  const token = await getAccessToken(opts.clientIdScope);
  const params = new URLSearchParams({
    readMask:
      "name,title,storefrontAddress,websiteUri,phoneNumbers,categories",
  });
  const res = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${opts.locationName}?${params}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (res.status === 403) throw new GbpScopeMissingError();
  if (!res.ok) return null;
  type Raw = {
    name?: string;
    title?: string;
    storefrontAddress?: GbpLocation["storefrontAddress"];
    websiteUri?: string;
    phoneNumbers?: { primaryPhone?: string };
    categories?: { primaryCategory?: { displayName?: string } };
  };
  const l = (await res.json()) as Raw;
  return {
    name: l.name ?? "",
    title: l.title ?? "",
    storefrontAddress: l.storefrontAddress ?? null,
    websiteUri: l.websiteUri ?? null,
    primaryPhone: l.phoneNumbers?.primaryPhone ?? null,
    primaryCategory: l.categories?.primaryCategory?.displayName ?? null,
    rating: null,
    reviewCount: null,
  };
}



/**
 * Create a Google Business Profile local post. Used by the daily-
 * automation publish step when a gbp_post queue item is approved.
 *
 * Endpoint: mybusiness.googleapis.com/v4/{locationName}/localPosts
 * (the v4 API is still the only public surface for posts in 2026)
 *
 * `summary` is the post body, capped at 1500 chars by Google. The
 * helper truncates rather than rejects.
 */
export async function createGbpLocalPost(opts: {
  locationName: string;
  summary: string;
  callToAction?: {
    actionType:
      | "BOOK"
      | "ORDER"
      | "SHOP"
      | "LEARN_MORE"
      | "SIGN_UP"
      | "CALL";
    url?: string;
  };
  mediaUrl?: string;
  clientIdScope?: number;
}): Promise<
  | { ok: true; postName: string; searchUrl: string | null }
  | { ok: false; error: string }
> {
  const token = await getAccessToken(opts.clientIdScope);
  const summary = opts.summary.slice(0, 1500);

  const body: Record<string, unknown> = {
    languageCode: "en-US",
    summary,
    topicType: "STANDARD",
  };
  if (opts.callToAction) {
    body.callToAction = opts.callToAction;
  }
  if (opts.mediaUrl) {
    body.media = [{ mediaFormat: "PHOTO", sourceUrl: opts.mediaUrl }];
  }

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${opts.locationName}/localPosts`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (res.status === 403) {
    return {
      ok: false,
      error:
        "GBP scope missing — reconnect Google with business.manage scope.",
    };
  }
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text.slice(0, 300) || res.statusText };
  }
  type Resp = { name?: string; searchUrl?: string };
  const data = (await res.json()) as Resp;
  return {
    ok: true,
    postName: data.name ?? "",
    searchUrl: data.searchUrl ?? null,
  };
}
