import { crawlers, weights } from "@/lib/geo-audit/data";
import type { GeoDocument } from "@/lib/geo-audit/lib/extract";
import type { RobotsFile } from "@/lib/geo-audit/lib/robots";
import { robotsAllows } from "@/lib/geo-audit/lib/robots";
import { buildSignal, type Signal } from "@/lib/geo-audit/scoring/model";
import type { FetchResult } from "@/lib/geo-audit/fetch";

const NOINDEX = /\bnoindex\b/i;
const NOFOLLOW = /\bnofollow\b/i;
const SESSION_PARAM =
  /\b(?:phpsessid|jsessionid|sid|sessionid|session_id)=/i;

const MAX_TITLE = 65;
const MIN_TITLE = 15;
const MAX_DESCRIPTION = 160;
const MIN_DESCRIPTION = 70;
const MAX_PATH_DEPTH = 4;
const MAX_PATH_LENGTH = 100;

export type GeoPage = {
  url: string;
  result: FetchResult | null;
  doc: GeoDocument | null;
};

export function crawlerAccess(
  robots: RobotsFile | null,
  path: string,
): [number | null, Record<string, unknown>] {
  const list = crawlers();
  if (!robots) {
    return [null, { reason: "robots.txt was not checked" }];
  }

  const critical = list.filter((c) => c.critical);
  const optional = list.filter((c) => !c.critical);
  const blockedCritical = critical
    .filter((c) => !robotsAllows(robots, c.token, path))
    .map((c) => c.token);
  const blockedOptional = optional
    .filter((c) => !robotsAllows(robots, c.token, path))
    .map((c) => c.token);

  if (robots.unreachable) {
    return [
      0,
      {
        reason:
          "robots.txt is unreachable, which RFC 9309 makes a complete disallow",
        robots_status: robots.status,
        blocked_critical: critical.map((c) => c.token),
      },
    ];
  }

  const allowed = critical.length - blockedCritical.length;
  const points = critical.length ? 25 * (allowed / critical.length) : 25;
  return [
    points,
    {
      critical_total: critical.length,
      critical_allowed: allowed,
      blocked_critical: blockedCritical,
      blocked_training_only: blockedOptional,
      robots_status: robots.status,
    },
  ];
}

export function indexability(
  doc: GeoDocument,
  headers: Record<string, string>,
): [number | null, Record<string, unknown>] {
  const metaRobots = doc.meta.robots ?? "";
  const headerRobots = headers["x-robots-tag"] ?? "";
  const combined = `${metaRobots} ${headerRobots}`;

  const noindex = NOINDEX.test(combined);
  const nofollow = NOFOLLOW.test(combined);
  const canonical = doc.meta.canonical;

  let points = 20;
  if (noindex) {
    points = 0;
  } else {
    if (nofollow) points -= 6;
    if (!canonical) points -= 4;
  }
  return [
    Math.max(points, 0),
    {
      noindex,
      nofollow,
      meta_robots: metaRobots || null,
      x_robots_tag: headerRobots || null,
      canonical: canonical ?? null,
    },
  ];
}

export function metadata(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const title = doc.title ?? "";
  const description = doc.meta.description ?? "";

  let titlePoints = 0;
  if (title) {
    titlePoints =
      title.length >= MIN_TITLE && title.length <= MAX_TITLE ? 5 : 2.5;
  }
  let descriptionPoints = 0;
  if (description) {
    descriptionPoints =
      description.length >= MIN_DESCRIPTION && description.length <= MAX_DESCRIPTION
        ? 5
        : 2.5;
  }

  const langPoints = doc.lang ? 3 : 0;
  const h1Points = doc.headings.filter(([l]) => l === 1).length === 1 ? 4 : 0;
  let altPoints = 0;
  if (doc.images) {
    altPoints = 3 * (doc.imagesWithAlt / doc.images);
  } else {
    altPoints = 3;
  }

  const points = titlePoints + descriptionPoints + langPoints + h1Points + altPoints;
  return [
    points,
    {
      title_chars: title.length || null,
      description_chars: description.length || null,
      lang: doc.lang,
      h1_count: doc.headings.filter(([l]) => l === 1).length,
      images: doc.images,
      images_with_alt: doc.imagesWithAlt,
      breakdown: {
        title: Math.round(titlePoints * 100) / 100,
        description: Math.round(descriptionPoints * 100) / 100,
        lang: langPoints,
        single_h1: h1Points,
        image_alt: Math.round(altPoints * 100) / 100,
      },
      limits: {
        title_chars: [MIN_TITLE, MAX_TITLE],
        description_chars: [MIN_DESCRIPTION, MAX_DESCRIPTION],
      },
    },
  ];
}

export function statusHealth(
  status: number | null,
  redirectHops: number,
): [number | null, Record<string, unknown>] {
  if (status === null) {
    return [0, { reason: "no response", status: null, redirect_hops: redirectHops }];
  }
  let points = status >= 200 && status < 300 ? 15 : 0;
  if (points && redirectHops) {
    points -= Math.min(redirectHops * 2, 6);
  }
  return [
    Math.max(points, 0),
    {
      status,
      redirect_hops: redirectHops,
      penalty_per_hop: 2,
    },
  ];
}

export function transportSecurity(
  url: string,
  headers: Record<string, string>,
): [number | null, Record<string, unknown>] {
  const https = new URL(url).protocol.toLowerCase() === "https:";
  const hsts = Boolean(headers["strict-transport-security"]);
  const points = (https ? 7 : 0) + (https && hsts ? 3 : 0);
  return [
    points,
    {
      https,
      hsts,
      breakdown: { https: https ? 7 : 0, hsts: https && hsts ? 3 : 0 },
    },
  ];
}

export function urlStructure(url: string): [number | null, Record<string, unknown>] {
  const u = new URL(url);
  const path = u.pathname || "/";
  const segments = path.split("/").filter(Boolean);

  const checks = {
    depth_within_limit: segments.length <= MAX_PATH_DEPTH,
    length_within_limit: path.length <= MAX_PATH_LENGTH,
    lowercase: path === path.toLowerCase(),
    no_underscores: !path.includes("_"),
    no_session_id: !SESSION_PARAM.test(u.search ?? ""),
  };
  const points = 10 * (Object.values(checks).filter(Boolean).length / Object.keys(checks).length);
  return [
    points,
    {
      path,
      depth: segments.length,
      checks,
      limits: { depth: MAX_PATH_DEPTH, length: MAX_PATH_LENGTH },
    },
  ];
}

export function scoreTechnical(page: GeoPage, robots: RobotsFile | null): Signal[] {
  const spec = weights().technical!.signals;
  const doc = page.doc;
  const result = page.result;
  const url = result?.finalUrl ?? page.url;
  const headers = result?.headers ?? {};
  const path = new URL(url).pathname || "/";

  const unmeasured: [null, Record<string, unknown>] = [
    null,
    { reason: "the page returned no markup to inspect" },
  ];

  if (!doc) {
    return [
      buildSignal("technical.crawler_access", spec["technical.crawler_access"]!, crawlerAccess(robots, path), url),
      buildSignal("technical.indexability", spec["technical.indexability"]!, unmeasured, url),
      buildSignal("technical.metadata", spec["technical.metadata"]!, unmeasured, url),
      buildSignal(
        "technical.status_health",
        spec["technical.status_health"]!,
        statusHealth(result?.status ?? null, result?.chain.length ?? 0),
        url,
      ),
      buildSignal(
        "technical.transport_security",
        spec["technical.transport_security"]!,
        transportSecurity(url, headers),
        url,
      ),
      buildSignal("technical.url_structure", spec["technical.url_structure"]!, urlStructure(url), url),
    ];
  }

  return [
    buildSignal("technical.crawler_access", spec["technical.crawler_access"]!, crawlerAccess(robots, path), url),
    buildSignal("technical.indexability", spec["technical.indexability"]!, indexability(doc, headers), url),
    buildSignal("technical.metadata", spec["technical.metadata"]!, metadata(doc), url),
    buildSignal(
      "technical.status_health",
      spec["technical.status_health"]!,
      statusHealth(result!.status, result!.chain.length),
      url,
    ),
    buildSignal(
      "technical.transport_security",
      spec["technical.transport_security"]!,
      transportSecurity(url, headers),
      url,
    ),
    buildSignal("technical.url_structure", spec["technical.url_structure"]!, urlStructure(url), url),
  ];
}
