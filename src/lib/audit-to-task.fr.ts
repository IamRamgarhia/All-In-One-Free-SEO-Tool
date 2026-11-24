/**
 * French versions of the generated task texts (audit-to-task.ts,
 * quick-wins.ts, the engine tasks in seomator-audit.ts). Picked by the
 * workspace language (Settings → General), the one reports use, when the
 * task is created. Same keys as the English tables; a missing key falls
 * back to English.
 */

type Blueprint = { title: (where: string) => string; whyItMatters: string };

export const blueprintsFr: Record<string, Blueprint> = {
  fetch_failed: {
    title: () => "Trouver pourquoi le site est injoignable",
    whyItMatters:
      "Si notre robot ne peut pas joindre le site, celui de Google non plus, très probablement. C'est le premier obstacle au référencement.",
  },
  bad_status: {
    title: (where) => `Corriger le code d'erreur sur ${where}`,
    whyItMatters:
      "Les pages qui renvoient une erreur 4xx ou 5xx sont retirées de l'index de Google. Rétablissez un statut 200 avant tout le reste.",
  },
  no_https: {
    title: () => "Passer le site en HTTPS",
    whyItMatters:
      "Google utilise le HTTPS comme signal de classement, et Chrome affiche les pages HTTP comme « Non sécurisé ». C'est le minimum.",
  },
  missing_title: {
    title: (where) => `Ajouter une balise <title> à ${where}`,
    whyItMatters:
      "Le <title> est ce que les internautes voient dans les résultats. Sans lui, Google peut inventer un titre qui ne représente pas la page.",
  },
  short_title: {
    title: (where) => `Allonger le title de ${where} à 50–60 caractères`,
    whyItMatters:
      "Un title trop court gâche la place la plus visible du résultat de recherche et attire moins de clics qu'un title descriptif.",
  },
  long_title: {
    title: (where) => `Raccourcir le title de ${where} sous 60 caractères`,
    whyItMatters: "Google coupe les titles trop longs dans les résultats, souvent sur les mots les plus importants.",
  },
  missing_meta_description: {
    title: (where) => `Rédiger une méta-description pour ${where}`,
    whyItMatters:
      "Google reprend souvent la méta-description dans ses extraits. Une description de 120 à 155 caractères améliore nettement le taux de clic.",
  },
  short_meta_description: {
    title: (where) => `Allonger la méta-description de ${where} à 120–155 caractères`,
    whyItMatters: "Une description trop courte laisse de la place vide dans l'extrait et convainc moins qu'une description complète.",
  },
  long_meta_description: {
    title: (where) => `Raccourcir la méta-description de ${where} sous 160 caractères`,
    whyItMatters: "Les descriptions trop longues sont coupées au milieu d'une phrase dans les résultats, ce qui fait peu professionnel.",
  },
  missing_h1: {
    title: (where) => `Ajouter un titre <h1> clair à ${where}`,
    whyItMatters:
      "Le H1 dit d'un coup d'œil aux internautes et aux moteurs de quoi parle la page. Sans H1, la page paraît mal structurée.",
  },
  missing_canonical: {
    title: (where) => `Ajouter une balise canonical à ${where}`,
    whyItMatters:
      "Sans canonical, Google devine quelle adresse est la « vraie », se trompe parfois et disperse les signaux de classement.",
  },
  missing_viewport: {
    title: (where) => `Ajouter la balise meta viewport à ${where}`,
    whyItMatters:
      "Sans meta viewport, la page s'affiche mal sur téléphone, et Google indexe désormais la version mobile en priorité.",
  },
  noindex_set: {
    title: (where) => `Retirer le noindex de ${where}`,
    whyItMatters:
      "La page demande explicitement à Google de ne pas l'indexer. C'est presque toujours un oubli de la préproduction : vérifiez que ce n'est pas voulu, puis retirez-le.",
  },
  missing_lang: {
    title: (where) => `Ajouter l'attribut lang à <html> sur ${where}`,
    whyItMatters: "Il indique la langue de la page aux moteurs et aux lecteurs d'écran. Petite correction, utile aux deux.",
  },
  missing_favicon: {
    title: () => "Ajouter un favicon",
    whyItMatters:
      "Le favicon apparaît à côté du site dans les onglets et les résultats de recherche : un petit repère de marque qui fait soigné.",
  },
  missing_og_tags: {
    title: (where) => `Ajouter les balises Open Graph à ${where}`,
    whyItMatters:
      "Sans balises OG, un lien partagé sur Slack, LinkedIn ou Facebook s'affiche sans image ni marque, et donne peu envie de cliquer.",
  },
  missing_image_alt: {
    title: (where) => `Ajouter un texte alternatif aux images de ${where}`,
    whyItMatters:
      "Le texte alternatif aide les lecteurs d'écran et la recherche d'images, et donne à Google plus de contexte sur le sujet de la page.",
  },
  missing_schema: {
    title: (where) => `Ajouter des données structurées (JSON-LD) à ${where}`,
    whyItMatters:
      "Les données structurées rendent la page éligible aux résultats enrichis et aident les réponses des IA à la citer.",
  },
  thin_content: {
    title: (where) => `Étoffer le contenu de ${where}`,
    whyItMatters:
      "Une page avec très peu de texte est souvent jugée pauvre par Google et se classe rarement sur quoi que ce soit.",
  },
  missing_robots_txt: {
    title: () => "Ajouter un fichier robots.txt",
    whyItMatters:
      "Le robots.txt indique aux robots ce qu'ils peuvent lire et où se trouve le sitemap. Sans lui, ils doivent deviner.",
  },
  missing_sitemap: {
    title: () => "Créer et soumettre un sitemap.xml",
    whyItMatters: "Le sitemap aide Google à trouver toutes les pages, y compris celles vers lesquelles peu de liens pointent.",
  },
  missing_security_headers: {
    title: () => "Ajouter les en-têtes de sécurité manquants",
    whyItMatters:
      "Les en-têtes comme HSTS ou X-Frame-Options protègent les visiteurs et comptent comme signal de confiance. En général, une ligne de configuration serveur chacun.",
  },
};

/** "your homepage" / "/about" / "12 pages" / "the site", in French. */
export function placeFr(urls: readonly string[]): string {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length > 1) return `${unique.length} pages`;
  const url = unique[0];
  if (!url) return "le site";
  try {
    const path = new URL(url).pathname;
    return path === "/" || path === "" ? "la page d'accueil" : path;
  } catch {
    return url;
  }
}

/** Quick-win titles, by finding type. `where` is a path or "N pages". */
export const quickWinTitlesFr: Record<string, (where: string) => string> = {
  missing_title: (w) => `Ajouter une balise title à ${w}`,
  missing_meta_description: (w) => `Rédiger une méta-description pour ${w}`,
  long_title: (w) => `Raccourcir le title de ${w} sous 60 caractères`,
  short_title: (w) => `Allonger le title de ${w} (50 à 60 caractères recommandés)`,
  long_meta_description: (w) => `Raccourcir la méta-description de ${w} à ~155 caractères`,
  missing_h1: (w) => `Ajouter un titre H1 à ${w}`,
  missing_image_alt: (w) => `Ajouter un texte alternatif aux images de ${w}`,
  missing_canonical: (w) => `Ajouter une balise canonical à ${w}`,
  missing_sitemap: () => "Créer et soumettre un sitemap.xml",
  missing_robots_txt: () => "Ajouter un fichier robots.txt",
  invalid_robots_txt: () => "Corriger les directives invalides du robots.txt",
  missing_og_tags: (w) => `Ajouter les balises Open Graph à ${w}`,
  missing_schema: (w) => `Ajouter des données structurées à ${w}`,
  broken_link: (w) => `Corriger le lien cassé sur ${w}`,
  redirect_chain: (w) => `Raccourcir la chaîne de redirections de ${w}`,
  no_https: () => "Activer le HTTPS et corriger le contenu mixte",
};

export const quickWinWhyFr =
  "Gain rapide repéré par le dernier audit : fort impact, peu d'effort. À traiter en premier pour débloquer le reste.";

/** Engine task, in French. `rule` keeps the engine's own rule name. */
export function engineTitleFr(priority: string, rule: string, where: string): string {
  return `[${priority}] ${rule} : à corriger sur ${where}`;
}

export const engineWhyFr =
  "Règle d'audit technique. Les problèmes graves bloquent l'exploration, l'indexation ou la confiance : à corriger avant le travail de contenu.";
