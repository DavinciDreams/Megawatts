#!/bin/bash

###############################################################################
# Megawatts Discord Bot - Service Start Script
# 
# This script starts all Docker services in the correct order.
# It supports both development and production environments.
#
# Usage:
#   ./start.sh [dev|prod|staging]
#
# Environment options:
#   dev      - Uses docker-compose.yml (default, development environment)
#   prod     - Uses docker/docker-compose.yml (production environment)
#   staging  - Uses docker/docker-compose.staging.yml (staging environment)
###############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE=""

# Determine which docker-compose file to use based on environment
case "$ENVIRONMENT" in
    dev)
        COMPOSE_FILE="docker-compose.yml"
        ;;
    prod)
        COMPOSE_FILE="docker/docker-compose.yml"
        ;;
    staging)
        COMPOSE_FILE="docker/docker-compose.staging.yml"
        ;;
    *)
        echo -e "${RED}Error: Unknown environment '$ENVIRONMENT'${NC}"
        echo "Usage: $0 [dev|prod|staging]"
        exit 1
        ;;
esac

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Megawatts Discord Bot - Starting Services${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo -e "Compose File: ${YELLOW}$COMPOSE_FILE${NC}"
echo -e "${BLUE}========================================${NC}"

# Function to print step messages
print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Function to print success messages
print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Function to print error messages
print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
print_step "Checking if Docker is running..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi
print_success "Docker is running"

# Check if Docker Compose is available
print_step "Checking Docker Compose availability..."
if ! command -v docker compose &> /dev/null; then
    print_error "Docker Compose is not installed or not in PATH"
    exit 1
fi
print_success "Docker Compose is available"

# Check if the compose file exists
print_step "Checking if compose file exists..."
if [ ! -f "$COMPOSE_FILE" ]; then
    print_error "Compose file '$COMPOSE_FILE' not found"
    exit 1
fi
print_success "Compose file found"

# Check if .env file exists (for root compose file)
if [ "$ENVIRONMENT" = "dev" ] && [ ! -f ".env" ]; then
    print_step "No .env file found. Creating from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success "Created .env from .env.example"
        echo -e "${YELLOW}Please edit .env with your configuration before starting services${NC}"
    else
        print_error "No .env.example file found. Please create .env manually."
        exit 1
    fi
fi

# Create necessary data directories
print_step "Creating data directories..."
mkdir -p data/postgres data/redis data/prometheus data/grafana
print_success "Data directories created"

# Start services in correct order
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Starting Docker Services${NC}"
echo -e "${BLUE}========================================${NC}"

# Start infrastructure services first (postgres, redis)
print_step "Starting infrastructure services (postgres, redis)..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis

# Wait for postgres to be healthy
print_step "Waiting for PostgreSQL to be healthy..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker compose -f "$COMPOSE_FILE" ps postgres | grep -q "healthy"; then
        print_success "PostgreSQL is healthy"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    print_error "PostgreSQL did not become healthy in time"
    exit 1
fi

# Wait for redis to be healthy
print_step "Waiting for Redis to be healthy..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker compose -f "$COMPOSE_FILE" ps redis | grep -q "healthy"; then
        print_success "Redis is healthy"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    print_error "Redis did not become healthy in time"
    exit 1
fi

# Start monitoring services
print_step "Starting monitoring services (prometheus, grafana)..."
docker compose -f "$COMPOSE_FILE" up -d prometheus grafana

# Wait for prometheus to be ready
print_step "Waiting for Prometheus to be ready..."
sleep 5
print_success "Prometheus started"

# Start the main application
print_step "Starting main application (app)..."
docker compose -f "$COMPOSE_FILE" up -d app

# Wait for app to be healthy
print_step "Waiting for application to be healthy..."
MAX_RETRIES=60
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker compose -f "$COMPOSE_FILE" ps app | grep -q "healthy"; then
        print_success "Application is healthy"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    print_error "Application did not become healthy in time"
    echo "Check logs with: docker compose -f $COMPOSE_FILE logs app"
    exit 1
fi

# Start proxy services
print_step "Starting proxy services (nginx, traefik)..."
docker compose -f "$COMPOSE_FILE" up -d nginx traefik
print_success "Proxy services started"

# Display service status
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}All services started successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${BLUE}Service Status:${NC}"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Service Access URLs${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Application:   ${GREEN}http://localhost:8080${NC}"
echo -e "Grafana:       ${GREEN}http://localhost:3000${NC}"
echo -e "Prometheus:    ${GREEN}http://localhost:9090${NC}"
echo -e "Traefik:       ${GREEN}http://localhost:8082${NC}"
echo -e "Nginx:         ${GREEN}http://localhost${NC}"
echo ""
echo -e "${YELLOW}To view logs, run: docker compose -f $COMPOSE_FILE logs -f${NC}"
echo -e "${YELLOW}To stop services, run: ./stop.sh $ENVIRONMENT${NC}"
echo -e "${BLUE}========================================${NC}"
