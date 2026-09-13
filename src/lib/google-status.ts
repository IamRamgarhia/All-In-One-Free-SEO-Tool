/**
 * Google's own record of ranking updates, read from the Search Status
 * Dashboard (status.search.google.com).
 *
 * Why this and not a hand-kept list: the list it replaces had drifted
 * into being wrong in ways nobody could see from inside the tool. Checked
 * against the dashboard in September 2026, it started the December 2025
 * core update a week early (4 Dec; Google says 11 Dec), listed a
 * "September 2025 core update" Google never announced, and had none of
 * the five updates released in 2026. The traffic-drop diagnosis read
 * that list to decide whether an update explained a client's drop.
 *
 * Parsing only, no fetching, so it can be tested on captured pages.
 */

export type RankingUpdateType =
  | "core"
  | "spam"
  | "helpful_content"
  | "product_review"
  | "issue"
  | "other";

export type RankingUpdate = {
  /** The dashboard's incident id. */
  id: string;
  name: string;
  type: RankingUpdateType;
  /** Start, as the US/Pacific calendar date Google's own pages print. */
  date: string;
  /** Rollout complete, same convention. Absent while still rolling out. */
  endDate?: string;
  /** Google's incident page. */
  url: string;
  /** Google's first announcement, in its own words. */
  summary: string;
};

export const STATUS_ORIGIN = "https://status.search.google.com";

/** The Ranking product's history page, which lists every incident. */
export const RANKING_HISTORY_URL = `${STATUS_ORIGIN}/products/rGHU1u87FJnkP6W2GwMi/history`;

export function classifyUpdate(name: string): RankingUpdateType {
  const t = name.toLowerCase();
  if (/core update/.test(t)) return "core";
  if (/spam update/.test(t)) return "spam";
  if (/helpful content/.test(t)) return "helpful_content";
  if (/reviews? update/.test(t)) return "product_review";
  if (/ongoing issue/.test(t)) return "issue";
  return "other";
}

const PACIFIC = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** An instant as the US/Pacific calendar date the dashboard would print. */
export function pacificDate(iso: string): string {
  return PACIFIC.format(new Date(iso));
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s*<https?:\/\/[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

type StatusIncident = {
  id?: string;
  begin?: string;
  end?: string | null;
  external_desc?: string;
  service_name?: string;
  updates?: { when?: string; created?: string; text?: string }[];
};

/**
 * The dashboard's incidents.json, which carries roughly the last year.
 * Throws on anything that is not a list — a changed format should show
 * up as a failed refresh, not as "no updates recently".
 */
export function updatesFromIncidentsJson(raw: unknown): RankingUpdate[] {
  if (!Array.isArray(raw)) {
    throw new Error("The Search Status Dashboard did not return a list of incidents.");
  }
  const out: RankingUpdate[] = [];
  for (const i of raw as StatusIncident[]) {
    if (i?.service_name !== "Ranking" || !i.id || !i.begin || !i.external_desc) continue;
    const first = [...(i.updates ?? [])].sort((a, b) =>
      (a.when ?? a.created ?? "").localeCompare(b.when ?? b.created ?? ""),
    )[0];
    out.push({
      id: i.id,
      name: i.external_desc.trim(),
      type: classifyUpdate(i.external_desc),
      date: pacificDate(i.begin),
      ...(i.end ? { endDate: pacificDate(i.end) } : {}),
      url: `${STATUS_ORIGIN}/incidents/${i.id}`,
      summary: plainText(first?.text ?? ""),
    });
  }
  return out;
}

/** Incident ids and names from the Ranking history page. */
export function parseHistoryPage(html: string): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const [row] of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const id = row.match(/href="[^"]*incidents\/([A-Za-z0-9]+)"/)?.[1];
    const firstCell = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/)?.[1];
    if (!id || !firstCell) continue;
    // The cell holds the name twice: the visible text and its tooltip.
    const name = plainText(firstCell).replace(/^(.+) \1$/, "$1");
    out.push({ id, name });
  }
  return out;
}

/**
 * Start, end and first announcement from one incident page.
 *
 * The page prints times without a zone and says "All times are
 * US/Pacific" once, below the table. If that line goes, the dates can no
 * longer be trusted to mean what the rest of this file says they mean,
 * so it throws rather than guess.
 */
export function parseIncidentPage(html: string): {
  date: string;
  endDate?: string;
  summary: string;
} {
  const body = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  if (!/All times are US\/Pacific/i.test(body)) {
    throw new Error("Incident page no longer states its time zone.");
  }
  const stamps = [...body.matchAll(/>\s*(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}\s*</g)].map((m) => m[1]);
  if (stamps.length === 0) throw new Error("No start time on the incident page.");
  // Newest first, so the announcement that opened the incident is last.
  const rows = [...body.matchAll(/<td class="description">([\s\S]*?)<\/td>/g)].map((m) =>
    plainText(m[1]),
  );
  return {
    date: stamps[0],
    ...(stamps[1] ? { endDate: stamps[1] } : {}),
    summary: rows.at(-1) ?? "",
  };
}
