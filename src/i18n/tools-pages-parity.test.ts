import { describe, expect, it } from "vitest";
import en from "../../messages/tools-pages.en.json";
import fr from "../../messages/tools-pages.fr.json";

function flattenKeys(
  value: unknown,
  prefix = "",
  out: string[] = [],
): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out.push(prefix);
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    flattenKeys(child, path, out);
  }
  return out;
}

describe("tools-pages catalogs", () => {
  it("en and fr expose the same key set", () => {
    const enKeys = flattenKeys(en).sort();
    const frKeys = flattenKeys(fr).sort();
    const missingInEn = frKeys.filter((k) => !enKeys.includes(k));
    const missingInFr = enKeys.filter((k) => !frKeys.includes(k));
    expect({ missingInEn, missingInFr }).toEqual({
      missingInEn: [],
      missingInFr: [],
    });
  });
});
