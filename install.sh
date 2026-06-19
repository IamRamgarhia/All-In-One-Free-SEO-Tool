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

# ---- LOGGING -----------------------------------------------------------------
# Capture all install output to a log file the user can send for support.
# The temp log is created BEFORE the install dir exists; we copy it to
# $DIR/install.log + Desktop at the end.
LOG="$(mktemp -t seo-tool-install.XXXXXX.log)"
DESKTOP_LOG="$HOME/Desktop/SEO-Tool-install.log"

# Redirect ALL stdout + stderr through `tee -a "$LOG"` so the user sees
# output live AND it's saved to the log file.
exec > >(tee -a "$LOG") 2>&1

# On any exit (success OR failure), copy the log to discoverable locations
# and pause so the user can read the result before the terminal closes.
on_exit() {
  local rc="${1:-$?}"
  # Clean up any temp files created during download/extract. Empty if
  # we exit before they're set.
  [ -n "${TMP_ZIP:-}" ] && rm -rf "$TMP_ZIP" 2>/dev/null
  [ -n "${TMP_EXTRACT:-}" ] && rm -rf "$TMP_EXTRACT" 2>/dev/null
  if [ -d "$DIR" ]; then cp "$LOG" "$DIR/install.log" 2>/dev/null || true; fi
  if [ -d "$DESKTOP" ]; then cp "$LOG" "$DESKTOP_LOG" 2>/dev/null || true; fi
  echo ""
  if [ "$rc" -ne 0 ]; then
    echo "============================================================"
    echo "  INSTALL FAILED (exit code $rc)"
    echo "============================================================"
    echo ""
    echo "  Log saved to: $LOG"
    [ -d "$DESKTOP" ] && echo "  Also at:      $DESKTOP_LOG  (copy on your Desktop)"
    echo ""
    echo "  To get help, email this log to: Contact@dicecodes.com"
    echo "  Or open an issue with the log attached:"
    echo "    https://github.com/IamRamgarhia/SEO-Tool/issues"
  else
    echo "============================================================"
    echo "  INSTALL FINISHED"
    echo "============================================================"
    echo ""
    echo "  Log saved to:  $LOG"
    [ -d "$DESKTOP" ] && echo "  Also copied to: $DESKTOP_LOG"
  fi
  echo ""
  # Pause if we have a TTY (skip for CI / piped runs)
  if [ -t 0 ]; then
    read -p "Press Enter to close..." _ 2>/dev/null || true
  fi
}
trap on_exit EXIT

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
# NOTE: temp files are cleaned up by on_exit() above. We do NOT re-trap EXIT
# here — that would clobber on_exit and silence the "INSTALL FAILED" banner
# / log copy / Press-Enter pause that on_exit provides on every exit path.

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
# Port strategy (see scripts/pick-port.cjs for the canonical impl):
#   1. If .seo-port already exists, honor it so bookmarks survive upgrades.
#   2. If SEO_PORT is set, honor that.
#   3. Otherwise derive a stable port in IANA's ephemeral range (49152-65535)
#      from a hash of the install path. Different installs get different
#      ports automatically; never collides with well-known dev defaults
#      (3000/5173/8000/8080 etc.).
#   4. Probe upward if the chosen port is busy.

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

# Stable port derived from the install path. Same math as pick-port.cjs:
# sha256(installPath) -> first 4 bytes as uint32 -> 49152 + (n % 16383).
preferred_port_for_path() {
  local p="$1"
  # Prefer shasum (macOS) or sha256sum (Linux). Both available by default.
  local hex
  if command -v shasum >/dev/null 2>&1; then
    hex=$(printf %s "$p" | shasum -a 256 | awk '{print $1}')
  elif command -v sha256sum >/dev/null 2>&1; then
    hex=$(printf %s "$p" | sha256sum | awk '{print $1}')
  else
    echo "49152"  # fallback to the min of the range; probing will move it
    return
  fi
  # First 8 hex chars = 32 bits, big-endian. Take modulo 16383 + 49152.
  local n=$((16#${hex:0:8}))
  echo $(( 49152 + (n % 16383) ))
}

PORT=""
EXISTING_PORT_FILE="$DIR/.seo-port"
if [ -f "$EXISTING_PORT_FILE" ]; then
  CAND="$(cat "$EXISTING_PORT_FILE" 2>/dev/null | tr -d '[:space:]')"
  if [[ "$CAND" =~ ^[0-9]+$ ]] && [ "$CAND" -ge 1 ] && [ "$CAND" -le 65535 ]; then
    PORT="$CAND"
    info "Using existing port from .seo-port: $PORT"
  fi
fi

if [ -z "$PORT" ]; then
  if [ -n "$SEO_PORT" ]; then
    PORT="$SEO_PORT"
    info "Using SEO_PORT from environment: $PORT"
  else
    PORT=$(preferred_port_for_path "$DIR")
    info "Picked stable port $PORT from install path (ephemeral range)"
  fi
fi

if port_in_use "$PORT"; then
  warn "Port $PORT is occupied - probing for a free one"
  FOUND_FREE_PORT=0
  START_PORT=$PORT
  for step in $(seq 1 200); do
    TRY=$((START_PORT + step))
    if [ "$TRY" -gt 65535 ]; then TRY=$((49152 + TRY - 65536)); fi
    if ! port_in_use "$TRY"; then
      PORT="$TRY"
      FOUND_FREE_PORT=1
      break
    fi
  done
  if [ "$FOUND_FREE_PORT" != "1" ]; then
    die "Could not find a free port in the ephemeral range after 200 probes. Set SEO_PORT=<free port> and re-run."
  fi
fi

say "Using port $PORT"

# Persist the chosen port so START.sh / STOP.sh use it next launch.
echo "$PORT" > "$DIR/.seo-port" 2>/dev/null || warn "Could not write .seo-port (port persistence)"

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

  NODE_FULL_VERSION="$(node -v 2>/dev/null | sed 's/^v//')"
  NODE_MAJOR="$(echo "$NODE_FULL_VERSION" | cut -d. -f1)"

  if [ "$NODE_MAJOR" -lt 20 ]; then
    die "Node $NODE_FULL_VERSION is too old. This installer needs Node 22 LTS. Install: see https://nodejs.org/"
  fi

  # better-sqlite3 12.10+ ships prebuilts for Node 22, 23, 24, 25, 26.
  # No version-blocking - just a softer note for non-LTS users.
  if [ "$NODE_MAJOR" -gt 22 ]; then
    info "Node $NODE_FULL_VERSION is current/non-LTS. better-sqlite3 12.10+ has prebuilts for it - should work fine."
  fi
  say "Node $NODE_FULL_VERSION detected - supported."

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

  # ============================================================
  # DEPENDENCY INSTALL - pnpm 11+ build-script bypass strategy
  # ============================================================
  export NPM_CONFIG_IGNORED_BUILDS_CHECK=false
  export NPM_CONFIG_IGNORED_BUILDS_FAIL_INSTALL=false
  export NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true
  export NPM_CONFIG_AUTO_APPROVE_BUILDS=true

  say "Installing dependencies (1-2 min first time, ~15s on re-runs)."
  INSTALL_OK=0
  $PM install --ignore-scripts --prefer-offline && INSTALL_OK=1

  if [ "$INSTALL_OK" != "1" ]; then
    warn "pnpm install --ignore-scripts failed. Wiping node_modules + lockfile..."
    rm -rf node_modules pnpm-lock.yaml
    $PM install --ignore-scripts && INSTALL_OK=1
  fi

  if [ "$INSTALL_OK" != "1" ] && command -v npm >/dev/null 2>&1; then
    warn "Falling back to npm install (no build-script restrictions)..."
    rm -rf node_modules pnpm-lock.yaml
    npm install --no-audit --no-fund --ignore-scripts && INSTALL_OK=1
  fi

  if [ "$INSTALL_OK" != "1" ]; then
    die "Dependency install failed after multiple recovery attempts. See log for details."
  fi

  # ============================================================
  # NATIVE MODULE REBUILD - 4-strategy cascade
  # ============================================================
  # better-sqlite3 MUST have its .node compiled binding. Cascade through
  # increasingly aggressive strategies, verifying on disk after each.

  find_sqlite_binding() {
    find node_modules -name 'better_sqlite3.node' -type f 2>/dev/null | head -1
  }
  # Find the better-sqlite3 package dir. MUST exclude @types/better-sqlite3
  # (TypeScript type defs, no native code).
  find_sqlite_pkg_dir() {
    find node_modules -path '*/better-sqlite3/package.json' -type f 2>/dev/null \
      | grep -v '@types' \
      | head -1 \
      | xargs -I {} dirname {}
  }

  say "Building native modules (better-sqlite3, sharp, esbuild). Output streams below."

  # Strategy 1: pnpm install --force re-runs build scripts. pnpm 11+ does
  # NOT support --force on the `rebuild` command - that's why our prior
  # attempt failed. `install --force` is the correct call.
  say "  [1/3] pnpm install --force (re-runs build scripts)"
  $PM install --force || true

  SQLITE_BINDING="$(find_sqlite_binding)"

  if [ -z "$SQLITE_BINDING" ]; then
    PKG_DIR="$(find_sqlite_pkg_dir)"
    if [ -n "$PKG_DIR" ]; then
      warn "  [2/3] prebuild-install inside $PKG_DIR"
      (cd "$PKG_DIR" && npx --yes prebuild-install || true)
      SQLITE_BINDING="$(find_sqlite_binding)"
    else
      warn "  Could not find the better-sqlite3 package directory!"
    fi
  fi

  if [ -z "$SQLITE_BINDING" ]; then
    PKG_DIR="$(find_sqlite_pkg_dir)"
    if [ -n "$PKG_DIR" ]; then
      warn "  [3/3] npm rebuild inside $PKG_DIR (needs C++ toolchain)"
      (cd "$PKG_DIR" && npm rebuild || true)
      SQLITE_BINDING="$(find_sqlite_binding)"
    fi
  fi

  if [ -z "$SQLITE_BINDING" ]; then
    die "$(cat <<'MSG'
better-sqlite3 native module FAILED to build after 4 different attempts.

Most likely cause: missing C++ build toolchain.

To fix on Linux:
  Debian/Ubuntu:  sudo apt install build-essential python3
  Fedora/RHEL:    sudo dnf groupinstall "Development Tools" && sudo dnf install python3
  Arch:           sudo pacman -S base-devel

To fix on macOS:
  xcode-select --install

If behind a corporate proxy/firewall: check that you can reach
https://github.com/WiseLibs/better-sqlite3/releases (prebuild-install
needs to download from there).

Then re-run this installer.
MSG
)"
  fi

  say "better-sqlite3 binding verified: $SQLITE_BINDING"

  say "Downloading Playwright Chromium (~170 MB, one-time). May take 1-2 min."
  if ! $PM exec playwright install chromium; then
    warn "Playwright Chromium install failed."
    warn "Rank-checking + SERP scanning won't work until this succeeds."
    warn "To retry later:  cd $DIR && pnpm exec playwright install chromium"
  fi
  if [ "$(uname -s)" = "Linux" ]; then
    $PM exec playwright install-deps chromium >/dev/null 2>&1 || warn "Couldn't auto-install Chromium system deps. If rank checks fail: apt install libnss3 libgbm1 libasound2"
  fi

  say "Applying database migrations"
  if ! node scripts/migrate.cjs 2>&1; then
    die "$(cat <<MSG
Database migrations failed.

The most common cause is a corrupted or partially-built better-sqlite3.
If you see "Could not locate the bindings file" above, run:
  cd $DIR
  pnpm rebuild better-sqlite3 --verbose

Full error output is logged above and in: $LOG
MSG
)"
  fi

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
# Launchers now live in bin/. ZIP extraction may strip +x — restore it.
if [ -d "$DESKTOP" ] && [ "$HAS_DOCKER" != "1" ]; then
  chmod +x "$DIR/bin/START.sh" "$DIR/bin/STOP.sh" "$DIR/bin/seo.sh" 2>/dev/null || true

  OS="$(uname -s)"
  if [ "$OS" = "Linux" ]; then
    START_SHORTCUT="$DESKTOP/Start-SEO-Tool.desktop"
    cat > "$START_SHORTCUT" <<EOF
[Desktop Entry]
Type=Application
Name=Start SEO Tool
Comment=Start the self-hosted SEO platform by DiceCodes
Exec=$DIR/bin/START.sh
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
Exec=$DIR/bin/STOP.sh
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
cd "$DIR" && ./bin/START.sh
EOF
    chmod +x "$START_SHORTCUT" 2>/dev/null || true
    say "Created launcher: $START_SHORTCUT"

    STOP_SHORTCUT="$DESKTOP/Stop SEO Tool.command"
    cat > "$STOP_SHORTCUT" <<EOF
#!/bin/bash
cd "$DIR" && ./bin/STOP.sh
read -p "Press Enter to close..."
EOF
    chmod +x "$STOP_SHORTCUT" 2>/dev/null || true
    say "Created launcher: $STOP_SHORTCUT"

    # Clean up the old single launcher from previous installs
    [ -f "$DESKTOP/SEO Tool.command" ] && rm -f "$DESKTOP/SEO Tool.command"
  fi

  # Drop the smart HTML launcher on the desktop. Double-click opens it
  # in the user's default browser; it auto-detects whether the server
  # is running and either opens the app or links to START. Survives
  # port changes (template is re-written every install with current port).
  LAUNCHER_TPL="$DIR/templates/desktop-launcher.html"
  if [ -f "$LAUNCHER_TPL" ]; then
    LAUNCHER_OUT="$DESKTOP/SEO Tool.html"
    # OS-aware paths for the start/stop links
    if [ "$(uname -s)" = "Darwin" ]; then
      START_LINK="file://$DIR/bin/START.sh"
      STOP_LINK="file://$DIR/bin/STOP.sh"
    elif [ "$(uname -s)" = "Linux" ]; then
      START_LINK="file://$DIR/bin/START.sh"
      STOP_LINK="file://$DIR/bin/STOP.sh"
    else
      START_LINK="file:///$(printf '%s' "$DIR" | sed 's| |%20|g')/bin/START.sh"
      STOP_LINK="file:///$(printf '%s' "$DIR" | sed 's| |%20|g')/bin/STOP.sh"
    fi
    # sed-substitute the four placeholders. Use a delimiter unlikely to
    # appear in any of the values (|) to dodge slash-escaping pain.
    sed -e "s|{{PORT}}|$PORT|g" \
        -e "s|{{DIR}}|$DIR|g" \
        -e "s|{{START_CMD}}|$START_LINK|g" \
        -e "s|{{STOP_CMD}}|$STOP_LINK|g" \
        "$LAUNCHER_TPL" > "$LAUNCHER_OUT" \
      && say "Created desktop launcher: $LAUNCHER_OUT" \
      || warn "Could not write desktop HTML launcher"
  fi
fi

# ---- 5b. Auto-start at login (opt-in via SEO_AUTOSTART=1) ------------------
# macOS: drop a LaunchAgent plist. Linux: drop a systemd-user service.
# Both run on user login, no sudo / admin required.
if [ "$SEO_AUTOSTART" = "1" ] && [ "$HAS_DOCKER" != "1" ]; then
  OS="$(uname -s)"
  if [ "$OS" = "Darwin" ]; then
    AGENT_DIR="$HOME/Library/LaunchAgents"
    AGENT_PATH="$AGENT_DIR/com.dicecodes.seo-tool.plist"
    mkdir -p "$AGENT_DIR"
    cat > "$AGENT_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.dicecodes.seo-tool</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DIR/bin/START.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DIR/autostart.log</string>
  <key>StandardErrorPath</key><string>$DIR/autostart.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SEO_RESTART</key><string>1</string>
  </dict>
</dict>
</plist>
EOF
    launchctl unload "$AGENT_PATH" 2>/dev/null || true
    launchctl load "$AGENT_PATH" 2>/dev/null && say "Registered launchd auto-start: $AGENT_PATH" \
      || warn "Could not load launchd agent; reboot to take effect or run: launchctl load $AGENT_PATH"
  elif [ "$OS" = "Linux" ]; then
    # Two modes here:
    #   SEO_SYSTEM_SERVICE=1 -> install at /etc/systemd/system/ via sudo
    #     so the service runs at BOOT (no user login required). Ideal for
    #     headless VPS deploys. Requires sudo.
    #   default              -> install at ~/.config/systemd/user/ via
    #     the systemd-user manager. No sudo, but service only runs while
    #     the user is logged in (or after `sudo loginctl enable-linger`).
    if [ "$SEO_SYSTEM_SERVICE" = "1" ]; then
      UNIT_PATH="/etc/systemd/system/seo-tool.service"
      TMP_UNIT="$(mktemp)"
      cat > "$TMP_UNIT" <<EOF
[Unit]
Description=SEO Tool (self-hosted)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$DIR
ExecStart=/bin/bash $DIR/bin/START.sh
Environment=SEO_RESTART=1
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
      if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        sudo cp "$TMP_UNIT" "$UNIT_PATH"
        sudo systemctl daemon-reload 2>/dev/null || true
        if sudo systemctl enable --now seo-tool.service 2>/dev/null; then
          say "Registered system-wide auto-start: $UNIT_PATH"
          info "Boots without user login. Manage with:"
          info "  sudo systemctl {start,stop,restart,status} seo-tool"
        else
          warn "Unit written to $UNIT_PATH but enable failed; check systemctl status seo-tool"
        fi
      else
        warn "SEO_SYSTEM_SERVICE=1 set but sudo isn't available without password."
        warn "Unit file saved to $TMP_UNIT — install manually:"
        warn "  sudo cp $TMP_UNIT $UNIT_PATH"
        warn "  sudo systemctl daemon-reload && sudo systemctl enable --now seo-tool"
      fi
    else
      UNIT_DIR="$HOME/.config/systemd/user"
      UNIT_PATH="$UNIT_DIR/seo-tool.service"
      mkdir -p "$UNIT_DIR"
      cat > "$UNIT_PATH" <<EOF
[Unit]
Description=SEO Tool (self-hosted)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=/bin/bash $DIR/bin/START.sh
Environment=SEO_RESTART=1
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF
      if command -v systemctl >/dev/null 2>&1; then
        systemctl --user daemon-reload 2>/dev/null || true
        systemctl --user enable seo-tool.service 2>/dev/null \
          && say "Registered systemd-user auto-start: $UNIT_PATH" \
          || warn "systemctl --user not available; the unit is at $UNIT_PATH for manual enable"
        # `loginctl enable-linger $USER` (sudo) is needed for the unit to
        # start without an active login session. We don't sudo silently —
        # tell the user how to enable it themselves.
        info "To run when you're NOT logged in (e.g. headless server):"
        info "  sudo loginctl enable-linger $USER"
        info "Or re-run installer with SEO_SYSTEM_SERVICE=1 for true boot-time start."
      else
        warn "No systemctl found; unit written but not enabled: $UNIT_PATH"
      fi
    fi
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
      echo "  bin/                        <- launcher scripts (START.sh, STOP.sh)"
      echo "    START.sh                  <- DOUBLE-CLICK to start the server"
      echo "    STOP.sh                   <- DOUBLE-CLICK to stop the server"
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
      echo "          (or run: $DIR/bin/START.sh)"
      echo "Stop:     Double-click 'Stop SEO Tool' shortcut on your Desktop"
      echo "          (or run: $DIR/bin/STOP.sh)"
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
