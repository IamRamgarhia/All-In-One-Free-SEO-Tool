/**
 * Which action kinds have a "before" worth reading off the live page.
 *
 * Shared between the planner, which fetches those values, and the
 * approval panel, which renders them — because the panel has to tell
 * three different nulls apart and only one of them means a failure:
 *
 *   null, kind IS in this map   -> the page could not be read. Something
 *                                  may be getting replaced and we do not
 *                                  know what.
 *   null, kind is NOT in it     -> there is no page-level "before" for
 *                                  this kind at all. A robots.txt
 *                                  directive or an index/noindex flag is
 *                                  not a value sitting in the HTML that
 *                                  a new one overwrites.
 *   ""                          -> read fine, and the page has nothing
 *                                  there.
 *
 * Without the distinction the panel says "couldn't read the live page"
 * over a robots-meta change, which is both untrue and alarming — it was
 * never going to read one. Caught by running the planner for real and
 * looking at what it printed.
 *
 * One map, because a second copy in the panel would drift the first
 * time a kind is added — and the symptom would be a wrong sentence in
 * an approval screen, which is the last place to have one.
 */
export const BEFORE_VALUE_FIELD: Record<string, "title" | "description"> = {
  write_title: "title",
  write_meta_description: "description",
};

/** True when a missing before-value means we failed to read the page. */
export function expectsBeforeValue(kind: string): boolean {
  return kind in BEFORE_VALUE_FIELD;
}
