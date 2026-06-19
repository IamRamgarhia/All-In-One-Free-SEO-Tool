@echo off
REM ============================================================
REM   SEO Tool — Stop
REM   Double-click this file to stop the running server.
REM   Safe to run even when the server is already stopped.
REM ============================================================
REM
REM Thin wrapper around bin\STOP.cmd. All real logic (graceful
REM SIGTERM, 5s wait, force-kill fallback, port cleanup) lives
REM there.

setlocal
REM Lives in <install>\launcher\ — step up to the install root so
REM bin\STOP.cmd's relative paths resolve correctly.
cd /d "%~dp0\.."
call bin\STOP.cmd
