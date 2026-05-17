@echo off
setlocal
chcp 65001 >nul

REM ==========================================================
REM  torus.fm — DESTRUCTIVE reset (Windows)
REM ==========================================================
REM
REM  Wipes your local SQLite database and the MinIO volume.
REM  Useful for "I want a totally clean dev environment" or after
REM  schema changes during development.
REM
REM  Does NOT touch your .env or your source code.

pushd "%~dp0"

echo.
echo ================================================
echo   torus.fm — DESTRUCTIVE reset
echo ================================================
echo.
echo   This will permanently delete:
echo     - data\torus.db        (your local SQLite database)
echo     - the MinIO bucket volume (all uploaded clips)
echo     - Redis cache + queue state
echo.

set /p CONFIRM="Type 'yes' to continue: "
if /i not "%CONFIRM%"=="yes" (
    echo.
    echo Cancelled.
    popd
    exit /b 1
)

echo.
echo [INFO]  Stopping Docker services and removing volumes...
docker compose -f infra/docker-compose.yml down --volumes

if exist "data\torus.db" (
    echo [INFO]  Deleting local SQLite database...
    del /F /Q "data\torus.db" "data\torus.db-shm" "data\torus.db-wal" 2>nul
)

echo.
echo Done. Run start.bat to bootstrap a fresh environment.
echo.

popd
exit /b 0
