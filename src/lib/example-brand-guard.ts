/**
 * Keep the example brand out of real clients' copy.
 *
 * Two prompts carry a worked example with a brand name in it, because a
 * concrete example is what makes the instruction land —
 * seo-agent.ts shows a title rewrite, seo-knowledge-base.ts a good
 * title. A model handed "Home - Dice Codes" as the shape of a good
 * answer will sometimes return the shape complete with the name,
 * especially for a client whose own brand it was not told.
 *
 * The result would be a title or meta description offered for someone
 * else's site with our example company in it. Nothing errors; the
 * suggestion simply looks plausible and names the wrong business. Worse,
 * the whole point of those fields is that the user copies them, so a
 * leak that gets past review ends up published.
 *
 * So: strip it on the way out, and record that it happened rather than
 * silently tidying up — if a prompt starts leaking regularly that is a
 * prompt to fix, and a count in the log is how anyone would notice.
 *
 * The one case that must pass through untouched is the client who really
 * is that company. `ownBrand` is the caller's answer to that, resolved
 * from the client's own URL and name.
 */

/** The brand used in prompt examples. Also this project's maintainer. */
export const EXAMPLE_BRAND = "Dice Codes";
export const EXAMPLE_DOMAIN = "dicecodes.com";

/**
 * The one pattern that defines "a mention", used by both the check and
 * the strip.
 *
 * It started as two: `includes("dice codes")` here and a regex in the
 * scrub. They disagreed immediately — the substring check missed
 * "DiceCodes" with no space, so a leak in that spelling was never even
 * looked at, and the alternation in the regex matched "dicecodes" inside
 * "dicecodes.com" and left a bare ".com" behind. Both were caught by the
 * tests below on first run.
 *
 * `.com` is part of the same alternative rather than a separate one, so
 * the domain is consumed whole.
 */
const BRAND_RE = /dice\s*codes(?:\.com)?/gi;

/** Cheap pre-check, so the common case costs one scan and no DB query. */
export function mentionsExampleBrand(text: string): boolean {
  if (!text) return false;
  // A fresh regex per call: BRAND_RE is global, and a shared one carries
  // lastIndex between calls, so every other .test() would return false.
  return new RegExp(BRAND_RE.source, "i").test(text);
}

/**
 * Does this client legitimately own the example brand?
 *
 * Matched on the registrable part of the host, so www.dicecodes.com and
 * dicecodes.com/services both count, while mydicecodes.com.evil.test
 * does not — a substring test on the URL would have said yes to that.
 */
export function isOwnBrand(opts: {
  url?: string | null;
  name?: string | null;
}): boolean {
  const name = (opts.name ?? "").trim().toLowerCase();
  if (name === "dice codes" || name === "dicecodes") return true;

  const raw = (opts.url ?? "").trim();
  if (!raw) return false;
  let host = "";
  try {
    host = new URL(
      raw.includes("://") ? raw : `https://${raw}`,
    ).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === EXAMPLE_DOMAIN || host.endsWith(`.${EXAMPLE_DOMAIN}`);
}

/**
 * Separators a title or meta description strings its parts together
 * with. When the brand sitting between two of them is removed, one of
 * them has to go as well, or the text reads "Home - - Free Shipping".
 */
const SEP = "[-–—|·:,]";

/**
 * Remove the example brand and close the gap it leaves.
 *
 * Returns the cleaned text and how many mentions were taken out, so a
 * caller can log a leak instead of hiding it. Text that does not mention
 * the brand comes back byte-identical.
 */
export function scrubExampleBrand(
  text: string,
  opts: { ownBrand?: boolean } = {},
): { text: string; removed: number } {
  if (!text || opts.ownBrand || !mentionsExampleBrand(text)) {
    return { text, removed: 0 };
  }

  // Count before rewriting: the rewrite collapses separators too, so
  // counting afterwards would not give the number of mentions.
  const brandRe = new RegExp(BRAND_RE.source, "gi");
  const removed = (text.match(brandRe) ?? []).length;

  // Mark rather than delete, so the separator cleanup can tell where the
  // brand was from where the text merely happens to have punctuation.
  const MARK = "\u0000";
  let out = text.replace(brandRe, MARK);

  // "A - MARK - B" -> "A - B": drop the separator the brand brought with
  // it, whichever side it sat on.
  out = out.replace(
    new RegExp(`\\s*${SEP}\\s*${MARK}\\s*${SEP}\\s*`, "g"),
    " - ",
  );
  // "A - MARK" or "A -MARK" at the end, and "MARK - A" at the start.
  out = out.replace(new RegExp(`\\s*${SEP}\\s*${MARK}`, "g"), "");
  out = out.replace(new RegExp(`${MARK}\\s*${SEP}\\s*`, "g"), "");
  // Anything left: the brand stood alone in the sentence.
  out = out.split(MARK).join("");

  // Tidy what the removal left behind, without touching intentional
  // punctuation elsewhere in the string.
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim()
    .replace(new RegExp(`^${SEP}\\s*`), "")
    .replace(new RegExp(`\\s*${SEP}$`), "")
    .trim();

  return { text: out, removed };
}
