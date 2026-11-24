/**
 * The agent's own sentences in French: why it plans each fix (keyed like
 * FIXABLE in planner.ts), why it set work aside, what is missing from a
 * client's setup (capabilities.ts) and the run summary (run.ts).
 *
 * These are stored when written (agent_actions.reason, agent_runs.summary,
 * the activity log), so the language is chosen at creation from the
 * workspace language; entries already stored stay as they are.
 */

/** Why each fixable finding is worth fixing. Same keys as FIXABLE. */
export const FIXABLE_REASONS_FR: Record<string, string> = {
  missing_meta_description:
    "Cette page n’a pas de meta description : Google en compose une à partir du texte qu’il trouve. En écrire une est une amélioration simple qui peut donner envie de cliquer.",
  long_meta_description:
    "La description est assez longue pour être coupée en pleine phrase dans les résultats de recherche.",
  long_title:
    "Le title est trop long pour s’afficher en entier : les internautes le voient tronqué par des points de suspension.",
  short_title:
    "Le title est bien plus court que la place disponible, ce qui laisse en général de la place pour dire à quoi sert la page.",
  missing_title: "Cette page n’a aucune balise title.",
  missing_image_alt:
    "Les images sans texte alternatif sont invisibles pour les lecteurs d’écran et pour la recherche d’images.",
  missing_schema:
    "Pas de données structurées : cette page ne peut pas obtenir de résultats enrichis. Le type de schéma qui convient est un choix à vérifier.",
  duplicate_title:
    "Une autre page du site utilise exactement ce title : Google doit deviner laquelle afficher, et n’en affiche parfois aucune.",
  duplicate_meta_description:
    "Cette description est reprise sur une autre page. Des descriptions identiques ne donnent aux internautes aucune raison de choisir un résultat plutôt que l’autre.",
  short_meta_description:
    "La description est bien plus courte que la place offerte dans les résultats : c’est de la place inutilisée pour dire pourquoi cette page répond à la question.",
  missing_canonical:
    "Cette page n’indique pas quelle adresse est la bonne : si elle est accessible par plusieurs URL, Google choisit à votre place.",
  non_self_canonical:
    "L’URL canonique de cette page pointe vers une autre adresse, ce qui demande à Google de classer celle-ci à sa place. C’est parfois voulu, souvent une erreur de modèle de page.",
  invalid_canonical:
    "La balise canonique n’est pas une URL utilisable : Google l’ignore et la page se retrouve sans URL canonique.",
  canonical_chain:
    "L’URL canonique pointe vers une page qui pointe elle-même ailleurs. Google ne suit qu’un seul saut : la destination voulue n’est jamais atteinte.",
  noindex_set:
    "Cette page demande à Google de ne pas l’indexer : elle ne peut donc pas apparaître dans les résultats. À vérifier si c’est bien voulu.",
  xrobots_noindex:
    "Le serveur envoie un en-tête X-Robots-Tag noindex pour cette page, ce qui la tient hors des résultats quoi que dise la page elle-même.",
  missing_og_tags:
    "Cette page n’a pas de balises Open Graph : quand on la partage, la plateforme reprend le texte qu’elle trouve, souvent le menu de navigation plutôt que la page.",
  missing_twitter_card:
    "Pas de balises Twitter Card. X se rabat sur Open Graph : c’est la plus petite moitié du même travail, à faire tant que la page est ouverte.",
  missing_robots_txt:
    "Ce site ne sert aucun fichier robots.txt. Les robots s’en accommodent, mais rien ne leur indique le sitemap et vous n’avez aucun endroit pour leur donner des consignes.",
  missing_ai_crawler_policy:
    "Le robots.txt ne dit rien des robots d’IA : chacun applique son propre comportement par défaut, certains lisent le site, d’autres non, sans que personne l’ait décidé. L’écrire explicitement, c’est prendre la décision, dans un sens ou dans l’autre.",
  partial_ai_crawler_policy:
    "Le robots.txt nomme certains robots d’IA et pas d’autres : ceux qui manquent appliquent leur comportement par défaut au lieu de la règle choisie pour les autres.",
  wp_xmlrpc_exposed:
    "XML-RPC est annoncé sur ce site. C’est souvent le premier point d’entrée visé par les outils d’attaque par force brute, et peu d’outils récents s’en servent, mais Jetpack et les applications mobiles WordPress l’utilisent : à vérifier avant de le désactiver.",
  wp_version_disclosed:
    "La version exacte de WordPress figure dans le code source des pages, ce qui indique à quiconque analyse le site quelles failles connues essayer.",
  wp_rest_api_advertised:
    "L’API REST est signalée sur chaque page, ce qui permet à quiconque la suit de lister les utilisateurs et les contenus. Masquer ce lien ne désactive pas l’API : ce qui s’en sert chez vous continue de fonctionner.",
  wp_emoji_bloat:
    "WordPress charge un script d’emoji sur chaque page pour des navigateurs qui n’en ont plus besoin depuis des années. C’est du poids en plus pour les Core Web Vitals.",
  wp_heartbeat_on_frontend:
    "Le « heartbeat » de l’administration tourne sur les pages publiques : le navigateur de chaque visiteur envoie une requête toutes les quinze secondes pour une fonction qui ne sert qu’aux éditeurs connectés.",
  wp_author_archive_indexed:
    "Les archives d’auteur sont indexables. Sur un site à un seul auteur, elles reprennent exactement l’index du blog et lui font concurrence sur les mêmes recherches ; sur un site avec des experts nommés, elles peuvent valoir la peine d’être classées, d’où la question.",
  broken_link:
    "Un lien de ce site pointe vers une URL qui renvoie une erreur 404. Une redirection envoie les visiteurs et la valeur du lien vers une page utile plutôt que vers une impasse.",
  redirect_chain:
    "Cette URL redirige vers une URL qui redirige à nouveau. Chaque saut coûte du temps et peut affaiblir ce que transmet le lien ; faire pointer la première directement vers la destination règle les deux.",
};

/** Why the agent left work aside. Shown in the run log. */
export const SKIP_REASONS_FR = {
  noAudit: "Aucun audit n’a encore été lancé pour ce client.",
  notFixable: "Constats que l’agent ne sait pas corriger automatiquement.",
  notCapable:
    "Corrections que l’agent sait faire mais ne peut pas appliquer : aucun CMS n’est connecté pour ce client.",
  duplicates: "Constats en double pour une même page.",
  cooldown: (days: number) =>
    `Modifié au cours des ${days} derniers jours : laissé en l’état le temps que cela se stabilise.`,
  dailyLimit: (max: number) => `Limite quotidienne de ${max} modifications déjà atteinte.`,
  runLimit: (max: number) =>
    `Au-delà de la limite de ${max} modifications par exécution : elles seront reprises la prochaine fois.`,
  crawlFailed: "Impossible d’explorer le site pour chercher des pages orphelines.",
  noSource:
    "Pages orphelines sans page proche d’où faire un lien : il faut ajouter un lien à la main, ou un nouveau contenu.",
  noAnchor:
    "Pages orphelines dont la page la plus proche ne contient aucune expression à transformer en lien. Forcer un lien voudrait dire écrire de nouveaux mots dans l’article de quelqu’un, ce que l’agent ne fait pas.",
  foundByTool: (reason: string, toolId: string) => `${reason} (trouvé par l’outil ${toolId})`,
  orphanLink: (title: string, anchor: string) =>
    `Aucune page de ce site ne fait de lien vers « ${title} » : les moteurs de recherche la considèrent comme peu importante et les visiteurs ne la trouvent pas. Cette page est la plus proche par le sujet et contient déjà l’expression « ${anchor} » : en faire un lien oriente lecteurs et robots vers la page orpheline.`,
};

/** What is missing from a client's setup. Same wording as capabilities.ts. */
export const CAPABILITY_GAPS_FR = {
  wpKeyUnreadable:
    "La clé WordPress enregistrée n’a pas pu être déchiffrée. Saisissez-la à nouveau dans les réglages du client.",
  wpNoResponse: (error: string) =>
    `L’extension WordPress n’a pas répondu (${error}). Vérifiez que le site est en ligne et que la clé est toujours valable.`,
  wpNoReason: "aucune raison donnée",
  noCms:
    "Aucun CMS connecté. Installez l’extension WordPress pour ce client : l’agent pourra appliquer les corrections lui-même au lieu de seulement les proposer.",
  unknownVersion: "une version inconnue",
  altText: (v: string) =>
    `L’extension SEO Tool Bridge de ce site est en version ${v}. Le texte alternatif demande la version 0.3.0 ou plus, qui a ajouté le point d’accès reliant une image d’une page à son entrée dans la médiathèque. Mettez l’extension à jour.`,
  internalLinks: (v: string) =>
    `L’extension SEO Tool Bridge de ce site est en version ${v}. Le maillage interne demande la version 0.3.0 ou plus, qui a ajouté le point d’accès qui insère les liens en sécurité et garde la version précédente de l’article. Mettez l’extension à jour.`,
  socialMeta: (v: string) =>
    `L’extension SEO Tool Bridge de ce site est en version ${v}. L’écriture des balises Open Graph et Twitter demande la version 0.6.0 ou plus. Mettez l’extension à jour.`,
  newWrite: (v: string, needs: string) =>
    `L’extension SEO Tool Bridge de ce site est en version ${v}. L’écriture ${needs} demande la version 0.5.0 ou plus. Mettez l’extension à jour.`,
  /** The object of "L’écriture …" for each write gated on plugin 0.5.0. */
  needs: {
    write_canonical: "des balises canoniques",
    write_robots_meta: "des directives robots par page",
    write_robots_txt: "du robots.txt",
    write_redirects: "des redirections",
    write_hardening: "des réglages de sécurisation de WordPress",
  } as Record<string, string>,
  noGsc:
    "Search Console n’est pas connectée : l’agent travaille à partir de l’exploration seule et ne voit pas quelles pages perdent réellement des clics.",
  noAi:
    "Aucun fournisseur d’IA n’est configuré : l’agent peut trouver les problèmes mais pas rédiger de titles ou de descriptions de remplacement. Une clé gratuite Gemini ou Groq suffit.",
};

/** The run summary, plurals included. */
export const RUN_SUMMARY_FR = {
  fixed: (n: number, name: string) =>
    `${n} ${n === 1 ? "correction appliquée" : "corrections appliquées"} sur ${name}`,
  queued: (n: number) =>
    `${n} ${n === 1 ? "modification attend" : "modifications attendent"} votre validation`,
  tasks: (n: number) => `${n} ${n === 1 ? "tâche créée" : "tâches créées"}`,
  failed: (n: number) => `${n} ${n === 1 ? "n’a pas pu être menée" : "n’ont pas pu être menées"} à bien`,
  nothingWhy: (name: string, why: string) => `Rien à faire sur ${name}. ${why}`,
  nothing: (name: string) => `${name} vérifié : rien à modifier.`,
  noClient: "Ce client n’existe plus.",
  off: "L’agent est désactivé.",
  runFailed: (message: string) => `L’exécution a échoué : ${message}`,
};
