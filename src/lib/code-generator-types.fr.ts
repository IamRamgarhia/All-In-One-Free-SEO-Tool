/**
 * The code generator's targets in French, keyed like TARGETS in
 * code-generator-types.ts. Only what the reader sees is translated; the
 * system prompts stay in English (they are written for the model).
 * A test keeps the keys, the number of install steps and the warnings in step.
 */
import type { GeneratorTarget } from "./code-generator-types";

export type CodeGenTextFr = {
  label: string;
  description: string;
  installSteps: string[];
  warning?: string;
};

export const TARGETS_FR: Record<GeneratorTarget, CodeGenTextFr> = {
  "wp-plugin-simple": {
    label: "Extension WordPress : fichier unique",
    description:
      "Un fichier d’extension autonome (.php) à déposer dans wp-content/plugins/. Adapté à une tâche précise : meta SEO remplies automatiquement, règles de redirection, schéma personnalisé, etc.",
    installSteps: [
      "Enregistrez le code généré dans un fichier .php (utilisez le nom de fichier indiqué dans l’en-tête de l’extension).",
      "Envoyez-le dans wp-content/plugins/ sur votre serveur (FTP, cPanel ou SSH).",
      "Dans l’administration WordPress, allez dans Extensions et cliquez sur Activer pour la nouvelle extension.",
      "Ouvrez la page de réglages de l’extension (s’il y en a une) ou vérifiez le site.",
    ],
    warning:
      "Une extension s’exécute avec tous les droits de WordPress. Relisez le code avant de l’activer en production.",
  },
  "wp-plugin-advanced": {
    label: "Extension WordPress : structure complète",
    description:
      "Une extension en plusieurs fichiers, avec page de réglages dans l’administration, API Options et conventions WordPress. Adaptée à des automatisations SEO plus complexes.",
    installSteps: [
      "Créez un dossier portant le slug de l’extension.",
      "Enregistrez dans ce dossier chaque fichier généré par l’IA.",
      "Compressez le dossier en .zip.",
      "Administration WordPress → Extensions → Ajouter → Téléverser une extension → Activer.",
    ],
    warning:
      "Une extension avancée touche de nombreux rouages de WordPress. Testez-la d’abord sur un site de préproduction.",
  },
  "wp-functions": {
    label: "Extrait pour functions.php (WordPress)",
    description:
      "Un extrait autonome à coller dans le functions.php de votre thème (ou dans l’extension Code Snippets). Pour des réglages SEO rapides sans créer d’extension.",
    installSteps: [
      "Ouvrez le functions.php de votre thème actif, ou installez l’extension gratuite « Code Snippets ».",
      "Collez l’extrait à la fin du fichier (avant la balise de fermeture ?> si elle existe).",
      "Enregistrez. WordPress l’applique aussitôt.",
    ],
    warning:
      "Une erreur de syntaxe dans functions.php peut rendre votre site inaccessible (page blanche). L’extension Code Snippets vérifie le code avant de l’enregistrer.",
  },
  "html-snippet": {
    label: "Extrait HTML (toute plateforme)",
    description:
      "Du HTML brut avec CSS intégré, à coller dans un champ HTML de n’importe quel CMS, un bloc de code personnalisé ou n’importe où sur une page.",
    installSteps: [
      "Copiez l’extrait en entier.",
      "Ouvrez l’éditeur de votre page.",
      "Repérez le bloc HTML, Code personnalisé ou Intégration (la plupart des constructeurs de pages en ont un).",
      "Collez, puis enregistrez.",
    ],
  },
  "elementor-html": {
    label: "Widget HTML Elementor",
    description:
      "Prévu pour être collé dans le widget HTML d’Elementor. Comprend les styles qu’Elementor retire par défaut.",
    installSteps: [
      "Modifiez votre page avec Elementor.",
      "Glissez le widget « HTML ».",
      "Collez l’extrait en entier.",
      "Cliquez sur Mettre à jour. Elementor l’affiche tel quel.",
    ],
  },
  "shopify-liquid": {
    label: "Modèle Shopify Liquid",
    description:
      "Un extrait Liquid pour les thèmes Shopify : ajoute des meta, un schéma ou une mise en page personnalisés aux pages produit ou collection.",
    installSteps: [
      "Administration Shopify → Boutique en ligne → Thèmes → Actions → Modifier le code.",
      "Repérez le bon modèle (product.liquid, collection.liquid, theme.liquid).",
      "Collez l’extrait à l’endroit indiqué par le bloc de commentaire.",
      "Enregistrez. Les changements s’appliquent aussitôt.",
    ],
    warning:
      "Il est recommandé de dupliquer le thème d’abord : une erreur Liquid peut casser la boutique.",
  },
  "schema-jsonld": {
    label: "JSON-LD Schema.org",
    description:
      "Un bloc de données structurées à coller dans le <head> de la page. Fonctionne sur toutes les plateformes.",
    installSteps: [
      "Copiez le bloc <script type=\"application/ld+json\"> en entier.",
      "Collez-le dans le <head> de votre page (toute plateforme).",
      "Vérifiez-le avec le test des résultats enrichis de Google avant de publier.",
    ],
  },
  htaccess: {
    label: "Règles .htaccess (Apache)",
    description:
      "Règles au niveau du serveur : redirections, en-têtes de sécurité, cache. Fonctionne sur les hébergements Apache (la plupart des hébergements mutualisés, cPanel).",
    installSteps: [
      "Connectez-vous à votre serveur en FTP ou avec le gestionnaire de fichiers de cPanel.",
      "Allez à la racine du site (là où se trouvent wp-config.php ou index.html).",
      "Ouvrez .htaccess (activez l’affichage des fichiers cachés si vous ne le voyez pas).",
      "Collez les règles en haut du fichier, puis enregistrez.",
      "Testez tout de suite : une règle erronée peut vous bloquer l’accès au site.",
    ],
    warning:
      "Un .htaccess cassé rend tout le site inaccessible. Il est recommandé de sauvegarder d’abord le fichier existant.",
  },
  "nginx-config": {
    label: "Extrait de configuration Nginx",
    description: "Règles de bloc server pour Nginx : redirections, en-têtes, cache.",
    installSteps: [
      "Connectez-vous en SSH à votre serveur (ou ouvrez la configuration Nginx dans votre panneau d’hébergement).",
      "Modifiez /etc/nginx/sites-available/votresite (ou le fichier de configuration concerné).",
      "Collez les règles dans le bloc server { } à l’endroit indiqué.",
      "Lancez `nginx -t` pour vérifier la syntaxe de la configuration.",
      "Si tout est correct : `sudo systemctl reload nginx`.",
    ],
    warning:
      "Lancez `nginx -t` avant de recharger : une configuration erronée met le site hors ligne.",
  },
  "robots-txt": {
    label: "robots.txt",
    description: "Règles d’exploration pour les moteurs de recherche et les robots d’IA.",
    installSteps: [
      "Enregistrez le fichier sous le nom « robots.txt ».",
      "Envoyez-le à la racine de votre site (votresite.fr/robots.txt).",
      "Vérifiez en ouvrant cette adresse.",
      "Contrôlez-le dans la Google Search Console, sous « Paramètres → robots.txt ».",
    ],
  },
  "tracking-js": {
    label: "JS de suivi et d’analyse",
    description:
      "Un extrait JavaScript pour le suivi d’événements, les pixels de conversion ou une mesure d’audience personnalisée. À coller dans le <head> ou le <body>.",
    installSteps: [
      "Copiez le bloc <script>.",
      "Collez-le dans le <head> de la page (la plupart des plateformes ont un champ « code personnalisé » ou « injection dans l’en-tête »).",
      "Sous WordPress : installez une extension comme Insert Headers and Footers et collez le code dans la partie Header.",
      "Testez en inspectant la page et en cherchant l’appel de mesure dans l’onglet Réseau.",
    ],
  },
  "react-component": {
    label: "Composant React / Next.js (.tsx)",
    description:
      "Un composant React (TypeScript) prêt à l’emploi, utile pour les sites headless, Next.js ou Astro.",
    installSteps: [
      "Enregistrez-le en .tsx dans votre projet (par exemple dans components/).",
      "Importez-le là où vous en avez besoin : import { ComponentName } from \"@/components/...\";",
      "Affichez-le dans votre page ou votre layout.",
    ],
  },
  "nextjs-route": {
    label: "Route Next.js (App Router)",
    description:
      "Un nouveau fichier de route (page.tsx) pour l’App Router de Next.js 13 et plus : utile pour des pages d’atterrissage SEO, des pages générées, des sitemaps, etc.",
    installSteps: [
      "Choisissez le chemin de l’URL (par exemple /tarifs → src/app/tarifs/page.tsx).",
      "Enregistrez le fichier généré à ce chemin.",
      "Next.js crée la route tout seul, sans configuration.",
    ],
  },
  "drupal-twig": {
    label: "Modèle Twig Drupal",
    description: "Un extrait de modèle Twig pour thème Drupal 9/10.",
    installSteps: [
      "Enregistrez-le dans le dossier templates/ de votre thème, en suivant la convention de nommage de Drupal.",
      "Videz le cache (drush cr, ou Administration → Performance → Vider tous les caches).",
    ],
  },
  "ghost-injection": {
    label: "Injection de code Ghost (en-tête / pied de page)",
    description:
      "Un bloc d’injection de code pour Ghost, à coller dans Settings → Code injection (en-tête ou pied de page).",
    installSteps: [
      "Administration Ghost → Settings → Code injection.",
      "Collez-le dans Site Header ou Site Footer (selon le commentaire de l’extrait).",
      "Enregistrez. Le code s’applique à tout le site.",
    ],
  },
  "webflow-embed": {
    label: "Intégration HTML Webflow",
    description: "Un extrait pour le composant Embed de Webflow, utilisable avec l’offre gratuite.",
    installSteps: [
      "Dans le Designer Webflow, glissez un élément « Embed » à l’endroit voulu.",
      "Collez l’extrait en entier.",
      "Publiez.",
    ],
  },
  "csv-redirects": {
    label: "CSV de redirections en masse",
    description:
      "Un CSV de paires ancienne URL → nouvelle URL, à importer dans l’extension Redirection (WordPress), Yoast ou tout gestionnaire de redirections.",
    installSteps: [
      "Enregistrez le fichier sous le nom redirects.csv.",
      "Importez-le dans votre gestionnaire de redirections (extension Redirection : Outils → Importer).",
      "Vérifiez quelques redirections avec curl -I avant la mise en ligne.",
    ],
  },
};

/** Group headings, keyed by the English label in TARGET_GROUPS. */
export const TARGET_GROUP_LABELS_FR: Record<string, string> = {
  WordPress: "WordPress",
  "Universal HTML / Embed": "HTML universel / intégration",
  Shopify: "Shopify",
  "Structured data + crawl": "Données structurées et exploration",
  "Server config": "Configuration serveur",
  "JS / tracking": "JS / suivi",
  "Headless / dev": "Headless / développement",
  Migration: "Migration",
};
