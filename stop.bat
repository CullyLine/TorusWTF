@echo off
setlocal
chcp 65001 >nul

REM ==========================================================
REM  torus.fm — stop everything (Windows)
REM ==========================================================
REM
REM  Stops the Docker dev services (Redis, MinIO, Mailhog).
REM  Your data is preserved — the volumes survive a stop.
REM  Use reset.bat if you want to wipe local data.
REM
REM  This does NOT stop your `pnpm dev` process; Ctrl+C that yourself.

pushd "%~dp0"

echo.
echo ================================================
echo   torus.fm — stopping Docker services
echo ================================================
echo.

docker compose -f infra/docker-compose.yml down
if errorlevel 1 (
    echo [WARN] docker compose down exited non-zero. Containers may already be stopped.
)

echo.
echo Stopped. To start again: start.bat
echo.

popd
exit /b 0
