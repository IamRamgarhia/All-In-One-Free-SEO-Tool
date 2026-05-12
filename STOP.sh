#!/usr/bin/env bash
# ============================================================
#  SEO Tool - STOP
#  Run to stop the SEO Tool server.
#  Safe to run even when the server is already stopped.
# ============================================================

cd "$(dirname "$0")"

STOPPED=0

# ---- 1. Try the saved PID first
if [ -f ".dev-server.pid" ]; then
  OUR_PID="$(cat .dev-server.pid 2>/dev/null || true)"
  if [ -n "$OUR_PID" ] && kill -0 "$OUR_PID" 2>/dev/null; then
    kill "$OUR_PID" 2>/dev/null && {
      echo "Stopped SEO Tool process $OUR_PID."
      STOPPED=1
    }
    sleep 1
    # Force-kill if still alive
    kill -0 "$OUR_PID" 2>/dev/null && kill -9 "$OUR_PID" 2>/dev/null || true
  fi
  rm -f .dev-server.pid
fi

# ---- 2. Resolve port from .seo-port (or default 3000) and kill anything still on it
PORT="3000"
[ -f ".seo-port" ] && PORT="$(cat .seo-port 2>/dev/null | tr -d '[:space:]')"

if command -v lsof >/dev/null 2>&1; then
  PORT_PID="$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$PORT_PID" ]; then
    kill "$PORT_PID" 2>/dev/null && {
      echo "Stopped process on port $PORT (PID $PORT_PID)."
      STOPPED=1
    }
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
