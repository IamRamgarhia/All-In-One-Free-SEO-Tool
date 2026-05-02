"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { scrapeGbp, type GbpReport } from "@/lib/gbp-scraper";
import { callAI } from "@/lib/ai-call";

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
  });

  if (!raw) {
    return {
      ok: false,
      error: "AI provider didn't respond. Set up a key in Settings.",
    };
  }
  return { ok: true, reply: raw.trim().replace(/^["']|["']$/g, "") };
}
