# SEO Tool

Self-hosted, AI-powered SEO platform for freelancers and small agencies.
Free-first — no paid API keys required to use core features.

- 100+ SEO tools (audits, rank tracking, content writer, schema generator, code generator, 314 backlink prospects across 50+ countries…)
- AI chat that can read your data + write code (WordPress plugins, .htaccess, Liquid, schema)
- Daily agent runs 17 automated jobs per client
- Local Ollama support — fully offline AI if you want it

---

## Install — pick one

### Easiest: one-line installer

Detects Docker (preferred) or falls back to native install. Idempotent — re-run anytime to upgrade.

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/IamRamgarhia/seo/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
iwr -useb https://raw.githubusercontent.com/IamRamgarhia/seo/main/install.ps1 | iex
```

The installer clones into `~/seo` (override with `SEO_INSTALL_DIR=/path`), starts the container, and tells you when the app is up. Then open <http://localhost:3000>.

---

### Option A: Docker manually

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS / Windows) or `docker compose` (Linux).

```bash
git clone https://github.com/IamRamgarhia/seo.git
cd seo
docker compose up -d
```

Open <http://localhost:3000>. The image bundles Chromium + Playwright; no extra setup.

To stop: `docker compose down`. To wipe data: `docker compose down -v`.

---

### Option B: Native install (faster on your machine)

**Prerequisites**
- Node.js 20+ — [nodejs.org](https://nodejs.org/) (LTS is fine)
- Git
- ~2 GB free disk for the Playwright Chromium browser

**On macOS / Linux:**
```bash
git clone https://github.com/IamRamgarhia/seo.git
cd seo
./scripts/setup.sh
pnpm dev
```

**On Windows (PowerShell):**
```powershell
git clone https://github.com/IamRamgarhia/seo.git
cd seo
./scripts/setup.ps1
pnpm dev
```

`setup` installs dependencies, downloads the Playwright Chromium binary, runs DB migrations, and creates a default `.env.local`.
Open <http://localhost:3000>.

---

### Option C: Manual (if the scripts don't fit your setup)

```bash
git clone https://github.com/IamRamgarhia/seo.git
cd seo

# Install dependencies (pnpm preferred — npm / yarn / bun all work)
pnpm install

# Download the headless Chromium browser used by rank/SERP tools
pnpm exec playwright install chromium

# Apply DB migrations (creates ./data.db on first run)
node scripts/migrate.cjs

# Copy the environment template
cp .env.example .env.local

# Start in dev mode
pnpm dev
```

Open <http://localhost:3000>.

---

## After install — first 5 minutes

1. **Add a client** at <http://localhost:3000/clients/new> — paste a domain and let the tool detect its tech stack + niche.
2. **Connect Google** (optional but recommended) under Settings → Integrations. See `.env.example` for one-time OAuth setup (~5 min in Google Cloud Console).
3. **Pick an AI provider** under Settings → AI:
   - **Local Ollama** — free, private, runs on your machine (install Ollama first, then it auto-connects).
   - **Anthropic / OpenAI / Groq / Gemini / OpenRouter** — paste an API key.
4. **Run your first audit** — click "Run audit" on any client.

That's it. The daily agent kicks in 24h later and runs 17 automated jobs on its own.

---

## Common setup issues

**better-sqlite3 fails to build**
You need a C++ toolchain. On macOS: `xcode-select --install`. On Windows: install the latest Node.js with the optional "tools for native modules" checked. On Linux: `apt install build-essential python3`.

**Playwright Chromium fails to download**
Run `pnpm exec playwright install chromium --with-deps`. On Linux you also need: `pnpm exec playwright install-deps`.

**Port 3000 already in use**
Set the port: `PORT=3001 pnpm dev`.

**"AI provider not configured"**
Settings → AI → pick one. Local Ollama needs the [Ollama runtime](https://ollama.com/) installed separately; once `ollama serve` is running the tool detects it automatically.

---

## Optional configuration (`.env.local`)

All optional. Defaults work for solo / local use.

```dotenv
# Where SQLite lives (default ./data.db)
SEO_DB_PATH=./data.db

# Set this to require a password to access the UI. Leave empty for no auth
# (recommended on localhost). Sample value below; pick your own.
APP_PASSWORD=

# Bake in Google OAuth so everyone using this instance gets one-click sign-in
# without their own Google Cloud project. See .env.example for setup steps.
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

# Optional: pre-set AI provider keys instead of using the in-app UI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
PERPLEXITY_API_KEY=
OPENROUTER_API_KEY=

# Optional: free PageSpeed Insights key (25k requests/day free)
PAGESPEED_API_KEY=

# Optional: point at a local Ollama for fully-offline AI
OLLAMA_URL=http://localhost:11434
```

---

## Hosting in production

- **Self-host on your own machine** — Docker Compose handles everything.
- **Hetzner Cloud** (~$28/mo, 16 GB RAM) — best price/performance for 100-1000 users.
- **Railway** (~$5/mo Hobby, ~$20+/mo Pro) — easiest managed deploy from GitHub.
- **Hostinger VPS** (~$5-15/mo) — cheapest if you're comfortable with manual ops.

See `docs/HOSTING.md` for detailed setup per provider.

---

## License

AGPL-3.0 — open-source, self-hostable. Same license as Plausible, PostHog.
You can fork it, deploy it, modify it. You can't take it closed-source.
