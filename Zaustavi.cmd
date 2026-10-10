@echo off
setlocal
title Volleyball Match Tracker - zaustavljanje
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-app.ps1" -Action Stop
set "launcherExit=%errorlevel%"
if not "%launcherExit%"=="0" (
  echo.
  pause
)
exit /b %launcherExit%
