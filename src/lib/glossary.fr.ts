/**
 * French definitions of the glossary terms (glossary.ts), keyed like the
 * English table. Shown in the term tooltips when the interface is French.
 */
import type { Definition } from "./glossary";

export const GLOSSARY_FR: Record<string, Definition> = {
  // Balises et code
  "title tag": {
    short: "Le titre cliquable de votre page dans les résultats de recherche.",
    why: "C’est l’un des principaux indices que Google lit pour comprendre le sujet d’une page. Visez 50 à 60 caractères.",
  },
  title: {
    short: "Le titre cliquable de votre page dans les résultats de recherche.",
    why: "Visez 50 à 60 caractères, avec le mot-clé principal vers le début.",
  },
  "meta description": {
    short: "Le résumé affiché sous le title dans les résultats de recherche.",
    why: "Ce n’est pas un facteur de classement direct, mais elle peut donner envie de cliquer. 120 à 155 caractères.",
  },
  canonical: {
    short:
      "L’URL canonique : elle indique à Google la version principale d’une page quand des pages proches existent.",
    why: "Sans elle, Google choisit lui-même l’URL de référence et peut répartir vos signaux de classement entre plusieurs adresses.",
  },
  viewport: {
    short:
      "Indique aux navigateurs mobiles comment mettre la page à l’échelle pour qu’elle s’affiche bien sur téléphone.",
    why: "Sans elle, votre site s’affiche mal sur mobile, alors que Google indexe d’abord la version mobile.",
  },
  schema: {
    short: "Les données structurées (JSON-LD) qui décrivent à Google le contenu de votre page.",
    why: "Elles rendent la page éligible aux résultats enrichis (étoiles d’avis, FAQ, fiches produit), sans garantie que Google les affiche.",
  },
  "json-ld": {
    short: "JSON-LD est le format recommandé par Google pour les données structurées.",
    why: "Il se place dans une balise <script type='application/ld+json'> et ne modifie pas l’affichage de la page.",
  },
  hreflang: {
    short: "Une balise qui indique à Google la langue ou le pays visé par une page.",
    why: "Utile pour les sites en plusieurs langues ou pays : sans elle, Google peut montrer la mauvaise version à un internaute.",
  },
  noindex: {
    short:
      "Une directive qui demande à Google de ne pas afficher la page dans les résultats de recherche.",
    why: "Adaptée aux pages de préproduction, de connexion ou de remerciement ; à éviter presque partout ailleurs.",
  },
  "open graph": {
    short: "Les balises qui définissent l’aperçu de votre page quand elle est partagée sur les réseaux sociaux.",
    why: "Sans balises Open Graph, l’aperçu sur LinkedIn, Facebook ou Slack s’affiche sans image ni texte choisis.",
  },
  "robots.txt": {
    short:
      "Un fichier à la racine du site qui indique aux robots d’exploration ce qu’ils peuvent explorer ou non.",
    why: "Un robots.txt mal réglé peut faire disparaître tout le site des résultats. On y indique aussi l’adresse du sitemap.",
  },
  sitemap: {
    short: "Un fichier XML qui liste les URL que vous voulez faire connaître à Google.",
    why: "Il aide Google à découvrir vos pages plus vite, surtout sur les grands sites et pour les pages récentes.",
  },

  // Performance
  "core web vitals": {
    short: "Les trois mesures de Google sur l’expérience de page : LCP, INP et CLS.",
    why: "De mauvais résultats peuvent peser sur le classement et sur les ventes des pages commerciales.",
  },
  lcp: {
    short: "Largest Contentful Paint : le temps d’affichage du contenu principal.",
    why: "Visez moins de 2,5 s. On l’améliore le plus souvent en optimisant l’image principale.",
  },
  inp: {
    short:
      "Interaction to Next Paint : la rapidité avec laquelle la page réagit à un clic.",
    why: "Visez moins de 200 ms. Un JavaScript trop lourd en est la cause la plus fréquente.",
  },
  cls: {
    short:
      "Cumulative Layout Shift : à quel point la page bouge pendant son chargement.",
    why: "Visez moins de 0,1. Souvent dû à des images sans dimensions ou à des publicités chargées tardivement.",
  },
  hsts: {
    short:
      "HTTP Strict Transport Security : un en-tête qui impose HTTPS aux visiteurs qui reviennent.",
    why: "Protège contre le retour forcé en HTTP. Simple à mettre en place.",
  },
  csp: {
    short:
      "Content Security Policy : un en-tête qui limite les scripts et les styles autorisés à se charger.",
    why: "Protège contre les attaques XSS. C’est l’en-tête de sécurité le plus délicat à mettre en place.",
  },

  // Notions
  "e-e-a-t": {
    short:
      "Expérience, expertise, autorité, fiabilité : la grille de qualité de Google.",
    why: "Des auteurs réels et qualifiés inspirent plus confiance qu’un contenu anonyme, surtout pour les sujets YMYL.",
  },
  "long-tail": {
    short:
      "Longue traîne : des mots-clés précis, en plusieurs mots, moins recherchés mais aux intentions plus claires.",
    why: "« chaussures de course pour pieds plats » convient mieux à un site spécialisé que « chaussures ».",
  },
  cannibalization: {
    short:
      "Cannibalisation : plusieurs pages de votre site visent le même mot-clé.",
    why: "Google hésite sur la page à classer ; une seule page ciblée se classe souvent mieux que plusieurs pages concurrentes.",
  },
  "striking distance": {
    short: "Mots-clés à portée : ceux qui se classent aujourd’hui entre la 4e et la 15e position.",
    why: "De petites améliorations peuvent les faire passer en première page, là où se concentrent les clics.",
  },
  "content decay": {
    short: "Érosion du contenu : une page bien classée qui perd du trafic au fil du temps.",
    why: "Mettre à jour une page existante coûte en général moins cher que d’en écrire une nouvelle.",
  },
  "topic cluster": {
    short:
      "Cocon thématique : une page pilier sur un sujet large, entourée d’articles qui la complètent et renvoient vers elle.",
    why: "Il montre que votre site couvre un sujet en profondeur, ce que Google valorise dans ses mises à jour sur le contenu utile.",
  },
  "people also ask": {
    short:
      "« Autres questions posées » : les encadrés de questions dépliables que Google affiche dans les résultats.",
    why: "Chaque question est une idée de contenu ; y répondre sur votre page peut vous permettre d’y apparaître.",
  },
  paa: {
    short: "People Also Ask (« Autres questions posées ») : les encadrés de questions affichés par Google.",
    why: "Chaque question est une idée de contenu.",
  },
  serp: {
    short:
      "Search Engine Results Page : la page de résultats que Google affiche pour une recherche.",
    why: "Elle contient aujourd’hui des annonces, des aperçus IA, des questions, des carrousels d’images, et pas seulement des liens bleus.",
  },
  "ai overview": {
    short:
      "Aperçu IA (AI Overview) : la réponse rédigée par l’IA de Google en haut de certains résultats.",
    why: "Quand il apparaît, il peut réduire les clics vers les résultats classiques.",
  },

  // Intention de recherche
  informational: {
    short:
      "Intention de recherche : l’internaute veut apprendre ou comprendre quelque chose.",
    why: "Répondez par des tutoriels, des guides, des définitions, sans pousser à l’achat.",
  },
  commercial: {
    short:
      "Intention de recherche : l’internaute se renseigne avant une décision d’achat.",
    why: "Répondez par des comparatifs, des avis, des sélections.",
  },
  transactional: {
    short: "Intention de recherche : l’internaute est prêt à acheter ou à agir.",
    why: "Répondez par des fiches produit, des tarifs, des formulaires d’inscription.",
  },
  navigational: {
    short: "Intention de recherche : l’internaute cherche un site ou une marque précise.",
    why: "Vérifiez que votre page d’accueil et vos pages clés se classent sur votre propre nom de marque.",
  },

  // Autorité
  "domain authority": {
    short:
      "Un score de 0 à 100 qui estime la capacité d’un site à se classer, d’après ses liens entrants.",
    why: "Créé par Moz, ce n’est pas une mesure de Google. Utile comme ordre de grandeur de la force d’un site.",
  },
  da: {
    short:
      "Domain Authority : un score de 0 à 100 qui estime la capacité d’un site à se classer.",
    why: "Utile comme ordre de grandeur. Ce n’est pas une mesure de Google.",
  },
  dr: {
    short:
      "Domain Rating : l’équivalent du Domain Authority chez Ahrefs, sur une échelle de 0 à 100.",
    why: "Même principe : un indicateur de la force des liens d’un site, d’après ses liens entrants.",
  },

  // Liens entrants
  backlink: {
    short: "Backlink (lien entrant) : un lien d’un autre site vers le vôtre.",
    why: "Les liens entrants restent un signal de classement important. La qualité compte plus que la quantité.",
  },
  disavow: {
    short:
      "Désaveu : demander à Google d’ignorer certains liens entrants quand il évalue votre site.",
    why: "Sert à se défendre contre des liens toxiques. À utiliser avec parcimonie : selon Google, la plupart des liens de spam sont déjà ignorés automatiquement.",
  },

  // Outils SEO
  gsc: {
    short:
      "Google Search Console : l’outil gratuit de Google pour suivre votre site dans les résultats de recherche.",
    why: "Clics, impressions, requêtes et indexation, gratuitement. Il est recommandé d’y connecter chacun de vos sites.",
  },
  ga4: {
    short: "Google Analytics 4 : la version actuelle de Google Analytics.",
    why: "Mesure le comportement des visiteurs, les conversions et les sources de trafic. Gratuit.",
  },
  ctr: {
    short:
      "Taux de clic (CTR) : clics ÷ impressions, soit la part des internautes qui ont cliqué sur votre résultat après l’avoir vu.",
    why: "Un taux de clic faible sur une bonne position signale souvent un title ou une méta-description peu attractifs. Facile à tester et à améliorer.",
  },
  impression: {
    short:
      "Une impression correspond à une apparition de votre site dans les résultats de recherche d’un internaute, qu’il ait cliqué ou non.",
  },
  position: {
    short:
      "Le rang moyen dans les résultats pour une requête. La position 1 est le premier résultat naturel.",
    why: "Le taux de clic baisse nettement à mesure que l’on descend dans les résultats : les premières places concentrent l’essentiel des clics.",
  },
  "core-web-vitals": {
    short:
      "Les trois mesures de vitesse et d’ergonomie de Google : LCP (chargement), INP (réactivité), CLS (stabilité).",
    why: "Google les compte parmi ses signaux de classement depuis 2021. PageSpeed Insights mesure les trois gratuitement.",
  },
  cwv: {
    short:
      "Core Web Vitals : les trois mesures de vitesse et d’ergonomie de Google, LCP, INP et CLS.",
  },
  "structured-data": {
    short:
      "Données structurées : des balises qui décrivent à Google le contenu de votre page (recette, produit, FAQ, article…) pour qu’il puisse afficher des résultats enrichis.",
    why: "Elles peuvent ajouter des étoiles, des prix ou des questions à votre extrait dans les résultats, si Google choisit de les afficher.",
  },
  "rich-result": {
    short:
      "Résultat enrichi : un extrait de recherche amélioré (étoiles, prix, images…) obtenu grâce aux données structurées.",
  },
  e_e_a_t: {
    short:
      "Expérience, expertise, autorité, fiabilité : la grille de Google pour évaluer la qualité d’un contenu.",
    why: "Elle compte surtout pour les contenus médicaux, financiers ou juridiques (YMYL). Des auteurs réels et qualifiés inspirent plus confiance.",
  },
  ymyl: {
    short:
      "Your Money or Your Life : les sujets où un mauvais conseil peut nuire aux personnes (santé, finances, droit).",
    why: "Google se montre plus exigeant sur la qualité de ces contenus ; l’E-E-A-T y pèse davantage.",
  },
  helpful_content: {
    short:
      "Contenu utile : le principe de Google qui favorise les contenus écrits d’abord pour les lecteurs, et non pour les moteurs de recherche.",
    why: "Les mises à jour « Helpful Content » peuvent déclasser tout un site qui publie des pages pauvres, générées en masse ou surchargées de liens d’affiliation.",
  },
  "internal-link": {
    short: "Lien interne : un lien d’une page de votre site vers une autre page de votre site.",
    why: "Il répartit les signaux de classement entre vos pages et aide Google à trouver les nouveaux contenus.",
  },
  "external-link": {
    short: "Lien externe : un lien de votre site vers un autre site.",
  },
  anchor: {
    short:
      "Texte d’ancre : les mots cliquables d’un lien. Ils indiquent à Google le sujet de la page liée.",
    why: "Une ancre descriptive (« meilleures machines à expresso ») est plus parlante qu’une ancre générique (« cliquez ici »).",
  },
  "robots-txt": {
    short:
      "Un fichier texte à l’adresse /robots.txt qui indique aux robots d’exploration les chemins qu’ils peuvent ou non consulter.",
    why: "Une règle erronée peut faire disparaître tout le site des résultats. Il est prudent de tester chaque modification avant de la publier.",
  },
  "ai-overview": {
    short:
      "Aperçus IA (AI Overviews) : les réponses rédigées par l’IA qui s’affichent au-dessus des résultats de recherche.",
    why: "Un contenu découpé en blocs faciles à citer (listes, définitions, réponses directes) a plus de chances d’y être repris.",
  },
  llms_txt: {
    short:
      "Un standard proposé récemment, à l’adresse /llms.txt : il indique aux assistants IA le sujet de votre site et ce qu’il faut lire.",
    why: "Encore expérimental et non reconnu par tous les assistants. L’adopter coûte peu.",
  },
  "topical-authority": {
    short:
      "Autorité thématique : à quel point vous couvrez un sujet en profondeur, en publiant de nombreux contenus liés sur un même thème.",
    why: "Un site qui couvre un sujet en profondeur se classe souvent mieux qu’un concurrent qui n’y consacre qu’une page.",
  },
  "striking-distance": {
    short:
      "Mots-clés à portée : ceux classés entre la 4e et la 15e position avec un volume d’impressions notable ; de petites retouches suffisent souvent à les faire passer en première page.",
    why: "Ce sont souvent les gains de classement les moins coûteux. Par défaut, traitez cette liste avant de viser de nouveaux mots-clés.",
  },
  "content-decay": {
    short:
      "Érosion du contenu : des pages autrefois bien classées qui perdent du trafic au fil du temps.",
    why: "Mettre à jour une page existante est en général plus rapide que de faire classer une nouvelle page.",
  },
  "page-experience": {
    short:
      "Expérience de page : le terme de Google qui regroupe les signaux d’ergonomie (Core Web Vitals, compatibilité mobile, HTTPS, absence d’interstitiels intrusifs).",
  },
  redirect: {
    short:
      "Redirection : une URL qui renvoie les visiteurs vers une autre URL. 301 = permanente (à privilégier pour le SEO), 302 = temporaire.",
    why: "Les chaînes de redirections (plus d’un saut) consomment du budget d’exploration et ralentissent les visiteurs.",
  },
  "crawl-budget": {
    short:
      "Budget d’exploration : le nombre de pages que Google explore sur votre site chaque jour. Les grands sites qui ont plus d’autorité en reçoivent davantage.",
    why: "Le gaspiller sur des pages mortes, des redirections ou des URL inutiles retarde l’indexation des nouveaux contenus.",
  },
};
