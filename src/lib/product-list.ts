/**
 * Reading a list of products out of a business description.
 *
 * The seed generator slid a two-word window over the description after
 * stripping punctuation, which on a real client produced "tissue
 * polyester" — two words adjacent only because the comma between them
 * had been deleted. Nobody searches that. Fed into Google autocomplete
 * it returns nothing useful, so twelve of twelve discovered keywords
 * were wrong.
 *
 * Descriptions of what a company sells are overwhelmingly written as a
 * list sharing one head noun:
 *
 *   "BOPP, double-sided tissue, PTK®, polyester & kraft adhesive tapes"
 *
 * That is four products, not a word soup: BOPP adhesive tape,
 * double-sided tissue adhesive tape, polyester adhesive tape, kraft
 * adhesive tape. Each one is a real search a buyer performs. The
 * punctuation carries the meaning, so this reads it before it is thrown
 * away.
 */

/** Head nouns can be two words ("adhesive tapes") or one ("tapes"). */
const MAX_HEAD_WORDS = 2;

/**
 * Words that end a list rather than belong to it — the sentence has
 * moved on to certifications, geography or dates.
 */
const LIST_ENDERS =
  /\b(iso|certified|since|established|founded|located|based|serving|available|across|throughout)\b/i;

function clean(s: string): string {
  return s
    // ® and ™ are branding, not search terms.
    .replace(/[®™©]/g, " ")
    // Sentence punctuation rides along on the last item otherwise, and
    // "kraft adhesive tapes." is not a search anybody performs.
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Words that mean this chunk is a clause, not a product.
 *
 * "We sell shoes, bags and belts online" parsed as a list gave "we sell
 * shoes online" — grammatical, and not a thing anyone types. A chunk
 * containing a pronoun or a verb is prose that happens to have commas in
 * it.
 */
const NOT_A_PRODUCT =
  /\b(we|our|us|they|their|you|your|sell|sells|selling|build|builds|make|makes|offer|offers|provide|provides|deliver|delivers|help|helps|create|creates|design|designs)\b/i;

/**
 * Trailing words that are adverbs or sales copy rather than a head noun.
 *
 * "…and belts online" would otherwise make "online" the shared head and
 * produce "bags online", "belts online". The list is real; the head is
 * not a thing.
 */
const NOT_A_HEAD_NOUN = new Set([
  "online", "today", "worldwide", "nationwide", "globally", "locally",
  "here", "now", "more", "etc", "others", "everything", "anything",
]);

/**
 * Expand "A, B and C <head noun>" into one phrase per item.
 *
 * Returns an empty array when the text is not a list, which is the
 * common case and not a failure — the caller falls back to what it did
 * before. Guessing a product out of prose that names none is how the
 * "indian manufacturer near me" seed happened.
 */
export function expandProductList(description: string): string[] {
  if (!description) return [];

  // Only the part of the sentence before it turns to credentials. "ISO
  // 9001:2015" and "Since 1987" are not products, and including them
  // put "iso adhesive tapes" in the seed list.
  // One sentence. A description's later sentences are about the
  // company, not the range, and sweeping them in put "delhi ncr adhesive
  // tapes" in the seeds.
  let text = description.split(/(?<=[.!?])\s+/)[0] ?? description;
  const stop = text.search(LIST_ENDERS);
  if (stop > 0) text = text.slice(0, stop);

  // The list usually follows "of" / "for" / a colon. Taking the whole
  // sentence otherwise sweeps in the company description: "indian
  // manufacturer" became a product on the first attempt.
  const lead = text.match(/\b(?:of|including|such as|offering|makes?|supplies)\b\s*(.+)$/i);
  if (lead) text = lead[1];

  // Split on commas and the final conjunction. Both matter: the last
  // item is the one carrying the shared head noun.
  const chunks = text
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map(clean)
    .filter(Boolean);

  // One chunk is not a list, and two is usually a sentence with an "and"
  // in it rather than a product range.
  if (chunks.length < 3) return [];

  // Any clause in the run means this is prose with commas, not a range.
  // Bailing out entirely beats extracting the two chunks that happen to
  // look like products.
  if (chunks.some((c) => NOT_A_PRODUCT.test(c))) return [];

  const last = chunks[chunks.length - 1].split(" ").filter(Boolean);
  // The final item has to be long enough to contain both a modifier and
  // a shared head noun. "polyester" alone tells us nothing about what
  // the other items are.
  if (last.length < 2) return [];

  const headWords = Math.min(MAX_HEAD_WORDS, last.length - 1);
  const head = last.slice(last.length - headWords).join(" ");
  // A head that is an adverb makes every phrase built on it wrong.
  if (head.split(" ").some((w) => NOT_A_HEAD_NOUN.has(w))) return [];
  const lastModifier = last.slice(0, last.length - headWords).join(" ");

  const out: string[] = [];
  for (const c of chunks.slice(0, -1)) {
    // A chunk that is already several words long is a phrase in its own
    // right, not a modifier — appending a head noun to it produces
    // something nobody types.
    if (c.split(" ").length > 3) continue;
    if (c.length < 2) continue;
    out.push(`${c} ${head}`);
  }
  if (lastModifier) out.push(`${lastModifier} ${head}`);

  // The head noun on its own is the broadest term in the range and
  // usually the highest-volume one.
  out.push(head);

  return [...new Set(out)];
}

/**
 * Does this business sell to other businesses?
 *
 * It decides whether "near me" belongs in the seeds at all. A tape
 * manufacturer was tagged as a local business, so every seed got "near
 * me" appended and all twelve discovered keywords were retail searches
 * — "adhesive tape shop near me" — for a company that manufactures and
 * exports. Nobody sourcing industrial tape types "near me"; they type a
 * city or a country, or neither.
 *
 * Checked against the description rather than the niche tag because the
 * tag is one dropdown somebody picked in ten seconds and the description
 * is what the business says about itself.
 */
export function looksB2B(description: string | null | undefined): boolean {
  if (!description) return false;
  return /\b(manufacturer|manufacturers|manufacturing|supplier|suppliers|wholesale|wholesaler|exporter|exports?|oem|odm|b2b|distributor|industrial|bulk)\b/i.test(
    description,
  );
}
