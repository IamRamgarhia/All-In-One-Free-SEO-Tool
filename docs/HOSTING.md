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
   git clone https://github.com/IamRamgarhia/seo.git
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

## Self-hosted on your own computer

Use the README's Docker option. The tool runs entirely on `localhost:3000`.
This is the most private setup — no data leaves your machine unless you
explicitly connect Google APIs or an external AI provider.

Costs: $0. Caveats: only accessible from your machine unless you expose
the port (ngrok / Tailscale / your router's port forward).

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

## When to migrate to PostgreSQL

Stay on SQLite while:
- You're the only user, OR
- You have <50 active users with <30 concurrent requests at peak.

Migrate to PostgreSQL when:
- You see `SQLITE_BUSY` errors in production logs.
- Daily-agent runs take >30 minutes (writes are queuing).
- You want to run 2+ app instances behind a load balancer.

Drizzle ORM supports both. The migration is a `DATABASE_URL` env var + the
drizzle config swap — about 1 day of work.
