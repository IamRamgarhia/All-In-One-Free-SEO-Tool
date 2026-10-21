export function urljoin(base: string, ref: string): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim().split("#")[0]!;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  const scheme = u.protocol.toLowerCase();
  let host = u.hostname.toLowerCase();
  const port = u.port;
  if (
    port &&
    !((scheme === "http:" && port === "80") || (scheme === "https:" && port === "443"))
  ) {
    host = `${host}:${port}`;
  }
  let path = u.pathname || "/";
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1) || "/";
  }
  const tracking = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "gclid",
    "fbclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
    "ref",
    "_ga",
    "igshid",
    "si",
    "yclid",
    "dclid",
  ]);
  const kept: string[] = [];
  for (const pair of u.search.replace(/^\?/, "").split("&")) {
    if (!pair) continue;
    const name = pair.split("=", 1)[0]?.toLowerCase();
    if (name && tracking.has(name)) continue;
    kept.push(pair);
  }
  kept.sort();
  const query = kept.join("&");
  return `${scheme}//${host}${path}${query ? `?${query}` : ""}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const SKIP_SUFFIXES = [
  ".pdf",
  ".zip",
  ".gz",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".css",
  ".js",
  ".mjs",
  ".map",
  ".json",
  ".xml",
  ".woff",
  ".woff2",
  ".mp3",
  ".mp4",
  ".webm",
];

export function isCrawlable(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const lower = u.pathname.toLowerCase();
    return !SKIP_SUFFIXES.some((s) => lower.endsWith(s));
  } catch {
    return false;
  }
}
