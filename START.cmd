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

setlocal
cd /d "%~dp0"

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
REM     Walk through the fallback list and pick the first free port.
powershell -NoProfile -Command "if ((Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue)) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
  echo Port %PORT% is occupied by another process. Picking a free fallback port...
  for %%p in (3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 8080 8081 4000 5000) do (
    powershell -NoProfile -Command "if ((Get-NetTCPConnection -LocalPort %%p -State Listen -ErrorAction SilentlyContinue)) { exit 0 } else { exit 1 }"
    if errorlevel 1 (
      set "PORT=%%p"
      echo   using port %%p
      echo %%p> .seo-port
      goto :port_found
    )
  )
  echo No free port found. Set PORT manually before re-running.
  pause
  exit /b 1
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
powershell -NoProfile -Command "Start-Process -FilePath '.dev-server.cmd' -WindowStyle Hidden -WorkingDirectory \"%CD%\" -RedirectStandardOutput 'dev-server.log' -RedirectStandardError 'dev-server.err.log'"

echo Starting SEO Tool on port %PORT%...
echo (first launch can take 30-90 seconds while it compiles)

REM ---- 6. Wait for /api/v1/health to confirm the app is actually up.
powershell -NoProfile -Command "for ($i=0; $i -lt 60; $i++) { try { (Invoke-WebRequest -UseBasicParsing -Uri http://localhost:%PORT%/api/v1/health -TimeoutSec 1).StatusCode | Out-Null; break } catch { Start-Sleep -Seconds 1 } }"
if not "%SEO_RESTART%"=="1" start "" "http://localhost:%PORT%"
echo SEO Tool is running at http://localhost:%PORT%
endlocal
