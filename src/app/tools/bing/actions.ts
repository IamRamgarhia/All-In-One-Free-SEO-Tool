"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setSetting, deleteSetting } from "@/lib/settings-store";
import {
  getBingTopPages,
  getBingTopQueries,
  getBingCrawlIssues,
  getBingUrlSubmissionQuota,
  bingSubmitUrlBatch,
  listBingSites,
} from "@/lib/bing-webmaster";
import { saveToolRun } from "@/lib/tool-runs";

export async function saveBingKey(formData: FormData): Promise<void> {
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return;
  await setSetting("bing.api_key", key);
  revalidatePath("/tools/bing");
}

export async function clearBingKey(): Promise<void> {
  await deleteSetting("bing.api_key");
  revalidatePath("/tools/bing");
}

const insightsSchema = z.object({
  siteUrl: z.string().trim().min(3).max(255),
});

export type BingInsightsState =
  | {
      ok: true;
      siteUrl: string;
      queries: Array<{
        query: string;
        clicks: number;
        impressions: number;
        position: number;
      }>;
      pages: Array<{
        page: string;
        clicks: number;
        impressions: number;
        position: number;
      }>;
      issues: Array<{
        url: string;
        httpCode: number;
        crawledDate: string;
      }>;
      quota: { daily: number; monthly: number } | null;
    }
  | { ok: false; error: string };

export async function fetchBingInsights(
  _prev: BingInsightsState | null,
  formData: FormData,
): Promise<BingInsightsState> {
  const parsed = insightsSchema.safeParse({
    siteUrl: formData.get("siteUrl"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const [queries, pages, issues, quota] = await Promise.all([
      getBingTopQueries({ siteUrl: parsed.data.siteUrl }),
      getBingTopPages({ siteUrl: parsed.data.siteUrl }),
      getBingCrawlIssues({ siteUrl: parsed.data.siteUrl }),
      getBingUrlSubmissionQuota({ siteUrl: parsed.data.siteUrl }),
    ]);

    const out: BingInsightsState = {
      ok: true,
      siteUrl: parsed.data.siteUrl,
      queries: queries.slice(0, 20).map((r) => ({
        query: r.Query,
        clicks: r.Clicks,
        impressions: r.Impressions,
        position: r.AvgImpressionPosition,
      })),
      pages: pages.slice(0, 20).map((r) => ({
        page: r.Page,
        clicks: r.Clicks,
        impressions: r.Impressions,
        position: r.AvgImpressionPosition,
      })),
      issues: issues.slice(0, 50).map((r) => ({
        url: r.Url,
        httpCode: r.HttpCode,
        crawledDate: r.CrawledDate,
      })),
      quota: quota
        ? { daily: quota.DailyQuota, monthly: quota.MonthlyQuota }
        : null,
    };
    await saveToolRun({
      toolId: "bing",
      label: `Bing insights · ${parsed.data.siteUrl}`,
      input: { siteUrl: parsed.data.siteUrl },
      result: out,
    }).catch(() => undefined);
    return out;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const submitSchema = z.object({
  siteUrl: z.string().trim().min(3),
  urls: z.string().trim().min(1),
});

export type BingSubmitState =
  | { ok: true; submitted: number }
  | { ok: false; error: string };

export async function submitBingUrls(
  _prev: BingSubmitState | null,
  formData: FormData,
): Promise<BingSubmitState> {
  const parsed = submitSchema.safeParse({
    siteUrl: formData.get("siteUrl"),
    urls: formData.get("urls"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const urls = parsed.data.urls
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  if (urls.length === 0) return { ok: false, error: "No URLs to submit" };

  const result = await bingSubmitUrlBatch({
    siteUrl: parsed.data.siteUrl,
    urlList: urls,
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Failed" };
  return { ok: true, submitted: urls.length };
}

export async function fetchBingSites(): Promise<
  { ok: true; sites: Array<{ url: string; verified: boolean }> } | { ok: false; error: string }
> {
  try {
    const sites = await listBingSites();
    return {
      ok: true,
      sites: sites.map((s) => ({ url: s.Url, verified: s.IsVerified })),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
