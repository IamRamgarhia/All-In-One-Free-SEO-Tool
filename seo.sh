#!/usr/bin/env bash
# Internal alias for START.sh. Kept so /api/restart (which spawns
# "seo.sh" by name) continues to work after we renamed the user-
# facing launcher to START.sh. End users should run START.sh.
exec "$(dirname "$0")/START.sh" "$@"
