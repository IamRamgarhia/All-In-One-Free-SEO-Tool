/**
 * The citation tactics in French, keyed like ai-citation-tactics.ts:
 * platform, then tactic id; niche, then platform for the priority reasons.
 * Shown when the interface is French; a test keeps the keys in step.
 *
 * Figures quoted in the English table without a source (shares of
 * citations, click-through changes, word counts) are left out here: the
 * French text keeps the point and drops the number.
 */
import type { PlatformTactics } from "./ai-citation-tactics";

type Platform = PlatformTactics["platform"];

export type PlatformTacticsFr = {
  audienceShare: string;
  citationBias: string;
  tactics: Record<string, { title: string; detail: string }>;
};

export const PLATFORM_TACTICS_FR: Record<Platform, PlatformTacticsFr> = {
  ChatGPT: {
    audienceShare:
      "L’assistant d’IA le plus utilisé. Ses citations penchent vers Wikipédia, les grands médias, les fils Reddit et les listes « meilleurs … » durables.",
    citationBias:
      "Des sources reconnues et de référence. Les domaines cités varient peu d’un sujet à l’autre.",
    tactics: {
      wiki: {
        title: "Obtenir une mention sur Wikipédia",
        detail:
          "ChatGPT cite souvent Wikipédia. Visez une mention dans un article Wikipédia de votre domaine, avec de vraies modifications et de vraies sources, jamais de publicité.",
      },
      "major-media": {
        title: "Viser régulièrement une mention dans un grand média",
        detail:
          "Forbes, TechCrunch, BBC, Le Monde, etc. Une seule citation dans un article pertinent peut vous faire entrer dans les sources que ChatGPT reprend.",
      },
      listicle: {
        title: "Figurer dans les listes « meilleurs … » durables",
        detail:
          "Cherchez les listes « meilleurs [votre catégorie] » qui se classent en première page. Écrivez à leurs auteurs avec une présentation d’un paragraphe et ce qui vous distingue. Ces listes comptent parmi les sources que ChatGPT reprend volontiers.",
      },
      "company-page": {
        title: "Tenir à jour une page de présentation claire",
        detail:
          "ChatGPT reprend un résumé de quelques phrases sur qui vous êtes. Faites concorder votre page « À propos », votre fiche Crunchbase et votre page LinkedIn : ce sont les sources qu’il consulte.",
      },
      "reddit-mid": {
        title: "Priorité moyenne : Reddit",
        detail:
          "ChatGPT cite Reddit, mais moins que Perplexity. Quelques messages utiles et bien notés qui mentionnent votre outil suffisent.",
      },
    },
  },
  Perplexity: {
    audienceShare:
      "Assistant d’IA en forte croissance pour les questions qui ressemblent à des recherches Google. Ses citations penchent vers les communautés et les retours d’expérience.",
    citationBias:
      "Une grande part de ses citations vient de Reddit et de YouTube : fils des subreddits de votre domaine et tutoriels vidéo.",
    tactics: {
      "reddit-heavy": {
        title: "Reddit est votre levier le plus fort",
        detail:
          "Installez une présence durable dans deux ou trois subreddits de votre domaine : des commentaires vraiment utiles, et une mention de votre produit seulement quand elle est pertinente. Ne cherchez pas à accumuler du karma : les votes de la communauté comptent.",
      },
      youtube: {
        title: "Publier ou parrainer des vidéos YouTube",
        detail:
          "Perplexity reprend des passages horodatés et des transcriptions de vidéos YouTube. Un tutoriel bien classé peut être cité longtemps. Soignez les sous-titres : des sous-titres relus valent mieux que ceux générés automatiquement.",
      },
      ama: {
        title: "Organiser une session de questions-réponses (AMA) dans un subreddit pertinent",
        detail:
          "Les AMA entrent dans les sources de Perplexity parce qu’elles produisent des fils de commentaires denses, centrés sur le sujet et très suivis.",
      },
      "comparison-content": {
        title: "Écrire des pages comparatives « X ou Y »",
        detail:
          "Perplexity reprend volontiers les comparatifs présentés en tableaux clairs. Comparez honnêtement, concurrents compris, même quand vous n’êtes pas devant : c’est ce qui inspire confiance.",
      },
    },
  },
  Claude: {
    audienceShare:
      "Moins d’utilisateurs, mais un public influent : développeurs, chercheurs, métiers du savoir.",
    citationBias:
      "Documentation officielle, Wikipédia, dépôts GitHub, sources primaires. Moins de Reddit. Une nette préférence pour les sources de première main.",
    tactics: {
      docs: {
        title: "Tenir une documentation officielle irréprochable",
        detail:
          "Claude cite volontiers votre documentation si elle est propre, bien structurée et en HTML sémantique. Des pages autonomes avec des H2 et H3 clairs sont plus faciles à citer.",
      },
      github: {
        title: "Publier un projet open source utile",
        detail:
          "Même un petit dépôt (un outil en ligne de commande, une bibliothèque, un modèle de démarrage) peut vous faire entrer dans les sources de Claude, car GitHub est largement indexé.",
      },
      "primary-data": {
        title: "Publier des études ou des données originales",
        detail:
          "Enquêtes, mesures comparatives, études originales. Claude préfère les sources primaires citables aux commentaires de seconde main. Une étude bien sourcée par an finit par compter.",
      },
      "wikipedia-claude": {
        title: "Wikipédia",
        detail:
          "Même démarche que pour ChatGPT : obtenir une mention sur Wikipédia. Claude s’appuie beaucoup sur Wikipédia.",
      },
    },
  },
  "Gemini / AI Mode": {
    audienceShare:
      "Intégré directement à la recherche Google : la plus large audience pour les recherches classiques.",
    citationBias:
      "Ce qui se classe dans Google. Les données structurées (pour vérifier les entités), les signaux E-E-A-T et la fraîcheur comptent beaucoup.",
    tactics: {
      ranking: {
        title: "Se classer d’abord dans la recherche Google classique",
        detail:
          "Gemini et le mode IA puisent surtout dans les premiers résultats de Google. Le SEO classique reste la base : mots-clés ciblés, maillage interne, hygiène technique, contenu à jour.",
      },
      schema: {
        title: "Mettre en place les schémas Article et Person ensemble",
        detail:
          "Gemini se sert des données structurées pour vérifier les entités. Il est recommandé d’associer un schéma Article à un objet Person complet pour l’auteur (avec ses liens sameAs).",
      },
      freshness: {
        title: "Afficher la date de dernière mise à jour",
        detail:
          "Gemini favorise les contenus dont la date de modification (dateModified) est récente, dans le schéma comme sur la page. Revoyez régulièrement vos anciens contenus.",
      },
      "structured-answers": {
        title: "Utiliser des formats de réponse structurés",
        detail:
          "Tableaux, listes de définitions, étapes numérotées : le mode IA les reprend directement dans ses réponses.",
      },
    },
  },
  "Google AI Overviews": {
    audienceShare:
      "S’affiche sur une part importante des recherches. Il réduit les clics vers les résultats classiques, mais être cité dans l’aperçu peut vous en apporter.",
    citationBias:
      "Des passages autonomes qui répondent entièrement à la question. Des données structurées pour vérifier les entités.",
    tactics: {
      passages: {
        title: "Construire des passages prêts à être cités",
        detail:
          "Il est recommandé que chaque section H2 contienne au moins une réponse autonome de longueur moyenne. L’optimiseur de passages pour les aperçus IA de cet outil les note et les réécrit.",
      },
      definitions: {
        title: "Ouvrir chaque section par une définition directe",
        detail:
          "Commencez par « X est … » ou « X mesure … » : les IA citent volontiers ce type d’ouverture.",
      },
      concrete: {
        title: "Citer des chiffres réels et des noms propres",
        detail:
          "Des chiffres précis et des noms propres, régulièrement dans le texte. Les exemples hypothétiques sont moins repris.",
      },
      "person-schema": {
        title: "Un schéma Person pour l’auteur",
        detail:
          "Les aperçus IA vérifient l’auteur en tant qu’entité. Utilisez le générateur de schéma Person de cet outil et intégrez-le dans votre schéma Article.",
      },
    },
  },
};

/** Why each platform comes first for a niche. "universal" is the no-niche list. */
export const PRIORITY_REASONS_FR: Record<string, Partial<Record<Platform, string>>> = {
  saas: {
    Claude:
      "Le public de Claude compte beaucoup de développeurs et de chefs de produit qui évaluent des outils : une intention forte.",
    Perplexity: "Les recherches comparatives (« X ou Y ») passent beaucoup par Perplexity pour les SaaS.",
    ChatGPT: "Une large audience pour la notoriété ; Wikipédia et les listes « meilleurs … » se renforcent avec le temps.",
  },
  local: {
    "Gemini / AI Mode":
      "Les recherches à intention locale passent par le mode IA de Google, qui reprend directement le schéma LocalBusiness.",
    "Google AI Overviews": "Les aperçus IA locaux citent beaucoup la fiche Google Business Profile et les citations locales.",
  },
  ecommerce: {
    "Google AI Overviews":
      "Les aperçus IA à intention d’achat s’appuient sur le schéma Product et les avis.",
    Perplexity:
      "Les acheteurs qui comparent passent beaucoup par Perplexity ; les avis sur YouTube y pèsent.",
    ChatGPT: "Une large audience pour faire connaître vos produits.",
  },
  blog: {
    "Google AI Overviews":
      "Un blog vit surtout de recherches informationnelles : être cité dans l’aperçu IA, c’est du trafic.",
    ChatGPT: "Figurer dans des listes « meilleurs … » et sur Wikipédia pour les sujets durables.",
  },
  services: {
    "Google AI Overviews":
      "Les recherches de services (« comment … », « meilleur [service] près de chez moi ») déclenchent de plus en plus d’aperçus IA.",
    "Gemini / AI Mode": "La reconnaissance des entités locales et des services compte ici.",
  },
  universal: {
    "Google AI Overviews": "La surface de citation la plus large, toutes niches confondues.",
    ChatGPT: "L’assistant d’IA le plus utilisé.",
    Perplexity: "En forte croissance pour les questions de type recherche.",
  },
};
