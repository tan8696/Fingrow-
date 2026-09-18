@echo off
REM ---------------------------------------------------------------------------
REM  FinGrow — start the full app locally for a demo.
REM
REM  Double-click this file. It opens two windows (the API and the web app) and
REM  then your browser. Keep both windows open while presenting; closing either
REM  one stops that half of the app.
REM
REM  Local data lives in backend\*.db and persists between runs, unlike the
REM  Vercel deployment.
REM ---------------------------------------------------------------------------

title FinGrow launcher
cd /d "%~dp0"

where python >nul 2>nul || (
  echo Python was not found on PATH. Install Python 3.11+ and try again.
  pause
  exit /b 1
)
where npm >nul 2>nul || (
  echo npm was not found on PATH. Install Node.js 18+ and try again.
  pause
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo Installing web app dependencies, first run only...
  pushd frontend
  call npm install
  popd
)

echo Starting the API on http://localhost:8000 ...
start "FinGrow API  (keep open)" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --port 8000"

REM Give the API a head start so the first sign-up does not race it.
timeout /t 4 /nobreak >nul

echo Starting the web app ...
REM --open launches the browser at whichever port Vite actually binds, so a
REM leftover process on 5173 cannot send you to the wrong page.
start "FinGrow Web  (keep open)" cmd /k "cd /d "%~dp0frontend" && npm run dev -- --open"

echo.
echo Both are starting. Your browser will open in a few seconds.
echo You can close this launcher window.
timeout /t 5 >nul
