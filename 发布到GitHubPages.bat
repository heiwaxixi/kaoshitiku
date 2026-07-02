@echo off
setlocal
cd /d "%~dp0"

set REPO_NAME=kaoshitiku
set PAGES_BASE=/%REPO_NAME%/

echo GitHub Pages repository: %REPO_NAME%
echo Static site base path: %PAGES_BASE%

where gh >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI is not installed or not in PATH.
  echo Install GitHub Desktop or GitHub CLI, then run this script again.
  pause
  exit /b 1
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo GitHub is not logged in. A browser login will open next.
  gh auth login
  if errorlevel 1 (
    echo GitHub login failed.
    pause
    exit /b 1
  )
)

if not exist ".git" (
  git init
  git branch -M main
)

git config user.name >nul 2>nul
if errorlevel 1 git config user.name "Codex Local Deploy"

git config user.email >nul 2>nul
if errorlevel 1 git config user.email "codex-local@example.com"

set GITHUB_PAGES_BASE=%PAGES_BASE%
call npm run build:pages
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

git add .
git commit -m "Deploy exam AI question bank to GitHub Pages"
if errorlevel 1 echo No new commit was created, continuing with push.

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  gh repo view %REPO_NAME% >nul 2>nul
  if errorlevel 1 (
    gh repo create %REPO_NAME% --public --source=. --remote=origin
  ) else (
    for /f "usebackq delims=" %%u in (`gh repo view %REPO_NAME% --json sshUrl --jq ".sshUrl"`) do git remote add origin %%u
  )
)

git push -u origin main
if errorlevel 1 (
  echo Push failed. Check GitHub permissions or remote settings.
  pause
  exit /b 1
)

echo.
echo Push complete. If this is the first deployment, open GitHub repository Settings ^> Pages and set Source to GitHub Actions.
echo The final URL will usually be: https://heiwaxixi.github.io/%REPO_NAME%/
pause
