import { geoFetch } from "@/lib/geo-audit/fetch";
import { urljoin } from "@/lib/geo-audit/url-utils";

export const MAX_ROBOTS_BYTES = 512_000;
export const PRODUCT_TOKEN = "SeomatorGeoAudit";

export type RobotsRule = {
  allow: boolean;
  path: string;
  pattern: RegExp;
};

export type RobotsGroup = {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay: number | null;
};

export type RobotsFile = {
  sourceUrl: string;
  status: number | null;
  groups: RobotsGroup[];
  sitemaps: string[];
  unreachable: boolean;
  unavailable: boolean;
  error: string | null;
  text: string | null;
};

function compilePath(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = anchored ? path.slice(0, -1) : path;
  const parts = body.split("*").map((segment) =>
    segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const expression = `^${parts.join(".*")}${anchored ? "$" : ""}`;
  return new RegExp(expression);
}

function makeRule(allow: boolean, raw: string): RobotsRule | null {
  let path = raw.trim();
  if (!path) return null;
  if (!path.startsWith("/") && !path.startsWith("*")) {
    path = `/${path}`;
  }
  return { allow, path, pattern: compilePath(path) };
}

export function parseRobots(text: string, sourceUrl = "", status: number | null = 200): RobotsFile {
  const robots: RobotsFile = {
    sourceUrl,
    status,
    groups: [],
    sitemaps: [],
    unreachable: false,
    unavailable: false,
    error: null,
    text,
  };

  let group: RobotsGroup | null = null;
  let acceptingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line || !line.includes(":")) continue;
    const colon = line.indexOf(":");
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent" || key === "useragent") {
      if (!group || !acceptingAgents) {
        group = { agents: [], rules: [], crawlDelay: null };
        robots.groups.push(group);
        acceptingAgents = true;
      }
      if (value) group.agents.push(value);
      continue;
    }

    if (key === "sitemap") {
      if (value) {
        robots.sitemaps.push(sourceUrl ? urljoin(sourceUrl, value) : value);
      }
      continue;
    }

    if (!group) continue;
    acceptingAgents = false;

    if (key === "disallow") {
      const rule = makeRule(false, value);
      if (rule) group.rules.push(rule);
    } else if (key === "allow") {
      const rule = makeRule(true, value);
      if (rule) group.rules.push(rule);
    } else if (key === "crawl-delay") {
      const n = Number.parseFloat(value);
      if (!Number.isNaN(n)) group.crawlDelay = n;
    }
  }

  robots.groups = robots.groups.filter((g) => g.agents.length > 0);
  return robots;
}

export function robotsUrlFor(url: string): string {
  const u = new URL(url);
  return urljoin(`${u.protocol}//${u.host}`, "/robots.txt");
}

export async function loadRobots(
  url: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RobotsFile> {
  const target = robotsUrlFor(url);
  try {
    const result = await geoFetch(target, {
      timeoutMs: opts.timeoutMs ?? 10_000,
      maxBytes: MAX_ROBOTS_BYTES,
      signal: opts.signal,
      accept: "text/plain,*/*",
    });

    if (result.status >= 200 && result.status < 300) {
      return parseRobots(result.body, target, result.status);
    }
    if (result.status >= 400 && result.status < 500) {
      return {
        sourceUrl: target,
        status: result.status,
        groups: [],
        sitemaps: [],
        unreachable: false,
        unavailable: true,
        error: null,
        text: null,
      };
    }
    if (result.status >= 500) {
      return {
        sourceUrl: target,
        status: result.status,
        groups: [],
        sitemaps: [],
        unreachable: true,
        unavailable: false,
        error: null,
        text: null,
      };
    }
    return {
      sourceUrl: target,
      status: result.status,
      groups: [],
      sitemaps: [],
      unreachable: false,
      unavailable: true,
      error: null,
      text: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    const tooManyRedirects = msg.includes("Too many redirects");
    return {
      sourceUrl: target,
      status: null,
      groups: [],
      sitemaps: [],
      unreachable: !tooManyRedirects,
      unavailable: tooManyRedirects,
      error: msg,
      text: null,
    };
  }
}

function groupFor(robots: RobotsFile, agent: string): RobotsGroup | null {
  const token = agent.split("/")[0]?.trim().toLowerCase() ?? "";
  let best: RobotsGroup | null = null;
  let bestLen = -1;
  let wildcard: RobotsGroup | null = null;
  for (const group of robots.groups) {
    for (const candidate of group.agents) {
      const lowered = candidate.toLowerCase();
      if (lowered === "*") {
        wildcard ??= group;
        continue;
      }
      if (token.startsWith(lowered) && lowered.length > bestLen) {
        best = group;
        bestLen = lowered.length;
      }
    }
  }
  return best ?? wildcard;
}

export function robotsAllows(robots: RobotsFile, agent: string, path: string): boolean {
  if (robots.unreachable) return false;
  if (robots.unavailable || !robots.groups.length) return true;
  const group = groupFor(robots, agent);
  if (!group?.rules.length) return true;

  let target: string;
  try {
    target = decodeURIComponent(path || "/");
  } catch {
    target = path || "/";
  }

  let winner: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!rule.pattern.test(target)) continue;
    if (!winner) {
      winner = rule;
      continue;
    }
    if (rule.path.length > winner.path.length) {
      winner = rule;
    } else if (rule.path.length === winner.path.length && rule.allow) {
      winner = rule;
    }
  }
  return winner ? winner.allow : true;
}

export function selfAllows(robots: RobotsFile, path: string): boolean {
  return robotsAllows(robots, PRODUCT_TOKEN, path);
}
