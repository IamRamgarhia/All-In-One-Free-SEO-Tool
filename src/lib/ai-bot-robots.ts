/**
 * AI-bot robots.txt audit.
 *
 * As of 2026 there are 10+ major AI crawlers that ignore a plain
 * `User-agent: *` block for opt-out purposes. Sites that haven't
 * explicitly named them in `robots.txt` are either:
 *   (a) letting their content flow into every LLM training corpus
 *   (b) OR blocking them all by accident via an over-broad rule
 *
 * This module fetches a target's robots.txt, parses out the
 * User-agent groups, and reports which of the known AI bots have
 * explicit rules (allow / disallow) vs are treated by the default
 * `*` group vs missing entirely.
 *
 * Plus emits a copy-paste patch block the user can drop into
 * their robots.txt with the recommended rules.
 */

import { guardedFetch } from "./url-guard";

/**
 * Canonical list of AI bot User-Agent strings. Kept in one place so
 * every UI + report reads the same list.
 * Sources:
 *   - Anthropic docs (ClaudeBot, claude-web, ClaudeUser)
 *   - OpenAI docs (GPTBot, OAI-SearchBot, ChatGPT-User)
 *   - Google docs (Google-Extended)
 *   - Perplexity docs (PerplexityBot)
 *   - Bytedance docs (Bytespider)
 *   - Common Crawl (CCBot)
 *   - Apple docs (Applebot-Extended)
 *   - Meta docs (Meta-ExternalAgent, FacebookBot)
 *   - Amazon (Amazonbot)
 *   - Diffbot (Diffbot)
 */
export const AI_BOTS = [
  {
    ua: "GPTBot",
    vendor: "OpenAI",
    purpose: "Training data for ChatGPT / GPT models",
    docs: "https://platform.openai.com/docs/gptbot",
  },
  {
    ua: "OAI-SearchBot",
    vendor: "OpenAI",
    purpose: "Indexing for ChatGPT search",
    docs: "https://platform.openai.com/docs/bots",
  },
  {
    ua: "ChatGPT-User",
    vendor: "OpenAI",
    purpose: "On-demand fetch when a ChatGPT user asks about a URL",
    docs: "https://platform.openai.com/docs/bots",
  },
  {
    ua: "ClaudeBot",
    vendor: "Anthropic",
    purpose: "Training data for Claude",
    docs: "https://support.anthropic.com/en/articles/8896518",
  },
  {
    ua: "claude-web",
    vendor: "Anthropic",
    purpose: "Older Claude web-fetching UA (legacy but still seen)",
    docs: "https://support.anthropic.com/en/articles/8896518",
  },
  {
    ua: "Google-Extended",
    vendor: "Google",
    purpose: "Training + grounding for Gemini / Bard / AI Overviews",
    docs: "https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers#google-extended",
  },
  {
    ua: "PerplexityBot",
    vendor: "Perplexity",
    purpose: "Indexing + on-demand fetch for Perplexity",
    docs: "https://docs.perplexity.ai/guides/bots",
  },
  {
    ua: "Bytespider",
    vendor: "ByteDance / TikTok",
    purpose: "Training data for Doubao / TikTok AI",
    docs: "https://developer.bytedance.com/en/docs/bytespider",
  },
  {
    ua: "CCBot",
    vendor: "Common Crawl",
    purpose: "Foundational dataset used by nearly every open LLM",
    docs: "https://commoncrawl.org/big-picture/frequently-asked-questions/",
  },
  {
    ua: "Applebot-Extended",
    vendor: "Apple",
    purpose: "Training data for Apple Intelligence models",
    docs: "https://support.apple.com/en-us/119829",
  },
  {
    ua: "Amazonbot",
    vendor: "Amazon",
    purpose: "Rufus / Alexa AI + Amazon search",
    docs: "https://developer.amazon.com/amazonbot",
  },
  {
    ua: "Meta-ExternalAgent",
    vendor: "Meta",
    purpose: "Training data for Llama / Meta AI",
    docs: "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
  },
  {
    ua: "FacebookBot",
    vendor: "Meta",
    purpose: "Older Meta AI training crawler",
    docs: "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
  },
  {
    ua: "cohere-ai",
    vendor: "Cohere",
    purpose: "Training + indexing for Cohere models",
    docs: "https://docs.cohere.com/docs/data-collection",
  },
  {
    ua: "Diffbot",
    vendor: "Diffbot",
    purpose: "Knowledge-graph extraction used by many LLM tools",
    docs: "https://www.diffbot.com/support/",
  },
] as const;

export type AiBotInfo = (typeof AI_BOTS)[number];

export type BotStatus = {
  ua: string;
  vendor: string;
  purpose: string;
  docs: string;
  /**
   * "explicit-allow" — an Allow: / (or equivalent) rule directly
   *                    references this UA and permits crawling
   * "explicit-block" — Disallow: / directly references this UA
   * "star-default"   — no rule for this UA, so falls under
   *                    User-agent: * (which may still block via Disallow)
   * "missing"        — no rule AND no wildcard group either
   */
  status: "explicit-allow" | "explicit-block" | "star-default" | "missing";
  /** Whether this UA is effectively blocked from crawling. */
  effectivelyBlocked: boolean;
};

export type RobotsAudit = {
  ok: true;
  url: string;
  fetchedAt: string;
  rawBytes: number;
  bots: BotStatus[];
  /** Whether the wildcard * group exists AND has a Disallow: / */
  starDisallowsAll: boolean;
  /** Patch block the user can drop into their robots.txt */
  suggestedPatch: string;
  /** Count of AI bots with no explicit rule (either allow OR disallow) */
  unaddressedCount: number;
} | {
  ok: false;
  url: string;
  error: string;
};

/**
 * Fetch + audit robots.txt for AI-bot coverage.
 */
export async function auditAiBotRobots(siteUrl: string): Promise<RobotsAudit> {
  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    return { ok: false, url: siteUrl, error: "Invalid URL" };
  }
  const robotsUrl = new URL("/robots.txt", base).toString();

  let body: string;
  try {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), 8000);
    const res = await guardedFetch(robotsUrl, {
      signal: ctl.signal,
      headers: { accept: "text/plain,*/*" },
    });
    clearTimeout(tid);
    if (!res.ok) {
      return {
        ok: false,
        url: robotsUrl,
        error: `HTTP ${res.status} — no robots.txt at ${robotsUrl}`,
      };
    }
    body = await res.text();
  } catch (err) {
    return { ok: false, url: robotsUrl, error: (err as Error).message };
  }

  // Parse the file into per-user-agent groups. robots.txt groups are
  // introduced by one or more `User-agent:` lines followed by rules
  // (Allow, Disallow, Sitemap etc.) until the next User-agent block.
  const groups = parseRobots(body);
  const starGroup = groups.find((g) => g.userAgents.includes("*"));
  const starDisallowsAll = !!starGroup && starGroup.disallow.includes("/");

  const bots: BotStatus[] = AI_BOTS.map((bot) => {
    const uaLower = bot.ua.toLowerCase();
    const explicit = groups.find((g) =>
      g.userAgents.map((u) => u.toLowerCase()).includes(uaLower),
    );
    if (explicit) {
      const blocked = explicit.disallow.includes("/");
      return {
        ...bot,
        status: blocked ? "explicit-block" : "explicit-allow",
        effectivelyBlocked: blocked,
      };
    }
    if (starGroup) {
      return {
        ...bot,
        status: "star-default",
        effectivelyBlocked: starDisallowsAll,
      };
    }
    return { ...bot, status: "missing", effectivelyBlocked: false };
  });

  const unaddressedCount = bots.filter(
    (b) => b.status === "star-default" || b.status === "missing",
  ).length;

  return {
    ok: true,
    url: robotsUrl,
    fetchedAt: new Date().toISOString(),
    rawBytes: body.length,
    bots,
    starDisallowsAll,
    suggestedPatch: buildSuggestedPatch(bots),
    unaddressedCount,
  };
}

type RobotsGroup = {
  userAgents: string[];
  disallow: string[];
  allow: string[];
};

function parseRobots(text: string): RobotsGroup[] {
  const lines = text.split(/\r?\n/);
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sameGroupUserAgents = false;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      sameGroupUserAgents = false;
      continue;
    }
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (current && sameGroupUserAgents) {
        current.userAgents.push(value);
      } else {
        current = { userAgents: [value], disallow: [], allow: [] };
        groups.push(current);
        sameGroupUserAgents = true;
      }
    } else if (current) {
      sameGroupUserAgents = false;
      if (field === "disallow") current.disallow.push(value);
      else if (field === "allow") current.allow.push(value);
    }
  }
  return groups;
}

function buildSuggestedPatch(bots: BotStatus[]): string {
  // Only include bots that are currently "unaddressed" — no explicit
  // rule. For those, default to Disallow: / (block from LLM training)
  // since that's what most content owners want in 2026. The user can
  // edit the copy-paste block to change any bot back to Allow.
  const unaddressed = bots.filter(
    (b) => b.status === "star-default" || b.status === "missing",
  );
  if (unaddressed.length === 0) return "";
  const lines: string[] = [
    "# ---- AI bots — added by All-In-One Free SEO Tool ----",
    "# Default is Disallow to opt out of LLM training. Delete a block",
    "# below (or flip Disallow: to Allow:) to permit specific bots.",
    "# UA docs: hover / click the vendor name in the audit UI.",
    "",
  ];
  for (const b of unaddressed) {
    lines.push(`# ${b.vendor} — ${b.purpose}`);
    lines.push(`User-agent: ${b.ua}`);
    lines.push("Disallow: /");
    lines.push("");
  }
  return lines.join("\n");
}
