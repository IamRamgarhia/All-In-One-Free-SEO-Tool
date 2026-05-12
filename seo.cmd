@echo off
REM Internal alias for START.cmd. Kept so /api/restart (which spawns
REM "seo.cmd" by name) continues to work after we renamed the user-
REM facing launcher to START.cmd. End users should use START.cmd.
call "%~dp0START.cmd" %*
