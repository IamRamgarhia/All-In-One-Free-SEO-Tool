/**
 * The default outreach templates in French, keyed by the English template
 * name (outreach.ts, DEFAULT_TEMPLATES). Seeded instead of the English ones
 * when the workspace language is French: these emails go to third-party
 * sites, most of them French.
 */
export const DEFAULT_TEMPLATES_FR: Record<string, { name: string; subject: string; body: string }> = {
  "Guest post pitch": {
    name: "Proposition d’article invité",
    subject: "Une idée d’article pour les lecteurs de {{website}}",
    body: `Bonjour {{name}},

J’ai découvert {{website}} et j’ai beaucoup apprécié vos derniers articles. Je m’occupe du contenu de {{client_name}} ({{client_url}}) et j’ai quelques idées de sujets qui pourraient intéresser vos lecteurs. Je vous propose volontiers un article invité, gratuit et écrit dans votre style.

Trois titres provisoires :
- [sujet 1]
- [sujet 2]
- [sujet 3]

Si l’un d’eux vous parle, je peux vous envoyer un premier jet la semaine prochaine.

Merci et bonne journée,
{{my_name}}`,
  },
  "Broken link replacement": {
    name: "Remplacement d’un lien cassé",
    subject: "Un lien cassé sur {{website}}",
    body: `Bonjour {{name}},

Je lisais votre article sur {{website}} et j’ai remarqué qu’un des liens sortants ne fonctionne plus.

Nous avons publié une ressource gratuite sur le même sujet : {{client_url}}. Aucun souci si elle ne convient pas, je vous la signale au cas où elle serait utile à vos lecteurs.

Dans tous les cas, j’espère que ce signalement vous rendra service.

Bien cordialement,
{{my_name}}`,
  },
  "Resource page outreach": {
    name: "Proposition pour une page de ressources",
    subject: "Une suggestion pour votre liste de ressources sur {{website}}",
    body: `Bonjour {{name}},

J’aime beaucoup la liste de ressources de {{website}} : une sélection vraiment utile.

Nous venons de publier un outil (ou un guide) gratuit, {{client_url}}, qui pourrait trouver sa place à côté des autres. Aucune obligation : je vous en parle seulement parce qu’il complète bien les ressources de votre liste.

Merci d’avoir réuni tout cela.

Bien cordialement,
{{my_name}}`,
  },
  "Backlink recovery": {
    name: "Récupération d’un lien perdu",
    subject: "Un lien disparu sur {{website}}",
    body: `Bonjour {{name}},

Vous aviez fait un lien vers {{client_name}} ({{client_url}}) il y a quelque temps, et nous vous en remercions.

Il semble que ce lien ait disparu lors d’une mise à jour récente de votre page sur {{website}}. Si vous acceptez de le remettre, l’adresse d’origine fonctionne toujours.

Dans tous les cas, merci pour votre soutien.

Bien cordialement,
{{my_name}}`,
  },
};
