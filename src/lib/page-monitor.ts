import { createHash } from "node:crypto";

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
  title: string | null;
  description: string | null;
  h1: string | null;
  canonical: string | null;
  contentHash: string;
};

export type FieldDiff = {
  field: "title" | "description" | "h1" | "canonical" | "content";
  oldValue: string | null;
  newValue: string | null;
};

export async function fetchSnapshot(rawUrl: string): Promise<Snapshot | null> {
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
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decode(titleMatch[1].trim()) : null;

    const description = extractMeta(html, "description");

    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h1 = h1Match
      ? decode(
          h1Match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        )
      : null;

    const canonicalMatch = html.match(
      /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
    );
    const canonical = canonicalMatch ? canonicalMatch[1].trim() : null;

    // Content hash: strip script/style/whitespace, hash the rest. Catches
    // meaningful body changes without false positives from cache busters.
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const contentHash = createHash("sha256")
      .update(stripped)
      .digest("hex")
      .slice(0, 32);

    return { title, description, h1, canonical, contentHash };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function diffSnapshots(
  prev: Partial<Snapshot> | null,
  next: Snapshot,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  if (!prev) return diffs; // first snapshot — nothing to diff against

  if (prev.title !== next.title) {
    diffs.push({
      field: "title",
      oldValue: prev.title ?? null,
      newValue: next.title,
    });
  }
  if (prev.description !== next.description) {
    diffs.push({
      field: "description",
      oldValue: prev.description ?? null,
      newValue: next.description,
    });
  }
  if (prev.h1 !== next.h1) {
    diffs.push({
      field: "h1",
      oldValue: prev.h1 ?? null,
      newValue: next.h1,
    });
  }
  if (prev.canonical !== next.canonical) {
    diffs.push({
      field: "canonical",
      oldValue: prev.canonical ?? null,
      newValue: next.canonical,
    });
  }
  if (prev.contentHash && prev.contentHash !== next.contentHash) {
    diffs.push({
      field: "content",
      oldValue: prev.contentHash,
      newValue: next.contentHash,
    });
  }

  return diffs;
}
