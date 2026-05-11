/**
 * Unread / "what's new" badges. Tracks the last time the user opened
 * each section and counts items that have arrived since.
 *
 * Design: very lightweight. We persist `seen.<key>.last_seen_at` in
 * workspace_settings. Each call returns the count of items newer than
 * that timestamp. Caller renders the badge.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gt, count } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiSuggestions,
  newsItems,
  pageChanges,
  activityLog,
} from "@/db/schema";
import { getSetting, setSetting } from "./settings-store";

const exec = promisify(execFile);

type UnreadKey =
  | "seen.news.last_seen_at"
  | "seen.suggestions.last_seen_at"
  | "seen.page_changes.last_seen_at"
  | "seen.activity.last_seen_at";

export type UnreadCounts = {
  news: number;
  suggestions: number;
  pageChanges: number;
  updateAvailable: number;
  total: number;
};

// In-memory cache for the GitHub SHA comparison. We don't want to hit the
// GitHub API on every page render — checking once per hour is plenty.
const UPDATE_CHECK_TTL_MS = 60 * 60 * 1000;
let updateCache: { available: boolean; checkedAt: number } | null = null;

async function getLocalSha(): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      timeout: 3_000,
    });
    return stdout.trim();
  } catch {
    try {
      const head = readFileSync(
        path.join(process.cwd(), ".git", "HEAD"),
        "utf-8",
      ).trim();
      if (head.startsWith("ref: ")) {
        const ref = head.slice(5);
        return readFileSync(
          path.join(process.cwd(), ".git", ref),
          "utf-8",
        ).trim();
      }
      return head;
    } catch {
      return null;
    }
  }
}

async function getRemoteSha(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/IamRamgarhia/seo/commits/main",
      {
        headers: { accept: "application/vnd.github+json" },
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { sha?: string };
    return data.sha ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns whether a newer commit exists on GitHub vs the local checkout.
 * Result is cached in-memory for one hour to keep the sidebar render cheap
 * and avoid hammering the GitHub API. Network or git failures resolve to
 * `false` (no false-positive badges).
 */
async function getUpdateAvailable(): Promise<boolean> {
  // Skip the check entirely inside Docker — users update by rebuilding the
  // container, not by clicking the in-app button.
  if (process.env.RUNNING_IN_DOCKER === "1") return false;

  const now = Date.now();
  if (updateCache && now - updateCache.checkedAt < UPDATE_CHECK_TTL_MS) {
    return updateCache.available;
  }

  const [local, remote] = await Promise.all([getLocalSha(), getRemoteSha()]);
  const available =
    local !== null && remote !== null && local !== remote;

  updateCache = { available, checkedAt: now };

  // Also surface this in the notification bell. logActivity dedupes by
  // (kind, message) within a 24h window, so this is safe to call on
  // every refresh — the same SHA will only show up once per day.
  if (available && remote) {
    const { logActivity } = await import("./activity");
    void logActivity({
      kind: "system.update_available",
      message: `New version on GitHub (${remote.slice(0, 7)}). Click to update.`,
      level: "info",
      entityType: "update",
      dedupe: true,
      dedupeWindowMinutes: 60 * 24,
    }).catch(() => undefined);
  }

  return available;
}

export async function getUnreadCounts(): Promise<UnreadCounts> {
  const [newsAt, sugAt, pageAt] = await Promise.all([
    getSetting<number>("seen.news.last_seen_at"),
    getSetting<number>("seen.suggestions.last_seen_at"),
    getSetting<number>("seen.page_changes.last_seen_at"),
  ]);

  const newsCutoff = new Date(newsAt ?? 0);
  const sugCutoff = new Date(sugAt ?? 0);
  const pageCutoff = new Date(pageAt ?? 0);

  const [[newsRow], [sugRow], [pageRow], updateAvailableBool] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(newsItems)
        .where(gt(newsItems.capturedAt, newsCutoff)),
      db
        .select({ value: count() })
        .from(aiSuggestions)
        .where(gt(aiSuggestions.createdAt, sugCutoff)),
      db
        .select({ value: count() })
        .from(pageChanges)
        .where(gt(pageChanges.detectedAt, pageCutoff)),
      getUpdateAvailable().catch(() => false),
    ]);

  const news = Number(newsRow?.value ?? 0);
  const suggestions = Number(sugRow?.value ?? 0);
  const pageChangesCount = Number(pageRow?.value ?? 0);
  const updateAvailable = updateAvailableBool ? 1 : 0;
  return {
    news,
    suggestions,
    pageChanges: pageChangesCount,
    updateAvailable,
    total: news + suggestions + pageChangesCount + updateAvailable,
  };
}

const KEY_FOR_SECTION: Record<string, UnreadKey> = {
  news: "seen.news.last_seen_at",
  suggestions: "seen.suggestions.last_seen_at",
  page_changes: "seen.page_changes.last_seen_at",
  activity: "seen.activity.last_seen_at",
};

/** Mark a section as seen — wipes its badge until new items arrive. */
export async function markSectionSeen(
  section: keyof typeof KEY_FOR_SECTION,
): Promise<void> {
  const key = KEY_FOR_SECTION[section];
  if (!key) return;
  await setSetting(key, Date.now());
}

/**
 * Recent activity-log items the user hasn't seen — feeds the bell-icon
 * dropdown. Capped to last 20 entries.
 */
export async function getRecentActivity(): Promise<
  { id: number; kind: string; message: string; at: Date; level: string }[]
> {
  const seenAt = await getSetting<number>("seen.activity.last_seen_at");
  const cutoff = new Date(seenAt ?? 0);
  const rows = await db
    .select({
      id: activityLog.id,
      kind: activityLog.kind,
      message: activityLog.message,
      at: activityLog.createdAt,
      level: activityLog.level,
    })
    .from(activityLog)
    .where(gt(activityLog.createdAt, cutoff))
    .orderBy(activityLog.createdAt)
    .limit(20);
  return rows;
}
