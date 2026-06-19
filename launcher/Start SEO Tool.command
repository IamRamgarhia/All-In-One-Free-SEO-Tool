#!/bin/bash
# ============================================================
#   SEO Tool — Start (macOS / Linux)
#   Double-click in Finder to start the server.
#   Browser opens automatically once it's ready.
# ============================================================
#
# Thin wrapper around bin/START.sh. All real logic lives there.
# .command extension makes Finder run it in Terminal on double-click;
# Linux desktops will need to mark it executable + use the file
# manager's "Open with Terminal" action (or use a .desktop file).

# Lives in <install>/launcher/ — step up to the install root so
# bin/START.sh's relative paths resolve.
cd "$(dirname "$0")/.."
./bin/START.sh
