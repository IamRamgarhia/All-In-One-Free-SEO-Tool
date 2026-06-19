@echo off
REM ============================================================
REM   SEO Tool — Start (Windows)
REM   Double-click this file to start the server.
REM   Browser opens automatically once it's ready.
REM ============================================================
REM
REM This file lives in <install>\launcher\. Step up one level so
REM relative paths (bin\START.cmd, .dev-server.pid, data.db) resolve
REM against the install root. The real launcher logic stays in
REM bin\START.cmd.

setlocal
cd /d "%~dp0\.."
call bin\START.cmd
