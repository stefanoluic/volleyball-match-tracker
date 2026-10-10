@echo off
setlocal
title Volleyball Match Tracker - pokretanje
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-app.ps1" -Action Start
set "launcherExit=%errorlevel%"
if not "%launcherExit%"=="0" (
  echo.
  pause
)
exit /b %launcherExit%
