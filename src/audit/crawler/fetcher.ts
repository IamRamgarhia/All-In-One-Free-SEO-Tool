import type { CheerioAPI } from "cheerio";
import type {
  CookieInfo,
  FigureInfo,
  ImageInfo,
  InlineSvgInfo,
  InvalidLinkInfo,
  LinkInfo,
  PictureElementInfo,
  RedirectChainEntry,
  SpecialLinkInfo,
  AuditContext,
  CoreWebVitals,
} from "@/audit/types";
import * as cheerio from "cheerio";
import { AuditError, rethrowIfAborted, throwIfAborted } from "@/audit/engine/errors";
import { getUserAgent } from "@/audit/crawler/user-agent";
import { parseSetCookieHeaders } from "@/audit/crawler/cookies";
import { auditFetch } from "@/audit/crawler/net";

export const AUDITABLE_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];
export function unauditableReason(url: string, contentType: string | null, html: string): string | null {
  if (html.trim().length === 0) {
    return `${url} returned an empty response body, so there is nothing to audit`;
  }
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type && !AUDITABLE_CONTENT_TYPES.includes(type)) {
    return `${url} returned ${type}, which is not an HTML page`;
  }
  if (!type && !/<\s*(!doctype|html|head|body)\b/i.test(html)) {
    return `${url} returned no Content-Type and no HTML markup`;
  }
  return null;
}
export const MAX_TRACKED_REDIRECTS = 20;
export function pageRequestHeaders() {
  return {
    "User-Agent": getUserAgent(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
  };
}
export function requestSignal(timeout: number, signal?: AbortSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return {
    signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    timedOut: () => controller.signal.aborted,
    dispose: () => clearTimeout(timeoutId)
  };
}
export async function fetchFollowingRedirects(url: string, signal?: AbortSignal) {
  const chain: RedirectChainEntry[] = [];
  const seen = new Set<string>();
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_TRACKED_REDIRECTS; hop++) {
    const response = await auditFetch(currentUrl, {
      method: "GET",
      signal,
      headers: pageRequestHeaders(),
      redirect: "manual"
    });
    chain.push({ url: currentUrl, statusCode: response.status });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) return { response, chain };
    const nextUrl = new URL(location, currentUrl).href;
    if (seen.has(nextUrl)) {
      const cycle = [...chain.map((hop2) => hop2.url), nextUrl];
      throw new Error(`${url} redirects in a loop: ${cycle.join(" -> ")}`);
    }
    seen.add(currentUrl);
    currentUrl = nextUrl;
  }
  throw new Error(`${url} exceeded ${MAX_TRACKED_REDIRECTS} redirects`);
}
export type FetchResult = {
  html: string;
  $: CheerioAPI;
  headers: Record<string, string>;
  statusCode: number;
  responseTime: number;
  cookies?: CookieInfo[];
  redirectChain?: RedirectChainEntry[];
};

export async function fetchPage(
  url: string,
  timeout = 3e4,
  options: { trackRedirects?: boolean; signal?: AbortSignal } = {},
): Promise<FetchResult> {
  throwIfAborted(options.signal);
  const request = requestSignal(timeout, options.signal);
  const startTime = performance.now();
  try {
    let response: Response;
    let redirectChain: RedirectChainEntry[] | undefined;
    if (options.trackRedirects) {
      const tracked = await fetchFollowingRedirects(url, request.signal);
      response = tracked.response;
      redirectChain = tracked.chain;
    } else {
      response = await auditFetch(url, {
        method: "GET",
        signal: request.signal,
        headers: pageRequestHeaders(),
        redirect: "follow"
      });
    }
    const responseTime = performance.now() - startTime;
    const html = await response.text();
    const $ = cheerio.load(html);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return {
      html,
      $,
      headers,
      statusCode: response.status,
      responseTime: Math.round(responseTime),
      cookies: parseSetCookieHeaders(response.headers),
      ...(redirectChain && { redirectChain })
    };
  } catch (error) {
    rethrowIfAborted(error, options.signal);
    if (request.timedOut()) {
      throw new AuditError("timeout", `${url} did not respond within ${timeout} ms`, { cause: error });
    }
    throw error;
  } finally {
    request.dispose();
  }
}
export async function fetchUrl(url: string, timeout = 1e4, signal?: AbortSignal): Promise<number> {
  const headStatus = await requestStatus(url, "HEAD", timeout, signal);
  if (headStatus !== 0 && headStatus < 400) return headStatus;
  const getStatus = await requestStatus(url, "GET", timeout, signal);
  return getStatus === 0 ? headStatus : getStatus;
}
export async function requestStatus(url: string, method: string, timeout: number, signal?: AbortSignal): Promise<number> {
  throwIfAborted(signal);
  const request = requestSignal(timeout, signal);
  try {
    const response = await auditFetch(url, {
      method,
      signal: request.signal,
      headers: {
        "User-Agent": getUserAgent()
      },
      redirect: "follow"
    });
    await response.body?.cancel().catch(() => {
    });
    return response.status;
  } catch (error) {
    rethrowIfAborted(error, signal);
    return 0;
  } finally {
    request.dispose();
  }
}
export function extractLinks($: CheerioAPI, baseUrl: string): { links: LinkInfo[]; invalidLinks: InvalidLinkInfo[] } {
  const links: LinkInfo[] = [];
  const invalidLinks: InvalidLinkInfo[] = [];
  const baseUrlObj = new URL(baseUrl);
  $("a[href]").each((_, element) => {
    const $el = $(element);
    const href = $el.attr("href");
    const text = ($el.text().trim() || $el.attr("title") || "").slice(0, 200);
    if (!href || href === "" || href === "#") {
      invalidLinks.push({
        href: href || "",
        reason: "empty",
        text
      });
      return;
    }
    if (/^javascript:/i.test(href)) {
      invalidLinks.push({
        href,
        reason: "javascript",
        text
      });
      return;
    }
    if (/^(mailto:|tel:|data:)/i.test(href)) {
      return;
    }
    try {
      const resolvedUrl = new URL(href, baseUrl);
      const normalizedHref = resolvedUrl.href;
      const isInternal = resolvedUrl.hostname === baseUrlObj.hostname;
      const rel = $el.attr("rel") || "";
      const isNoFollow = rel.toLowerCase().includes("nofollow");
      const inChrome = $el.closest('nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]').length > 0;
      links.push({
        href: normalizedHref,
        text,
        isInternal,
        isNoFollow,
        inChrome
      });
    } catch {
      invalidLinks.push({
        href,
        reason: "malformed",
        text
      });
    }
  });
  return { links, invalidLinks };
}
export function isValidEmail(email: string): { isValid: boolean; issue?: string } {
  if (!email) {
    return { isValid: false, issue: "Empty email address" };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, issue: "Invalid email format" };
  }
  return { isValid: true };
}
export function isValidPhone(phone: string): { isValid: boolean; issue?: string } {
  if (!phone) {
    return { isValid: false, issue: "Empty phone number" };
  }
  const cleaned = phone.replace(/[\s\-\(\)\+\.]/g, "");
  if (!/^\d{7,15}$/.test(cleaned)) {
    return { isValid: false, issue: "Invalid phone format (should be 7-15 digits)" };
  }
  return { isValid: true };
}
export function extractSpecialLinks($: CheerioAPI): SpecialLinkInfo[] {
  const specialLinks: SpecialLinkInfo[] = [];
  $("a[href]").each((_, element) => {
    const $el = $(element);
    const href = $el.attr("href");
    if (!href) return;
    const text = ($el.text().trim() || $el.attr("title") || "").slice(0, 200);
    if (/^tel:/i.test(href)) {
      const value = href.replace(/^tel:/i, "");
      const validation = isValidPhone(value);
      specialLinks.push({
        type: "tel",
        href,
        value,
        text,
        isValid: validation.isValid,
        ...(validation.issue && { issue: validation.issue })
      });
      return;
    }
    if (/^mailto:/i.test(href)) {
      const value = href.replace(/^mailto:/i, "").split("?")[0];
      const validation = isValidEmail(value);
      specialLinks.push({
        type: "mailto",
        href,
        value,
        text,
        isValid: validation.isValid,
        ...(validation.issue && { issue: validation.issue })
      });
    }
  });
  return specialLinks;
}
export function extractImages($: CheerioAPI, baseUrl: string): ImageInfo[] {
  const images: ImageInfo[] = [];
  $("img").each((_, element) => {
    const $el = $(element);
    const src = $el.attr("src") || $el.attr("data-src") || "";
    if (!src || src.startsWith("data:")) {
      return;
    }
    let resolvedSrc = src;
    try {
      resolvedSrc = new URL(src, baseUrl).href;
    } catch {
    }
    const alt = $el.attr("alt");
    const loading = $el.attr("loading");
    images.push({
      src: resolvedSrc,
      alt: alt ?? "",
      hasAlt: alt !== void 0,
      width: $el.attr("width"),
      height: $el.attr("height"),
      isLazyLoaded: loading === "lazy" || $el.attr("data-src") !== void 0
    });
  });
  return images;
}
export function extractFigures($: CheerioAPI): FigureInfo[] {
  const figures: FigureInfo[] = [];
  $("figure").each((_, element) => {
    const $el = $(element);
    const $figcaption = $el.find("figcaption");
    figures.push({
      hasFigcaption: $figcaption.length > 0,
      imageCount: $el.find("img").length,
      captionText: $figcaption.text().trim().slice(0, 200) || void 0
    });
  });
  return figures;
}
export function extractInlineSvgs($: CheerioAPI): InlineSvgInfo[] {
  const svgs: InlineSvgInfo[] = [];
  $("svg").each((_, element) => {
    const $el = $(element);
    const html = $.html($el);
    svgs.push({
      sizeBytes: Buffer.byteLength(html, "utf8"),
      hasViewBox: $el.attr("viewBox") !== void 0,
      hasTitle: $el.find("title").length > 0,
      snippet: html.slice(0, 100)
    });
  });
  return svgs;
}
export function extractPictureElements($: CheerioAPI): PictureElementInfo[] {
  const pictures: PictureElementInfo[] = [];
  $("picture").each((_, element) => {
    const $el = $(element);
    const $img = $el.find("img");
    const $sources = $el.find("source");
    const sourceTypes: string[] = [];
    $sources.each((_2, source) => {
      const type = $(source).attr("type");
      if (type) sourceTypes.push(type);
    });
    pictures.push({
      hasImgFallback: $img.length > 0,
      sourceCount: $sources.length,
      imgSrc: $img.attr("src"),
      sourceTypes
    });
  });
  return pictures;
}
export async function fetchUrlWithRedirects(
  url: string,
  timeout = 1e4,
  maxRedirects = 5,
  signal?: AbortSignal,
): Promise<{ finalUrl: string; statusCode: number; redirectCount: number; chain: string[] }> {
  const chain = [url];
  let currentUrl = url;
  let redirectCount = 0;
  while (redirectCount < maxRedirects) {
    throwIfAborted(signal);
    const request = requestSignal(timeout, signal);
    try {
      let response = await auditFetch(currentUrl, {
        method: "HEAD",
        signal: request.signal,
        headers: {
          "User-Agent": getUserAgent()
        },
        redirect: "manual"
        // Don't auto-follow redirects
      });
      // A server that refuses HEAD (405, 501) says nothing about the page
      // itself: ask again with GET, status only, body dropped unread.
      if (response.status === 405 || response.status === 501) {
        response = await auditFetch(currentUrl, {
          signal: request.signal,
          headers: {
            "User-Agent": getUserAgent()
          },
          redirect: "manual"
        });
        await response.body?.cancel().catch(() => {});
      }
      request.dispose();
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          const nextUrl = new URL(location, currentUrl).href;
          chain.push(nextUrl);
          currentUrl = nextUrl;
          redirectCount++;
          continue;
        }
      }
      return {
        finalUrl: currentUrl,
        statusCode: response.status,
        redirectCount,
        chain
      };
    } catch (error) {
      request.dispose();
      rethrowIfAborted(error, signal);
      return {
        finalUrl: currentUrl,
        statusCode: 0,
        // Network error
        redirectCount,
        chain
      };
    }
  }
  return {
    finalUrl: currentUrl,
    statusCode: 0,
    // Treat as error
    redirectCount,
    chain
  };
}
export function createAuditContext(url: string, fetchResult: FetchResult, cwv: CoreWebVitals = {}): AuditContext {
  const { html, $, headers, statusCode, responseTime, cookies, redirectChain } = fetchResult;
  const { links, invalidLinks } = extractLinks($, url);
  const specialLinks = extractSpecialLinks($);
  return {
    url,
    html,
    $,
    headers,
    statusCode,
    responseTime,
    cwv,
    links,
    images: extractImages($, url),
    invalidLinks,
    specialLinks,
    figures: extractFigures($),
    inlineSvgs: extractInlineSvgs($),
    pictureElements: extractPictureElements($),
    // Passed through as-is: undefined means unknown, [] means none were set.
    ...(cookies !== undefined && { cookies }),
    // Only present when the caller asked fetchPage to track redirects; the
    // redirect rules treat its absence as unmeasured rather than "no hops".
    ...(redirectChain !== undefined && { redirectChain })
  };
}
