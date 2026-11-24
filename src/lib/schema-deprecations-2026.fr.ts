/**
 * The schema advisories in French, keyed by schema type like
 * schema-deprecations-2026.ts. Shown when the interface is French; a test
 * keeps the keys in step.
 *
 * Dates and claims the English gives without a precise source are left
 * out; good practices read as recommendations, never as obligations.
 */
import type { SchemaAdvisory } from "./schema-deprecations-2026";

type AdvisoryText = Pick<SchemaAdvisory, "headline" | "reason" | "recommendation">;

export const SCHEMA_ADVISORIES_FR: Record<string, AdvisoryText> = {
  FAQPage: {
    headline: "Résultat enrichi FAQ rarement affiché",
    reason:
      "Google a fortement réduit l’affichage des FAQ enrichies, trop utilisées sur des pages dont ce n’était pas le sujet. Le balisage reste valide et peut aider le mode IA à vérifier les entités, mais ne comptez pas sur un résultat enrichi pour la plupart des pages.",
    recommendation:
      "Il est recommandé de réserver le schéma FAQPage aux pages réellement organisées en FAQ. Pour une page produit ou service avec quelques questions en bas, préférez un schéma Article et une structure en H2 et paragraphes, que Google lit directement.",
  },
  HowTo: {
    headline: "Résultat enrichi HowTo n’est plus affiché pour la plupart des recherches",
    reason:
      "Google a retiré le résultat enrichi HowTo pour la plupart des recherches, sur ordinateur comme sur mobile.",
    recommendation:
      "Préférez un schéma Article avec des intertitres H2 clairs pour chaque étape : c’est la mise en page du contenu que Google exploite désormais.",
  },
  Review: {
    headline: "Extraits d’avis retirés des pages dont l’avis n’est pas le sujet",
    reason:
      "Google affiche moins les avis enrichis sur les pages dont l’avis n’est pas le sujet principal (par exemple des étoiles sur un article de blog à propos d’un produit que le site ne vend pas ni ne teste).",
    recommendation:
      "Il est recommandé de réserver Review et AggregateRating aux pages dont l’avis est le contenu principal (vos pages produits, des pages d’avis dédiées), plutôt que de les répartir sur tout le site.",
  },
  Recipe: {
    headline: "Le schéma Recipe déclenche toujours des résultats enrichis",
    reason: "Les résultats enrichis de recettes restent bien visibles et disputés.",
    recommendation:
      "Indiquez si possible image, prepTime, cookTime, totalTime, recipeIngredient, recipeInstructions et nutrition. L’auteur et datePublished renforcent les signaux E-E-A-T.",
  },
  Article: {
    headline: "Schéma Article recommandé",
    reason:
      "Le schéma Article sert de base à la vérification des entités par le mode IA et au carrousel d’actualités et d’articles. Associé à un schéma Person pour l’auteur, il fait partie des signaux E-E-A-T que vous pouvez fournir.",
    recommendation:
      "Il est recommandé d’associer Article à un objet Person intégré pour l’auteur (avec des URL sameAs vers ses profils) et de garder datePublished et dateModified exacts.",
  },
  Product: {
    headline: "Les résultats enrichis Product restent solides",
    reason:
      "Le schéma Product reste une source importante pour les résultats enrichis d’achat, les achats assistés par IA et les fiches de connaissances produit.",
    recommendation:
      "Indiquez les offres (prix, disponibilité, priceValidUntil), une note agrégée issue de vrais avis, la marque, le GTIN, le MPN ou le SKU si vous les avez, et une image. Pas de faux avis : la règle de Google contre l’abus de réputation de site s’applique.",
  },
  LocalBusiness: {
    headline: "Le schéma LocalBusiness compte pour le SEO local",
    reason:
      "LocalBusiness alimente le panneau de connaissances, les résultats Maps et les réponses locales des aperçus IA.",
    recommendation:
      "Faites correspondre exactement le NAP (nom, adresse, téléphone) à votre fiche Google Business Profile. Utilisez le sous-type le plus précis (Restaurant, Plumber, Dentist) plutôt que LocalBusiness.",
  },
  Event: {
    headline: "Les résultats enrichis Event s’affichent dans des carrousels dédiés",
    reason: "Le schéma Event alimente toujours les carrousels d’événements de Google.",
    recommendation:
      "Indiquez startDate, endDate, location (un Place avec adresse), organizer, eventStatus et eventAttendanceMode (en ligne, sur place ou les deux).",
  },
  Organization: {
    headline: "Le schéma Organization alimente le panneau de connaissances et la confiance des IA",
    reason:
      "Il aide à faire reconnaître la marque comme entité, pour le panneau de connaissances et la vérification des sources par les IA.",
    recommendation:
      "Indiquez le logo, sameAs (chaque réseau social, et Wikipédia ou Crunchbase si vous y figurez), foundingDate et les fondateurs si c’est pertinent. Utilisez un « name » identique au nom de votre marque.",
  },
  Book: {
    headline: "Book Actions : prise en charge incertaine",
    reason:
      "La prise en charge des données structurées Book Actions par Google a évolué ; leur couverture n’est pas fiable.",
    recommendation:
      "Si vous utilisez Book, prévoyez aussi un schéma Article ou Product pour la même page.",
  },
  ClaimReview: {
    headline: "Prise en charge de ClaimReview réduite",
    reason:
      "Google a restreint ClaimReview à un petit nombre d’éditeurs de vérification des faits reconnus ; ailleurs, il ne déclenche plus d’affichage.",
    recommendation:
      "Laissez ClaimReview de côté, sauf si vous êtes un éditeur de vérification des faits reconnu (inscrit à l’IFCN ou équivalent).",
  },
  Dataset: {
    headline: "Dataset retiré des rapports de la Search Console",
    reason:
      "Les rapports de résultats enrichis Dataset ne sont plus fournis ; le balisage reste valide mais n’apparaît plus dans les rapports.",
    recommendation:
      "Vous pouvez continuer à utiliser Dataset pour les jeux de données de recherche, sans attendre de visibilité dans la Search Console.",
  },
};

/** For a type with no advisory. */
export const NO_ADVISORY_FR: AdvisoryText = {
  headline: "Pas d’avis particulier pour ce type",
  reason: "",
  recommendation: "",
};
