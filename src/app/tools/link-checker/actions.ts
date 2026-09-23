"use server";

import { saveToolRun } from "@/lib/tool-runs";
import { guardedFetch } from "@/lib/url-guard";

export type AnalyzedLink = {
  href: string;
  anchor: string;
  /** internal = same registrable domain as the page, external = elsewhere. */
  scope: "internal" | "external";
  /** rel attribute as authored. Empty array if absent. */
  rel: string[];
  /** True if rel contains "nofollow" or "ugc" or "sponsored" (any of which strip link equity). */
  nofollow: boolean;
  /** Specific rel flags broken out for the UI. */
  flags: { nofollow: boolean; sponsored: boolean; ugc: boolean; openInNewTab: boolean };
};

export type LinkAnalysis = {
  ok: true;
  url: string;
  totalLinks: number;
  internalCount: number;
  externalCount: number;
  followCount: number;
  nofollowCount: number;
  links: AnalyzedLink[];
  /** Anchor texts grouped by frequency — useful to spot keyword stuffing. */
  topAnchors: { anchor: string; count: number }[];
};

export type LinkAnalysisResult = LinkAnalysis | { ok: false; error: string };

const UA = "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost) Link-checker";

function registrableDomain(host: string): string {
  // Naive but works for the common cases: keep last 2 labels (or 3 for known
  // double-suffix TLDs like co.uk). Not exhaustive — for an SEO check, OK.
  const parts = host.toLowerCase().split(".");
  if (parts.length <= 2) return host.toLowerCase();
  const doubleSuffix = /^(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/.test(
    parts.slice(-2).join("."),
  );
  return parts.slice(doubleSuffix ? -3 : -2).join(".");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function analyzeLinks(rawUrl: string): Promise<LinkAnalysisResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, error: "Paste a URL" };
  let url: string;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return { ok: false, error: "Not a valid URL" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await guardedFetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    });
  } catch {
    return { ok: false, error: "Couldn't fetch — site unreachable or timeout." };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    return { ok: false, error: `Server returned ${res.status}.` };
  }
  const finalUrl = res.url || url;
  const html = (await res.text()).slice(0, 1_500_000);

  const baseHost = new URL(finalUrl).hostname;
  const baseRegistrable = registrableDomain(baseHost);

  const links: AnalyzedLink[] = [];
  // Match <a ...> with attributes in any order. We grab the full opening tag
  // then inspect its attribute string.
  const aTagRegex = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = aTagRegex.exec(html))) {
    const attrs = m[1];
    const inner = m[2];

    const hrefMatch =
      attrs.match(/\bhref=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) ?? null;
    if (!hrefMatch) continue;
    const rawHref = hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? "";
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
      continue;
    }

    let abs: URL;
    try {
      abs = new URL(rawHref, finalUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;

    const relMatch = attrs.match(/\brel=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const relRaw = (relMatch?.[1] ?? relMatch?.[2] ?? relMatch?.[3] ?? "").toLowerCase();
    const rel = relRaw.split(/\s+/).filter(Boolean);

    const targetMatch = attrs.match(/\btarget=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const target = (targetMatch?.[1] ?? targetMatch?.[2] ?? targetMatch?.[3] ?? "").toLowerCase();

    const anchorClean = decode(inner.replace(/<[^>]+>/g, " "));
    const sameRegistrable =
      registrableDomain(abs.hostname) === baseRegistrable;

    const flags = {
      nofollow: rel.includes("nofollow"),
      sponsored: rel.includes("sponsored"),
      ugc: rel.includes("ugc"),
      openInNewTab: target === "_blank",
    };
    const isNofollow = flags.nofollow || flags.sponsored || flags.ugc;

    links.push({
      href: abs.toString(),
      anchor: anchorClean.length > 0 ? anchorClean : "(no anchor text)",
      scope: sameRegistrable ? "internal" : "external",
      rel,
      nofollow: isNofollow,
      flags,
    });
  }

  // Top anchor texts — useful to spot "click here" overuse or keyword stuffing
  const anchorCounts = new Map<string, number>();
  for (const l of links) {
    const key = l.anchor.toLowerCase();
    anchorCounts.set(key, (anchorCounts.get(key) ?? 0) + 1);
  }
  const topAnchors = Array.from(anchorCounts.entries())
    .map(([anchor, count]) => ({ anchor, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const internal = links.filter((l) => l.scope === "internal").length;
  const external = links.length - internal;
  const nofollow = links.filter((l) => l.nofollow).length;
  const follow = links.length - nofollow;

  const result = {
    ok: true as const,
    url: finalUrl,
    totalLinks: links.length,
    internalCount: internal,
    externalCount: external,
    followCount: follow,
    nofollowCount: nofollow,
    links,
    topAnchors,
  };
  await saveToolRun({
    toolId: "link-checker",
    label: `${finalUrl} · ${links.length} links (${internal} int / ${external} ext)`,
    input: { url: rawUrl },
    result,
  }).catch(() => undefined);
  return result;
}
