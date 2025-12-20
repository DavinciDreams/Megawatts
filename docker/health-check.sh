#!/bin/sh

# =============================================================================
# Health Check Script for Discord Bot
# =============================================================================
# This script performs comprehensive health checks for the Discord bot
# =============================================================================

# Exit on any error
set -e

# Health check endpoint
HEALTH_URL="http://localhost:8080/health"

# Timeout in seconds
TIMEOUT=10

# Perform health check
echo "Performing health check..."

# Check if the health endpoint responds correctly
if curl -f -s --max-time "$TIMEOUT" "$HEALTH_URL" > /dev/null; then
    echo "Health check passed"
    exit 0
else
    echo "Health check failed"
    exit 1
fi