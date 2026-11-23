# Piste : reprendre les points forts d'OpenSEO

_Notée le 25/10/2026 après un essai d'OpenSEO en local (~/oss-lab/openseo, rapport complet dans ~/oss-lab/RAPPORT.md). Rien n'est développé._

## OpenSEO en bref

- Dépôt : https://github.com/every-app/open-seo (MIT, environ 25k étoiles, créé en 02/2026, très actif, v0.1.16).
- Stack : TanStack Start, Vite, Cloudflare Workers (D1). Docker possible, mais sans connexion (`local_noauth`, un seul utilisateur).
- Données SEO : **DataForSEO**, payant à l'usage avec la clé de l'utilisateur. Sans clé, seul l'audit de site marche, et il est basique (crawl, liens, titres, redirections, canoniques).
- MCP : 81 outils.
- Télémétrie PostHog désactivable (`OPENSEO_TELEMETRY_DISABLED=1`).

Verdict : ne pas l'adopter (il recoupe nos outils), mais **reprendre trois idées**.

## Les trois idées, et où les mettre

### 1. Des données mesurées en option (DataForSEO) : dans ce dépôt, priorité 1

- Constat : nos mots-clés, positions et backlinks reposent sur des sources gratuites et des IA gratuites, donc sur des **estimations**. DataForSEO **mesure** (volumes réels, SERP réelles, backlinks).
- Point de départ existant :
  - les fonctions `src/lib/auto-keywords.ts`, `backlink-discovery.ts`, etc. ;
  - le catalogue de fournisseurs `src/lib/api-providers.ts` (principe « apporte ta clé ») ;
  - la page `src/app/seo-chat/capabilities/page.tsx`, qui évoque déjà une clé SERP personnelle (Serper, DataForSEO).
  - Aucun connecteur DataForSEO n'existe encore.
- À faire : une source « DataForSEO » optionnelle derrière ces fonctions. Avec la clé, données mesurées ; sans clé, les estimations gratuites actuelles. Afficher le **coût estimé avant chaque appel payant**, comme OpenSEO.
- Effort : moyen. Gain : élevé (données fiables pour les clients qui paient).

### 2. Un MCP qui annonce ses coûts : d'abord dans gsms-seo (~/Projects/seo-audit-skill), puis ici

- Modèle d'OpenSEO : chaque outil dit s'il est gratuit (« Uses no credits — does not call DataForSEO ») ou payant, avec un coût estimé. Les outils de lecture sont séparés des outils qui consomment.
- gsms-seo : 18 outils dans `src/mcp/tools.ts`, branchés sur Jarvis, donc à faire en premier. Ce dépôt : 22 outils dans `src/lib/mcp/tools.ts`.
- À faire : ajouter « gratuit / payant, coût estimé » dans la description de chaque outil, plus un mode « sans crédit » qui refuse les appels payants.
- Effort : petit.

### 3. Une interface par parcours : dans ce dépôt, chantier le plus long

- Constat : 232 pages pour 92 outils. OpenSEO tient sur quelques parcours clairs.
- À faire : regrouper la navigation en 5 ou 6 parcours (Audit, Mots-clés, Positions, Concurrents, Backlinks, Visibilité IA). Les outils actuels deviennent des sous-pages ; rien n'est supprimé.
- Effort : élevé, à faire par étapes.

## Ordre conseillé

1. Connecteur DataForSEO optionnel (ce dépôt).
2. Coûts annoncés dans le MCP de gsms-seo pour Jarvis.
3. Navigation par parcours (ce dépôt).
