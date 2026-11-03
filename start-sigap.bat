@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-sigap.ps1" %*
pause

