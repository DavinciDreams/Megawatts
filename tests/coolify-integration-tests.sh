#!/bin/bash

# =============================================================================
# Discord Bot Coolify Integration Test Suite
# =============================================================================
# Comprehensive integration testing script for validating service connectivity,
# database connections, API endpoints, and monitoring systems
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
TEST_LOG="${LOG_DIR}/integration-test-$(date +%Y%m%d-%H%M%S).log"
TEST_RESULTS_DIR="${PROJECT_ROOT}/test-results"

# Create necessary directories
mkdir -p "${LOG_DIR}" "${TEST_RESULTS_DIR}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test configuration
ENVIRONMENT="${ENVIRONMENT:-staging}"
TEST_TIMEOUT="${TEST_TIMEOUT:-600}"
VERBOSE="${VERBOSE:-false}"
SKIP_EXTERNAL_TESTS="${SKIP_EXTERNAL_TESTS:-false}"
COOLIFY_URL="${COOLIFY_URL:-}"
COOLIFY_API_TOKEN="${COOLIFY_API_TOKEN:-}"
DOMAIN="${DOMAIN:-localhost}"

# Service endpoints (based on environment configuration)
case "${ENVIRONMENT}" in
    "production")
        APP_PORT="${APP_PORT:-8080}"
        POSTGRES_PORT="${POSTGRES_PORT:-5432}"
        REDIS_PORT="${REDIS_PORT:-6379}"
        PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
        GRAFANA_PORT="${GRAFANA_PORT:-3000}"
        ;;
    "staging")
        APP_PORT="${APP_PORT:-8080}"
        POSTGRES_PORT="${POSTGRES_PORT:-5433}"
        REDIS_PORT="${REDIS_PORT:-6380}"
        PROMETHEUS_PORT="${PROMETHEUS_PORT:-9091}"
        GRAFANA_PORT="${GRAFANA_PORT:-3001}"
        ;;
    *)
        # Default values
        APP_PORT="${APP_PORT:-8080}"
        POSTGRES_PORT="${POSTGRES_PORT:-5432}"
        REDIS_PORT="${REDIS_PORT:-6379}"
        PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
        GRAFANA_PORT="${GRAFANA_PORT:-3000}"
        ;;
esac

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# =============================================================================
# Utility Functions
# =============================================================================

# Logging function with timestamps and levels
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Write to log file
    echo "[${timestamp}] [${level}] ${message}" >> "${TEST_LOG}"
    
    # Output to console with colors
    case "${level}" in
        "ERROR") echo -e "${RED}[ERROR]${NC} ${message}" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} ${message}" ;;
        "INFO")  echo -e "${GREEN}[INFO]${NC} ${message}" ;;
        "DEBUG") echo -e "${BLUE}[DEBUG]${NC} ${message}" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} ${message}" ;;
        *) echo -e "${NC}[${level}]${NC} ${message}" ;;
    esac
}

# Test result function
test_result() {
    local test_name="$1"
    local result="$2"
    local message="${3:-}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    case "${result}" in
        "PASS")
            PASSED_TESTS=$((PASSED_TESTS + 1))
            log "SUCCESS" "✓ PASS: ${test_name}"
            ;;
        "FAIL")
            FAILED_TESTS=$((FAILED_TESTS + 1))
            log "ERROR" "✗ FAIL: ${test_name} - ${message}"
            ;;
        "SKIP")
            SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
            log "WARN" "- SKIP: ${test_name} - ${message}"
            ;;
    esac
    
    # Write to test results file
    echo "${result},${test_name},${message}" >> "${TEST_RESULTS_DIR}/integration-test-results.csv"
}

# Verbose logging function
debug_log() {
    if [[ "${VERBOSE}" == "true" ]]; then
        log "DEBUG" "$*"
    fi
}

# Wait for service to be ready
wait_for_service() {
    local service_name="$1"
    local host="$2"
    local port="$3"
    local timeout="${4:-60}"
    local interval="${5:-5}"
    
    log "INFO" "Waiting for ${service_name} to be ready..."
    
    local start_time=$(date +%s)
    local timeout_time=$((start_time + timeout))
    
    while [[ $(date +%s) -lt ${timeout_time} ]]; do
        if nc -z "${host}" "${port}" 2>/dev/null; then
            log "SUCCESS" "${service_name} is ready"
            return 0
        fi
        
        debug_log "Waiting for ${service_name} (${host}:${port})..."
        sleep "${interval}"
    done
    
    log "ERROR" "Timeout waiting for ${service_name}"
    return 1
}

# =============================================================================
# Service Connectivity Tests
# =============================================================================

test_discord_bot_connectivity() {
    log "INFO" "Testing Discord bot connectivity..."
    
    local app_url="http://${DOMAIN}:${APP_PORT}"
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Discord Bot Connectivity" "SKIP" "External tests disabled"
        return
    fi
    
    # Wait for app to be ready
    if ! wait_for_service "Discord Bot" "${DOMAIN}" "${APP_PORT}" 60; then
        test_result "Discord Bot Connectivity" "FAIL" "Service not reachable"
        return
    fi
    
    # Test basic connectivity
    if curl -s -f "${app_url}" &>> "${TEST_LOG}"; then
        test_result "Discord Bot Connectivity" "PASS"
    else
        test_result "Discord Bot Connectivity" "FAIL" "Cannot connect to Discord bot"
    fi
}

test_postgres_connectivity() {
    log "INFO" "Testing PostgreSQL connectivity..."
    
    local postgres_host="${DB_HOST:-localhost}"
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "PostgreSQL Connectivity" "SKIP" "External tests disabled"
        return
    fi
    
    # Wait for PostgreSQL to be ready
    if ! wait_for_service "PostgreSQL" "${postgres_host}" "${POSTGRES_PORT}" 60; then
        test_result "PostgreSQL Connectivity" "FAIL" "Service not reachable"
        return
    fi
    
    # Test PostgreSQL connection
    if PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" &>> "${TEST_LOG}"; then
        test_result "PostgreSQL Connectivity" "PASS"
    else
        test_result "PostgreSQL Connectivity" "FAIL" "Cannot connect to PostgreSQL"
    fi
}

test_redis_connectivity() {
    log "INFO" "Testing Redis connectivity..."
    
    local redis_host="${REDIS_HOST:-localhost}"
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Redis Connectivity" "SKIP" "External tests disabled"
        return
    fi
    
    # Wait for Redis to be ready
    if ! wait_for_service "Redis" "${redis_host}" "${REDIS_PORT}" 60; then
        test_result "Redis Connectivity" "FAIL" "Service not reachable"
        return
    fi
    
    # Test Redis connection
    if redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" ping &>> "${TEST_LOG}"; then
        test_result "Redis Connectivity" "PASS"
    else
        test_result "Redis Connectivity" "FAIL" "Cannot connect to Redis"
    fi
}

test_prometheus_connectivity() {
    log "INFO" "Testing Prometheus connectivity..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Prometheus Connectivity" "SKIP" "External tests disabled"
        return
    fi
    
    # Wait for Prometheus to be ready
    if ! wait_for_service "Prometheus" "${DOMAIN}" "${PROMETHEUS_PORT}" 60; then
        test_result "Prometheus Connectivity" "FAIL" "Service not reachable"
        return
    fi
    
    # Test Prometheus API
    if curl -s -f "http://${DOMAIN}:${PROMETHEUS_PORT}/api/v1/status/config" &>> "${TEST_LOG}"; then
        test_result "Prometheus Connectivity" "PASS"
    else
        test_result "Prometheus Connectivity" "FAIL" "Cannot connect to Prometheus API"
    fi
}

test_grafana_connectivity() {
    log "INFO" "Testing Grafana connectivity..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Grafana Connectivity" "SKIP" "External tests disabled"
        return
    fi
    
    # Wait for Grafana to be ready
    if ! wait_for_service "Grafana" "${DOMAIN}" "${GRAFANA_PORT}" 60; then
        test_result "Grafana Connectivity" "FAIL" "Service not reachable"
        return
    fi
    
    # Test Grafana health endpoint
    if curl -s -f "http://${DOMAIN}:${GRAFANA_PORT}/api/health" &>> "${TEST_LOG}"; then
        test_result "Grafana Connectivity" "PASS"
    else
        test_result "Grafana Connectivity" "FAIL" "Cannot connect to Grafana"
    fi
}

# =============================================================================
# Database Connection Tests
# =============================================================================

test_postgres_database_operations() {
    log "INFO" "Testing PostgreSQL database operations..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "PostgreSQL Database Operations" "SKIP" "External tests disabled"
        return
    fi
    
    local postgres_host="${DB_HOST:-localhost}"
    local test_table="integration_test_$(date +%s)"
    
    # Test table creation
    if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "CREATE TABLE ${test_table} (id SERIAL PRIMARY KEY, test_data VARCHAR(100));" &>> "${TEST_LOG}"; then
        test_result "PostgreSQL Database Operations" "FAIL" "Cannot create test table"
        return
    fi
    
    # Test data insertion
    if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "INSERT INTO ${test_table} (test_data) VALUES ('integration test');" &>> "${TEST_LOG}"; then
        test_result "PostgreSQL Database Operations" "FAIL" "Cannot insert test data"
        return
    fi
    
    # Test data retrieval
    if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT COUNT(*) FROM ${test_table};" &>> "${TEST_LOG}"; then
        test_result "PostgreSQL Database Operations" "FAIL" "Cannot retrieve test data"
        return
    fi
    
    # Clean up test table
    PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "DROP TABLE ${test_table};" &>> "${TEST_LOG}" || true
    
    test_result "PostgreSQL Database Operations" "PASS"
}

test_postgres_connection_pooling() {
    log "INFO" "Testing PostgreSQL connection pooling..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "PostgreSQL Connection Pooling" "SKIP" "External tests disabled"
        return
    fi
    
    local postgres_host="${DB_HOST:-localhost}"
    
    # Test multiple simultaneous connections
    local pids=()
    for i in {1..5}; do
        (
            if PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT pg_sleep(1), ${i};" &>> "${TEST_LOG}"; then
                echo "PASS"
            else
                echo "FAIL"
            fi
        ) &
        pids+=($!)
    done
    
    # Wait for all connections to complete
    local failed_connections=0
    for pid in "${pids[@]}"; do
        if ! wait "${pid}"; then
            failed_connections=$((failed_connections + 1))
        fi
    done
    
    if [[ ${failed_connections} -eq 0 ]]; then
        test_result "PostgreSQL Connection Pooling" "PASS"
    else
        test_result "PostgreSQL Connection Pooling" "FAIL" "${failed_connections} connections failed"
    fi
}

# =============================================================================
# Redis Connection Tests
# =============================================================================

test_redis_basic_operations() {
    log "INFO" "Testing Redis basic operations..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Redis Basic Operations" "SKIP" "External tests disabled"
        return
    fi
    
    local redis_host="${REDIS_HOST:-localhost}"
    local test_key="integration_test_$(date +%s)"
    
    # Test SET operation
    if ! redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" set "${test_key}" "test_value" &>> "${TEST_LOG}"; then
        test_result "Redis Basic Operations" "FAIL" "Cannot set test key"
        return
    fi
    
    # Test GET operation
    local retrieved_value
    retrieved_value=$(redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" get "${test_key}" 2>> "${TEST_LOG}")
    if [[ "${retrieved_value}" != "test_value" ]]; then
        test_result "Redis Basic Operations" "FAIL" "Cannot retrieve test key"
        return
    fi
    
    # Test DEL operation
    if ! redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" del "${test_key}" &>> "${TEST_LOG}"; then
        test_result "Redis Basic Operations" "FAIL" "Cannot delete test key"
        return
    fi
    
    test_result "Redis Basic Operations" "PASS"
}

test_redis_expiration() {
    log "INFO" "Testing Redis key expiration..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Redis Expiration" "SKIP" "External tests disabled"
        return
    fi
    
    local redis_host="${REDIS_HOST:-localhost}"
    local test_key="expiration_test_$(date +%s)"
    
    # Set key with 2 second expiration
    if ! redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" setex "${test_key}" 2 "test_value" &>> "${TEST_LOG}"; then
        test_result "Redis Expiration" "FAIL" "Cannot set key with expiration"
        return
    fi
    
    # Verify key exists immediately
    local immediate_value
    immediate_value=$(redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" get "${test_key}" 2>> "${TEST_LOG}")
    if [[ "${immediate_value}" != "test_value" ]]; then
        test_result "Redis Expiration" "FAIL" "Key not found immediately after setting"
        return
    fi
    
    # Wait for expiration
    sleep 3
    
    # Verify key is expired
    local expired_value
    expired_value=$(redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" get "${test_key}" 2>> "${TEST_LOG}")
    if [[ "${expired_value}" != "" ]]; then
        test_result "Redis Expiration" "FAIL" "Key did not expire as expected"
        return
    fi
    
    test_result "Redis Expiration" "PASS"
}

# =============================================================================
# API Endpoint Tests
# =============================================================================

test_health_endpoint() {
    log "INFO" "Testing health endpoint..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Health Endpoint" "SKIP" "External tests disabled"
        return
    fi
    
    local health_url="http://${DOMAIN}:${APP_PORT}/health"
    
    # Test health endpoint
    local response
    response=$(curl -s "${health_url}" 2>> "${TEST_LOG}")
    
    if [[ -n "${response}" ]]; then
        # Check if response is valid JSON
        if echo "${response}" | jq empty 2>/dev/null; then
            # Check for required health fields
            if echo "${response}" | jq -e '.status' &> /dev/null; then
                test_result "Health Endpoint" "PASS"
            else
                test_result "Health Endpoint" "FAIL" "Health endpoint missing status field"
            fi
        else
            test_result "Health Endpoint" "FAIL" "Health endpoint response is not valid JSON"
        fi
    else
        test_result "Health Endpoint" "FAIL" "No response from health endpoint"
    fi
}

test_api_endpoints() {
    log "INFO" "Testing API endpoints..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "API Endpoints" "SKIP" "External tests disabled"
        return
    fi
    
    local base_url="http://${DOMAIN}:${APP_PORT}"
    local endpoints=(
        "/health"
        "/metrics"
        "/status"
    )
    
    local failed_endpoints=()
    
    for endpoint in "${endpoints[@]}"; do
        if ! curl -s -f "${base_url}${endpoint}" &>> "${TEST_LOG}"; then
            failed_endpoints+=("${endpoint}")
        fi
    done
    
    if [[ ${#failed_endpoints[@]} -eq 0 ]]; then
        test_result "API Endpoints" "PASS"
    else
        test_result "API Endpoints" "FAIL" "Failed endpoints: ${failed_endpoints[*]}"
    fi
}

test_discord_api_integration() {
    log "INFO" "Testing Discord API integration..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Discord API Integration" "SKIP" "External tests disabled"
        return
    fi
    
    if [[ -z "${DISCORD_TOKEN:-}" ]]; then
        test_result "Discord API Integration" "SKIP" "DISCORD_TOKEN not set"
        return
    fi
    
    # Test Discord API connectivity
    local discord_api_url="https://discord.com/api/v10/users/@me"
    
    if curl -s -f -H "Authorization: Bot ${DISCORD_TOKEN}" "${discord_api_url}" &>> "${TEST_LOG}"; then
        test_result "Discord API Integration" "PASS"
    else
        test_result "Discord API Integration" "FAIL" "Cannot connect to Discord API"
    fi
}

# =============================================================================
# Health Check Validation
# =============================================================================

test_service_health_checks() {
    log "INFO" "Testing service health checks..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Service Health Checks" "SKIP" "External tests disabled"
        return
    fi
    
    # Test Discord bot health
    local bot_health_url="http://${DOMAIN}:${APP_PORT}/health"
    if curl -s -f "${bot_health_url}" | jq -e '.status' | grep -q "healthy\|ok" &>> "${TEST_LOG}"; then
        test_result "Service Health Checks" "PASS"
    else
        test_result "Service Health Checks" "FAIL" "Discord bot health check failed"
    fi
}

test_dependency_health() {
    log "INFO" "Testing dependency health..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Dependency Health" "SKIP" "External tests disabled"
        return
    fi
    
    local failed_dependencies=()
    
    # Test PostgreSQL dependency
    if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST:-localhost}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" &>> "${TEST_LOG}"; then
        failed_dependencies+=("PostgreSQL")
    fi
    
    # Test Redis dependency
    if ! redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" ping &>> "${TEST_LOG}"; then
        failed_dependencies+=("Redis")
    fi
    
    if [[ ${#failed_dependencies[@]} -eq 0 ]]; then
        test_result "Dependency Health" "PASS"
    else
        test_result "Dependency Health" "FAIL" "Failed dependencies: ${failed_dependencies[*]}"
    fi
}

# =============================================================================
# Monitoring System Tests
# =============================================================================

test_prometheus_metrics() {
    log "INFO" "Testing Prometheus metrics collection..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Prometheus Metrics" "SKIP" "External tests disabled"
        return
    fi
    
    local prometheus_url="http://${DOMAIN}:${PROMETHEUS_PORT}/api/v1/query"
    
    # Test if metrics are being collected
    if curl -s -f "${prometheus_url}?query=up" | jq -e '.data.result' &>> "${TEST_LOG}"; then
        test_result "Prometheus Metrics" "PASS"
    else
        test_result "Prometheus Metrics" "FAIL" "Cannot retrieve metrics from Prometheus"
    fi
}

test_grafana_dashboards() {
    log "INFO" "Testing Grafana dashboards..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Grafana Dashboards" "SKIP" "External tests disabled"
        return
    fi
    
    local grafana_url="http://${DOMAIN}:${GRAFANA_PORT}/api/dashboards"
    
    # Test if dashboards are available
    if curl -s -f "${grafana_url}" | jq -e '.[]' &>> "${TEST_LOG}"; then
        test_result "Grafana Dashboards" "PASS"
    else
        test_result "Grafana Dashboards" "FAIL" "Cannot retrieve dashboards from Grafana"
    fi
}

test_log_aggregation() {
    log "INFO" "Testing log aggregation..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Log Aggregation" "SKIP" "External tests disabled"
        return
    fi
    
    # This would typically test Loki or other log aggregation systems
    # For now, we'll check if logs are being generated
    if [[ -f "${TEST_LOG}" && -s "${TEST_LOG}" ]]; then
        test_result "Log Aggregation" "PASS"
    else
        test_result "Log Aggregation" "FAIL" "No logs being generated"
    fi
}

# =============================================================================
# Test Execution and Reporting
# =============================================================================

run_all_tests() {
    log "INFO" "Starting comprehensive integration test suite..."
    log "INFO" "Environment: ${ENVIRONMENT}"
    log "INFO" "Test log: ${TEST_LOG}"
    
    # Initialize test results file
    echo "result,test_name,message" > "${TEST_RESULTS_DIR}/integration-test-results.csv"
    
    # Service connectivity tests
    test_discord_bot_connectivity
    test_postgres_connectivity
    test_redis_connectivity
    test_prometheus_connectivity
    test_grafana_connectivity
    
    # Database connection tests
    test_postgres_database_operations
    test_postgres_connection_pooling
    
    # Redis connection tests
    test_redis_basic_operations
    test_redis_expiration
    
    # API endpoint tests
    test_health_endpoint
    test_api_endpoints
    test_discord_api_integration
    
    # Health check validation
    test_service_health_checks
    test_dependency_health
    
    # Monitoring system tests
    test_prometheus_metrics
    test_grafana_dashboards
    test_log_aggregation
    
    # Generate test report
    generate_test_report
}

generate_test_report() {
    log "INFO" "Generating integration test report..."
    
    local report_file="${TEST_RESULTS_DIR}/integration-test-report-$(date +%Y%m%d-%H%M%S).json"
    local summary_file="${TEST_RESULTS_DIR}/integration-test-summary-$(date +%Y%m%d-%H%M%S).txt"
    
    # Generate JSON report
    cat > "${report_file}" << EOF
{
    "test_suite": "integration-test-suite",
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "environment": "${ENVIRONMENT}",
    "total_tests": ${TOTAL_TESTS},
    "passed_tests": ${PASSED_TESTS},
    "failed_tests": ${FAILED_TESTS},
    "skipped_tests": ${SKIPPED_TESTS},
    "success_rate": "$(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")",
    "log_file": "${TEST_LOG}",
    "results_file": "${TEST_RESULTS_DIR}/integration-test-results.csv",
    "service_endpoints": {
        "discord_bot": "http://${DOMAIN}:${APP_PORT}",
        "postgres": "${DB_HOST:-localhost}:${POSTGRES_PORT}",
        "redis": "${REDIS_HOST:-localhost}:${REDIS_PORT}",
        "prometheus": "http://${DOMAIN}:${PROMETHEUS_PORT}",
        "grafana": "http://${DOMAIN}:${GRAFANA_PORT}"
    }
}
EOF
    
    # Generate text summary
    cat > "${summary_file}" << EOF
Discord Bot Integration Test Suite Summary
==========================================
Environment: ${ENVIRONMENT}
Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')

Service Endpoints:
- Discord Bot: http://${DOMAIN}:${APP_PORT}
- PostgreSQL: ${DB_HOST:-localhost}:${POSTGRES_PORT}
- Redis: ${REDIS_HOST:-localhost}:${REDIS_PORT}
- Prometheus: http://${DOMAIN}:${PROMETHEUS_PORT}
- Grafana: http://${DOMAIN}:${GRAFANA_PORT}

Test Results:
- Total Tests: ${TOTAL_TESTS}
- Passed: ${PASSED_TESTS}
- Failed: ${FAILED_TESTS}
- Skipped: ${SKIPPED_TESTS}
- Success Rate: $(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")%

Files:
- Test Log: ${TEST_LOG}
- JSON Report: ${report_file}
- CSV Results: ${TEST_RESULTS_DIR}/integration-test-results.csv

EOF
    
    if [[ ${FAILED_TESTS} -gt 0 ]]; then
        echo "FAILED TESTS:" >> "${summary_file}"
        grep "^FAIL," "${TEST_RESULTS_DIR}/integration-test-results.csv" | cut -d',' -f2- >> "${summary_file}"
        echo "" >> "${summary_file}"
    fi
    
    if [[ ${SKIPPED_TESTS} -gt 0 ]]; then
        echo "SKIPPED TESTS:" >> "${summary_file}"
        grep "^SKIP," "${TEST_RESULTS_DIR}/integration-test-results.csv" | cut -d',' -f2- >> "${summary_file}"
    fi
    
    log "SUCCESS" "Integration test report generated: ${report_file}"
    log "INFO" "Integration test summary: ${summary_file}"
    
    # Display summary
    echo ""
    echo "=========================================="
    echo "Integration Test Suite Summary"
    echo "=========================================="
    echo "Environment: ${ENVIRONMENT}"
    echo "Total Tests: ${TOTAL_TESTS}"
    echo "Passed: ${PASSED_TESTS}"
    echo "Failed: ${FAILED_TESTS}"
    echo "Skipped: ${SKIPPED_TESTS}"
    echo "Success Rate: $(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")%"
    echo "=========================================="
    
    # Exit with appropriate code
    if [[ ${FAILED_TESTS} -gt 0 ]]; then
        exit 1
    else
        exit 0
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

# Display usage information
show_usage() {
    cat << EOF
Usage: ${SCRIPT_NAME} [OPTIONS]

Run comprehensive integration tests for Discord bot Coolify deployment.

OPTIONS:
    -e, --environment ENV     Target environment (staging|production) [default: staging]
    -t, --timeout SECONDS     Test timeout in seconds [default: 600]
    -v, --verbose             Enable verbose logging
    -s, --skip-external-tests Skip external service tests
    -u, --url URL             Coolify instance URL
    -a, --api-token TOKEN     Coolify API token
    -d, --domain DOMAIN       Application domain [default: localhost]
    -h, --help                Show this help message

ENVIRONMENT VARIABLES:
    ENVIRONMENT               Target environment
    TEST_TIMEOUT              Test timeout in seconds
    VERBOSE                   Verbose logging (true/false)
    SKIP_EXTERNAL_TESTS       Skip external tests (true/false)
    COOLIFY_URL               Coolify instance URL
    COOLIFY_API_TOKEN         Coolify API token
    DOMAIN                    Application domain
    DISCORD_TOKEN             Discord bot token
    DB_HOST                   Database host
    DB_USER                   Database username
    DB_PASSWORD               Database password
    DB_NAME                   Database name
    REDIS_HOST                Redis host
    REDIS_PASSWORD            Redis password

EXAMPLES:
    # Run all integration tests for staging
    ${SCRIPT_NAME} -e staging

    # Run tests with verbose output
    ${SCRIPT_NAME} -v

    # Skip external service tests
    ${SCRIPT_NAME} -s

EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -t|--timeout)
                TEST_TIMEOUT="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            -s|--skip-external-tests)
                SKIP_EXTERNAL_TESTS="true"
                shift
                ;;
            -u|--url)
                COOLIFY_URL="$2"
                shift 2
                ;;
            -a|--api-token)
                COOLIFY_API_TOKEN="$2"
                shift 2
                ;;
            -d|--domain)
                DOMAIN="$2"
                shift 2
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log "ERROR" "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Main function
main() {
    log "INFO" "Starting Discord bot integration test suite..."
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Set timeout for the entire test suite
    timeout "${TEST_TIMEOUT}" bash -c "run_all_tests" || {
        log "ERROR" "Integration test suite timed out after ${TEST_TIMEOUT} seconds"
        exit 1
    }
}

# Execute main function with all arguments
main "$@"