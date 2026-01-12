#!/bin/bash

###############################################################################
# Megawatts Discord Bot - Service Stop Script
#
# This script stops all Docker services cleanly in the correct order.
# It supports both development and production environments.
#
# Usage:
#   ./stop.sh [dev|prod|staging] [--remove-volumes]
#
# Environment options:
#   dev      - Uses docker-compose.yml (default, development environment)
#   prod     - Uses docker/docker-compose.yml (production environment)
#   staging  - Uses docker/docker-compose.staging.yml (staging environment)
#
# Options:
#   --remove-volumes  - Also removes all associated volumes (data loss!)
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
REMOVE_VOLUMES=false

# Check for --remove-volumes flag
if [ "$2" = "--remove-volumes" ] || [ "$1" = "--remove-volumes" ]; then
    REMOVE_VOLUMES=true
    # Adjust environment if flag was passed as first argument
    if [ "$1" = "--remove-volumes" ]; then
        ENVIRONMENT="dev"
    fi
fi

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
        echo "Usage: $0 [dev|prod|staging] [--remove-volumes]"
        exit 1
        ;;
esac

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Megawatts Discord Bot - Stopping Services${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo -e "Compose File: ${YELLOW}$COMPOSE_FILE${NC}"
if [ "$REMOVE_VOLUMES" = true ]; then
    echo -e "${RED}WARNING: This will remove all data volumes!${NC}"
fi
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

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if Docker is running
print_step "Checking if Docker is running..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running."
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

# Check if any services are running
print_step "Checking for running services..."
RUNNING_SERVICES=$(docker compose -f "$COMPOSE_FILE" ps -q 2>/dev/null | wc -l)
if [ "$RUNNING_SERVICES" -eq 0 ]; then
    print_warning "No services are currently running"
    exit 0
fi
print_success "Found $RUNNING_SERVICES running service(s)"

# Display current service status
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Current Service Status${NC}"
echo -e "${BLUE}========================================${NC}"
docker compose -f "$COMPOSE_FILE" ps

# Stop services in reverse order (dependencies first)
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Stopping Docker Services${NC}"
echo -e "${BLUE}========================================${NC}"

# Stop proxy services first (nginx, traefik)
print_step "Stopping proxy services (nginx, traefik)..."
if docker compose -f "$COMPOSE_FILE" ps nginx | grep -q "Up"; then
    docker compose -f "$COMPOSE_FILE" stop nginx
    print_success "Nginx stopped"
fi
if docker compose -f "$COMPOSE_FILE" ps traefik | grep -q "Up"; then
    docker compose -f "$COMPOSE_FILE" stop traefik
    print_success "Traefik stopped"
fi

# Stop the main application
print_step "Stopping main application (app)..."
if docker compose -f "$COMPOSE_FILE" ps app | grep -q "Up"; then
    docker compose -f "$COMPOSE_FILE" stop app
    print_success "Application stopped"
fi

# Stop monitoring services
print_step "Stopping monitoring services (grafana, prometheus)..."
if docker compose -f "$COMPOSE_FILE" ps grafana | grep -q "Up"; then
    docker compose -f "$COMPOSE_FILE" stop grafana
    print_success "Grafana stopped"
fi
if docker compose -f "$COMPOSE_FILE" ps prometheus | grep -q "Up"; then
    docker compose -f "$COMPOSE_FILE" stop prometheus
    print_success "Prometheus stopped"
fi

# Stop infrastructure services last (postgres, redis)
print_step "Stopping infrastructure services (redis, postgres)..."
if docker compose -f "$COMPOSE_FILE" ps redis | grep -q "Up"; then
    docker compose -f "$COMPOSE_FILE" stop redis
    print_success "Redis stopped"
fi
if docker compose -f "$COMPOSE_FILE" ps postgres | grep -q "Up"; then
    docker compose -f "$COMPOSE_FILE" stop postgres
    print_success "PostgreSQL stopped"
fi

# Gracefully shut down all services
print_step "Gracefully shutting down all services..."
docker compose -f "$COMPOSE_FILE" down
print_success "All services stopped"

# Remove volumes if requested
if [ "$REMOVE_VOLUMES" = true ]; then
    print_warning "Removing all associated volumes..."
    print_warning "This will delete all data!"
    read -p "Are you sure? Type 'yes' to confirm: " CONFIRM
    if [ "$CONFIRM" = "yes" ]; then
        docker compose -f "$COMPOSE_FILE" down -v
        print_success "Volumes removed"
    else
        print_warning "Volume removal cancelled"
    fi
fi

# Final status check
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}All services stopped successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${BLUE}Final Service Status:${NC}"
docker compose -f "$COMPOSE_FILE" ps
echo ""
echo -e "${YELLOW}To start services again, run: ./start.sh $ENVIRONMENT${NC}"
echo -e "${BLUE}========================================${NC}"
