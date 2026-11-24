/**
 * The prospects library in French, keyed like backlink-prospects-data.ts.
 *
 * A prospect has no id, so the key is its name and URL ("name | url"),
 * which together are unique. Shown when the interface is French, with the
 * English entry as fallback; a test keeps the keys in step.
 *
 * Figures in the English text without a source (traffic, prices, review
 * delays given as fixed) are left out here: the French keeps the point.
 */
import type { Prospect, ProspectCategory } from "./backlink-prospects-data";

export function prospectKey(p: Pick<Prospect, "name" | "url">): string {
  return `${p.name} | ${p.url}`;
}

export const PROSPECTS_FR: Record<string, { description: string; howTo: string[] }> = {
  "DMOZ Successor (Curlie) | https://curlie.org/docs/en/add.html": {
    description: "Le successeur de DMOZ, tenu par une communauté. Les éditeurs examinent chaque proposition, ce qui peut prendre plusieurs semaines.",
    howTo: [
      "Trouvez la catégorie la plus précise qui correspond à votre site.",
      "Cliquez sur « suggest a site » dans cette catégorie précise.",
      "Rédigez une description neutre et factuelle d’environ 25 à 30 mots.",
      "Patientez, l’examen prend en général plusieurs semaines. Évitez de soumettre à nouveau : les propositions en double sont refusées.",
    ],
  },
  "Best of the Web (BOTW) | https://botw.org/": {
    description: "Annuaire avec examen éditorial payant. En activité depuis de nombreuses années.",
    howTo: [
      "Choisissez la catégorie la plus précise : les catégories principales sont saturées.",
      "Rédigez une description d’une centaine de mots centrée sur ce que l’utilisateur y gagne.",
      "Réglez les frais uniques. L’examen prend en général quelques jours ouvrés.",
    ],
  },
  "Jasmine Directory | https://www.jasminedirectory.com/": {
    description: "Annuaire éditorial avec abonnement annuel payant. Convient aux entreprises sérieuses.",
    howTo: [
      "Choisissez la catégorie avec soin : la changer ensuite est payant.",
      "La description doit citer concrètement vos produits ou services.",
      "Le renouvellement annuel est nécessaire pour garder le lien actif.",
    ],
  },
  "Hotfrog | https://www.hotfrog.com/": {
    description: "Annuaire d’entreprises international. Il vaut surtout comme citation NAP, plus que pour le lien.",
    howTo: [
      "Ajoutez votre entreprise avec un nom, une adresse et un téléphone identiques partout.",
      "Validez par e-mail ou par téléphone.",
      "Ajoutez des photos et une description complète pour mieux ressortir dans Hotfrog.",
    ],
  },
  "Brownbook | https://www.brownbook.net/": {
    description: "Annuaire d’entreprises international. Validation rapide.",
    howTo: [
      "Cliquez sur « add a business ».",
      "Renseignez le NAP exactement comme sur votre site et votre fiche Google Business Profile.",
      "Validez par e-mail.",
    ],
  },
  "Medium | https://medium.com/": {
    description: "Plateforme de publication gratuite. Les liens dans le corps des articles sont en dofollow. Republiez-y vos articles de blog une fois l’original indexé.",
    howTo: [
      "Attendez quelques semaines après la publication sur votre site, le temps que Google indexe l’original.",
      "Indiquez votre URL d’origine comme canonique : Medium la prend en compte.",
      "Ajoutez un ou deux liens contextuels vers des pages pertinentes.",
      "Choisissez quelques tags bien ciblés.",
    ],
  },
  "Dev.to | https://dev.to/": {
    description: "Plateforme de publication pour développeurs. Les articles de qualité portent des liens dofollow.",
    howTo: [
      "Indiquez votre blog comme canonique si vous republiez un article.",
      "Privilégiez la qualité à la quantité : les articles techniques approfondis sont recommandés.",
      "Participez aux commentaires pour asseoir votre profil.",
    ],
  },
  "Hashnode | https://hashnode.com/": {
    description: "Réseau de blogs pour développeurs. Un domaine personnalisé est possible, ce qui valorise les liens.",
    howTo: [
      "Choisissez un sous-domaine hashnode.dev facile à retenir.",
      "Republiez vos articles avec une canonique vers votre blog principal.",
      "Utilisez quelques tags de niche plutôt que des tags génériques.",
    ],
  },
  "Substack | https://substack.com/": {
    description: "Plateforme de newsletters. Les articles sont indexés par Google et les liens sont en dofollow.",
    howTo: [
      "Choisissez une niche et publiez régulièrement : la régularité compte.",
      "Ajoutez deux ou trois liens contextuels par article vers vos pages pertinentes.",
      "Échangez des liens avec d’autres Substack de votre niche pour un effet cumulé.",
    ],
  },
  "LinkedIn Articles | https://www.linkedin.com/post/new": {
    description: "Articles longs sur LinkedIn. Liens en nofollow, mais ils apportent du trafic vers la marque et un effet SEO indirect.",
    howTo: [
      "Publiez régulièrement pour gagner en diffusion.",
      "Placez un lien vers votre site dans votre profil d’auteur et un lien dans le corps de l’article.",
      "Ne retenez pas l’essentiel derrière un lien : donnez la valeur dans l’article lui-même.",
    ],
  },
  "Connectively (formerly HARO) | https://www.connectively.us/": {
    description: "Demandes de journalistes envoyées plusieurs fois par jour. Une réponse citée peut vous valoir un lien depuis un grand média.",
    howTo: [
      "Abonnez-vous seulement aux thèmes qui vous concernent : mieux vaut peu de demandes pertinentes.",
      "Répondez vite après réception de l’e-mail : les premières réponses sont les plus lues.",
      "Restez court, avec une biographie d’une ligne et des références claires.",
    ],
  },
  "Qwoted | https://www.qwoted.com/": {
    description: "Alternative à HARO / Connectively. Plus petite, donc moins de concurrence.",
    howTo: [
      "Complétez entièrement votre profil d’expert (photo, biographie, sujets).",
      "Répondez vite et de façon citable : les journalistes reprennent souvent les réponses telles quelles.",
      "L’offre gratuite limite le nombre de réponses par mois ; passez à l’offre payante si vous décrochez régulièrement des citations.",
    ],
  },
  "SourceBottle | https://www.sourcebottle.com/": {
    description: "Plateforme de sources pour journalistes en Australie, au Royaume-Uni et aux États-Unis.",
    howTo: [
      "Sélectionnez une à trois catégories qui correspondent à votre expertise.",
      "Même discipline de réponse rapide que pour HARO.",
      "Joignez un lien et une photo à votre réponse pour avoir plus de chances d’être repris.",
    ],
  },
  "JournoRequests | https://twitter.com/journorequest": {
    description: "Hashtag Twitter #journorequest : des journalistes y cherchent des sources.",
    howTo: [
      "Enregistrez une recherche « #journorequest [votre niche] ».",
      "Répondez rapidement, ou en message privé s’ils le préfèrent.",
      "Envoyez vers une page pertinente de votre site, pas vers la page d’accueil.",
    ],
  },
  "Awesome Lists (GitHub) | https://github.com/sindresorhus/awesome": {
    description: "Listes thématiques sélectionnées sur GitHub. Être ajouté à une liste awesome-X pertinente vous donne un lien dofollow durable depuis GitHub.",
    howTo: [
      "Trouvez la liste awesome de votre niche (awesome-react, awesome-seo, etc.).",
      "Lisez attentivement CONTRIBUTING.md : chaque liste a ses règles.",
      "Ouvrez une pull request qui ajoute votre ressource au format exact demandé.",
      "Restez courtois dans les échanges et corrigez rapidement ce qui vous est signalé.",
    ],
  },
  "Product Hunt | https://www.producthunt.com/": {
    description: "Plateforme de lancement. Les liens de la page Product Hunt sont en nofollow, mais un lancement réussi peut attirer une couverture presse, elle en dofollow.",
    howTo: [
      "Prévoyez le lancement en milieu de semaine pour plus de visibilité.",
      "Préparez une accroche percutante et courte, une image principale et une démo en GIF.",
      "Prévenez votre réseau une semaine avant et demandez des votes dès la première heure.",
      "Répondez à chaque commentaire pendant les premières 24 heures.",
    ],
  },
  "BetaList | https://betalist.com/": {
    description: "Annonces de SaaS en prélancement ou en tout début d’activité.",
    howTo: [
      "Soumettez avant le lancement officiel : c’est la raison d’être de la plateforme.",
      "L’attente est longue en gratuit ; une option payante permet une publication immédiate.",
      "Choisissez vos tags avec soin : les tags larges comme « AI » ou « SaaS » vous noient dans la masse.",
    ],
  },
  "AlternativeTo | https://alternativeto.net/": {
    description: "Alternatives à des logiciels existants, proposées par les utilisateurs. Trafic à forte intention.",
    howTo: [
      "Trouvez la page de votre principal concurrent sur AlternativeTo.",
      "Proposez votre logiciel comme alternative, avec captures d’écran et description.",
      "L’examen éditorial prend en général une à deux semaines.",
    ],
  },
  "Capterra | https://www.capterra.com/": {
    description: "Site d’avis sur les logiciels. Des emplacements payants existent.",
    howTo: [
      "Créez un profil éditeur gratuit.",
      "Sollicitez des avis auprès de vos clients actuels (Capterra propose un outil pour cela).",
      "Les emplacements payants dans les listes « top-rated » fonctionnent comme de la publicité au clic, sans valeur de lien.",
    ],
  },
  "G2 | https://www.g2.com/": {
    description: "Avis sur les logiciels B2B. Fort signal de confiance.",
    howTo: [
      "Revendiquez votre profil et remplissez-le entièrement.",
      "Un nombre suffisant d’avis vérifiés débloque des badges gratuits et une meilleure mise en avant.",
      "Répondez aux avis de façon professionnelle : vos prospects les lisent.",
    ],
  },
  "TrustPilot | https://www.trustpilot.com/": {
    description: "Avis de consommateurs. Effet SEO indirect par la confiance dans la marque.",
    howTo: [
      "Revendiquez votre profil et validez votre domaine.",
      "Envoyez des invitations après achat à vos clients via l’API de Trustpilot.",
      "Intégrez le widget sur votre site pour afficher des étoiles.",
    ],
  },
  "Reddit | https://www.reddit.com/": {
    description: "Très grand forum. Liens en nofollow, mais souvent cité par les assistants d’IA. Effet SEO indirect par la marque et la visibilité dans l’IA.",
    howTo: [
      "Gagnez du karma pendant quelques semaines dans quelques subreddits de votre niche avant de publier un lien.",
      "La règle tacite : une autopromotion pour une dizaine de commentaires utiles.",
      "Quand vous publiez un lien, donnez le contexte : une URL seule est mal reçue.",
    ],
  },
  "Hacker News | https://news.ycombinator.com/": {
    description: "Communauté de fondateurs et de développeurs tech. Arriver en page d’accueil peut apporter beaucoup de visites et une reprise par la presse.",
    howTo: [
      "Publiez « Show HN: <produit> — <bénéfice en une ligne> ».",
      "Répondez à chaque commentaire dans les premières heures, même aux critiques.",
      "Restez authentique : la communauté repère tout de suite le discours marketing.",
    ],
  },
  "IndieHackers | https://www.indiehackers.com/": {
    description: "Communauté de fondateurs indépendants. Les publications peuvent contenir des liens dofollow vers votre site.",
    howTo: [
      "Créez le profil de votre produit et partagez des chiffres de revenus et de croissance réels.",
      "Les récits détaillés de votre parcours de création sont bien reçus.",
      "Répondez aux publications des autres avant de mettre en avant les vôtres.",
    ],
  },
  "Quora | https://www.quora.com/": {
    description: "Site de questions-réponses. Bon signal d’autorité thématique, et source citée par les assistants d’IA.",
    howTo: [
      "Repérez les questions très consultées de votre niche, notamment celles qui se classent dans Google.",
      "Rédigez des réponses sincères et étoffées, avec un lien contextuel au plus.",
      "Gagnez en crédibilité en répondant d’abord à plusieurs questions sans lien.",
    ],
  },
  "Stack Exchange Network | https://stackexchange.com/sites": {
    description: "Stack Overflow et plus de 170 sites de questions-réponses thématiques (Super User, Webmasters, Mathematics, etc.).",
    howTo: [
      "Choisissez le site qui correspond à votre expertise : Stack Overflow est très exigeant.",
      "Gagnez un peu de réputation avant de publier des liens : les liens venant de comptes neufs sont rejetés.",
      "Ne mettez un lien que s’il apporte quelque chose au-delà du texte de la réponse.",
    ],
  },
  "Google Business Profile | https://www.google.com/business/": {
    description: "Recommandé en priorité pour le SEO local. Influe sur le classement dans le Pack local de Google Maps et sur le SEO indirect.",
    howTo: [
      "Revendiquez et validez votre fiche (courrier, téléphone ou vidéo).",
      "Ajoutez catégories, photos, services et horaires.",
      "Publiez des actualités régulièrement.",
    ],
  },
  "Apple Business Connect | https://businessconnect.apple.com/": {
    description: "Fiche dans Plans et Siri d’Apple. Gratuite et souvent oubliée.",
    howTo: [
      "Connectez-vous avec votre identifiant Apple et revendiquez votre entreprise.",
      "Validez par téléphone ou en envoyant un justificatif.",
      "Ajoutez des vitrines, des photos et des liens, et mettez-les à jour régulièrement.",
    ],
  },
  "Bing Places | https://www.bingplaces.com/": {
    description: "Bing, Microsoft Maps et Cortana. L’import depuis Google Business Profile fait gagner du temps.",
    howTo: [
      "Connectez-vous et choisissez « Import from Google ».",
      "Validez par téléphone ou par courrier.",
      "Ajoutez des photos et catégories propres à Bing là où elles diffèrent de votre fiche Google.",
    ],
  },
  "Yelp | https://biz.yelp.com/": {
    description: "Annuaire local surtout présent aux États-Unis. Les avis renforcent la confiance ; ne cherchez pas à les manipuler.",
    howTo: [
      "Revendiquez votre profil et remplissez-le entièrement.",
      "Sollicitez les avis avec tact : Yelp filtre les sollicitations insistantes.",
      "Répondez à chaque avis, surtout aux avis négatifs.",
    ],
  },
  "Foursquare City Guide | https://foursquare.com/": {
    description: "Alimente les données cartographiques de nombreux services tiers. Vaut surtout comme citation NAP, plus que pour le trafic direct.",
    howTo: [
      "Revendiquez votre lieu via Foursquare for Business.",
      "Validez par e-mail ou par téléphone.",
      "Mettez à jour catégories et horaires.",
    ],
  },
  "MapQuest | https://www.mapquest.com/": {
    description: "Reprend automatiquement des flux de données tiers. Mérite d’être vérifié.",
    howTo: [
      "Recherchez votre entreprise ; si elle n’y est pas, ajoutez-la via « add a place ».",
      "Validez que vous en êtes le propriétaire.",
    ],
  },
  "Yellow Pages (US) | https://accounts.yellowpages.com/register": {
    description: "Annuaire historique toujours repris par les agrégateurs.",
    howTo: [
      "Créez un compte Yellow Pages gratuit.",
      "Revendiquez votre fiche ou créez-en une.",
      "Validez par téléphone.",
    ],
  },
  "Manta | https://www.manta.com/": {
    description: "Annuaire de petites entreprises, centré sur les États-Unis.",
    howTo: [
      "Recherchez votre entreprise, puis revendiquez-la ou ajoutez-la.",
      "Validez par e-mail.",
    ],
  },
  "Better Business Bureau | https://www.bbb.org/": {
    description: "Signal de confiance plus que backlink. L’accréditation est payante.",
    howTo: [
      "Demandez l’accréditation si vous remplissez leurs critères.",
      "Le profil est gratuit sans accréditation, mais limité.",
    ],
  },
  "Chamber of Commerce (your city) | https://www.uschamber.com/co": {
    description: "L’adhésion à la chambre de commerce locale comprend souvent une fiche d’annuaire en dofollow.",
    howTo: [
      "Recherchez « chambre de commerce [votre ville] ».",
      "Adhérez (adhésion en général payante).",
      "Demandez une fiche dans l’annuaire dans le cadre de l’adhésion.",
    ],
  },
  "Apple Podcasts | https://podcasters.apple.com/": {
    description: "Grand annuaire de podcasts. Soumission par flux RSS.",
    howTo: [
      "Préparez le flux RSS de votre podcast.",
      "Soumettez-le via Podcasters Connect.",
      "La validation prend en général quelques jours.",
    ],
  },
  "Spotify for Podcasters | https://podcasters.spotify.com/": {
    description: "Hébergement et diffusion gratuits. Les notes d’épisode peuvent contenir des liens.",
    howTo: [
      "Inscrivez-vous gratuitement.",
      "Ajoutez le nom de l’émission, le visuel, puis le flux RSS ou vos fichiers.",
      "Placez un ou deux liens dans les notes de chaque épisode.",
    ],
  },
  "Listen Notes | https://www.listennotes.com/": {
    description: "Moteur de recherche de podcasts. Indexé par Google.",
    howTo: [
      "Soumettez votre flux RSS.",
      "Les nouveaux épisodes sont synchronisés automatiquement.",
    ],
  },
  "PR.com | https://www.pr.com/": {
    description: "Diffusion gratuite de communiqués de presse. Liens surtout en nofollow.",
    howTo: [
      "Rédigez un communiqué qui contient une vraie information (lancement, levée de fonds, recrutement).",
      "Structurez avec des H1 / H2 ; un lien dans le corps, un dans la présentation de l’auteur.",
    ],
  },
  "EIN Presswire | https://www.einpresswire.com/": {
    description: "Diffusion payante de communiqués, plus largement reprise que les options gratuites.",
    howTo: [
      "Plusieurs formules payantes selon la diffusion.",
      "Reprise possible par des agrégateurs d’actualités et des sites partenaires.",
    ],
  },
  "OpenPR | https://www.openpr.com/": {
    description: "Communiqué de presse gratuit avec lien.",
    howTo: [
      "L’offre gratuite limite le nombre de liens ; un seul suffit.",
      "Un examen éditorial filtre le spam : rédigez un vrai communiqué.",
    ],
  },
  "About.me | https://about.me/": {
    description: "Page de présentation personnelle avec lien dofollow.",
    howTo: [
      "Réservez votre identifiant, remplissez la biographie et ajoutez une photo.",
      "Placez un lien direct vers votre site dans la zone de titre.",
    ],
  },
  "GitHub Profile | https://github.com/": {
    description: "README de profil et lien dans la biographie, tous deux en dofollow.",
    howTo: [
      "Créez un dépôt portant votre nom d’utilisateur : son README s’affiche sur votre profil.",
      "Ajoutez un lien dans le champ biographie du profil.",
      "Rendez vos dépôts publics et contribuez pour gagner en crédibilité.",
    ],
  },
  "Behance | https://www.behance.net/": {
    description: "Site de portfolios d’Adobe. Bien établi dans le design.",
    howTo: [
      "Créez votre profil avec un lien vers votre portfolio.",
      "Mettez en ligne plusieurs projets pour paraître crédible.",
    ],
  },
  "Dribbble | https://dribbble.com/": {
    description: "Communauté de designers. Publication sur invitation.",
    howTo: [
      "Demandez une invitation ou obtenez-en une d’un membre.",
      "Le lien du profil est en dofollow.",
    ],
  },
  "AngelList / Wellfound | https://wellfound.com/": {
    description: "Plateforme de startups et de recrutement. Profil d’entreprise et offres d’emploi.",
    howTo: [
      "Créez le profil de l’entreprise avec un lien vers votre site.",
      "Publier des offres d’emploi montre une activité.",
    ],
  },
  "Crunchbase | https://www.crunchbase.com/": {
    description: "Base de données d’entreprises. Levées de fonds et équipe.",
    howTo: [
      "Créez un profil via « add organization ».",
      "Revendiquez-le en validant une adresse e-mail de votre domaine.",
      "Tenez à jour levées de fonds et équipe.",
    ],
  },
  "Pinterest | https://www.pinterest.com/": {
    description: "Signets visuels. Apporte du trafic, et Google indexe les épingles.",
    howTo: [
      "Créez un compte professionnel et validez votre domaine.",
      "Créez plusieurs tableaux sur votre niche.",
      "Épinglez régulièrement des images originales de votre site.",
    ],
  },
  "Flipboard | https://flipboard.com/": {
    description: "Curation de contenus façon magazine.",
    howTo: [
      "Créez un magazine sur votre niche.",
      "Partagez vos articles en les mêlant à une majorité d’articles d’autres sources.",
    ],
  },
  "Slashdot | https://slashdot.org/": {
    description: "Agrégateur d’actualités tech historique. Difficile d’y figurer.",
    howTo: [
      "Proposez un sujet via le « firehose ».",
      "La plupart des propositions n’arrivent jamais en page d’accueil.",
    ],
  },
  "Scholarship Program (your industry) | https://www.scholarships.com/": {
    description: "Créez une bourse d’études et proposez-la aux pages de bourses des universités. Peut vous valoir des liens dofollow en .edu.",
    howTo: [
      "Créez sur votre site une page de bourse avec les conditions d’éligibilité et la marche à suivre.",
      "Écrivez aux services d’aide financière des universités avec les détails de la bourse et le lien.",
      "Versez réellement la bourse : une fausse bourse finit par se voir.",
    ],
  },
  "Wikipedia | https://en.wikipedia.org/": {
    description: "Liens en nofollow, mais une source majeure pour la marque et les citations dans les réponses d’IA. Difficile d’y figurer.",
    howTo: [
      "Ne cherchez pas à créer votre propre page : elle sera supprimée.",
      "Cherchez des articles existants de votre domaine où il manque une source, et ajoutez la vôtre.",
      "Constituez d’abord un historique de modifications : les modifications de comptes neufs sont souvent annulées.",
    ],
  },
  "Wikidata | https://www.wikidata.org/": {
    description: "Données structurées qui alimentent Wikipédia et le Knowledge Panel de Google.",
    howTo: [
      "Créez un élément pour votre entité (entreprise, personne, produit).",
      "Ajoutez la propriété « official website » qui pointe vers votre URL.",
      "Citez des sources fiables dans les références.",
    ],
  },
  "SaaSHub | https://www.saashub.com/": {
    description: "Site de comparaison de SaaS. Inscription facile.",
    howTo: [
      "Soumettez via « add a service ».",
      "L’examen éditorial prend en général une à deux semaines.",
    ],
  },
  "GetApp | https://www.getapp.com/": {
    description: "Appartient à Gartner (comme Capterra et Software Advice).",
    howTo: [
      "Profil éditeur gratuit.",
      "Les avis et un profil complet améliorent votre position dans GetApp.",
    ],
  },
  "Software Advice | https://www.softwareadvice.com/": {
    description: "Site d’avis sur les logiciels B2B de Gartner.",
    howTo: [
      "Même programme éditeur que Capterra et GetApp.",
      "Une seule revendication couvre les trois sites.",
    ],
  },
  "Slant | https://www.slant.co/": {
    description: "Listes « meilleurs outils pour X » classées par la communauté.",
    howTo: [
      "Trouvez les sujets qui correspondent à votre outil.",
      "Ajoutez votre outil comme option, avec ses points forts et ses limites.",
      "Invitez vos utilisateurs à voter (sans faux comptes).",
    ],
  },
  "StackShare | https://stackshare.io/": {
    description: "Les entreprises y présentent leur pile technique.",
    howTo: [
      "Ajoutez votre outil ou service.",
      "Invitez vos clients à vous ajouter à leur pile publique.",
    ],
  },
  "Indie Hackers Products | https://www.indiehackers.com/products": {
    description: "Fiches de produits indépendants avec transparence sur les revenus.",
    howTo: [
      "Ajoutez votre produit et partagez des chiffres de revenus réels.",
      "Participez aux forums pour attirer des visites sur votre profil.",
    ],
  },
  "Tools.fyi | https://tools.fyi/": {
    description: "Annuaire de SaaS récent. Facile d’y figurer.",
    howTo: [
      "Soumettez les informations de votre outil.",
      "L’examen éditorial prend en général quelques jours.",
    ],
  },
  "Saaspedia | https://saaspedia.org/": {
    description: "Petit annuaire de SaaS.",
    howTo: [
      "Ajoutez votre produit.",
    ],
  },
  "FuturePedia | https://www.futurepedia.io/": {
    description: "Annuaire d’outils d’IA. Trafic à forte intention.",
    howTo: [
      "La file de soumission gratuite est lente.",
      "Une option payante accélère l’examen.",
    ],
  },
  "There's An AI For That (TAAFT) | https://theresanaiforthat.com/": {
    description: "Grand annuaire d’outils d’IA.",
    howTo: [
      "Soumettez via « add tool ».",
      "Des options payantes accélèrent l’examen.",
    ],
  },
  "AI Tools Directory | https://aitoolsdirectory.com/": {
    description: "Annuaire d’outils d’IA de taille moyenne.",
    howTo: [
      "Soumettez votre outil avec logo, description et lien.",
    ],
  },
  "Etsy | https://www.etsy.com/": {
    description: "Place de marché d’objets faits main. Lien depuis le profil de la boutique vers votre site.",
    howTo: [
      "Ouvrez votre boutique et indiquez votre domaine dans la section « about ».",
      "Orientez les clients vers votre propre site depuis votre profil.",
    ],
  },
  "Houzz | https://www.houzz.com/": {
    description: "Plateforme de décoration, d’aménagement et de services pour la maison.",
    howTo: [
      "Créez un compte professionnel si votre activité concerne la maison.",
      "Le profil porte un lien et les photos apportent du trafic.",
    ],
  },
  "Trustpilot | https://www.trustpilot.com/": {
    description: "Les avis permettent d’afficher des étoiles dans les résultats et renforcent la confiance.",
    howTo: [
      "Revendiquez votre profil d’entreprise.",
      "Intégrez le widget sur votre site pour viser l’affichage d’étoiles dans les résultats de recherche.",
    ],
  },
  "YouTube | https://www.youtube.com/": {
    description: "La description de la chaîne et celles des vidéos acceptent des liens. Effet SEO indirect par la marque et les citations dans les réponses d’IA.",
    howTo: [
      "Ajoutez votre URL dans la description de la chaîne (visible sans clic).",
      "Chaque description de vidéo peut contenir des liens : placez-les en haut, c’est la partie la plus vue.",
      "Optimisez les titres pour la recherche YouTube, un moteur de recherche à part entière.",
    ],
  },
  "Vimeo | https://vimeo.com/": {
    description: "Alternative vidéo de meilleure qualité.",
    howTo: [
      "Créez votre chaîne avec un lien dans le profil.",
      "Les descriptions de vidéos acceptent des liens.",
    ],
  },
  "TikTok Bio | https://www.tiktok.com/": {
    description: "Le lien dans la biographie se débloque à partir d’un certain nombre d’abonnés.",
    howTo: [
      "Atteignez d’abord le seuil d’abonnés demandé.",
      "Ajoutez ensuite un lien direct dans votre biographie.",
    ],
  },
  "Instagram | https://www.instagram.com/": {
    description: "Lien dans la biographie disponible dès la création du compte.",
    howTo: [
      "Un seul lien en biographie : utilisez un service de liens multiples (Linktree, etc.).",
      "Les stories avec sticker de lien apportent du trafic direct.",
    ],
  },
  "npm | https://www.npmjs.com/": {
    description: "Le champ « homepage » d’un paquet est en dofollow. Utile pour les éditeurs d’outils et de bibliothèques.",
    howTo: [
      "Publiez un paquet npm, même un simple wrapper ou une CLI pour votre service.",
      "Renseignez « homepage » dans package.json avec l’adresse de votre site.",
    ],
  },
  "PyPI | https://pypi.org/": {
    description: "Index des paquets Python. Lien « Homepage » en dofollow.",
    howTo: [
      "Publiez votre paquet et renseignez project_urls = {'Homepage': 'https://...'}.",
    ],
  },
  "Docker Hub | https://hub.docker.com/": {
    description: "Registre d’images de conteneurs. La description du dépôt peut contenir des liens.",
    howTo: [
      "Publiez l’image, puis ajoutez un README détaillé depuis l’interface web.",
      "Ajoutez des liens vers la documentation ou votre site.",
    ],
  },
  "VSCode Marketplace | https://marketplace.visualstudio.com/": {
    description: "Publiez une extension VS Code avec un lien vers votre site.",
    howTo: [
      "Créez l’extension (.vsix).",
      "Créez un compte d’éditeur et un README avec un lien vers votre site.",
    ],
  },
  "WordPress Plugin Directory | https://wordpress.org/plugins/": {
    description: "Une extension gratuite vous donne un lien dofollow depuis wordpress.org.",
    howTo: [
      "Créez une extension WordPress gratuite qui résout un problème précis.",
      "Soumettez-la sur wordpress.org avec un nom valide, testée sur la version actuelle de WordPress.",
      "La validation peut prendre plusieurs semaines.",
    ],
  },
  "Chrome Web Store | https://chrome.google.com/webstore/": {
    description: "Publiez une extension Chrome : sa fiche renvoie vers votre site.",
    howTo: [
      "Des frais d’inscription développeur uniques sont demandés.",
      "Créez une extension utile et respectez les règles d’examen.",
      "La validation prend en général quelques jours.",
    ],
  },
  "Wix | https://www.wix.com/": {
    description: "Site gratuit sur sous-domaine (votrenom.wixsite.com). Liens sortants en dofollow.",
    howTo: [
      "Créez un site gratuit sur votrenom.wixsite.com.",
      "Rédigez quelques pages de contenu original sur votre niche.",
      "Placez des liens contextuels vers votre site principal dans les articles.",
    ],
  },
  "WordPress.com | https://wordpress.com/": {
    description: "Blog gratuit à l’adresse votrenom.wordpress.com.",
    howTo: [
      "Publiez quelques articles sur votre thématique.",
      "Placez un lien vers votre site principal dans le corps du texte.",
    ],
  },
  "Blogger | https://www.blogger.com/": {
    description: "Plateforme de blog gratuite de Google, sur un sous-domaine blogspot.com.",
    howTo: [
      "Créez le blog depuis un compte Google.",
      "Même stratégie de contenu : de vrais articles et des liens placés en contexte.",
    ],
  },
  "Tumblr | https://www.tumblr.com/": {
    description: "Plateforme de microblog. Liens en nofollow, mais utiles pour la présence de la marque.",
    howTo: [
      "Créez un profil, avec un lien dans la bio et dans vos publications.",
    ],
  },
  "Notion (public pages) | https://www.notion.so/": {
    description: "Publiez des pages Notion en accès public : elles peuvent être indexées et portent des liens.",
    howTo: [
      "Créez une page Notion sur un sujet de votre thématique.",
      "Partagez-la publiquement (option « Share to web »).",
      "Soumettez l’URL dans Google Search Console pour demander son indexation.",
    ],
  },
  "Webflow CMS (free) | https://webflow.com/": {
    description: "Sous-domaine webflow.io gratuit. Plus de liberté de mise en page que Wix.",
    howTo: [
      "Créez le site sur un sous-domaine webflow.io.",
      "Les liens sortants sont en dofollow.",
    ],
  },
  "ProductHunt Maker Stories | https://www.producthunt.com/stories": {
    description: "Récits de créateurs mis en avant, choisis par la rédaction.",
    howTo: [
      "Commencez par vous faire connaître dans la communauté Product Hunt.",
      "Proposez un angle de récit (leçon apprise, étape franchie, construction en public).",
    ],
  },
  "Designer News | https://www.designernews.co/": {
    description: "Agrégateur d’actualités de la communauté design.",
    howTo: [
      "Soumettez des contenus de design intéressants.",
      "Arriver en page d’accueil est difficile.",
    ],
  },
  "Lobsters | https://lobste.rs/": {
    description: "Communauté tech ; la soumission se fait sur invitation.",
    howTo: [
      "Il faut l’invitation d’un membre existant.",
    ],
  },
  "DEV Community Tags | https://dev.to/tags": {
    description: "Les articles publiés sous des tags précis gagnent en autorité thématique.",
    howTo: [
      "Choisissez 4 ou 5 tags précis plutôt que génériques.",
      "Privilégiez la qualité à la quantité.",
    ],
  },
  "Forrester (mention) | https://www.forrester.com/": {
    description: "Être cité par un analyste dans un rapport renforce la confiance. Rarement gratuit.",
    howTo: [
      "Demandez un briefing via le programme analystes de Forrester.",
      "Il faut un vrai élément différenciant et des clients payants pour être pris en compte.",
    ],
  },
  "TripAdvisor | https://www.tripadvisor.com/": {
    description: "Annuaire de voyage et de restaurants.",
    howTo: [
      "Revendiquez la fiche en tant que propriétaire de l’établissement.",
      "Répondez aux avis.",
    ],
  },
  "Healthgrades | https://www.healthgrades.com/": {
    description: "Annuaire de médecins et de cabinets.",
    howTo: [
      "Revendiquez la fiche.",
      "Faites vérifier vos qualifications.",
      "Remplissez le profil en entier.",
    ],
  },
  "Avvo | https://www.avvo.com/": {
    description: "Annuaire d’avocats avec questions-réponses.",
    howTo: [
      "Revendiquez le profil et remplissez-le en entier.",
      "Répondez à des questions pour gagner en visibilité.",
    ],
  },
  "Houzz Pro | https://www.houzz.com/pro": {
    description: "Fiches de professionnels de la maison.",
    howTo: [
      "Revendiquez ou créez votre profil.",
      "Ajoutez des photos de vos réalisations.",
    ],
  },
  "Thumbtack | https://www.thumbtack.com/": {
    description: "Place de marché de services locaux.",
    howTo: [
      "Inscrivez-vous en tant que professionnel.",
      "Faites vérifier votre entreprise.",
      "Travaillez les mots-clés de votre fiche dans Thumbtack.",
    ],
  },
  "Angi (formerly Angie's List) | https://www.angi.com/": {
    description: "Avis et annuaire de services pour la maison.",
    howTo: [
      "Un profil gratuit est disponible.",
      "Les demandes de clients payantes sont facultatives.",
    ],
  },
  "Justdial | https://www.justdial.com/": {
    description: "Grand annuaire local indien, avec génération de demandes de clients.",
    howTo: [
      "Inscrivez-vous via « List your business ».",
      "Validez par téléphone (code à usage unique).",
      "La fiche gratuite est limitée ; les offres payantes donnent accès aux demandes et à un meilleur classement.",
    ],
  },
  "Sulekha | https://www.sulekha.com/": {
    description: "Services locaux et petites annonces en Inde. Large couverture des catégories.",
    howTo: [
      "Choisissez la catégorie d’activité : Sulekha oriente beaucoup selon la catégorie.",
      "Validez votre téléphone et remplissez un profil détaillé.",
    ],
  },
  "IndiaMart | https://seller.indiamart.com/": {
    description: "Grande place de marché B2B indienne.",
    howTo: [
      "Créez un compte vendeur gratuit.",
      "Ajoutez les informations de l’entreprise et votre catalogue de produits.",
      "L’offre payante « TrustSEAL » aide à obtenir des demandes d’acheteurs.",
    ],
  },
  "TradeIndia | https://www.tradeindia.com/": {
    description: "Place de marché B2B et export en Inde.",
    howTo: [
      "Compte vendeur gratuit.",
      "Faites vérifier l’entreprise et ajoutez votre catalogue.",
    ],
  },
  "Cylex India | https://www.cylex.in/": {
    description: "Annuaire local Cylex pour l’Inde.",
    howTo: [
      "Fiche gratuite, centrée sur le NAP (nom, adresse, téléphone).",
    ],
  },
  "AskLaila | https://www.asklaila.com/": {
    description: "Moteur de recherche local indien, organisé par ville.",
    howTo: [
      "Ajoutez l’entreprise via « Add free listing ».",
    ],
  },
  "TradesFolks | https://www.tradesfolks.com/": {
    description: "Annuaire indien d’artisans et de services.",
    howTo: [
      "Fiche gratuite avec NAP.",
    ],
  },
  "GrotalSearch | https://www.grotal.com/": {
    description: "Recherche d’entreprises locales en Inde.",
    howTo: [
      "Ajoutez une fiche gratuite et validez-la par téléphone.",
    ],
  },
  "Yalwa India | https://www.yalwa.in/": {
    description: "Annuaire d’entreprises Yalwa pour l’Inde.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Indiacatalog | https://www.indiacatalog.com/": {
    description: "Catalogue d’entreprises indiennes.",
    howTo: [
      "Soumettez l’entreprise avec ses informations détaillées.",
    ],
  },
  "Yell.com | https://www.yell.com/": {
    description: "Successeur des Pages Jaunes britanniques.",
    howTo: [
      "Fiche de base gratuite via « Get listed ».",
      "Validez par téléphone.",
      "Des offres payantes donnent plus de visibilité.",
    ],
  },
  "Cylex UK | https://www.cylex-uk.co.uk/": {
    description: "Annuaire Cylex au Royaume-Uni.",
    howTo: [
      "Ajoutez une fiche gratuite avec NAP.",
    ],
  },
  "FreeIndex | https://www.freeindex.co.uk/": {
    description: "Annuaire britannique gratuit, avec avis.",
    howTo: [
      "Fiche gratuite.",
      "Sollicitez des avis pour mieux apparaître dans FreeIndex.",
    ],
  },
  "Thomson Local | https://www.thomsonlocal.com/": {
    description: "Annuaire britannique historique.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Scoot UK | https://www.scoot.co.uk/": {
    description: "Recherche locale au Royaume-Uni.",
    howTo: [
      "Ajoutez une fiche gratuite.",
    ],
  },
  "Touch Local | https://www.touchlocal.com/": {
    description: "Annuaire britannique.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Bizwiki UK | https://www.bizwiki.co.uk/": {
    description: "Annuaire Bizwiki au Royaume-Uni.",
    howTo: [
      "Fiche gratuite avec NAP.",
    ],
  },
  "Yellow Pages Canada | https://www.yellowpages.ca/": {
    description: "Pages Jaunes canadiennes.",
    howTo: [
      "Fiche gratuite.",
      "Validez par téléphone.",
    ],
  },
  "Canada411 | https://www.canada411.ca/": {
    description: "Annuaire téléphonique et d’entreprises canadien.",
    howTo: [
      "Soumettez une fiche gratuite.",
    ],
  },
  "Cylex Canada | https://www.cylex-canada.ca/": {
    description: "Annuaire Cylex au Canada.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Goldbook | https://www.goldbook.ca/": {
    description: "Annuaire local canadien.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Profile Canada | https://www.profilecanada.com/": {
    description: "Profils d’entreprises canadiennes.",
    howTo: [
      "Soumettez le profil de l’entreprise.",
    ],
  },
  "True Local | https://www.truelocal.com.au/": {
    description: "Annuaire local australien.",
    howTo: [
      "Fiche gratuite.",
      "Validez par téléphone.",
    ],
  },
  "Yellow Pages AU | https://www.yellowpages.com.au/": {
    description: "Pages Jaunes australiennes.",
    howTo: [
      "Fiche de base gratuite.",
      "Vérification par Sensis nécessaire.",
    ],
  },
  "Australian Business Directory | https://www.dlook.com.au/": {
    description: "Annuaire local australien.",
    howTo: [
      "Soumettez une fiche.",
    ],
  },
  "Hotfrog Australia | https://www.hotfrog.com.au/": {
    description: "Édition australienne de Hotfrog.",
    howTo: [
      "Même démarche que sur Hotfrog international.",
    ],
  },
  "StartLocal Australia | https://www.startlocal.com.au/": {
    description: "Recherche locale en Australie.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Gelbe Seiten | https://www.gelbeseiten.de/": {
    description: "Pages Jaunes allemandes.",
    howTo: [
      "Fiche de base gratuite.",
      "Validez par téléphone.",
    ],
  },
  "Das Örtliche | https://www.dasoertliche.de/": {
    description: "Annuaire local allemand.",
    howTo: [
      "Fiche gratuite.",
      "Validez par téléphone.",
    ],
  },
  "11880.com | https://www.11880.com/": {
    description: "Annuaire allemand doublé d’un service téléphonique.",
    howTo: [
      "Profil gratuit.",
    ],
  },
  "Cylex Deutschland | https://www.cylex.de/": {
    description: "Cylex en Allemagne.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Branchenbuch.de | https://www.branchenbuch.com/": {
    description: "Annuaire d’entreprises allemand.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "PagesJaunes | https://www.pagesjaunes.fr/": {
    description: "Les Pages Jaunes françaises.",
    howTo: [
      "Fiche de base gratuite.",
      "Validez par téléphone ou par courrier.",
    ],
  },
  "118 712 | https://www.118712.fr/": {
    description: "Annuaire français doublé d’un service téléphonique.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Le Bottin | https://www.lebottin.fr/": {
    description: "Annuaire local français.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Páginas Amarillas | https://www.paginasamarillas.es/": {
    description: "Pages Jaunes espagnoles.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "QDQ.com | https://www.qdq.com/": {
    description: "Annuaire local et publicitaire espagnol.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Pagine Gialle | https://www.paginegialle.it/": {
    description: "Pages Jaunes italiennes.",
    howTo: [
      "Fiche de base gratuite.",
      "Validez par téléphone.",
    ],
  },
  "ItaliaInformazioni | https://www.italiainformazioni.it/": {
    description: "Annuaire local italien.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Telefoonboek.nl | https://www.telefoonboek.nl/": {
    description: "Annuaire téléphonique et d’entreprises néerlandais.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Gouden Gids | https://www.goudengids.nl/": {
    description: "Pages Jaunes néerlandaises.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Gule Sider | https://www.gulesider.no/": {
    description: "Pages Jaunes norvégiennes.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Eniro | https://www.eniro.se/": {
    description: "Annuaire pour la Suède, la Norvège et le Danemark.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Fonecta Finder | https://www.finder.fi/": {
    description: "Annuaire finlandais.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Telelistas.net | https://www.telelistas.net/": {
    description: "Annuaire local brésilien.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Páginas Amarillas Argentina | https://www.paginasamarillas.com.ar/": {
    description: "Pages Jaunes argentines.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Sección Amarilla México | https://www.seccionamarilla.com.mx/": {
    description: "Pages Jaunes mexicaines.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "iTownPage (NTT) | https://itp.ne.jp/": {
    description: "Annuaire japonais de NTT.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Mapion | https://www.mapion.co.jp/": {
    description: "Cartographie et annuaire local japonais.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Naver Place | https://place.map.naver.com/": {
    description: "Le principal annuaire local en Corée du Sud (Naver). Recommandé pour viser la Corée.",
    howTo: [
      "Inscrivez-vous à Naver Smart Place.",
      "Faites vérifier l’entreprise en envoyant un justificatif.",
      "Le profil doit être rédigé en coréen.",
    ],
  },
  "Daum / Kakao Map | https://map.kakao.com/": {
    description: "Plateforme de cartes et de recherche locale en Corée du Sud, derrière Naver.",
    howTo: [
      "Ajoutez l’entreprise via Kakao for Business.",
    ],
  },
  "Baidu Maps | https://map.baidu.com/": {
    description: "Le principal service de cartes en Chine. Utile pour être visible en Chine continentale.",
    howTo: [
      "Il faut une licence commerciale chinoise pour revendiquer la fiche.",
      "Vérification par téléphone et par documents.",
    ],
  },
  "Dianping (大众点评) | https://www.dianping.com/": {
    description: "L’équivalent chinois de Yelp, très utilisé pour les restaurants et les services.",
    howTo: [
      "Il faut une pièce d’identité chinoise et une licence commerciale.",
      "Dans certaines villes, la vérification se fait en personne.",
    ],
  },
  "Hong Kong Yellow Pages | https://www.yp.com.hk/": {
    description: "Pages Jaunes de Hong Kong.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Yellow Pages Singapore | https://www.yellowpages.com.sg/": {
    description: "Pages Jaunes de Singapour.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Yellow Pages Malaysia | https://www.yellowpages.my/": {
    description: "Pages Jaunes de Malaisie.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Yellow Pages Philippines | https://www.yellow-pages.ph/": {
    description: "Pages Jaunes des Philippines.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "ThailandYP | https://www.thailandyp.com/": {
    description: "Pages Jaunes de Thaïlande.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "VietnamYellowPages | https://www.vietnamyellowpages.com/": {
    description: "Pages Jaunes du Vietnam.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Yellow Pages Indonesia | https://www.yellowpages.co.id/": {
    description: "Pages Jaunes d’Indonésie.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Yellow Pages UAE | https://www.yellowpages.ae/": {
    description: "Pages Jaunes des Émirats arabes unis.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Yellow Pages Saudi Arabia | https://www.yellowpages.com.sa/": {
    description: "Pages Jaunes d’Arabie saoudite.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "D&B Israel | https://www.dbi.co.il/": {
    description: "Annuaire d’entreprises israélien.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Yellow Pages Turkey | https://www.altinrehber.com.tr/": {
    description: "Pages jaunes turques.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Brabys (South Africa) | https://www.brabys.com/": {
    description: "Annuaire local sud-africain.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Yellow Pages Nigeria | https://www.vconnect.com/": {
    description: "Annuaire local nigérian (VConnect).",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Golden Pages Ireland | https://www.goldenpages.ie/": {
    description: "Pages jaunes irlandaises.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Finda New Zealand | https://www.finda.co.nz/": {
    description: "Annuaire local néo-zélandais.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Yellow NZ | https://yellow.co.nz/": {
    description: "Pages jaunes néo-zélandaises.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Europages | https://www.europages.com/": {
    description: "Annuaire paneuropéen, B2B et local.",
    howTo: [
      "Fiche de base gratuite.",
      "Profil en plusieurs langues.",
    ],
  },
  "Citysearch | https://www.citysearch.com/": {
    description: "Agrégateur d’annuaires américain organisé par ville.",
    howTo: [
      "Ajoutez votre entreprise via « Add a business ».",
      "Confirmez que vous en êtes le propriétaire.",
    ],
  },
  "Superpages | https://www.superpages.com/": {
    description: "Annuaire local américain ancien.",
    howTo: [
      "Fiche gratuite, vérification par téléphone.",
    ],
  },
  "Local.com | https://www.local.com/": {
    description: "Moteur de recherche local américain.",
    howTo: [
      "Fiche entreprise gratuite.",
    ],
  },
  "MerchantCircle | https://www.merchantcircle.com/": {
    description: "Réseau de petites entreprises américaines.",
    howTo: [
      "Profil gratuit ; participez aux discussions locales.",
    ],
  },
  "Insider Pages | https://www.insiderpages.com/": {
    description: "Avis locaux et annuaire d’entreprises.",
    howTo: [
      "Déposez une fiche gratuite.",
    ],
  },
  "Whitepages | https://www.whitepages.com/": {
    description: "Recherche américaine de numéros, de personnes et d’entreprises.",
    howTo: [
      "Déposez une fiche entreprise.",
    ],
  },
  "Citylocal Pro | https://www.citylocalpro.com/": {
    description: "Annuaire américain gratuit de services locaux.",
    howTo: [
      "Fiche gratuite avec NAP (nom, adresse, téléphone).",
    ],
  },
  "USCity.net | https://www.uscity.net/": {
    description: "Annuaire d’entreprises américain, ville par ville.",
    howTo: [
      "Déposez une fiche gratuite.",
    ],
  },
  "Ezlocal | https://www.ezlocal.com/": {
    description: "Annuaire d’entreprises locales américain.",
    howTo: [
      "Fiche de base gratuite, options payantes.",
    ],
  },
  "iBegin | https://www.ibegin.com/": {
    description: "Annuaire d’entreprises américain.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Tupalo | https://tupalo.com/": {
    description: "Annuaire local communautaire.",
    howTo: [
      "Fiche gratuite avec photos et avis.",
    ],
  },
  "ShowMeLocal | https://www.showmelocal.com/": {
    description: "Annuaire d’entreprises locales américain.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "EZBlogger | https://www.ezblogger.com/": {
    description: "Annuaire gratuit et léger.",
    howTo: [
      "Déposez une fiche gratuite.",
    ],
  },
  "TrustRadius | https://www.trustradius.com/": {
    description: "Plateforme d’avis sur les logiciels B2B.",
    howTo: [
      "Revendiquez votre profil éditeur (gratuit).",
      "Sollicitez des avis d’acheteurs vérifiés.",
      "Les produits les mieux notés y gagnent en visibilité.",
    ],
  },
  "FinancesOnline | https://reviews.financesonline.com/": {
    description: "Site d’avis et de comparaison de SaaS.",
    howTo: [
      "Proposez votre produit, complétez le profil, demandez des avis.",
    ],
  },
  "SaaSworthy | https://www.saasworthy.com/": {
    description: "Plateforme de découverte et de comparaison de SaaS.",
    howTo: [
      "Proposez votre outil, revendiquez le profil.",
    ],
  },
  "CrowdReviews | https://www.crowdreviews.com/": {
    description: "Avis B2B participatifs.",
    howTo: [
      "Profil éditeur gratuit et sollicitation d’avis.",
    ],
  },
  "Goodfirms | https://www.goodfirms.co/": {
    description: "Fiches de services et de logiciels B2B.",
    howTo: [
      "Profil d’entreprise et portfolio gratuits.",
    ],
  },
  "Clutch | https://clutch.co/": {
    description: "Plateforme d’avis sur les agences et services B2B. Les avis issus d’entretiens vérifiés ont du poids.",
    howTo: [
      "Revendiquez votre profil (gratuit).",
      "Proposez des clients pour des entretiens vérifiés (payant).",
      "Les classements « Top » peuvent apporter des demandes entrantes.",
    ],
  },
  "DesignRush | https://www.designrush.com/": {
    description: "Annuaire et fiches d’agences.",
    howTo: [
      "Profil d’agence gratuit.",
    ],
  },
  "Sortlist | https://www.sortlist.com/": {
    description: "Place de marché de mise en relation avec des agences.",
    howTo: [
      "Profil d’agence et portfolio gratuits.",
    ],
  },
  "Toolify.ai | https://www.toolify.ai/": {
    description: "Annuaire d’outils d’IA.",
    howTo: [
      "Proposez votre outil. Options payantes pour la mise en avant.",
    ],
  },
  "AI Tools Arena | https://aitoolsarena.com/": {
    description: "Liste d’outils d’IA.",
    howTo: [
      "Inscription gratuite.",
    ],
  },
  "Easy With AI | https://easywithai.com/": {
    description: "Annuaire et avis d’outils d’IA.",
    howTo: [
      "Proposez votre outil ; mise en avant payante facultative.",
    ],
  },
  "AI Top Tools | https://aitoptools.com/": {
    description: "Catalogue d’outils d’IA.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "AIxploria | https://www.aixploria.com/": {
    description: "Outils d’IA, actualités et avis (FR et EN).",
    howTo: [
      "Proposez votre outil avec une description.",
    ],
  },
  "Insidr.ai | https://www.insidr.ai/": {
    description: "Annuaire d’outils d’IA.",
    howTo: [
      "Inscription gratuite.",
    ],
  },
  "AI Scout | https://aiscout.net/": {
    description: "Liste d’outils d’IA.",
    howTo: [
      "Inscription gratuite.",
    ],
  },
  "Aiwizard | https://aiwizard.ai/": {
    description: "Annuaire d’outils d’IA.",
    howTo: [
      "Inscription gratuite.",
    ],
  },
  "Tap4.ai | https://tap4.ai/": {
    description: "Catalogue d’outils d’IA.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Promptbase | https://promptbase.com/": {
    description: "Place de marché de prompts. Les profils vendeurs comportent des liens.",
    howTo: [
      "Créez un compte vendeur.",
      "Mettez vos prompts en vente.",
    ],
  },
  "BetaPage | https://betapage.co/": {
    description: "Plateforme de lancement de startups.",
    howTo: [
      "Proposez votre startup pour une fiche gratuite.",
    ],
  },
  "Launching Next | https://www.launchingnext.com/": {
    description: "Annuaire de startups.",
    howTo: [
      "Inscription gratuite, avec un délai d’attente en général d’une à deux semaines.",
    ],
  },
  "Startup Stash | https://startupstash.com/": {
    description: "Sélection d’outils et de ressources pour startups.",
    howTo: [
      "File d’attente gratuite ; option payante pour aller plus vite.",
    ],
  },
  "Startuplister | https://startuplister.com/": {
    description: "Service payant qui inscrit votre startup dans de nombreux annuaires.",
    howTo: [
      "Après paiement, remplissez le questionnaire : le service se charge des inscriptions.",
    ],
  },
  "Killer Startups | https://www.killerstartups.com/": {
    description: "Site d’avis sur les startups.",
    howTo: [
      "Inscription payante pour obtenir un avis.",
    ],
  },
  "F6S | https://www.f6s.com/": {
    description: "Communauté de fondateurs, offres pour startups et accélérateurs.",
    howTo: [
      "Profil gratuit.",
      "Candidatez à des programmes d’accélération pour obtenir des backlinks.",
    ],
  },
  "AppSumo | https://appsumo.com/": {
    description: "Place de marché d’offres logicielles. Une fiche apporte de la visibilité et un lien vers la marque depuis la page de l’offre.",
    howTo: [
      "Candidatez pour que votre produit soit proposé sur AppSumo.",
      "L’acceptation suppose un produit abouti et des premiers revenus.",
    ],
  },
  "Stitcher | https://www.stitcher.com/": {
    description: "Grand annuaire de podcasts.",
    howTo: [
      "Soumettez votre flux RSS via le Stitcher Partner Portal.",
    ],
  },
  "Castbox | https://castbox.fm/": {
    description: "Application de podcasts multiplateforme.",
    howTo: [
      "Soumettez votre flux RSS.",
    ],
  },
  "Overcast | https://overcast.fm/": {
    description: "Lecteur de podcasts iOS. Indexe automatiquement Apple Podcasts.",
    howTo: [
      "Si vous êtes sur Apple Podcasts, vous y êtes référencé automatiquement.",
    ],
  },
  "Podbean | https://www.podbean.com/": {
    description: "Hébergement de podcasts et diffusion gratuite.",
    howTo: [
      "Offre d’hébergement gratuite.",
    ],
  },
  "Podcast Index | https://podcastindex.org/": {
    description: "Index de podcasts open source, qui alimente de nombreuses applications.",
    howTo: [
      "Soumettez votre flux RSS.",
    ],
  },
  "Player FM | https://player.fm/": {
    description: "Catalogue et lecteur de podcasts.",
    howTo: [
      "Soumettez votre flux.",
    ],
  },
  "iHeartRadio | https://www.iheart.com/podcast/": {
    description: "Grande plateforme de podcasts américaine.",
    howTo: [
      "Passez par le formulaire de soumission d’iHeart.",
    ],
  },
  "TuneIn | https://tunein.com/podcasts/": {
    description: "Plateforme audio avec annuaire de podcasts.",
    howTo: [
      "Soumettez votre flux RSS.",
    ],
  },
  "Amazon Music Podcasts | https://podcasters.amazon.com/": {
    description: "Podcasts Amazon Music et Audible.",
    howTo: [
      "Passez par le portail Podcasters.",
    ],
  },
  "Goodpods | https://goodpods.com/": {
    description: "Application de découverte de podcasts.",
    howTo: [
      "Indexation automatique à partir des flux Apple.",
    ],
  },
  "Pocket Casts | https://www.pocketcasts.com/": {
    description: "Application de podcasts multiplateforme.",
    howTo: [
      "Soumettez votre flux.",
    ],
  },
  "PRWeb | https://www.prweb.com/": {
    description: "Grand diffuseur américain de communiqués de presse.",
    howTo: [
      "Payant, par communiqué.",
      "Large réseau de reprise.",
    ],
  },
  "PRLog | https://www.prlog.org/": {
    description: "Diffusion gratuite de communiqués de presse.",
    howTo: [
      "Envoi gratuit. Options payantes facultatives.",
    ],
  },
  "24/7 Press Release | https://www.24-7pressrelease.com/": {
    description: "Diffusion de communiqués, avec une offre gratuite.",
    howTo: [
      "Communiqué gratuit avec lien nofollow ; offres payantes pour la reprise.",
    ],
  },
  "Newswire | https://www.newswire.com/": {
    description: "Diffusion payante de communiqués avec démarchage des médias.",
    howTo: [
      "Offres payantes, liste de médias incluse.",
    ],
  },
  "Briefingwire | https://www.briefingwire.com/": {
    description: "Diffusion de communiqués, gratuite et payante.",
    howTo: [
      "Offre gratuite avec lien.",
    ],
  },
  "PR.com | https://www.pr.com/press-releases": {
    description: "Communiqués de presse et profils d’entreprise, gratuits et payants.",
    howTo: [
      "Offre gratuite avec lien depuis le profil.",
    ],
  },
  "PressBox | https://www.pressbox.co.uk/": {
    description: "Diffusion de communiqués de presse au Royaume-Uni.",
    howTo: [
      "Envoi gratuit de communiqués.",
    ],
  },
  "PRFire | https://www.prfire.co.uk/": {
    description: "Diffusion de communiqués au Royaume-Uni.",
    howTo: [
      "Offres gratuites et payantes.",
    ],
  },
  "Brainly | https://brainly.com/": {
    description: "Plateforme de questions-réponses éducative, tournée vers les élèves.",
    howTo: [
      "Répondez à des questions scolaires. Le profil comporte un lien.",
    ],
  },
  "Answerbag | https://www.answerbag.com/": {
    description: "Communauté de questions-réponses.",
    howTo: [
      "Répondez à des questions ; lien depuis le profil.",
    ],
  },
  "Quora Spaces | https://www.quora.com/spaces": {
    description: "Réseau de publications de Quora, à la manière de Medium. Les Spaces ont des modérateurs et un public.",
    howTo: [
      "Créez ou rejoignez un Space correspondant à votre niche.",
      "Publiez régulièrement pour constituer une base d’abonnés.",
    ],
  },
  "Stack Overflow | https://stackoverflow.com/": {
    description: "Questions-réponses sur la programmation. Publier des liens demande de la réputation.",
    howTo: [
      "Il faut un minimum de réputation pour publier des liens.",
      "Gagnez de la réputation en répondant avant de faire votre promotion.",
    ],
  },
  "Server Fault | https://serverfault.com/": {
    description: "Questions-réponses Stack Exchange pour administrateurs système.",
    howTo: [
      "Mêmes règles de réputation que sur Stack Exchange.",
    ],
  },
  "Webmasters Stack Exchange | https://webmasters.stackexchange.com/": {
    description: "Stack Exchange consacré aux webmasters et au SEO.",
    howTo: [
      "Soyez actif sur votre niche.",
    ],
  },
  "SlideShare | https://www.slideshare.net/": {
    description: "Plateforme de publication de présentations (propriété de LinkedIn).",
    howTo: [
      "Publiez quelques présentations sur votre niche.",
      "Ajoutez des liens et des appels à l’action sur les dernières diapositives.",
    ],
  },
  "Scribd | https://www.scribd.com/": {
    description: "Plateforme de partage de documents et de livres.",
    howTo: [
      "Publiez des PDF et des livres blancs.",
    ],
  },
  "ResearchGate | https://www.researchgate.net/": {
    description: "Réseau universitaire et hébergement d’articles.",
    howTo: [
      "Une adresse e-mail universitaire ou une vérification académique est demandée.",
    ],
  },
  "Academia.edu | https://www.academia.edu/": {
    description: "Profil universitaire et partage d’articles.",
    howTo: [
      "Profil avec lien vers votre site personnel.",
    ],
  },
  "Mix.com | https://mix.com/": {
    description: "Successeur de StumbleUpon : découverte de contenus.",
    howTo: [
      "Ajoutez vos URL à vos collections.",
    ],
  },
  "Pocket | https://getpocket.com/": {
    description: "Service de lecture différée (propriété de Firefox).",
    howTo: [
      "Enregistrez vos articles ; figurer dans les tendances apporte des visites.",
    ],
  },
  "Pearltrees | https://www.pearltrees.com/": {
    description: "Favoris visuels et curation.",
    howTo: [
      "Créez des collections et ajoutez-y vos URL.",
    ],
  },
  "Diigo | https://www.diigo.com/": {
    description: "Favoris partagés et annotation.",
    howTo: [
      "Enregistrez des favoris ; les tags aident l’indexation.",
    ],
  },
  "Plurk | https://www.plurk.com/": {
    description: "Plateforme de microblog asiatique.",
    howTo: [
      "Profil et lien dans la bio.",
    ],
  },
  "Issuu | https://issuu.com/": {
    description: "Publication numérique : magazines, brochures.",
    howTo: [
      "Mettez en ligne des publications au format PDF.",
    ],
  },
  "Calameo | https://www.calameo.com/": {
    description: "Éditeur de magazines numériques à feuilleter.",
    howTo: [
      "Mettez en ligne un PDF ; le profil peut renvoyer vers votre site.",
    ],
  },
  "Flickr | https://www.flickr.com/": {
    description: "Partage de photos et portfolio.",
    howTo: [
      "Lien dans la bio du profil ; les descriptions de photos peuvent contenir des liens.",
    ],
  },
  "500px | https://500px.com/": {
    description: "Communauté et portfolio de photographes.",
    howTo: [
      "Lien dans la bio du profil.",
    ],
  },
  "Unsplash | https://unsplash.com/": {
    description: "Banque de photos gratuites. Les profils de contributeurs reçoivent des liens d’attribution.",
    howTo: [
      "Mettez en ligne des photos originales ; les plus utilisées vous valent des liens d’attribution.",
    ],
  },
  "Imgur | https://imgur.com/": {
    description: "Communauté de partage d’images.",
    howTo: [
      "Le profil et les descriptions d’images acceptent les liens.",
    ],
  },
  "Goodreads (author) | https://www.goodreads.com/": {
    description: "Profils d’auteurs pour les auteurs de livres.",
    howTo: [
      "Il faut avoir publié un livre.",
      "Inscrivez-vous au Goodreads Author Program.",
      "Le profil comporte un lien vers votre blog ou votre site.",
    ],
  },
  "Zillow | https://www.zillow.com/": {
    description: "Plateforme immobilière : profils d’agents et de courtiers.",
    howTo: [
      "Inscrivez-vous comme agent ou courtier.",
      "Faites vérifier votre licence.",
    ],
  },
  "Realtor.com | https://www.realtor.com/": {
    description: "Site immobilier américain affilié à la NAR.",
    howTo: [
      "Les agents membres de la NAR ont un profil gratuit.",
    ],
  },
  "Trulia | https://www.trulia.com/": {
    description: "Plateforme immobilière appartenant à Zillow.",
    howTo: [
      "Se synchronise automatiquement avec le profil d’agent Zillow.",
    ],
  },
  "Redfin | https://www.redfin.com/": {
    description: "Place de marché immobilière.",
    howTo: [
      "Profil d’agent via le Redfin Partner Program.",
    ],
  },
  "Vitals | https://www.vitals.com/": {
    description: "Annuaire et avis sur les médecins.",
    howTo: [
      "Revendiquez votre profil et faites vérifier vos diplômes.",
    ],
  },
  "ZocDoc | https://www.zocdoc.com/": {
    description: "Prise de rendez-vous médicaux et fiches de praticiens.",
    howTo: [
      "Fiche de praticien payante (abonnement mensuel).",
    ],
  },
  "Doctor.com | https://www.doctor.com/": {
    description: "Profils et avis de médecins.",
    howTo: [
      "Profil de base gratuit.",
    ],
  },
  "WebMD Provider Directory | https://doctor.webmd.com/": {
    description: "Annuaire des praticiens de WebMD.",
    howTo: [
      "Revendiquez votre fiche et faites vérifier votre numéro NPI.",
    ],
  },
  "Justia | https://www.justia.com/": {
    description: "Annuaire d’avocats et de cabinets.",
    howTo: [
      "Profil d’avocat gratuit avec lien vers votre site.",
    ],
  },
  "FindLaw | https://lawyers.findlaw.com/": {
    description: "Annuaire d’avocats de Thomson Reuters.",
    howTo: [
      "Profil de base gratuit.",
    ],
  },
  "Martindale-Hubbell | https://www.martindale.com/": {
    description: "Annuaire historique de notation des avocats.",
    howTo: [
      "Profil gratuit avec vos qualifications.",
    ],
  },
  "Super Lawyers | https://www.superlawyers.com/": {
    description: "Distinction d’avocats évalués par leurs pairs.",
    howTo: [
      "La distinction est éditoriale ; le profil est gratuit.",
    ],
  },
  "Lawyers.com | https://www.lawyers.com/": {
    description: "Annuaire d’avocats appartenant à Martindale.",
    howTo: [
      "Profil de base gratuit.",
    ],
  },
  "Cars.com Dealer | https://www.cars.com/": {
    description: "Place de marché des concessionnaires automobiles.",
    howTo: [
      "Abonnement concessionnaire payant.",
    ],
  },
  "DealerRater | https://www.dealerrater.com/": {
    description: "Avis sur les concessionnaires automobiles.",
    howTo: [
      "Revendiquez votre concession.",
    ],
  },
  "OpenTable | https://restaurant.opentable.com/": {
    description: "Réservations de restaurants.",
    howTo: [
      "Abonnement pour les restaurants.",
    ],
  },
  "Resy | https://resy.com/": {
    description: "Réservations de restaurants (groupe American Express).",
    howTo: [
      "Abonnement pour les restaurants.",
    ],
  },
  "Zomato | https://www.zomato.com/": {
    description: "Découverte de restaurants et livraison (Inde et quelques autres marchés).",
    howTo: [
      "Revendiquez votre restaurant ; fiche de base gratuite.",
    ],
  },
  "Swiggy | https://partner.swiggy.com/": {
    description: "Livraison de repas et fiches de restaurants en Inde.",
    howTo: [
      "Inscription du restaurant.",
    ],
  },
  "Booking.com | https://join.booking.com/": {
    description: "Place de marché des hôtels et hébergements.",
    howTo: [
      "Inscription du propriétaire de l’établissement ; rémunération à la commission.",
    ],
  },
  "Airbnb | https://www.airbnb.com/host/": {
    description: "Locations de vacances.",
    howTo: [
      "Inscription comme hôte.",
    ],
  },
  "Expedia | https://www.expediagroup.com/lodging/": {
    description: "Hôtels et voyages.",
    howTo: [
      "Inscription via Partner Central.",
    ],
  },
  "Lonely Planet | https://www.lonelyplanet.com/": {
    description: "Guide de voyage : y figurer relève de la rédaction.",
    howTo: [
      "Proposez votre établissement à l’équipe éditoriale.",
    ],
  },
  "AllTrails | https://www.alltrails.com/": {
    description: "Sentiers de randonnée et plein air.",
    howTo: [
      "Ajoutez un sentier (contenu modifié par la communauté).",
    ],
  },
  "CoinGecko | https://www.coingecko.com/": {
    description: "Agrégateur de données sur les cryptomonnaies et les jetons.",
    howTo: [
      "Soumettez votre projet via le formulaire « Request form ».",
      "Il faut être coté sur une plateforme d’échange et disposer de liquidité on-chain.",
    ],
  },
  "CoinMarketCap | https://coinmarketcap.com/": {
    description: "Agrégateur de données sur les cryptomonnaies.",
    howTo: [
      "Soumettez via le formulaire officiel. Les critères sont stricts.",
    ],
  },
  "DappRadar | https://dappradar.com/": {
    description: "Statistiques sur les DApps et les NFT.",
    howTo: [
      "Soumettez une DApp ayant une activité on-chain.",
    ],
  },
  "Alchemy DApp Store | https://www.alchemy.com/dapps": {
    description: "Catalogue de DApps d’Alchemy.",
    howTo: [
      "Soumettez via le tableau de bord Alchemy.",
    ],
  },
  "DefiLlama | https://defillama.com/": {
    description: "Agrégateur de TVL de la finance décentralisée (DeFi).",
    howTo: [
      "Soumettez un protocole dont la TVL est vérifiable.",
    ],
  },
  "Product Hunt Crypto | https://www.producthunt.com/topics/crypto": {
    description: "Rubrique crypto de Product Hunt : un bon endroit pour un lancement.",
    howTo: [
      "Lancement Product Hunt classique, avec l’étiquette crypto.",
    ],
  },
  "Yandex Business | https://yandex.com/maps-business/": {
    description: "Le principal service de fiches locales et de cartes en Russie.",
    howTo: [
      "Faites vérifier l’entreprise en envoyant un justificatif.",
    ],
  },
  "2GIS | https://2gis.com/": {
    description: "Annuaire urbain et cartes (Russie et CEI).",
    howTo: [
      "Ajoutez l’entreprise via le portail partenaires.",
    ],
  },
  "Panorama Firm | https://panoramafirm.pl/": {
    description: "Annuaire d’entreprises en Pologne.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Firmy.cz | https://www.firmy.cz/": {
    description: "Annuaire d’entreprises en République tchèque.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Zoznam Firiem | https://www.zoznamfiriem.sk/": {
    description: "Annuaire d’entreprises en Slovaquie.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Aranzulla Pages | https://www.paginegialle.it/aziende": {
    description: "Pages entreprises en Italie.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Yellow Pages Kenya | https://www.yellowpageskenya.com/": {
    description: "Pages jaunes du Kenya.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Yellow Pages Ghana | https://www.ghanayello.com/": {
    description: "Pages jaunes du Ghana.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Yellow Pages Egypt | https://www.yellowpages.com.eg/": {
    description: "Pages jaunes d’Égypte.",
    howTo: [
      "Fiche gratuite.",
    ],
  },
  "Páginas Amarillas Colombia | https://www.paginasamarillas.com.co/": {
    description: "Pages jaunes de Colombie.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Páginas Amarillas Chile | https://www.amarillas.cl/": {
    description: "Pages jaunes du Chili.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Páginas Amarillas Peru | https://www.paginasamarillas.com.pe/": {
    description: "Pages jaunes du Pérou.",
    howTo: [
      "Fiche de base gratuite.",
    ],
  },
  "Pulse.LinkedIn (publishing) | https://www.linkedin.com/pulse/": {
    description: "Le principal espace d’articles de LinkedIn.",
    howTo: [
      "Publiez via « Write an article ». La diffusion passe par vos abonnés.",
    ],
  },
  "Buffer Resources | https://buffer.com/resources/": {
    description: "Proposez des articles invités au blog marketing de Buffer.",
    howTo: [
      "Lisez leurs consignes éditoriales.",
      "Proposez des angles originaux sur les réseaux sociaux.",
    ],
  },
  "HubSpot Blog | https://www.hubspot.com/marketing/contribute-to-blog": {
    description: "Proposer un article au blog HubSpot. Difficile à obtenir, mais très reconnu.",
    howTo: [
      "Lisez plusieurs articles récents avant de proposer.",
      "Soumettez quelques idées d’angles originaux avec leur plan.",
      "Le délai de réponse peut prendre plusieurs semaines.",
    ],
  },
  "Smashing Magazine | https://www.smashingmagazine.com/write-for-us/": {
    description: "Magazine de conception et de développement web.",
    howTo: [
      "Proposez des sujets de développement ou de design.",
      "Les articles attendus sont longs et approfondis.",
    ],
  },
  "CSS-Tricks | https://css-tricks.com/contribute/": {
    description: "Publication consacrée au développement front-end.",
    howTo: [
      "Proposez des tutoriels CSS ou JavaScript.",
    ],
  },
  "DigitalOcean Community | https://www.digitalocean.com/community/pages/write-for-digitalocean": {
    description: "DigitalOcean rémunère les tutoriels techniques.",
    howTo: [
      "Postulez au programme Write for DOnations.",
      "Soumettez une idée de tutoriel.",
      "Vous êtes rémunéré et obtenez un lien dofollow.",
    ],
  },
  "Search Engine Journal | https://www.searchenginejournal.com/contribute/": {
    description: "Publication SEO de référence.",
    howTo: [
      "Proposez des études ou des cas pratiques SEO originaux.",
    ],
  },
  "Moz Blog | https://moz.com/contribute": {
    description: "Le blog marketing et SEO de Moz.",
    howTo: [
      "Niveau d’exigence élevé ; les recherches originales sont appréciées.",
    ],
  },
  "Entrepreneur.com Contributors | https://www.entrepreneur.com/page/expert-faq": {
    description: "Réseau de contributeurs du magazine Entrepreneur.",
    howTo: [
      "Postulez via le programme Expert ; des références sont demandées.",
    ],
  },
  "Forbes Contributors (legacy) | https://www.forbes.com/sites/forbescommunicationscouncil/people/": {
    description: "Forbes Councils : adhésion payante (abonnement annuel) pour pouvoir publier.",
    howTo: [
      "Postulez au Forbes Business Council ou au Forbes Communications Council.",
    ],
  },
  "Inc.com Contributors | https://www.inc.com/": {
    description: "Magazine Inc.",
    howTo: [
      "Écrivez à la rédaction avec votre proposition et une courte biographie.",
    ],
  },
  "Weebly | https://www.weebly.com/": {
    description: "Site gratuit sur un sous-domaine Weebly.",
    howTo: [
      "Créez quelques pages de contenu sur votre thématique.",
    ],
  },
  "Jimdo | https://www.jimdo.com/": {
    description: "Sous-domaine Jimdo gratuit.",
    howTo: [
      "Offre gratuite avec sous-domaine.",
    ],
  },
  "Strikingly | https://www.strikingly.com/": {
    description: "Sites d’une page gratuits.",
    howTo: [
      "Offre gratuite avec sous-domaine.",
    ],
  },
  "Carrd | https://carrd.co/": {
    description: "Sites d’une seule page gratuits.",
    howTo: [
      "Offre gratuite avec un sous-domaine carrd.co.",
    ],
  },
  "Hubpages | https://hubpages.com/": {
    description: "Réseau d’articles et de sites thématiques.",
    howTo: [
      "Publiez des articles dans les communautés thématiques.",
    ],
  },
  "Vocal Media | https://vocal.media/": {
    description: "Publication multithématique.",
    howTo: [
      "Publiez des récits dans les « communautés » thématiques.",
    ],
  },
  "Medium Sub-publications | https://medium.com/": {
    description: "Les grandes publications Medium acceptent des propositions.",
    howTo: [
      "Trouvez une publication Medium de votre thématique (Better Marketing, Towards Data Science, etc.).",
      "Postulez pour en devenir rédacteur.",
    ],
  },
  "GitBook | https://www.gitbook.com/": {
    description: "Hébergement gratuit de documentation publique.",
    howTo: [
      "Publiez de la documentation ; les liens sortants sont en dofollow.",
    ],
  },
  "Quora Topics | https://www.quora.com/topic/": {
    description: "Bâtissez votre autorité sur des pages de sujets précis.",
    howTo: [
      "Répondez dans le sujet visé ; l’autorité du profil se renforce avec le temps.",
    ],
  },
  "GrowthHackers | https://growthhackers.com/": {
    description: "Communauté du growth marketing.",
    howTo: [
      "Partagez du contenu et participez aux discussions.",
    ],
  },
  "Inbound.org (legacy / archive) | https://www.inbound.org/": {
    description: "Communauté de l’inbound marketing.",
    howTo: [
      "Partagez du contenu.",
    ],
  },
  "WickedFire | https://www.wickedfire.com/": {
    description: "Forum du marketing d’affiliation.",
    howTo: [
      "Gagnez en réputation sur le forum avant de faire votre promotion.",
    ],
  },
  "Warrior Forum | https://www.warriorforum.com/": {
    description: "Forum du marketing en ligne.",
    howTo: [
      "Gagnez d’abord en réputation sur le forum.",
    ],
  },
  "Black Hat World | https://www.blackhatworld.com/": {
    description: "Forum SEO et affiliation. Utilisez les sections « white hat » (elles existent) pour des échanges sincères.",
    howTo: [
      "Restez dans les sections « white hat » ; les liens en signature sont permis à partir d’un certain niveau de réputation.",
    ],
  },
  "Digital Point Forum | https://forums.digitalpoint.com/": {
    description: "Forum webmasters et SEO.",
    howTo: [
      "Lien dans le profil et en signature après quelques messages.",
    ],
  },
  "Wicked Cool Daily (Discord/Reddit) | https://www.reddit.com/r/InternetIsBeautiful/": {
    description: "Subreddit consacré aux belles trouvailles du web : un passage en page d’accueil peut apporter beaucoup de visites.",
    howTo: [
      "Proposez du contenu original et remarquable ; respectez la règle d’autopromotion de 1 pour 9.",
    ],
  },
  "Hacker Noon | https://hackernoon.com/contribute": {
    description: "Publication technologique. Propositions ouvertes à tous.",
    howTo: [
      "Soumettez via l’éditeur du site.",
    ],
  },
};

export const CATEGORY_LABELS_FR: Record<ProspectCategory, string> = {
  directory: "Annuaires d’entreprises",
  "guest-post": "Articles invités et republication",
  resource: "Pages de ressources et plateformes de lancement",
  forum: "Forums et communautés",
  "haro-style": "Sources pour journalistes (type HARO)",
  web2: "Sites en sous-domaine gratuit (web 2.0)",
  qa: "Plateformes de questions-réponses",
  profile: "Création de profils",
  bookmark: "Partage de favoris",
  podcast: "Annuaires de podcasts",
  press: "Diffusion de communiqués de presse",
  "edu-gov": "Opportunités .edu / .gov",
  "saas-tool": "Annuaires de SaaS et d’outils",
  ecommerce: "Plateformes e-commerce",
  local: "Citations locales (NAP)",
  industry: "Par secteur",
  developer: "Écosystème développeurs",
  creator: "Créateurs, vidéo et réseaux sociaux",
};

export const COUNTRY_LABELS_FR: Record<string, string> = {
  US: "États-Unis",
  CA: "Canada",
  GB: "Royaume-Uni",
  IE: "Irlande",
  AU: "Australie",
  NZ: "Nouvelle-Zélande",
  IN: "Inde",
  DE: "Allemagne",
  FR: "France",
  ES: "Espagne",
  IT: "Italie",
  NL: "Pays-Bas",
  BE: "Belgique",
  SE: "Suède",
  NO: "Norvège",
  DK: "Danemark",
  FI: "Finlande",
  PL: "Pologne",
  TR: "Turquie",
  IL: "Israël",
  AE: "Émirats arabes unis",
  SA: "Arabie saoudite",
  ZA: "Afrique du Sud",
  NG: "Nigeria",
  BR: "Brésil",
  AR: "Argentine",
  MX: "Mexique",
  JP: "Japon",
  KR: "Corée du Sud",
  CN: "Chine",
  HK: "Hong Kong",
  SG: "Singapour",
  MY: "Malaisie",
  PH: "Philippines",
  TH: "Thaïlande",
  VN: "Viêt Nam",
  ID: "Indonésie",
  RU: "Russie",
  UA: "Ukraine",
  KZ: "Kazakhstan",
  CZ: "Tchéquie",
  SK: "Slovaquie",
  AT: "Autriche",
  KE: "Kenya",
  GH: "Ghana",
  EG: "Égypte",
  CO: "Colombie",
  CL: "Chili",
  PE: "Pérou",
  TW: "Taïwan",
};

export const NICHE_LABELS_FR: Record<string, string> = {
  saas: "SaaS",
  ecommerce: "E-commerce",
  local: "Commerce local",
  services: "Services",
  b2b: "B2B",
  developer: "Développeurs",
  creator: "Créateurs",
  tech: "Tech",
  ai: "IA",
  media: "Médias",
  design: "Design",
  restaurant: "Restauration",
  travel: "Voyage",
  healthcare: "Santé",
  legal: "Juridique",
  construction: "Construction",
  "real-estate": "Immobilier",
  automotive: "Automobile",
  crypto: "Crypto / Web3",
  web3: "Web3",
  edu: "Éducation",
  academic: "Recherche",
  seo: "SEO",
  marketing: "Marketing",
  affiliate: "Affiliation",
};
