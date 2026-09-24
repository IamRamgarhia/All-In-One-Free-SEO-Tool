#!/usr/bin/env bash
# The whole launcher for macOS and Linux, in one place.
#
# Windows gets an .hta window because Windows can draw one with nothing
# installed. On macOS and Linux the terminal that opens when you
# double-click IS the window, so this prints the same few states in
# words: what is happening, what it needs, and what it will do next.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEM="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SYSTEM/.." && pwd)"

echo ""
echo "  ============================================"
echo "    SEO Tool"
echo "    Runs on this computer. Your data stays here."
echo "  ============================================"
echo ""

if [ ! -f "$SYSTEM/package.json" ]; then
  echo "  Some files are missing."
  echo ""
  echo "  The _system folder next to this launcher has no package.json,"
  echo "  which usually means the ZIP was only half extracted."
  echo ""
  echo "  Extract the whole ZIP again, keeping every file together,"
  echo "  then open this launcher from the extracted folder."
  echo ""
  read -r -p "  Press Enter to close " _ || true
  exit 1
fi

# shellcheck source=/dev/null
. "$HERE/ensure-node.sh"
if ! ensure_node "$SYSTEM"; then
  echo ""
  read -r -p "  Press Enter to close " _ || true
  exit 1
fi

cd "$SYSTEM" || exit 1

if [ ! -d "$SYSTEM/node_modules" ]; then
  echo "  Nothing is installed yet. Setting up now — the first run fetches"
  echo "  dependencies and builds the app, which takes a few minutes."
  echo ""
  if [ -x "$SYSTEM/bin/START.sh" ]; then
    bash "$SYSTEM/bin/START.sh"
  else
    bash "$SYSTEM/bin/START.sh" 2>/dev/null || {
      echo "  Missing bin/START.sh — the download looks incomplete."
      read -r -p "  Press Enter to close " _ || true
      exit 1
    }
  fi
  echo ""
fi

echo "  Opening the control panel in your browser."
echo "  Keep this window open — closing it closes the panel."
echo ""
exec node "$SYSTEM/scripts/control-panel.mjs"
