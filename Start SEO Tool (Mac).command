#!/bin/bash
# ============================================================
#   SEO Tool — Start (macOS)
#   Double-click this file in Finder to start the server.
#   Browser opens automatically once it's ready.
# ============================================================
#
# Thin wrapper around bin/START.sh. .command extension makes Finder
# run it in Terminal on double-click. First time only: macOS Gatekeeper
# will block with "unidentified developer" — right-click → Open → Open
# to allow it. Subsequent double-clicks just work.

cd "$(dirname "$0")"
./bin/START.sh
