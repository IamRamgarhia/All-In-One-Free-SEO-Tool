# Troubleshooting

Common issues and how to fix them. If your problem isn't here, open an [issue](https://github.com/IamRamgarhia/SEO-Tool/issues) — chances are someone else hit the same thing.

## 📑 Table of contents

- [Installation issues](#installation-issues)
- [Startup issues](#startup-issues)
- [Browser & rank-checking issues](#browser--rank-checking-issues)
- [Database issues](#database-issues)
- [AI provider issues](#ai-provider-issues)
- [Google integration issues](#google-integration-issues)
- [WordPress plugin issues](#wordpress-plugin-issues)
- [Docker issues](#docker-issues)
- [Performance issues](#performance-issues)
- [Security & access issues](#security--access-issues)
- [Update / upgrade issues](#update--upgrade-issues)
- [Where logs live](#where-logs-live)
- [How to file a useful bug report](#how-to-file-a-useful-bug-report)

---

## Installation issues

### `better-sqlite3` fails to build

Native module needs a C++ toolchain. Install:

- **macOS:** `xcode-select --install`
- **Windows:** Install [Node.js LTS](https://nodejs.org/) and tick the "Tools for Native Modules" checkbox during setup. Alternatively: `npm install --global windows-build-tools`.
- **Ubuntu / Debian:** `sudo apt install build-essential python3`
- **Fedora / RHEL:** `sudo dnf groupinstall "Development Tools" && sudo dnf install python3`
- **Arch:** `sudo pacman -S base-devel`

Then re-run `pnpm install`.

### Playwright Chromium fails to download

The headless browser is ~170 MB. Common causes:

```bash
# Manual install with system deps
pnpm exec playwright install chromium --with-deps

# Linux only — install missing libraries
pnpm exec playwright install-deps chromium

# If it's a proxy issue
HTTPS_PROXY=http://your-proxy:8080 pnpm exec playwright install chromium

# If disk space is the issue (~500 MB needed total)
df -h
```

### "Port 3000 already in use" during installer

The installer auto-detects this and tries 3001-3010, then 8080/8081/4000/5000. To force a specific port:

```bash
# macOS / Linux
SEO_PORT=4000 curl -fsSL https://raw.githubusercontent.com/IamRamgarhia/SEO-Tool/main/install.sh | bash

# Windows
$env:SEO_PORT='4000'; iwr -useb https://raw.githubusercontent.com/IamRamgarhia/SEO-Tool/main/install.ps1 | iex
```

### "Node version too old"

We need Node 20 LTS or newer. Check yours with `node -v`. Upgrade:

- **macOS (Homebrew):** `brew upgrade node`
- **Windows:** Download fresh from [nodejs.org](https://nodejs.org/) (LTS)
- **Linux (nvm):** `nvm install --lts && nvm use --lts`
- **Linux (apt):** `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`

### Installer hangs at "Building production bundle"

The first build takes 1-2 minutes — that's normal. If it hangs for 5+ minutes:

1. Check `dev-server.log` and `dev-server.err.log` in the install folder
2. Free RAM matters — close other apps. Minimum 2 GB free for the build
3. As a fallback, skip the build: launchers fall back to dev mode automatically. Re-run `pnpm build` manually later.

---

## Startup issues

### "Server isn't responding" / blank page

The first request to a Next.js dev server can take 30-60 seconds (JIT compile). For production mode (default after install), this should be <5 seconds.

```bash
# Tail the log
tail -f dev-server.log

# Check if the process is actually running
# macOS / Linux
ps aux | grep node
# Windows
Get-Process node
```

### Daily startup is slow

If your launcher is using `pnpm dev` instead of `pnpm start:daily`, fix it:

```bash
# Rebuild for production
pnpm build

# The launcher auto-detects .next/BUILD_ID and uses production mode
./seo.sh         # macOS / Linux
seo.cmd          # Windows
```

Or manually: `PORT=3000 pnpm start:daily`.

### "Address already in use" on restart

The previous server didn't release the port. Find and kill it:

```bash
# macOS / Linux
lsof -ti :3000 | xargs kill -9

# Windows PowerShell
Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Or use the in-app shutdown button
# Settings → System health → Shutdown server
```

### Browser doesn't auto-open after install

This is platform-dependent and not critical. Just open <http://localhost:3000> manually.

---

## Browser & rank-checking issues

### Rank checks return "no result"

Two common causes:

1. **Google rate-limited your IP.** The headless browser fan-out at scale can trigger this. Solutions:
   - Set a paid SERP API key (Serper, DataForSEO) in Settings → API keys → BYO
   - Use a residential proxy: set `PLAYWRIGHT_PROXY=http://...` env
   - Spread checks across days (lower "rank check frequency" in Settings)
2. **Search results are personalized.** The headless browser uses a clean profile, so results may differ from your manual incognito check.

### "Playwright browser not found"

```bash
pnpm exec playwright install chromium
```

If you're in Docker, this is already baked in — but if the volume cache got cleared:

```bash
docker compose exec seo pnpm exec playwright install chromium
```

### High memory usage during SERP scanning

The browser pool can consume 400-800 MB. To reduce:

- Settings → System health → Browser → enable "Lean mode" toggles:
  - Disable rank checking (use PSI API only)
  - Disable local CWV (use PageSpeed Insights API instead — free, 25k/day)
  - Disable SERP scanning
  - Disable GBP scraper
- Or connect to a remote browser: Settings → Browser → "Remote WebSocket endpoint" → paste a Browserless or Cloudflare Browser Rendering URL

---

## Database issues

### "database is locked"

SQLite WAL mode handles concurrency, but sometimes a stale process holds a lock.

```bash
# Stop the server first
# Then check for lingering processes
# macOS / Linux
ps aux | grep node

# Remove stale lock files (only when server is stopped!)
rm data.db-shm data.db-wal
```

`data.db` itself is never deleted — the `-shm` and `-wal` files are SQLite's journal and can be safely regenerated.

### "no such column" after a code update

A new migration didn't run. Apply manually:

```bash
node scripts/migrate.cjs
```

If a migration is genuinely broken: open an issue with the error. Don't `git checkout HEAD~1 data.db` — that won't undo a schema change.

### Backup or restore fails

- Backup endpoint requires `APP_PASSWORD` if you're not on localhost
- Restore expects a `.db` file ≥ 1 KB — anything smaller is rejected
- Always backup before restoring (`Settings → Backup & restore → Download backup`)

### Migrating to a new machine

```bash
# Stop server on old machine
# Copy these from the install folder:
#   data.db
#   .seo-encryption-key
#   .env.local  (if customized)
# Paste into install folder on new machine
# Start server
```

For Docker:

```bash
# On old machine
docker run --rm -v seo-data:/data -v $PWD:/host alpine \
  tar czf /host/seo-backup.tar.gz -C /data .

# On new machine
docker volume create seo-data
docker run --rm -v seo-data:/data -v $PWD:/host alpine \
  tar xzf /host/seo-backup.tar.gz -C /data
```

---

## AI provider issues

### "AI provider not configured"

Settings → AI → pick one:

- **Ollama (free, local, private):** Install [ollama.com](https://ollama.com/), run `ollama serve`, then `ollama pull llama3.2`. The tool auto-detects it at `http://localhost:11434`.
- **Gemini (free tier):** [aistudio.google.com](https://aistudio.google.com/apikey) → create key → paste in Settings.
- **Groq (free tier):** [console.groq.com/keys](https://console.groq.com/keys) → paste.
- **OpenRouter (free tier on some models):** [openrouter.ai/keys](https://openrouter.ai/keys) → paste.
- **OpenAI / Anthropic (paid):** Their dashboards → API key → paste.

### "Rate limit exceeded"

The tool has a global concurrency limit (2 in-flight by default). If you're hitting provider rate limits anyway, your account is at its own provider limit. Options:

1. Lower `AI_MAX_CONCURRENCY` env var to 1
2. Switch to a higher-tier provider account
3. Use Ollama locally (no provider rate limits)

### Ollama is installed but not detected

```bash
# Verify Ollama is running
curl http://localhost:11434/api/version

# Pull at least one model
ollama pull llama3.2
ollama list  # confirm

# In .env.local, you can pin the URL
OLLAMA_URL=http://localhost:11434
```

---

## Google integration issues

### Google OAuth "redirect URI mismatch"

When setting up your own Google Cloud OAuth credentials, the redirect URI must exactly match what the tool sends.

Add this to your OAuth client's Authorized redirect URIs:

```
http://localhost:3000/api/auth/google/callback
```

If you're on a different port, swap `3000`. If you're remote-hosting, use your actual domain.

### "Insufficient permissions" on GSC / GA4

- GSC: the Google account must be verified as owner OR delegated user with "Owner" or "Full" permission on the property
- GA4: the account must have at least "Viewer" role on the GA4 property
- GBP: the account must be a verified owner or manager of the listing

### PageSpeed Insights "quota exceeded"

Free tier is 25,000 requests/day. If you've blown through that (heavy daily audits on many clients), get an API key:

1. [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) → create API key
2. Settings → API keys → BYO → PageSpeed Insights → paste

---

## WordPress plugin issues

See [`wordpress-plugin/readme.txt`](wordpress-plugin/readme.txt) for full installation steps.

### Plugin won't activate — "PHP version too low"

Plugin requires PHP 8.0+. Check via `WordPress admin → Tools → Site Health → Info → Server`. Upgrade through your host or `wp-cli`:

```bash
wp config get  # check current PHP
```

### "Connection key invalid" in SEO Tool

The plugin shows a fresh key under `Tools → SEO Tool Bridge`. Two common gotchas:

1. **Leading/trailing whitespace when pasting** — copy carefully or use the in-page "select on click" field
2. **You regenerated the key in WP but didn't update the SEO Tool side** — paste the new one in `Settings → CMS connections`

### Meta description not saving

If you have Yoast / Rank Math / AIOSEO active, the plugin writes to ALL three meta keys. If none of them is your active SEO plugin, the meta description is saved as standard post meta but your theme may not render it. Install one of those three SEO plugins — they're free.

### Schema markup not appearing in `<head>`

The plugin only injects schema on `is_singular()` pages (single posts/pages/CPTs). Confirm:

```bash
# Visit the post URL + view source
# Search for: <!-- SEO Tool: schema -->
```

If missing, check `Tools → SEO Tool Bridge → Recent changes` — the change should appear there. If not, the API call to set schema didn't succeed (check SEO Tool error log).

---

## Docker issues

### Build fails on Apple Silicon (M1/M2/M3)

```bash
DOCKER_DEFAULT_PLATFORM=linux/arm64 docker compose up -d --build
```

### Container exits immediately

```bash
docker compose logs seo
```

99% of the time this shows a clear error. Common ones:

- Permission issue with `/data` mount — `docker compose down -v` and try again
- Port conflict — `SEO_HOST_PORT=4000 docker compose up -d`
- Migration failure — check the logs for the specific SQL error

### Volume permissions on Linux host

If the container can't write to `/data`:

```bash
docker compose down
sudo chown -R 1000:1000 ./data  # if you've mounted to a host path
docker compose up -d
```

### "RUNNING_IN_DOCKER" warning in restart route

Already set in our `docker-compose.yml`. If you've customized compose: add `RUNNING_IN_DOCKER: "1"` to the environment block.

---

## Performance issues

### App feels slow

1. **Are you running `pnpm dev`?** Daily startup should use `pnpm start:daily` (production mode). 10x faster page loads.
2. **Headless browser is eating RAM** — see [Browser issues](#high-memory-usage-during-serp-scanning) above.
3. **Too many clients with daily checks?** The daily agent fans out per-client. Reduce frequency in Settings → Automation.
4. **SQLite getting big?** Run `VACUUM` once — Settings → System health → Maintenance.

### `/api/v1/*` routes are slow

Some endpoints aggregate across all keywords/clients. Pass `?limit=` to scope:

```
GET /api/v1/keywords?limit=100&clientId=42
```

### High disk usage

- `data.db` grows ~1 KB per ranking row. 5 clients × 100 keywords × 365 days ≈ 180 MB/year. Fine.
- `screenshots/` is the big one — 50-200 KB per SERP screenshot. Settings → Maintenance → Prune old screenshots.
- `dev-server.log` — capped at 10 MB by rotation. If yours is bigger, you're not on the latest version.

---

## Security & access issues

### Default localhost-only binding

The server binds to `127.0.0.1` by default — only the same machine can reach it. To expose on your LAN:

```bash
# REQUIRED first: set a password
echo 'APP_PASSWORD=your-secure-password' >> .env.local

# Then allow LAN binding
echo 'SEO_BIND_HOST=0.0.0.0' >> .env.local

# Restart
./seo.sh  # or seo.cmd
```

**Never expose to the public internet without `APP_PASSWORD` set.**

### "This action is restricted to local-machine requests"

You hit an admin endpoint (`/api/backup`, `/api/restart`, etc) from a non-local IP without `APP_PASSWORD`. Fix: set `APP_PASSWORD` and authenticate.

### Forgot the password

```bash
# Stop server
# Edit .env.local — remove or change APP_PASSWORD
# Restart
```

### Lost the encryption key

If `.seo-encryption-key` is gone, every encrypted API key + OAuth token in `data.db` becomes unreadable. You'll need to re-paste them in Settings. The tool warns + falls back gracefully — it won't crash.

**Always back up `.seo-encryption-key` alongside `data.db`.**

---

## Update / upgrade issues

### Update via installer

Just re-run the installer command. It's idempotent — your `data.db`, `.env.local`, `.seo-encryption-key` are preserved.

### Update via Git

```bash
cd ~/seo
git pull
pnpm install
node scripts/migrate.cjs
pnpm build
# Restart via ./seo.sh or seo.cmd
```

### Settings → "Check for updates" says "Not a git repo"

You installed via ZIP (no git history). To enable Git updates:

```bash
cd ~/seo
git init
git remote add origin https://github.com/IamRamgarhia/SEO-Tool.git
git fetch
git reset --hard origin/main  # WARNING: only if you haven't modified files locally
```

Or simpler: re-run the installer for upgrades.

### Migration fails after update

```bash
# Get the specific error
node scripts/migrate.cjs

# If it's "table already exists", a previous run partially applied
# The migration script auto-recovers — just retry
```

If genuinely broken: open an issue with the migration filename + error message.

---

## Where logs live

| Log | What's in it | Location |
|---|---|---|
| `dev-server.log` | Server stdout (Next.js + app logs) | Install folder |
| `dev-server.err.log` | Server stderr | Install folder (Windows) |
| In-app error log | Caught exceptions + API errors | Settings → Error log |
| Daily agent log | Per-job results | Settings → Automation → Logs |
| Docker logs | All container output | `docker compose logs -f` |

Tail the latest:

```bash
# macOS / Linux
tail -f ~/seo/dev-server.log

# Windows PowerShell
Get-Content $HOME\seo\dev-server.log -Wait -Tail 100
```

---

## How to file a useful bug report

When opening an issue at <https://github.com/IamRamgarhia/SEO-Tool/issues>, include:

1. **What you tried** — the exact command or click sequence
2. **What you expected**
3. **What actually happened** (screenshot or error message)
4. **System info** — OS, Node version, install method (Docker/native), browser
5. **Logs** — last 30 lines of `dev-server.log` or relevant error from Settings → Error log
6. **Reproducibility** — does it happen every time? Only with this client/keyword? After a specific action?

Half the issues filed are missing #4 or #5 — please include them. It saves a back-and-forth.

---

**Still stuck?** Email [Contact@dicecodes.com](mailto:Contact@dicecodes.com?subject=SEO%20Tool%20support) with the above info. Solo project, response time 24-48h.
