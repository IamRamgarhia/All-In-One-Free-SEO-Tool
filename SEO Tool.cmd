@echo off
REM ===========================================================
REM   SEO Tool
REM   Double-click this file. That's the whole thing.
REM ===========================================================
REM
REM It opens a control panel in your browser with buttons for
REM everything: install, start, stop, update, back up.
REM
REM Why this is a .cmd and not a .html: a web page opened from a
REM folder runs in the browser's sandbox and cannot start a
REM server, install anything, or copy a file. Its buttons would
REM look real and do nothing. This file is two lines of script
REM whose only job is to open the page that CAN do those things.

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js isn't installed, and this tool needs it.
  echo.
  echo   1. Go to https://nodejs.org
  echo   2. Download the "LTS" version and install it
  echo   3. Double-click this file again
  echo.
  echo   Opening nodejs.org for you...
  timeout /t 3 >nul
  start "" "https://nodejs.org"
  pause
  exit /b 1
)

echo.
echo   Opening the SEO Tool control panel in your browser...
echo   Keep this window open. Closing it closes the panel.
echo.

node "scripts\control-panel.mjs"

REM If node exits immediately something went wrong — hold the
REM window open so the error is readable rather than flashing past.
if errorlevel 1 pause
