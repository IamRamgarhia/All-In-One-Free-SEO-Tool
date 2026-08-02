/**
 * Pick the phrase on a page to turn into a link.
 *
 * The agent links orphan pages — pages nothing else on the site points at —
 * from whichever existing page is most similar. To do that it needs an
 * anchor: a run of words on the SOURCE page that reasonably describes the
 * TARGET page.
 *
 * This is deliberately deterministic. A model asked for an anchor returns
 * a plausible phrase every time, including phrases that appear nowhere on
 * the page — and an anchor that isn't in the text is either a no-op or,
 * worse, an invitation to insert text that was never written. Taking the
 * phrase from the page means the worst case is that we find nothing and
 * say so.
 *
 * It also means internal linking works with no AI key at all, which is
 * the point of this project.
 *
 * The approach: take the target page's title, strip stop-words, and look
 * for the longest run of consecutive title words that literally appears
 * in the source page's visible text. "Cold Process Soap Making Guide"
 * probably doesn't appear verbatim anywhere, but "cold process soap"
 * very well might.
 */

/**
 * Words too common to carry meaning in an anchor. Same list as the link
 * graph's scorer, kept separate on purpose: this one also drops words
 * that are fine for scoring but make poor anchors ("guide", "page").
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "how", "in", "is", "it", "its", "of", "on", "or", "our", "so", "than",
  "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "to", "up", "was", "we", "were", "what", "when", "where",
  "which", "who", "why", "will", "with", "you", "your",
]);

/** Words that describe the artefact rather than the subject. */
const FILLER = new Set([
  "guide", "page", "post", "article", "blog", "home", "index", "welcome",
  "overview", "introduction", "intro", "part", "chapter", "tips",
]);

export type AnchorChoice = {
  /** The exact text as it appears on the source page, casing preserved. */
  anchor: string;
  /** Words in the anchor. Longer is more specific, so more useful. */
  words: number;
};

/**
 * Strip HTML to the text a reader actually sees.
 *
 * Script, style, and the contents of existing anchors are removed —
 * the last of those because a phrase already inside a link is not
 * available to link again, and offering it would produce an anchor the
 * CMS then refuses.
 */
export function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ")
    .replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")
    .replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title words worth building an anchor from, in order. */
function titleWords(title: string): string[] {
  return title
    // Titles are routinely "Subject | Site Name" or "Subject - Site".
    // Everything after the separator is the site, not the subject.
    .split(/[|–—]|\s+-\s+/)[0]
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !FILLER.has(w));
}

/**
 * The longest phrase from `targetTitle` that appears in `sourceHtml`.
 *
 * Returns null when nothing suitable is found, which is a normal and
 * common outcome — two pages can be topically similar without sharing a
 * usable phrase. The caller reports it as a skip with a reason rather
 * than a failure.
 *
 * Anchors are capped at 6 words and 80 characters to match what the
 * plugin accepts, and floored at 2 words: a single word is rarely
 * descriptive enough to be a good link, and short common words match
 * almost anywhere, which is how auto-linkers produce nonsense.
 */
export function pickAnchor(
  sourceHtml: string,
  targetTitle: string,
  opts: { minWords?: number; maxWords?: number } = {},
): AnchorChoice | null {
  const minWords = opts.minWords ?? 2;
  const maxWords = opts.maxWords ?? 6;

  const words = titleWords(targetTitle);
  if (words.length < minWords) return null;

  const text = visibleText(sourceHtml);
  if (!text) return null;
  const haystack = text.toLowerCase();

  // Longest first: a more specific anchor is a better link, and a
  // 4-word phrase is far less likely to match by accident than a
  // 2-word one.
  for (let n = Math.min(maxWords, words.length); n >= minWords; n--) {
    for (let start = 0; start + n <= words.length; start++) {
      const phrase = words.slice(start, start + n).join(" ");
      if (phrase.length < 3 || phrase.length > 80) continue;

      const at = haystack.indexOf(phrase);
      if (at === -1) continue;

      // Whole words only. Without this, "soap" matches inside "soapstone"
      // and the link lands mid-word.
      const before = at === 0 ? " " : haystack[at - 1];
      const afterIdx = at + phrase.length;
      const after = afterIdx >= haystack.length ? " " : haystack[afterIdx];
      if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) {
        continue;
      }

      // Return the source page's own casing — the plugin preserves it,
      // and an anchor that re-cases the sentence reads as machine-written.
      return { anchor: text.slice(at, at + phrase.length), words: n };
    }
  }

  return null;
}
