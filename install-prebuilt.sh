#!/usr/bin/env bash
#
# One command, macOS or Linux, no toolchain:
#
#   curl -fsSL https://raw.githubusercontent.com/IamRamgarhia/All-In-One-Free-SEO-Tool/main/install-prebuilt.sh | bash
#
# WHY THIS EXISTS ALONGSIDE install.sh
#
# install.sh downloads the SOURCE from the tip of main and builds it:
# pnpm, a native-module compile, a Next build. That asks a lot of a
# machine and of the audience — and it fails for reasons that have
# nothing to do with this app (no pnpm, no compiler, a broken main).
# Node 25+ also ships no corepack, so `pnpm` is frequently just absent.
#
# This fetches the PREBUILT payload from the latest release instead:
# node_modules already installed, .next already built. Nothing to
# compile, so nothing to go wrong in a way the user can do anything
# about.
#
# install.sh is untouched and remains the right choice for contributors
# and anyone who wants to run unreleased code.
#
# NOT YET VERIFIED END TO END: the prebuilt payload is attached to
# releases from v0.10.2 onwards. Until one exists this script will say
# so and stop, rather than falling back to something it did not promise.
# See installer/README.md.

set -euo pipefail

REPO="IamRamgarhia/All-In-One-Free-SEO-Tool"
API="https://api.github.com/repos/${REPO}/releases/latest"
DIR="${SEO_INSTALL_DIR:-$HOME/Applications/SEO Tool}"
PORT="${SEO_PORT:-3000}"

# ─── output ───────────────────────────────────────────────────────────
bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
info() { printf "  %s\n" "$1"; }
die()  { printf "\n  \033[31m✗\033[0m %s\n\n" "$1" >&2; exit 1; }

bold ""
bold "SEO Tool — installing the prebuilt app"
printf "\n"

# ─── prerequisites ────────────────────────────────────────────────────
#
# Only Node, and only because the payload's compiled native modules are
# built against one specific ABI. A mismatch fails at startup with
# ERR_DLOPEN_FAILED, which reads as a broken download rather than a
# version problem — so it is checked up front with a message that says
# what it actually is.
command -v node >/dev/null 2>&1 || die \
  "Node.js is not installed.
  macOS:  brew install node@22
  Linux:  https://nodejs.org/en/download/package-manager
  Then run this again."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node ${NODE_MAJOR} is too old. This needs Node 20 or newer."
fi
if [ "$NODE_MAJOR" -ge 27 ]; then
  die "Node ${NODE_MAJOR} is newer than this release was built for.
  Install Node 22 alongside it, or use install.sh to build from source."
fi
ok "Node $(node -p 'process.versions.node')"

command -v curl >/dev/null 2>&1 || die "curl is required."
command -v unzip >/dev/null 2>&1 || die \
  "unzip is required.
  Debian/Ubuntu:  sudo apt-get install unzip
  Fedora:         sudo dnf install unzip"

# ─── find the payload ─────────────────────────────────────────────────
info "Looking up the latest release…"
RELEASE_JSON="$(curl -fsSL "$API")" || die "Could not reach GitHub."

TAG="$(printf '%s' "$RELEASE_JSON" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try { console.log(JSON.parse(s).tag_name || ""); } catch { console.log(""); }
});')"
[ -n "$TAG" ] || die "Could not read the latest release tag."

# The payload asset, by exact name.
#
# NOT "the first .zip": a release carries more than one, and the
# WordPress bridge plugin is 30 KB and sorts first. That exact mistake
# shipped in v0.10.0's updater, which downloaded the plugin and refused
# because it found no app inside — caught against the real published
# release. Same trap, same answer: match the name.
WANT="seo-tool-prebuilt-${TAG#v}-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m).zip"

URL="$(printf '%s' "$RELEASE_JSON" | WANT="$WANT" node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try {
    const want = process.env.WANT;
    const a = (JSON.parse(s).assets || []).find((x) => x.name === want);
    console.log(a ? a.browser_download_url : "");
  } catch { console.log(""); }
});')"

if [ -z "$URL" ]; then
  die "Release ${TAG} has no prebuilt payload for this platform.

  Expected asset:  ${WANT}

  The prebuilt payload is attached from v0.10.2 onwards. Until then,
  build from source instead:

    curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash"
fi
ok "Found ${TAG}"

# ─── download ─────────────────────────────────────────────────────────
#
# Into a fresh temp directory of its own. A downloaded archive is
# untrusted input: unpacking it next to anything would let a crafted
# entry overwrite a neighbour.
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

info "Downloading (this is the whole app — a few hundred MB)…"
curl -fL --progress-bar -o "$TMP/payload.zip" "$URL" || die "Download failed."

# Checksum, when the release publishes one. Not fatal if absent: older
# releases have none, and refusing to install over a missing file nobody
# promised would be worse than saying so.
SUMS_URL="$(printf '%s' "$RELEASE_JSON" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try {
    const a = (JSON.parse(s).assets || []).find((x) => x.name === "SHA256SUMS.txt");
    console.log(a ? a.browser_download_url : "");
  } catch { console.log(""); }
});')"

if [ -n "$SUMS_URL" ]; then
  curl -fsSL -o "$TMP/SHA256SUMS.txt" "$SUMS_URL" || true
  if [ -f "$TMP/SHA256SUMS.txt" ]; then
    if command -v shasum >/dev/null 2>&1; then
      GOT="$(shasum -a 256 "$TMP/payload.zip" | cut -d' ' -f1)"
    else
      GOT="$(sha256sum "$TMP/payload.zip" | cut -d' ' -f1)"
    fi
    EXPECT="$(grep -F "$(basename "$WANT")" "$TMP/SHA256SUMS.txt" | cut -d' ' -f1 || true)"
    if [ -n "$EXPECT" ] && [ "$GOT" != "$EXPECT" ]; then
      die "Checksum mismatch — the download is not what the release published.
  expected  ${EXPECT}
  got       ${GOT}"
    fi
    [ -n "$EXPECT" ] && ok "Checksum verified"
  fi
else
  info "This release publishes no checksum file; skipping that check."
fi

# ─── unpack and validate BEFORE touching the install directory ────────
info "Unpacking…"
unzip -q "$TMP/payload.zip" -d "$TMP/unpacked" || die "The archive would not unpack."

# The payload may be at the root or inside one wrapper directory.
SRC="$TMP/unpacked"
if [ ! -f "$SRC/server.js" ]; then
  INNER="$(find "$TMP/unpacked" -maxdepth 2 -name server.js -print -quit)"
  [ -n "$INNER" ] || die "This archive does not look like the app — no server.js inside."
  SRC="$(dirname "$INNER")"
fi

# Validated before anything is overwritten. v0.10.0's updater replaced
# an install with a 30 KB plugin zip; the guard that caught it is the
# reason this check happens here and not after the copy.
[ -d "$SRC/node_modules" ] || die "The payload is missing node_modules — it is not a prebuilt build."
[ -d "$SRC/.next" ] || die "The payload is missing .next — it is not a prebuilt build."
ok "Payload looks right"

# ─── install ──────────────────────────────────────────────────────────
#
# Data lives OUTSIDE the install directory, so replacing the app on an
# upgrade cannot take the database with it — and so a user who deletes
# the folder does not lose their clients. Same reasoning that moved
# backups out of the app folder.
if [ "$(uname -s)" = "Darwin" ]; then
  DATA_DIR="${SEO_DATA_DIR:-$HOME/Library/Application Support/SEO Tool}"
else
  DATA_DIR="${SEO_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/seo-tool}"
fi
mkdir -p "$DATA_DIR"

if [ -d "$DIR" ]; then
  info "Replacing the app at ${DIR} (your data in ${DATA_DIR} is untouched)…"
  # .next removed explicitly: a stale build directory serving old code
  # under a new version number is the worst kind of upgrade failure,
  # because the version string says the update worked.
  rm -rf "$DIR/.next"
else
  info "Installing to ${DIR}…"
fi
mkdir -p "$DIR"

# Copy over, never delete-then-copy: an interrupted install should leave
# a working previous version rather than nothing.
cp -R "$SRC/." "$DIR/"
ok "Installed"

# ─── launcher ─────────────────────────────────────────────────────────
cat > "$DIR/start.sh" <<LAUNCHER
#!/usr/bin/env bash
# Starts the SEO tool and opens it.
set -euo pipefail
cd "\$(dirname "\$0")"
export SEO_DATA_DIR="${DATA_DIR}"
export SEO_DB_PATH="${DATA_DIR}/data.db"
export NODE_ENV=production
export PORT="\${PORT:-${PORT}}"
# Loopback only. There is no password by default, and an SEO tool full of
# client data must not be published to the network it happens to be on.
export HOSTNAME=127.0.0.1
export SEO_BIND_ADDR=127.0.0.1

node migrate.cjs >/dev/null 2>&1 || true
node server.js &
SERVER_PID=\$!
trap 'kill \$SERVER_PID 2>/dev/null || true' EXIT INT TERM

for _ in \$(seq 1 60); do
  if curl -fsS "http://127.0.0.1:\${PORT}/api/v1/health" >/dev/null 2>&1; then
    if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:\${PORT}"
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://127.0.0.1:\${PORT}"
    else echo "Open http://127.0.0.1:\${PORT}"; fi
    break
  fi
  sleep 1
done

echo "SEO Tool is running on http://127.0.0.1:\${PORT}  (Ctrl-C to stop)"
wait \$SERVER_PID
LAUNCHER
chmod +x "$DIR/start.sh"
ok "Launcher written to ${DIR}/start.sh"

printf "\n"
bold "Done."
printf "\n"
info "Start it:   \"${DIR}/start.sh\""
info "Your data:  ${DATA_DIR}"
printf "\n"
info "Rank checking and AI features are optional and off until you set"
info "them up — the audit works immediately with nothing configured."
printf "\n"
