"use server";

import {
  suggestCanonicalFix,
  suggestH1Fix,
  suggestMetaDescriptionFixes,
  suggestTitleFixes,
  suggestViewportFix,
  type Suggestion,
} from "@/lib/fix-suggestions";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractMeta(
  html: string,
  name: string,
  attr = "name",
): string | null {
  const re1 = new RegExp(
    `<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1) return decode(m1[1].trim());
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${name}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decode(m2[1].trim()) : null;
}

export type FixContext = {
  pageUrl: string;
  hostname: string;
  title: string | null;
  description: string | null;
  h1: string | null;
  canonical: string | null;
  viewport: string | null;
  firstParagraph: string | null;
};

export type FixResult =
  | { ok: true; context: FixContext; suggestions: Suggestion[] }
  | { ok: false; error: string };

export async function getFixSuggestions(
  pageUrl: string,
  issueType: string,
): Promise<FixResult> {
  let context: FixContext;
  try {
    context = await fetchPageContext(pageUrl);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  let suggestions: Suggestion[] = [];

  if (
    issueType === "missing_title" ||
    issueType === "short_title" ||
    issueType === "long_title"
  ) {
    suggestions = suggestTitleFixes({
      currentTitle: context.title,
      h1: context.h1,
      hostname: context.hostname,
      description: context.description,
    });
  } else if (
    issueType === "missing_meta_description" ||
    issueType === "short_meta_description" ||
    issueType === "long_meta_description"
  ) {
    suggestions = suggestMetaDescriptionFixes({
      currentDescription: context.description,
      title: context.title,
      h1: context.h1,
      firstParagraph: context.firstParagraph,
      hostname: context.hostname,
    });
  } else if (issueType === "missing_h1") {
    suggestions = suggestH1Fix({
      title: context.title,
      hostname: context.hostname,
    });
  } else if (issueType === "missing_canonical") {
    suggestions = suggestCanonicalFix(pageUrl);
  } else if (issueType === "missing_viewport") {
    suggestions = suggestViewportFix();
  } else {
    return {
      ok: false,
      error: `No fix wizard for issue type: ${issueType}`,
    };
  }

  return { ok: true, context, suggestions };
}

async function fetchPageContext(rawUrl: string): Promise<FixContext> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();
    const finalUrl = res.url;

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decode(titleMatch[1].trim()) : null;

    const description = extractMeta(html, "description");

    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h1 = h1Match
      ? decode(h1Match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      : null;

    const canonicalMatch = html.match(
      /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
    );
    const canonical = canonicalMatch ? canonicalMatch[1].trim() : null;

    const viewport = extractMeta(html, "viewport");

    const pMatch = html.match(/<p[^>]*>([\s\S]{40,500}?)<\/p>/i);
    const firstParagraph = pMatch
      ? decode(pMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      : null;

    const hostname = new URL(finalUrl).hostname;

    return {
      pageUrl: finalUrl,
      hostname,
      title,
      description,
      h1,
      canonical,
      viewport,
      firstParagraph,
    };
  } finally {
    clearTimeout(t);
  }
}
