@echo off
REM Multi-purpose entry: `seo doctor` runs the diagnostic dump,
REM everything else is forwarded to START.cmd (preserves the legacy
REM /api/restart compatibility that spawns "seo.cmd" by name).
setlocal
cd /d "%~dp0\.."
if /I "%~1"=="doctor" (
  node bin\seo-doctor.cjs
  exit /b %errorlevel%
)
endlocal
call "%~dp0START.cmd" %*
