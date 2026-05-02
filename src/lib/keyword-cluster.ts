/**
 * Lightweight keyword clustering: group keywords by shared meaningful tokens.
 *
 * Algorithm:
 *   1. Tokenize each keyword (lowercase, strip punctuation, split on whitespace)
 *   2. Drop English stopwords + very short tokens
 *   3. For each token that appears in ≥2 keywords, the keywords sharing it
 *      become a cluster
 *   4. Greedy assignment — each keyword goes into its largest matching cluster,
 *      and we drop clusters that fully overlap with bigger ones.
 *
 * Good enough for "auto-group similar tracked keywords." No ML, no embeddings.
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "were",
  "with",
  "what",
  "how",
  "why",
  "when",
  "where",
  "who",
  "which",
  "do",
  "does",
  "did",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "we",
  "they",
  "my",
  "your",
  "our",
  "their",
  "best",
  "top",
  "vs",
  "near",
  "me",
  "us",
]);

function tokenize(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length > 2)
    .filter((t) => !STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

export type Clusterable<T> = T & { id: number; query: string };

export type Cluster<T> = {
  topic: string;
  keywords: Clusterable<T>[];
};

export function clusterKeywords<T>(
  keywords: Clusterable<T>[],
): { clusters: Cluster<T>[]; ungrouped: Clusterable<T>[] } {
  if (keywords.length === 0) return { clusters: [], ungrouped: [] };

  // Build token -> keywords map
  const tokenToKeywords = new Map<string, Set<number>>();
  const keywordById = new Map<number, Clusterable<T>>();
  for (const kw of keywords) {
    keywordById.set(kw.id, kw);
    for (const t of tokenize(kw.query)) {
      const set = tokenToKeywords.get(t) ?? new Set<number>();
      set.add(kw.id);
      tokenToKeywords.set(t, set);
    }
  }

  // Filter to tokens shared by ≥2 keywords, sort by cluster size descending
  const candidateClusters = Array.from(tokenToKeywords.entries())
    .filter(([, ids]) => ids.size >= 2)
    .map(([token, ids]) => ({
      token,
      ids: Array.from(ids),
    }))
    .sort((a, b) => b.ids.length - a.ids.length);

  // Greedy assignment — first cluster wins for each keyword
  const assigned = new Set<number>();
  const finalClusters: Cluster<T>[] = [];
  for (const c of candidateClusters) {
    const fresh = c.ids.filter((id) => !assigned.has(id));
    if (fresh.length < 2) continue;
    for (const id of fresh) assigned.add(id);
    finalClusters.push({
      topic: c.token,
      keywords: fresh
        .map((id) => keywordById.get(id))
        .filter((k): k is Clusterable<T> => k !== undefined),
    });
  }

  const ungrouped = keywords.filter((k) => !assigned.has(k.id));
  return { clusters: finalClusters, ungrouped };
}
