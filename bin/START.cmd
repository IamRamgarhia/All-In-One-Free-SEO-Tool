@echo off
REM ============================================================
REM  SEO Tool - START
REM  Double-click this file to start the app.
REM  The app will open in your browser at http://localhost:3000
REM  (or whichever port the installer picked).
REM ============================================================
REM
REM Modes:
REM   - If .next\BUILD_ID exists -> production mode (fast, ~2s)
REM   - Otherwise                -> dev mode (slower first paint, 30-60s)
REM     Run `pnpm build` once to switch to production mode.
REM
REM Env overrides:
REM   PORT          target port (default 3000)
REM   SEO_RESTART   when 1, skips opening a fresh browser tab
REM   SEO_FORCE_DEV when 1, forces dev mode even if a build exists
REM   SEO_BIND_HOST default 127.0.0.1; set 0.0.0.0 to expose on LAN
REM                 (REQUIRES setting APP_PASSWORD in .env.local first)

setlocal EnableDelayedExpansion
REM This launcher lives in bin/ — all runtime state (.dev-server.pid,
REM .seo-port, data.db, .next, node_modules) is at the install root,
REM one level up. cd there so relative paths resolve correctly.
cd /d "%~dp0\.."

REM ---- 1. Resolve PORT (caller env > .seo-port file > 3000)
if "%PORT%"=="" (
  if exist ".seo-port" (
    set /p PORT=<.seo-port
  )
)
if "%PORT%"=="" set "PORT=3000"

REM ---- 2. Find pnpm or npm
REM
REM     Uses && rather than a nested `if %errorlevel%`. Inside a
REM     parenthesised block cmd expands %errorlevel% when it PARSES the
REM     block, not when it runs — so the inner check was reusing the
REM     result of the OUTER `where pnpm`. On any machine with npm but
REM     no pnpm (a stock Node install, i.e. most of them) this printed
REM     "Node / npm not found" and stopped, on a machine with Node
REM     plainly installed. && evaluates immediately and sidesteps it.
set "PM="
where pnpm >nul 2>&1 && set "PM=pnpm"
if not defined PM where npm >nul 2>&1 && set "PM=npm"
if not defined PM (
  echo.
  echo Node / npm not found.
  echo Install Node 20+ from https://nodejs.org and try again.
  echo.
  REM  Only wait for a keypress when a human is watching. The control
  REM  panel runs this with no stdin, so a pause here hangs the task
  REM  forever instead of reporting the failure.
  if not defined SEO_NONINTERACTIVE pause
  exit /b 1
)

REM ---- 2b. First-run self-bootstrap.
REM     Runs ONCE on a freshly-extracted ZIP that's never had the
REM     installer run. Detects missing node_modules / .next / playwright
REM     and sets them up so double-clicking "SEO Tool.cmd"
REM     on a brand-new PC just works.
REM
REM     We use Direct console output (not redirected) so the user SEES
REM     pnpm install progress in real time. Takes 3-8 min total on
REM     first run; thereafter every step is a no-op.
set "FIRST_RUN_BOOTSTRAP=0"
if not exist "node_modules" set "FIRST_RUN_BOOTSTRAP=1"
if not exist ".next\BUILD_ID" set "FIRST_RUN_BOOTSTRAP=1"

if "!FIRST_RUN_BOOTSTRAP!"=="1" (
  echo.
  echo ============================================================
  echo   First-run setup. This happens once on a fresh extract.
  echo   Takes about 5 minutes total. Please keep this window open.
  echo ============================================================
  echo.
)

REM Progress-file protocol: each step writes a single line "step|label"
REM to .install-progress before running. The HTA polls this file every
REM 2s to show the user which step is executing. Cleared at the end of
REM bootstrap so a subsequent normal start doesn't show stale progress.
if not exist "node_modules" (
  ^> ".install-progress" echo 1^|Installing dependencies ^(3-5 min^)
  echo [1/3] Installing dependencies via !PM!...
  echo       ^(this is the longest step — 3-5 minutes^)
  echo.
  REM --ignore-scripts skirts pnpm 11+ build-script gate; we rebuild
  REM native modules explicitly below. --prefer-offline reuses the
  REM pnpm-store cache on re-runs (10x faster).
  set "NPM_CONFIG_IGNORED_BUILDS_CHECK=false"
  set "NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true"
  if "!PM!"=="pnpm" (
    call !PM! install --ignore-scripts --prefer-offline
  ) else (
    call !PM! install --no-audit --no-fund --ignore-scripts
  )
  if errorlevel 1 (
    ^> ".install-progress" echo 0^|Install failed
    echo.
    echo Dependency install failed. Check the messages above.
    echo If it's a network error, check your connection and re-run.
    if not defined SEO_NONINTERACTIVE pause
    exit /b 1
  )
  REM Rebuild native modules (better-sqlite3 etc.)
  call !PM! rebuild >nul 2>&1
)

if not exist ".next\BUILD_ID" (
  ^> ".install-progress" echo 2^|Building production bundle ^(1-2 min^)
  echo.
  echo [2/3] Building production bundle...
  echo       ^(1-2 minutes; makes the daily server boot in ~3s instead of ~30s^)
  echo.
  call !PM! run build
  if errorlevel 1 (
    echo.
    echo Production build failed. Will fall back to dev mode ^(slower but works^).
    REM Don't exit — dev mode still works, just slower
  )
)

REM Playwright chromium — needed for rank-checking + SERP scan only.
REM Don't block on this. If it fails, just warn — main app still runs.
if not exist "node_modules\playwright\node_modules\@playwright\browser-chromium" (
  if not exist "node_modules\.pnpm\@playwright+test*\node_modules\@playwright\test" (
    if "!FIRST_RUN_BOOTSTRAP!"=="1" (
      ^> ".install-progress" echo 3^|Downloading Playwright Chromium ^(~170 MB^)
      echo.
      echo [3/3] Downloading Playwright Chromium ^(~170 MB, 1-2 min^)...
      echo       ^(used by rank tracker + SERP scanner; skip-safe^)
      echo.
      call !PM! exec playwright install chromium 2>nul
    )
  )
)

REM Clear progress file once bootstrap is done so the HTA reverts to
REM its normal "Starting server" status text.
if "!FIRST_RUN_BOOTSTRAP!"=="1" del /F ".install-progress" 2>nul

if "!FIRST_RUN_BOOTSTRAP!"=="1" (
  echo.
  echo ============================================================
  echo   First-run setup complete. Starting server...
  echo ============================================================
  echo.
)

REM ---- 3. Already running on this port? Distinguish OURS vs a SIBLING
REM     install. /api/v1/health reports its installRoot; if it doesn't
REM     match this install dir, someone else is on this port — pick a
REM     new one rather than opening THEIR data in the user's browser.
set "MY_ROOT=%CD%"
for /f "tokens=*" %%R in ('powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri http://localhost:%PORT%/api/v1/health -TimeoutSec 2 -ErrorAction Stop; $j = $r.Content | ConvertFrom-Json; if ($j.installRoot) { Write-Output $j.installRoot } } catch {}"') do set "REMOTE_ROOT=%%R"
if defined REMOTE_ROOT (
  REM Case-insensitive compare for Windows paths
  if /I "!REMOTE_ROOT!"=="!MY_ROOT!" (
    echo SEO Tool is already running on port %PORT%.
    if not "%SEO_RESTART%"=="1" start "" "http://localhost:%PORT%"
    exit /b 0
  ) else (
    echo Port %PORT% is already serving a DIFFERENT SEO Tool install at:
    echo   !REMOTE_ROOT!
    echo Picking a new port for this install...
    where node >nul 2>&1
    if !errorlevel!==0 (
      for /f "tokens=*" %%P in ('node scripts/pick-port.cjs --reroll 2^>nul') do set "PORT=%%P"
      echo Using port !PORT!.
      set "REMOTE_ROOT="
    )
  )
)

REM On restart, give the old server a moment to free the port.
if "%SEO_RESTART%"=="1" ping -n 3 127.0.0.1 >nul

REM ---- 3b. Is the saved port occupied by SOMETHING ELSE (not us)?
REM     Delegate to scripts/pick-port.cjs which uses the stable
REM     ephemeral-range strategy (49152-65535 hashed from install path).
REM     Falls back to legacy 3000-range if Node isn't available yet.
powershell -NoProfile -Command "if ((Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue)) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
  echo Port %PORT% is occupied by another process. Picking a free port...
  where node >nul 2>&1
  if !errorlevel!==0 (
    for /f "tokens=*" %%P in ('node scripts/pick-port.cjs --reroll 2^>nul') do set "PORT=%%P"
  ) else (
    REM Pure-cmd fallback: try a small range of well-known ports.
    for %%p in (3001 3002 3003 3004 3005 8080 8081 4000 5000) do (
      powershell -NoProfile -Command "if ((Get-NetTCPConnection -LocalPort %%p -State Listen -ErrorAction SilentlyContinue)) { exit 0 } else { exit 1 }"
      if errorlevel 1 (
        set "PORT=%%p"
        echo %%p> .seo-port
        goto :port_found
      )
    )
    echo No free port found. Set PORT manually before re-running.
    if not defined SEO_NONINTERACTIVE pause
    exit /b 1
  )
  echo   using port %PORT%
)
:port_found

REM ---- 4. Pick mode. Production if a build exists, dev otherwise.
set "RUN_CMD=dev"
if exist ".next\BUILD_ID" if not "%SEO_FORCE_DEV%"=="1" set "RUN_CMD=start:daily"

REM ---- 5. Write a small batch shim and launch it under PowerShell's
REM Start-Process so the window stays hidden and paths with spaces work.
if "%SEO_BIND_HOST%"=="" set "SEO_BIND_HOST=127.0.0.1"

> ".dev-server.cmd" (
  echo @echo off
  echo set PORT=%PORT%
  echo set HOSTNAME=%SEO_BIND_HOST%
  echo %PM% run %RUN_CMD%
)
type nul > dev-server.log
REM Capture the spawned PID into .dev-server.pid so STOP.cmd can find
REM and kill the process by PID (its primary kill path). Without this,
REM STOP.cmd falls back to a port-based scan that needs elevation on
REM some Windows configs.
powershell -NoProfile -Command "$p = Start-Process -FilePath '.dev-server.cmd' -WindowStyle Hidden -WorkingDirectory \"%CD%\" -RedirectStandardOutput 'dev-server.log' -RedirectStandardError 'dev-server.err.log' -PassThru; if ($p) { $p.Id | Out-File '.dev-server.pid' -Encoding ascii -Force }"

echo Starting SEO Tool on port %PORT%...
echo (first launch can take 30-90 seconds while it compiles)

REM ---- 6. Wait for /api/v1/health to confirm the app is actually up.
powershell -NoProfile -Command "for ($i=0; $i -lt 60; $i++) { try { (Invoke-WebRequest -UseBasicParsing -Uri http://localhost:%PORT%/api/v1/health -TimeoutSec 1).StatusCode | Out-Null; break } catch { Start-Sleep -Seconds 1 } }"

REM ---- 6b. Auto-recover from a stale .next build.
REM     When .next references modules by content-hash (e.g.
REM     "better-sqlite3-4f3f783ea63d70cf") and node_modules has been
REM     reinstalled since the last build, the server crashes at boot
REM     with "Cannot find module ...-<hash>". Detect that pattern in
REM     the error log, rebuild .next once, and retry. Without this
REM     auto-fix, the user sees the diagnostic alert from the HTA
REM     and has to run pnpm run build manually.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri http://localhost:%PORT%/api/v1/health -TimeoutSec 2; exit ($r.StatusCode -eq 200 -as [int] - 1) } catch { exit 1 }"
if errorlevel 1 (
  set "STALE_BUILD=0"
  if exist "dev-server.err.log" (
    findstr /C:"Cannot find module" dev-server.err.log >nul 2>&1
    if not errorlevel 1 (
      findstr /C:"-server\.js" dev-server.err.log >nul 2>&1
      if not errorlevel 1 set "STALE_BUILD=1"
    )
  )
  if "!STALE_BUILD!"=="1" (
    echo.
    echo Detected stale .next build crash — rebuilding automatically.
    echo This takes ~2 minutes the first time. Please wait...
    echo.
    REM Kill the crashed child so it doesn't hold .next files
    if exist ".dev-server.pid" (
      set /p OLD_PID=<.dev-server.pid
      if defined OLD_PID taskkill /F /PID !OLD_PID! /T >nul 2>&1
      del /F ".dev-server.pid" >nul 2>&1
    )
    call %PM% run build
    if not errorlevel 1 (
      echo Rebuild done. Restarting server...
      type nul > dev-server.log
      type nul > dev-server.err.log
      powershell -NoProfile -Command "$p = Start-Process -FilePath '.dev-server.cmd' -WindowStyle Hidden -WorkingDirectory \"%CD%\" -RedirectStandardOutput 'dev-server.log' -RedirectStandardError 'dev-server.err.log' -PassThru; if ($p) { $p.Id | Out-File '.dev-server.pid' -Encoding ascii -Force }"
      powershell -NoProfile -Command "for ($i=0; $i -lt 60; $i++) { try { (Invoke-WebRequest -UseBasicParsing -Uri http://localhost:%PORT%/api/v1/health -TimeoutSec 1).StatusCode | Out-Null; break } catch { Start-Sleep -Seconds 1 } }"
    )
  )
)

REM ---- 7. Open in app-window mode if Chrome/Edge/Brave is available.
REM     `--app=URL` strips the tabs + URL bar, giving the user a
REM     PWA-feel dedicated window. Falls back to default browser if
REM     no Chromium browser is found.
if "%SEO_RESTART%"=="1" goto :running
set "APP_URL=http://localhost:%PORT%"
set "OPENED=0"
for %%B in (
  "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"
  "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"
) do (
  if !OPENED!==0 if exist %%B (
    start "" %%B --app="%APP_URL%"
    set "OPENED=1"
  )
)
if !OPENED!==0 start "" "%APP_URL%"
:running
echo SEO Tool is running at http://localhost:%PORT%
endlocal
