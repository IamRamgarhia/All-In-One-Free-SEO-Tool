/**
 * Image SEO audit — fetches a page, parses every <img>, classifies issues:
 *  - missing alt text
 *  - empty alt (decorative? or oversight?)
 *  - alt too long (>125 chars)
 *  - alt is a filename (e.g. IMG_4231.jpg)
 *  - file size estimation via HEAD content-length (skip if no header)
 *  - non-modern format (.jpg/.png when WebP/AVIF would be better)
 *  - missing width/height (causes CLS)
 *  - missing lazy loading attribute (below the fold images should have it)
 */

export type ImageIssue =
  | "missing_alt"
  | "empty_alt"
  | "alt_too_long"
  | "alt_is_filename"
  | "no_dimensions"
  | "no_lazy_loading"
  | "legacy_format"
  | "oversize"
  | "broken";

export type ImageEntry = {
  src: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  loading: string | null;
  format: string | null;
  sizeBytes: number | null;
  status: number | null;
  issues: ImageIssue[];
};

export type ImageAuditResult =
  | {
      ok: true;
      sourceUrl: string;
      total: number;
      withIssues: number;
      images: ImageEntry[];
    }
  | { ok: false; error: string };

const ISSUE_LABELS: Record<ImageIssue, string> = {
  missing_alt: "No alt attribute at all",
  empty_alt: "Empty alt — only valid for purely decorative images",
  alt_too_long: "Alt text > 125 chars (Google truncates)",
  alt_is_filename: "Alt is a filename, not descriptive text",
  no_dimensions: "Missing width/height — causes CLS",
  no_lazy_loading: "No loading=\"lazy\" — wastes bandwidth on long pages",
  legacy_format: "JPG/PNG when WebP/AVIF would be ~30% smaller",
  oversize: "File >200KB — compress or use modern format",
  broken: "Image returned 404 or unreachable",
};

export const ISSUE_LABEL_OF: Record<ImageIssue, string> = ISSUE_LABELS;

const FILENAME_RE = /^[a-z0-9_-]+\.(jpe?g|png|gif|webp|avif|svg)$/i;
const LEGACY_RE = /\.(jpe?g|png)(\?|$)/i;

function normalize(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function fetchHtml(url: string) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15_000);
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
      finalUrl: res.url,
      body: await res.text(),
    };
  } finally {
    clearTimeout(t);
  }
}

function parseImages(
  html: string,
  baseUrl: string,
): { src: string; alt: string | null; width: number | null; height: number | null; loading: string | null }[] {
  const images: ReturnType<typeof parseImages> = [];
  const re = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    if (src.startsWith("data:")) continue;
    let absSrc = src;
    try {
      absSrc = new URL(src, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(absSrc)) continue;
    seen.add(absSrc);

    const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
    const alt = altMatch ? altMatch[1] : null;
    const widthRaw = attrs.match(/\bwidth=["']?(\d+)["']?/i)?.[1];
    const heightRaw = attrs.match(/\bheight=["']?(\d+)["']?/i)?.[1];
    const loading = attrs.match(/\bloading=["']([^"']+)["']/i)?.[1] ?? null;

    images.push({
      src: absSrc,
      alt,
      width: widthRaw ? Number(widthRaw) : null,
      height: heightRaw ? Number(heightRaw) : null,
      loading,
    });
    if (images.length >= 100) break;
  }
  return images;
}

async function checkImage(url: string): Promise<{
  status: number | null;
  sizeBytes: number | null;
  format: string | null;
}> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6_000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: c.signal,
      redirect: "follow",
    });
    const len = res.headers.get("content-length");
    const ctype = res.headers.get("content-type") ?? "";
    const fmt = ctype.includes("webp")
      ? "webp"
      : ctype.includes("avif")
        ? "avif"
        : ctype.includes("png")
          ? "png"
          : ctype.includes("jpeg") || ctype.includes("jpg")
            ? "jpg"
            : ctype.includes("svg")
              ? "svg"
              : ctype.includes("gif")
                ? "gif"
                : null;
    return {
      status: res.status,
      sizeBytes: len ? Number(len) : null,
      format: fmt,
    };
  } catch {
    return { status: null, sizeBytes: null, format: null };
  } finally {
    clearTimeout(t);
  }
}

function classifyIssues(
  img: ImageEntry,
  positionGuess: number,
  total: number,
): ImageIssue[] {
  const issues: ImageIssue[] = [];
  if (img.alt === null) {
    issues.push("missing_alt");
  } else if (img.alt === "") {
    // Empty alt is intentionally decorative — but flag for review since it's
    // usually accidental. Skip the flag if we can't tell better.
    issues.push("empty_alt");
  } else {
    if (img.alt.length > 125) issues.push("alt_too_long");
    if (FILENAME_RE.test(img.alt.trim())) issues.push("alt_is_filename");
  }
  if (img.width === null || img.height === null) {
    issues.push("no_dimensions");
  }
  if (
    !img.loading &&
    positionGuess > Math.min(2, Math.floor(total * 0.3))
  ) {
    issues.push("no_lazy_loading");
  }
  if (img.format && (img.format === "jpg" || img.format === "png")) {
    if (LEGACY_RE.test(img.src)) issues.push("legacy_format");
  }
  if (img.sizeBytes && img.sizeBytes > 200_000) {
    issues.push("oversize");
  }
  if (img.status !== null && img.status >= 400) {
    issues.push("broken");
  }
  return issues;
}

export async function auditImages(
  rawUrl: string,
): Promise<ImageAuditResult> {
  if (!rawUrl?.trim()) return { ok: false, error: "URL required" };
  const url = normalize(rawUrl.trim());

  let page;
  try {
    page = await fetchHtml(url);
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't fetch page: ${(err as Error).message}`,
    };
  }
  if (!page.ok) {
    return { ok: false, error: `Page returned ${page.status}` };
  }

  const parsed = parseImages(page.body, page.finalUrl);
  if (parsed.length === 0) {
    return {
      ok: true,
      sourceUrl: page.finalUrl,
      total: 0,
      withIssues: 0,
      images: [],
    };
  }

  // Concurrency-limited HEAD checks
  const queue = [...parsed.map((p, i) => ({ ...p, idx: i }))];
  const enriched: ImageEntry[] = [];
  async function worker() {
    while (queue.length > 0) {
      const img = queue.shift();
      if (!img) return;
      const res = await checkImage(img.src);
      const entry: ImageEntry = {
        src: img.src,
        alt: img.alt,
        width: img.width,
        height: img.height,
        loading: img.loading,
        format: res.format,
        sizeBytes: res.sizeBytes,
        status: res.status,
        issues: [],
      };
      entry.issues = classifyIssues(entry, img.idx, parsed.length);
      enriched.push(entry);
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));

  // Sort to keep original page order
  enriched.sort((a, b) => {
    const ai = parsed.findIndex((p) => p.src === a.src);
    const bi = parsed.findIndex((p) => p.src === b.src);
    return ai - bi;
  });

  return {
    ok: true,
    sourceUrl: page.finalUrl,
    total: enriched.length,
    withIssues: enriched.filter((e) => e.issues.length > 0).length,
    images: enriched,
  };
}
