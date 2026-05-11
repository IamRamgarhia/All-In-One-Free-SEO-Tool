import type { ClientSocialLinks } from "@/db/schema";

export type SiteMetadata = {
  /** Final URL after redirects (origin-normalized). */
  url: string;
  /** Best-guess company / brand name (og:site_name > og:title > <title>). */
  name: string | null;
  description: string | null;
  /** Absolute URL to the most authoritative logo we could find. */
  logoUrl: string | null;
  /** From schema.org Organization / LocalBusiness JSON-LD if present. */
  address: string | null;
  phone: string | null;
  email: string | null;
  socialLinks: ClientSocialLinks;
  /** Heuristic Google Business Profile link if we found one in the page. */
  gbpUrl: string | null;
  /** Whether we managed to fetch the site at all. */
  reachable: boolean;
};

const SOCIAL_PATTERNS: Array<{
  key: keyof ClientSocialLinks;
  host: RegExp;
}> = [
  { key: "facebook", host: /^(?:www\.|m\.)?facebook\.com$|^fb\.com$/i },
  { key: "twitter", host: /^(?:www\.)?(?:twitter|x)\.com$/i },
  { key: "instagram", host: /^(?:www\.)?instagram\.com$/i },
  { key: "linkedin", host: /^(?:www\.)?linkedin\.com$/i },
  { key: "youtube", host: /^(?:www\.|m\.)?youtube\.com$|^youtu\.be$/i },
  { key: "tiktok", host: /^(?:www\.)?tiktok\.com$/i },
  { key: "pinterest", host: /^(?:www\.)?pinterest\.[a-z.]+$/i },
  { key: "github", host: /^(?:www\.)?github\.com$/i },
];

/**
 * Fetch a URL and extract everything we need to seed a client record:
 * brand name, description, logo, NAP, social links, and GBP link.
 *
 * All extraction is best-effort. Any failure returns `reachable:false`
 * with sane defaults so callers can still create the client manually.
 */
export async function fetchSiteMetadata(rawUrl: string): Promise<SiteMetadata> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  const empty: SiteMetadata = {
    url,
    name: null,
    description: null,
    logoUrl: null,
    address: null,
    phone: null,
    email: null,
    socialLinks: {},
    gbpUrl: null,
    reachable: false,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    return empty;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) return empty;

  // Guard against pathological responses (huge SPAs, accidental binary
  // downloads). Cap at 2 MB before reading the body fully.
  const cl = parseInt(res.headers.get("content-length") ?? "0", 10);
  if (cl > 2 * 1024 * 1024) return empty;

  const finalUrl = res.url || url;
  const html = (await res.text()).slice(0, 600_000);
  const headOnly = html.slice(0, 120_000);

  const name = extractName(headOnly);
  const description = extractDescription(headOnly);
  const logoUrl = extractLogoUrl(headOnly, finalUrl);
  const { address, phone, email } = extractFromJsonLd(html);
  const phoneFromHtml = phone ?? extractPhone(html);
  const emailFromHtml = email ?? extractEmail(html);
  const { socialLinks, gbpUrl } = extractSocialAndGbp(html);

  return {
    url: finalUrl,
    name,
    description,
    logoUrl,
    address,
    phone: phoneFromHtml,
    email: emailFromHtml,
    socialLinks,
    gbpUrl,
    reachable: true,
  };
}

function decode(s: string | undefined | null): string | null {
  if (!s) return null;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function metaContent(html: string, attr: "name" | "property", value: string) {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${value}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${value}["']`,
    "i",
  );
  return decode(html.match(re)?.[1] ?? html.match(re2)?.[1]);
}

function extractName(html: string): string | null {
  const ogSite = metaContent(html, "property", "og:site_name");
  if (ogSite) return ogSite;
  const ogTitle = metaContent(html, "property", "og:title");
  if (ogTitle) return ogTitle.split(/\s[|·\-—]\s/)[0].trim() || null;
  const title = decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
  if (title) return title.split(/\s[|·\-—]\s/)[0].trim() || null;
  return null;
}

function extractDescription(html: string): string | null {
  return (
    metaContent(html, "name", "description") ??
    metaContent(html, "property", "og:description") ??
    null
  );
}

function extractLogoUrl(html: string, baseUrl: string): string | null {
  // Prefer schema.org logo if surfaced as <link>, then og:image, then favicons.
  const candidates: Array<string | null | undefined> = [
    metaContent(html, "property", "og:image"),
    html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i)?.[1],
    html.match(/<link[^>]+rel=["']icon["'][^>]+href=["']([^"']+)["']/i)?.[1],
    html.match(/<link[^>]+rel=["']shortcut icon["'][^>]+href=["']([^"']+)["']/i)?.[1],
  ];
  for (const c of candidates) {
    if (c) {
      try {
        return new URL(c, baseUrl).toString();
      } catch {
        continue;
      }
    }
  }
  // Fallback to /favicon.ico
  try {
    return new URL("/favicon.ico", baseUrl).toString();
  } catch {
    return null;
  }
}

function extractFromJsonLd(html: string): {
  address: string | null;
  phone: string | null;
  email: string | null;
} {
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  let address: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;

  for (const m of blocks) {
    const body = m[1].trim();
    if (!body) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const graph = Array.isArray(obj["@graph"])
        ? (obj["@graph"] as Record<string, unknown>[])
        : [obj];
      for (const node of graph) {
        const t = node["@type"];
        const types = Array.isArray(t) ? t.map(String) : [String(t ?? "")];
        const isOrg = types.some((x) =>
          /Organization|LocalBusiness|Restaurant|Store|Hotel|MedicalBusiness|ProfessionalService/i.test(
            x,
          ),
        );
        if (!isOrg) continue;
        if (!address) address = formatAddress(node["address"]);
        if (!phone) phone = stringOrNull(node["telephone"]);
        if (!email) {
          const emailRaw = stringOrNull(node["email"]);
          email = emailRaw ? emailRaw.replace(/^mailto:/i, "") : null;
        }
      }
    }
  }

  return { address, phone, email };
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function formatAddress(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  const parts = [
    a.streetAddress,
    a.addressLocality,
    a.addressRegion,
    a.postalCode,
    a.addressCountry,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function extractPhone(html: string): string | null {
  const tel = html.match(/href=["']tel:([+\d()\-.\s]{6,})["']/i)?.[1];
  return tel ? decode(tel) : null;
}

function extractEmail(html: string): string | null {
  const mail = html.match(/href=["']mailto:([^"'?]+)["']/i)?.[1];
  return mail ? decode(mail) : null;
}

function extractSocialAndGbp(html: string): {
  socialLinks: ClientSocialLinks;
  gbpUrl: string | null;
} {
  const socialLinks: ClientSocialLinks = {};
  let gbpUrl: string | null = null;

  const hrefs = [
    ...html.matchAll(/href=["']([^"']+)["']/gi),
  ].map((m) => m[1]);

  for (const raw of hrefs) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const host = parsed.hostname.toLowerCase();
    const href = parsed.toString();

    // Google Business Profile / Maps detection
    if (
      !gbpUrl &&
      (/(?:^|\.)google\.com$/i.test(host) || /goo\.gl$|maps\.app\.goo\.gl$/i.test(host)) &&
      /\/maps|\/place|share\.google/i.test(parsed.pathname + parsed.search)
    ) {
      gbpUrl = href;
    }

    for (const { key, host: pattern } of SOCIAL_PATTERNS) {
      if (pattern.test(host)) {
        // Skip share/intent URLs (e.g. facebook.com/sharer)
        if (
          /\/(sharer|share|intent|tr\?)/i.test(parsed.pathname + parsed.search)
        )
          continue;
        if (!socialLinks[key]) socialLinks[key] = href;
        break;
      }
    }
  }

  return { socialLinks, gbpUrl };
}
