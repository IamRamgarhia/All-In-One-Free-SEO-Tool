# Multi-stage Dockerfile — built on Playwright's official image so the
# Chromium + system deps for headless rank checking + SERP scanning + GBP
# scraping work out of the box.

# ---- deps stage: install only what npm needs to resolve ----
FROM mcr.microsoft.com/playwright:v1.56.0-noble AS deps
WORKDIR /app

# pnpm via corepack.
#
# NOT `pnpm@latest`. That floated the Docker build onto whatever pnpm
# shipped most recently — which is how a build that worked locally on
# pnpm 10 failed in Docker on pnpm 11, with a lockfile written by
# neither. `corepack enable` alone honours the `packageManager` field in
# package.json, so the image uses exactly the pnpm the lockfile was
# resolved with.
# COREPACK_ENABLE_DOWNLOAD_PROMPT=0 — corepack otherwise asks for
# confirmation before fetching a pnpm version it hasn't cached, which
# hangs a non-interactive Docker build until it times out.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# pnpm-workspace.yaml MUST be here. pnpm 11 stopped reading
# `pnpm.onlyBuiltDependencies` from package.json and reads it from this
# file instead; without it, pnpm treats better-sqlite3, sharp,
# tesseract.js and esbuild as unapproved and aborts with
# ERR_PNPM_IGNORED_BUILDS. Omitting it here meant the allowlist existed
# in the repo but never reached the stage that needed it.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./

# --ignore-scripts bypasses the build-script gate here; `pnpm rebuild`
# then runs them deliberately. Same strategy as the native installer.
RUN pnpm install --frozen-lockfile=false --ignore-scripts \
 && pnpm rebuild

# ---- build stage: TypeScript + Next.js production build ----
FROM deps AS build
WORKDIR /app

COPY . .

# Drizzle generates migrations from schema.ts; bake the latest into the image
RUN pnpm db:generate || true

# Standalone output — much smaller runtime image
ENV NEXT_TELEMETRY_DISABLED=1

# verify-deps-before-run=false is load-bearing, not tidiness.
#
# Running any pnpm script makes pnpm 10+ first check whether node_modules
# matches the lockfile and silently run `pnpm install` if it thinks not.
# The `COPY . .` above changes the build context, so that check fires —
# and the install it triggers does NOT inherit the --ignore-scripts from
# the deps stage. That implicit install is what actually failed the
# build, several layers away from anything that mentions installing.
#
# Dependencies are already installed and rebuilt in the deps stage, so
# there is nothing for that check to usefully do here.
RUN pnpm config set verify-deps-before-run false && pnpm build

# ---- runtime stage ----
FROM mcr.microsoft.com/playwright:v1.56.0-noble AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# All user state lives on a mounted volume (see docker-compose.yml):
# data.db, .seo-encryption-key, .seo-port, screenshots/. One volume,
# one backup target — survives `docker compose down` + rebuilds.
ENV SEO_DATA_DIR=/data
ENV SEO_DB_PATH=/data/data.db
# Lets /api/restart and /api/shutdown show Docker-specific guidance
# ("use `docker compose restart`") instead of trying to run seo.sh.
ENV RUNNING_IN_DOCKER=1
# Inside the container we must bind to all interfaces so the host
# port mapping works. The container is the security boundary; users
# expose 3000 to the host as they choose in docker-compose.yml.
ENV HOSTNAME=0.0.0.0

# Same pinning as the deps stage — see the note there. The runtime image
# barely uses pnpm (the CMD calls node directly), but leaving `@latest`
# here would still download an arbitrary pnpm into every image build.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Non-root user (Playwright image already provides 'pwuser')
USER pwuser

COPY --from=build --chown=pwuser:pwuser /app/.next/standalone ./
COPY --from=build --chown=pwuser:pwuser /app/.next/static ./.next/static
COPY --from=build --chown=pwuser:pwuser /app/public ./public
COPY --from=build --chown=pwuser:pwuser /app/src/db/migrations ./src/db/migrations
COPY --from=build --chown=pwuser:pwuser /app/scripts ./scripts
COPY --from=build --chown=pwuser:pwuser /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build --chown=pwuser:pwuser /app/package.json ./package.json

EXPOSE 3000

# Refuse to boot exposed-and-unauthenticated.
#
# The container listens on 0.0.0.0 by design — Docker's port mapping is
# what decides real exposure. But that means the ONLY thing standing
# between a published port and an open instance is APP_PASSWORD, and a
# user who edits the compose port mapping to reach the app from another
# machine has no reason to know that. Failing loudly here is the last
# point where we can tell them, and it costs nothing when the default
# loopback mapping is used with a password set.
#
# Then apply pending migrations and boot. Fail fast on migration error —
# silently continuing produces a running server that 500s on every
# DB-touching request with no obvious clue why. Better to fail the
# container start and surface the real SQL error in `docker logs`.
# (migrate.cjs already exits 0 when no migrations directory exists, so
# the fresh-volume case is fine.)
CMD ["sh", "-c", "\
if [ -z \"$APP_PASSWORD\" ] && [ \"$SEO_ALLOW_NO_PASSWORD\" != \"1\" ]; then \
  echo '' >&2; \
  echo 'REFUSING TO START: APP_PASSWORD is not set.' >&2; \
  echo '' >&2; \
  echo 'This container has no other authentication. If its port is' >&2; \
  echo 'reachable from anywhere but this machine, every client record,' >&2; \
  echo 'saved API key and admin action is open to whoever finds it.' >&2; \
  echo '' >&2; \
  echo 'Fix (pick one):' >&2; \
  echo '  1. Set APP_PASSWORD in your .env or compose file  <- do this' >&2; \
  echo '  2. Local-only, accept the risk: SEO_ALLOW_NO_PASSWORD=1' >&2; \
  echo '' >&2; \
  exit 1; \
fi; \
node scripts/migrate.cjs && node server.js"]
