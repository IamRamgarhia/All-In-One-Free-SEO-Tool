/**
 * Order discovered keywords by how much they speak the client's business.
 *
 * Discovery returns its keywords in the order its sources produced them,
 * every one with the same score, and the wizard pre-ticks the first 12. On
 * nd-prestige.com (a chauffeur in Paris) those were "circuits touristiques
 * dans le cantal / en algérie / au canada…": the first seed's Google
 * suggestions, while "mise à disposition chauffeur paris" or "taxi aéroport
 * d'Orly" sat further down.
 *
 * Here each keyword scores the number of distinct words it shares with what
 * the user said about the business at the first step (description,
 * business type, city): accents and case ignored, plural or verb endings
 * folded (first six letters of a long word), small words dropped. A stable
 * sort keeps discovery's own order among equals. Nothing is removed: the
 * user still sees all of them.
 *
 * Pure.
 */

const STOPWORDS = new Set([
  // fr
  "les", "des", "une", "aux", "avec", "pour", "par", "sur", "dans", "sous", "chez", "vos", "nos", "votre",
  "notre", "leur", "est", "sont", "qui", "que", "quoi", "dont", "plus", "tout", "tous", "toute", "toutes",
  "entre", "vers", "sans", "ses", "son", "sa", "ces", "cet", "cette", "pas", "mais", "ou", "et",
  // en
  "the", "and", "for", "with", "from", "your", "our", "you", "are", "all", "any", "near", "best", "top",
]);

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Comparable forms of the meaningful words of a text. */
export function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of fold(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    // Plural folded first, so "gares" meets "gare" and "circuits" "circuit".
    const w = raw.length >= 4 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
    out.add(w.length >= 6 ? w.slice(0, 6) : w);
  }
  return out;
}

/**
 * Searches that bring no customer: people looking for a job in the trade,
 * training, the regulator's paperwork, news. On nd-prestige.com the first
 * pre-ticked keywords became "chauffeur vtc paris salaire / emploi / indeed
 * / accident" once the site's own words were matched. They stay listed, last.
 */
const NO_CUSTOMER = new Set(
  [
    "salaire", "emploi", "emplois", "indeed", "recrutement", "recrute", "embauche", "job", "jobs",
    "formation", "devenir", "examen", "permis", "licence", "accident", "greve", "statut", "wikipedia",
    "definition", "salary", "career", "careers", "hiring", "training", "course", "news",
  ].map((w) => [...stems(w)][0] ?? w),
);

export function relevanceScore(query: string, context: ReadonlySet<string>): number {
  let n = 0;
  const words = stems(query);
  for (const s of words) if (context.has(s)) n++;
  for (const s of words) if (NO_CUSTOMER.has(s)) n -= 3;
  return n;
}

export function rankByRelevance<T extends { query: string }>(
  keywords: readonly T[],
  about: { description?: string | null; businessType?: string | null; city?: string | null; name?: string | null },
): T[] {
  const context = stems([about.description, about.businessType, about.city].filter(Boolean).join(" "));
  // The brand name is not a topic: "nd prestige" would lift anything with "prestige".
  for (const s of stems(about.name ?? "")) context.delete(s);
  if (context.size === 0) return [...keywords];
  return keywords
    .map((k, i) => ({ k, i, s: relevanceScore(k.query, context) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.k);
}
