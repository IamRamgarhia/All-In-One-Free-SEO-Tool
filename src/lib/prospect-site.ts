/**
 * The probable website of a local business, found by searching its name
 * and town on Google through the SERP API (serp-api.ts), when one is set
 * up. The register has no website column.
 *
 * Most first results for "Boulangerie Martin Orly" are directories
 * (Pages Jaunes, societe.com, Facebook, TripAdvisor…). Those are skipped,
 * and a remaining result counts only if its domain shares a word with the
 * business name: a guess that names another business would put the wrong
 * site in a sales pitch. No match: null, and the person types the address.
 */

import { stems } from "./keyword-relevance";
import { fetchSerpViaApi, serpApiConfig } from "./serp-api";

/** Directories, marketplaces, social networks and registers. */
const NOT_A_SITE = [
  "pagesjaunes.fr", "societe.com", "pappers.fr", "infogreffe.fr", "verif.com", "manageo.fr",
  "societeinfo.com", "kompass.com", "annuaire-entreprises.data.gouv.fr", "data.gouv.fr", "sirene.fr",
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com", "youtube.com",
  "pinterest.com", "tripadvisor.fr", "tripadvisor.com", "yelp.fr", "yelp.com", "google.com", "google.fr",
  "maps.app.goo.gl", "mappy.com", "justacote.com", "cylex-france.fr", "hoodspot.fr", "118712.fr",
  "lafourchette.com", "thefork.fr", "ubereats.com", "deliveroo.fr", "doctolib.fr", "planity.com",
  "treatwell.fr", "leboncoin.fr", "wikipedia.org", "petitfute.com", "restaurantguru.com", "allo-heure.fr",
  "horaires.lefigaro.fr", "lefigaro.fr", "starofservice.com", "habitatpresto.com", "travaux.com",
  "houzz.fr", "trustpilot.com", "avis-verifies.com", "waze.com", "booking.com",
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isDirectory(host: string): boolean {
  return NOT_A_SITE.some((d) => host === d || host.endsWith(`.${d}`));
}

/** First result that is the business's own site, or null. Pure. */
export function pickBusinessSite(urls: readonly string[], name: string): string | null {
  const wanted = stems(name);
  // Generic trade words do not identify a business: "boulangerie" is in
  // every bakery's name and in half the directories' domains.
  for (const w of ["boulan", "restau", "coiffu", "garage", "taxi", "hotel", "pharma", "sarl", "sas"]) wanted.delete(w);
  if (wanted.size === 0) return null;
  for (const url of urls) {
    const host = hostOf(url);
    if (!host || isDirectory(host)) continue;
    const label = host.split(".").slice(0, -1).join(" ").replace(/-/g, " ");
    const have = stems(label);
    // Domains glue words together ("lebannetondosier"): also accept a
    // wanted word found inside the domain.
    const joined = label.replace(/\s+/g, "");
    if ([...wanted].some((w) => have.has(w) || (w.length >= 4 && joined.includes(w)))) {
      return `https://${new URL(url).hostname}/`;
    }
  }
  return null;
}

export async function findBusinessSite(
  name: string,
  city: string,
): Promise<{ ok: true; url: string | null } | { ok: false; error: "no-api" | string }> {
  const config = await serpApiConfig();
  if (!config) return { ok: false, error: "no-api" };
  const r = await fetchSerpViaApi(config, { query: `${name} ${city}`, country: "FR", language: "fr", depth: 10 });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, url: pickBusinessSite(r.urls, name) };
}
