#!/bin/bash
# ===========================================================
#   SEO Tool
#   Double-click this file. That's the whole thing.
# ===========================================================
#
# It opens a control panel in your browser with buttons for
# everything: install, start, stop, update, back up.
#
# Why this isn't a .html file: a web page opened from a folder
# runs in the browser's sandbox and cannot start a server,
# install anything, or copy a file. Its buttons would look real
# and do nothing. This file's only job is to open the page that
# CAN do those things.
#
# macOS, first time only: Gatekeeper blocks unsigned scripts.
# Right-click this file → Open → Open. After that, double-click
# works normally.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js isn't installed, and this tool needs it."
  echo ""
  echo "  1. Go to https://nodejs.org"
  echo "  2. Download the \"LTS\" version and install it"
  echo "  3. Double-click this file again"
  echo ""
  if command -v open >/dev/null 2>&1; then
    open "https://nodejs.org"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "https://nodejs.org" >/dev/null 2>&1
  fi
  read -r -p "Press Enter to close..." _
  exit 1
fi

echo ""
echo "  Opening the SEO Tool control panel in your browser..."
echo "  Keep this window open. Closing it closes the panel."
echo ""

node "scripts/control-panel.mjs"

# Hold the window open if it exited straight away, so the error
# is readable instead of vanishing with the terminal.
status=$?
if [ $status -ne 0 ]; then
  echo ""
  read -r -p "Press Enter to close..." _
fi
exit $status
