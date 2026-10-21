import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

/** Flatten nested message objects into dotted paths (e.g. `nav.items.home`). */
function flattenKeys(
  value: unknown,
  prefix = "",
  out: string[] = [],
): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out.push(prefix);
    return out;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    if (prefix) out.push(prefix);
    return out;
  }
  for (const [key, child] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    flattenKeys(child, path, out);
  }
  return out;
}

describe("i18n message catalogs", () => {
  it("fr.json and en.json expose the exact same key set", () => {
    const frKeys = flattenKeys(fr).sort();
    const enKeys = flattenKeys(en).sort();

    const missingInEn = frKeys.filter((k) => !enKeys.includes(k));
    const missingInFr = enKeys.filter((k) => !frKeys.includes(k));

    expect(
      { missingInEn, missingInFr },
      "Message catalogs drifted — add the missing keys to both locales",
    ).toEqual({ missingInEn: [], missingInFr: [] });
    expect(frKeys).toEqual(enKeys);
  });
});
