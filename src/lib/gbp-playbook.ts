/**
 * GBP optimization playbook. Static, opinionated checklist + audience-
 * growth tactics that apply to any business with a Google Business
 * Profile (which now includes nearly every client per the project
 * direction — local OR not).
 *
 * The page that consumes this scores the client's setup against each
 * item using whatever data we already have (gbpUrl, hours, address,
 * social links, scraped review count) and surfaces quick wins.
 */

export type PlaybookItem = {
  id: string;
  title: string;
  whyItMatters: string;
  /** Higher = more impactful. */
  weight: 1 | 2 | 3 | 4 | 5;
  /** "everyone" applies to all businesses; others scope to a niche. */
  appliesTo: ("everyone" | "local" | "ecommerce" | "saas" | "blog" | "services")[];
  /** Cadence — once / weekly / monthly / quarterly. */
  cadence: "once" | "weekly" | "monthly" | "quarterly";
  /** Plain copy of the action a user takes. */
  action: string;
  /** Optional URL to deep-link from the playbook card. */
  toolPath?: string;
};

export const GBP_PLAYBOOK: PlaybookItem[] = [
  // -------- One-time setup --------
  {
    id: "claim-listing",
    title: "Claim and verify your GBP listing",
    whyItMatters:
      "Unverified listings can be edited by anyone. Verification unlocks reply-to-reviews, posts, products, and Q&A.",
    weight: 5,
    appliesTo: ["everyone"],
    cadence: "once",
    action: "Visit business.google.com, claim/create the listing, complete the postcard or video verification.",
  },
  {
    id: "complete-profile",
    title: "Fill 100% of profile fields",
    whyItMatters:
      "Google explicitly ranks complete profiles higher. Hours, services, attributes, products — every field is a ranking signal.",
    weight: 5,
    appliesTo: ["everyone"],
    cadence: "once",
    action: "Open the dashboard. Walk every field — categories, services, attributes, hours, holiday hours, photos, products.",
  },
  {
    id: "primary-category",
    title: "Pick the most specific primary category",
    whyItMatters:
      "Specific (\"Italian Restaurant\") beats generic (\"Restaurant\") for relevance. Add 5-9 secondary categories too.",
    weight: 5,
    appliesTo: ["everyone"],
    cadence: "once",
    action: "Settings → Category. Pick the closest match, then add up to 9 secondary categories that genuinely fit.",
  },
  {
    id: "service-area",
    title: "Define service area accurately (if applicable)",
    whyItMatters:
      "Service-area businesses outrank in towns they list. Don't list cities you don't serve — Google penalises stuffing.",
    weight: 4,
    appliesTo: ["local", "services"],
    cadence: "once",
    action: "Settings → Service area. List the cities/zip codes you actually serve.",
  },
  {
    id: "products-services",
    title: "Add Products and Services with descriptions",
    whyItMatters:
      "Products / services appear as a carousel in your panel. Each entry is keyword real estate Google indexes.",
    weight: 4,
    appliesTo: ["everyone"],
    cadence: "once",
    action: "Add 5-10 Products / Services. Each one: name, photo, 100-300 word description with target keywords.",
  },

  // -------- Recurring: review acquisition --------
  {
    id: "request-reviews",
    title: "Ask for reviews from happy customers",
    whyItMatters:
      "Review velocity (reviews per week) is one of the strongest local ranking signals. New reviews > old reviews.",
    weight: 5,
    appliesTo: ["everyone"],
    cadence: "weekly",
    action: "Send the GBP review-request short URL to recent customers. Aim for 2-5 new reviews/week.",
  },
  {
    id: "reply-reviews",
    title: "Reply to every review (positive + negative) within 48h",
    whyItMatters:
      "Reply rate is a confirmed ranking signal. Negative replies handled well also build trust with prospects browsing.",
    weight: 5,
    appliesTo: ["everyone"],
    cadence: "weekly",
    action: "Use the AI review-reply tool to draft, then personalise. Don't auto-post — paste with edits.",
    toolPath: "/gbp",
  },
  {
    id: "review-keywords",
    title: "Encourage reviewers to mention services / city",
    whyItMatters:
      "Reviews that mention your services or location boost your relevance for those keywords. Don't script — gently prompt.",
    weight: 3,
    appliesTo: ["local", "services"],
    cadence: "weekly",
    action: "After an oil change: \"If you have a moment, a quick review mentioning your service in [city] really helps us out.\"",
  },

  // -------- Recurring: content --------
  {
    id: "post-update",
    title: "Publish a Google Post weekly",
    whyItMatters:
      "Posts stay live for ~7 days and signal an active business. Profiles posting weekly outrank dormant ones for the same keywords.",
    weight: 4,
    appliesTo: ["everyone"],
    cadence: "weekly",
    action: "1 image + 100-300 words + a CTA. Mix types: offer, event, news, product spotlight.",
  },
  {
    id: "photo-upload",
    title: "Upload 3-5 fresh photos every week",
    whyItMatters:
      "Profiles with frequent fresh photos get 35% more clicks to website and 42% more requests for directions (Google's data).",
    weight: 4,
    appliesTo: ["everyone"],
    cadence: "weekly",
    action: "Take 3-5 photos: storefront, team, products, behind-the-scenes. Upload through the dashboard, not the app.",
  },
  {
    id: "qa-monitor",
    title: "Monitor + answer Q&A on your profile",
    whyItMatters:
      "Anyone can post a Q&A on your listing. Unanswered or wrong-answered Q&A surface in your panel and drive misleading impressions.",
    weight: 3,
    appliesTo: ["everyone"],
    cadence: "weekly",
    action: "Check the Q&A tab. Pre-seed the most common questions yourself with full keyword-rich answers.",
  },

  // -------- Recurring: insights --------
  {
    id: "review-insights",
    title: "Review GBP Insights monthly: discovery vs direct vs branded",
    whyItMatters:
      "Tracking which queries surface your profile shows what Google associates you with. Mismatch = wrong category or stuffed services.",
    weight: 3,
    appliesTo: ["everyone"],
    cadence: "monthly",
    action: "Performance → Search queries. Note the top 10. If they don't match your niche, your category is probably off.",
  },
  {
    id: "competitor-audit",
    title: "Audit 3 top-ranking competitor profiles",
    whyItMatters:
      "Competitors who rank above you in the local pack are usually doing 1-2 things you aren't. Reverse-engineer their photos, posts, services.",
    weight: 3,
    appliesTo: ["local", "services"],
    cadence: "monthly",
    action: "For each, list: # photos, last post date, # reviews vs you, services breadth. Copy what works.",
  },
  {
    id: "nap-audit",
    title: "NAP consistency check across top citations",
    whyItMatters:
      "Inconsistent name, address, phone across directories tanks local rankings. Any tiny variance (Ave. vs Avenue) hurts.",
    weight: 4,
    appliesTo: ["local", "services"],
    cadence: "quarterly",
    action: "Compare against the top citation directories for your country. Fix any mismatches.",
    toolPath: "/citations",
  },

  // -------- Audience growth tactics --------
  {
    id: "messaging-on",
    title: "Turn on Messaging + reply within 1 hour",
    whyItMatters:
      "GBP messaging adds a direct lead channel. Google ranks profiles with active messaging higher (and shows a green \"Responds quickly\" badge).",
    weight: 3,
    appliesTo: ["local", "services", "ecommerce"],
    cadence: "once",
    action: "Dashboard → Messages → On. Set notifications. Aim for sub-1h response time during business hours.",
  },
  {
    id: "booking-link",
    title: "Add a booking / reservation link",
    whyItMatters:
      "Direct booking from the profile bypasses your website + reduces friction. Google surfaces a \"Book\" button on supported categories.",
    weight: 3,
    appliesTo: ["local", "services"],
    cadence: "once",
    action: "Use a free integration partner (Calendly, Schedulista, etc.) or paste your own booking URL.",
  },
  {
    id: "social-cross-promote",
    title: "Cross-promote your GBP on social + in email signature",
    whyItMatters:
      "Direct (\"branded\") searches for your business on Google strengthen relevance signals. Drive them deliberately.",
    weight: 2,
    appliesTo: ["everyone"],
    cadence: "once",
    action: "Add the short URL (g.page/...) to email signatures, social bios, and order confirmations.",
  },
  {
    id: "ugc-photos",
    title: "Encourage customers to upload photos with their reviews",
    whyItMatters:
      "User-uploaded photos count more than business-uploaded ones for showing freshness. They also auto-tag with location/time.",
    weight: 3,
    appliesTo: ["local", "ecommerce", "services"],
    cadence: "monthly",
    action: "In review-request copy: \"If you snap a photo, even better — it helps other customers know what to expect.\"",
  },
  {
    id: "events",
    title: "Publish events as Google Posts",
    whyItMatters:
      "Event posts surface in Google's events search + your panel for the duration. Free promotion for any in-person or webinar event.",
    weight: 2,
    appliesTo: ["everyone"],
    cadence: "monthly",
    action: "When you have an event, post it as type \"Event\" with start/end times and a clear CTA.",
  },
];


/**
 * The same playbook in French: title, why and action of each item, by id.
 * Weights, cadences and niches stay on the English entries, the single
 * source; `gbp-playbook.test.ts` fails when an item has no French text.
 */
export const GBP_PLAYBOOK_FR: Record<string, Pick<PlaybookItem, "title" | "whyItMatters" | "action">> = {
  "claim-listing": {
    title: "Revendiquer et valider votre fiche Google",
    whyItMatters:
      "Une fiche non validée peut être modifiée par n’importe qui. La validation donne accès aux réponses aux avis, aux posts, aux produits et aux questions-réponses.",
    action:
      "Rendez-vous sur business.google.com, revendiquez ou créez la fiche, puis terminez la validation par courrier ou par vidéo.",
  },
  "complete-profile": {
    title: "Remplir tous les champs de la fiche",
    whyItMatters:
      "Google classe explicitement mieux les fiches complètes. Horaires, services, attributs, produits : chaque champ est un signal de classement.",
    action:
      "Ouvrez le tableau de bord et passez chaque champ en revue : catégories, services, attributs, horaires, horaires des jours fériés, photos, produits.",
  },
  "primary-category": {
    title: "Choisir la catégorie principale la plus précise",
    whyItMatters:
      "Une catégorie précise (« Restaurant italien ») l’emporte sur une catégorie générique (« Restaurant ») en pertinence. Ajoutez aussi 5 à 9 catégories secondaires.",
    action:
      "Paramètres → Catégorie. Choisissez la plus proche, puis ajoutez jusqu’à 9 catégories secondaires qui correspondent vraiment à votre activité.",
  },
  "service-area": {
    title: "Définir précisément la zone desservie (le cas échéant)",
    whyItMatters:
      "Les entreprises à zone desservie se classent mieux dans les villes qu’elles indiquent. N’indiquez pas de villes que vous ne desservez pas : Google pénalise ce remplissage.",
    action: "Paramètres → Zone desservie. Indiquez les villes ou codes postaux que vous desservez réellement.",
  },
  "products-services": {
    title: "Ajouter produits et services avec leur description",
    whyItMatters:
      "Produits et services s’affichent en carrousel dans votre fiche. Chaque entrée est un emplacement de mots-clés que Google indexe.",
    action:
      "Ajoutez 5 à 10 produits ou services. Pour chacun : un nom, une photo et une description de 100 à 300 mots avec les mots-clés visés.",
  },
  "request-reviews": {
    title: "Demander un avis aux clients satisfaits",
    whyItMatters:
      "Le rythme des avis (nombre d’avis par semaine) compte parmi les signaux de classement local les plus forts. Les avis récents pèsent plus que les anciens.",
    action:
      "Envoyez le lien court de demande d’avis de la fiche à vos clients récents. Visez 2 à 5 nouveaux avis par semaine.",
  },
  "reply-reviews": {
    title: "Répondre à chaque avis (positif ou négatif) sous 48 h",
    whyItMatters:
      "Le taux de réponse est un signal de classement confirmé. Une réponse bien tournée à un avis négatif renforce aussi la confiance des prospects qui consultent la fiche.",
    action:
      "Préparez un brouillon avec l’outil de réponse aux avis par IA, puis personnalisez-le. Pas de publication automatique : collez la réponse après l’avoir relue.",
  },
  "review-keywords": {
    title: "Inviter les clients à citer le service et la ville dans leur avis",
    whyItMatters:
      "Les avis qui mentionnent vos services ou votre ville renforcent votre pertinence sur ces mots-clés. Ne dictez rien : suggérez-le simplement.",
    action:
      "Après une vidange, par exemple : « Si vous avez un instant, un petit avis qui mentionne votre prestation à [ville] nous aiderait beaucoup. »",
  },
  "post-update": {
    title: "Publier une actualité Google chaque semaine",
    whyItMatters:
      "Les posts restent en ligne environ 7 jours et montrent une entreprise active. Les fiches qui publient chaque semaine se classent mieux que les fiches inactives sur les mêmes mots-clés.",
    action:
      "1 image, 100 à 300 mots et un appel à l’action. Variez les types : offre, événement, actualité, produit mis en avant.",
  },
  "photo-upload": {
    title: "Ajouter 3 à 5 photos récentes chaque semaine",
    whyItMatters:
      "Les fiches qui ajoutent souvent des photos récentes reçoivent 35 % de clics en plus vers le site et 42 % de demandes d’itinéraire en plus (données de Google).",
    action:
      "Prenez 3 à 5 photos : devanture, équipe, produits, coulisses. Ajoutez-les depuis le tableau de bord, pas depuis l’application.",
  },
  "qa-monitor": {
    title: "Surveiller les questions-réponses de la fiche et y répondre",
    whyItMatters:
      "N’importe qui peut poser une question sur votre fiche. Les questions sans réponse ou mal répondues s’affichent dans votre fiche et donnent une image trompeuse.",
    action:
      "Consultez l’onglet Questions-réponses. Publiez vous-même les questions les plus fréquentes, avec des réponses complètes et riches en mots-clés.",
  },
  "review-insights": {
    title: "Consulter chaque mois les statistiques de la fiche : recherches directes, de découverte et de marque",
    whyItMatters:
      "Suivre les requêtes qui affichent votre fiche montre à quoi Google vous associe. Un décalage signale une mauvaise catégorie ou des services surchargés de mots-clés.",
    action:
      "Performances → Requêtes de recherche. Notez les 10 premières. Si elles ne correspondent pas à votre activité, votre catégorie est probablement mal choisie.",
  },
  "competitor-audit": {
    title: "Analyser les fiches de 3 concurrents mieux classés",
    whyItMatters:
      "Les concurrents placés au-dessus de vous dans le pack local font généralement 1 ou 2 choses que vous ne faites pas. Étudiez leurs photos, leurs posts et leurs services.",
    action:
      "Pour chacun, notez : nombre de photos, date du dernier post, nombre d’avis par rapport à vous, étendue des services. Reprenez ce qui fonctionne.",
  },
  "nap-audit": {
    title: "Vérifier la cohérence nom-adresse-téléphone dans les principaux annuaires",
    whyItMatters:
      "Un nom, une adresse ou un téléphone différents d’un annuaire à l’autre font chuter le classement local. Le moindre écart (« av. » au lieu de « avenue ») pénalise.",
    action: "Comparez avec les principaux annuaires de votre pays et corrigez chaque divergence.",
  },
  "messaging-on": {
    title: "Activer la messagerie et répondre en moins d’une heure",
    whyItMatters:
      "La messagerie de la fiche ajoute un canal direct pour les prospects. Google classe mieux les fiches dont la messagerie est active (et affiche un badge vert « Répond rapidement »).",
    action:
      "Tableau de bord → Messages → Activé. Réglez les notifications. Visez une réponse en moins d’une heure pendant les heures d’ouverture.",
  },
  "booking-link": {
    title: "Ajouter un lien de prise de rendez-vous ou de réservation",
    whyItMatters:
      "La réservation directe depuis la fiche évite le passage par votre site et réduit les frictions. Google affiche un bouton « Réserver » pour les catégories compatibles.",
    action:
      "Utilisez un partenaire d’intégration gratuit (Calendly, Schedulista, etc.) ou collez votre propre lien de réservation.",
  },
  "social-cross-promote": {
    title: "Mettre en avant la fiche sur les réseaux sociaux et dans la signature e-mail",
    whyItMatters:
      "Les recherches directes (« de marque ») de votre entreprise sur Google renforcent les signaux de pertinence. Suscitez-les volontairement.",
    action:
      "Ajoutez le lien court (g.page/...) aux signatures e-mail, aux biographies des réseaux sociaux et aux confirmations de commande.",
  },
  "ugc-photos": {
    title: "Inviter les clients à joindre une photo à leur avis",
    whyItMatters:
      "Les photos ajoutées par les clients comptent plus que celles de l’entreprise pour montrer que la fiche est à jour. Elles sont aussi associées automatiquement à un lieu et une date.",
    action:
      "Dans le message de demande d’avis : « Si vous prenez une photo, c’est encore mieux : cela aide les autres clients à savoir à quoi s’attendre. »",
  },
  events: {
    title: "Publier vos événements en actualités Google",
    whyItMatters:
      "Les posts d’événement apparaissent dans la recherche d’événements de Google et dans votre fiche pendant toute leur durée. Une promotion gratuite pour tout événement sur place ou webinaire.",
    action:
      "Quand vous organisez un événement, publiez-le avec le type « Événement », ses dates de début et de fin et un appel à l’action clair.",
  },
};

/** Labels of the missing profile fields `scoreGbpProfile` reports. */
const MISSING_LABELS = {
  en: {
    url: "GBP listing URL",
    address: "Address",
    phone: "Phone",
    hours: "Operating hours",
    reviews: "Reviews (need at least 5 to start)",
  },
  fr: {
    url: "Lien de la fiche Google",
    address: "Adresse",
    phone: "Téléphone",
    hours: "Horaires d’ouverture",
    reviews: "Avis (5 au minimum pour commencer)",
  },
} as const;

/**
 * Filter the playbook to items relevant for a client's niche, then sort
 * by weight (biggest first). In French, each item's text is swapped for
 * its French version; ids, weights and cadences are unchanged.
 */
export function playbookFor(
  niche: string | null | undefined,
  locale: "en" | "fr" = "en",
): PlaybookItem[] {
  const normalized = (niche ?? "everyone") as PlaybookItem["appliesTo"][number];
  return GBP_PLAYBOOK.filter(
    (i) => i.appliesTo.includes("everyone") || i.appliesTo.includes(normalized),
  )
    .sort((a, b) => b.weight - a.weight)
    .map((i) => (locale === "fr" && GBP_PLAYBOOK_FR[i.id] ? { ...i, ...GBP_PLAYBOOK_FR[i.id] } : i));
}

/**
 * Score a client's GBP setup using whatever signals we have.
 * Returns a 0-100 number plus the items that contributed to the gap.
 */
export function scoreGbpProfile(
  input: {
    hasGbpUrl: boolean;
    hasAddress: boolean;
    hasPhone: boolean;
    hasHours: boolean;
    reviewCount: number | null;
    ratingAverage: number | null;
  },
  locale: "en" | "fr" = "en",
): { score: number; missing: string[] } {
  const M = MISSING_LABELS[locale];
  const missing: string[] = [];
  let score = 0;
  let max = 0;

  // Profile presence — 25
  max += 25;
  if (input.hasGbpUrl) score += 25;
  else missing.push(M.url);

  // NAP completeness — 30
  max += 30;
  if (input.hasAddress) score += 12;
  else missing.push(M.address);
  if (input.hasPhone) score += 10;
  else missing.push(M.phone);
  if (input.hasHours) score += 8;
  else missing.push(M.hours);

  // Review presence — 25
  max += 25;
  const rc = input.reviewCount ?? 0;
  if (rc >= 50) score += 25;
  else if (rc >= 20) score += 18;
  else if (rc >= 5) score += 10;
  else if (rc >= 1) score += 4;
  else missing.push(M.reviews);

  // Rating — 20
  max += 20;
  const r = input.ratingAverage ?? 0;
  if (r >= 4.6) score += 20;
  else if (r >= 4.0) score += 14;
  else if (r >= 3.0) score += 8;
  else if (r > 0) score += 3;

  return {
    score: Math.round((score / max) * 100),
    missing,
  };
}
