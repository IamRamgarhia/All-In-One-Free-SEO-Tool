/**
 * Shared captcha / consent / "unusual traffic" detector. Used by every
 * search-facing scraper so users see a consistent reason why a scrape
 * came back empty (rather than "no results found", which is misleading).
 *
 * Patterns cover: Google's unusual-traffic page, the EU consent page,
 * DuckDuckGo's bot challenge, Cloudflare challenge, hCaptcha/reCAPTCHA
 * mounts, "verify you're human".
 *
 * The pages in __fixtures__/serp were captured live; search-blocks.test.ts
 * says which pattern each one proves.
 */

export type CaptchaResult = {
  blocked: boolean;
  /** Best guess at the reason — surfaced to the user. */
  reason:
    | "google_unusual_traffic"
    | "google_consent"
    | "ddg_challenge"
    | "cloudflare_challenge"
    | "recaptcha"
    | "hcaptcha"
    | "generic_captcha"
    | "rate_limit"
    | null;
};

const PATTERNS: { reason: CaptchaResult["reason"]; re: RegExp }[] = [
  {
    reason: "google_unusual_traffic",
    re: /unusual traffic from your computer network/i,
  },
  {
    reason: "google_consent",
    re: /before you continue to google search|please enable cookies|accept-cookies-button/i,
  },
  // DuckDuckGo's "select all squares containing a duck" puzzle. It comes
  // back as HTTP 202, which `res.ok` counts as success, so before this it
  // parsed as a results page with nothing on it and every search that
  // hit it reported "not ranking" or "no competitors".
  {
    reason: "ddg_challenge",
    re: /anomaly-modal|bots use DuckDuckGo too/i,
  },
  {
    reason: "cloudflare_challenge",
    re: /cf-browser-verification|attention required.*cloudflare|checking your browser before/i,
  },
  { reason: "recaptcha", re: /www\.google\.com\/recaptcha\/api\.js|g-recaptcha/i },
  { reason: "hcaptcha", re: /hcaptcha\.com\/captcha|h-captcha/i },
  { reason: "generic_captcha", re: /verify (you'?re|that you are) (a )?human|i'?m not a robot/i },
  {
    reason: "rate_limit",
    re: /\b(429|too many requests|rate ?limit)\b/i,
  },
];

export function detectCaptcha(html: string): CaptchaResult {
  if (!html) return { blocked: false, reason: null };
  // Only inspect the first 8 KB — captcha banners are always near the top.
  const sample = html.slice(0, 8_000);
  for (const p of PATTERNS) {
    if (p.re.test(sample)) {
      return { blocked: true, reason: p.reason };
    }
  }
  return { blocked: false, reason: null };
}

export function captchaUserMessage(reason: CaptchaResult["reason"]): string {
  switch (reason) {
    case "google_unusual_traffic":
      return "Google blocked the scan — too many recent requests from this IP. Add a proxy in Settings → Headless browser pool, or wait an hour and retry.";
    case "google_consent":
      return "Google's EU consent page intercepted the request. Add a proxy in a non-EU country, or add a cookie store entry that pre-accepts the consent.";
    case "ddg_challenge":
      return "DuckDuckGo showed this server a \"confirm you're human\" puzzle instead of results, so nothing could be read. It lifts on its own after a while; it can't be solved automatically.";
    case "cloudflare_challenge":
      return "Cloudflare challenge page intercepted the request. The site uses bot protection — try with stealth mode ON and proxies that aren't already flagged.";
    case "recaptcha":
      return "Page gated behind reCAPTCHA. Headless browsers can't solve these — needs a different proxy or a logged-in cookie session.";
    case "hcaptcha":
      return "Page gated behind hCaptcha. Headless browsers can't solve these.";
    case "rate_limit":
      return "The target rate-limited this request (429). Lower max concurrency in Settings, add a proxy pool, or back off and retry.";
    case "generic_captcha":
      return "A captcha intercepted the page. Try a different proxy or a logged-in cookie.";
    default:
      return "Page returned blank or non-content. Check the URL and retry.";
  }
}

/**
 * Why a results page yielded no results — or null when it genuinely had
 * none.
 *
 * Call this only after parsing found zero results. "Zero results" covers
 * two opposite facts: the engine has nothing for this query, or we were
 * not shown a results page at all. Only the first may be recorded as
 * "not ranking"; the second written down as that is a drop in the
 * history that never happened.
 *
 * So the page has to prove it is empty. Anything we cannot positively
 * recognise as an empty results page is reported as unreadable — a
 * wrong "couldn't check" costs a retry, a wrong "not ranking" costs a
 * client conversation.
 */
export function emptyResultsReason(
  engine: "google" | "duckduckgo",
  html: string,
): string | null {
  const cap = detectCaptcha(html);
  if (cap.blocked) return captchaUserMessage(cap.reason);

  if (engine === "google") {
    // Google's own wording for an empty search, as openserp matches it.
    // Not captured here: every Google request from the machine these
    // fixtures came from was answered with the unusual-traffic page.
    if (/did not match any documents/i.test(html)) return null;
    // The interstitial for a client that can't run JavaScript: a
    // <noscript> redirect to /httpservice/retry/enablejs and no results.
    // Only meaningful here, with zero results parsed — the same noscript
    // tag can sit in a normal results page, which is why openserp also
    // checks for results first, and why this is not in PATTERNS.
    if (/\/httpservice\/retry\/enablejs/i.test(html)) {
      return "Google answered with its \"enable JavaScript\" page instead of results, so there was nothing to read.";
    }
    return unreadable("Google");
  }

  // A real DuckDuckGo results page carries its search form (action
  // "/html/"); the challenge and error pages do not. An empty results
  // page has not been captured live — every request was being challenged
  // at the time — so if DuckDuckGo drops the form from it, an empty
  // search reads as unreadable, which errs the safe way.
  if (/<form[^>]*action="\/html\/"/i.test(html)) return null;
  return unreadable("DuckDuckGo");
}

function unreadable(engine: string): string {
  return `${engine} returned a page with no results we could read and no "no results" notice — probably a block page or a layout we don't recognise. Not recorded as "not ranking".`;
}
