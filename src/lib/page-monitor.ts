import { createHash } from "node:crypto";

/**
 * What changed on a monitored page, and how much it matters.
 *
 * Severity follows the drift rules in claude-seo (MIT): a change that
 * takes a page out of search — an error status, a noindex, a removed
 * canonical, title, H1 or structured data — is critical; a change that
 * may be intended is a warning; an addition is information.
 *
 * Before this, a page that started answering 404 or 500 produced no
 * snapshot at all, so the monitor recorded nothing for the change that
 * matters most, and a noindex added to a page was not looked at.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractMeta(html: string, name: string): string | null {
  const re1 = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1) return decode(m1[1].trim());
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decode(m2[1].trim()) : null;
}

export type Snapshot = {
  /** Final HTTP status, after redirects. */
  status: number;
  title: string | null;
  description: string | null;
  h1: string | null;
  canonical: string | null;
  /**
   * Robots directives from the robots and googlebot meta tags and the
   * X-Robots-Tag header, lower-cased, de-duplicated and sorted:
   * "follow, noindex". Null when none are set.
   */
  robots: string | null;
  /** JSON-LD @type values, sorted: "LocalBusiness, Organization". Null when there is none. */
  schemaTypes: string | null;
  /** Hash of the JSON-LD blocks with whitespace collapsed. Null when there is none. */
  schemaHash: string | null;
  contentHash: string;
};

export type ChangeField =
  | "status"
  | "title"
  | "description"
  | "h1"
  | "canonical"
  | "robots"
  | "schema"
  | "content";

export type ChangeSeverity = "critical" | "warning" | "info";

export type FieldDiff = {
  field: ChangeField;
  oldValue: string | null;
  newValue: string | null;
  severity: ChangeSeverity;
  /** One plain sentence on why this severity. */
  reason: string;
};

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** Directives written as name:value, whose name is not a crawler's. */
const DIRECTIVE_WITH_VALUE = /^(max-snippet|max-image-preview|max-video-preview|unavailable_after)\s*:/;

function robotsDirectives(html: string, header: string | null): string | null {
  const tokens = new Set<string>();
  const add = (value: string | null) => {
    for (const raw of (value ?? "").split(",")) {
      let token = raw.trim().toLowerCase();
      // X-Robots-Tag may name a crawler first: "googlebot: noindex". A
      // directive that takes a value is not one — stripping the name from
      // "max-snippet:-1", which WordPress SEO plugins send on every page,
      // left a bare "-1" (caught on a live site).
      if (!DIRECTIVE_WITH_VALUE.test(token)) token = token.replace(/^[a-z0-9_-]+\s*:\s*/, "");
      token = token.replace(/\s*:\s*/, ":");
      if (token) tokens.add(token);
    }
  };
  add(extractMeta(html, "robots"));
  add(extractMeta(html, "googlebot"));
  add(header);
  return tokens.size > 0 ? [...tokens].sort().join(", ") : null;
}

function structuredData(html: string): { types: string | null; hash: string | null } {
  const blocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1].replace(/\s+/g, " ").trim());
  if (blocks.length === 0) return { types: null, hash: null };
  const types = new Set<string>();
  for (const block of blocks) {
    for (const m of block.matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]*")/g)) {
      for (const t of m[1].matchAll(/"([^"]+)"/g)) types.add(t[1]);
    }
  }
  return {
    types: types.size > 0 ? [...types].sort().join(", ") : null,
    hash: hash(blocks.join("\n")),
  };
}

/** Build a snapshot from a response. Pure, so it can be tested on HTML. */
export function snapshotFromHtml(
  html: string,
  status: number,
  robotsHeader: string | null = null,
): Snapshot {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
  );
  // Content hash: strip script/style/whitespace, hash the rest. Catches
  // meaningful body changes without false positives from cache busters.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const schema = structuredData(html);
  return {
    status,
    title: titleMatch ? decode(titleMatch[1].trim()) : null,
    description: extractMeta(html, "description"),
    h1: h1Match
      ? decode(h1Match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      : null,
    canonical: canonicalMatch ? canonicalMatch[1].trim() : null,
    robots: robotsDirectives(html, robotsHeader),
    schemaTypes: schema.types,
    schemaHash: schema.hash,
    contentHash: hash(stripped),
  };
}

/**
 * Fetch a page's snapshot. An error status still yields a snapshot —
 * that is a change to record. Only a page that could not be reached at
 * all fails, because then nothing is known about it.
 */
export async function fetchSnapshot(
  rawUrl: string,
): Promise<{ ok: true; snapshot: Snapshot } | { ok: false; error: string }> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: c.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();
    return {
      ok: true,
      snapshot: snapshotFromHtml(html, res.status, res.headers.get("x-robots-tag")),
    };
  } catch (err) {
    return { ok: false, error: `Couldn't reach the page: ${(err as Error).message}` };
  } finally {
    clearTimeout(t);
  }
}

/**
 * How alike two strings are, 0 to 1: the Dice coefficient over character
 * pairs. Stands in for the SequenceMatcher ratio claude-seo uses to call
 * an H1 rewrite substantial.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const pairs = (s: string) => {
    const t = s.toLowerCase().replace(/\s+/g, " ").trim();
    const m = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) {
      const g = t.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = pairs(a);
  const B = pairs(b);
  let total = 0;
  for (const n of A.values()) total += n;
  for (const n of B.values()) total += n;
  let shared = 0;
  for (const [g, n] of A) shared += Math.min(n, B.get(g) ?? 0);
  return total === 0 ? 0 : (2 * shared) / total;
}

const isError = (status: number) => status >= 400;
const blocksIndexing = (robots: string | null | undefined) =>
  /(^|, )(noindex|none)(,|$)/.test(robots ?? "");

/**
 * Compare a stored snapshot with a new one.
 *
 * `prev.status` undefined marks a snapshot stored before status, robots
 * and structured data were recorded. Those fields are then not compared:
 * "noindex added" against a value that was never read would be an alarm
 * about the upgrade, not about the page.
 */
export function diffSnapshots(prev: Partial<Snapshot> | null, next: Snapshot): FieldDiff[] {
  if (!prev) return []; // first snapshot — nothing to diff against
  const diffs: FieldDiff[] = [];
  const legacy = prev.status === undefined;
  const prevStatus = prev.status ?? 200;

  if (!legacy && prevStatus !== next.status) {
    if (isError(next.status) && !isError(prevStatus)) {
      // Nothing else on an error page is worth comparing.
      return [
        {
          field: "status",
          oldValue: String(prevStatus),
          newValue: String(next.status),
          severity: "critical",
          reason: `The page now answers HTTP ${next.status}. Google drops pages that keep returning errors from its results.`,
        },
      ];
    }
    if (isError(next.status)) {
      return [
        {
          field: "status",
          oldValue: String(prevStatus),
          newValue: String(next.status),
          severity: "info",
          reason: "Still an error, with a different status code.",
        },
      ];
    }
    diffs.push({
      field: "status",
      oldValue: String(prevStatus),
      newValue: String(next.status),
      severity: isError(prevStatus) ? "info" : "warning",
      reason: isError(prevStatus)
        ? "The page loads again."
        : `The status changed from ${prevStatus} to ${next.status}.`,
    });
  } else if (isError(next.status)) {
    // Same error as last time, or a legacy snapshot on an error page:
    // nothing new to say and no fields to compare.
    return [];
  }

  const text = (
    field: "title" | "description" | "canonical",
    removed: ChangeSeverity,
    changed: ChangeSeverity,
    label: string,
    why: string,
  ) => {
    const was = prev[field] ?? null;
    const now = next[field];
    if (was === now) return;
    if (was && !now) {
      diffs.push({ field, oldValue: was, newValue: null, severity: removed, reason: `${label} removed. ${why}` });
    } else if (!was && now) {
      diffs.push({ field, oldValue: null, newValue: now, severity: "info", reason: `${label} added.` });
    } else {
      diffs.push({ field, oldValue: was, newValue: now, severity: changed, reason: `${label} changed.` });
    }
  };

  text("title", "critical", "warning", "Title", "Google writes its own title link when a page has none.");
  text("description", "warning", "warning", "Meta description", "Google picks a snippet from the page instead.");
  text(
    "canonical",
    "critical",
    "critical",
    "Canonical",
    "Google chooses the canonical itself when the page does not declare one.",
  );
  // A changed canonical points ranking signals at another URL, so it is as
  // serious as a removed one. The generic "changed." is not enough there.
  const last = diffs.at(-1);
  if (last?.field === "canonical" && last.oldValue && last.newValue) {
    last.reason = "Canonical now points at a different URL, which asks Google to credit that URL instead.";
  }

  const wasH1 = prev.h1 ?? null;
  if (wasH1 !== next.h1) {
    if (wasH1 && !next.h1) {
      diffs.push({ field: "h1", oldValue: wasH1, newValue: null, severity: "critical", reason: "The page no longer has an H1." });
    } else if (!wasH1 && next.h1) {
      diffs.push({ field: "h1", oldValue: null, newValue: next.h1, severity: "info", reason: "H1 added." });
    } else if (wasH1 && next.h1) {
      const rewritten = similarity(wasH1, next.h1) < 0.5;
      diffs.push({
        field: "h1",
        oldValue: wasH1,
        newValue: next.h1,
        severity: rewritten ? "critical" : "warning",
        reason: rewritten ? "The H1 was rewritten, not edited — check it still matches what the page targets." : "H1 edited.",
      });
    }
  }

  if (!legacy) {
    const wasRobots = prev.robots ?? null;
    if (wasRobots !== next.robots) {
      const nowBlocks = blocksIndexing(next.robots);
      const wasBlocked = blocksIndexing(wasRobots);
      diffs.push({
        field: "robots",
        oldValue: wasRobots,
        newValue: next.robots,
        severity: nowBlocks && !wasBlocked ? "critical" : "warning",
        reason:
          nowBlocks && !wasBlocked
            ? "noindex added. Google drops the page from its results when it next crawls it."
            : wasBlocked && !nowBlocks
              ? "noindex removed. The page can be indexed again — check that was intended."
              : "Robots directives changed.",
      });
    }

    const wasSchema = prev.schemaHash ?? null;
    if (wasSchema !== next.schemaHash) {
      if (wasSchema && !next.schemaHash) {
        diffs.push({ field: "schema", oldValue: prev.schemaTypes ?? null, newValue: null, severity: "critical", reason: "All structured data removed. Rich results that depended on it will stop showing." });
      } else if (!wasSchema && next.schemaHash) {
        diffs.push({ field: "schema", oldValue: null, newValue: next.schemaTypes, severity: "info", reason: "Structured data added." });
      } else {
        diffs.push({ field: "schema", oldValue: prev.schemaTypes ?? null, newValue: next.schemaTypes, severity: "warning", reason: "Structured data changed. Validate it before assuming rich results still qualify." });
      }
    }
  }

  if (prev.contentHash && prev.contentHash !== next.contentHash) {
    diffs.push({
      field: "content",
      oldValue: prev.contentHash,
      newValue: next.contentHash,
      severity: "info",
      reason: "Body text changed.",
    });
  }

  return diffs;
}
