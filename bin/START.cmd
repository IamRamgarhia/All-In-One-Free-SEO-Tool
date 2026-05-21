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
where pnpm >nul 2>&1
if %errorlevel%==0 (
  set "PM=pnpm"
) else (
  where npm >nul 2>&1
  if %errorlevel%==0 (
    set "PM=npm"
  ) else (
    echo.
    echo Node / npm not found.
    echo Install Node 20+ from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
  )
)

REM ---- 3. Already running on this port? (our server responds on /api/v1/health)
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri http://localhost:%PORT%/api/v1/health -TimeoutSec 1).StatusCode | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  echo SEO Tool is already running on port %PORT%.
  if not "%SEO_RESTART%"=="1" start "" "http://localhost:%PORT%"
  exit /b 0
)

REM On restart, give the old server a moment to free the port.
if "%SEO_RESTART%"=="1" timeout /t 2 /nobreak >nul

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
    pause
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
