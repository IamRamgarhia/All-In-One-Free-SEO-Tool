"use server";

export type RedditPost = {
  title: string;
  url: string;
  permalink: string;
  subreddit: string;
  score: number;
  numComments: number;
  selftext: string;
  createdAt: Date;
  author: string;
};

export type RedditResearchResult =
  | {
      ok: true;
      query: string;
      posts: RedditPost[];
      questions: string[];
      topSubreddits: { name: string; count: number }[];
    }
  | { ok: false; error: string };

/**
 * Reddit's free public JSON endpoint — no auth, no API key.
 * https://www.reddit.com/search.json?q=...&sort=relevance&limit=100
 *
 * Per CLAUDE.md §5: "Reddit API (free tier) — niche keyword discovery".
 * We use the .json endpoint which doesn't require an OAuth app, just a
 * sane User-Agent string.
 */
export async function searchReddit(opts: {
  query: string;
  subreddit?: string;
  sort?: "relevance" | "new" | "top" | "comments";
  time?: "all" | "year" | "month" | "week";
}): Promise<RedditResearchResult> {
  if (!opts.query.trim()) return { ok: false, error: "Query required" };

  const sort = opts.sort ?? "relevance";
  const time = opts.time ?? "year";
  const sub = opts.subreddit?.trim();
  const base = sub
    ? `https://www.reddit.com/r/${encodeURIComponent(sub)}/search.json`
    : `https://www.reddit.com/search.json`;
  const url = `${base}?q=${encodeURIComponent(opts.query)}&sort=${sort}&t=${time}&limit=100${sub ? "&restrict_sr=on" : ""}`;

  let res: Response;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12_000);
    res = await fetch(url, {
      signal: c.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost) Reddit-research",
        accept: "application/json",
      },
    });
    clearTimeout(t);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  if (!res.ok) {
    if (res.status === 429) {
      return {
        ok: false,
        error: "Reddit rate-limited the request. Wait a few minutes and try again.",
      };
    }
    return { ok: false, error: `Reddit returned ${res.status}` };
  }

  type RedditChildData = {
    title?: string;
    url?: string;
    permalink?: string;
    subreddit?: string;
    score?: number;
    num_comments?: number;
    selftext?: string;
    created_utc?: number;
    author?: string;
  };
  type RedditResp = {
    data?: { children?: { data?: RedditChildData }[] };
  };
  const data = (await res.json()) as RedditResp;
  const children = data.data?.children ?? [];

  const posts: RedditPost[] = children
    .map((c) => c.data ?? {})
    .filter((d): d is RedditChildData & { title: string } => Boolean(d.title))
    .map((d) => ({
      title: d.title!,
      url: d.url ?? "",
      permalink: d.permalink
        ? `https://www.reddit.com${d.permalink}`
        : "",
      subreddit: d.subreddit ?? "",
      score: d.score ?? 0,
      numComments: d.num_comments ?? 0,
      selftext: (d.selftext ?? "").slice(0, 400),
      createdAt: new Date((d.created_utc ?? 0) * 1000),
      author: d.author ?? "",
    }));

  // Extract questions — titles ending with ? are gold for content briefs
  const questions = Array.from(
    new Set(
      posts
        .map((p) => p.title)
        .filter((t) => /\?\s*$/.test(t))
        .map((t) => t.replace(/\s+/g, " ").trim()),
    ),
  ).slice(0, 30);

  // Top subreddits where this query is discussed
  const subCounts = new Map<string, number>();
  for (const p of posts) {
    if (!p.subreddit) continue;
    subCounts.set(p.subreddit, (subCounts.get(p.subreddit) ?? 0) + 1);
  }
  const topSubreddits = [...subCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { ok: true, query: opts.query, posts, questions, topSubreddits };
}
