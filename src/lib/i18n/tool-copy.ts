import { navItemMessageKey } from "../../i18n/nav";
import { toolCatalogSlug } from "./tool-slug";

/**
 * A tool's name and one line, from whichever translation knows it.
 *
 * One rule for every surface that names a tool (Settings → Tools, global
 * search, the generated capability table), so a tool cannot be called one
 * thing in the catalogue and another in search. Order:
 *   1. settings.tools.titles / descriptions (the catalogue's own wording),
 *   2. tools.catalog.<slug> (the /tools/* pages),
 *   3. nav.items (the sidebar label), for the name only.
 *
 * Works with next-intl's useTranslations / getTranslations, and with the
 * raw message files (see translatorFrom) where no request exists.
 */
export type ToolCopyTranslator = {
  (key: string): string;
  has(key: string): boolean;
};

export type ToolCopySources = {
  /** Namespace `settings.tools`. */
  settings: ToolCopyTranslator;
  /** Namespace `tools.catalog`. */
  catalog: ToolCopyTranslator;
  /** Namespace `nav.items`. */
  nav: ToolCopyTranslator;
};

export type ToolCopy = { title: string; description: string };

/** A message that fails to format (bad ICU) is treated as missing. */
function read(t: ToolCopyTranslator, key: string): string | null {
  if (!t.has(key)) return null;
  try {
    return t(key);
  } catch {
    return null;
  }
}

/** Null when no translation names the tool. */
export function resolveToolCopy(href: string, src: ToolCopySources): ToolCopy | null {
  const key = navItemMessageKey(href);
  const slug = href.startsWith("/tools/") ? toolCatalogSlug(href) : null;
  const title =
    read(src.settings, `titles.${key}`) ??
    (slug ? read(src.catalog, `${slug}.title`) : null) ??
    read(src.nav, key);
  if (!title) return null;
  const description =
    read(src.settings, `descriptions.${key}`) ??
    (slug ? read(src.catalog, `${slug}.description`) : null) ??
    "";
  return { title, description };
}

/**
 * A translator over a plain message object, for scripts and tests that
 * read messages/*.json directly. Returns the raw string, unformatted.
 */
export function translatorFrom(messages: unknown): ToolCopyTranslator {
  const lookup = (key: string): unknown =>
    key.split(".").reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
  const t = ((key: string) => {
    const v = lookup(key);
    if (typeof v !== "string") throw new Error(`missing message ${key}`);
    return v;
  }) as ToolCopyTranslator;
  t.has = (key: string) => typeof lookup(key) === "string";
  return t;
}
