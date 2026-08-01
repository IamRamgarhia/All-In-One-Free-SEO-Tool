# Multi-stage Dockerfile — built on Playwright's official image so the
# Chromium + system deps for headless rank checking + SERP scanning + GBP
# scraping work out of the box.

# ---- deps stage: install only what npm needs to resolve ----
FROM mcr.microsoft.com/playwright:v1.56.0-noble AS deps
WORKDIR /app

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* .npmrc* ./
# --ignore-scripts bypasses pnpm 11+'s build-script gate (we run them
# manually via rebuild below). Same strategy as the native installer.
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
RUN pnpm build

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

RUN corepack enable && corepack prepare pnpm@latest --activate

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
