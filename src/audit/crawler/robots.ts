/**
 * Minimal robots.txt parser — User-agent groups + Disallow/Allow + Sitemap.
 */

export type RobotsPolicy = {
  raw: string;
  sitemaps: string[];
  isAllowed: (path: string, userAgent?: string) => boolean;
};

type Rule = { allow: boolean; path: string };

export function parseRobotsTxt(raw: string): RobotsPolicy {
  const sitemaps: string[] = [];
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;

  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      const agent = value.toLowerCase();
      if (current && current.rules.length === 0 && current.agents.length > 0) {
        current.agents.push(agent);
      } else {
        current = { agents: [agent], rules: [] };
        groups.push(current);
      }
      continue;
    }
    if (!current) continue;
    if (key === "disallow") {
      current.rules.push({ allow: false, path: value || "/" });
    } else if (key === "allow") {
      current.rules.push({ allow: true, path: value });
    }
  }

  function isAllowed(pathOnly: string, userAgent = "*"): boolean {
    const ua = userAgent.toLowerCase();
    let matched = groups.find((g) => g.agents.includes(ua));
    if (!matched) matched = groups.find((g) => g.agents.includes("*"));
    if (!matched || matched.rules.length === 0) return true;

    let decision: boolean | null = null;
    let bestLen = -1;
    for (const rule of matched.rules) {
      if (!rule.path) continue;
      if (pathOnly.startsWith(rule.path) && rule.path.length > bestLen) {
        bestLen = rule.path.length;
        decision = rule.allow;
      }
    }
    return decision ?? true;
  }

  return { raw, sitemaps, isAllowed };
}

export async function fetchRobotsTxt(
  origin: string,
  timeoutMs: number,
): Promise<RobotsPolicy | null> {
  try {
    const res = await fetch(new URL("/robots.txt", origin), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "SeoToolAuditBot/1.0" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return parseRobotsTxt(text);
  } catch {
    return null;
  }
}
