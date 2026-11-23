/**
 * Local businesses to prospect, from the French state's company register
 * (API Recherche d'entreprises, recherche-entreprises.api.gouv.fr: free,
 * no key, public Sirene data).
 *
 * An agency selling local SEO needs a list to call: "every bakery in
 * 94310", with the ones that have no site or a weak one first. The
 * register gives the businesses; the site, when there is one, is found
 * separately (prospect-site.ts) and graded with the express audit.
 *
 * What is left out, on purpose:
 *   - establishments that are closed, or outside the requested postcode
 *     (a company headquartered elsewhere with a shop here is kept, with
 *     the shop's address);
 *   - companies that opposed commercial use of their data
 *     (`opposition_diffusion_commerciale`), and those whose data is only
 *     partly public (`statut_diffusion` other than "O"). Prospecting them
 *     anyway is what the opposition exists to prevent.
 * Directors' names are not read: the business is the prospect.
 */

export type LocalBusiness = {
  siren: string;
  siret: string;
  /** Shop sign when there is one, else the registered name. */
  name: string;
  address: string;
  postcode: string;
  city: string;
  /** NAF code, e.g. "10.71C". */
  activity: string;
  /** Year the establishment opened. */
  since: number | null;
};

/** Common local trades and their NAF codes, for the search form. */
export const LOCAL_TRADES: { id: string; naf: string }[] = [
  { id: "bakery", naf: "10.71C" },
  { id: "butcher", naf: "47.22Z" },
  { id: "restaurant", naf: "56.10A" },
  { id: "fastFood", naf: "56.10C" },
  { id: "bar", naf: "56.30Z" },
  { id: "hotel", naf: "55.10Z" },
  { id: "hairdresser", naf: "96.02A" },
  { id: "beauty", naf: "96.02B" },
  { id: "florist", naf: "47.76Z" },
  { id: "optician", naf: "47.78A" },
  { id: "pharmacy", naf: "47.73Z" },
  { id: "plumber", naf: "43.22A" },
  { id: "electrician", naf: "43.21A" },
  { id: "carpenter", naf: "43.32A" },
  { id: "painter", naf: "43.34Z" },
  { id: "roofer", naf: "43.91B" },
  { id: "builder", naf: "41.20A" },
  { id: "landscaper", naf: "81.30Z" },
  { id: "cleaning", naf: "81.21Z" },
  { id: "garage", naf: "45.20A" },
  { id: "taxi", naf: "49.32Z" },
  { id: "drivingSchool", naf: "85.53Z" },
  { id: "realEstate", naf: "68.31Z" },
  { id: "lawyer", naf: "69.10Z" },
  { id: "accountant", naf: "69.20Z" },
  { id: "architect", naf: "71.11Z" },
  { id: "dentist", naf: "86.23Z" },
  { id: "vet", naf: "75.00Z" },
  { id: "sport", naf: "93.13Z" },
];

type ApiEstablishment = {
  siret?: string;
  adresse?: string;
  code_postal?: string;
  libelle_commune?: string;
  etat_administratif?: string;
  date_creation?: string | null;
  liste_enseignes?: string[] | null;
  nom_commercial?: string | null;
};

type ApiCompany = {
  siren?: string;
  nom_complet?: string;
  activite_principale?: string;
  statut_diffusion?: string;
  opposition_diffusion_commerciale?: boolean | null;
  matching_etablissements?: ApiEstablishment[];
};

/** "LE BANNETON D OSIER" → "Le Banneton D Osier": the register shouts. */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** The register's answer, reduced to the establishments worth calling. Pure. */
export function parseCompanies(json: unknown, postcode: string): LocalBusiness[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const out: LocalBusiness[] = [];
  const seen = new Set<string>();
  for (const raw of results as ApiCompany[]) {
    if (raw.opposition_diffusion_commerciale === true) continue;
    if (raw.statut_diffusion !== "O") continue;
    for (const e of raw.matching_etablissements ?? []) {
      if (e.etat_administratif !== "A" || e.code_postal !== postcode || !e.siret) continue;
      if (seen.has(e.siret)) continue;
      seen.add(e.siret);
      const sign = e.liste_enseignes?.find(Boolean) ?? e.nom_commercial ?? null;
      const year = e.date_creation ? Number(e.date_creation.slice(0, 4)) : NaN;
      out.push({
        siren: raw.siren ?? e.siret.slice(0, 9),
        siret: e.siret,
        name: titleCase(sign ?? raw.nom_complet ?? e.siret),
        address: titleCase(e.adresse ?? ""),
        postcode: e.code_postal,
        city: titleCase(e.libelle_commune ?? ""),
        activity: raw.activite_principale ?? "",
        since: Number.isFinite(year) ? year : null,
      });
    }
  }
  return out;
}

export function isPostcode(value: string): boolean {
  return /^\d{5}$/.test(value);
}

export function isNafCode(value: string): boolean {
  return /^\d{2}\.\d{2}[A-Z]$/.test(value);
}

/** One page of open establishments for a trade in a postcode. */
export async function searchLocalBusinesses(opts: {
  naf: string;
  postcode: string;
  page?: number;
}): Promise<{ ok: true; businesses: LocalBusiness[]; total: number; pages: number } | { ok: false; error: string }> {
  if (!isNafCode(opts.naf) || !isPostcode(opts.postcode)) return { ok: false, error: "bad-input" };
  const url = new URL("https://recherche-entreprises.api.gouv.fr/search");
  url.searchParams.set("activite_principale", opts.naf);
  url.searchParams.set("code_postal", opts.postcode);
  url.searchParams.set("etat_administratif", "A");
  url.searchParams.set("per_page", "25");
  url.searchParams.set("page", String(Math.max(1, opts.page ?? 1)));
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) return { ok: false, error: "rate-limited" };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { total_results?: number; total_pages?: number };
    return {
      ok: true,
      businesses: parseCompanies(json, opts.postcode),
      total: json.total_results ?? 0,
      pages: json.total_pages ?? 1,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
