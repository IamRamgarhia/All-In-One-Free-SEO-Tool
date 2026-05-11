"use server";

import { saveToolRun } from "@/lib/tool-runs";

export type RobotsResult =
  | {
      ok: true;
      robotsUrl: string;
      robotsContent: string | null;
      sitemaps: SitemapEntry[];
      issues: string[];
    }
  | { ok: false; error: string };

export type SitemapEntry = {
  url: string;
  ok: boolean;
  type: "index" | "urlset" | "unknown";
  count: number;
  fetchError?: string;
  childSitemaps?: string[];
};

function normalize(input: string): string {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`;
}

async function fetchText(url: string, timeoutMs = 10_000): Promise<{
  ok: boolean;
  status: number;
  body: string;
  error?: string;
}> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
      },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: "",
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function checkRobots(
  rawUrl: string,
): Promise<RobotsResult> {
  if (!rawUrl?.trim()) return { ok: false, error: "URL is required" };
  const url = normalize(rawUrl.trim());

  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  const robotsUrl = `${origin}/robots.txt`;
  const robotsRes = await fetchText(robotsUrl);

  const issues: string[] = [];
  let robotsContent: string | null = null;
  const sitemapUrls: string[] = [];

  if (robotsRes.ok) {
    robotsContent = robotsRes.body.slice(0, 200_000);
    // Parse sitemap entries
    for (const line of robotsContent.split(/\r?\n/)) {
      const m = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
      if (m) sitemapUrls.push(m[1].trim());
    }
    // Check for common foot-guns
    if (/^\s*disallow:\s*\/\s*$/im.test(robotsContent) && !/^\s*allow:/im.test(robotsContent)) {
      issues.push(
        "robots.txt blocks the entire site (Disallow: /). Search engines can't crawl anything.",
      );
    }
    if (!sitemapUrls.length) {
      issues.push(
        "No Sitemap directive declared in robots.txt. Add one to help discovery.",
      );
    }
  } else {
    issues.push(
      robotsRes.status === 404
        ? "No robots.txt found. Create one — even an empty allow-all is better than nothing."
        : `Could not fetch robots.txt (${robotsRes.status} ${robotsRes.error ?? ""}).`,
    );
    sitemapUrls.push(`${origin}/sitemap.xml`);
  }

  // Validate every sitemap URL
  const sitemaps: SitemapEntry[] = [];
  for (const sm of [...new Set(sitemapUrls)].slice(0, 12)) {
    const res = await fetchText(sm);
    if (!res.ok) {
      sitemaps.push({
        url: sm,
        ok: false,
        type: "unknown",
        count: 0,
        fetchError: `${res.status} ${res.error ?? ""}`.trim(),
      });
      continue;
    }

    const body = res.body.slice(0, 1_500_000);
    if (/<sitemapindex/i.test(body)) {
      const childMatches = [...body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(
        (m) => m[1].trim(),
      );
      sitemaps.push({
        url: sm,
        ok: true,
        type: "index",
        count: childMatches.length,
        childSitemaps: childMatches.slice(0, 25),
      });
    } else if (/<urlset/i.test(body)) {
      const urlCount = (body.match(/<url\b/gi) ?? []).length;
      sitemaps.push({
        url: sm,
        ok: true,
        type: "urlset",
        count: urlCount,
      });
    } else {
      sitemaps.push({
        url: sm,
        ok: false,
        type: "unknown",
        count: 0,
        fetchError: "Response wasn't valid sitemap XML",
      });
    }
  }

  if (sitemaps.length === 0) {
    issues.push("No sitemap files found at any declared or default location.");
  }

  const out: RobotsResult = { ok: true, robotsUrl, robotsContent, sitemaps, issues };
  await saveToolRun({
    toolId: "robots",
    label: `${origin} · ${sitemaps.length} sitemaps · ${issues.length} issues`,
    input: { url: rawUrl },
    result: out,
  }).catch(() => undefined);
  return out;
}
