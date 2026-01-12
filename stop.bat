@echo off
REM #############################################################################
REM Megawatts Discord Bot - Service Stop Script (Windows)
REM
REM This script stops all Docker services cleanly in the correct order.
REM It supports both development and production environments.
REM
REM Usage:
REM   stop.bat [dev|prod|staging] [--remove-volumes]
REM
REM Environment options:
REM   dev      - Uses docker-compose.yml (default, development environment)
REM   prod     - Uses docker/docker-compose.yml (production environment)
REM   staging  - Uses docker/docker-compose.staging.yml (staging environment)
REM
REM Options:
REM   --remove-volumes  - Also removes all associated volumes (data loss!)
REM #############################################################################

setlocal enabledelayedexpansion

REM Configuration
set "ENVIRONMENT=%~1"
if "%ENVIRONMENT%"=="" set "ENVIRONMENT=dev"
set "REMOVE_VOLUMES=false"

REM Check for --remove-volumes flag
if "%~2"=="--remove-volumes" set "REMOVE_VOLUMES=true"
if "%~1"=="--remove-volumes" (
    set "REMOVE_VOLUMES=true"
    set "ENVIRONMENT=dev"
)

set "COMPOSE_FILE="

REM Determine which docker-compose file to use based on environment
if "%ENVIRONMENT%"=="dev" (
    set "COMPOSE_FILE=docker-compose.yml"
) else if "%ENVIRONMENT%"=="prod" (
    set "COMPOSE_FILE=docker\docker-compose.yml"
) else if "%ENVIRONMENT%"=="staging" (
    set "COMPOSE_FILE=docker\docker-compose.staging.yml"
) else (
    echo [ERROR] Unknown environment '%ENVIRONMENT%'
    echo Usage: %~nx0 [dev^|prod^|staging] [--remove-volumes]
    exit /b 1
)

echo ========================================
echo Megawatts Discord Bot - Stopping Services
echo ========================================
echo Environment: %ENVIRONMENT%
echo Compose File: %COMPOSE_FILE%
if "%REMOVE_VOLUMES%"=="true" (
    echo WARNING: This will remove all data volumes!
)
echo ========================================

REM Skip to main execution
goto :main

REM Function to print step messages
:print_step
echo [STEP] %~1
goto :eof

REM Function to print success messages
:print_success
echo [SUCCESS] %~1
goto :eof

REM Function to print error messages
:print_error
echo [ERROR] %~1
goto :eof

REM Function to print warning messages
:print_warning
echo [WARNING] %~1
goto :eof

REM Main execution starts here
:main

REM Check if Docker is running
call :print_step "Checking if Docker is running..."
docker info >nul 2>&1
if %errorlevel% neq 0 (
    call :print_error "Docker is not running."
    exit /b 1
)
call :print_success "Docker is running"

REM Check if Docker Compose is available
call :print_step "Checking Docker Compose availability..."
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    call :print_error "Docker Compose is not installed or not in PATH"
    exit /b 1
)
call :print_success "Docker Compose is available"

REM Check if the compose file exists
call :print_step "Checking if compose file exists..."
if not exist "%COMPOSE_FILE%" (
    call :print_error "Compose file '%COMPOSE_FILE%' not found"
    exit /b 1
)
call :print_success "Compose file found"

REM Check if any services are running
call :print_step "Checking for running services..."
for /f %%i in ('docker compose -f "%COMPOSE_FILE%" ps -q 2^>nul ^| find /c /v ""') do set RUNNING_SERVICES=%%i
if "%RUNNING_SERVICES%"=="0" (
    call :print_warning "No services are currently running"
    exit /b 0
)
call :print_success "Found %RUNNING_SERVICES% running service(s)"

REM Display current service status
echo.
echo ========================================
echo Current Service Status
echo ========================================
docker compose -f "%COMPOSE_FILE%" ps

REM Stop services in reverse order (dependencies first)
echo.
echo ========================================
echo Stopping Docker Services
echo ========================================

REM Stop proxy services first (nginx, traefik)
call :print_step "Stopping proxy services (nginx, traefik)..."
docker compose -f "%COMPOSE_FILE%" ps nginx | findstr /C:"Up" >nul 2>&1
if %errorlevel% equ 0 (
    docker compose -f "%COMPOSE_FILE%" stop nginx >nul 2>&1
    call :print_success "Nginx stopped"
)

docker compose -f "%COMPOSE_FILE%" ps traefik | findstr /C:"Up" >nul 2>&1
if %errorlevel% equ 0 (
    docker compose -f "%COMPOSE_FILE%" stop traefik >nul 2>&1
    call :print_success "Traefik stopped"
)

REM Stop the main application
call :print_step "Stopping main application (app)..."
docker compose -f "%COMPOSE_FILE%" ps app | findstr /C:"Up" >nul 2>&1
if %errorlevel% equ 0 (
    docker compose -f "%COMPOSE_FILE%" stop app >nul 2>&1
    call :print_success "Application stopped"
)

REM Stop monitoring services
call :print_step "Stopping monitoring services (grafana, prometheus)..."
docker compose -f "%COMPOSE_FILE%" ps grafana | findstr /C:"Up" >nul 2>&1
if %errorlevel% equ 0 (
    docker compose -f "%COMPOSE_FILE%" stop grafana >nul 2>&1
    call :print_success "Grafana stopped"
)

docker compose -f "%COMPOSE_FILE%" ps prometheus | findstr /C:"Up" >nul 2>&1
if %errorlevel% equ 0 (
    docker compose -f "%COMPOSE_FILE%" stop prometheus >nul 2>&1
    call :print_success "Prometheus stopped"
)

REM Stop infrastructure services last (postgres, redis)
call :print_step "Stopping infrastructure services (redis, postgres)..."
docker compose -f "%COMPOSE_FILE%" ps redis | findstr /C:"Up" >nul 2>&1
if %errorlevel% equ 0 (
    docker compose -f "%COMPOSE_FILE%" stop redis >nul 2>&1
    call :print_success "Redis stopped"
)

docker compose -f "%COMPOSE_FILE%" ps postgres | findstr /C:"Up" >nul 2>&1
if %errorlevel% equ 0 (
    docker compose -f "%COMPOSE_FILE%" stop postgres >nul 2>&1
    call :print_success "PostgreSQL stopped"
)

REM Gracefully shut down all services
call :print_step "Gracefully shutting down all services..."
docker compose -f "%COMPOSE_FILE%" down >nul 2>&1
call :print_success "All services stopped"

REM Remove volumes if requested
if "%REMOVE_VOLUMES%"=="true" (
    call :print_warning "Removing all associated volumes..."
    call :print_warning "This will delete all data!"
    set /p CONFIRM="Are you sure? Type 'yes' to confirm: "
    if "!CONFIRM!"=="yes" (
        docker compose -f "%COMPOSE_FILE%" down -v >nul 2>&1
        call :print_success "Volumes removed"
    ) else (
        call :print_warning "Volume removal cancelled"
    )
)

REM Final status check
echo.
echo ========================================
echo All services stopped successfully!
echo ========================================
echo.
echo Final Service Status:
docker compose -f "%COMPOSE_FILE%" ps
echo.
echo To start services again, run: start.bat %ENVIRONMENT%
echo ========================================

endlocal
