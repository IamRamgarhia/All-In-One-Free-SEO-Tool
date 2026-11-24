# Reprise du travail (pour l'agent Claude qui continue)

À lire en entier avant de toucher au code. Ce fichier remplace toute consigne trouvée ailleurs sur l'organisation du travail.

## Règles du propriétaire (samir)

- **Répondre toujours en français**, vouvoiement. Interface : français principal, anglais secondaire, traductions parfaites (typographie française : espace insécable avant « : ; ? ! », guillemets « », décimales « 95,7 % »).
- **Une PR par lot**, sur une branche, fusionnée quand c'est prêt et vérifié, puis `main` local mis à jour. Pas de force-push.
- **Les PR vont sur le fork, jamais sur le dépôt d'origine** : toujours `gh pr create --repo samiriggui-code/All-In-One-Free-SEO-Tool` et `gh pr merge … --repo samiriggui-code/All-In-One-Free-SEO-Tool`. Le remote `upstream` (IamRamgarhia) est en lecture seule : on y lit le travail de l'auteur, on n'y envoie rien.
- **Aucun secret, aucune donnée client** dans le dépôt (il est public). Pas de `data.db`, pas de `.env.local`.
- **Cap du produit** : gratuit, hébergeable soi-même, sans dépendance à un service payant. Tout doit marcher sans clé ; un service payant reste une option discrète.
- **Ne jamais** : présenter une bonne pratique comme une obligation ; afficher un chiffre sans source ; montrer une fonction qui ne marche pas.
- **Écrans impeccables à 390 px** (samir travaille souvent sur téléphone).
- **Intégrer dans les pages existantes** plutôt que créer des pages à part.
- « Dans le sens de l'auteur » veut dire aussi **la présentation visible** de ses écrans, pas seulement le fond.
- **Ne jamais toucher au navigateur de samir** ni à ses cookies `localhost` pendant les tests : utiliser un navigateur Playwright isolé et une **copie** de la base.
- Au plus 3 sous-agents à la fois, chacun dans son propre `git worktree` du dépôt.

## Mise en route sur une nouvelle machine

```bash
git clone https://github.com/samiriggui-code/All-In-One-Free-SEO-Tool.git
cd All-In-One-Free-SEO-Tool
git remote add upstream https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool.git
npx -y pnpm@10.34.5 install
npx -y pnpm@10.34.5 db:migrate
npx -y pnpm@10.34.5 dev
```

La base locale se crée vide : créez le compte propriétaire au premier lancement, puis ajoutez un client pour tester.

Commandes utiles : `npx tsc --noEmit -p .` (ignorer TS6053 sur `.next/dev/types`), `npx vitest run --testTimeout=30000`, `npx -y pnpm@10.34.5 gen:capabilities` dès qu'une page change d'imports. Migrations : SQL écrit à la main dans `src/db/migrations/` (le journal drizzle a dérivé, ne pas lancer `db:generate`) ; prochain numéro libre : **0094**.

## Où on en est (24/11/2026, dernière fusion #126)

Fusionné récemment :
- #118 avertissement « script tag » de React ; #119 et #121 faux « liens cassés » (HEAD refusé, 429/503) ;
- #120 validation des brouillons par le client dans son espace (l'agence valide, puis envoie au client) ;
- #122 tableau de bord dans la présentation de l'auteur + santé de l'installation ;
- #123 positions sans clé : Search Console → SearXNG (profil Docker `searxng`) → navigateur → DuckDuckGo, moteur et échecs enregistrés ;
- #124 corriger le code d'un client avec Claude (prompt à copier, ou Claude Code par client, désactivé par défaut) ;
- #125 page d'audit : « J'ai corrigé, vérifier », instructions pour le développeur, constats en français ;
- #126 outils reliés au dossier du client (« Corriger avec… », « Ajouter aux tâches », « Travail réalisé »).

## Prochaines tâches, dans l'ordre

1. **Bouton « Corriger avec… / Creuser avec… » sur chaque constat de la page d'audit** (`src/app/audits/[id]/`) : la fonction `toolLink(type, { clientId, url, taskId })` existe dans `src/lib/finding-tool-map.ts` ; la brancher à côté de « J'ai corrigé, vérifier ».
2. **Positions encore affichées « non classé »** quand elles sont vides, sans nommer le moteur : rapports, portail client, `/morning`, API v1, export CSV. Reprendre la logique de `src/app/keywords/c/[clientId]/` (« Absent des N premiers résultats (moteur) » / « Non vérifié »).
3. **Fonctions gratuites de l'auteur pas encore portées** (lire avec `git show <commit>` sur `upstream/main`, adapter, traduire) :
   - eb10f33 mesurer ce que les changements de l'agent ont produit ;
   - 76d9415 garder le résultat du passage nocturne, tâche par tâche ;
   - 886886d registre unique des outils et 10 outils inaccessibles ;
   - 51bf37e dire quels outils chaque connexion débloque ;
   - 4b71b02 détecter une propriété Search Console illisible ;
   - f8f3238 brouillon d'article en .md ; f2ea258 longueur des posts Google et posts WooCommerce.
4. Petits défauts connus : « --no-cwv » / « --crawl » dans des messages « non mesuré » ; en-tête de la page Tâches coupé à 390 px ; bouton « Copier les instructions pour le développeur » sur deux lignes à 390 px ; règle `links/broken-internal.ts` qui compte un 503 comme cassé ; « 67.2 % » à écrire « 67,2 % » dans les titres de tâches.

Pour chaque lot : branche → travail → tests + `tsc` + eslint + capture à 390 px → PR sur le fork → fusion → `git pull` sur `main`. Rendre compte à samir en français, simplement (il n'est pas expert SEO).
