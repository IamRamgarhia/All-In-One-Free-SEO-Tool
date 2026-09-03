@echo off
REM ============================================================
REM  SEO Tool - STOP
REM  Double-click this file to stop the running SEO Tool server.
REM  Safe to run even when the server is already stopped.
REM ============================================================
REM
REM Shutdown order (graceful -> hard):
REM   1. Try the saved PID with taskkill /T (no /F) so Node sees
REM      WM_CLOSE / Ctrl-Break and can flush data.db + close handles.
REM   2. Wait up to 5 seconds for the process to exit.
REM   3. Force-kill (/F /T) if it's still alive.
REM   4. Belt-and-suspenders: free anything bound to .seo-port.
REM   5. Clean up the .dev-server.cmd shim + the hidden cmd window
REM      that hosts the dev server (titled "Windows PowerShell").

setlocal EnableDelayedExpansion
REM This launcher lives in bin/; runtime state is at the install root.
cd /d "%~dp0\.."

set "STOPPED=0"

REM ---- 1. Saved PID — try graceful first, then force.
REM NOTE: labels (:foo) cannot live inside parenthesised IF blocks in
REM cmd.exe — they're a parse error. Use a sentinel variable instead.
if exist ".dev-server.pid" (
  set /p OUR_PID=<.dev-server.pid
  if defined OUR_PID (
    REM Graceful: taskkill without /F sends WM_CLOSE. Node + pnpm don't
    REM handle that gracefully on Windows by default, but it's a better
    REM first attempt than SIGKILL.
    taskkill /PID !OUR_PID! /T >nul 2>&1

    REM Wait up to 5s for the process to exit on its own
    set "GRACEFUL=0"
    for /L %%i in (1,1,5) do (
      if "!GRACEFUL!"=="0" (
        tasklist /FI "PID eq !OUR_PID!" 2>nul | find "!OUR_PID!" >nul
        if errorlevel 1 (
          echo Stopped SEO Tool process !OUR_PID! gracefully.
          set "STOPPED=1"
          set "GRACEFUL=1"
        ) else (
          REM `ping` not `timeout`: timeout aborts when stdin isn't a
          REM console, so under the control panel this loop never waited
          REM and every shutdown fell through to a force-kill.
          ping -n 2 127.0.0.1 >nul
        )
      )
    )

    REM Still alive — force-kill
    if "!GRACEFUL!"=="0" (
      taskkill /F /PID !OUR_PID! /T >nul 2>&1
      if not errorlevel 1 (
        echo Stopped SEO Tool process !OUR_PID! ^(forced^).
        set "STOPPED=1"
      )
    )
  )
  del /F ".dev-server.pid" >nul 2>&1
)

REM ---- 2. Resolve the bound port and free it if anything still holds.
set "PORT=3000"
if exist ".seo-port" set /p PORT=<.seo-port

powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($c) { foreach ($x in $c) { try { Stop-Process -Id $x.OwningProcess -Force -ErrorAction Stop; Write-Host \"Stopped process on port %PORT% (PID $($x.OwningProcess))\" } catch {} } } else { exit 1 }"
if not errorlevel 1 set "STOPPED=1"

REM ---- 3. Clean up the .dev-server.cmd shim
del /F ".dev-server.cmd" >nul 2>&1

REM ---- 4. Close any lingering hidden cmd window that hosted the shim.
REM     START.cmd launched the shim via Start-Process -WindowStyle Hidden,
REM     which can leave an orphan cmd.exe with title containing the script
REM     name. Target by window title to avoid killing the user's own
REM     terminals.
powershell -NoProfile -Command "Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'dev-server\.cmd' } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
if "%STOPPED%"=="1" (
  echo SEO Tool is stopped.
) else (
  echo No running SEO Tool was found ^(nothing to stop^).
)
echo.

REM Brief pause so the user can read the message before the window closes.
REM Skipped when driven by the control panel: `timeout` aborts with
REM "Input redirection is not supported" when stdin isn't a console,
REM which made STOP exit 1 even on a clean shutdown.
if not defined SEO_NONINTERACTIVE timeout /t 3 /nobreak >nul
endlocal
