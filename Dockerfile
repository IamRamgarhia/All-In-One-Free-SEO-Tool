# Multi-stage Dockerfile — built on Playwright's official image so the
# Chromium + system deps for headless rank checking + SERP scanning + GBP
# scraping work out of the box.

# ---- deps stage: install only what npm needs to resolve ----
FROM mcr.microsoft.com/playwright:v1.56.0-noble AS deps
WORKDIR /app

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false

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
# Default DB path lives on a mounted volume (see docker-compose.yml)
ENV SEO_DB_PATH=/data/data.db

RUN corepack enable && corepack prepare pnpm@10 --activate

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

# Apply pending migrations on start, then boot
CMD ["sh", "-c", "node scripts/migrate.cjs 2>/dev/null || true; node server.js"]
