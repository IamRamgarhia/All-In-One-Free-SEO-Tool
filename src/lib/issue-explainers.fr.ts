/**
 * French text of the issue explainers (issue-explainers.ts and
 * issue-explainers-tech.ts), keyed by finding type. Only the prose is
 * here; links, snippets' code and confidence stay in the English tables.
 */
export type ExplainerTextFr = {
  whatIsIt: string;
  whyItMatters: string;
  howToFix: string[];
  /** snippet.where / snippet.undo / snippet.caution, when the English has them */
  snippetWhere?: string;
  snippetUndo?: string;
  snippetCaution?: string;
  /** externalTool label(s) when the English has a fixed label */
  externalToolLabel?: string;
};

export const ISSUE_EXPLAINERS_FR: Record<string, ExplainerTextFr> = {
  // ===================================================================
  // issue-explainers.ts
  // ===================================================================

  missing_title: {
    whatIsIt:
      "Cette page n’a pas de balise <title>. Google s’en sert pour le titre bleu cliquable affiché dans les résultats de recherche.",
    whyItMatters:
      "Sans title, Google peut en inventer un à partir du contenu de la page, souvent mal. Le titre affiché ne dit alors plus ce que vous vouliez dire.",
    howToFix: [
      "Ajouter dans le <head> un <title> unique de 50 à 60 caractères.",
      "Commencer par le mot-clé principal, finir par le nom de la marque.",
      "Décrire CETTE page, et non le site dans son ensemble.",
    ],
    externalToolLabel: "Vérifier avec l’outil d’inspection d’URL de Google",
  },
  long_title: {
    whatIsIt:
      "Votre <title> dépasse 60 caractères environ : Google risque de le couper dans les résultats de recherche.",
    whyItMatters:
      "Un title coupé s’arrête en plein mot sur « … » et masque souvent le mot-clé qui a déclenché la recherche.",
    howToFix: [
      "Le ramener à 50 à 60 caractères au maximum.",
      "Supprimer les adjectifs, les noms de marque et les mots vides.",
      "Le tester dans l’aperçu Google de l’outil avant de publier.",
    ],
  },
  short_title: {
    whatIsIt:
      "Votre <title> fait moins de 30 caractères environ et n’utilise pas la place que Google vous laisse.",
    whyItMatters:
      "Un title court laisse passer des occasions de correspondre aux recherches et paraît maigre dans les résultats, à côté des titles plus complets des concurrents.",
    howToFix: [
      "Viser 50 à 60 caractères.",
      "Ajouter un précisant descriptif (lieu, année, public visé).",
      "Ne pas le gonfler de mots-clés : Google le réécrirait.",
    ],
  },
  missing_meta_description: {
    whatIsIt:
      "Cette page n’a pas de balise <meta name=\"description\">. Google peut alors reprendre un extrait pris au hasard dans le texte de la page.",
    whyItMatters:
      "Une bonne méta-description joue le rôle d’un texte d’annonce dans les résultats de recherche. Sans elle, vous ne choisissez pas ce que l’internaute lit sous votre titre.",
    howToFix: [
      "Ajouter dans le <head> une balise <meta name=\"description\"> de 140 à 160 caractères.",
      "Y placer naturellement le mot-clé principal et ce que la page apporte.",
      "L’orienter vers l’action (commencer par un verbe).",
    ],
  },
  long_meta_description: {
    whatIsIt:
      "Votre méta-description dépasse 160 caractères environ : Google la coupe en pleine phrase.",
    whyItMatters:
      "Une description coupée perd l’appel à l’action placé à la fin. L’effet sur une page est faible, mais il s’additionne sur l’ensemble des affichages.",
    howToFix: [
      "La ramener à 140 à 160 caractères.",
      "Placer le mot-clé et ce que la page apporte dans les 120 premiers caractères.",
      "Finir par un appel à l’action clair.",
    ],
  },
  missing_image_alt: {
    whatIsIt:
      "Des images de cette page n’ont pas d’attribut alt. Le texte alternatif décrit l’image aux lecteurs d’écran ET à Google Images.",
    whyItMatters:
      "Une image porteuse de sens sans texte alternatif va à l’encontre des règles d’accessibilité WCAG, et vous privez la page du trafic que peut apporter Google Images.",
    howToFix: [
      "Ajouter un alt descriptif à chaque image porteuse de sens.",
      "Les images décoratives peuvent avoir alt=\"\" (vide) pour être ignorées par les lecteurs d’écran.",
      "Ne pas y entasser de mots-clés : décrire ce que l’image montre réellement.",
    ],
  },
  broken_link: {
    whatIsIt:
      "Cette page contient un lien vers une URL qui renvoie une erreur 404 ou un autre code d’erreur.",
    whyItMatters:
      "Les liens internes cassés gaspillent le budget d’exploration. Les liens externes cassés donnent l’image d’un site mal entretenu, ce que les consignes d’évaluation de la qualité de Google relèvent comme un signe de faible qualité.",
    howToFix: [
      "Remplacer le lien par l’URL actuelle et correcte.",
      "Ou le supprimer si la destination n’existe plus.",
      "Pour un lien externe mort, renvoyer si besoin vers une version archivée (Wayback Machine).",
    ],
  },
  redirect_chain: {
    whatIsIt:
      "Cette URL passe par au moins deux redirections avant d’arriver à destination. Chaque redirection ajoute un temps d’attente.",
    whyItMatters:
      "Google cesse de suivre une chaîne au-delà d’un certain nombre de redirections, et chaque étape rallonge le chargement pour le visiteur, surtout sur mobile.",
    howToFix: [
      "Faire pointer l’URL d’origine directement vers la destination finale.",
      "Supprimer la redirection intermédiaire.",
      "Passer en revue le .htaccess ou le gestionnaire de redirections pour repérer les chaînes.",
    ],
  },
  missing_canonical: {
    whatIsIt:
      "Cette page n’a pas de balise <link rel=\"canonical\"> indiquant à Google quelle version indexer.",
    whyItMatters:
      "Sans canonique explicite, Google devine. Il se trompe souvent quand des paramètres d’URL ou une barre oblique finale créent des URL presque identiques.",
    howToFix: [
      "Ajouter <link rel=\"canonical\" href=\"https://…URL de la page elle-même\">.",
      "Utiliser des URL absolues, pas relatives.",
      "Reprendre l’URL exacte, protocole et barre oblique finale compris.",
    ],
  },
  non_self_canonical: {
    whatIsIt:
      "La balise canonical désigne une autre URL que celle explorée, ce qui crée une ambiguïté.",
    whyItMatters:
      "Google peut retirer complètement cette page de l’index si la canonique tourne en boucle ou contredit d’autres signaux (sitemap, liens internes).",
    howToFix: [
      "Vérifier que l’URL canonique est bien celle que vous voulez voir indexée.",
      "S’assurer que le sitemap et les liens internes pointent vers la version canonique.",
      "Retirer la canonique si la page doit pointer vers elle-même.",
    ],
  },
  missing_schema: {
    whatIsIt:
      "Aucune donnée structurée (JSON-LD schema.org) n’a été trouvée sur cette page.",
    whyItMatters:
      "Les données structurées rendent la page éligible aux résultats enrichis (notes en étoiles, fiches recette, questions-réponses, fil d’Ariane), qui la rendent plus visible dans les résultats.",
    howToFix: [
      "Choisir le type schema.org qui correspond au contenu (Article, Product, FAQPage, etc.).",
      "Produire un JSON-LD valide avec le générateur de données structurées de l’outil.",
      "Le valider avec le test des résultats enrichis de Google avant de publier.",
    ],
    externalToolLabel: "Tester avec le test des résultats enrichis de Google",
  },
  slow_lcp: {
    whatIsIt:
      "Le Largest Contentful Paint (LCP) dépasse 2,5 secondes : le contenu principal met trop de temps à s’afficher.",
    whyItMatters:
      "Le LCP est l’un des trois Core Web Vitals que Google utilise parmi ses signaux de classement. Leur effet est modeste, mais il peut compter sur des requêtes très disputées.",
    howToFix: [
      "Précharger l’image LCP avec <link rel=\"preload\">.",
      "Compresser les images et les servir en WebP ou AVIF plutôt qu’en PNG ou JPEG.",
      "Différer le CSS et le JavaScript non critiques qui bloquent l’affichage.",
      "Changer d’hébergement si le TTFB dépasse 800 ms.",
    ],
    externalToolLabel: "Tester dans PageSpeed Insights",
  },
  poor_cls: {
    whatIsIt:
      "Le Cumulative Layout Shift (CLS) dépasse 0,1 : des éléments visibles se déplacent pendant le chargement.",
    whyItMatters:
      "Le CLS fait partie des Core Web Vitals. Surtout, les visiteurs touchent le mauvais bouton parce que la mise en page a bougé, ce qui nuit aux conversions.",
    howToFix: [
      "Ajouter les attributs width et height à chaque <img> et <video>.",
      "Réserver la place des publicités et des contenus intégrés avec min-height.",
      "Éviter d’insérer du contenu au-dessus du contenu existant (bandeaux cookies, par exemple).",
    ],
  },
  poor_inp: {
    whatIsIt:
      "L’Interaction to Next Paint (INP) dépasse 200 ms : clics et appuis donnent une impression de lenteur.",
    whyItMatters:
      "L’INP a remplacé le FID parmi les Core Web Vitals en mars 2024. Une page lente à réagir pèse sur l’expérience des visiteurs et sur ce signal de Google.",
    howToFix: [
      "Découper les tâches JavaScript longues avec setTimeout ou requestIdleCallback.",
      "Différer les scripts tiers (mesure d’audience, publicités).",
      "Optimiser React : useMemo pour les rendus coûteux, chargement différé des composants sous la ligne de flottaison.",
    ],
  },
  duplicate_title: {
    whatIsIt:
      "Plusieurs pages ont exactement le même <title>. Google peut les confondre dans les résultats de recherche.",
    whyItMatters:
      "Des titles en double provoquent une cannibalisation : deux de vos pages se disputent la même requête, et Google retient la mauvaise.",
    howToFix: [
      "Différencier le title de chaque page selon son intention (« avis », « tarifs », « guide », par exemple).",
      "Ou poser une canonique si le contenu est réellement le même.",
    ],
  },
  duplicate_meta_description: {
    whatIsIt:
      "Plusieurs pages partagent la même méta-description.",
    whyItMatters:
      "Moins gênant qu’un title en double, mais la description ne décrit alors aucune page en particulier, et Google la remplace souvent par un extrait qu’il choisit. Chaque page devrait se décrire elle-même.",
    howToFix: [
      "Rédiger une description propre à chaque page.",
      "Ou les retirer et laisser Google générer l’extrait.",
    ],
  },
  noindex_set: {
    whatIsIt:
      "Cette page porte une directive robots « noindex » : Google a reçu l’instruction de ne pas l’afficher dans les résultats de recherche.",
    whyItMatters:
      "Si c’est voulu (pages de connexion, d’administration), tout va bien. Si c’est accidentel sur une page qui doit générer du chiffre d’affaires, c’est grave : elle ne reçoit plus aucun trafic naturel.",
    howToFix: [
      "Confirmer que cette page DOIT être masquée des moteurs de recherche.",
      "Sinon, retirer la balise <meta name=\"robots\" content=\"noindex\"> ou l’en-tête X-Robots-Tag.",
      "Puis redemander l’indexation de l’URL dans Google Search Console.",
    ],
    externalToolLabel: "Ouvrir dans Google Search Console",
  },
  blocked_by_robots: {
    whatIsIt:
      "Votre robots.txt empêche Googlebot d’explorer cette URL.",
    whyItMatters:
      "Une page bloquée peut tout de même être indexée (l’URL seule, sans extrait), mais elle se classe mal. Un Disallow sur une page importante, c’est une page sans trafic.",
    howToFix: [
      "Ouvrir le robots.txt à l’adresse votresite.fr/robots.txt.",
      "Supprimer la ligne Disallow qui vise ce modèle d’URL.",
      "Soumettre de nouveau le sitemap dans Google Search Console.",
    ],
  },
  thin_content: {
    whatIsIt:
      "Cette page compte moins de 300 mots environ de contenu propre.",
    whyItMatters:
      "Les systèmes de Google qui évaluent l’utilité du contenu défavorisent les pages qui ne répondent pas à ce que cherche l’internaute. Une page mince sur un mot-clé important risque d’être mal classée, voire retirée de l’index.",
    howToFix: [
      "Apporter une vraie profondeur : exemples, données, questions fréquentes, analyse originale.",
      "Développer selon ce dont le sujet a besoin, sans viser un nombre de mots : Google ne fixe aucune longueur minimale.",
      "Si la page ne justifie pas plus de contenu, la fusionner avec une page plus complète au moyen d’une redirection 301.",
    ],
  },
  orphan_pages: {
    whatIsIt:
      "Aucune autre page du site ne fait de lien vers cette page.",
    whyItMatters:
      "Google découvre difficilement les pages orphelines, et elles ne reçoivent rien de l’autorité que le reste du site transmet par ses liens.",
    howToFix: [
      "Ajouter quelques liens contextuels vers cette page depuis des articles proches par le sujet.",
      "L’ajouter au menu principal ou au pied de page si le sujet s’y prête.",
      "Utiliser l’outil de recherche d’occasions de maillage interne.",
    ],
  },
  inconsistent_hreflang: {
    whatIsIt:
      "Ce site international a des variantes par langue ou par pays, mais aucune balise hreflang ne les relie.",
    whyItMatters:
      "Sans hreflang, Google peut montrer aux internautes la mauvaise version linguistique, qu’ils quittent aussitôt.",
    howToFix: [
      "Ajouter <link rel=\"alternate\" hreflang=\"fr\" href=\"…\"> pour chaque variante.",
      "Inclure sur chaque page un hreflang qui pointe vers elle-même.",
      "Ajouter x-default pour la page de choix de la langue ou la page d’accueil internationale.",
    ],
  },
  no_https: {
    whatIsIt:
      "Cette URL est servie en HTTP, et non en HTTPS.",
    whyItMatters:
      "HTTPS fait partie des signaux de classement de Google depuis 2014. Chrome signale les pages HTTP comme « Non sécurisé », ce qui entame la confiance et les conversions.",
    howToFix: [
      "Obtenir un certificat SSL gratuit auprès de Let’s Encrypt ou passer par Cloudflare.",
      "Rediriger en 301 chaque URL HTTP vers sa version HTTPS.",
      "Passer les liens internes en HTTPS.",
    ],
  },

  // --- Exploration et réponse du serveur ---------------------------------

  bad_status: {
    whatIsIt:
      "Le serveur a répondu par un code d’erreur (4xx ou 5xx) au lieu de la page.",
    whyItMatters:
      "Google abandonne les pages qui renvoient des erreurs de façon répétée, et les liens qui pointent vers elles ne servent plus à rien. Une erreur 5xx signifie aussi que de vrais visiteurs n’ont rien vu.",
    howToFix: [
      "Ouvrir l’URL vous-même : une 404 signifie que la page a été déplacée ou supprimée, une 500 que le serveur est en défaut.",
      "Si la page a été déplacée, ajouter une redirection 301 vers la nouvelle URL plutôt que de laisser une 404.",
      "Si elle a été supprimée volontairement, c’est normal : retirer les liens internes qui pointent vers elle.",
      "En cas d’erreur 5xx, consulter le journal d’erreurs du serveur : c’est un problème du site, pas de SEO.",
    ],
  },
  fetch_failed: {
    whatIsIt:
      "Impossible de charger cette URL : délai de connexion dépassé, échec DNS ou certificat refusé.",
    whyItMatters:
      "Si notre robot ne parvient pas à l’atteindre, Googlebot n’y parvient probablement pas non plus, et une page que Google ne peut pas récupérer ne peut pas se classer.",
    howToFix: [
      "Ouvrir l’URL dans un navigateur. Si elle s’affiche chez vous, un pare-feu ou une protection anti-robots bloque peut-être les robots d’exploration.",
      "Vérifier que le certificat SSL n’a pas expiré : c’est la cause la plus fréquente.",
      "Si vous utilisez Cloudflare ou un service équivalent, vérifier que son mode anti-robots ne bloque pas les requêtes qui ne viennent pas d’un navigateur.",
    ],
  },
  blocked_url: {
    whatIsIt:
      "L’outil a refusé de récupérer cette URL, car elle pointe vers une adresse privée ou interne.",
    whyItMatters:
      "Ce n’est pas un problème de SEO, mais une protection. Un moteur de recherche public ne pourrait pas atteindre cette adresse non plus : un site hébergé dessus n’est pas indexable publiquement.",
    howToFix: [
      "Si vous auditez un site sur votre propre machine ou votre réseau local, c’est normal : la documentation d’hébergement explique l’option qui l’autorise.",
      "S’il s’agit d’un site public, vérifier que le domaine pointe vers une adresse IP publique.",
    ],
  },
  slow_response: {
    whatIsIt:
      "Le serveur a mis plus de deux secondes avant de commencer à envoyer cette page.",
    whyItMatters:
      "C’est du temps de traitement côté serveur, avant tout affichage : il retarde tout ce qui suit, et les Core Web Vitals en héritent entièrement.",
    howToFix: [
      "Activer la mise en cache des pages pour que les requêtes répétées n’interrogent plus la base de données.",
      "Chercher les requêtes lentes en base de données sur cette page : c’est en général une seule requête, pas toute la pile.",
      "Placer un CDN devant le site pour que les visiteurs éloignés du serveur ne paient pas la distance.",
    ],
  },
  crawl_delay_applied: {
    whatIsIt:
      "Votre robots.txt demande aux robots d’attendre entre deux requêtes : cet audit a donc été plus lent et a pu couvrir moins de pages.",
    whyItMatters:
      "Pour information. Google ignore Crawl-delay, mais Bing et d’autres robots le respectent : un délai long les ralentit, et vos modifications sont prises en compte plus tard chez eux. Mieux vaut vérifier que ce réglage est voulu.",
    howToFix: [
      "Ouvrir le robots.txt et chercher la ligne Crawl-delay.",
      "Sauf si votre serveur peine réellement, vous pouvez en général la supprimer. Google l’ignore de toute façon ; Bing et d’autres non.",
    ],
  },
  soft_404: {
    whatIsIt:
      "La page renvoie un code de succès, mais son contenu indique qu’elle est absente : page de résultats vide, ou message « introuvable » servi avec un code 200.",
    whyItMatters:
      "Google les traite comme des erreurs quel que soit le code renvoyé, et dépense du budget d’exploration à les redécouvrir. Les visiteurs, eux, tombent sur une impasse qui a l’air vivante.",
    howToFix: [
      "Renvoyer un vrai code 404 pour les pages qui n’existent pas.",
      "Si la page doit exister, corriger ce qui la laisse vide.",
      "Pour les pages de recherche ou de catégorie vides, afficher du contenu (articles proches, message utile) plutôt que rien.",
    ],
  },

  // --- Indexation et canoniques -----------------------------------------

  xrobots_noindex: {
    whatIsIt:
      "Le serveur envoie un en-tête X-Robots-Tag qui demande aux moteurs de recherche de ne pas indexer cette page.",
    whyItMatters:
      "L’effet est le même qu’une balise meta noindex, mais il ne se voit pas dans le code source de la page : c’est pourquoi il est si souvent posé par erreur sans que personne ne le remarque.",
    howToFix: [
      "Chercher un en-tête X-Robots-Tag dans la configuration du serveur (nginx, Apache) et dans les règles du CDN.",
      "Si la page doit être indexée, retirer l’en-tête pour ce chemin.",
      "Les environnements de préproduction le posent souvent sur tout le site : vérifier qu’il n’a pas suivi en production.",
    ],
  },
  invalid_canonical: {
    whatIsIt:
      "La balise canonical de cette page pointe vers quelque chose qui n’est pas une URL utilisable.",
    whyItMatters:
      "Une canonique cassée est pire que pas de canonique du tout : Google peut l’ignorer, ou la suivre et retirer cette page de l’index au profit d’une adresse qui n’existe pas.",
    howToFix: [
      "Utiliser une URL absolue : https://example.com/page, et non /page.",
      "Vérifier que l’URL se charge vraiment et renvoie un code 200.",
      "Si une extension la génère, chercher un réglage d’adresse du site mal configuré.",
    ],
  },
  canonical_chain: {
    whatIsIt:
      "La canonique de cette page pointe vers une page dont la canonique pointe encore ailleurs.",
    whyItMatters:
      "Google suit de façon fiable un seul saut, et de façon plus incertaine au-delà. Une chaîne signifie souvent que deux extensions écrivent chacune une canonique et ne sont pas d’accord.",
    howToFix: [
      "Faire pointer la canonique de chaque page directement vers la destination finale.",
      "Si deux extensions SEO sont actives, désactiver la canonique dans l’une d’elles.",
    ],
  },
  facet_trap: {
    whatIsIt:
      "Le site fait des liens vers de nombreuses URL de filtres (couleur, taille, tri, prix…) que les moteurs de recherche peuvent librement explorer et indexer.",
    whyItMatters:
      "Chaque combinaison de filtres est une quasi-copie de la même liste. Ces URL consomment du budget d’exploration, concurrencent la vraie page de catégorie et diluent ses signaux.",
    howToFix: [
      "Faire pointer la canonique de chaque URL filtrée vers la liste non filtrée.",
      "Ou passer les URL filtrées en noindex, follow.",
      "Pour les paramètres de tri et d’affichage qui ne changent jamais le contenu, les bloquer par Disallow dans le robots.txt.",
    ],
  },
  stale_content: {
    whatIsIt:
      "Les dates que ces pages indiquent elles-mêmes (dateModified des données structurées, balises meta d’article) remontent à plus de deux ans.",
    whyItMatters:
      "Sur les sujets qui évoluent, les moteurs de recherche et les réponses des IA privilégient les pages récentes. Une page qui se dit ancienne est écartée au profit d’une page qui paraît à jour, même si son contenu est meilleur.",
    howToFix: [
      "Revoir d’abord les pages les plus anciennes : mettre à jour ce qui a changé, retirer ce qui n’est plus vrai.",
      "Mettre à jour dateModified quand le contenu a réellement changé, jamais sans changement.",
      "Fusionner ou rediriger les pages qui ne valent plus la peine d’être gardées.",
    ],
  },

  // --- robots.txt et sitemaps --------------------------------------------

  missing_robots_txt: {
    whatIsIt: "Il n’y a pas de fichier robots.txt à la racine du site.",
    whyItMatters:
      "Ce n’est pas bloquant : les robots considèrent alors que tout est autorisé. Le robots.txt compte surtout parce que c’est là que vous indiquez aux robots où se trouve votre sitemap.",
    howToFix: [
      "Créer /robots.txt avec `User-agent: *` et `Allow: /`.",
      "Ajouter une ligne `Sitemap:` avec l’URL complète de votre sitemap.",
      "Ne pas bloquer le CSS ni le JavaScript : Google en a besoin pour afficher la page comme la voit un visiteur.",
    ],
  },
  invalid_robots_txt: {
    whatIsIt:
      "Le robots.txt existe, mais certaines lignes ne sont pas des directives valides.",
    whyItMatters:
      "Les robots sautent les lignes qu’ils ne comprennent pas. Un Disallow mal écrit peut être ignoré sans avertissement, ou pire, un Disallow valide peut bloquer plus que prévu.",
    howToFix: [
      "Vérifier que chaque ligne est une directive reconnue : User-agent, Allow, Disallow, Sitemap, Crawl-delay.",
      "Chaque Allow ou Disallow doit se trouver sous une ligne User-agent.",
      "Le coller dans l’outil robots.txt de l’application, ou dans le testeur de Search Console, pour voir comment un robot le lit.",
    ],
  },
  missing_sitemap: {
    whatIsIt: "Aucun sitemap XML n’a été trouvé aux emplacements habituels.",
    whyItMatters:
      "Le sitemap permet de signaler à Google les pages vers lesquelles aucun lien ne pointe. Sans lui, ce qui n’est pas accessible en suivant les liens risque de ne jamais être découvert.",
    howToFix: [
      "En générer un : la plupart des CMS et des extensions SEO le font automatiquement.",
      "Le référencer dans le robots.txt avec une ligne `Sitemap:`.",
      "Le soumettre dans Search Console pour voir ce que Google en fait.",
    ],
  },
  missing_ai_crawler_policy: {
    whatIsIt:
      "Le robots.txt ne dit rien des robots des IA comme GPTBot, ClaudeBot ou PerplexityBot.",
    whyItMatters:
      "C’est un choix à faire, pas un défaut. Sans règle, ils peuvent explorer le site : c’est bien si vous voulez être cité dans les réponses des IA, moins si vous ne voulez pas que votre contenu serve à leur entraînement.",
    howToFix: [
      "Décider d’abord : voulez-vous apparaître dans les réponses des assistants IA ?",
      "Pour être cité, autoriser les robots de recherche (OAI-SearchBot, PerplexityBot), même si vous bloquez les robots d’entraînement (GPTBot, ClaudeBot).",
      "Générer les règles avec l’outil de politique IA pour robots.txt de l’application.",
    ],
  },
  partial_ai_crawler_policy: {
    whatIsIt:
      "Votre robots.txt nomme certains robots des IA mais pas d’autres, ce qui signifie en général que la liste a été écrite une fois sans être revue.",
    whyItMatters:
      "Les robots non nommés relèvent de votre règle par défaut : votre politique réelle n’est peut-être pas celle que vous croyez, et bloque parfois ceux qui vous citeraient tout en laissant passer ceux qui s’entraînent sur vos contenus.",
    howToFix: [
      "Lister explicitement les principaux robots des IA au lieu de s’en remettre à la règle par défaut.",
      "Garder la distinction claire : robots d’entraînement et robots de recherche relèvent de deux décisions différentes.",
    ],
  },

  // --- Structure de la page ----------------------------------------------

  missing_h1: {
    whatIsIt: "Cette page n’a pas de titre <h1>.",
    whyItMatters:
      "Le H1 est l’énoncé le plus clair du sujet de la page, pour les lecteurs comme pour les moteurs de recherche. Il s’agit ici de son absence : plusieurs H1 sont valides en HTML5 et ne posent pas de problème.",
    howToFix: [
      "Ajouter un <h1> qui dit ce que traite cette page précise.",
      "Il doit décrire la page, pas le site : le nom du site a sa place dans l’en-tête.",
      "Ne pas le masquer en CSS pour les besoins du graphisme : un H1 caché n’aide personne.",
    ],
  },
  heading_order: {
    whatIsIt:
      "Les titres sautent des niveaux : par exemple un H3 juste après un H1, sans H2 entre les deux.",
    whyItMatters:
      "Les utilisateurs de lecteurs d’écran naviguent par niveau de titre, et un niveau sauté perturbe cette navigation. L’effet sur le SEO est faible ; l’effet sur l’accessibilité est réel.",
    howToFix: [
      "Descendre d’un niveau à la fois : H1, puis H2, puis H3.",
      "Si un niveau a été choisi pour sa taille, obtenir cette taille avec le CSS.",
    ],
  },
  missing_lang: {
    whatIsIt: "La balise <html> n’a pas d’attribut lang.",
    whyItMatters:
      "Les lecteurs d’écran s’en servent pour choisir la prononciation, et les navigateurs pour proposer une traduction. Sans lui, une page en français peut être lue avec un accent étranger.",
    howToFix: [
      "Ajouter lang à la balise html : <html lang=\"fr\">, ou « fr-FR », « en », « es » selon le cas.",
      "Si la page est réellement multilingue, déclarer ici la langue principale et signaler les exceptions dans le texte.",
    ],
  },
  weak_anchor_text: {
    whatIsIt:
      "Des liens de cette page utilisent des textes comme « cliquez ici », « en savoir plus » ou une URL brute.",
    whyItMatters:
      "Le texte du lien indique aux lecteurs comme aux moteurs de recherche ce qu’ils vont trouver. Un utilisateur de lecteur d’écran qui liste les liens de la page entend « cliquez ici » huit fois et n’apprend rien.",
    howToFix: [
      "Décrire la destination : « lire le guide des tarifs 2026 » plutôt que « en savoir plus ».",
      "Rester naturel : il s’agit d’être explicite, pas d’y entasser des mots-clés.",
    ],
  },

  // --- Partage et métadonnées ---------------------------------------------

  short_meta_description: {
    whatIsIt:
      "La méta-description est bien plus courte que la place offerte dans les résultats de recherche.",
    whyItMatters:
      "Ce n’est pas un facteur de classement, mais c’est l’argumentaire affiché sous votre titre. Trop courte, elle laisse de la place inutilisée, et Google peut la remplacer par un texte de la page qu’il choisit lui-même.",
    howToFix: [
      "Viser environ 120 à 155 caractères.",
      "Dire ce que le visiteur trouvera sur cette page et lui donner une raison de cliquer.",
      "En écrire une par page : une description répétée est pire qu’une description courte.",
    ],
  },
  missing_og_tags: {
    whatIsIt:
      "Aucune balise Open Graph : les réseaux sociaux doivent deviner comment afficher cette page quand elle est partagée.",
    whyItMatters:
      "Sans elles, un lien partagé affiche le premier texte et la première image que la plateforme trouve, souvent un logo et un menu de navigation. Un tel aperçu attire moins les clics.",
    howToFix: [
      "Ajouter og:title, og:description, og:image et og:url dans le <head>.",
      "Utiliser une image d’environ 1200 × 630 pixels : les plus petites sont mal recadrées.",
      "Tester avec l’outil de débogage du partage de la plateforme qui compte pour vous.",
    ],
  },
  missing_twitter_card: {
    whatIsIt: "Aucune balise de carte Twitter / X sur cette page.",
    whyItMatters:
      "X se rabat sur les balises Open Graph quand celles-ci manquent : si vous les avez, c’est secondaire. Sans l’une ni l’autre, les liens partagés s’affichent en texte brut.",
    howToFix: [
      "Ajouter <meta name=\"twitter:card\" content=\"summary_large_image\">.",
      "Si vos balises Open Graph sont déjà en place, cela suffit en général.",
    ],
  },
  missing_favicon: {
    whatIsIt: "Aucun favicon n’a été trouvé.",
    whyItMatters:
      "Google affiche un favicon à côté de votre résultat sur mobile. Sans favicon, vous avez un globe générique, qui fait inachevé à côté des concurrents.",
    howToFix: [
      "Ajouter un favicon à /favicon.ico, et un PNG plus grand avec une balise <link rel=\"icon\">.",
      "Le rendre lisible en 16 × 16 pixels : un logo complet l’est rarement.",
    ],
  },
  article_missing_author: {
    whatIsIt:
      "Cette page ressemble à un article, mais ses données structurées ne nomment aucun auteur.",
    whyItMatters:
      "Les conseils de Google sur le contenu utile invitent à se demander qui a écrit un contenu et pourquoi il mérite d’être lu. Un article sans auteur n’apporte aucune réponse.",
    howToFix: [
      "Ajouter un auteur au schema Article, avec un lien vers une page qui le présente.",
      "Afficher aussi une vraie signature sur la page, pas seulement dans le balisage.",
      "Un contenu généré automatiquement avec un auteur inventé est pire que pas d’auteur du tout.",
    ],
  },

  // --- Mobile et rendu ------------------------------------------------------

  missing_viewport: {
    whatIsIt:
      "Aucune balise meta viewport : les navigateurs mobiles affichent la mise en page pour ordinateur, en dézoomant.",
    whyItMatters:
      "Le texte devient illisible sur téléphone. Une grande partie du trafic vient du mobile, et c’est cette balise qui décide si la page y est utilisable.",
    howToFix: [
      "Ajouter <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> dans le <head>.",
      "Puis vérifier la page sur un vrai téléphone : la balise seule ne rend pas adaptative une mise en page à largeur fixe.",
    ],
  },
  viewport_blocks_zoom: {
    whatIsIt:
      "La balise viewport désactive le zoom à deux doigts, avec user-scalable=no ou un maximum-scale.",
    whyItMatters:
      "Elle empêche toute personne à la vue imparfaite d’agrandir votre texte. C’est contraire aux règles d’accessibilité WCAG, et ce n’est presque jamais nécessaire.",
    howToFix: [
      "Retirer user-scalable=no et tout maximum-scale de la balise viewport.",
      "Si c’était pour éviter qu’une mise en page casse au zoom, corriger plutôt la mise en page.",
    ],
  },
  js_rendered_only: {
    whatIsIt:
      "Le contenu de la page n’apparaît qu’après l’exécution de JavaScript : le HTML brut est presque vide.",
    whyItMatters:
      "Google exécute bien JavaScript, mais en différé et pas pour toutes les pages. Tout élément essentiel qui n’existe qu’après le rendu risque d’être manqué ou indexé tardivement.",
    howToFix: [
      "Rendre côté serveur, ou prégénérer, le contenu important : title, titres, texte, liens.",
      "S’assurer que les liens internes sont de vrais éléments <a href>, et non des gestionnaires de clic, sinon les robots ne peuvent pas les suivre.",
      "Vérifier ce que Google voit réellement avec l’outil d’inspection d’URL de Search Console.",
    ],
  },
  render_blocking_scripts: {
    whatIsIt:
      "Des scripts placés dans le <head> sans defer ni async bloquent l’affichage de la page jusqu’à la fin de leur téléchargement.",
    whyItMatters:
      "Le visiteur fixe un écran vide tant que ces fichiers se téléchargent. C’est l’une des causes les plus courantes d’un Largest Contentful Paint lent.",
    howToFix: [
      "Ajouter defer aux scripts qui n’ont pas besoin de s’exécuter avant l’affichage, c’est-à-dire la plupart.",
      "Charger la mesure d’audience et les fenêtres de discussion une fois la page interactive.",
      "N’intégrer en ligne que la petite part de CSS nécessaire à ce qui s’affiche en premier.",
    ],
  },
  heavy_html_payload: {
    whatIsIt: "Le document HTML lui-même est inhabituellement lourd.",
    whyItMatters:
      "Chaque visiteur le télécharge et l’analyse en entier avant que quoi que ce soit n’apparaisse. Sur une connexion mobile, un document lourd se ressent immédiatement.",
    howToFix: [
      "Chercher les images intégrées en base64 : elles ont leur place dans des fichiers que le navigateur peut mettre en cache.",
      "Vérifier si un constructeur de pages produit du balisage inutilisé, ou si un énorme bloc JSON est intégré à la page.",
      "Paginer les très longues listes plutôt que de tout afficher d’un coup.",
    ],
  },

  // --- Images -----------------------------------------------------------------

  image_missing_dimensions: {
    whatIsIt: "Des images n’ont pas d’attributs width et height.",
    whyItMatters:
      "Sans eux, le navigateur ne peut pas réserver la place, et la page saute à mesure que les images se chargent. C’est le Cumulative Layout Shift, l’un des Core Web Vitals.",
    howToFix: [
      "Ajouter des attributs width et height correspondant aux dimensions réelles de l’image.",
      "Le CSS peut toujours la redimensionner : les attributs indiquent seulement au navigateur ses proportions à l’avance.",
      "La plupart des composants d’image des frameworks le font pour vous.",
    ],
  },
  no_lazy_loading: {
    whatIsIt:
      "Les images sous la ligne de flottaison se chargent tout de suite, au lieu d’attendre que le visiteur fasse défiler la page jusqu’à elles.",
    whyItMatters:
      "Le navigateur consacre de la bande passante à des images que personne n’a encore atteintes, ce qui retarde celles qui sont visibles.",
    howToFix: [
      "Ajouter loading=\"lazy\" aux images sous la ligne de flottaison.",
      "NE PAS différer le chargement de l’image principale au-dessus de la ligne de flottaison : cela la retarde et dégrade le Largest Contentful Paint.",
    ],
  },
  old_image_formats: {
    whatIsIt: "Les images sont servies en JPEG ou en PNG plutôt qu’en WebP ou en AVIF.",
    whyItMatters:
      "Les formats récents sont en général nettement plus légers à qualité visuelle égale. Sur une page riche en images, c’est l’un des gains de vitesse les plus importants.",
    howToFix: [
      "Convertir en WebP, désormais pris en charge par tous les navigateurs courants.",
      "Servir un JPEG de repli avec <picture> si vous devez prendre en charge de très anciens navigateurs.",
      "La plupart des extensions de CMS et des CDN savent convertir automatiquement à l’envoi.",
    ],
  },

  // --- Sécurité ---------------------------------------------------------------

  mixed_content: {
    whatIsIt:
      "Une page HTTPS charge certaines ressources (images, scripts, feuilles de style) en HTTP simple.",
    whyItMatters:
      "Les navigateurs les bloquent ou affichent un avertissement : des parties de la page peuvent ne pas se charger, sans message. Le cadenas disparaît aussi, ce que les visiteurs remarquent.",
    howToFix: [
      "Remplacer http:// par https:// dans les URL en cause.",
      "Vérifier les liens écrits en dur dans les thèmes et les modèles : c’est la source habituelle.",
      "Sous WordPress, un rechercher-remplacer dans la base de données règle en général le problème en une fois.",
    ],
  },
  missing_security_headers: {
    whatIsIt:
      "Des en-têtes de sécurité courants sont absents, comme Strict-Transport-Security et X-Content-Type-Options.",
    whyItMatters:
      "Ce n’est pas un facteur de classement. Ces en-têtes ferment à peu de frais la porte à de vraies attaques, et les revues de sécurité comme les grands comptes les vérifient.",
    howToFix: [
      "Ajouter Strict-Transport-Security une fois certain que HTTPS fonctionne partout.",
      "Ajouter X-Content-Type-Options: nosniff et une Referrer-Policy.",
      "Ajouter une Content-Security-Policy en dernier : c’est celle qui risque le plus de casser une page, donc la tester d’abord en mode report-only.",
    ],
  },

  // --- International ----------------------------------------------------------

  hreflang_not_reciprocal: {
    whatIsIt:
      "Cette page désigne une variante linguistique qui ne la désigne pas en retour.",
    whyItMatters:
      "Google demande que les hreflang soient réciproques. Une déclaration à sens unique est ignorée : le ciblage linguistique mis en place ne produit aucun effet, sans avertissement.",
    howToFix: [
      "Chaque page d’un groupe de langues doit lister toutes les autres pages du groupe, y compris elle-même.",
      "Utiliser des URL absolues partout.",
      "Ajouter un x-default pour les visiteurs dont la langue n’est pas couverte.",
    ],
  },

  // ===================================================================
  // issue-explainers-tech.ts
  // ===================================================================

  wp_default_permalinks: {
    whatIsIt:
      "Vos pages sont accessibles à /?p=123 au lieu de /un-slug-lisible/. C’est le réglage de permaliens par défaut de WordPress, que personne n’a modifié après l’installation.",
    whyItMatters:
      "L’URL est l’un des rares endroits où vous maîtrisez entièrement ce que la page annonce, et Google l’affiche dans les résultats. /?p=123 ne dit rien à l’internaute qui hésite à cliquer, ni au moteur de recherche sur le sujet.",
    howToFix: [
      "Réglages → Permaliens → Titre de la publication → Enregistrer (Settings → Permalinks → Post name dans l’interface anglaise).",
      "WordPress crée les redirections pour vous : les liens existants continuent de fonctionner.",
      "Si /?p=… a été écrit en dur ailleurs, le mettre à jour : l’ancienne forme fonctionne toujours, mais ce n’est pas elle que Google indexera.",
    ],
  },

  wp_version_disclosed: {
    whatIsIt:
      "Le numéro de version de WordPress apparaît dans le code source de la page, dans une balise <meta name=\"generator\">.",
    whyItMatters:
      "Cela n’a aucun effet sur le classement. Mais toute personne qui analyse le site sait quelle version vous utilisez : une faille connue de cette version peut être tentée directement, sans avoir à deviner.",
    howToFix: [
      "Retirer la balise generator.",
      "Cela ne remplace pas la mise à jour de WordPress : cela évite seulement d’afficher la version.",
    ],
    snippetWhere:
      "Le functions.php de votre thème enfant, à la fin. Si vous n’avez pas de thème enfant, utilisez plutôt une extension de code (WPCode, Code Snippets) : les modifications d’un thème parent sont effacées à sa prochaine mise à jour.",
    snippetUndo: "Supprimez la ligne et enregistrez : la balise revient aussitôt.",
    snippetCaution:
      "Ne modifiez jamais functions.php depuis Apparence → Éditeur de thème sur un site en ligne. Une faute de frappe y affiche une page blanche sur tout le site, administration comprise. Passez par SFTP ou par une extension de code, pour pouvoir annuler si le site ne répond plus.",
  },

  wp_xmlrpc_exposed: {
    whatIsIt:
      "xmlrpc.php est accessible et annoncé. C’est l’ancienne interface de publication à distance, antérieure à l’API REST.",
    whyItMatters:
      "Aucun effet sur le SEO. C’est une cible de choix pour les attaques par force brute et l’amplification d’attaques par déni de service, car une seule requête peut contenir de nombreuses tentatives de connexion. La plupart des sites n’en ont plus l’usage.",
    howToFix: [
      "Vérifier d’abord si quelque chose en a besoin : l’application Jetpack, certaines anciennes applications mobiles de publication et quelques extensions de sauvegarde l’utilisent.",
      "Si rien n’en a besoin, le désactiver.",
      "Tester ensuite de nouveau ce qui se connecte à votre site.",
    ],
    snippetWhere:
      "Le functions.php du thème enfant, ou une extension de code. Ne pas le placer dans un thème parent.",
    snippetUndo: "Supprimez les deux lignes. Rien d’autre ne change.",
    snippetCaution:
      "Si vous utilisez l’application mobile Jetpack ou publiez depuis un client externe, cette connexion cessera de fonctionner. Testez avant de laisser le code en place.",
  },

  wp_multiple_seo_plugins: {
    whatIsIt:
      "Plusieurs extensions SEO sont actives, par exemple Yoast et Rank Math ensemble.",
    whyItMatters:
      "Celle-ci a bien un effet sur le référencement. Deux extensions qui écrivent chacune le title, la méta-description, la canonique et les données structurées produisent des balises en double et contradictoires, et deux sitemaps en désaccord sur ce qui existe. Google retient ce qu’il veut, pas forcément ce que vous avez configuré.",
    howToFix: [
      "Choisir celle que vous gardez.",
      "Exporter les réglages de celle que vous retirez : la plupart proposent un outil d’import pour l’autre, ce qui conserve titles et descriptions.",
      "Désactiver, puis supprimer celle qui part. La désactiver seulement laisse ses données en place.",
      "Relancer une exploration et vérifier qu’il n’y a plus qu’un title et une canonique par page.",
    ],
  },

  wp_plugin_bloat: {
    whatIsIt:
      "De nombreuses extensions différentes chargent du CSS et du JavaScript sur cette page.",
    whyItMatters:
      "Les extensions sont la cause habituelle de la lenteur d’une page WordPress, et la vitesse compte parmi les signaux de classement à travers les Core Web Vitals. La plupart chargent leurs fichiers sur toutes les pages, y compris celles qui ne s’en servent pas.",
    howToFix: [
      "Lister les extensions actives et repérer celles dont l’absence se remarquerait.",
      "Désactiver les autres une par une, en vérifiant le site après chacune.",
      "Pour celles que vous gardez, utiliser un gestionnaire de ressources (Perfmatters, Asset CleanUp) afin de ne charger chacune que là où elle sert : le script d’un formulaire de contact n’a rien à faire sur chaque article de blog.",
      "Mesurer de nouveau les Core Web Vitals ensuite pour voir s’ils ont bougé.",
    ],
  },

  wp_emoji_bloat: {
    whatIsIt:
      "Le script des emojis de WordPress est chargé. Il sert à afficher les emojis de façon homogène sur les navigateurs des années 2015 environ.",
    whyItMatters:
      "Un petit gain, mais sans contrepartie : une requête de plus et un script en ligne qui bloque l’affichage sur chaque page. Tous les navigateurs récents affichent les emojis nativement.",
    howToFix: [
      "Retirer les scripts et les styles des emojis.",
      "Les emojis s’affichent toujours : c’est le navigateur qui les dessine.",
    ],
    snippetWhere: "Le functions.php du thème enfant, ou une extension de code.",
    snippetUndo: "Supprimez le bloc. Le script revient au prochain chargement de page.",
  },

  wp_missing_block_styles: {
    whatIsIt:
      "La page utilise des blocs de l’éditeur, mais la feuille de style de la bibliothèque de blocs n’est pas chargée.",
    whyItMatters:
      "Ce n’est pas directement un problème de SEO, mais de mise en page. Colonnes, galeries et boutons s’affichent sans mise en forme pour tout visiteur dont le navigateur n’a pas le CSS en cache, c’est-à-dire en général les nouveaux visiteurs.",
    howToFix: [
      "Ouvrir la page dans une fenêtre de navigation privée, qui n’a pas de cache. Si elle s’affiche mal, c’est ce que voient vos nouveaux visiteurs.",
      "Vérifier si une extension d’optimisation est réglée pour « supprimer le CSS inutilisé » ou « désactiver les styles de blocs » : c’est presque toujours la cause.",
      "Exclure wp-block-library de cette règle plutôt que de désactiver toute l’optimisation.",
    ],
  },

  wp_rest_api_advertised: {
    whatIsIt:
      "Le point d’accès de l’API REST est annoncé dans le <head> de la page, à /wp-json/.",
    whyItMatters:
      "Aucun effet sur la recherche. La raison de s’en préoccuper est /wp-json/wp/v2/users, qui liste par défaut les identifiants de toutes les personnes ayant publié : la moitié d’une connexion qu’un attaquant devrait sinon deviner.",
    howToFix: [
      "Laisser l’API active si quelque chose l’utilise : l’éditeur de blocs s’en sert, tout comme un front-end découplé (headless).",
      "Réserver le point d’accès des utilisateurs aux requêtes connectées : c’est la partie qui mérite d’être fermée.",
    ],
    snippetWhere: "Le functions.php du thème enfant, ou une extension de code.",
    snippetUndo: "Supprimez le bloc : le point d’accès redevient public immédiatement.",
    snippetCaution:
      "Bloquer toute l’API REST au lieu de ce seul point d’accès casse l’éditeur de blocs et de nombreuses extensions. Ce code se limite volontairement à /wp/v2/users pour cette raison.",
  },

  wp_author_archive_indexed: {
    whatIsIt:
      "Vos pages d’archives d’auteur (/author/nom/) peuvent être indexées par Google.",
    whyItMatters:
      "Sur un site à un seul auteur, l’archive d’auteur est une quasi-copie de la page d’index du blog : deux URL qui se disputent le même contenu. Sur un site à plusieurs auteurs, ces pages sont en général minces. Dans les deux cas, ce n’est pas ce que vous voulez voir se classer.",
    howToFix: [
      "Un seul auteur : passer les archives d’auteur en noindex, ou les désactiver entièrement.",
      "Plusieurs auteurs qui attirent vraiment les lecteurs (experts reconnus, signatures suivies) : les garder et les rendre dignes d’être indexées avec une vraie biographie et des références. Cela renforce aussi l’E-E-A-T.",
      "Votre extension SEO propose ce réglage : Yoast sous Apparence de la recherche → Archives (Search Appearance → Archives), Rank Math sous Titles & Meta → Misc Pages.",
    ],
  },

  wp_heartbeat_on_frontend: {
    whatIsIt:
      "admin-ajax.php est appelé depuis une page publique : c’est l’API Heartbeat de WordPress qui interroge le serveur en arrière-plan.",
    whyItMatters:
      "Elle sert à l’administration : sauvegarde automatique, verrouillage des publications, vérification de session. Sur une page publique, c’est une requête répétée par visiteur qui ne lui apporte rien, et sur un site fréquenté, cela représente une vraie charge processeur sur votre serveur.",
    howToFix: [
      "Désactiver Heartbeat côté visiteurs et le garder dans l’éditeur, où il est utile.",
    ],
    snippetWhere: "Le functions.php du thème enfant, ou une extension de code.",
    snippetUndo: "Supprimez le bloc.",
    snippetCaution:
      "Gardez la vérification is_admin(). Désactiver Heartbeat partout supprime la sauvegarde automatique et le verrouillage des publications dans l’éditeur, et des personnes perdent leur travail à cause de cela.",
  },

  spa_empty_body: {
    whatIsIt:
      "Le HTML renvoyé par votre serveur est pratiquement vide : la page est construite dans le navigateur après l’exécution de JavaScript.",
    whyItMatters:
      "Google sait exécuter JavaScript, en différé et dans une certaine limite. Les robots des IA, eux, en sont largement incapables : GPTBot, ClaudeBot et PerplexityBot lisent le HTML qu’on leur donne. Avec un corps vide, ils voient une page blanche, et vous êtes absent des réponses des IA quelle que soit la qualité du contenu.",
    howToFix: [
      "Rendre côté serveur, ou prégénérer, les pages qui comptent. Avec Next.js, cela signifie un composant serveur ou generateStaticParams plutôt qu’un chargement des données dans un composant client.",
      "Vérifier le résultat avec JavaScript désactivé : c’est à peu près ce que voit un robot d’IA.",
      "Faire figurer le title, les titres et le texte principal dans le HTML apporte l’essentiel du bénéfice ; les parties interactives peuvent rester côté client.",
    ],
  },

  next_powered_by_header: {
    whatIsIt: "Vos réponses contiennent un en-tête X-Powered-By: Next.js.",
    whyItMatters:
      "Aucun effet sur le classement. Il nomme votre framework à quiconque analyse le site, ce qui réduit ce qu’il faut essayer contre vous. Le retirer ne coûte rien.",
    howToFix: ["Désactiver l’en-tête dans la configuration de Next.js."],
    snippetWhere:
      "next.config.js (ou next.config.mjs) à la racine du projet, dans l’objet de configuration exporté.",
    snippetUndo: "Supprimez la ligne, ou mettez-la à true. L’en-tête est activé par défaut.",
    snippetCaution:
      "Il faut reconstruire et redéployer : les changements de configuration ne sont pas pris en compte à chaud.",
  },

  next_raw_img_tags: {
    whatIsIt:
      "La page utilise des balises <img> simples là où next/image les prendrait en charge.",
    whyItMatters:
      "next/image redimensionne selon l’appareil, convertit vers des formats récents et réserve la place avant le chargement de l’image. Les balises simples ne font rien de tout cela : vous servez des fichiers plus lourds, le LCP est moins bon, et la mise en page bouge à l’arrivée des images, ce que mesure le CLS.",
    howToFix: [
      "Remplacer <img> par next/image en indiquant width et height, ou utiliser fill dans un parent positionné.",
      "Ajouter priority à l’image visible sans défilement, en général l’image principale. Celle-là seulement.",
      "Les domaines externes doivent être listés sous images.remotePatterns dans next.config.js, sinon la construction échoue.",
    ],
    snippetWhere: "Dans le fichier du composant, à la place de la balise <img>.",
    snippetUndo: "Remettez la balise <img> d’origine ; rien d’autre ne dépend de ce changement.",
    snippetCaution:
      "N’ajoutez pas priority à plus d’une ou deux images. Tout marquer comme prioritaire revient à dire au navigateur que rien ne compte plus que le reste, et la page devient plus lente au lieu d’être plus rapide.",
  },

  next_chunk_explosion: {
    whatIsIt:
      "La page charge un grand nombre de fichiers JavaScript (chunks) séparés.",
    whyItMatters:
      "Le découpage du code est utile jusqu’à un certain point. Au-delà d’un certain nombre de fichiers sur une même page, le coût des requêtes l’emporte sur le gain, et la page reste plus longtemps sans réagir alors même que le poids total paraît raisonnable.",
    howToFix: [
      "Chercher les imports dynamic() sur des composants visibles immédiatement : ils paient le coût du découpage sans en tirer de bénéfice.",
      "Lancer l’analyseur de bundle pour voir ce qui est réellement découpé.",
      "Regrouper les petits fichiers liés ; le découpage vaut la peine pour ce qui est vraiment facultatif ou lourd, comme une bibliothèque de graphiques ou un éditeur.",
    ],
  },

  shopify_collections_all: {
    whatIsIt:
      "/collections/all est accessible. Cette page liste tous les produits de la boutique : elle reprend donc chaque vraie page de collection.",
    whyItMatters:
      "Shopify la passe en noindex par défaut, c’est pourquoi ce n’est en général rien. Cela compte quand un thème ou une application a retiré cette balise : une seule page reprend alors tout votre catalogue et concurrence les collections que vous avez réellement optimisées.",
    howToFix: [
      "Ouvrir /collections/all et afficher le code source. Si vous voyez une balise meta robots noindex, il n’y a rien à faire.",
      "Si elle manque, la remettre dans le thème.",
    ],
    snippetWhere:
      "Boutique en ligne → Thèmes → Modifier le code → layout/theme.liquid, dans le <head>. Dupliquez d’abord le thème (Actions → Dupliquer) pour avoir une version à laquelle revenir.",
    snippetUndo: "Supprimez le bloc, ou publiez le thème dupliqué que vous avez gardé.",
    snippetCaution:
      "noindex, follow plutôt que noindex, nofollow : vous voulez toujours que les liens soient suivis jusqu’aux produits.",
  },

  shopify_liquid_debug: {
    whatIsIt:
      "Des messages d’erreur ou de débogage Liquid apparaissent dans le HTML de la page.",
    whyItMatters:
      "Une erreur Liquid signifie qu’une partie du modèle ne s’est pas affichée. C’est souvent celle qui écrit le title, la méta-description ou les données structurées du produit : la page peut donc ne pas avoir les balises que vous croyez, et l’erreur en est le seul signe visible.",
    howToFix: [
      "Afficher le code source et chercher « Liquid error » pour trouver quel fichier inclus a échoué.",
      "Le message indique le fichier et la ligne.",
      "En général, une application a été retirée alors que son snippet est encore appelé, ou une variable est utilisée hors du modèle où elle existe.",
      "Après correction, vérifier que la page a bien un title, une méta-description et les données structurées du produit.",
    ],
  },
};
