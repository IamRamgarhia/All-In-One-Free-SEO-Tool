/**
 * AI outreach personalizer. Hand it a prospect URL + your generic
 * template. We fetch the prospect's site, extract recent posts and topical
 * signals, then ask the LLM to rewrite the template with one or two
 * sentences of genuine personalization at the top — referencing
 * something specific from their site.
 *
 * The goal: turn a 2% reply rate into 15% by stripping the obvious
 * template feel.
 */

import { callAI, lastAiFailure } from "./ai-call";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type PersonalizedEmail = {
  subject: string;
  body: string;
  signals: string[];
};

export type PersonalizeResult =
  | { ok: true; email: PersonalizedEmail; prospectName: string | null }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You personalise cold outreach emails. The user gives you a prospect's site, the topics they recently published on, and the user's generic template. Output ONE rewritten email with:

- A specific opener line (≤2 sentences) that references something concrete from the prospect's content. NOT "I love your blog" — something like "Your piece on X-Y last week noted that Z; that's exactly the angle our audience cares about."
- Keep the user's core ask intact, but improve flow and tone if needed
- Signature stays as in the template
- ≤180 words total
- No fake compliments, no "huge fan" energy

Output JSON only:
{
  "subject": "<rewritten subject — ≤55 chars, specific>",
  "body": "<full email body, plain text with single line breaks for paragraphs>",
  "signals": ["<2-4 specific things from their site you used to personalise>"]
}`;

export async function personalizeOutreach(opts: {
  prospectUrl: string;
  template: string;
  templateSubject?: string;
  senderName?: string;
  goal?: string;
  clientId?: number | null;
}): Promise<PersonalizeResult> {
  if (!opts.template.trim()) {
    return { ok: false, error: "Template is empty." };
  }
  const facts = await fetchProspectFacts(opts.prospectUrl);
  if (!facts) {
    return {
      ok: false,
      error: "Couldn't fetch the prospect's site. Check the URL.",
    };
  }

  const userPrompt = [
    `Prospect URL: ${opts.prospectUrl}`,
    `Prospect site name: ${facts.siteName ?? "(unknown)"}`,
    `Prospect tagline / about: ${facts.tagline ?? "(none)"}`,
    `Recent post titles (top 8): ${facts.recentPosts.slice(0, 8).join(" | ") || "(none detected)"}`,
    `Topical signals: ${facts.topicalSignals.slice(0, 12).join(", ") || "(none)"}`,
    "",
    `Sender name: ${opts.senderName ?? "(no name given)"}`,
    `Goal: ${opts.goal ?? "(general outreach)"}`,
    `Subject (template): ${opts.templateSubject ?? "(none — generate one)"}`,
    "",
    `Template body:`,
    opts.template,
    "",
    "Rewrite the email with personalised opener. JSON object only.",
  ].join("\n");

  const raw = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 700,
    temperature: 0.5,
    timeoutMs: 30_000,
    feature: "general",
    clientId: opts.clientId ?? null,
  });
  if (!raw) {
    return {
      ok: false,
      error: lastAiFailure()?.message ?? "AI provider didn't respond. Configure a key in Settings.",
    };
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { ok: false, error: "AI returned an unexpected format." };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      subject?: unknown;
      body?: unknown;
      signals?: unknown;
    };
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      return { ok: false, error: "AI response missing required fields." };
    }
    return {
      ok: true,
      email: {
        subject: parsed.subject.trim(),
        body: parsed.body.trim(),
        signals: Array.isArray(parsed.signals)
          ? (parsed.signals as unknown[]).filter(
              (s): s is string => typeof s === "string",
            )
          : [],
      },
      prospectName: facts.siteName,
    };
  } catch {
    return { ok: false, error: "Couldn't parse AI response." };
  }
}

type ProspectFacts = {
  siteName: string | null;
  tagline: string | null;
  recentPosts: string[];
  topicalSignals: string[];
};

async function fetchProspectFacts(url: string): Promise<ProspectFacts | null> {
  const html = await fetchHtml(url);
  if (!html) return null;

  // Site name from <title> or og:site_name
  const ogSite = html.match(
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
  )?.[1];
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const siteName = ogSite ?? titleM?.split(/[-—|]/)[0]?.trim() ?? null;

  const descM =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    )?.[1];

  // Recent posts — try article tags first, fall back to h2/h3 inside main
  const recentPosts: string[] = [];
  for (const m of html.matchAll(
    /<article[^>]*>[\s\S]*?<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi,
  )) {
    const t = stripTags(m[1]).trim();
    if (t && t.length > 10 && t.length < 200) recentPosts.push(t);
    if (recentPosts.length >= 12) break;
  }
  if (recentPosts.length === 0) {
    for (const m of html.matchAll(
      /<a[^>]+href=["']([^"']+)["'][^>]*>(<[^>]+>)*([^<]{15,180})/gi,
    )) {
      const t = m[3].trim();
      if (
        /^[A-Z]/.test(t) &&
        !/log[ -]?in|sign[ -]?up|home|about|contact|privacy|terms/i.test(t)
      ) {
        recentPosts.push(t);
        if (recentPosts.length >= 12) break;
      }
    }
  }

  // Topical signals — most-frequent meaningful keywords from text
  const text = stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "))
    .replace(/\s+/g, " ")
    .toLowerCase();
  const topicalSignals = topNgrams(text, 12);

  return {
    siteName: siteName?.trim() ?? null,
    tagline: descM?.trim() ?? null,
    recentPosts: dedupe(recentPosts).slice(0, 12),
    topicalSignals,
  };
}

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function topNgrams(text: string, n: number): string[] {
  const stop = new Set([
    "the","and","for","with","from","that","this","your","you","our","are","was",
    "were","have","has","not","will","also","they","their","them","but","can",
    "all","any","one","two","new","more","most","other","some","such","when",
    "where","what","how","why","who","which","than","then","into","over","under",
    "out","off","get","got","just","only","very","much","many","each","every",
  ]);
  const words = text.replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
  const counts = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i],
      b = words[i + 1];
    if (a.length < 4 || b.length < 4) continue;
    if (stop.has(a) || stop.has(b)) continue;
    const k = `${a} ${b}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

async function fetchHtml(url: string): Promise<string | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}
