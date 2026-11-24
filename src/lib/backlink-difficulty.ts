/**
 * Derive a difficulty label for a backlink prospect.
 *
 * Inputs we have today: `category` (from seoResources) and `da` (Domain
 * Authority estimate from the seed file). We turn those into one of four
 * labels users can scan visually:
 *
 *   easy   — profile creation, social bookmarking, web 2.0, classifieds.
 *            Auto-publish or low-bar moderated. Low ranking weight individually
 *            but useful for foundation/diversity.
 *   medium — directories (general + niche), forums, RSS, ping submission,
 *            press release distribution, blog comment opportunities. Moderated,
 *            takes effort.
 *   hard   — editorial guest posts on real publications, .edu/.gov, infographic
 *            pickups, podcast appearances. Pitch + original content required.
 *   paid   — categories that almost always require payment (premium directories,
 *            sponsored placements). We don't currently have an explicit "paid"
 *            category, so this only fires when we get a paid signal in code.
 *
 * High DA bumps a category up one rung (a DA-90 directory is harder than a
 * DA-30 directory — competition for the listing is fiercer). Low DA pulls
 * borderline-hard items down a rung.
 */

export type Difficulty = "easy" | "medium" | "hard" | "paid";

const HARD_CATEGORIES = new Set([
  "edu",
  "gov",
  "press-release",
  "infographics-submission",
]);

const MEDIUM_CATEGORIES = new Set([
  "directory-submission",
  "local-citation",
  "forum-posting",
  "wiki-submission",
  "rss-feed",
  "ping-submission",
  "article-submission",
  "blog-submission",
  "business-networking",
  "search-engine-submission",
]);

const EASY_CATEGORIES = new Set([
  "profile-creation",
  "social-bookmarking",
  "social-networking",
  "web-2.0",
  "image-submission",
  "video-sharing",
  "story-sharing",
  "classified-submission",
  "pdf-submission",
  "portfolio",
  "showcase",
  "seo-audit-tools",
]);

export function deriveDifficulty(
  category: string,
  da: number | null | undefined,
): Difficulty {
  let base: Difficulty = "medium";
  if (HARD_CATEGORIES.has(category)) base = "hard";
  else if (MEDIUM_CATEGORIES.has(category)) base = "medium";
  else if (EASY_CATEGORIES.has(category)) base = "easy";

  // DA-based promotion/demotion.
  if (typeof da === "number") {
    if (da >= 80 && base === "medium") return "hard";
    if (da >= 90 && base === "easy") return "medium";
    if (da < 20 && base === "hard") return "medium";
  }
  return base;
}

export function difficultyTone(d: Difficulty): string {
  if (d === "easy")
    return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
  if (d === "medium") return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  if (d === "hard") return "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  return "bg-violet-500/15 text-violet-300 ring-violet-500/30";
}

export function difficultyEffortHint(d: Difficulty, locale = "en"): string {
  if (locale === "fr") {
    // The English per-site durations are rough guesses; the French keeps
    // the steps and drops the figures.
    if (d === "easy") return "Inscription, profil, collage de l’URL : quelques minutes par site.";
    if (d === "medium")
      return "Proposition ou envoi des informations, puis attente de la modération, avec une relance.";
    if (d === "hard")
      return "Proposition, rédaction d’un contenu complet et allers-retours : plusieurs heures par lien.";
    return "Souvent payant : vérifiez le coût avant d’envoyer.";
  }
  if (d === "easy")
    return "Sign up, fill profile, paste URL. ~2-5 min per site.";
  if (d === "medium")
    return "Pitch / submit details, wait for moderation. ~10-30 min plus follow-up.";
  if (d === "hard")
    return "Pitch + draft full content + iterate. Several hours per placement.";
  return "Usually paid — confirm cost before submitting.";
}

/** A coarse SEO weight ranking — purely for sorting prospect lists. */
export function difficultyWeight(d: Difficulty): number {
  if (d === "hard") return 3;
  if (d === "paid") return 2;
  if (d === "medium") return 1;
  return 0;
}
