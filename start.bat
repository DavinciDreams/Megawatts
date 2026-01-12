@echo off
REM #############################################################################
REM Megawatts Discord Bot - Service Start Script (Windows)
REM
REM This script starts all Docker services in the correct order.
REM It supports both development and production environments.
REM
REM Usage:
REM   start.bat [dev|prod|staging]
REM
REM Environment options:
REM   dev      - Uses docker-compose.yml (default, development environment)
REM   prod     - Uses docker/docker-compose.yml (production environment)
REM   staging  - Uses docker/docker-compose.staging.yml (staging environment)
REM #############################################################################

setlocal enabledelayedexpansion

REM Configuration
set "ENVIRONMENT=%~1"
if "%ENVIRONMENT%"=="" set "ENVIRONMENT=dev"

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
    echo Usage: %~nx0 [dev^|prod^|staging]
    exit /b 1
)

echo ========================================
echo Megawatts Discord Bot - Starting Services
echo ========================================
echo Environment: %ENVIRONMENT%
echo Compose File: %COMPOSE_FILE%
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

REM Function to handle docker compose errors
:handle_docker_error
set "ERROR_OUTPUT=%~1"
echo.
echo [ERROR] Docker Compose failed to start services.
echo.
echo Error details:
echo %ERROR_OUTPUT%
echo.

REM Check for network conflict error
echo %ERROR_OUTPUT% | findstr /i "Pool overlaps" >nul 2>&1
if %errorlevel% equ 0 (
    echo [DIAGNOSIS] Docker network conflict detected.
    echo.
    echo This error occurs when a Docker network already exists with an
    echo overlapping IP address range. This commonly happens after:
    echo   - Stopping Docker Desktop abruptly
    echo   - Switching between different projects
    echo   - Previous failed container starts
    echo.
    echo [SOLUTIONS]
    echo.
    echo Option 1: Remove unused Docker networks (RECOMMENDED)
    echo   docker network prune
    echo.
    echo Option 2: Remove all stopped containers and unused networks
    echo   docker container prune
    echo   docker network prune
    echo.
    echo Option 3: Stop and remove all containers (WARNING: This will stop all running containers)
    echo   docker compose -f %COMPOSE_FILE% down
    echo   docker network prune
    echo.
    echo Option 4: Re-create the specific network
    echo   docker network remove megawatts_default 2^>nul
    echo.
    echo After running one of the above commands, try running this script again.
    echo.
    exit /b 1
)

REM Check for port conflict error
echo %ERROR_OUTPUT% | findstr /i "port is already allocated" >nul 2>&1
if %errorlevel% equ 0 (
    echo [DIAGNOSIS] Port conflict detected.
    echo.
    echo This error occurs when a required port is already in use by another
    echo application or Docker container.
    echo.
    echo [SOLUTIONS]
    echo.
    echo Option 1: Find and stop the process using the port
    echo   netstat -ano ^| findstr :[PORT]
    echo   taskkill /PID [PID] /F
    echo.
    echo Option 2: Check for running Docker containers
    echo   docker ps
    echo   docker compose -f %COMPOSE_FILE% ps
    echo.
    echo Option 3: Stop all services and try again
    echo   docker compose -f %COMPOSE_FILE% down
    echo.
    exit /b 1
)

REM Check for image pull error
echo %ERROR_OUTPUT% | findstr /i "pull access denied" >nul 2>&1
if %errorlevel% equ 0 (
    echo [DIAGNOSIS] Docker image pull access denied.
    echo.
    echo This error occurs when Docker cannot pull the required images.
    echo.
    echo [SOLUTIONS]
    echo.
    echo Option 1: Check Docker login status
    echo   docker login
    echo.
    echo Option 2: Try pulling images manually
    echo   docker compose -f %COMPOSE_FILE% pull
    echo.
    echo Option 3: Check your internet connection
    echo.
    exit /b 1
)

REM Check for compose file error
echo %ERROR_OUTPUT% | findstr /i "no such file" >nul 2>&1
if %errorlevel% equ 0 (
    echo [DIAGNOSIS] Docker Compose file not found or invalid.
    echo.
    echo [SOLUTIONS]
    echo.
    echo Option 1: Verify the compose file exists
    echo   dir %COMPOSE_FILE%
    echo.
    echo Option 2: Check the compose file syntax
    echo   docker compose -f %COMPOSE_FILE% config
    echo.
    exit /b 1
)

REM Generic error
echo [DIAGNOSIS] Unknown Docker Compose error.
echo.
echo [TROUBLESHOOTING]
echo.
echo Option 1: Check Docker Compose logs
echo   docker compose -f %COMPOSE_FILE% logs
echo.
echo Option 2: Try starting services with verbose output
echo   docker compose -f %COMPOSE_FILE% up -d --verbose
echo.
echo Option 3: Check Docker status
echo   docker info
echo.
echo Option 4: Stop all services and try again
echo   docker compose -f %COMPOSE_FILE% down
echo.
exit /b 1

REM Main execution starts here
:main

REM Check if Docker is running
call :print_step "Checking if Docker is running..."
docker info >nul 2>&1
if %errorlevel% neq 0 (
    call :print_error "Docker is not running. Please start Docker and try again."
    echo.
    echo [SOLUTIONS]
    echo   1. Start Docker Desktop from the Start menu
    echo   2. Wait for Docker to fully start (check the tray icon)
    echo   3. Run this script again
    echo.
    exit /b 1
)
call :print_success "Docker is running"

REM Check if Docker Compose is available
call :print_step "Checking Docker Compose availability..."
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    call :print_error "Docker Compose is not installed or not in PATH"
    echo.
    echo [SOLUTIONS]
    echo   1. Install Docker Desktop which includes Docker Compose
    echo   2. Or install Docker Compose standalone from: https://docs.docker.com/compose/install/
    echo.
    exit /b 1
)
call :print_success "Docker Compose is available"

REM Check if the compose file exists
call :print_step "Checking if compose file exists..."
if not exist "%COMPOSE_FILE%" (
    call :print_error "Compose file '%COMPOSE_FILE%' not found"
    echo.
    echo [SOLUTIONS]
    echo   1. Verify you're in the correct directory
    echo   2. Check that the compose file exists: dir %COMPOSE_FILE%
    echo   3. Ensure you're using the correct environment parameter
    echo.
    exit /b 1
)
call :print_success "Compose file found"

REM Check if .env file exists (for root compose file)
if "%ENVIRONMENT%"=="dev" (
    if not exist ".env" (
        call :print_step "No .env file found. Creating from .env.example..."
        if exist ".env.example" (
            copy .env.example .env >nul
            call :print_success "Created .env from .env.example"
            echo Please edit .env with your configuration before starting services
            echo.
            echo [IMPORTANT] Edit .env with your configuration, then run this script again.
            exit /b 0
        ) else (
            call :print_error "No .env.example file found. Please create .env manually."
            echo.
            echo [SOLUTIONS]
            echo   1. Copy .env.example to .env if it exists
            echo   2. Or create .env manually with required environment variables
            echo.
            exit /b 1
        )
    )
)

REM Create necessary data directories
call :print_step "Creating data directories..."
if not exist "data\postgres" mkdir "data\postgres"
if not exist "data\redis" mkdir "data\redis"
if not exist "data\prometheus" mkdir "data\prometheus"
if not exist "data\grafana" mkdir "data\grafana"
call :print_success "Data directories created"

REM Start services in correct order
echo.
echo ========================================
echo Starting Docker Services
echo ========================================

REM Start infrastructure services first (postgres, redis)
call :print_step "Starting infrastructure services (postgres, redis)..."
docker compose -f "%COMPOSE_FILE%" up -d postgres redis >nul 2>&1
set "DOCKER_ERROR="
if %errorlevel% neq 0 (
    REM Capture the actual error
    docker compose -f "%COMPOSE_FILE%" up -d postgres redis 2>temp_error.txt
    set /p DOCKER_ERROR=<temp_error.txt
    del temp_error.txt
    call :handle_docker_error "!DOCKER_ERROR!"
)
call :print_success "Infrastructure services started"

REM Wait for postgres to be healthy
call :print_step "Waiting for PostgreSQL to be healthy..."
set /a RETRY_COUNT=0
:wait_postgres
if %RETRY_COUNT% geq 30 (
    call :print_error "PostgreSQL did not become healthy in time"
    echo.
    echo [TROUBLESHOOTING]
    echo   1. Check PostgreSQL logs: docker compose -f %COMPOSE_FILE% logs postgres
    echo   2. Verify PostgreSQL is running: docker compose -f %COMPOSE_FILE% ps postgres
    echo   3. Check for port conflicts: netstat -ano ^| findstr :5432
    echo   4. Try restarting: docker compose -f %COMPOSE_FILE% restart postgres
    echo.
    exit /b 1
)
docker compose -f "%COMPOSE_FILE%" ps postgres | findstr /C:"healthy" >nul 2>&1
if %errorlevel% equ 0 (
    call :print_success "PostgreSQL is healthy"
    goto postgres_ready
)
set /a RETRY_COUNT+=1
<nul set /p "=."
timeout /t 2 /nobreak >nul
goto wait_postgres
:postgres_ready

REM Wait for redis to be healthy
call :print_step "Waiting for Redis to be healthy..."
set /a RETRY_COUNT=0
:wait_redis
if %RETRY_COUNT% geq 30 (
    call :print_error "Redis did not become healthy in time"
    echo.
    echo [TROUBLESHOOTING]
    echo   1. Check Redis logs: docker compose -f %COMPOSE_FILE% logs redis
    echo   2. Verify Redis is running: docker compose -f %COMPOSE_FILE% ps redis
    echo   3. Check for port conflicts: netstat -ano ^| findstr :6379
    echo   4. Try restarting: docker compose -f %COMPOSE_FILE% restart redis
    echo.
    exit /b 1
)
docker compose -f "%COMPOSE_FILE%" ps redis | findstr /C:"healthy" >nul 2>&1
if %errorlevel% equ 0 (
    call :print_success "Redis is healthy"
    goto redis_ready
)
set /a RETRY_COUNT+=1
<nul set /p "=."
timeout /t 2 /nobreak >nul
goto wait_redis
:redis_ready

REM Start monitoring services
call :print_step "Starting monitoring services (prometheus, grafana)..."
docker compose -f "%COMPOSE_FILE%" up -d prometheus grafana >nul 2>&1
set "DOCKER_ERROR="
if %errorlevel% neq 0 (
    REM Capture the actual error
    docker compose -f "%COMPOSE_FILE%" up -d prometheus grafana 2>temp_error.txt
    set /p DOCKER_ERROR=<temp_error.txt
    del temp_error.txt
    call :handle_docker_error "!DOCKER_ERROR!"
)
call :print_success "Monitoring services started"

REM Wait for prometheus to be ready
call :print_step "Waiting for Prometheus to be ready..."
timeout /t 5 /nobreak >nul
call :print_success "Prometheus started"

REM Start the main application
call :print_step "Starting main application (app)..."
docker compose -f "%COMPOSE_FILE%" up -d app >nul 2>&1
set "DOCKER_ERROR="
if %errorlevel% neq 0 (
    REM Capture the actual error
    docker compose -f "%COMPOSE_FILE%" up -d app 2>temp_error.txt
    set /p DOCKER_ERROR=<temp_error.txt
    del temp_error.txt
    call :handle_docker_error "!DOCKER_ERROR!"
)
call :print_success "Application started"

REM Wait for app to be healthy
call :print_step "Waiting for application to be healthy..."
set /a RETRY_COUNT=0
:wait_app
if %RETRY_COUNT% geq 60 (
    call :print_error "Application did not become healthy in time"
    echo.
    echo [TROUBLESHOOTING]
    echo   1. Check application logs: docker compose -f %COMPOSE_FILE% logs app
    echo   2. Verify application is running: docker compose -f %COMPOSE_FILE% ps app
    echo   3. Check environment variables in .env file
    echo   4. Verify database connection settings
    echo   5. Try restarting: docker compose -f %COMPOSE_FILE% restart app
    echo.
    exit /b 1
)
docker compose -f "%COMPOSE_FILE%" ps app | findstr /C:"healthy" >nul 2>&1
if %errorlevel% equ 0 (
    call :print_success "Application is healthy"
    goto app_ready
)
set /a RETRY_COUNT+=1
<nul set /p "=."
timeout /t 2 /nobreak >nul
goto wait_app
:app_ready

REM Start proxy services
call :print_step "Starting proxy services (nginx, traefik)..."
docker compose -f "%COMPOSE_FILE%" up -d nginx traefik >nul 2>&1
set "DOCKER_ERROR="
if %errorlevel% neq 0 (
    REM Capture the actual error
    docker compose -f "%COMPOSE_FILE%" up -d nginx traefik 2>temp_error.txt
    set /p DOCKER_ERROR=<temp_error.txt
    del temp_error.txt
    call :handle_docker_error "!DOCKER_ERROR!"
)
call :print_success "Proxy services started"

REM Display service status
echo.
echo ========================================
echo All services started successfully!
echo ========================================
echo.
echo Service Status:
docker compose -f "%COMPOSE_FILE%" ps

echo.
echo ========================================
echo Service Access URLs
echo ========================================
echo Application:   http://localhost:8080
echo Grafana:       http://localhost:3000
echo Prometheus:    http://localhost:9090
echo Traefik:       http://localhost:8082
echo Nginx:         http://localhost
echo.
echo To view logs, run: docker compose -f %COMPOSE_FILE% logs -f
echo To stop services, run: stop.bat %ENVIRONMENT%
echo ========================================

endlocal
