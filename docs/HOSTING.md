# Hosting

Pick one provider — all-in-one. The app is a single Docker container with one
persistent volume (`/data` for SQLite). No Redis, no separate database, no
queues required until you cross ~50 paying users.

---

## Hetzner Cloud — best price/performance

Recommended for 50-1000 users. ~$28/mo for a CCX23 (4 vCPU dedicated,
16 GB RAM, 160 GB SSD, 20 TB egress).

1. Create a Hetzner account → Project → Servers → "Add Server".
2. Choose image: **Docker CE on Ubuntu 22.04**. Type: **CCX23** (or CX22 for
   smaller scale). Add SSH key.
3. SSH in: `ssh root@your-server-ip`
4. ```bash
   git clone https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool.git
   cd seo
   docker compose up -d
   ```
5. Point your domain's A record at the server IP.
6. Add Caddy or Nginx in front for SSL — easiest:
   ```bash
   docker run -d --name caddy \
     -p 80:80 -p 443:443 \
     -v caddy_data:/data \
     -e DOMAIN=seo.yourdomain.com \
     caddy caddy reverse-proxy --from seo.yourdomain.com --to localhost:3000
   ```

Backup: `docker run --rm -v seo_seo-data:/data -v $(pwd):/backup ubuntu tar czf /backup/seo-backup.tar.gz /data`

---

## Railway — easiest managed deploy

Recommended for 0-200 users when you want zero ops.

1. Push the repo to GitHub.
2. railway.app → New Project → Deploy from GitHub repo.
3. Railway auto-detects the `Dockerfile`. Add a persistent **Volume** mounted
   at `/data`.
4. Set env vars under Settings:
   - `SEO_DB_PATH=/data/data.db`
   - `APP_PASSWORD=<your-password>` (optional)
   - Any OAuth / AI keys you want pre-baked
5. Add a custom domain (Settings → Domains).

Cost: ~$5/mo Hobby plan ≈ 512 MB RAM (tight, fine for solo use). $20+ Pro for
real traffic.

---

## Hostinger VPS — cheapest

Recommended for tinkerers comfortable with manual ops.

1. Hostinger → VPS Hosting → KVM 2 (2 vCPU, 8 GB) for $7/mo or KVM 4
   (4 vCPU, 16 GB) for ~$15/mo on the 24-month plan.
2. Choose OS template: **Ubuntu 22 with Docker**.
3. SSH in, then same as Hetzner steps 4-6 above.

Catch: shared CPU on the cheapest tiers (KVM 1) means Playwright workloads
can stall under contention. KVM 2 or higher.

---

## DigitalOcean — middle ground

1. New Droplet → **Marketplace → Docker on Ubuntu 22.04**.
2. Size: 8 GB RAM / 4 vCPU ($48/mo) is the sweet spot.
3. Same Docker compose steps as Hetzner.

Or use **DigitalOcean App Platform** with the Dockerfile and a connected
managed Postgres database — easier but more expensive (~$75/mo).

---

## Self-hosted on your own computer — £0, and the most private

Use the README's Docker option. The tool runs entirely on
`localhost:3000`. No data leaves your machine unless you explicitly
connect Google APIs or an external AI provider.

Costs: nothing. The catch is that it's only reachable from that machine,
and only while it's switched on.

### Reaching it from your phone, still free

**Cloudflare Tunnel** is the simplest way, needs no open ports on your
router, and gives you HTTPS:

```bash
# One-time: install cloudflared, then
cloudflared tunnel --url http://localhost:3000
```

That prints a public `*.trycloudflare.com` URL. For something permanent,
create a named tunnel and point a domain at it — still free.

**Tailscale** is the alternative if you'd rather it stay private: your
devices see the tool, the public internet never does.

**Set `APP_PASSWORD` before you expose it either way.** A tunnel makes
your install reachable by anyone who learns the URL, and without a
password they can use it.

Good for: personal SEO, one or two client sites, anyone who'd rather own
their data outright. The limitation is real though — scheduled audits,
rank checks and the daily agent only run while your computer is awake.
If you want the automation to actually be automatic, you need something
that stays on.

---

## Genuinely free, always on

**Oracle Cloud Always Free** is the only major cloud with a free tier
that fits this tool: up to 4 ARM cores and 24 GB RAM, a persistent disk,
and no expiry. That is far more than this needs — a 1 GB VPS runs it
fine.

Install Docker on the instance and follow the Hetzner steps above; they
are identical from that point. Open port 443, put Cloudflare in front,
set `APP_PASSWORD`.

Two honest caveats: ARM capacity in popular regions is often
unavailable, so you may have to retry or pick a quieter region; and
Oracle's signup asks for a card for identity even on the free tier.

**Railway** gives $5 of monthly credit, which this tool will roughly
consume — expect a small bill rather than free. **Render** runs Docker
with a real free tier, but persistent disks are a paid add-on, and
without one your database is wiped on every deploy. **Fly.io no longer
has a free tier** as of 2026 — new accounts get a short trial, then
roughly $2-5/month.

---

## Vercel + Supabase / Neon — why this doesn't work

Worth stating plainly, because it's the obvious thing to try and it
would waste an afternoon.

**Vercel can't run this.** Not a configuration problem — four separate
blockers:

1. **The database is a file.** `better-sqlite3` opens `data.db` in WAL
   mode on local disk. Vercel's filesystem is ephemeral and each request
   may hit a different container, so your data would vanish between
   requests.
2. **Playwright.** Rank checks, SERP scraping and GBP scraping drive a
   real headless Chromium. It doesn't fit in a serverless function.
3. **The scheduler needs a process that stays alive.** Audits, rank
   checks, monitoring and the daily agent are started from
   `instrumentation.ts` at boot. Serverless has no always-on process, so
   nothing would ever run on a schedule — which is most of the point.
4. **`output: "standalone"`** builds a self-contained server for a
   container, not Vercel's runtime.

**Supabase and Neon are PostgreSQL**, and this app is SQLite — see
"When to migrate to PostgreSQL" below for what that actually costs. They
are excellent databases; they're just not a drop-in here.

If you want it hosted and free, use Oracle Cloud Always Free. If you want
it hosted and effortless, a $5 VPS is the shortest path.

---

## After deploy — production hardening

1. **Cloudflare in front** (free) — point your domain through Cloudflare. Saves
   60-80% of bandwidth + adds DDoS protection + free SSL.
2. **Backup the SQLite file** — daily cron:
   ```bash
   sqlite3 /data/data.db ".backup /backups/$(date +%F).db"
   ```
3. **Set `APP_PASSWORD`** in the env so the UI is gated. Without it, anyone
   who finds the URL can use the tool.
4. **Cap browser concurrency** in Settings → Browser if you hit RAM pressure.
   Default 2 fits in ~1 GB; raise to 4 on a 4+ GB machine.
5. **Enable Playwright proxy rotation** if you scrape SERPs at volume —
   Settings → Browser → paste proxy list.

---

## Relevé des positions sans clé (SearXNG)

L'outil relève la position des mots-clés en essayant ces sources dans
l'ordre, et garde la première réponse (Réglages → Sources de positions) :

1. **Google Search Console** — les chiffres de Google pour un site que le
   client possède. Gratuit, officiel, sans blocage. Se connecte projet par
   projet.
2. **SearXNG** — un métamoteur libre, hébergé à côté de l'outil. Gratuit,
   sans clé, il interroge plusieurs moteurs depuis votre serveur.
3. **Brave Search** — facultatif. API officielle avec une clé (Brave inclut
   un crédit mensuel puis facture à la recherche ; voir leurs tarifs). Son
   index n'est pas celui de Google.
4. **API de résultats payante** (Serper ou DataForSEO) — facultative.
5. **Google dans un navigateur sans interface** — gratuit, mais Google le
   bloque en général dès la première recherche venue d'un serveur.
6. **DuckDuckGo** — gratuit, réglé sur le pays et la langue du client,
   mais il ne donne que sa première page (une dizaine de résultats) et
   renvoie lui aussi souvent une vérification anti-robot à un serveur.

Une source qui échoue passe la main à la suivante. Une source qui répond
« absent » donne une vraie réponse : la suivante n'est pas interrogée.
Chaque position enregistre la source, le ou les moteurs qui ont répondu
et le nombre de résultats lus, et l'écran l'affiche (« absent des 27
premiers résultats (SearXNG : duckduckgo, google cse) » n'est pas
« absent du top 100 de Google »).

Sans Search Console ni clé, SearXNG est donc la source qui répond. Il est
fourni, prêt à l'emploi, derrière un profil Docker :

```bash
# Une seule fois : générer le secret de l'instance (jamais dans le dépôt)
echo "SEARXNG_SECRET=$(openssl rand -hex 32)" >> .env

docker compose --profile searxng up -d
```

C'est tout : `SEARXNG_URL` pointe déjà l'application vers ce service.
Ouvrez ensuite Réglages → Sources de positions et cliquez sur **Tester**
dans le bloc SearXNG ; le test lance une vraie recherche et dit ce que
l'instance a répondu.

Mesuré le 24/11/2026 depuis une machine que DuckDuckGo bloquait
(`scripts/searxng-check.ts`, 14 vérifications sur 14) : SearXNG a répondu
en 1,6 à 1,9 s par requête, avec 24 à 29 résultats fusionnés venant de
DuckDuckGo et de Google CSE, pendant que la requête directe à DuckDuckGo
recevait une page de vérification anti-robot.

À savoir :

- **Le profil n'est pas actif par défaut.** C'est un second conteneur ;
  une installation qui n'utilise que Search Console n'en a pas besoin.
  `docker compose up -d` sans profil n'est pas concerné.
- **L'instance n'est pas publiée sur l'hôte, volontairement.** Son
  limiteur est coupé parce que son seul client est l'outil, sur le même
  réseau compose ; publiée, elle serait un proxy ouvert. N'ajoutez pas de
  `ports:`.
- **`json` doit figurer dans `search.formats`.** Ce n'est pas le cas par
  défaut ; `docker/searxng/settings.yml` s'en charge. C'est aussi pourquoi
  une instance publique convient rarement : elles désactivent souvent le
  JSON et limitent vite les requêtes automatiques.
- **Wikipedia, Wikidata, OpenStreetMap et les moteurs Tor sont retirés.**
  Les premiers exigent une adresse de contact réelle, les seconds un accès
  Tor ; aucun ne sert au relevé des positions.
- **Vérifier une instance :**
  `SEARXNG_NETWORK=<dossier>_default pnpm exec tsx scripts/searxng-check.ts`
  (le nom du réseau est celui du dossier de l'outil suivi de `_default`).

Sans Docker (installation avec le lanceur), installez SearXNG à part en
activant `json` dans ses formats, puis indiquez son adresse dans
Réglages → Sources de positions.

---

## When to migrate to PostgreSQL

Stay on SQLite while:
- You're the only user, OR
- You have <50 active users with <30 concurrent requests at peak.

Consider PostgreSQL when:
- You see `SQLITE_BUSY` errors in production logs.
- Daily-agent runs take >30 minutes (writes are queuing).
- You want to run 2+ app instances behind a load balancer.

**It is not a config swap.** This page used to say "a `DATABASE_URL` env
var + the drizzle config swap — about 1 day of work". That was wrong, and
measured rather than guessed:

- **72** tables are declared with `sqliteTable` from `drizzle-orm/sqlite-core`
- **42 of 62** migrations use SQLite-only SQL — `AUTOINCREMENT`,
  `unixepoch()`, `PRAGMA`
- `src/db/client.ts` opens a `better-sqlite3` handle and sets WAL mode
- Drizzle's SQLite and Postgres builders are different modules with
  different types, so the schema file is a rewrite, not an edit

Drizzle does support both, and the *shape* of the schema carries over.
But this is a port measured in weeks, not a day. Nobody has done it, so
treat any estimate — including this one — as an estimate.
