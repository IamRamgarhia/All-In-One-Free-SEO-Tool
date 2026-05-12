#!/usr/bin/env bash
# One-line installer for macOS / Linux. Run via:
#   curl -fsSL https://raw.githubusercontent.com/IamRamgarhia/SEO-Tool/main/install.sh | bash
#
# What it does:
#   1. Downloads the latest code as a ZIP (no git required)
#   2. Auto-detects a free local port (default 3000)
#   3. Uses Docker if present (recommended — handles everything)
#   4. Falls back to native Node install otherwise; prompts you to install
#      Node if it's missing
#   5. Waits for /api/v1/health to confirm the app is actually up
#   6. Opens the browser to http://localhost:<PORT>
#   7. Drops SEO-Tool-Welcome.txt on the user's Desktop
#
# Idempotent. Safe to re-run for upgrades — your data.db is preserved.

set -e

REPO_OWNER="IamRamgarhia"
REPO_NAME="SEO-Tool"
BRANCH="${SEO_BRANCH:-main}"
ZIP_URL="https://codeload.github.com/$REPO_OWNER/$REPO_NAME/zip/refs/heads/$BRANCH"
DIR="${SEO_INSTALL_DIR:-$HOME/seo}"
DEFAULT_PORT="${SEO_PORT:-3000}"
DESKTOP="$HOME/Desktop"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'
say()  { printf "${GREEN}→${NC} %s\n" "$*"; }
info() { printf "${BLUE}i${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$*"; }
die()  { printf "${RED}✗${NC} %s\n" "$*" >&2; exit 1; }

# ---- 0. preflight (only need curl/wget + unzip + tar) -----------------------
say "SEO Tool installer"
DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then
  DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then
  DOWNLOADER="wget"
else
  die "Need curl or wget. Install curl (most distros have it built-in)."
fi

if ! command -v unzip >/dev/null 2>&1; then
  warn "unzip not found. Trying tar fallback…"
  command -v tar >/dev/null 2>&1 || die "Need 'unzip' or 'tar'. On Debian/Ubuntu: sudo apt install unzip"
fi

# ---- 1. download + extract --------------------------------------------------
TMP_ZIP="$(mktemp -t seo-tool.XXXXXX.zip)"
TMP_EXTRACT="$(mktemp -d -t seo-tool-extract.XXXXXX)"
trap 'rm -rf "$TMP_ZIP" "$TMP_EXTRACT"' EXIT

say "Downloading the latest code (no git required)"
if [ "$DOWNLOADER" = "curl" ]; then
  curl -fsSL "$ZIP_URL" -o "$TMP_ZIP" || die "Download failed. Check your internet connection."
else
  wget -q "$ZIP_URL" -O "$TMP_ZIP" || die "Download failed."
fi

say "Extracting"
if command -v unzip >/dev/null 2>&1; then
  unzip -q "$TMP_ZIP" -d "$TMP_EXTRACT"
else
  # tar can read zip on macOS / modern Linux
  (cd "$TMP_EXTRACT" && tar -xf "$TMP_ZIP")
fi

EXTRACTED="$(find "$TMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d | head -1)"
[ -n "$EXTRACTED" ] || die "ZIP didn't contain expected folder"

# ---- 2. install / refresh ---------------------------------------------------
if [ -d "$DIR" ]; then
  say "Existing install at $DIR — refreshing in place (your data.db is preserved)"
  # Sync files but don't delete user data
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='data.db' --exclude='data.db-*' --exclude='.env.local' \
      --exclude='node_modules' --exclude='.next' "$EXTRACTED/" "$DIR/"
  else
    # cp -R fallback — leaves stale files but is fine for a normal upgrade
    (cd "$EXTRACTED" && cp -R . "$DIR/")
  fi
else
  say "Installing fresh into $DIR"
  mkdir -p "$(dirname "$DIR")"
  mv "$EXTRACTED" "$DIR"
fi
cd "$DIR"

# Make launcher executable (ZIP extraction may strip the +x bit)
[ -f "$DIR/seo.sh" ] && chmod +x "$DIR/seo.sh" 2>/dev/null || true

# ---- 3. find a free port ----------------------------------------------------
port_in_use() {
  local p="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -i :"$p" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -lnt "( sport = :$p )" 2>/dev/null | grep -q LISTEN
  elif command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -q "[\.:]$p .*LISTEN"
  else
    return 1
  fi
}

PORT="$DEFAULT_PORT"
if port_in_use "$PORT"; then
  warn "Port $PORT is occupied — finding a free one"
  for try in 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 8080 8081 4000 5000; do
    if ! port_in_use "$try"; then
      PORT="$try"
      break
    fi
  done
fi
say "Using port $PORT"

# ---- 4. Docker or native? ---------------------------------------------------
HAS_DOCKER=0
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  HAS_DOCKER=1
fi

UP=0

if [ "$HAS_DOCKER" = "1" ]; then
  say "Docker detected — using Docker install (handles Node, Chromium, all deps)"
  if ! docker compose version >/dev/null 2>&1; then
    die "Docker is installed but 'docker compose' (v2) is missing. Update Docker Desktop."
  fi

  export SEO_HOST_PORT="$PORT"
  say "Building image (first run: 3-5 min. Re-runs: seconds.)"
  docker compose up -d --build || die "Docker build failed. Run: cd $DIR && docker compose logs"

  say "Waiting for the app to come up…"
  for i in $(seq 1 60); do
    if curl -fsS -o /dev/null "http://localhost:$PORT/api/v1/health" 2>/dev/null; then
      UP=1
      break
    fi
    sleep 2
    printf "."
  done
  echo

  if [ "$UP" != "1" ]; then
    warn "App didn't respond after 2 minutes."
    warn "Check logs: cd $DIR && docker compose logs -f"
  else
    say "App is up at http://localhost:$PORT"
  fi
else
  warn "Docker not detected. Native install path."
  info "Docker Desktop is the easiest setup → https://www.docker.com/products/docker-desktop/"
  echo

  # Check Node
  if ! command -v node >/dev/null 2>&1; then
    cat <<EOM
${RED}Node.js is required for the native install.${NC}

Quickest options:
  macOS:  brew install node      (if you have Homebrew)
          OR download from https://nodejs.org/
  Linux:  Use your package manager:
            Ubuntu/Debian:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
            Fedora/RHEL:    sudo dnf install nodejs
            Arch:           sudo pacman -S nodejs npm

Then re-run this installer.
EOM
    exit 1
  fi

  NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)
  if [ "$NODE_MAJOR" -lt 20 ]; then
    die "Node $NODE_MAJOR detected. Need Node 20+. Upgrade at https://nodejs.org/"
  fi
  say "Node $(node -v) ✓"

  # Package manager — prefer pnpm via corepack
  if command -v pnpm >/dev/null 2>&1; then
    PM="pnpm"
  elif command -v corepack >/dev/null 2>&1; then
    say "Enabling pnpm via corepack"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true
    if command -v pnpm >/dev/null 2>&1; then
      PM="pnpm"
    else
      PM="npm"
    fi
  else
    PM="npm"
  fi
  say "Using $PM"

  say "Installing dependencies (1-3 minutes the first time)"
  $PM install

  say "Downloading Playwright Chromium (~170 MB, one-time)"
  $PM exec playwright install chromium || warn "Playwright install failed; rank-checking tools may not work"
  if [ "$(uname -s)" = "Linux" ]; then
    $PM exec playwright install-deps chromium >/dev/null 2>&1 || warn "Couldn't auto-install Chromium system deps. If rank checks fail: apt install libnss3 libgbm1 libasound2"
  fi

  say "Applying database migrations"
  node scripts/migrate.cjs

  [ -f ".env.local" ] || cp .env.example .env.local 2>/dev/null || true

  # Build once now so daily startup runs in production mode — ~10x
  # faster page loads and roughly half the RAM of `next dev`.
  say "Building production bundle (one-time, ~1-2 min). Skips JIT compile on every navigation."
  BUILD_OK=1
  if ! $PM run build; then
    warn "Production build failed — falling back to dev mode for daily startup."
    warn "You can retry later with: $PM run build"
    BUILD_OK=0
  fi

  # Kill any prior server we started (idempotent re-run)
  if [ -f "$DIR/.dev-server.pid" ]; then
    OLD_PID="$(cat "$DIR/.dev-server.pid" 2>/dev/null || true)"
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
  fi
  # Free the port if anyone else is sitting on it
  if command -v lsof >/dev/null 2>&1; then
    PORT_PID="$(lsof -ti :$PORT -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$PORT_PID" ]; then
      warn "Port $PORT was held by PID $PORT_PID — stopping it"
      kill "$PORT_PID" 2>/dev/null || true
      sleep 1
    fi
  fi

  say "Starting server on port $PORT (background)"
  : >"$DIR/dev-server.log"   # truncate previous log so we don't read stale lines
  if [ "$BUILD_OK" = "1" ]; then
    RUN_SCRIPT="start:daily"
    WAIT_LABEL="(production start, ~2-5s)"
  else
    RUN_SCRIPT="dev"
    WAIT_LABEL="(30-90s for first dev build)"
  fi
  PORT="$PORT" nohup $PM run "$RUN_SCRIPT" >"$DIR/dev-server.log" 2>&1 &
  echo "$!" >"$DIR/.dev-server.pid"

  say "Waiting for the app to come up… $WAIT_LABEL"
  for i in $(seq 1 90); do
    if curl -fsS -o /dev/null "http://localhost:$PORT/api/v1/health" 2>/dev/null; then
      UP=1
      break
    fi
    sleep 2
    printf "."
  done
  echo
  if [ "$UP" != "1" ]; then
    warn "App didn't respond on health check."
    if [ -s "$DIR/dev-server.log" ]; then
      echo
      printf "${YELLOW}Last 30 lines of dev-server.log:${NC}\n"
      tail -n 30 "$DIR/dev-server.log" | sed 's/^/  /'
      echo
    else
      warn "Log is empty — server didn't even start. Run manually:"
      warn "  cd $DIR && $PM run dev"
    fi
  else
    say "App is up at http://localhost:$PORT"
  fi
fi

# ---- 5. Desktop shortcuts (Linux: .desktop; macOS: .command alias) ---------
if [ -d "$DESKTOP" ] && [ "$HAS_DOCKER" != "1" ]; then
  # Make sure both scripts are executable (ZIP extraction can strip +x)
  chmod +x "$DIR/START.sh" "$DIR/STOP.sh" 2>/dev/null || true

  OS="$(uname -s)"
  if [ "$OS" = "Linux" ]; then
    START_SHORTCUT="$DESKTOP/Start-SEO-Tool.desktop"
    cat > "$START_SHORTCUT" <<EOF
[Desktop Entry]
Type=Application
Name=Start SEO Tool
Comment=Start the self-hosted SEO platform by DiceCodes
Exec=$DIR/START.sh
Path=$DIR
Terminal=false
Categories=Network;Office;
EOF
    chmod +x "$START_SHORTCUT" 2>/dev/null || true
    say "Created shortcut: $START_SHORTCUT"

    STOP_SHORTCUT="$DESKTOP/Stop-SEO-Tool.desktop"
    cat > "$STOP_SHORTCUT" <<EOF
[Desktop Entry]
Type=Application
Name=Stop SEO Tool
Comment=Stop the running SEO Tool server
Exec=$DIR/STOP.sh
Path=$DIR
Terminal=true
Categories=Network;Office;
EOF
    chmod +x "$STOP_SHORTCUT" 2>/dev/null || true
    say "Created shortcut: $STOP_SHORTCUT"

    # Clean up the old single shortcut from previous installs
    [ -f "$DESKTOP/SEO-Tool.desktop" ] && rm -f "$DESKTOP/SEO-Tool.desktop"
  elif [ "$OS" = "Darwin" ]; then
    START_SHORTCUT="$DESKTOP/Start SEO Tool.command"
    cat > "$START_SHORTCUT" <<EOF
#!/bin/bash
cd "$DIR" && ./START.sh
EOF
    chmod +x "$START_SHORTCUT" 2>/dev/null || true
    say "Created launcher: $START_SHORTCUT"

    STOP_SHORTCUT="$DESKTOP/Stop SEO Tool.command"
    cat > "$STOP_SHORTCUT" <<EOF
#!/bin/bash
cd "$DIR" && ./STOP.sh
read -p "Press Enter to close..."
EOF
    chmod +x "$STOP_SHORTCUT" 2>/dev/null || true
    say "Created launcher: $STOP_SHORTCUT"

    # Clean up the old single launcher from previous installs
    [ -f "$DESKTOP/SEO Tool.command" ] && rm -f "$DESKTOP/SEO Tool.command"
  fi
fi

# ---- 6. comprehensive desktop welcome file ---------------------------------
WELCOME="$DESKTOP/SEO-Tool-Welcome.txt"
if [ -d "$DESKTOP" ]; then
  {
    echo "======================================================"
    echo "   SEO TOOL — INSTALLED SUCCESSFULLY"
    echo "   Built by DiceCodes (https://dicecodes.com)"
    echo "======================================================"
    echo ""
    echo "Open the app:        http://localhost:$PORT"
    echo "Install location:    $DIR"
    echo ""
    echo "You can find this guide on your Desktop any time."
    echo ""
    echo "----------------------- FIRST 5 MIN ------------------"
    echo "1. Open http://localhost:$PORT"
    echo "2. Add a client at /clients/new (paste any domain — it'll"
    echo "   auto-detect the tech stack and niche)"
    echo "3. Pick an AI provider at /settings:"
    echo "     - Local Ollama (free, private, fully offline)  OR"
    echo "     - Gemini / Groq / OpenRouter / DeepSeek (free tiers, paste key)  OR"
    echo "     - OpenAI / Anthropic (paid, BYO key)"
    echo "4. Run your first audit"
    echo "5. Tomorrow: the daily AI agent kicks in automatically and runs ~17"
    echo "   automated jobs per client (rank checks, audit deltas, content"
    echo "   decay, backlink scans, GBP monitoring, alerts)."
    echo ""
    echo "----------------------- WHERE EVERYTHING LIVES -------"
    if [ "$HAS_DOCKER" = "1" ]; then
      echo "$DIR/"
      echo "  docker-compose.yml          <- service definition"
      echo "  Dockerfile                  <- image build"
      echo "  data.db                     <- (lives in /data on the seo-data volume)"
    else
      echo "$DIR/"
      echo "  START.sh                    <- DOUBLE-CLICK to start the server (your daily-use file)"
      echo "  STOP.sh                     <- DOUBLE-CLICK to stop the server"
      echo "  data.db                     <- your SQLite database (clients, keywords, audits - back this up)"
      echo "  .seo-encryption-key         <- AES key that decrypts your API keys (back this up too)"
      echo "  .env.local                  <- env config (APP_PASSWORD, custom env vars)"
      echo "  dev-server.log              <- runtime log (tail this for errors)"
      echo "  .dev-server.pid             <- PID of the running server"
      echo "  screenshots/                <- SERP screenshots from rank checks"
      echo "  README.md                   <- full feature list + install + license"
      echo "  TROUBLESHOOTING.md          <- 12-section support doc"
      echo "  docs/HOSTING.md             <- production hosting guides"
      echo "  ROADMAP.md                  <- what's coming next"
      echo "  wordpress-plugin/           <- companion WordPress plugin"
    fi
    echo ""
    echo "----------------------- CONTROLS ---------------------"
    if [ "$HAS_DOCKER" = "1" ]; then
      echo "Start:    cd $DIR && SEO_HOST_PORT=$PORT docker compose up -d"
      echo "Stop:     cd $DIR && docker compose down"
      echo "Restart:  cd $DIR && docker compose restart"
      echo "Logs:     cd $DIR && docker compose logs -f"
      echo "Status:   cd $DIR && docker compose ps"
      echo "Update:   Re-run the installer command"
      echo "Backup:   Settings -> Backup & restore -> Download backup"
    else
      echo "Start:    Double-click 'Start SEO Tool' shortcut on your Desktop"
      echo "          (or run: $DIR/START.sh)"
      echo "Stop:     Double-click 'Stop SEO Tool' shortcut on your Desktop"
      echo "          (or run: $DIR/STOP.sh)"
      echo "          (or in app: profile menu -> System health -> Shutdown)"
      echo "Restart:  In the app -> profile menu -> Restart server"
      echo "Logs:     tail -f $DIR/dev-server.log"
      echo "Update:   Re-run the installer command"
      echo "Backup:   Settings -> Backup & restore -> Download backup"
    fi
    echo ""
    echo "----------------------- TROUBLESHOOT -----------------"
    echo "Blank page?       Server still building — wait 30-60s and refresh."
    echo "Port conflict?    Installer auto-tries 3001-3010, 8080-81, 4000, 5000."
    echo "                  Force a port: SEO_PORT=4000 before re-running."
    echo "Want a password?  Set APP_PASSWORD=yourpassword in $DIR/.env.local then restart."
    echo "LAN access?       Default binds to 127.0.0.1 only. To expose on your LAN,"
    echo "                  set APP_PASSWORD (required) AND SEO_BIND_HOST=0.0.0.0"
    echo "                  in $DIR/.env.local, then restart."
    echo "Forgot password?  Edit $DIR/.env.local, remove APP_PASSWORD line, restart."
    echo "Full guide:       $DIR/TROUBLESHOOTING.md (12 sections, covers most issues)"
    echo ""
    echo "----------------------- DAILY USE --------------------"
    echo "The fastest way to launch every day:"
    if [ "$HAS_DOCKER" = "1" ]; then
      echo "   docker compose up -d in $DIR"
    else
      echo "   Double-click the 'Start SEO Tool' shortcut on your Desktop."
      echo "   When you're done, double-click 'Stop SEO Tool' to shut it down."
    fi
    echo ""
    echo "Your data NEVER leaves this machine. No telemetry. No phone-home."
    echo "The only outbound network calls are:"
    echo "   - Google's free APIs (GSC, GA4, PageSpeed) — only when you connect them"
    echo "   - Your chosen AI provider (only when you run AI features)"
    echo "   - SERP scraping via headless browser (only when checking rankings)"
    echo ""
    echo "----------------------- HELP -------------------------"
    echo "Repo + issues:    https://github.com/IamRamgarhia/SEO-Tool"
    echo "Troubleshooting:  $DIR/TROUBLESHOOTING.md"
    echo "Hosting guides:   $DIR/docs/HOSTING.md"
    echo "README:           $DIR/README.md"
    echo "Email support:    Contact@dicecodes.com"
    echo ""
    echo "----------------------- SUPPORT THIS PROJECT ---------"
    echo "This tool is free. If it saves you the cost of an Ahrefs or"
    echo "Semrush subscription, the cheapest way to say thanks:"
    echo "   - Star the repo: https://github.com/IamRamgarhia/SEO-Tool"
    echo "   - UPI (India): princeramgarhiaa-1@okaxis"
    echo "     (Open the app -> Support button -> QR code with presets)"
    echo "   - PayPal: https://www.paypal.com/donate/?business=princeramgarhiaa@gmail.com"
    echo ""
    echo "======================================================"
  } > "$WELCOME"
  say "Created Desktop guide: $WELCOME"
fi

# ---- 6. auto-open browser ---------------------------------------------------
URL="http://localhost:$PORT"
if [ "$UP" = "1" ]; then
  say "Opening browser"
  if command -v open >/dev/null 2>&1; then
    open "$URL" 2>/dev/null || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" 2>/dev/null || true
  fi
fi

echo
printf "${GREEN}✓ SEO Tool ready.${NC}\n\n"
echo "Open:    $URL"
[ -f "$WELCOME" ] && echo "Guide:   $WELCOME"
echo
