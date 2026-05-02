/**
 * Broken-link finder. Fetches a single URL, extracts every <a href> link,
 * then makes parallel HEAD requests to every external + internal target to
 * detect 404/410/timeouts.
 */

export type LinkCheck = {
  href: string;
  anchor: string;
  /** "internal" if same hostname as source, else "external". */
  scope: "internal" | "external";
  status: number;
  ok: boolean;
  redirected: boolean;
  finalUrl: string | null;
  error?: string;
};

export type BrokenLinksResult =
  | {
      ok: true;
      sourceUrl: string;
      totalLinks: number;
      broken: LinkCheck[];
      ok_links: LinkCheck[];
    }
  | { ok: false; error: string };

const MAX_LINKS = 200; // be polite + bound work

async function fetchText(
  url: string,
  timeoutMs = 12_000,
): Promise<{ ok: boolean; status: number; body: string; finalUrl: string }> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    return {
      ok: res.ok,
      status: res.status,
      body: await res.text(),
      finalUrl: res.url,
    };
  } finally {
    clearTimeout(t);
  }
}

async function checkLink(
  url: string,
  timeoutMs = 8_000,
): Promise<{
  status: number;
  ok: boolean;
  redirected: boolean;
  finalUrl: string | null;
  error?: string;
}> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    // Try HEAD first; many CDNs/origin servers don't support it cleanly,
    // so fall through to GET on common failure codes.
    let res: Response;
    try {
      res = await fetch(url, {
        method: "HEAD",
        signal: c.signal,
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
        },
      });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(url, {
          method: "GET",
          signal: c.signal,
          redirect: "follow",
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
          },
        });
      }
    } catch {
      // Some hosts close the connection on HEAD — retry as GET
      res = await fetch(url, {
        method: "GET",
        signal: c.signal,
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
        },
      });
    }

    return {
      status: res.status,
      ok: res.ok,
      redirected: res.redirected,
      finalUrl: res.url ?? null,
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      redirected: false,
      finalUrl: null,
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(t);
  }
}

function extractLinks(
  html: string,
  baseUrl: string,
): { href: string; anchor: string }[] {
  const links: { href: string; anchor: string }[] = [];
  const re = /<a\b[^>]*\bhref=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const rawHref = m[1].trim();
    if (!rawHref) continue;
    if (
      rawHref.startsWith("javascript:") ||
      rawHref.startsWith("mailto:") ||
      rawHref.startsWith("tel:")
    ) {
      continue;
    }
    let absolute: URL;
    try {
      absolute = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:")
      continue;
    const anchor = (m[2] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    links.push({ href: absolute.toString(), anchor });
  }
  // De-dupe by URL
  const seen = new Set<string>();
  const out: typeof links = [];
  for (const l of links) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    out.push(l);
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

export async function findBrokenLinks(
  rawUrl: string,
): Promise<BrokenLinksResult> {
  if (!rawUrl?.trim()) return { ok: false, error: "URL is required" };
  const sourceUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  let page;
  try {
    page = await fetchText(sourceUrl);
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't fetch the page: ${(err as Error).message}`,
    };
  }
  if (!page.ok) {
    return { ok: false, error: `Source page returned ${page.status}` };
  }

  let baseHost = "";
  try {
    baseHost = new URL(page.finalUrl).hostname.replace(/^www\./i, "");
  } catch {
    return { ok: false, error: "Couldn't parse final URL" };
  }

  const links = extractLinks(page.body, page.finalUrl);
  if (links.length === 0) {
    return {
      ok: true,
      sourceUrl: page.finalUrl,
      totalLinks: 0,
      broken: [],
      ok_links: [],
    };
  }

  // Concurrency-limited check (max 6 in flight)
  const results: LinkCheck[] = [];
  const queue = [...links];
  async function worker() {
    while (queue.length > 0) {
      const link = queue.shift();
      if (!link) return;
      let host = "";
      try {
        host = new URL(link.href).hostname.replace(/^www\./i, "");
      } catch {
        // skip
      }
      const scope: LinkCheck["scope"] =
        host === baseHost ? "internal" : "external";
      const r = await checkLink(link.href);
      results.push({
        ...link,
        scope,
        ...r,
      });
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));

  const broken = results.filter((r) => !r.ok);
  const ok_links = results.filter((r) => r.ok);

  return {
    ok: true,
    sourceUrl: page.finalUrl,
    totalLinks: results.length,
    broken,
    ok_links,
  };
}
