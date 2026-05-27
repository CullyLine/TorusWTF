@echo off
setlocal

pushd "%~dp0"

echo.
echo ================================================
echo   torus.wtf - stopping Docker services
echo ================================================
echo.

docker compose -f infra/docker-compose.yml down
if errorlevel 1 echo [WARN] docker compose down exited non-zero. Containers may already be stopped.

echo.
echo Stopped. To start again: start.bat
echo.

popd
exit /b 0