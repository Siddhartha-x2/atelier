@echo off
setlocal
cd /d "%~dp0"
echo Starting Art Studio from its project folder...
echo First-time setup: follow README.md before running this launcher.
call npm.cmd start
if errorlevel 1 echo Check the message above. README.md includes setup and port troubleshooting.
pause
