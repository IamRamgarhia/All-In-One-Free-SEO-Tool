#!/usr/bin/env bash
# ============================================================
#  SEO Tool - STOP
#  Run to stop the SEO Tool server.
#  Safe to run even when the server is already stopped.
# ============================================================

# This launcher lives in bin/; runtime state is at the install root.
cd "$(dirname "$0")/.."

STOPPED=0

# ---- 1. Try the saved PID first. Graceful first (SIGTERM), then wait
# up to 5 seconds for the process to flush and exit, then SIGKILL.
# SIGTERM gives Node a chance to close DB handles cleanly.
if [ -f ".dev-server.pid" ]; then
  OUR_PID="$(cat .dev-server.pid 2>/dev/null || true)"
  if [ -n "$OUR_PID" ] && kill -0 "$OUR_PID" 2>/dev/null; then
    kill -TERM "$OUR_PID" 2>/dev/null || true
    # Wait up to 5s for graceful exit
    for i in 1 2 3 4 5; do
      if ! kill -0 "$OUR_PID" 2>/dev/null; then
        echo "Stopped SEO Tool process $OUR_PID gracefully."
        STOPPED=1
        break
      fi
      sleep 1
    done
    # Force-kill if still alive
    if kill -0 "$OUR_PID" 2>/dev/null; then
      kill -9 "$OUR_PID" 2>/dev/null || true
      echo "Stopped SEO Tool process $OUR_PID (forced)."
      STOPPED=1
    fi
  fi
  rm -f .dev-server.pid
fi

# ---- 2. Resolve port from .seo-port (or default 3000) and kill anything still on it
PORT="3000"
[ -f ".seo-port" ] && PORT="$(cat .seo-port 2>/dev/null | tr -d '[:space:]')"

if command -v lsof >/dev/null 2>&1; then
  PORT_PID="$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$PORT_PID" ]; then
    # Graceful first, force after 3s
    kill -TERM "$PORT_PID" 2>/dev/null || true
    sleep 3
    if kill -0 "$PORT_PID" 2>/dev/null; then
      kill -9 "$PORT_PID" 2>/dev/null || true
    fi
    echo "Stopped process on port $PORT (PID $PORT_PID)."
    STOPPED=1
  fi
fi

# ---- 3. Cleanup the dev-server shim file too
rm -f .dev-server.cmd

echo ""
if [ "$STOPPED" = "1" ]; then
  echo "SEO Tool is stopped."
else
  echo "No running SEO Tool was found (nothing to stop)."
fi
echo ""
