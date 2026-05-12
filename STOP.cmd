@echo off
REM ============================================================
REM  SEO Tool - STOP
REM  Double-click this file to stop the running SEO Tool server.
REM  Safe to run even when the server is already stopped.
REM ============================================================

setlocal
cd /d "%~dp0"

set "STOPPED=0"

REM ---- 1. Try the saved PID first (our normal stop path)
if exist ".dev-server.pid" (
  set /p OUR_PID=<.dev-server.pid
  if defined OUR_PID (
    taskkill /F /PID %OUR_PID% /T >nul 2>&1
    if not errorlevel 1 (
      echo Stopped SEO Tool process %OUR_PID%.
      set "STOPPED=1"
    )
  )
  del /F ".dev-server.pid" >nul 2>&1
)

REM ---- 2. Resolve the bound port from .seo-port (or default 3000) and
REM        kill anything still holding it. Catches the case where the PID
REM        file was missing or stale but the server is still up.
set "PORT=3000"
if exist ".seo-port" set /p PORT=<.seo-port

powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($c) { foreach ($x in $c) { try { Stop-Process -Id $x.OwningProcess -Force -ErrorAction Stop; Write-Host \"Stopped process on port %PORT% (PID $($x.OwningProcess))\" } catch {} } } else { exit 1 }"
if not errorlevel 1 set "STOPPED=1"

REM ---- 3. Also clean up the .dev-server.cmd shim
del /F ".dev-server.cmd" >nul 2>&1

echo.
if "%STOPPED%"=="1" (
  echo SEO Tool is stopped.
) else (
  echo No running SEO Tool was found ^(nothing to stop^).
)
echo.

REM Brief pause so the user can read the message before the window closes
timeout /t 3 /nobreak >nul
endlocal
