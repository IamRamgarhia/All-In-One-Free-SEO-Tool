"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { scrapeGbp, type GbpReport } from "@/lib/gbp-scraper";
import { callAI } from "@/lib/ai-call";
import { getSetting } from "@/lib/settings-store";
import {
  GbpScopeMissingError,
  fetchGbpLocationSummary,
  listGbpAccounts,
  listGbpLocations,
  listGbpReviews,
  replyToGbpReview,
  type GbpLocation,
  type GbpReview,
} from "@/lib/gbp-api";

export type RunGbpResult =
  | { ok: true; report: GbpReport }
  | { ok: false; error: string };

export async function runGbpScrape(
  clientId: number,
): Promise<RunGbpResult> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };
  if (!client.gbpUrl) {
    return {
      ok: false,
      error:
        "No Google Business Profile URL on this client. Add it in Edit → GBP profile.",
    };
  }

  // The browser-based scraper is now opt-in. Default install uses the
  // official GBP API path (see loadGbpForClient below) which is faster,
  // more reliable, and zero browser cost. Users who can't get the API
  // scope can flip Settings → Browser → "Allow GBP scraper" to enable.
  const scraperDisabled = Boolean(
    await getSetting<boolean>("browser.disable_gbp_scraper"),
  );
  // Default-disabled: when the setting is undefined (fresh install),
  // we treat it as disabled. User must explicitly opt in via a future
  // toggle that sets browser.disable_gbp_scraper = false.
  const explicitlyEnabled = (await getSetting<boolean>(
    "browser.disable_gbp_scraper",
  )) === false;
  if (scraperDisabled || !explicitlyEnabled) {
    return {
      ok: false,
      error:
        "The browser-based GBP scraper is disabled to save memory. Use the official GBP API (connect Google with business.manage scope under Settings → Google), or enable the scraper under Settings → Browser pool.",
    };
  }

  const report = await scrapeGbp(client.gbpUrl);
  if (!report.ok) {
    return { ok: false, error: report.error ?? "Scrape failed" };
  }
  return { ok: true, report };
}

const REPLY_SYSTEM = `You write replies to Google Business Profile reviews.

Rules:
- Personal but professional tone
- Acknowledge specific points the reviewer made
- Thank them by name (use first name)
- ≤80 words
- For 4-5 star: warm thanks, invite back
- For 1-3 star: empathy, brief explanation if appropriate, offer to make it right offline
- Do not be defensive or argumentative
- Do not include promotional language
- Do not promise things outside your control

Output ONLY the reply text. No preamble.`;

export type GenerateReplyResult =
  | { ok: true; reply: string }
  | { ok: false; error: string };

export async function generateReviewReply(opts: {
  businessName: string;
  reviewer: string;
  reviewRating: number | null;
  reviewText: string;
}): Promise<GenerateReplyResult> {
  if (!opts.reviewText.trim()) {
    return { ok: false, error: "Review text is empty" };
  }

  const userPrompt = [
    `Business: ${opts.businessName}`,
    `Reviewer: ${opts.reviewer}`,
    `Rating: ${opts.reviewRating ?? "unknown"}/5`,
    `Review: "${opts.reviewText}"`,
    "",
    "Write the reply now. Reply text only, no quotation marks, no preamble.",
  ].join("\n");

  const raw = await callAI({
    system: REPLY_SYSTEM,
    user: userPrompt,
    maxTokens: 400,
    temperature: 0.5,
    timeoutMs: 30_000,
    feature: "review_reply",
  });

  if (!raw) {
    return {
      ok: false,
      error: "AI provider didn't respond. Set up a key in Settings.",
    };
  }
  return { ok: true, reply: raw.trim().replace(/^["']|["']$/g, "") };
}

// =============== Official GBP API path ===============

export type GbpApiState =
  | {
      ok: true;
      accounts: { name: string; accountName: string; type: string }[];
      locations: GbpLocation[];
      reviews: GbpReview[];
      selectedLocation: string | null;
    }
  | { ok: false; error: string; scopeMissing?: boolean };

export async function loadGbpForClient(
  clientId: number,
  selectedLocation?: string,
): Promise<GbpApiState> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };

  try {
    const accounts = await listGbpAccounts({ clientIdScope: clientId });
    if (accounts.length === 0) {
      return {
        ok: true,
        accounts: [],
        locations: [],
        reviews: [],
        selectedLocation: null,
      };
    }
    // Use first account by default (most users have only one)
    const acct = accounts[0];
    const locations = await listGbpLocations({
      accountName: acct.name,
      clientIdScope: clientId,
    });
    const locName = selectedLocation ?? locations[0]?.name ?? null;
    let reviews: GbpReview[] = [];
    if (locName) {
      try {
        reviews = await listGbpReviews({
          locationName: locName,
          clientIdScope: clientId,
        });
      } catch {
        reviews = [];
      }
    }
    return {
      ok: true,
      accounts,
      locations,
      reviews,
      selectedLocation: locName,
    };
  } catch (err) {
    if (err instanceof GbpScopeMissingError) {
      return {
        ok: false,
        error: err.message,
        scopeMissing: true,
      };
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function postGbpReply(opts: {
  clientId: number;
  reviewName: string;
  comment: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!opts.comment.trim()) return { ok: false, error: "Reply is empty" };
  return await replyToGbpReview({
    reviewName: opts.reviewName,
    comment: opts.comment.trim(),
    clientIdScope: opts.clientId,
  });
}

// =============== GBP post composer ===============

const POST_SYSTEM = `You write Google Business Profile posts that drive engagement.

Strict rules:
- Hook in the first 12 words. GBP truncates after that in mobile previews.
- 100-300 words total.
- One CTA at the end ("Book now", "Call today", "Order online", "Visit us this week").
- Plain, conversational. Use "you" not "our customers".
- No emoji unless the post type explicitly fits one.
- Local detail when possible — mention the city, neighbourhood, or "your area".
- Output ONLY the post text. No headers, no preamble, no quotes.`;

export type ComposePostResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function composeGbpPost(opts: {
  clientId: number;
  clientName: string;
  niche: string | null;
  city: string | null;
  postType: "offer" | "event" | "update" | "product" | "story";
  topic: string;
  ctaUrl?: string;
}): Promise<ComposePostResult> {
  if (!opts.topic.trim())
    return { ok: false, error: "Topic / angle is required" };

  const userPrompt = [
    `Business: ${opts.clientName}`,
    opts.niche ? `Niche: ${opts.niche}` : "",
    opts.city ? `City: ${opts.city}` : "",
    `Post type: ${opts.postType}`,
    `Angle: ${opts.topic}`,
    opts.ctaUrl ? `CTA URL: ${opts.ctaUrl}` : "",
    "",
    "Write the GBP post now. Post text only.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callAI({
    system: POST_SYSTEM,
    user: userPrompt,
    maxTokens: 600,
    temperature: 0.6,
    timeoutMs: 30_000,
    feature: "content_idea",
    clientId: opts.clientId,
  });
  if (!raw) {
    return {
      ok: false,
      error: "AI provider didn't respond. Set up a key in Settings.",
    };
  }
  return { ok: true, text: raw.trim().replace(/^["']|["']$/g, "") };
}

// =============== Daily GBP post idea generator ===============

const IDEAS_SYSTEM = `You generate a 7-day Google Business Profile posting calendar tailored to one local business. Output JSON only — an array of exactly 7 objects, one per day. Each object: { "day": "Mon"|"Tue"|...|"Sun", "postType": "offer"|"event"|"update"|"product"|"story", "title": "<hook line, 8-14 words>", "angle": "<one sentence describing what the post is about>", "cta": "<CTA verb phrase, e.g. 'Book a slot today'>" }.

Rules:
- Mix post types across the week — at least 3 different types.
- Each idea must be concretely tied to the business / niche / city given. No generic content.
- Hooks should pass the "would-a-local-person-stop-scrolling" test.
- Output ONLY the JSON array. No prose, no code fences, no commentary.`;

export type GbpPostIdea = {
  day: string;
  postType: "offer" | "event" | "update" | "product" | "story";
  title: string;
  angle: string;
  cta: string;
};

export type IdeasResult =
  | { ok: true; ideas: GbpPostIdea[] }
  | { ok: false; error: string };

export async function generateGbpPostIdeas(opts: {
  clientId: number;
  clientName: string;
  niche: string | null;
  city: string | null;
  businessType?: string | null;
  description?: string | null;
}): Promise<IdeasResult> {
  const userPrompt = [
    `Business: ${opts.clientName}`,
    opts.businessType ? `Business type: ${opts.businessType}` : "",
    opts.niche ? `Niche: ${opts.niche}` : "",
    opts.city ? `City: ${opts.city}` : "",
    opts.description
      ? `Description: ${opts.description.slice(0, 300)}`
      : "",
    "",
    `Generate 7 daily GBP post ideas (Mon-Sun) for the upcoming week. JSON array only.`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callAI({
    system: IDEAS_SYSTEM,
    user: userPrompt,
    maxTokens: 900,
    temperature: 0.7,
    timeoutMs: 30_000,
    feature: "content_idea",
    clientId: opts.clientId,
  });
  if (!raw) {
    return {
      ok: false,
      error: "AI provider didn't respond. Set up a key in Settings.",
    };
  }
  // Strip code fences if the model added them despite instructions.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: "AI returned an unexpected format." };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as GbpPostIdea[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: false, error: "AI returned an empty list." };
    }
    const valid = parsed
      .filter(
        (p) =>
          typeof p?.day === "string" &&
          typeof p?.title === "string" &&
          typeof p?.angle === "string" &&
          typeof p?.cta === "string" &&
          ["offer", "event", "update", "product", "story"].includes(
            (p as { postType?: string }).postType ?? "",
          ),
      )
      .slice(0, 7);
    if (valid.length === 0) {
      return { ok: false, error: "AI returned no valid ideas." };
    }
    return { ok: true, ideas: valid };
  } catch {
    return { ok: false, error: "Couldn't parse AI response." };
  }
}

/** Used by health checks: confirm the location is reachable via the API. */
export async function pingGbpLocation(opts: {
  clientId: number;
  locationName: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const loc = await fetchGbpLocationSummary({
      locationName: opts.locationName,
      clientIdScope: opts.clientId,
    });
    return { ok: !!loc };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
