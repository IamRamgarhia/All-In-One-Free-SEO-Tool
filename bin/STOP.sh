#!/usr/bin/env bash
# ============================================================
#  SEO Tool - STOP
#  Run to stop the SEO Tool server.
#  Safe to run even when the server is already stopped.
# ============================================================

# This launcher lives in bin/; runtime state is at the install root.
cd "$(dirname "$0")/.."

STOPPED=0

# Stop one process, as gracefully as the platform allows.
#
# On Windows this MUST be taskkill. Git Bash's `kill` takes MSYS pids,
# not native Windows pids, so `kill -TERM 7524` against a real Windows
# process signals nothing at all — and `kill -0` on the same pid then
# says the process is gone, which is how the previous version came to
# report a successful stop over an app that was still serving requests.
#
# `//PID` with two slashes is not a typo: MSYS rewrites a lone `/PID`
# into a Windows path before taskkill ever sees it.
#
# `/T` kills the tree. The server spawns Playwright browsers; ending
# only the parent leaves headless Chrome running with no way for anyone
# to find it — the same reason the Windows installer's host uses
# Kill(entireProcessTree: true).
stop_pid() {
  pid="$1"
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*)
      # No graceful step: taskkill without /F sends WM_CLOSE, which a
      # console Node process does not act on, so it only wastes 5s.
      taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
      ;;
    *)
      # SIGTERM first so Node can flush data.db and close handles.
      kill -TERM "$pid" 2>/dev/null || true
      for _ in 1 2 3 4 5; do
        kill -0 "$pid" 2>/dev/null || return 0
        sleep 1
      done
      kill -9 "$pid" 2>/dev/null || true
      ;;
  esac
}

# ---- 1. Try the saved PID first.
#
# Through stop_pid, which is the platform-aware one. The `kill -0` guard
# this used to open with is itself unreliable on Windows for a native
# pid, so it is gone: stop_pid on a pid that no longer exists is
# harmless, and step 2 below is what decides whether anything is still
# running.
if [ -f ".dev-server.pid" ]; then
  OUR_PID="$(cat .dev-server.pid 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$OUR_PID" ]; then
    stop_pid "$OUR_PID"
  fi
  rm -f .dev-server.pid
fi

# ---- 2. Ask the APP where it is, rather than asking a file.
#
# This step used to read `.seo-port` and then call `lsof`. Two problems,
# both measured:
#
#   - `.seo-port` records where bin/START last PUT the app, not where it
#     is. On this machine it said 3399 while a healthy app answered on
#     3000, because that run had been started directly.
#   - Git Bash on Windows has no `lsof`, so the entire block was skipped
#     and the script printed "No running SEO Tool was found (nothing to
#     stop)" over PID 7524 serving :3000 from this very install.
#
# A confident wrong answer, which this project treats as worse than a
# crash — and the same bug the control panel already had, in a second
# copy. scripts/app-pid.mjs is the one answer now: it probes the health
# endpoint, checks `installRoot` so a stranger on 3000 is never mistaken
# for ours, and reads the PID the app reports about itself. No lsof, no
# netstat, no platform branch.
LOOKED=0
if command -v node >/dev/null 2>&1; then
  LOOKED=1
  APP_INFO="$(node scripts/app-pid.mjs 2>/dev/null || true)"
  if [ -n "$APP_INFO" ]; then
    APP_PORT="$(echo "$APP_INFO" | awk '{print $1}')"
    APP_PID="$(echo "$APP_INFO" | awk '{print $2}')"
    if [ -n "$APP_PID" ]; then
      stop_pid "$APP_PID"

      # VERIFY, then claim. Re-probe rather than trusting the kill.
      #
      # The first version of this said "Stopped SEO Tool on port 3000
      # (PID 7524)" and the app was still answering a second later. Two
      # reasons, both of which only verification catches:
      #
      #   - In Git Bash, `kill` speaks MSYS pids. Given a native Windows
      #     pid it signals nothing, and `kill -0` on that pid then
      #     reports "gone" — so the force-kill branch was skipped too.
      #     Every step reported success and nothing happened.
      #   - A kill can be refused by policy or by permissions, and the
      #     shell has no way to know from the exit code alone.
      #
      # Claiming an outcome that was not checked is the exact failure
      # this project treats as worse than a crash, and this script had
      # it in both directions within one minute: first "nothing to stop"
      # over a running app, then "stopped" over one still running.
      sleep 1
      if node scripts/app-pid.mjs >/dev/null 2>&1; then
        echo "Could not stop SEO Tool on port $APP_PORT (PID $APP_PID) — it is still answering."
        echo "Close its window, or stop it from the control panel."
        exit 1
      fi
      echo "Stopped SEO Tool on port $APP_PORT (PID $APP_PID)."
      STOPPED=1
    fi
  fi
fi

# ---- 3. Cleanup the dev-server shim file too
rm -f .dev-server.cmd

echo ""
if [ "$STOPPED" = "1" ]; then
  echo "SEO Tool is stopped."
elif [ "$LOOKED" = "1" ]; then
  echo "No running SEO Tool was found (nothing to stop)."
else
  # "Could not look" must never print as "nothing is wrong". Node is how
  # this app runs, so its absence means this script cannot answer the
  # question at all — saying "nothing to stop" there would be a guess
  # dressed as a result.
  echo "Could not check whether SEO Tool is running: node is not on PATH."
  echo "If it is running, stop it from the control panel or close its window."
  exit 1
fi
echo ""
