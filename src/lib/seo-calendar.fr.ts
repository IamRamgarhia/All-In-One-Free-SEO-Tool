/**
 * French text of the 30-day calendar (seo-calendar.ts), keyed by the
 * English title of each fixed step: [title, why it matters]. The steps
 * whose title carries a value (an audit finding, a query, a city) are
 * written in French where they are built. `seo-calendar.test.ts` fails
 * when a fixed step has no entry here.
 *
 * No figure without a source: the plan goes to the client.
 */

export const CALENDAR_FR: Record<string, [string, string]> = {
  "Review GSC: Coverage errors and indexing issues": [
    "Search Console : relire les erreurs de couverture et d’indexation",
    "Une page non indexée ne peut pas se positionner. On repère ces blocages avant de lancer le travail de contenu.",
  ],
  "Connect Google Search Console (10 min — unlocks half the tool)": [
    "Connecter Google Search Console (10 min)",
    "Gratuit et rapide : Search Console donne les vraies requêtes, positions et clics du site, dont dépend la suite du plan.",
  ],
  "Run a full site audit + log critical issues": [
    "Lancer l’audit complet du site et relever les problèmes critiques",
    "Un audit de départ rend chaque amélioration mesurable. Les blocages d’indexation ou d’affichage mobile passent avant le contenu.",
  ],
  "Review the site audit and pick the fixes to make first": [
    "Relire l’audit du site et choisir les corrections prioritaires",
    "L’audit de départ est fait : on retient ce qui bloque l’indexation ou la confiance, le reste attendra.",
  ],
  "Audit + fix all broken meta titles": [
    "Vérifier et corriger les balises title",
    "Le title est la ligne cliquable du résultat Google : un title absent ou mal écrit coûte des clics.",
  ],
  "Audit image alt-text gaps": [
    "Relever les images sans texte alternatif",
    "Le texte alternatif décrit l’image à Google et aux lecteurs d’écran.",
  ],
  "Check & resolve mobile-friendliness errors": [
    "Vérifier et corriger l’affichage mobile",
    "Google classe d’abord la version mobile des pages : un défaut d’affichage mobile pèse sur tout le site.",
  ],
  "Site-wide internal linking audit + fix orphan pages": [
    "Revoir le maillage interne et relier les pages orphelines",
    "Les liens internes indiquent à Google les pages importantes. Une page que rien ne relie est moins explorée.",
  ],
  "Generate sitemap.xml + submit to Bing/IndexNow": [
    "Mettre à jour le sitemap.xml et le soumettre à Bing / IndexNow",
    "Un sitemap à jour aide les moteurs à trouver les nouvelles pages ; IndexNow prévient Bing le jour même.",
  ],
  "Pull GSC striking-distance keywords (positions 4-15)": [
    "Relever dans Search Console les mots-clés proches du top (positions 4 à 15)",
    "Les mots-clés déjà en deuxième page demandent le moins d’effort pour progresser.",
  ],
  "Run keyword research from your top competitor + autocomplete fan-out": [
    "Rechercher des mots-clés à partir du principal concurrent et des suggestions Google",
    "Les mots-clés déjà en deuxième page demandent le moins d’effort pour progresser : on les repère en premier.",
  ],
  "Write 3 content briefs for your best keyword opportunities": [
    "Rédiger 3 briefs de contenu pour les meilleures opportunités de mots-clés",
    "Viser une opportunité réelle vaut mieux qu’écrire au hasard : les briefs partent des données de mots-clés.",
  ],
  "Run cannibalization detector — fix conflicts on top pages": [
    "Détecter la cannibalisation et régler les conflits sur les pages principales",
    "Deux pages qui visent la même requête se partagent les clics. On les fusionne ou on les différencie.",
  ],
  "Topic cluster review: identify 1 weak pillar + 3 supporting pages": [
    "Revoir les thématiques : un pilier faible et 3 pages de soutien",
    "L’autorité sur un sujet vient de pages reliées entre elles. Renforcer un groupe faible profite à tout le groupe.",
  ],
  "Content decay scan + plan 2 refreshes for next week": [
    "Repérer les contenus en perte de vitesse et prévoir 2 mises à jour",
    "Mettre à jour une page qui se positionne déjà coûte moins cher qu’en écrire une nouvelle.",
  ],
  "GBP: reply to every unanswered review (positive + negative)": [
    "Fiche Google : répondre à chaque avis sans réponse (positif ou négatif)",
    "Répondre aux avis montre une fiche suivie, rassure les futurs clients et compte pour le classement local.",
  ],
  "Set up Google Business Profile (yes, even for non-local)": [
    "Créer la fiche d’établissement Google",
    "Même sans clientèle locale, une fiche donne de la visibilité sur les recherches de la marque et dans Maps.",
  ],
  "GBP: post 1 update + upload 3 fresh photos": [
    "Fiche Google : publier une actualité et ajouter 3 photos récentes",
    "Les publications et les photos montrent que l’établissement est actif.",
  ],
  "Brand mention audit: top 10 places your brand is discussed online": [
    "Mentions de la marque : les 10 principaux endroits où on en parle en ligne",
    "Une mention sans lien est une demande de lien facile à faire.",
  ],
  "AI visibility check: run brand queries through ChatGPT, Perplexity, Gemini": [
    "Visibilité IA : tester les requêtes de la marque dans ChatGPT, Perplexity et Gemini",
    "Les assistants IA répondent de plus en plus à la place des moteurs : on vérifie s’ils citent le site.",
  ],
  "Optimize 1 page for AI Overview citation (chunked, factual, source-cited)": [
    "Préparer une page à être citée par les réponses IA (blocs courts, faits, sources)",
    "Les réponses IA reprennent des passages courts, factuels et sourcés : on restructure une page dans ce sens.",
  ],
  "Run a CrUX check on your top 3 pages (real-user CWV)": [
    "Vérifier les Core Web Vitals réels (CrUX) des 3 pages principales",
    "Lighthouse simule ; CrUX mesure ce que les vrais visiteurs ont vécu, et c’est ce que Google utilise.",
  ],
  "Weekly review + log wins/losses": [
    "Bilan de la semaine : gains et pertes",
    "20 minutes pour noter ce qui a marché et préparer la semaine suivante.",
  ],
  "Find 10 link prospects via free DuckDuckGo prospecting": [
    "Trouver 10 sites susceptibles de faire un lien",
    "Dix sites bien choisis valent mieux que cent inscriptions génériques.",
  ],
  "Send 5 personalised outreach emails using a template": [
    "Envoyer 5 demandes de lien personnalisées",
    "Un message écrit pour le site contacté obtient bien plus de réponses qu’un modèle envoyé à tous.",
  ],
  "GBP: post a customer story or case study": [
    "Fiche Google : publier un témoignage client ou une réalisation",
    "Un exemple concret parle davantage qu’une offre générique.",
  ],
  "Competitor SERP overlap: find 5 keywords you don't yet target": [
    "Concurrents : trouver 5 mots-clés qu’ils occupent et que le site ne vise pas encore",
    "Là où un concurrent se positionne, la demande existe déjà.",
  ],
  "Schema audit + add Organization, FAQPage, BreadcrumbList where missing": [
    "Données structurées : ajouter Organization, FAQPage, BreadcrumbList là où elles manquent",
    "Les données structurées rendent les pages éligibles aux résultats enrichis de Google.",
  ],
  "Image audit: compress + add WebP/AVIF on top 5 pages": [
    "Images : compresser et passer en WebP/AVIF sur les 5 pages principales",
    "Le poids des images est une cause fréquente d’affichage lent (LCP).",
  ],
  "Re-run audit + diff against day-2 baseline": [
    "Relancer l’audit et le comparer à celui de départ",
    "Chiffrer les progrès (problèmes résolus, évolution du score) rend le plan suivant plus facile à défendre.",
  ],
  "Generate monthly client report + send": [
    "Préparer le rapport mensuel du client et l’envoyer",
    "Le rapport montre le travail fait ; les données sont déjà dans l’outil.",
  ],
  "Plan next 30 days: re-generate calendar from current data": [
    "Préparer les 30 jours suivants : régénérer le planning avec les données du moment",
    "Chaque mois part du dernier audit et des dernières données Search Console, pas des hypothèses du mois précédent.",
  ],
};

/** severityRationale() in French. */
export function severityRationaleFr(severity: string): string {
  switch (severity) {
    case "critical":
      return "Critique. Ce problème peut empêcher des pages d’être indexées ou de se positionner : il passe avant tout le reste.";
    case "high":
      return "Impact élevé. À corriger avant le travail de contenu, car il affaiblit des pages qui existent déjà.";
    case "medium":
      return "À corriger. Ce n’est pas bloquant à lui seul, mais cela coûte des clics ou de la clarté.";
    default:
      return "Faible gravité. Un rangement plutôt qu’un problème de positionnement : à faire une fois le plus important traité.";
  }
}

/**
 * What to fix, for the crawler's finding types that have no task
 * blueprint in audit-to-task.fr.ts. `where` is a path or "N pages".
 */
export const CRAWLER_FIX_FR: Record<string, (where: string) => string> = {
  article_missing_author: (w) => `Indiquer l’auteur des articles (${w})`,
  blocked_by_robots: (w) => `Débloquer dans robots.txt les pages à indexer (${w})`,
  blocked_url: (w) => `Vérifier les adresses bloquées (${w})`,
  broken_link: (w) => `Réparer les liens cassés (${w})`,
  canonical_chain: (w) => `Supprimer les chaînes de canoniques (${w})`,
  crawl_delay_applied: () => "Retirer le Crawl-delay de robots.txt s’il n’est pas nécessaire",
  duplicate_meta_description: (w) => `Écrire une méta-description propre à chaque page (${w})`,
  duplicate_title: (w) => `Écrire un title propre à chaque page (${w})`,
  facet_trap: (w) => `Empêcher l’exploration des filtres sans fin (${w})`,
  heading_order: (w) => `Remettre les titres h1 à h6 dans l’ordre (${w})`,
  heavy_html_payload: (w) => `Alléger le HTML des pages (${w})`,
  hreflang_not_reciprocal: (w) => `Rendre les hreflang réciproques (${w})`,
  image_missing_dimensions: (w) => `Indiquer largeur et hauteur des images (${w})`,
  inconsistent_hreflang: (w) => `Corriger les hreflang incohérents (${w})`,
  invalid_canonical: (w) => `Corriger les balises canoniques invalides (${w})`,
  invalid_robots_txt: () => "Corriger la syntaxe du fichier robots.txt",
  js_rendered_only: (w) => `Rendre le contenu lisible sans JavaScript (${w})`,
  missing_ai_crawler_policy: () => "Indiquer dans robots.txt la règle pour les robots des IA",
  missing_h1: (w) => `Ajouter un titre h1 (${w})`,
  missing_twitter_card: (w) => `Ajouter les balises de partage Twitter / X (${w})`,
  mixed_content: (w) => `Supprimer le contenu mixte HTTP sur ${w}`,
  next_chunk_explosion: () => "Réduire le nombre de fichiers JavaScript chargés (Next.js)",
  next_powered_by_header: () => "Masquer l’en-tête X-Powered-By (Next.js)",
  next_raw_img_tags: (w) => `Passer les images par next/image (${w})`,
  no_lazy_loading: (w) => `Charger les images hors écran à la demande (${w})`,
  non_self_canonical: (w) => `Vérifier les canoniques qui pointent ailleurs (${w})`,
  old_image_formats: (w) => `Convertir les images en WebP ou AVIF (${w})`,
  orphan_pages: (w) => `Relier les pages orphelines au reste du site (${w})`,
  partial_ai_crawler_policy: () => "Compléter dans robots.txt la règle pour les robots des IA",
  render_blocking_scripts: (w) => `Différer les scripts qui bloquent l’affichage (${w})`,
  shopify_collections_all: () => "Retirer /collections/all de l’index (Shopify)",
  shopify_liquid_debug: (w) => `Supprimer les traces de débogage Liquid (${w})`,
  slow_response: (w) => `Accélérer la réponse du serveur (${w})`,
  soft_404: (w) => `Corriger les pages vides qui répondent 200 (${w})`,
  spa_empty_body: (w) => `Servir le contenu dans le HTML initial (${w})`,
  stale_content: (w) => `Mettre à jour les contenus anciens (${w})`,
  viewport_blocks_zoom: (w) => `Autoriser le zoom sur mobile (${w})`,
  weak_anchor_text: (w) => `Rendre les textes de lien explicites (${w})`,
  wp_author_archive_indexed: () => "Désindexer les archives d’auteur (WordPress)",
  wp_default_permalinks: () => "Passer les permaliens en adresses lisibles (WordPress)",
  wp_emoji_bloat: () => "Désactiver le script des emojis (WordPress)",
  wp_heartbeat_on_frontend: () => "Désactiver Heartbeat côté visiteurs (WordPress)",
  wp_missing_block_styles: () => "Vérifier le chargement des styles de blocs (WordPress)",
  wp_multiple_seo_plugins: () => "Garder une seule extension SEO (WordPress)",
  wp_plugin_bloat: () => "Réduire les extensions chargées sur chaque page (WordPress)",
  wp_rest_api_advertised: () => "Masquer le lien vers l’API REST (WordPress)",
  wp_version_disclosed: () => "Masquer la version de WordPress",
  wp_xmlrpc_exposed: () => "Désactiver xmlrpc.php (WordPress)",
  xrobots_noindex: (w) => `Vérifier l’en-tête X-Robots-Tag noindex (${w})`,
};
