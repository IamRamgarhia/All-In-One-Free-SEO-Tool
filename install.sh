#!/usr/bin/env bash
# One-line installer. Run via:
#   curl -fsSL https://raw.githubusercontent.com/IamRamgarhia/seo/main/install.sh | bash
#
# Detects Docker. If Docker is present → clones + `docker compose up -d`.
# If Docker is missing → falls back to native Node install via scripts/setup.sh.
#
# Idempotent. Safe to re-run for upgrades.

set -e

REPO="https://github.com/IamRamgarhia/seo.git"
DIR="${SEO_INSTALL_DIR:-$HOME/seo}"
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

say()  { printf "${GREEN}→${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$*"; }
die()  { printf "${RED}✗${NC} %s\n" "$*" >&2; exit 1; }

# ---- preflight ---------------------------------------------------------------
say "SEO Tool installer"
command -v git >/dev/null 2>&1 || die "git not found. Install git from https://git-scm.com/downloads"

# ---- clone or pull -----------------------------------------------------------
if [ -d "$DIR/.git" ]; then
  say "Existing install at $DIR — pulling latest"
  git -C "$DIR" pull --ff-only || warn "git pull failed; continuing with current checkout"
else
  say "Cloning into $DIR"
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

# ---- pick install method ----------------------------------------------------
HAS_DOCKER=0
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  HAS_DOCKER=1
fi

if [ "$HAS_DOCKER" = "1" ]; then
  say "Docker detected — using Docker install path"
  if ! docker compose version >/dev/null 2>&1; then
    die "Docker is installed but 'docker compose' (v2) is not. Update Docker Desktop."
  fi
  say "Building + starting container (first run takes ~3-5 minutes)"
  docker compose up -d --build
  say "Waiting for the app to come up…"
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if curl -fsS -o /dev/null http://localhost:3000/api/v1/health 2>/dev/null; then
      break
    fi
    sleep 2
  done
  echo
  printf "${GREEN}✓ SEO Tool is running.${NC}\n\n"
  echo "Open:    http://localhost:3000"
  echo "Stop:    cd $DIR && docker compose down"
  echo "Update:  cd $DIR && git pull && docker compose up -d --build"
  echo "Logs:    cd $DIR && docker compose logs -f"
else
  warn "Docker not detected — falling back to native install"
  warn "Install Docker for the easiest setup: https://www.docker.com/products/docker-desktop/"
  echo
  bash "$DIR/scripts/setup.sh"
  echo
  printf "${GREEN}✓ Setup complete.${NC}\n\n"
  echo "Start the dev server:"
  echo "  cd $DIR && pnpm dev   # or: npm run dev"
  echo
  echo "Then open http://localhost:3000"
fi
