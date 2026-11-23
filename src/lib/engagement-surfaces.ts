/**
 * Where we'll work — the places an engagement covers.
 *
 * A client signing off a plan asks a question no part of this app could
 * answer: *what are you actually going to work on?* The onboarding
 * wizard collected a niche, a locale and a tech stack; none of those say
 * whether we are touching their Google Business Profile, their product
 * pages, or their blog. So the document we send had a timeline and a
 * keyword count and no scope, which is the section every agency
 * scope-of-work leads with.
 *
 * One table. It drives three things that would otherwise drift apart:
 *
 *   1. the onboarding step where you tick what is in scope
 *   2. the "Where we'll work" section of the client's document
 *   3. the order of the per-client tool rail
 *
 * Client-safe: pure data and pure functions, no DB, no fs.
 */

export type SurfaceId =
  | "website"
  | "local"
  | "ecommerce"
  | "content"
  | "links"
  | "ai";

export type Surface = {
  id: SurfaceId;
  /** Short name, for a checkbox and a table row. */
  label: string;
  /** What working here actually means, in the client's language. */
  detail: string;
  /**
   * Rail group labels this surface covers, matching `buildGroups()` in
   * app/clients/[id]/client-tools-launcher.tsx exactly. A test asserts
   * they still exist, because a renamed group would otherwise silently
   * drop that surface's tools out of the ordering with no error.
   */
  groups: string[];
};

/**
 * Order matters: this is the order the client reads them in, and the
 * order the tool rail is sorted into. Website first because it is the
 * only one that is always true.
 */
export const SURFACES: Surface[] = [
  {
    id: "website",
    label: "Their website",
    detail:
      "Titles, descriptions, headings, internal links, page speed and the technical health of the site itself.",
    groups: ["Run an audit", "Technical + speed", "Rank tracking + research"],
  },
  {
    id: "content",
    label: "Content and blog",
    detail:
      "Planning, briefing and refreshing articles so the site answers what people actually search for.",
    groups: ["Content + writing"],
  },
  {
    id: "local",
    label: "Local presence",
    detail:
      "Google Business Profile, map-pack rankings, reviews, and keeping the name, address and phone number consistent everywhere it appears.",
    groups: ["Local SEO + GBP"],
  },
  {
    id: "ecommerce",
    label: "Product and category pages",
    detail:
      "Product schema, category page structure, and the image and duplicate-content problems that come with a large catalogue.",
    groups: ["Generators"],
  },
  {
    id: "links",
    label: "Links and outreach",
    detail:
      "Earning links from other sites, recovering ones that were lost, and keeping the link profile healthy.",
    groups: ["Links — internal + outbound"],
  },
  {
    id: "ai",
    label: "AI search visibility",
    detail:
      "Whether ChatGPT, Perplexity, Gemini and Google's AI Overviews mention the business when people ask about this kind of thing.",
    groups: ["Reports + automation"],
  },
];

/** The same, in French: shown in the onboarding and written in the document the client approves. */
const FR: Record<SurfaceId, { label: string; detail: string }> = {
  website: {
    label: "Le site",
    detail: "Titres, descriptions, intertitres, maillage interne, vitesse et santé technique du site lui-même.",
  },
  content: {
    label: "Contenus et blog",
    detail: "Planifier, briefer et actualiser les articles pour que le site réponde à ce que les gens cherchent vraiment.",
  },
  local: {
    label: "Présence locale",
    detail:
      "Fiche Google Business, positions dans le pack local, avis, et nom, adresse et téléphone identiques partout où ils apparaissent.",
  },
  ecommerce: {
    label: "Pages produits et catégories",
    detail:
      "Données structurées produit, structure des pages catégories, et les problèmes d’images et de contenu dupliqué propres aux grands catalogues.",
  },
  links: {
    label: "Liens et relations presse",
    detail: "Obtenir des liens d’autres sites, récupérer ceux qui ont été perdus et garder un profil de liens sain.",
  },
  ai: {
    label: "Visibilité dans les IA",
    detail:
      "Savoir si ChatGPT, Perplexity, Gemini et les aperçus IA de Google citent l’entreprise quand on leur pose ce genre de question.",
  },
};

/** The surface in the given locale (French by default, English otherwise). */
export function localizeSurface(s: Surface, locale: string | null | undefined): Surface {
  return (locale ?? "fr").startsWith("fr") ? { ...s, ...FR[s.id] } : s;
}

const BY_ID = new Map(SURFACES.map((s) => [s.id, s]));

export function surfaceById(id: SurfaceId): Surface | null {
  return BY_ID.get(id) ?? null;
}

export function isSurfaceId(v: string): v is SurfaceId {
  return BY_ID.has(v as SurfaceId);
}

/**
 * What to tick before the user has said anything.
 *
 * Website and links apply to everyone. The rest follow the niche, so a
 * local business does not have to opt out of e-commerce work nobody was
 * going to do — and, more importantly, so the "not in this engagement"
 * list on the client's document is honest by default rather than empty.
 *
 * AI visibility is on by default deliberately. It is where a growing
 * share of search now happens, and a client who has never heard of it is
 * exactly the client who should be told it is being watched.
 */
export function defaultSurfaces(niche: string | null | undefined): SurfaceId[] {
  const base: SurfaceId[] = ["website", "links", "ai"];
  switch (niche) {
    case "local":
      return ["website", "local", "content", "links", "ai"];
    case "ecommerce":
      return ["website", "ecommerce", "content", "links", "ai"];
    case "blog":
      return ["website", "content", "links", "ai"];
    case "saas":
    case "services":
      return ["website", "content", "links", "ai"];
    default:
      return base;
  }
}

/**
 * Read a stored value back, tolerantly.
 *
 * Null means never chosen, and falls back to the niche default rather
 * than to nothing — an empty scope would render a document saying we
 * will do no work at all, which is worse than a reasonable guess.
 * Unknown ids are dropped so a removed surface cannot resurrect itself.
 */
export function surfacesFor(
  stored: unknown,
  niche: string | null | undefined,
): SurfaceId[] {
  if (!Array.isArray(stored)) return defaultSurfaces(niche);
  const picked = stored.filter(
    (v): v is SurfaceId => typeof v === "string" && isSurfaceId(v),
  );
  // An explicitly empty list is a real answer and is left alone; only a
  // missing one falls back.
  return stored.length === 0 ? [] : picked;
}

/** In-scope surfaces and out-of-scope ones, in reading order. */
export function splitSurfaces(ids: SurfaceId[], locale?: string | null): {
  inScope: Surface[];
  outOfScope: Surface[];
} {
  const set = new Set(ids);
  const loc = (sf: Surface) => (locale ? localizeSurface(sf, locale) : sf);
  return {
    inScope: SURFACES.filter((s) => set.has(s.id)).map(loc),
    outOfScope: SURFACES.filter((s) => !set.has(s.id)).map(loc),
  };
}

/**
 * Rail group labels covered by the chosen surfaces, in surface order.
 *
 * Groups belonging to no surface at all — "Paid ads & growth" — are not
 * returned and are left where they are by the caller. Being unmapped is
 * not the same as being out of scope, and treating it as such would
 * quietly demote a tool nobody decided about.
 */
export function groupsForSurfaces(ids: SurfaceId[]): string[] {
  const out: string[] = [];
  for (const s of SURFACES) {
    if (!ids.includes(s.id)) continue;
    for (const g of s.groups) if (!out.includes(g)) out.push(g);
  }
  return out;
}

/** Every group label any surface claims, mapped or not. */
export function allMappedGroups(): string[] {
  return [...new Set(SURFACES.flatMap((s) => s.groups))];
}
