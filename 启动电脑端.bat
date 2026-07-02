@echo off
cd /d "%~dp0"
echo Starting local app at http://127.0.0.1:4173 ...
start "Exam AI Question Bank Server" cmd /k npm run dev
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:4173"
