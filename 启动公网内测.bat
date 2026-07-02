@echo off
cd /d "%~dp0"
echo Starting production preview at http://127.0.0.1:4173 ...
start "exam-ai-bank-preview" cmd /k "npm run preview"
timeout /t 3 >nul
echo Starting Cloudflare quick tunnel. Copy the https://*.trycloudflare.com URL shown below.
cloudflared tunnel --url http://127.0.0.1:4173 --no-autoupdate
