/**
 * The agency's branding — one definition, used everywhere a client sees
 * something.
 *
 * This existed twice, in report-generator.ts and quarterly-strategy.ts,
 * and the two copies had already drifted:
 *
 *   report-generator   set logoMime BEFORE checking the format, so an
 *                      SVG logo returned mime "image/svg+xml" with a
 *                      null buffer
 *   quarterly-strategy set it inside the check, so the same SVG
 *                      returned mime null
 *
 * Nothing broke, because both consumers happen to guard on the buffer
 * rather than the mime. But that is luck, not design, and it is exactly
 * the pattern CLAUDE.md's fourth standing rule names: never add a second
 * hardcoded copy of something that already exists, because every such
 * pair in this codebase had already drifted by the time it was found.
 *
 * White-label matters more than a normal setting. An agency puts this
 * tool's output in front of the client who pays them. A report footer
 * that says "SEO Tool" instead of their name is not a cosmetic issue —
 * it tells the client which product to go and buy directly.
 */

import { getSetting } from "./settings-store";

export type Brand = {
  name: string | null;
  color: string | null;
  tagline: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  footerText: string | null;
  /** Decoded logo, only when it's a format the PDF renderer can draw. */
  logoBuffer: Buffer | null;
  /**
   * Mime of the decoded logo. Null whenever `logoBuffer` is null — the
   * two always agree, which is the drift the two old copies had.
   */
  logoMime: string | null;
  /** The original data URL, for HTML surfaces that can render any format. */
  logoDataUrl: string | null;
};

/** Formats pdfkit can actually draw. SVG and WebP will not render. */
const PDF_SAFE_IMAGE = new Set(["image/png", "image/jpeg"]);

export async function loadBrand(): Promise<Brand> {
  const [
    name,
    color,
    logoDataUrl,
    tagline,
    website,
    email,
    phone,
    footerText,
  ] = await Promise.all([
    getSetting<string>("brand.name"),
    getSetting<string>("brand.color"),
    getSetting<string>("brand.logo_data_url"),
    getSetting<string>("brand.tagline"),
    getSetting<string>("brand.website"),
    getSetting<string>("brand.email"),
    getSetting<string>("brand.phone"),
    getSetting<string>("brand.footer_text"),
  ]);

  const { buffer, mime } = decodeLogo(logoDataUrl ?? null);

  return {
    name: name ?? null,
    color: color ?? null,
    tagline: tagline ?? null,
    website: website ?? null,
    email: email ?? null,
    phone: phone ?? null,
    footerText: footerText ?? null,
    logoBuffer: buffer,
    logoMime: mime,
    logoDataUrl: logoDataUrl ?? null,
  };
}

/**
 * Decode a data-URL logo for the PDF renderer.
 *
 * Buffer and mime are set together or not at all. The old copies
 * disagreed about whether an unsupported format should still report its
 * mime, and a future caller reading `logoMime` alone would have got a
 * different answer depending on which module it imported from.
 */
export function decodeLogo(dataUrl: string | null): {
  buffer: Buffer | null;
  mime: string | null;
} {
  if (!dataUrl) return { buffer: null, mime: null };
  const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) return { buffer: null, mime: null };

  const mime = m[1].toLowerCase();
  if (!PDF_SAFE_IMAGE.has(mime)) return { buffer: null, mime: null };

  try {
    return { buffer: Buffer.from(m[2], "base64"), mime };
  } catch {
    return { buffer: null, mime: null };
  }
}

/**
 * Is this instance white-labelled at all?
 *
 * Used to decide whether client-facing surfaces say the agency's name or
 * fall back to the product's. Only the name counts — a colour on its own
 * doesn't make a portal look like it belongs to anyone.
 */
export function isWhiteLabelled(brand: Brand): boolean {
  return Boolean(brand.name && brand.name.trim().length > 0);
}

/** What a client-facing page should call this. */
export function displayName(brand: Brand): string {
  return isWhiteLabelled(brand) ? brand.name!.trim() : "SEO Tool";
}

/** A validated hex colour, or the product default. */
export function accentColor(brand: Brand, fallback = "#7c3aed"): string {
  return brand.color && /^#[0-9a-f]{6}$/i.test(brand.color)
    ? brand.color
    : fallback;
}
