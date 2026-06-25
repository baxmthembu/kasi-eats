@echo off
title Kasi Eats — Auto Deploy
color 0A

echo.
echo  ================================================
echo   Kasi Eats — GitHub Auto Deploy
echo  ================================================
echo.

:: ── Check if git is installed ─────────────────────
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Git is not installed.
    echo  Download it from: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

:: ── Move to project root ───────────────────────────
cd /d "%~dp0"

:: ── Initialize git if not already a repo ──────────
if not exist ".git" (
    echo  [SETUP] Initializing git repository...
    git init
    git branch -M main
    echo.

    echo  [SETUP] Adding remote origin...
    git remote add origin https://github.com/baxmthembu/kasi-eats.git
    echo.

    :: Create .gitignore at root if missing
    if not exist ".gitignore" (
        echo  [SETUP] Creating root .gitignore...
        (
            echo node_modules/
            echo .expo/
            echo dist/
            echo .env
            echo .env.local
            echo *.log
            echo .DS_Store
            echo google-play-service-account.json
            echo *.jks
            echo *.p8
            echo *.p12
            echo *.key
            echo *.mobileprovision
            echo *.pem
        ) > .gitignore
    )

    echo  [SETUP] First-time setup complete.
    echo.
)

:: ── Check remote is set correctly ─────────────────
for /f "tokens=*" %%i in ('git remote get-url origin 2^>nul') do set REMOTE=%%i
if "%REMOTE%"=="" (
    echo  [SETUP] No remote found. Adding origin...
    git remote add origin https://github.com/baxmthembu/kasi-eats.git
)

:: ── Get current date for commit message ───────────
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do (
    set DAY=%%a
    set MONTH=%%b
    set YEAR=%%c
)
set COMMIT_MSG=Update: %DAY%/%MONTH%/%YEAR%

:: ── Stage all changes ──────────────────────────────
echo  [1/4] Staging changes...
git add .
echo.

:: ── Check if there's anything to commit ───────────
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo  [INFO] Nothing to commit — everything is up to date.
    echo.
    goto :push
)

:: ── Commit ────────────────────────────────────────
echo  [2/4] Committing: "%COMMIT_MSG%"
git commit -m "%COMMIT_MSG%"
echo.

:: ── Push ──────────────────────────────────────────
:push
echo  [3/4] Pushing to GitHub...
echo.

:: Try pushing — if upstream not set, set it now
git push -u origin main 2>nul
if %errorlevel% neq 0 (
    echo  [INFO] Retrying push...
    git pull --rebase origin main 2>nul
    git push -u origin main
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] Push failed. Possible reasons:
        echo   - You are not authenticated with GitHub
        echo   - Run: git config --global credential.helper manager
        echo   - Then re-run this script
        echo.
        pause
        exit /b 1
    )
)

echo.
echo  [4/4] Done!
echo.
echo  ================================================
echo   Successfully pushed to GitHub
echo   https://github.com/baxmthembu/kasi-eats
echo  ================================================
echo.
echo  Railway will now auto-deploy your backend
echo  if connected to this repo.
echo.
pause
