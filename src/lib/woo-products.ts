/**
 * Read a client's WooCommerce catalogue through the public Store API
 * (`/wp-json/wc/store/v1/products`). No keys and no bridge plugin needed —
 * it is the same endpoint the shop's own cart blocks use.
 *
 * Used by Google Business Profile product posts: pick a product, show its
 * photo, link the "Shop" button to its page.
 */

import { guardedFetch } from "./url-guard";

export type WooProduct = {
  id: number;
  name: string;
  permalink: string;
  /** Plain text, HTML stripped */
  shortDescription: string;
  /** Formatted in the client's language, e.g. "149,00 €"; null when the shop hides prices */
  price: string | null;
  imageUrl: string | null;
};

/**
 * Why the catalogue could not be read, as a code the interface translates:
 *   no_url      — the client has no website address
 *   unreachable — the site did not answer
 *   not_woo     — the site answers but has no WooCommerce Store API
 *                 (plain WordPress, another CMS, or WooCommerce < 7.6)
 */
export type WooShopErrorCode = "no_url" | "unreachable" | "not_woo";

export class WooShopError extends Error {
  constructor(
    public code: WooShopErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WooShopError";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatWooPrice(
  p: { price?: string; currency_code?: string; currency_minor_unit?: number } | undefined,
  locale = "en",
): string | null {
  if (!p?.price) return null;
  const minor = p.currency_minor_unit ?? 2;
  const value = Number(p.price) / 10 ** minor;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (p.currency_code) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: p.currency_code,
        maximumFractionDigits: minor,
      }).format(value);
    } catch {
      // Unknown currency code: fall through to a plain number.
    }
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: minor })} ${p.currency_code ?? ""}`.trim();
}

/** The client's site as an absolute https? URL without a trailing slash. */
export function shopBaseUrl(siteUrl: string | null | undefined): string | null {
  const raw = (siteUrl ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * In-stock products, most popular first. Throws a WooShopError when the
 * catalogue cannot be read.
 */
export async function listWooProducts(
  siteUrl: string | null | undefined,
  opts: { perPage?: number; locale?: string } = {},
): Promise<WooProduct[]> {
  const base = shopBaseUrl(siteUrl);
  if (!base) throw new WooShopError("no_url", "The client has no website address.");
  const params = new URLSearchParams({
    per_page: String(opts.perPage ?? 50),
    orderby: "popularity",
    order: "desc",
    stock_status: "instock",
  });
  let res: Response;
  try {
    res = await guardedFetch(`${base}/wp-json/wc/store/v1/products?${params}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new WooShopError(
      "unreachable",
      `${base} did not answer: ${(err as Error).message ?? "unknown error"}`,
    );
  }
  if (!res.ok) {
    throw new WooShopError(
      res.status >= 500 ? "unreachable" : "not_woo",
      `WooCommerce products not reachable at ${base} (HTTP ${res.status}).`,
    );
  }
  type Raw = {
    id: number;
    name?: string;
    permalink?: string;
    short_description?: string;
    description?: string;
    is_in_stock?: boolean;
    prices?: { price?: string; currency_code?: string; currency_minor_unit?: number };
    images?: { src?: string }[];
  };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new WooShopError("not_woo", `${base} did not return WooCommerce products.`);
  }
  if (!Array.isArray(data)) {
    throw new WooShopError("not_woo", `${base} did not return WooCommerce products.`);
  }
  return (data as Raw[])
    .filter((p) => p.id && p.name && p.permalink && p.is_in_stock !== false)
    .map((p) => ({
      id: p.id,
      name: stripHtml(p.name ?? ""),
      permalink: p.permalink ?? "",
      shortDescription: stripHtml(p.short_description || p.description || "").slice(0, 600),
      price: formatWooPrice(p.prices, opts.locale),
      imageUrl: p.images?.[0]?.src ?? null,
    }));
}

/**
 * Cut a post to `max` characters at a sentence end when there is one in
 * the last third, else at a word, so it never stops mid-word.
 */
export function trimToLength(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentenceEnd = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("\n"),
  );
  if (sentenceEnd >= max * 0.66) return cut.slice(0, sentenceEnd + 1).trim();
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, "").trim() + "…";
}
