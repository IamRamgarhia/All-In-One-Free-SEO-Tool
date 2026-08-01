/**
 * Rankings from Search Console instead of a scraped SERP.
 *
 * Why this is the better default, when it's available:
 *
 *   - It is Google's own number, not our guess at parsing their HTML.
 *     The single most fragile path in this codebase is the SERP scraper,
 *     and its failures are silent — the audit found it reporting "not
 *     ranking" for months because a redirect wrapper was filtered out.
 *   - It is what real users saw, on real devices, in real locations,
 *     rather than what one datacentre IP is shown.
 *   - Fifty keywords cost ONE API call, not fifty browser launches. On a
 *     $5 VPS that is the difference between a rank check that finishes
 *     and one that gets OOM-killed.
 *   - It is free, official, unlimited for practical purposes, and cannot
 *     get the user rate-limited or captcha'd.
 *
 * And why it does not simply replace scraping:
 *
 *   - It only knows queries the site actually got impressions for. A
 *     keyword you don't rank for at all is invisible here — which reads
 *     identically to "no data yet", and those two must not be conflated.
 *   - It is an AVERAGE over the day, weighted by impressions, not a
 *     point-in-time position. A page that sat at 3 all morning and 11
 *     all afternoon reports ~7, a position it never actually held.
 *   - It lags two to three days.
 *   - It requires the client to have connected GSC and to own the
 *     property, which many never will.
 *
 * So: prefer GSC, fall back to scraping, and always say which one a
 * number came from. See migration 0055 and the badge on every row.
 */

import { fetchGscPerformance } from "./google-oauth";

export type GscRankRow = {
  query: string;
  /** Average position for `dataDate`. Never rounded here — the UI decides. */
  position: number;
  impressions: number;
  clicks: number;
  /** The day this describes (YYYY-MM-DD), NOT the day we fetched it. */
  dataDate: string;
  device: "desktop" | "mobile";
};

export type GscRankLookup = {
  /** Keyed by lowercased query, then device. */
  rows: Map<string, GscRankRow>;
  /** The most recent day with any data. Null when the property is silent. */
  latestDate: string | null;
};

/** GSC keys queries in lower case already, but be explicit about it. */
export function rankKey(query: string, device: "desktop" | "mobile"): string {
  return `${query.trim().toLowerCase()}::${device}`;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Turn raw GSC rows (dimensions: date, query, device) into one row per
 * query+device, keeping only the most recent day that has data.
 *
 * Split out from the fetch so it can be tested without a network or an
 * OAuth token — this mapping is where an off-by-one in the dimension
 * order would silently attribute every ranking to the wrong query, and
 * that is exactly the class of bug this project keeps finding.
 */
export function mapGscRankRows(
  raw: { keys: string[]; clicks: number; impressions: number; position: number }[],
): GscRankLookup {
  const rows = new Map<string, GscRankRow>();
  let latestDate: string | null = null;

  for (const r of raw) {
    const [date, query, rawDevice] = r.keys;
    if (!date || !query) continue;

    // GSC returns DESKTOP / MOBILE / TABLET. Tablet is folded into
    // desktop because that is how the SERP is laid out, and because
    // nobody tracks tablet rankings separately.
    const device: "desktop" | "mobile" =
      (rawDevice ?? "").toUpperCase() === "MOBILE" ? "mobile" : "desktop";

    const key = rankKey(query, device);
    const existing = rows.get(key);
    // Keep the newest day per query+device. Ties can't happen — date is
    // a dimension, so each (date, query, device) appears once.
    if (existing && existing.dataDate >= date) continue;

    rows.set(key, {
      query,
      position: r.position,
      impressions: r.impressions,
      clicks: r.clicks,
      dataDate: date,
      device,
    });
    if (!latestDate || date > latestDate) latestDate = date;
  }

  return { rows, latestDate };
}

/**
 * Fetch the most recent ranking for every query a property got
 * impressions for, in one call.
 *
 * `days` is a look-back window, not a range to average over: we take the
 * newest day each query appears on. A window is needed because GSC's lag
 * is not fixed — asking only for "three days ago" returns nothing on the
 * days the lag is four.
 */
export async function fetchGscRankSnapshot(opts: {
  siteUrl: string;
  clientIdScope?: number;
  /** Look-back window. 10 days comfortably covers the worst observed lag. */
  days?: number;
  country?: string;
  rowLimit?: number;
}): Promise<GscRankLookup> {
  const days = opts.days ?? 10;

  const filters: { filters: { dimension: "country"; expression: string }[] }[] =
    [];
  if (opts.country) {
    // GSC wants ISO-3166-1 alpha-3 ("usa"), while the rest of this app
    // stores alpha-2 ("US"). Converting the handful we care about beats
    // shipping a country table; an unrecognised code simply means no
    // country filter, which is a wider answer, not a wrong one.
    const alpha3 = COUNTRY_ALPHA2_TO_ALPHA3[opts.country.toUpperCase()];
    if (alpha3) {
      filters.push({
        filters: [{ dimension: "country", expression: alpha3 }],
      });
    }
  }

  const raw = await fetchGscPerformance({
    siteUrl: opts.siteUrl,
    clientIdScope: opts.clientIdScope,
    startDate: isoDaysAgo(days),
    endDate: isoDaysAgo(0),
    dimensions: ["date", "query", "device"],
    rowLimit: opts.rowLimit ?? 25000,
    dataState: "final",
    ...(filters.length ? { dimensionFilterGroups: filters } : {}),
  });

  return mapGscRankRows(raw);
}

/**
 * One keyword. Filters server-side rather than pulling the whole
 * property, because a site with real traffic has more than the 25,000
 * rows a single response can carry and local filtering would quietly
 * miss anything past the cap.
 */
export async function fetchGscRankForQuery(opts: {
  siteUrl: string;
  query: string;
  clientIdScope?: number;
  days?: number;
  device?: "desktop" | "mobile";
}): Promise<GscRankRow | null> {
  const raw = await fetchGscPerformance({
    siteUrl: opts.siteUrl,
    clientIdScope: opts.clientIdScope,
    startDate: isoDaysAgo(opts.days ?? 10),
    endDate: isoDaysAgo(0),
    dimensions: ["date", "query", "device"],
    rowLimit: 1000,
    dataState: "final",
    dimensionFilterGroups: [
      {
        filters: [
          { dimension: "query", operator: "equals", expression: opts.query },
        ],
      },
    ],
  });

  const { rows } = mapGscRankRows(raw);
  return rows.get(rankKey(opts.query, opts.device ?? "desktop")) ?? null;
}

/**
 * How much to trust an averaged position.
 *
 * An average built on four impressions is a rumour. The thresholds are
 * deliberately conservative — it is better to tell someone their number
 * is thin than to let them report it to a client as fact.
 */
export function rankConfidence(impressions: number): {
  level: "high" | "medium" | "low";
  reason: string;
} {
  if (impressions >= 100) {
    return {
      level: "high",
      reason: `Averaged over ${impressions.toLocaleString()} impressions.`,
    };
  }
  if (impressions >= 15) {
    return {
      level: "medium",
      reason: `Only ${impressions} impressions — the average can swing a few positions day to day.`,
    };
  }
  return {
    level: "low",
    reason: `Just ${impressions} impression${impressions === 1 ? "" : "s"}. Treat this as a hint, not a measurement.`,
  };
}

/**
 * The countries this app offers in its locale pickers, mapped to the
 * alpha-3 codes GSC expects. Not exhaustive on purpose — an unmapped
 * code drops the filter rather than sending a code Google rejects.
 */
const COUNTRY_ALPHA2_TO_ALPHA3: Record<string, string> = {
  US: "usa",
  GB: "gbr",
  UK: "gbr",
  IN: "ind",
  CA: "can",
  AU: "aus",
  NZ: "nzl",
  IE: "irl",
  DE: "deu",
  FR: "fra",
  ES: "esp",
  IT: "ita",
  NL: "nld",
  BE: "bel",
  SE: "swe",
  NO: "nor",
  DK: "dnk",
  FI: "fin",
  PL: "pol",
  PT: "prt",
  BR: "bra",
  MX: "mex",
  AR: "arg",
  ZA: "zaf",
  NG: "nga",
  KE: "ken",
  AE: "are",
  SA: "sau",
  SG: "sgp",
  MY: "mys",
  ID: "idn",
  PH: "phl",
  TH: "tha",
  VN: "vnm",
  JP: "jpn",
  KR: "kor",
  CN: "chn",
  HK: "hkg",
  TW: "twn",
  PK: "pak",
  BD: "bgd",
  LK: "lka",
  NP: "npl",
  CH: "che",
  AT: "aut",
  CZ: "cze",
  RO: "rou",
  GR: "grc",
  TR: "tur",
  IL: "isr",
  EG: "egy",
  CL: "chl",
  CO: "col",
  PE: "per",
};
