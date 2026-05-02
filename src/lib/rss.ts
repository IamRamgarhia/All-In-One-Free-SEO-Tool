/**
 * Tiny RSS / Atom feed parser. No external deps — regex-based on the well-
 * defined feed shapes. Handles the four formats we'll actually see:
 * RSS 2.0, Atom 1.0, RDF/RSS 1.0, and JSON Feed (1.x).
 *
 * Returns up to 50 items per feed; the parser is tolerant of malformed XML
 * (we deliberately don't reach for a strict XML parser).
 */

export type ParsedItem = {
  title: string;
  link: string;
  guid: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date | null;
};

export type ParsedFeed = {
  ok: boolean;
  title: string | null;
  items: ParsedItem[];
  error?: string;
};

const ITEM_LIMIT = 50;

function decode(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return block.match(re)?.[1]?.trim() ?? null;
}

function getAttr(
  block: string,
  tag: string,
  attr: string,
): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=['"]([^'"]+)['"][^>]*\\/?>`, "i");
  return block.match(re)?.[1] ?? null;
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const t = Date.parse(raw.trim());
  return Number.isFinite(t) ? new Date(t) : null;
}

function parseRss(xml: string): ParsedFeed {
  const channelTitle = decode(getTag(xml, "title"));
  const itemBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(
    (m) => m[0],
  );

  const items: ParsedItem[] = [];
  for (const block of itemBlocks.slice(0, ITEM_LIMIT)) {
    const title = decode(getTag(block, "title"));
    const link = decode(getTag(block, "link") || "");
    const guidRaw = decode(getTag(block, "guid") || "") || link;
    const description =
      decode(getTag(block, "description")) ||
      decode(getTag(block, "content:encoded"));
    const pubDate = parseDate(getTag(block, "pubDate"));
    const author =
      decode(getTag(block, "dc:creator")) ||
      decode(getTag(block, "author")) ||
      null;
    if (!title || !link) continue;
    items.push({
      title,
      link,
      guid: guidRaw || link,
      summary: description?.slice(0, 500) || null,
      author,
      publishedAt: pubDate,
    });
  }
  return { ok: true, title: channelTitle || null, items };
}

function parseAtom(xml: string): ParsedFeed {
  const feedTitle = decode(getTag(xml, "title"));
  const entryBlocks = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(
    (m) => m[0],
  );

  const items: ParsedItem[] = [];
  for (const block of entryBlocks.slice(0, ITEM_LIMIT)) {
    const title = decode(getTag(block, "title"));
    // <link href="..."/> form is most common for Atom
    const linkAttr = getAttr(block, "link", "href");
    const link = linkAttr ?? decode(getTag(block, "link") || "");
    const id = decode(getTag(block, "id") || "");
    const summary =
      decode(getTag(block, "summary")) || decode(getTag(block, "content"));
    const updated =
      parseDate(getTag(block, "published")) ||
      parseDate(getTag(block, "updated"));
    const author =
      decode(getTag(getTag(block, "author") ?? "", "name")) || null;
    if (!title || !link) continue;
    items.push({
      title,
      link,
      guid: id || link,
      summary: summary?.slice(0, 500) || null,
      author,
      publishedAt: updated,
    });
  }
  return { ok: true, title: feedTitle || null, items };
}

function parseJsonFeed(text: string): ParsedFeed {
  try {
    const data = JSON.parse(text) as {
      title?: string;
      items?: Array<{
        title?: string;
        url?: string;
        id?: string;
        summary?: string;
        content_text?: string;
        content_html?: string;
        date_published?: string;
        author?: { name?: string } | { name?: string }[];
      }>;
    };
    const items: ParsedItem[] = (data.items ?? []).slice(0, ITEM_LIMIT).flatMap(
      (i) => {
        const title = (i.title ?? "").trim();
        const link = i.url ?? "";
        if (!title || !link) return [];
        const summary =
          i.summary ?? i.content_text ?? decode(i.content_html ?? "") ?? "";
        const author = Array.isArray(i.author)
          ? i.author[0]?.name ?? null
          : i.author?.name ?? null;
        return [
          {
            title,
            link,
            guid: i.id ?? link,
            summary: summary.slice(0, 500) || null,
            author,
            publishedAt: parseDate(i.date_published),
          },
        ];
      },
    );
    return { ok: true, title: data.title ?? null, items };
  } catch (err) {
    return {
      ok: false,
      title: null,
      items: [],
      error: `Invalid JSON Feed: ${(err as Error).message}`,
    };
  }
}

/**
 * Given a website URL (homepage, blog, anything HTML), try to find its RSS
 * feed. Strategy:
 *  1. Fetch the page, look for <link rel="alternate" type="application/rss+xml">
 *     or atom+xml or feed+json in the HTML head.
 *  2. If none found, probe common feed paths: /feed, /rss, /feed.xml,
 *     /atom.xml, /rss.xml, /index.xml, /feed/, /?feed=rss2 — return the
 *     first that returns a valid feed.
 *
 * Returns the discovered feed URL or null.
 */
export async function discoverFeedUrl(siteUrl: string): Promise<string | null> {
  const url = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;

  let html = "";
  let finalUrl = url;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10_000);
    const res = await fetch(url, {
      signal: c.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(t);
    if (res.ok) {
      html = (await res.text()).slice(0, 200_000);
      finalUrl = res.url;
    }
  } catch {
    // ignore — we'll still try common paths
  }

  // Method 1: parse <link rel="alternate" type="application/rss+xml"> tags
  const candidates: string[] = [];
  const linkRe = /<link\b([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const attrs = m[1];
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1] ?? "";
    if (rel.toLowerCase() !== "alternate") continue;
    const type = attrs.match(/\btype=["']([^"']+)["']/i)?.[1] ?? "";
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? "";
    if (/application\/(rss|atom|feed)\+(xml|json)/i.test(type) && href) {
      try {
        candidates.push(new URL(href, finalUrl).toString());
      } catch {
        // skip
      }
    }
  }

  for (const c of candidates) {
    const probe = await fetchAndParseFeed(c);
    if (probe.ok && probe.items.length > 0) return c;
  }

  // Method 2: probe common feed paths
  const origin = (() => {
    try {
      return new URL(finalUrl).origin;
    } catch {
      return null;
    }
  })();
  if (!origin) return null;

  const commonPaths = [
    "/feed",
    "/feed/",
    "/rss",
    "/rss/",
    "/feed.xml",
    "/rss.xml",
    "/atom.xml",
    "/index.xml",
    "/blog/feed",
    "/blog/rss",
    "/?feed=rss2",
    "/feed.json",
  ];
  for (const path of commonPaths) {
    const candidate = origin + path;
    const probe = await fetchAndParseFeed(candidate);
    if (probe.ok && probe.items.length > 0) return candidate;
  }

  return null;
}

export async function fetchAndParseFeed(url: string): Promise<ParsedFeed> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
        accept:
          "application/rss+xml, application/atom+xml, application/feed+json, text/xml, application/xml, */*",
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        title: null,
        items: [],
        error: `HTTP ${res.status}`,
      };
    }
    const text = await res.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return parseJsonFeed(trimmed);
    }
    if (/<feed\b/i.test(text)) {
      return parseAtom(text);
    }
    if (/<rss\b/i.test(text) || /<rdf:RDF\b/i.test(text)) {
      return parseRss(text);
    }
    return {
      ok: false,
      title: null,
      items: [],
      error: "Response wasn't a recognizable feed (RSS / Atom / JSON Feed).",
    };
  } catch (err) {
    return {
      ok: false,
      title: null,
      items: [],
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(t);
  }
}
