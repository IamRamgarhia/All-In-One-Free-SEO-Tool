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

## Où on en est (24/11/2026, dernière fusion #137)

Fusionné récemment :
- #128 page d'audit : « Corriger avec… / Creuser avec… » sur chaque constat (vérifications de l'outil et règles du moteur), avec la tâche ouverte du constat ;
- #129 positions vides dites « Absent des N premiers résultats (moteur) » / « Non vérifié » partout (rapport PDF, portail, `/morning`, API v1, CSV), via `src/lib/serp/absence.ts` ;
- #130 mesure de l'effet des changements de l'agent (Search Console, 28 jours avant/après, « mesuré, pas attribué ») sur `/agent/autopilot` ;
- #131 registre unique des outils (`src/lib/tool-registry.ts`) et recherche globale complète ; #133 outils débloqués par chaque connexion, comptes justes ;
- #132 résultat du passage nocturne gardé tâche par tâche, section « Passage nocturne » de Santé du système ;
- #134 propriété Search Console illisible détectée projet par projet (jetons Google par projet) ;
- #135 brouillon d'article en .md (et « .md pour IA ») ; #136 longueur des posts Google et posts produit WooCommerce ;
- #137 petits défauts (messages « non mesuré » sans options de ligne de commande, 429/503 jamais « cassés », « 67,2 % », écrans Tâches et bouton développeur à 390 px).

Aucune migration ajoutée depuis 0093 : le prochain numéro libre reste **0094**.

## Prochaines tâches, dans l'ordre

1. **Repérer les autres fonctions gratuites de l'auteur** pas encore portées : `git fetch upstream` puis `git log --oneline main..upstream/main`, en ignorant celles déjà portées (eb10f33, 76d9415, 886886d, 51bf37e, 4b71b02, f8f3238, f2ea258).
2. Petits défauts relevés pendant les lots du 24/11 :
   - recherche globale : la priorité des tâches s'affiche en anglais (« medium ») ;
   - automatisations : l'exemple du champ « Sujet de départ » est en anglais (« new fall menu launch ») ;
   - `/connect` : 28 outils classés « une partie de l'outil se sert de l'IA » d'après l'analyse automatique du code, sans confirmation ; la liste des outils MCP n'a pas été portée (son import faisait passer la page en « besoin d'une clé ») ;
   - tests : `methodology-loader.test.ts` échoue sur une machine en `core.autocrlf=true` (fins de ligne du fichier généré) ; `action-guard.test.ts` dépasse parfois sa limite de 30 s dans la suite complète (il passe seul).

Tests dans le navigateur : toujours sur une copie de la base (`SEO_DB_PATH=<copie>`), y compris pour `db:migrate`. Sous Windows, arrêter un `next dev` lancé en tâche de fond ne suffit pas toujours : vérifier le port (`Get-NetTCPConnection -LocalPort <port>`) et arrêter le processus restant.

Pour chaque lot : branche → travail → tests + `tsc` + eslint + capture à 390 px → PR sur le fork → fusion → `git pull` sur `main`. Rendre compte à samir en français, simplement (il n'est pas expert SEO).
