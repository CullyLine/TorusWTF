@echo off
setlocal

pushd "%~dp0"

echo.
echo ================================================
echo   torus.fm - update
echo ================================================
echo.

echo [INFO]  Pulling latest from git...
git pull --ff-only
if errorlevel 1 echo [WARN] git pull failed. Continuing with what you have locally.

echo [INFO]  Installing pnpm dependencies...
call pnpm install
if errorlevel 1 goto :error

echo [INFO]  Running DB migrations...
call pnpm db:migrate
if errorlevel 1 goto :error

echo.
echo Up to date. Run start.bat to launch.
echo.

popd
exit /b 0

:error
echo.
echo [FAIL]  Update failed. See messages above.
popd
exit /b 1