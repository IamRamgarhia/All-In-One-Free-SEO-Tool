#!/usr/bin/env bash
# ============================================================
#  SEO Tool - START
#  Double-click this file (or run from terminal) to start the app.
#  The app opens in your browser at http://localhost:3000
#  (or whichever port the installer picked).
# ============================================================
#
# Modes:
#   - If .next/BUILD_ID exists -> production mode (fast, ~2s)
#   - Otherwise                -> dev mode (slower first paint, 30-60s)
#     Run `pnpm build` once to switch to production mode.
#
# Env overrides:
#   PORT           target port (default 3000)
#   SEO_RESTART    when 1, skips opening a fresh browser tab
#   SEO_FORCE_DEV  when 1, forces dev mode even if a build exists
#   SEO_BIND_HOST  default 127.0.0.1; set 0.0.0.0 to expose on LAN
#                  (REQUIRES setting APP_PASSWORD in .env.local first)

set -e
cd "$(dirname "$0")"

# ---- 1. Resolve PORT
if [ -z "$PORT" ] && [ -f ".seo-port" ]; then
  PORT="$(cat .seo-port 2>/dev/null | tr -d '[:space:]')"
fi
PORT="${PORT:-3000}"

# ---- 2. Find pnpm or npm
if command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
elif command -v npm >/dev/null 2>&1; then
  PM="npm"
else
  echo ""
  echo "Node / npm not found."
  echo "Install Node 20+ from https://nodejs.org and try again."
  echo ""
  read -p "Press Enter to close..." _
  exit 1
fi

health_url="http://localhost:$PORT/api/v1/health"

# ---- 3. Already running on this port? (our server responds on /api/v1/health)
if curl -fsS -o /dev/null --max-time 1 "$health_url" 2>/dev/null; then
  echo "SEO Tool is already running on port $PORT."
  if [ "$SEO_RESTART" != "1" ]; then
    if command -v open >/dev/null 2>&1; then
      open "http://localhost:$PORT" 2>/dev/null || true
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "http://localhost:$PORT" 2>/dev/null || true
    fi
  fi
  exit 0
fi

# Restart? Give the old server a beat to free the port.
[ "$SEO_RESTART" = "1" ] && sleep 2

# ---- 3b. Is the saved port occupied by SOMETHING ELSE (not us)?
port_in_use() {
  local p="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -i :"$p" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -lnt "( sport = :$p )" 2>/dev/null | grep -q LISTEN
  elif command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -q "[\.:]$p .*LISTEN"
  else
    return 1
  fi
}

if port_in_use "$PORT"; then
  echo "Port $PORT is occupied by another process. Picking a free fallback port..."
  for try in 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 8080 8081 4000 5000; do
    if ! port_in_use "$try"; then
      PORT="$try"
      echo "  using port $PORT"
      echo "$PORT" > .seo-port
      break
    fi
  done
fi

# ---- 4. Stop any prior server we own (idempotent re-run)
if [ -f ".dev-server.pid" ]; then
  OLD_PID="$(cat .dev-server.pid 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
fi

# ---- 5. Pick mode
RUN_CMD="dev"
if [ -f ".next/BUILD_ID" ] && [ "$SEO_FORCE_DEV" != "1" ]; then
  RUN_CMD="start:daily"
fi

# ---- 6. Fresh log on each start
: > dev-server.log

# ---- 7. Start detached. HOSTNAME=127.0.0.1 binds to loopback so LAN
#         devices can't reach us. Override with SEO_BIND_HOST=0.0.0.0.
HOST_BIND="${SEO_BIND_HOST:-127.0.0.1}"
echo "Starting SEO Tool on port $PORT..."
echo "(first launch can take 30-90 seconds while it compiles)"
PORT="$PORT" HOSTNAME="$HOST_BIND" nohup $PM run "$RUN_CMD" >dev-server.log 2>&1 &
echo "$!" > .dev-server.pid

# ---- 8. Wait for /api/v1/health (cheap JSON, doesn't trigger dev compile)
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 1 "$health_url" 2>/dev/null; then
    break
  fi
  sleep 1
done

# ---- 9. Open browser unless this is a restart
if [ "$SEO_RESTART" != "1" ]; then
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:$PORT" 2>/dev/null || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:$PORT" 2>/dev/null || true
  fi
fi

echo "SEO Tool is running at http://localhost:$PORT"
