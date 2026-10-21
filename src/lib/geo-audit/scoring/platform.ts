import { weights } from "@/lib/geo-audit/data";
import type { GeoDocument } from "@/lib/geo-audit/lib/extract";
import { buildSignal, type Signal } from "@/lib/geo-audit/scoring/model";
import type { GeoPage } from "@/lib/geo-audit/scoring/technical";

const FEED_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
];
const SOCIAL_KEYS = ["og:title", "og:description", "og:image"] as const;
const TWITTER_KEYS = [
  "twitter:card",
  "twitter:title",
  "twitter:description",
  "twitter:image",
] as const;

export type SiteFacts = {
  sitemaps?: string[];
  languages?: Set<string>;
  llmsPresent?: boolean | null;
  llmsValid?: boolean | null;
};

export function llmsTxt(
  present: boolean | null | undefined,
  valid: boolean | null | undefined,
): [number | null, Record<string, unknown>] {
  if (present === null || present === undefined) {
    return [null, { reason: "the site was not checked for an llms.txt" }];
  }
  if (!present) {
    return [0, { present: false, valid: null }];
  }
  return [
    valid ? 35 : 20,
    {
      present: true,
      valid: Boolean(valid),
      note: valid ? null : "present but not in the documented structure",
    },
  ];
}

export function socialCards(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const openGraph = SOCIAL_KEYS.filter((key) => doc.meta[key]);
  const twitter = TWITTER_KEYS.filter((key) => doc.meta[key]);

  const core = 24 * (openGraph.length / SOCIAL_KEYS.length);
  const extra = twitter.length ? 6 : 0;
  return [
    core + extra,
    {
      open_graph_present: openGraph,
      open_graph_missing: SOCIAL_KEYS.filter((key) => !doc.meta[key]),
      twitter_present: twitter,
      breakdown: { open_graph: Math.round(core * 100) / 100, twitter: extra },
    },
  ];
}

export function feeds(
  html: string,
  sitemaps: string[] | undefined,
): [number | null, Record<string, unknown>] {
  const feedPattern = new RegExp(
    `<link[^>]+type=["'](?:${FEED_TYPES.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})["']`,
    "i",
  );
  const hasFeed = feedPattern.test(html ?? "");
  const sitemapCount = sitemaps?.length ?? 0;
  const sitemapPoints = sitemapCount ? 14 : 0;
  const feedPoints = hasFeed ? 6 : 0;
  return [
    sitemapPoints + feedPoints,
    {
      sitemaps_in_robots: sitemapCount,
      feed_link: hasFeed,
      breakdown: { sitemap: sitemapPoints, feed: feedPoints },
    },
  ];
}

export function hreflang(
  html: string,
  languagesSeen: Set<string> | undefined,
): [number | null, Record<string, unknown>] {
  const annotations = [
    ...html.matchAll(/<link[^>]+hreflang=["']([^"']+)["']/gi),
  ].map((m) => m[1]!);
  const languages = new Set(
    [...(languagesSeen ?? [])]
      .map((lang) => lang.split("-")[0]?.toLowerCase())
      .filter(Boolean),
  );

  if (languages.size < 2 && !annotations.length) {
    return [
      null,
      {
        reason: "only one language was seen on this site, so hreflang does not apply",
        languages_seen: [...languages].sort(),
      },
    ];
  }

  if (!annotations.length) {
    return [0, { annotations: 0, languages_seen: [...languages].sort() }];
  }

  const hasDefault = annotations.some((v) => v.toLowerCase() === "x-default");
  const points = 10 + (hasDefault ? 5 : 0);
  return [
    points,
    {
      annotations: annotations.length,
      x_default: hasDefault,
      languages_declared: [...new Set(annotations.map((v) => v.toLowerCase()))].sort(),
      languages_seen: [...languages].sort(),
    },
  ];
}

export function scorePlatform(page: GeoPage, siteFacts: SiteFacts): Signal[] {
  const spec = weights().platform!.signals;
  const doc = page.doc;
  const url = page.result?.finalUrl ?? page.url;
  const html = page.result?.body ?? "";

  const unmeasured: [null, Record<string, unknown>] = [
    null,
    { reason: "the page returned no markup to inspect" },
  ];

  if (!doc) {
    return [
      buildSignal(
        "platform.llms_txt",
        spec["platform.llms_txt"]!,
        llmsTxt(siteFacts.llmsPresent, siteFacts.llmsValid),
        url,
      ),
      buildSignal("platform.social_cards", spec["platform.social_cards"]!, unmeasured, url),
      buildSignal(
        "platform.feeds",
        spec["platform.feeds"]!,
        feeds(html, siteFacts.sitemaps),
        url,
      ),
      buildSignal("platform.hreflang", spec["platform.hreflang"]!, unmeasured, url),
    ];
  }

  return [
    buildSignal(
      "platform.llms_txt",
      spec["platform.llms_txt"]!,
      llmsTxt(siteFacts.llmsPresent, siteFacts.llmsValid),
      url,
    ),
    buildSignal("platform.social_cards", spec["platform.social_cards"]!, socialCards(doc), url),
    buildSignal(
      "platform.feeds",
      spec["platform.feeds"]!,
      feeds(html, siteFacts.sitemaps),
      url,
    ),
    buildSignal(
      "platform.hreflang",
      spec["platform.hreflang"]!,
      hreflang(html, siteFacts.languages),
      url,
    ),
  ];
}
