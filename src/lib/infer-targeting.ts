/**
 * Which country and language a client's site is aimed at, guessed from what
 * adding the client already found: its postal address, its phone number and
 * its domain.
 *
 * Every client used to start as United States / English (the column
 * defaults), so a chauffeur in Orly with a French site, a +33 number and an
 * address ending "94310, FR" had its keywords researched and tracked on
 * Google US until someone changed the targeting by hand, after the keywords
 * were already saved.
 *
 * Sources, most reliable first: the address (an explicit country), the phone
 * number's international prefix, then the domain's country extension.
 * Nothing found: null, and the caller keeps its own default.
 *
 * Pure.
 */

export type Targeting = { country: string; language: string };

/** Country → the language its sites are most often written in. */
const LANGUAGE_OF: Record<string, string> = {
  FR: "fr", BE: "fr", LU: "fr", MC: "fr", CH: "fr", MA: "fr", TN: "fr", DZ: "fr", SN: "fr", CI: "fr", CM: "fr",
  RE: "fr", GP: "fr", MQ: "fr", GF: "fr", YT: "fr", NC: "fr", PF: "fr",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es",
  DE: "de", AT: "de", IT: "it", PT: "pt", BR: "pt", NL: "nl",
  GB: "en", IE: "en", US: "en", CA: "en", AU: "en", NZ: "en",
};

/** International dialling prefixes, longest first so +212 wins over +2. */
const PHONE_PREFIX: Array<[string, string]> = [
  ["212", "MA"], ["213", "DZ"], ["216", "TN"], ["221", "SN"], ["225", "CI"], ["237", "CM"],
  ["262", "RE"], ["352", "LU"], ["377", "MC"], ["590", "GP"], ["596", "MQ"], ["594", "GF"],
  ["351", "PT"], ["353", "IE"],
  ["33", "FR"], ["32", "BE"], ["41", "CH"], ["34", "ES"], ["39", "IT"], ["49", "DE"],
  ["43", "AT"], ["31", "NL"], ["44", "GB"], ["52", "MX"], ["55", "BR"], ["61", "AU"],
  ["1", "US"],
];

/** Country-code domains worth trusting (.co / .io / .me are used as generic). */
const TLD_COUNTRY: Record<string, string> = {
  fr: "FR", be: "BE", ch: "CH", lu: "LU", mc: "MC", ma: "MA", tn: "TN", dz: "DZ", sn: "SN", re: "RE",
  es: "ES", mx: "MX", ar: "AR", cl: "CL", pe: "PE", de: "DE", at: "AT", it: "IT", pt: "PT", br: "BR",
  nl: "NL", uk: "GB", ie: "IE", ca: "CA", au: "AU", nz: "NZ",
};

/** Country names an address may spell out, lower-case, accents kept. */
const COUNTRY_NAMES: Record<string, string> = {
  france: "FR", belgique: "BE", belgium: "BE", suisse: "CH", switzerland: "CH", luxembourg: "LU",
  monaco: "MC", maroc: "MA", morocco: "MA", tunisie: "TN", algérie: "DZ", algerie: "DZ",
  sénégal: "SN", senegal: "SN", espagne: "ES", españa: "ES", spain: "ES", allemagne: "DE",
  deutschland: "DE", germany: "DE", italie: "IT", italia: "IT", italy: "IT", portugal: "PT",
  "royaume-uni": "GB", "united kingdom": "GB", canada: "CA", "united states": "US", usa: "US",
};

function fromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const tail = address.trim().split(",").pop()?.trim() ?? "";
  if (/^[A-Z]{2}$/.test(tail) && LANGUAGE_OF[tail]) return tail;
  const lower = address.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAMES)) {
    if (new RegExp(`(^|[\\s,])${name}($|[\\s,.])`).test(lower)) return code;
  }
  return null;
}

function fromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  const intl = digits.startsWith("+") ? digits.slice(1) : digits.startsWith("00") ? digits.slice(2) : null;
  if (!intl) return null;
  for (const [prefix, code] of PHONE_PREFIX) if (intl.startsWith(prefix)) return code;
  return null;
}

function fromDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let host = "";
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  const tld = host.split(".").pop() ?? "";
  return TLD_COUNTRY[tld] ?? null;
}

export function inferTargeting(input: {
  url?: string | null;
  address?: string | null;
  phone?: string | null;
}): Targeting | null {
  const country = fromAddress(input.address) ?? fromPhone(input.phone) ?? fromDomain(input.url);
  if (!country) return null;
  return { country, language: LANGUAGE_OF[country] ?? "en" };
}

/**
 * The column defaults a client gets when nobody chose: a client still on
 * them has never had its targeting set, and may be re-guessed.
 */
export function isDefaultTargeting(c: { country: string | null; language: string | null }): boolean {
  return (c.country ?? "US") === "US" && (c.language ?? "en") === "en";
}
