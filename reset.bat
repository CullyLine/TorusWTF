@echo off
setlocal

pushd "%~dp0"

echo.
echo ================================================
echo   torus.wtf - DESTRUCTIVE reset
echo ================================================
echo.
echo   This will permanently delete:
echo     - data\torus.db        your local SQLite database
echo     - the MinIO bucket volume - all uploaded clips
echo     - Redis cache + queue state
echo.

set /p CONFIRM=Type 'yes' to continue: 
if /i not "%CONFIRM%"=="yes" goto :cancel

echo.
echo [INFO]  Stopping Docker services and removing volumes...
docker compose -f infra/docker-compose.yml down --volumes

if exist "data\torus.db" del /F /Q "data\torus.db" 2>nul
if exist "data\torus.db-shm" del /F /Q "data\torus.db-shm" 2>nul
if exist "data\torus.db-wal" del /F /Q "data\torus.db-wal" 2>nul
echo [INFO]  Deleted local SQLite database files.

echo.
echo Done. Run start.bat to bootstrap a fresh environment.
echo.

popd
exit /b 0

:cancel
echo.
echo Cancelled.
popd
exit /b 1