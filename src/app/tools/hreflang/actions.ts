"use server";

export type HreflangEntry = {
  lang: string;
  href: string;
  source: "html_link" | "http_header";
  status: "ok" | "warning" | "error";
  hint?: string;
};

export type HreflangResult =
  | {
      ok: true;
      url: string;
      finalUrl: string;
      entries: HreflangEntry[];
      issues: string[];
      hasXDefault: boolean;
      reciprocal: ReciprocalCheck[];
    }
  | { ok: false; error: string };

export type ReciprocalCheck = {
  url: string;
  reachable: boolean;
  pointsBack: boolean;
  langDeclared: string | null;
};

const VALID_LANG = /^([a-z]{2,3}(-[A-Za-z0-9]+)?|x-default)$/;

function normalize(input: string): string {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`;
}

async function fetchHtml(url: string, timeoutMs = 12_000) {
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
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      body: await res.text(),
      headers: res.headers,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      body: "",
      headers: new Headers(),
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(t);
  }
}

function parseHtmlLinks(html: string): { lang: string; href: string }[] {
  const out: { lang: string; href: string }[] = [];
  const head = html.slice(0, 200_000);
  const re =
    /<link\b[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) {
    out.push({ lang: m[1].trim(), href: m[2].trim() });
  }
  // Also handle reversed attribute order
  const re2 =
    /<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*hreflang=["']([^"']+)["']/gi;
  while ((m = re2.exec(head))) {
    out.push({ lang: m[2].trim(), href: m[1].trim() });
  }
  return out;
}

function parseHttpLinkHeader(linkHeader: string | null): {
  lang: string;
  href: string;
}[] {
  if (!linkHeader) return [];
  const out: { lang: string; href: string }[] = [];
  // Format: <https://example.com>; rel="alternate"; hreflang="en"
  for (const part of linkHeader.split(/,(?=\s*<)/)) {
    const m = part.match(/<([^>]+)>/);
    if (!m) continue;
    const href = m[1];
    const lang = part.match(/hreflang\s*=\s*"([^"]+)"/i)?.[1];
    if (href && lang) out.push({ lang, href });
  }
  return out;
}

export async function checkHreflang(rawUrl: string): Promise<HreflangResult> {
  if (!rawUrl?.trim()) return { ok: false, error: "URL is required" };
  const url = normalize(rawUrl.trim());

  const res = await fetchHtml(url);
  if (!res.ok) {
    return { ok: false, error: `Couldn't fetch ${url} (${res.status})` };
  }

  const htmlLinks = parseHtmlLinks(res.body);
  const headerLinks = parseHttpLinkHeader(res.headers.get("link"));

  const entries: HreflangEntry[] = [];
  const seen = new Set<string>();

  function add(lang: string, href: string, source: HreflangEntry["source"]) {
    const key = `${lang}|${href}|${source}`;
    if (seen.has(key)) return;
    seen.add(key);
    let absHref = href;
    try {
      absHref = new URL(href, res.finalUrl).toString();
    } catch {
      // ignore
    }
    let status: HreflangEntry["status"] = "ok";
    let hint: string | undefined;
    if (!VALID_LANG.test(lang)) {
      status = "error";
      hint = "Invalid hreflang format. Use lang or lang-region (e.g. en, en-US).";
    }
    entries.push({ lang, href: absHref, source, status, hint });
  }

  for (const l of htmlLinks) add(l.lang, l.href, "html_link");
  for (const l of headerLinks) add(l.lang, l.href, "http_header");

  const issues: string[] = [];
  const hasXDefault = entries.some((e) => e.lang.toLowerCase() === "x-default");

  if (entries.length === 0) {
    issues.push(
      "No hreflang tags found. If this site has language/region variants, add them.",
    );
    return {
      ok: true,
      url,
      finalUrl: res.finalUrl,
      entries: [],
      issues,
      hasXDefault: false,
      reciprocal: [],
    };
  }

  if (!hasXDefault) {
    issues.push(
      "Missing x-default. Recommended as the fallback for unmatched locales.",
    );
  }

  // Self-reference check
  const selfReference = entries.find(
    (e) =>
      e.href === res.finalUrl ||
      e.href === res.finalUrl.replace(/\/$/, "") ||
      e.href + "/" === res.finalUrl,
  );
  if (!selfReference) {
    issues.push(
      "Page doesn't include a self-referencing hreflang. Each variant should reference itself.",
    );
  }

  // Duplicate language codes (different hrefs for the same lang)
  const langCounts = new Map<string, Set<string>>();
  for (const e of entries) {
    const set = langCounts.get(e.lang) ?? new Set();
    set.add(e.href);
    langCounts.set(e.lang, set);
  }
  for (const [lang, hrefs] of langCounts.entries()) {
    if (hrefs.size > 1) {
      issues.push(
        `Multiple hrefs for "${lang}". Each language should point to one URL.`,
      );
    }
  }

  // Reciprocal check — verify each variant points back at this URL
  const otherUrls = entries
    .map((e) => e.href)
    .filter((h, i, arr) => arr.indexOf(h) === i && h !== res.finalUrl)
    .slice(0, 6); // cap reciprocal checks

  const reciprocal: ReciprocalCheck[] = await Promise.all(
    otherUrls.map(async (other) => {
      const otherRes = await fetchHtml(other);
      if (!otherRes.ok) {
        return {
          url: other,
          reachable: false,
          pointsBack: false,
          langDeclared: null,
        };
      }
      const otherLinks = parseHtmlLinks(otherRes.body);
      const ours = otherLinks.find(
        (l) =>
          l.href === res.finalUrl ||
          l.href === url ||
          new URL(l.href, otherRes.finalUrl).toString() === res.finalUrl,
      );
      return {
        url: other,
        reachable: true,
        pointsBack: Boolean(ours),
        langDeclared: ours?.lang ?? null,
      };
    }),
  );

  for (const r of reciprocal) {
    if (r.reachable && !r.pointsBack) {
      issues.push(
        `${r.url} doesn't point back at this URL. Reciprocal links are required for hreflang.`,
      );
    }
  }

  return {
    ok: true,
    url,
    finalUrl: res.finalUrl,
    entries,
    issues,
    hasXDefault,
    reciprocal,
  };
}
