/**
 * The tone of each guest-post platform in French, keyed by site id
 * (guest-post-sites.ts). Shown on screen when the interface is French; the
 * English style profile stays as written for the writer's prompt.
 */
export const GUEST_POST_TONES_FR: Record<string, string> = {
  medium: "récit personnel autour d’une seule idée",
  devto: "tutoriel ou journal de développement, technique mais chaleureux",
  hashnode: "tutoriel, article explicatif, journal de développement avec un point de vue",
  substack: "essai engagé et réflexif",
  "linkedin-pulse": "professionnel mais humain, porté par une histoire",
  hackernoon: "tribune ou article explicatif avec de la profondeur technique",
  indiehackers: "journal de projet transparent, leçons tirées",
  "search-engine-journal": "fondé sur les données, expert, concret",
  "marketing-profs": "pratique pour les marketeurs B2B, pédagogie de milieu d’entonnoir",
  "smashing-magazine": "tutoriel technique ou design approfondi, illustré",
  "a-list-apart": "essai centré sur le métier, avec un point de vue",
  "css-tricks": "tutoriel pratique de développement web",
  "moz-blog": "fondé sur la recherche et les preuves",
  "ahrefs-blog": "guide complet et de référence",
  "growth-hackers": "étude de cas concrète, chiffres à l’appui",
  ghost: "essai ou guide",
  quora: "réponse d’expert directe, portée par une histoire",
};
