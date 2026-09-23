/**
 * Google Business Profile, on a timer.
 *
 * The Business Profile surface in this app was the most expensive idle
 * asset in the repo: a full API client, a twenty-item playbook, fifty-
 * seven citation directories, local rank tracking — and not one line of
 * it ran unless somebody opened a page. For local SEO that is the wrong
 * way round. An unanswered one-star review costs more per hour than
 * almost anything the crawler finds, and nobody opens a reviews screen
 * on the morning it lands.
 *
 * So this checks what cannot wait for a visit: reviews with no reply,
 * and a profile missing the fields Google ranks on. Findings go through
 * the same pipeline as everything else, which means they reach the
 * ranked list, the findings board and the monthly report for free.
 *
 * ---
 *
 * HONESTY NOTE, because this matters more than the code.
 *
 * The success path here has never run. Business Profile needs the
 * `business.manage` OAuth scope, which a service account cannot hold,
 * and the only Google connection on this install is a service account.
 * So every path below has been exercised against the refusal, and the
 * part that reads real reviews has not.
 *
 * That is stated here rather than discovered later. This codebase has
 * shipped four separate features whose success path was never executed
 * and which reported success while doing nothing, and the lesson written
 * into its test suite is to prefer bugs that crash over bugs that lie.
 * Treat the review parsing below as unverified until somebody connects a
 * real profile.
 */

import { isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import {
  GbpScopeMissingError,
  fetchGbpLocationSummary,
  listGbpAccounts,
  listGbpLocations,
  listGbpReviews,
  type GbpReview,
} from "./gbp-api";
import { recordToolRun, type FindingDraft } from "./tool-findings";
import { withClientContext } from "./client-context";

/**
 * How long a review may sit unanswered before it is work.
 *
 * Google's own guidance is to reply to every review, and the playbook in
 * this repo says within 48 hours. A day is used here so the finding
 * exists while there is still time to hit that.
 */
const REPLY_GRACE_HOURS = 24;

/** Below this, an unanswered review stops being admin and starts being urgent. */
const LOW_RATING = 3;

export type GbpMonitorOutcome = {
  clientId: number;
  ok: boolean;
  /** Set when the connection cannot reach Business Profile at all. */
  needsScope?: boolean;
  error?: string;
  reviews?: number;
  findings?: number;
};

/**
 * Which findings a location's reviews and profile produce.
 *
 * Pure, so the rules can be tested without a Google connection — which
 * is the only way any of this gets tested at all until somebody grants
 * the scope. Signatures are stable across runs and carry no counts or
 * dates, so a reply marks one resolved rather than raising a new one.
 */
export function gbpFindings(opts: {
  reviews: readonly GbpReview[];
  profile: {
    websiteUri?: string | null;
    primaryPhone?: string | null;
    primaryCategory?: string | null;
  } | null;
  now?: number;
}): FindingDraft[] {
  const now = opts.now ?? Date.now();
  const out: FindingDraft[] = [];

  const unanswered = opts.reviews.filter((r) => {
    if (r.reply) return false;
    const at = Date.parse(r.createTime);
    if (!Number.isFinite(at)) return true;
    return now - at > REPLY_GRACE_HOURS * 3600_000;
  });

  // Low ratings first and separately. Lumping a one-star in with the
  // others buries the only one that is actually urgent — an unanswered
  // complaint is the first thing a person searching the business reads.
  const bad = unanswered.filter(
    (r) => r.starRating !== null && r.starRating < LOW_RATING,
  );
  if (bad.length > 0) {
    out.push({
      signature: "gbp.unanswered_low_rating",
      title: `${bad.length} negative review${bad.length === 1 ? "" : "s"} with no reply`,
      severity: "high",
      category: "local",
      details:
        `${bad.length} review${bad.length === 1 ? "" : "s"} of ${LOW_RATING} stars or fewer ` +
        `${bad.length === 1 ? "has" : "have"} gone unanswered for more than a day. ` +
        "A reply is read by everyone who finds the listing later, not just the reviewer.",
    });
  }

  const rest = unanswered.length - bad.length;
  if (rest > 0) {
    out.push({
      signature: "gbp.unanswered_review",
      title: `${rest} review${rest === 1 ? "" : "s"} with no reply`,
      severity: "medium",
      category: "local",
      details:
        "Google recommends replying to every review. Replies are public and " +
        "show the business is active, which is one of the few local signals " +
        "entirely within your control.",
    });
  }

  // Profile completeness. Only the three fields whose absence is
  // unambiguous — a missing category or phone number is always wrong for
  // a local business, where "not enough photos" is a judgement.
  const p = opts.profile;
  if (p) {
    const missing: string[] = [];
    if (!p.primaryCategory?.trim()) missing.push("primary category");
    if (!p.primaryPhone?.trim()) missing.push("phone number");
    if (!p.websiteUri?.trim()) missing.push("website link");
    if (missing.length > 0) {
      out.push({
        signature: "gbp.profile_incomplete",
        title: `Business Profile is missing ${missing.join(", ")}`,
        severity: missing.includes("primary category") ? "high" : "medium",
        category: "local",
        details:
          `Google uses these directly to decide which searches show this business. ` +
          `Missing: ${missing.join(", ")}.`,
      });
    }
  }

  return out;
}

/**
 * Check one client's Business Profile and record what it finds.
 *
 * Returns rather than throws for the no-scope case, because that is the
 * expected state on an install connected by service account rather than
 * a fault to log every night.
 */
export async function monitorGbpForClient(
  clientId: number,
): Promise<GbpMonitorOutcome> {
  try {
    const accounts = await listGbpAccounts({ clientIdScope: clientId });
    if (accounts.length === 0) {
      return { clientId, ok: true, reviews: 0, findings: 0 };
    }
    const locations = await listGbpLocations({
      accountName: accounts[0].name,
      clientIdScope: clientId,
    });
    const location = locations[0];
    if (!location) return { clientId, ok: true, reviews: 0, findings: 0 };

    const [reviews, profile] = await Promise.all([
      listGbpReviews({ locationName: location.name, clientIdScope: clientId }),
      fetchGbpLocationSummary({
        locationName: location.name,
        clientIdScope: clientId,
      }).catch(() => null),
    ]);

    const findings = gbpFindings({ reviews, profile });
    await recordToolRun({
      toolId: "gbp",
      label: `${location.title || location.name} · ${reviews.length} reviews`,
      clientId,
      input: { locationName: location.name },
      result: { ok: true, reviews: reviews.length, findings: findings.length },
      findings,
    });

    return {
      clientId,
      ok: true,
      reviews: reviews.length,
      findings: findings.length,
    };
  } catch (err) {
    if (err instanceof GbpScopeMissingError) {
      // Not an error worth alarming about. It means this install signs in
      // to Google in a way that cannot reach Business Profile, which is
      // a setup fact rather than a failure, and it will be true every
      // night until somebody changes it.
      return {
        clientId,
        ok: false,
        needsScope: true,
        error:
          "Business Profile needs a Google account connected through the OAuth flow. A service account cannot hold the business.manage scope.",
      };
    }
    return { clientId, ok: false, error: (err as Error).message };
  }
}

/** Every client that names a Business Profile. */
export async function tickGbpMonitor(): Promise<GbpMonitorOutcome[]> {
  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    // Only clients someone has actually pointed at a listing. Asking
    // Google about every client on the books would spend quota to be
    // told "no accounts" over and over.
    .where(isNotNull(clients.gbpUrl));

  const out: GbpMonitorOutcome[] = [];
  for (const c of rows) {
    out.push(await withClientContext(c.id, () => monitorGbpForClient(c.id)));
  }
  return out;
}

export { summariseGbp } from "./gbp-summary";


