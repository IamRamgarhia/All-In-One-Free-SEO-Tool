#!/usr/bin/env bash
#
# Exercises install-prebuilt.sh against a local fake release.
#
# WHY: the script downloads an archive from the internet and unpacks it
# over somebody's install. The failure that already shipped in v0.10.0's
# updater was taking the WRONG ASSET — the 30 KB WordPress plugin zip,
# which sorts first — and replacing an install with it. The guard that
# caught it is the reason this test exists, and it has to run against a
# real download rather than a mocked one.
#
# Serves a crafted release JSON and three archives on loopback, points
# the installer at them, and checks it:
#
#   1. installs a valid prebuilt payload
#   2. REFUSES a plugin-shaped zip (no server.js)
#   3. REFUSES a source-shaped zip (server.js but no node_modules/.next)
#   4. keeps the data directory when re-run
#
#   bash scripts/install-prebuilt-check.sh
#
# Needs node, curl, unzip and a free port. Nothing is installed outside
# a temp directory.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$HERE/install-prebuilt.sh"
[ -f "$SCRIPT" ] || { echo "install-prebuilt.sh not found"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null || true' EXIT

pass=0; fail=0
check() {
  if [ "$2" = "yes" ]; then pass=$((pass+1)); printf "  \033[32mPASS\033[0m  %s\n" "$1"
  else fail=$((fail+1)); printf "  \033[31mFAIL\033[0m  %s\n" "$1"; fi
}

# ─── build three archives ─────────────────────────────────────────────
#
# `zip` where it exists, our own writer otherwise.
#
# The developer machine this was written on has unzip but no zip, and
# the two obvious substitutes both failed: PowerShell's Compress-Archive
# writes BACKSLASH separators that unzip refuses outright, and GNU tar
# will not write zip at all (it produced a tar named .zip). So
# scripts/zip-write.mjs does it — store-only, forward slashes, verified
# against both unzip and this project's own zip reader.
#
# A test that cannot run where it was written is a test that will not
# be run.
make_zip() {
  local src="$1" out="$2"
  if command -v zip >/dev/null 2>&1; then
    (cd "$src" && zip -qr "$out" .)
  else
    node "$HERE/scripts/zip-write.mjs" "$src" "$out" >/dev/null
  fi
}

mkdir -p "$WORK/assets"

# 1. A valid prebuilt payload: the three things the script validates.
mkdir -p "$WORK/good/node_modules/x" "$WORK/good/.next/server"
printf 'console.log("fake server");\n' > "$WORK/good/server.js"
printf 'console.log("fake migrate");\n' > "$WORK/good/migrate.cjs"
printf '{}\n' > "$WORK/good/node_modules/x/package.json"
printf 'BUILD\n' > "$WORK/good/.next/BUILD_ID"
make_zip "$WORK/good" "$WORK/assets/good.zip"

# 2. The plugin shape — the thing v0.10.0 actually downloaded.
mkdir -p "$WORK/plugin/seo-tool-bridge"
printf '<?php // plugin\n' > "$WORK/plugin/seo-tool-bridge/seo-tool-bridge.php"
make_zip "$WORK/plugin" "$WORK/assets/plugin.zip"

# 3. Source only: has server.js, but nothing is built.
mkdir -p "$WORK/source/src"
printf 'console.log("x");\n' > "$WORK/source/server.js"
printf '{}\n' > "$WORK/source/package.json"
make_zip "$WORK/source" "$WORK/assets/source.zip"

# ─── serve them ───────────────────────────────────────────────────────
PORT="$(node -e 'const n=require("net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
BASE="http://127.0.0.1:${PORT}"

cat > "$WORK/serve.mjs" <<'SERVER'
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const [, , dir, port, which] = process.argv;
const asset = { good: "good.zip", plugin: "plugin.zip", source: "source.zip" }[which];
createServer((req, res) => {
  if (req.url.startsWith("/releases/latest")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        tag_name: "v9.9.9",
        assets: [
          // The plugin first, deliberately: that ordering is what the
          // v0.10.0 updater tripped on.
          { name: "seo-tool-wordpress-plugin.zip", browser_download_url: `http://127.0.0.1:${port}/a/plugin.zip` },
          { name: "seo-tool-v9.9.9.zip", browser_download_url: `http://127.0.0.1:${port}/a/source.zip` },
          { name: process.env.WANT_NAME, browser_download_url: `http://127.0.0.1:${port}/a/${asset}` },
        ],
      }),
    );
    return;
  }
  const m = req.url.match(/^\/a\/(.+)$/);
  if (m && existsSync(join(dir, m[1]))) {
    const buf = readFileSync(join(dir, m[1]));
    res.writeHead(200, { "content-type": "application/zip", "content-length": buf.length });
    res.end(buf);
    return;
  }
  res.writeHead(404);
  res.end("no");
}).listen(Number(port), "127.0.0.1");
SERVER

WANT="seo-tool-prebuilt-9.9.9-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m).zip"

run_case() {
  local which="$1" dest="$2"
  WANT_NAME="$WANT" node "$WORK/serve.mjs" "$WORK/assets" "$PORT" "$which" &
  SRV_PID=$!
  sleep 1
  set +e
  SEO_INSTALL_DIR="$dest" SEO_DATA_DIR="$WORK/data" \
    bash -c "sed 's|https://api.github.com/repos/\${REPO}/releases/latest|${BASE}/releases/latest|' '$SCRIPT' | bash" \
    > "$WORK/${which}.log" 2>&1
  local code=$?
  set -e
  kill "$SRV_PID" 2>/dev/null || true
  wait "$SRV_PID" 2>/dev/null || true
  SRV_PID=""
  return $code
}

echo
echo "A valid prebuilt payload installs"
if run_case good "$WORK/install-good"; then
  check "the installer succeeded" yes
else
  check "the installer succeeded" no
  tail -5 "$WORK/good.log" | sed 's/^/      /'
fi
[ -f "$WORK/install-good/server.js" ] && check "server.js was installed" yes || check "server.js was installed" no
[ -d "$WORK/install-good/node_modules" ] && check "node_modules came with it" yes || check "node_modules came with it" no
[ -f "$WORK/install-good/start.sh" ] && check "a launcher was written" yes || check "a launcher was written" no
[ -x "$WORK/install-good/start.sh" ] && check "and it is executable" yes || check "and it is executable" no
grep -q "SEO_DATA_DIR=\"$WORK/data\"" "$WORK/install-good/start.sh" \
  && check "the launcher points at the data dir, not the app dir" yes \
  || check "the launcher points at the data dir, not the app dir" no

echo
echo "A plugin-shaped zip is REFUSED (the v0.10.0 bug)"
if run_case plugin "$WORK/install-plugin"; then
  check "refused it" no
else
  check "refused it" yes
fi
grep -qi "does not look like the app" "$WORK/plugin.log" \
  && check "and said why" yes || check "and said why" no
[ ! -f "$WORK/install-plugin/server.js" ] \
  && check "nothing was installed" yes || check "nothing was installed" no

echo
echo "A source-only zip is REFUSED"
if run_case source "$WORK/install-source"; then
  check "refused it" no
else
  check "refused it" yes
fi
grep -qiE "missing (node_modules|\.next)" "$WORK/source.log" \
  && check "and named what was missing" yes || check "and named what was missing" no

echo
echo "Re-running keeps the user's data"
printf 'PRETEND DATABASE\n' > "$WORK/data/data.db"
if run_case good "$WORK/install-good"; then
  check "the re-install succeeded" yes
else
  check "the re-install succeeded" no
fi
[ -f "$WORK/data/data.db" ] && check "data.db survived" yes || check "data.db survived" no
grep -q "PRETEND DATABASE" "$WORK/data/data.db" 2>/dev/null \
  && check "and was not overwritten" yes || check "and was not overwritten" no

echo
echo "${pass} passed, ${fail} failed"
echo
[ "$fail" -eq 0 ] || exit 1
