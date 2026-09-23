"use server";

/**
 * The review desk: pull, draft, edit, send.
 *
 * The connected Business Profile path was built months ago and wired to
 * nothing. `loadGbpForClient`, `postGbpReply` and `pingGbpLocation` were
 * all written, all correct, and called from no page — so the only review
 * workflow a user could reach was the scraped one, which can show a
 * review and cannot answer it. You read the reply the tool drafted, then
 * copied it into Google yourself.
 *
 * Everything here goes through the stored queue rather than a live fetch,
 * so what still needs answering survives a page reload, a restart and a
 * month.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import {
  GbpScopeMissingError,
  listGbpAccounts,
  listGbpLocations,
  type GbpLocation,
} from "@/lib/gbp-api";
import {
  listReviewQueue,
  reviewCounts,
  saveDraftReply,
  sendAllDrafts,
  sendReply,
  syncGbpReviews,
  type QueueFilter,
  type ReviewQueueCounts,
} from "@/lib/gbp-review-queue";
import { draftRepliesForQueue, type DraftBatchResult } from "@/lib/gbp-reply-drafter";
import { appendResearchLog } from "@/lib/client-knowledge";
import type { GbpReviewRow } from "@/db/schema";

export type ReviewDeskState = {
  counts: ReviewQueueCounts;
  rows: GbpReviewRow[];
  filter: QueueFilter;
  locationName: string | null;
  /** Never synced, so the counts below are all zero and mean nothing. */
  neverSynced: boolean;
  lastSynced: Date | null;
};

function refresh(clientId: number) {
  revalidatePath(`/gbp/c/${clientId}/reviews`);
}

export async function loadReviewDesk(
  clientId: number,
  filter: QueueFilter = "unanswered",
): Promise<ReviewDeskState> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const rows = await listReviewQueue({ clientId, filter, limit: 100 });
  const counts = await reviewCounts(clientId);
  const all = await listReviewQueue({ clientId, filter: "all", limit: 1 });

  return {
    counts,
    rows,
    filter,
    locationName: client?.gbpLocationName ?? null,
    // Zero unanswered because everything is answered, and zero because
    // we have never looked, are the same number and opposite facts.
    neverSynced: all.length === 0,
    lastSynced: all[0]?.lastSyncedAt ?? null,
  };
}

export type LocationChoices =
  | { ok: true; locations: GbpLocation[]; selected: string | null }
  | { ok: false; error: string; scopeMissing?: boolean };

/** The locations this Google account can manage. */
export async function listLocationChoices(
  clientId: number,
): Promise<LocationChoices> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found." };

  try {
    const accounts = await listGbpAccounts({ clientIdScope: clientId });
    if (accounts.length === 0) {
      return {
        ok: false,
        error:
          "Google is connected but no Business Profile accounts came back. The account you connected may not manage any listings.",
      };
    }
    const locations: GbpLocation[] = [];
    for (const acct of accounts) {
      locations.push(
        ...(await listGbpLocations({ accountName: acct.name, clientIdScope: clientId })),
      );
    }
    return { ok: true, locations, selected: client.gbpLocationName };
  } catch (err) {
    if (err instanceof GbpScopeMissingError) {
      return { ok: false, error: err.message, scopeMissing: true };
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function chooseLocation(
  clientId: number,
  locationName: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(locationName)) {
    return { ok: false, error: "That is not a location name." };
  }
  await db
    .update(clients)
    .set({ gbpLocationName: locationName })
    .where(eq(clients.id, clientId));
  refresh(clientId);
  return { ok: true };
}

export type SyncResult =
  | { ok: true; added: number; updated: number; removed: number; complete: boolean }
  | { ok: false; error: string; scopeMissing?: boolean };

export async function syncReviews(clientId: number): Promise<SyncResult> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found." };
  if (!client.gbpLocationName) {
    return {
      ok: false,
      error: "Pick which Business Profile location this client is first.",
    };
  }

  try {
    const out = await syncGbpReviews({
      clientId,
      locationName: client.gbpLocationName,
    });
    await appendResearchLog(
      clientId,
      `Pulled Business Profile reviews: ${out.seen} seen, ${out.added} new, ${out.removed} gone` +
        (out.complete ? "" : " (stopped at the page cap, so nothing was marked gone)"),
      "app",
    );
    refresh(clientId);
    return {
      ok: true,
      added: out.added,
      updated: out.updated,
      removed: out.removed,
      complete: out.complete,
    };
  } catch (err) {
    if (err instanceof GbpScopeMissingError) {
      return { ok: false, error: err.message, scopeMissing: true };
    }
    return { ok: false, error: (err as Error).message };
  }
}

export type DraftBatchState =
  | { ok: true; result: DraftBatchResult }
  | { ok: false; error: string };

/**
 * Draft the next N replies. Sends nothing.
 *
 * Drafting and sending are separate calls and separate buttons, on
 * purpose. A batch that published ten replies in a business owner's name
 * without them reading one is the worst thing this tool could do, and
 * "they were only drafts" stops being a defence the moment they are on
 * Google.
 */
export async function draftNextReplies(opts: {
  clientId: number;
  limit?: number;
  redraft?: boolean;
}): Promise<DraftBatchState> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found." };

  const result = await draftRepliesForQueue({
    clientId: opts.clientId,
    businessName: client.name,
    limit: opts.limit,
    redraft: opts.redraft,
  });
  refresh(opts.clientId);
  return { ok: true, result };
}

export async function saveDraft(opts: {
  clientId: number;
  reviewId: string;
  text: string;
}): Promise<{ ok: boolean }> {
  await saveDraftReply({
    clientId: opts.clientId,
    reviewId: opts.reviewId,
    text: opts.text,
  });
  refresh(opts.clientId);
  return { ok: true };
}

export async function publishReply(opts: {
  clientId: number;
  reviewId: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await sendReply(opts);
  refresh(opts.clientId);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export type PublishAllResult = {
  sent: number;
  failed: { reviewId: string; error: string }[];
};

/** Send every draft. The user has seen them; this is the deliberate act. */
export async function publishAllDrafts(
  clientId: number,
): Promise<PublishAllResult> {
  const out = await sendAllDrafts({ clientId });
  if (out.sent > 0) {
    await appendResearchLog(
      clientId,
      `Replied to ${out.sent} Business Profile review${out.sent === 1 ? "" : "s"}`,
      "app",
    );
  }
  refresh(clientId);
  return {
    sent: out.sent,
    failed: out.failed.map((f) => ({
      reviewId: f.reviewId,
      error: f.ok ? "" : f.error,
    })),
  };
}
