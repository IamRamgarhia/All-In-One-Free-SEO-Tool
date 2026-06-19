#!/bin/bash
# ============================================================
#   SEO Tool — Stop (macOS / Linux)
#   Double-click in Finder to stop the running server.
#   Safe to run even when the server is already stopped.
# ============================================================

cd "$(dirname "$0")/.."
./bin/STOP.sh
read -p "Press Enter to close..." _ 2>/dev/null || true
