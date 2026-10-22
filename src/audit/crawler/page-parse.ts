import * as cheerio from "cheerio";
import type { CrawledPage, LinkInfo, RedirectHop } from "@/audit/types";

export function parseHtmlPage(input: {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  depth: number;
  headers?: Record<string, string>;
  redirectChain?: RedirectHop[];
  timingMs?: number;
}): CrawledPage {
  const $ = cheerio.load(input.html);
  const title = $("head > title").first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[name="Description"]').attr("content")?.trim() ||
    null;
  const canonical =
    $('link[rel="canonical"]').first().attr("href")?.trim() || null;
  const h1s: string[] = [];
  $("h1").each((_, el) => {
    const t = $(el).text().trim();
    if (t) h1s.push(t);
  });

  const origin = originOf(input.finalUrl);
  const links: LinkInfo[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    let absolute: string;
    try {
      absolute = new URL(href, input.finalUrl).href;
    } catch {
      return;
    }
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    links.push({
      href: absolute,
      text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 200),
      isInternal: originOf(absolute) === origin,
      isNoFollow: rel.includes("nofollow"),
    });
  });

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;

  return {
    url: input.url,
    finalUrl: input.finalUrl,
    status: input.status,
    rawHtml: input.html,
    headers: input.headers ?? {},
    redirectChain: input.redirectChain ?? [],
    timingMs: input.timingMs ?? 0,
    title,
    metaDescription,
    canonical,
    h1s,
    links,
    depth: input.depth,
    wordCount,
    fetchedAt: new Date(),
  };
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function loadCheerio(html: string) {
  return cheerio.load(html);
}
