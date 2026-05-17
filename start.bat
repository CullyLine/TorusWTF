@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

REM ==========================================================
REM  torus.fm — one-click dev environment startup (Windows)
REM ==========================================================
REM
REM  This script:
REM    1. Verifies pnpm + docker are available
REM    2. Creates .env from .env.example if missing
REM    3. Installs deps if node_modules missing
REM    4. Brings up Docker services (Redis, MinIO, Mailhog)
REM    5. Runs DB migrations
REM    6. Opens the browser at http://localhost:3000
REM    7. Starts Next.js + worker in dev mode
REM
REM  Press Ctrl+C to stop the dev servers. Run stop.bat afterwards
REM  to also shut down the Docker services.
REM
REM  First run takes a couple of minutes (downloads + migrations).
REM  Subsequent runs are fast (~5 seconds to live).

pushd "%~dp0"

echo.
echo ================================================
echo   torus.fm dev startup
echo ================================================
echo.

REM ---- Tooling checks ----
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm not found on PATH.
    echo         Install Node 22+ from https://nodejs.org/ then run:
    echo             npm install -g pnpm
    goto :error
)

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] docker not found on PATH.
    echo         Install Docker Desktop from https://www.docker.com/products/docker-desktop
    echo         and make sure it is running before re-running this script.
    goto :error
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker daemon is not running. Start Docker Desktop and try again.
    goto :error
)

REM ---- .env bootstrap ----
if not exist ".env" (
    echo [INFO]  Creating .env from .env.example ...
    copy /Y ".env.example" ".env" >nul
)

REM ---- Install deps (idempotent) ----
if not exist "node_modules" (
    echo [INFO]  Installing pnpm dependencies (first run takes ~1-2 min)...
    call pnpm install
    if errorlevel 1 goto :error
) else (
    echo [INFO]  node_modules already present, skipping install.
)

REM ---- Bring up Docker services ----
echo [INFO]  Starting Docker services (Redis, MinIO, Mailhog)...
docker compose -f infra/docker-compose.yml up -d
if errorlevel 1 goto :error

REM Give MinIO a moment for the bucket-init container to finish
timeout /t 3 /nobreak >nul

REM ---- Migrate DB ----
if not exist "data" mkdir "data"
echo [INFO]  Running DB migrations...
call pnpm db:migrate
if errorlevel 1 goto :error

REM ---- Open browser (give Next.js a head start) ----
start "" http://localhost:3000

echo.
echo ================================================
echo   torus.fm is starting up
echo ================================================
echo.
echo   Web:        http://localhost:3000
echo   Mailhog:    http://localhost:8025   (caught magic-link emails)
echo   MinIO:      http://localhost:9001   (admin / minioadmin)
echo.
echo   Press Ctrl+C to stop dev servers.
echo   Run stop.bat afterwards to shut down Docker services.
echo.

REM ---- Start dev servers ----
call pnpm dev

goto :end

:error
echo.
echo [FAIL]  Startup failed. See messages above.
popd
exit /b 1

:end
popd
exit /b 0
