@echo off
setlocal

pushd "%~dp0"

echo.
echo ================================================
echo   torus.fm dev startup
echo ================================================
echo.

where pnpm >nul 2>&1
if errorlevel 1 goto :no_pnpm

where docker >nul 2>&1
if errorlevel 1 goto :no_docker

docker info >nul 2>&1
if errorlevel 1 goto :docker_not_running

if not exist ".env" copy /Y ".env.example" ".env" >nul && echo [INFO]  Created .env from .env.example

if exist "node_modules" goto :skip_install
echo [INFO]  Installing pnpm dependencies. First run takes 1-2 min...
call pnpm install
if errorlevel 1 goto :error
goto :installed
:skip_install
echo [INFO]  node_modules already present, skipping install.
:installed

echo [INFO]  Starting Docker services...
docker compose -f infra/docker-compose.yml up -d
if errorlevel 1 goto :error

timeout /t 3 /nobreak >nul

if not exist "data" mkdir "data"
echo [INFO]  Running DB migrations...
call pnpm db:migrate
if errorlevel 1 goto :error

start "" http://localhost:3000

echo.
echo ================================================
echo   torus.fm is starting up
echo ================================================
echo.
echo   Web        http://localhost:3000
echo   Mailhog    http://localhost:8025
echo   MinIO      http://localhost:9001  -  admin / minioadmin
echo.
echo   Press Ctrl+C to stop dev servers.
echo   Run stop.bat afterwards to shut down Docker services.
echo.

call pnpm dev
goto :end

:no_pnpm
echo [ERROR] pnpm not found on PATH.
echo         Install Node 22+ from https://nodejs.org/ then run:
echo             npm install -g pnpm
goto :error

:no_docker
echo [ERROR] docker not found on PATH.
echo         Install Docker Desktop from https://www.docker.com/products/docker-desktop
echo         and make sure it is running before re-running this script.
goto :error

:docker_not_running
echo [ERROR] Docker daemon is not running. Start Docker Desktop and try again.
goto :error

:error
echo.
echo [FAIL]  Startup failed. See messages above.
popd
exit /b 1

:end
popd
exit /b 0