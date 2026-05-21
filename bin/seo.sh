#!/usr/bin/env bash
# Multi-purpose entry. `seo doctor` runs the diagnostic dump; everything
# else is forwarded to START.sh (preserves the legacy /api/restart
# compatibility that spawns "seo.sh" by name).
cd "$(dirname "$0")/.."
if [ "$1" = "doctor" ]; then
  exec node bin/seo-doctor.cjs
fi
exec "$(dirname "$0")/START.sh" "$@"
