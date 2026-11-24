/**
 * The client's country and language, said the way each engine expects.
 *
 * Before this, DuckDuckGo was always asked in American English with no
 * region (accept-language en-US, no `kl`), and the browser context was
 * en-US / UTC, whatever the client's market. A French client's keyword
 * was therefore checked against American results on the one source that
 * actually answers from a server.
 */

/**
 * DuckDuckGo's region codes (`kl`), as listed in its own region menu.
 * Mostly `<country>-<language>`, with a few of its own spellings
 * (uk-en for the United Kingdom, jp-jp, kr-kr, wt-wt for "no region").
 */
const DDG_REGIONS = [
  "xa-ar", "xa-en", "ar-es", "au-en", "at-de", "be-fr", "be-nl", "br-pt", "bg-bg",
  "ca-en", "ca-fr", "ct-ca", "cl-es", "cn-zh", "co-es", "hr-hr", "cz-cs", "dk-da",
  "ee-et", "fi-fi", "fr-fr", "de-de", "gr-el", "hk-tzh", "hu-hu", "in-en", "id-id",
  "id-en", "ie-en", "il-he", "it-it", "jp-jp", "kr-kr", "lv-lv", "lt-lt", "xl-es",
  "my-ms", "my-en", "mx-es", "nl-nl", "nz-en", "no-no", "pe-es", "ph-en", "ph-tl",
  "pl-pl", "pt-pt", "ro-ro", "ru-ru", "sg-en", "sk-sk", "sl-sl", "za-en", "es-es",
  "se-sv", "ch-de", "ch-fr", "ch-it", "tw-tzh", "th-th", "tr-tr", "ua-uk", "uk-en",
  "us-en", "ue-es", "ve-es", "vn-vi",
] as const;

/** "fr" from "fr", "FR", "fr-FR" or "fr_BE"; "" from anything else. */
export function languageCode(language?: string): string {
  return /^([a-z]{2})(?:[-_]|$)/i.exec((language ?? "").trim())?.[1]?.toLowerCase() ?? "";
}

/** Where DuckDuckGo's country prefix differs from ISO 3166. */
const DDG_COUNTRY_ALIAS: Record<string, string> = { gb: "uk" };

/**
 * The `kl` value for a country and language: the exact pair when
 * DuckDuckGo has it (fr + FR → fr-fr, fr + BE → be-fr), else the
 * country's first region, else "wt-wt" (no region) — never a code it
 * does not know, which it would silently ignore.
 */
export function duckDuckGoRegion(country?: string, language?: string): string {
  const raw = (country ?? "").trim().toLowerCase();
  const cc = DDG_COUNTRY_ALIAS[raw] ?? raw;
  const lang = languageCode(language);
  if (!/^[a-z]{2}$/.test(cc)) return "wt-wt";
  const exact = `${cc}-${lang}`;
  if ((DDG_REGIONS as readonly string[]).includes(exact)) return exact;
  const any = DDG_REGIONS.find((r) => r.startsWith(`${cc}-`));
  return any ?? "wt-wt";
}

/** "fr-FR,fr;q=0.9" — the header a browser set to that language sends. */
export function acceptLanguageFor(language?: string, country?: string): string {
  const lang = languageCode(language);
  if (!lang) return "en-US,en;q=0.9";
  const cc = (country ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(cc) ? `${lang}-${cc},${lang};q=0.9` : `${lang};q=0.9`;
}

/** "fr-FR" for a browser context, or en-US when unknown. */
export function browserLocaleFor(language?: string, country?: string): string {
  const lang = languageCode(language);
  const cc = (country ?? "").trim().toUpperCase();
  if (!lang) return "en-US";
  return /^[A-Z]{2}$/.test(cc) ? `${lang}-${cc}` : lang;
}

/**
 * One representative time zone per country, for the browser context.
 * Only countries with a single obvious zone, or whose capital is the
 * sensible default; anything else stays UTC rather than guessing.
 */
const COUNTRY_TIMEZONE: Record<string, string> = {
  FR: "Europe/Paris", BE: "Europe/Brussels", CH: "Europe/Zurich", LU: "Europe/Luxembourg",
  MC: "Europe/Monaco", DE: "Europe/Berlin", AT: "Europe/Vienna", ES: "Europe/Madrid",
  IT: "Europe/Rome", NL: "Europe/Amsterdam", PT: "Europe/Lisbon", GB: "Europe/London",
  IE: "Europe/Dublin", PL: "Europe/Warsaw", SE: "Europe/Stockholm", DK: "Europe/Copenhagen",
  NO: "Europe/Oslo", FI: "Europe/Helsinki", CZ: "Europe/Prague", RO: "Europe/Bucharest",
  GR: "Europe/Athens", MA: "Africa/Casablanca", DZ: "Africa/Algiers", TN: "Africa/Tunis",
  SN: "Africa/Dakar", CI: "Africa/Abidjan", CM: "Africa/Douala", JP: "Asia/Tokyo",
  IN: "Asia/Kolkata", SG: "Asia/Singapore", AE: "Asia/Dubai", ZA: "Africa/Johannesburg",
  NZ: "Pacific/Auckland",
};

export function timezoneForCountry(country?: string): string {
  return COUNTRY_TIMEZONE[(country ?? "").trim().toUpperCase()] ?? "UTC";
}
