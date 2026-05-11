#!/usr/bin/env bash
# Native-install bootstrap. Run from the repo root.
#   ./scripts/setup.sh
#
# What this does:
#   1. Pick a package manager (pnpm > npm)
#   2. Install Node dependencies
#   3. Download the Playwright Chromium binary
#   4. Apply DB migrations (creates ./data.db on first run)
#   5. Create .env.local from the template if it doesn't exist
#
# Safe to re-run — each step skips itself when already done.

set -euo pipefail

# ---- pretty print -----------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'
say()  { printf "${GREEN}→${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$*"; }
die()  { printf "${RED}✗${NC} %s\n" "$*" >&2; exit 1; }

# ---- 0. preflight -----------------------------------------------------------
say "Checking prerequisites"
command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 20+ from https://nodejs.org"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node $NODE_MAJOR detected — this project needs Node 20+. Upgrade at https://nodejs.org"
fi
say "Node $(node -v) ✓"

# ---- 1. pick package manager -----------------------------------------------
if command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
elif command -v npm >/dev/null 2>&1; then
  warn "pnpm not found — falling back to npm (slower install). Install pnpm with: npm i -g pnpm"
  PM="npm"
else
  die "No package manager found. Install Node from https://nodejs.org (ships with npm)"
fi
say "Using $PM"

# ---- 2. install dependencies ------------------------------------------------
if [ ! -d "node_modules" ]; then
  say "Installing dependencies (this takes 1-3 minutes the first time)"
  $PM install
else
  say "Dependencies already installed (skipping). Delete node_modules to force reinstall."
fi

# ---- 3. Playwright Chromium -------------------------------------------------
CHROMIUM_DIR="$HOME/.cache/ms-playwright"
if [ ! -d "$CHROMIUM_DIR" ] || [ -z "$(ls -A "$CHROMIUM_DIR" 2>/dev/null)" ]; then
  say "Downloading Playwright Chromium (~170 MB, one-time)"
  $PM exec playwright install chromium
  # Linux additionally needs system deps for Chromium to launch
  if [ "$(uname -s)" = "Linux" ]; then
    say "Installing Chromium system deps (may prompt for sudo)"
    $PM exec playwright install-deps chromium || warn "playwright install-deps failed — install libnss3, libgbm1, libasound2 manually if rank checks fail"
  fi
else
  say "Playwright Chromium already installed (skipping)"
fi

# ---- 4. migrations ----------------------------------------------------------
say "Applying database migrations"
node scripts/migrate.cjs

# ---- 5. .env.local ---------------------------------------------------------
if [ ! -f ".env.local" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env.local
    say "Created .env.local from .env.example"
  else
    touch .env.local
    say "Created empty .env.local"
  fi
else
  say ".env.local already exists (skipping)"
fi

# ---- done -------------------------------------------------------------------
echo
printf "${GREEN}✓ Setup complete.${NC}\n\n"
echo "Start the dev server:"
echo "  $PM dev"
echo
echo "Then open http://localhost:3000"
echo
echo "Optional next steps:"
echo "  • Edit .env.local to set Google OAuth or AI provider keys"
echo "  • Add a client at http://localhost:3000/clients/new"
echo "  • Pick an AI provider at http://localhost:3000/settings"
