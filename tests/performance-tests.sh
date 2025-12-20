#!/bin/bash

# =============================================================================
# Discord Bot Coolify Performance Test Suite
# =============================================================================
# Comprehensive performance testing script for load testing Discord bot,
# database performance, Redis performance, resource utilization, and response times
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
TEST_LOG="${LOG_DIR}/performance-test-$(date +%Y%m%d-%H%M%S).log"
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
TEST_TIMEOUT="${TEST_TIMEOUT:-1800}"
VERBOSE="${VERBOSE:-false}"
SKIP_HEAVY_TESTS="${SKIP_HEAVY_TESTS:-false}"
DOMAIN="${DOMAIN:-localhost}"
APP_PORT="${APP_PORT:-8080}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"

# Performance test parameters
LOAD_TEST_DURATION="${LOAD_TEST_DURATION:-60}"
LOAD_TEST_CONCURRENCY="${LOAD_TEST_CONCURRENCY:-10}"
LOAD_TEST_RPS="${LOAD_TEST_RPS:-100}"
DB_CONNECTION_POOL_SIZE="${DB_CONNECTION_POOL_SIZE:-20}"
REDIS_CONNECTION_POOL_SIZE="${REDIS_CONNECTION_POOL_SIZE:-10}"

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
    echo "${result},${test_name},${message}" >> "${TEST_RESULTS_DIR}/performance-test-results.csv"
}

# Verbose logging function
debug_log() {
    if [[ "${VERBOSE}" == "true" ]]; then
        log "DEBUG" "$*"
    fi
}

# Measure response time
measure_response_time() {
    local url="$1"
    local method="${2:-GET}"
    local data="${3:-}"
    local headers="${4:-}"
    
    local start_time=$(date +%s.%N)
    local response_code
    
    if [[ -n "${data}" ]]; then
        response_code=$(curl -s -o /dev/null -w "%{http_code}" -X "${method}" -d "${data}" ${headers} "${url}" 2>> "${TEST_LOG}")
    else
        response_code=$(curl -s -o /dev/null -w "%{http_code}" -X "${method}" ${headers} "${url}" 2>> "${TEST_LOG}")
    fi
    
    local end_time=$(date +%s.%N)
    local response_time=$(echo "${end_time} - ${start_time}" | bc -l 2>/dev/null || echo "0")
    
    echo "${response_time},${response_code}"
}

# Generate load test with Apache Bench (if available)
run_apache_bench() {
    local url="$1"
    local concurrency="$2"
    local requests="$3"
    local duration="$4"
    
    if ! command -v ab &> /dev/null; then
        echo "0,0,0,0,0" # Return zeros if ab not available
        return
    fi
    
    local ab_output
    ab_output=$(ab -n "${requests}" -c "${concurrency}" -t "${duration}" "${url}" 2>> "${TEST_LOG}" || echo "")
    
    if [[ -z "${ab_output}" ]]; then
        echo "0,0,0,0,0"
        return
    fi
    
    # Extract metrics from ab output
    local requests_per_second=$(echo "${ab_output}" | grep "Requests per second:" | awk '{print $4}' || echo "0")
    local time_per_request=$(echo "${ab_output}" | grep "Time per request:" | head -1 | awk '{print $4}' || echo "0")
    local failed_requests=$(echo "${ab_output}" | grep "Failed requests:" | awk '{print $3}' || echo "0")
    local connect_time=$(echo "${ab_output}" | grep "Connect:" | awk '{print $2}' || echo "0")
    
    echo "${requests_per_second},${time_per_request},${failed_requests},${connect_time},${requests}"
}

# Generate load test with curl (fallback)
run_curl_load_test() {
    local url="$1"
    local concurrency="$2"
    local duration="$3"
    
    local pids=()
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    local total_requests=0
    local successful_requests=0
    
    # Start concurrent requests
    for ((i=1; i<=concurrency; i++)); do
        (
            local requests=0
            local successful=0
            while [[ $(date +%s) -lt ${end_time} ]]; do
                if curl -s -f "${url}" &>> "${TEST_LOG}"; then
                    successful=$((successful + 1))
                fi
                requests=$((requests + 1))
                sleep 0.1
            done
            echo "${requests},${successful}"
        ) &
        pids+=($!)
    done
    
    # Wait for all processes and collect results
    for pid in "${pids[@]}"; do
        local result
        result=$(wait "${pid}" && echo "0" || echo "1")
        if [[ "${result}" == "0" ]]; then
            local output
            output=$(jobs -p "${pid}" 2>/dev/null || echo "0,0")
            local req=$(echo "${output}" | cut -d',' -f1)
            local succ=$(echo "${output}" | cut -d',' -f2)
            total_requests=$((total_requests + req))
            successful_requests=$((successful_requests + succ))
        fi
    done
    
    local actual_duration=$(($(date +%s) - start_time))
    local rps=$(echo "scale=2; ${total_requests} / ${actual_duration}" | bc -l 2>/dev/null || echo "0")
    
    echo "${rps},${actual_duration},${total_requests},${successful_requests}"
}

# =============================================================================
# Discord Bot Load Tests
# =============================================================================

test_discord_bot_health_endpoint() {
    log "INFO" "Testing Discord bot health endpoint performance..."
    
    local health_url="http://${DOMAIN}:${APP_PORT}/health"
    local response_info
    response_info=$(measure_response_time "${health_url}")
    
    local response_time=$(echo "${response_info}" | cut -d',' -f1)
    local response_code=$(echo "${response_info}" | cut -d',' -f2)
    
    debug_log "Health endpoint response time: ${response_time}s, code: ${response_code}"
    
    # Check if response time is acceptable (< 1 second)
    if (( $(echo "${response_time} < 1.0" | bc -l 2>/dev/null || echo "1") )); then
        test_result "Discord Bot Health Endpoint" "PASS" "Response time: ${response_time}s"
    else
        test_result "Discord Bot Health Endpoint" "FAIL" "Response time too high: ${response_time}s"
    fi
}

test_discord_bot_load() {
    if [[ "${SKIP_HEAVY_TESTS}" == "true" ]]; then
        test_result "Discord Bot Load Test" "SKIP" "Heavy tests disabled"
        return
    fi
    
    log "INFO" "Testing Discord bot load performance..."
    
    local app_url="http://${DOMAIN}:${APP_PORT}"
    local load_results
    
    # Try Apache Bench first, fallback to curl
    if command -v ab &> /dev/null; then
        load_results=$(run_apache_bench "${app_url}" "${LOAD_TEST_CONCURRENCY}" "1000" "${LOAD_TEST_DURATION}")
    else
        load_results=$(run_curl_load_test "${app_url}" "${LOAD_TEST_CONCURRENCY}" "${LOAD_TEST_DURATION}")
    fi
    
    local requests_per_second=$(echo "${load_results}" | cut -d',' -f1)
    local avg_response_time=$(echo "${load_results}" | cut -d',' -f2)
    local failed_requests=$(echo "${load_results}" | cut -d',' -f3)
    local total_requests=$(echo "${load_results}" | cut -d',' -f5)
    
    debug_log "Load test results: ${requests_per_second} RPS, ${avg_response_time}ms avg, ${failed_requests} failed"
    
    # Check if performance meets requirements
    local min_rps=50
    local max_failed_percent=5
    
    if (( $(echo "${requests_per_second} >= ${min_rps}" | bc -l 2>/dev/null || echo "1") )); then
        if [[ ${total_requests} -gt 0 ]]; then
            local failed_percent=$((failed_requests * 100 / total_requests))
            if [[ ${failed_percent} -le ${max_failed_percent} ]]; then
                test_result "Discord Bot Load Test" "PASS" "${requests_per_second} RPS, ${failed_percent}% failed"
            else
                test_result "Discord Bot Load Test" "FAIL" "Too many failed requests: ${failed_percent}%"
            fi
        else
            test_result "Discord Bot Load Test" "FAIL" "No requests completed"
        fi
    else
        test_result "Discord Bot Load Test" "FAIL" "RPS too low: ${requests_per_second} (min: ${min_rps})"
    fi
}

test_discord_bot_concurrent_requests() {
    if [[ "${SKIP_HEAVY_TESTS}" == "true" ]]; then
        test_result "Discord Bot Concurrent Requests" "SKIP" "Heavy tests disabled"
        return
    fi
    
    log "INFO" "Testing Discord bot concurrent request handling..."
    
    local app_url="http://${DOMAIN}:${APP_PORT}"
    local concurrency=20
    local duration=30
    
    local load_results
    load_results=$(run_curl_load_test "${app_url}" "${concurrency}" "${duration}")
    
    local requests_per_second=$(echo "${load_results}" | cut -d',' -f1)
    local total_requests=$(echo "${load_results}" | cut -d',' -f3)
    local successful_requests=$(echo "${load_results}" | cut -d',' -f4)
    
    debug_log "Concurrent test results: ${requests_per_second} RPS, ${successful_requests}/${total_requests} successful"
    
    if [[ ${total_requests} -gt 0 ]]; then
        local success_rate=$((successful_requests * 100 / total_requests))
        if [[ ${success_rate} -ge 95 ]]; then
            test_result "Discord Bot Concurrent Requests" "PASS" "${success_rate}% success rate"
        else
            test_result "Discord Bot Concurrent Requests" "FAIL" "Success rate too low: ${success_rate}%"
        fi
    else
        test_result "Discord Bot Concurrent Requests" "FAIL" "No requests completed"
    fi
}

# =============================================================================
# Database Performance Tests
# =============================================================================

test_postgres_connection_performance() {
    log "INFO" "Testing PostgreSQL connection performance..."
    
    if [[ -z "${DB_HOST:-}" || -z "${DB_USER:-}" || -z "${DB_PASSWORD:-}" || -z "${DB_NAME:-}" ]]; then
        test_result "PostgreSQL Connection Performance" "SKIP" "Database credentials not set"
        return
    fi
    
    local postgres_host="${DB_HOST:-localhost}"
    local start_time=$(date +%s.%N)
    
    if PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" &>> "${TEST_LOG}"; then
        local end_time=$(date +%s.%N)
        local connection_time=$(echo "${end_time} - ${start_time}" | bc -l 2>/dev/null || echo "0")
        
        debug_log "PostgreSQL connection time: ${connection_time}s"
        
        # Check if connection time is acceptable (< 2 seconds)
        if (( $(echo "${connection_time} < 2.0" | bc -l 2>/dev/null || echo "1") )); then
            test_result "PostgreSQL Connection Performance" "PASS" "Connection time: ${connection_time}s"
        else
            test_result "PostgreSQL Connection Performance" "FAIL" "Connection time too high: ${connection_time}s"
        fi
    else
        test_result "PostgreSQL Connection Performance" "FAIL" "Cannot connect to PostgreSQL"
    fi
}

test_postgres_query_performance() {
    log "INFO" "Testing PostgreSQL query performance..."
    
    if [[ -z "${DB_HOST:-}" || -z "${DB_USER:-}" || -z "${DB_PASSWORD:-}" || -z "${DB_NAME:-}" ]]; then
        test_result "PostgreSQL Query Performance" "SKIP" "Database credentials not set"
        return
    fi
    
    local postgres_host="${DB_HOST:-localhost}"
    local test_table="perf_test_$(date +%s)"
    
    # Create test table
    if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "CREATE TABLE ${test_table} (id SERIAL PRIMARY KEY, data TEXT, created_at TIMESTAMP DEFAULT NOW());" &>> "${TEST_LOG}"; then
        test_result "PostgreSQL Query Performance" "FAIL" "Cannot create test table"
        return
    fi
    
    # Test INSERT performance
    local start_time=$(date +%s.%N)
    for i in {1..100}; do
        PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "INSERT INTO ${test_table} (data) VALUES ('test_data_${i}');" &>> "${TEST_LOG}" || true
    done
    local end_time=$(date +%s.%N)
    local insert_time=$(echo "${end_time} - ${start_time}" | bc -l 2>/dev/null || echo "0")
    local insert_rate=$(echo "scale=2; 100 / ${insert_time}" | bc -l 2>/dev/null || echo "0")
    
    # Test SELECT performance
    start_time=$(date +%s.%N)
    PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT COUNT(*) FROM ${test_table};" &>> "${TEST_LOG}"
    end_time=$(date +%s.%N)
    local select_time=$(echo "${end_time} - ${start_time}" | bc -l 2>/dev/null || echo "0")
    
    # Clean up
    PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "DROP TABLE ${test_table};" &>> "${TEST_LOG}" || true
    
    debug_log "PostgreSQL performance: ${insert_rate} inserts/sec, ${select_time}s select time"
    
    # Check if performance meets requirements
    if (( $(echo "${insert_rate} >= 50" | bc -l 2>/dev/null || echo "1") )) && (( $(echo "${select_time} < 1.0" | bc -l 2>/dev/null || echo "1") )); then
        test_result "PostgreSQL Query Performance" "PASS" "${insert_rate} inserts/sec, ${select_time}s select"
    else
        test_result "PostgreSQL Query Performance" "FAIL" "Performance below threshold"
    fi
}

test_postgres_connection_pooling() {
    log "INFO" "Testing PostgreSQL connection pooling..."
    
    if [[ -z "${DB_HOST:-}" || -z "${DB_USER:-}" || -z "${DB_PASSWORD:-}" || -z "${DB_NAME:-}" ]]; then
        test_result "PostgreSQL Connection Pooling" "SKIP" "Database credentials not set"
        return
    fi
    
    local postgres_host="${DB_HOST:-localhost}"
    local pool_size=${DB_CONNECTION_POOL_SIZE}
    local pids=()
    local start_time=$(date +%s.%N)
    
    # Test concurrent connections
    for ((i=1; i<=pool_size; i++)); do
        (
            if PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT pg_sleep(0.5), ${i};" &>> "${TEST_LOG}"; then
                echo "SUCCESS"
            else
                echo "FAILED"
            fi
        ) &
        pids+=($!)
    done
    
    # Wait for all connections
    local successful_connections=0
    for pid in "${pids[@]}"; do
        local result
        result=$(wait "${pid}" && echo "SUCCESS" || echo "FAILED")
        if [[ "${result}" == "SUCCESS" ]]; then
            successful_connections=$((successful_connections + 1))
        fi
    done
    
    local end_time=$(date +%s.%N)
    local total_time=$(echo "${end_time} - ${start_time}" | bc -l 2>/dev/null || echo "0")
    
    debug_log "Connection pooling: ${successful_connections}/${pool_size} successful in ${total_time}s"
    
    if [[ ${successful_connections} -eq ${pool_size} ]]; then
        test_result "PostgreSQL Connection Pooling" "PASS" "${pool_size} concurrent connections successful"
    else
        test_result "PostgreSQL Connection Pooling" "FAIL" "Only ${successful_connections}/${pool_size} connections successful"
    fi
}

# =============================================================================
# Redis Performance Tests
# =============================================================================

test_redis_connection_performance() {
    log "INFO" "Testing Redis connection performance..."
    
    if [[ -z "${REDIS_HOST:-}" || -z "${REDIS_PASSWORD:-}" ]]; then
        test_result "Redis Connection Performance" "SKIP" "Redis credentials not set"
        return
    fi
    
    local redis_host="${REDIS_HOST:-localhost}"
    local start_time=$(date +%s.%N)
    
    if redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" ping &>> "${TEST_LOG}"; then
        local end_time=$(date +%s.%N)
        local connection_time=$(echo "${end_time} - ${start_time}" | bc -l 2>/dev/null || echo "0")
        
        debug_log "Redis connection time: ${connection_time}s"
        
        # Check if connection time is acceptable (< 1 second)
        if (( $(echo "${connection_time} < 1.0" | bc -l 2>/dev/null || echo "1") )); then
            test_result "Redis Connection Performance" "PASS" "Connection time: ${connection_time}s"
        else
            test_result "Redis Connection Performance" "FAIL" "Connection time too high: ${connection_time}s"
        fi
    else
        test_result "Redis Connection Performance" "FAIL" "Cannot connect to Redis"
    fi
}

test_redis_operations_performance() {
    log "INFO" "Testing Redis operations performance..."
    
    if [[ -z "${REDIS_HOST:-}" || -z "${REDIS_PASSWORD:-}" ]]; then
        test_result "Redis Operations Performance" "SKIP" "Redis credentials not set"
        return
    fi
    
    local redis_host="${REDIS_HOST:-localhost}"
    local test_key="perf_test_$(date +%s)"
    local operations=1000
    
    # Test SET performance
    local start_time=$(date +%s.%N)
    for ((i=1; i<=operations; i++)); do
        redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" set "${test_key}_${i}" "test_value_${i}" &>> "${TEST_LOG}" || true
    done
    local end_time=$(date +%s.%N)
    local set_time=$(echo "${end_time} - ${start_time}" | bc -l 2>/dev/null || echo "0")
    local set_rate=$(echo "scale=2; ${operations} / ${set_time}" | bc -l 2>/dev/null || echo "0")
    
    # Test GET performance
    start_time=$(date +%s.%N)
    for ((i=1; i<=operations; i++)); do
        redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" get "${test_key}_${i}" &>> "${TEST_LOG}" > /dev/null || true
    done
    end_time=$(date +%s.%N)
    local get_time=$(echo "${end_time} - ${start_time}" | bc -l 2>/dev/null || echo "0")
    local get_rate=$(echo "scale=2; ${operations} / ${get_time}" | bc -l 2>/dev/null || echo "0")
    
    # Clean up
    for ((i=1; i<=operations; i++)); do
        redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" del "${test_key}_${i}" &>> "${TEST_LOG}" || true
    done
    
    debug_log "Redis performance: ${set_rate} sets/sec, ${get_rate} gets/sec"
    
    # Check if performance meets requirements
    if (( $(echo "${set_rate} >= 1000" | bc -l 2>/dev/null || echo "1") )) && (( $(echo "${get_rate} >= 1000" | bc -l 2>/dev/null || echo "1") )); then
        test_result "Redis Operations Performance" "PASS" "${set_rate} sets/sec, ${get_rate} gets/sec"
    else
        test_result "Redis Operations Performance" "FAIL" "Performance below threshold"
    fi
}

test_redis_memory_usage() {
    log "INFO" "Testing Redis memory usage..."
    
    if [[ -z "${REDIS_HOST:-}" || -z "${REDIS_PASSWORD:-}" ]]; then
        test_result "Redis Memory Usage" "SKIP" "Redis credentials not set"
        return
    fi
    
    local redis_host="${REDIS_HOST:-localhost}"
    
    # Get current memory usage
    local memory_info
    memory_info=$(redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" info memory 2>> "${TEST_LOG}")
    
    if [[ -n "${memory_info}" ]]; then
        local used_memory=$(echo "${memory_info}" | grep "used_memory:" | cut -d':' -f2 | tr -d '\r')
        local max_memory=$(echo "${memory_info}" | grep "maxmemory:" | cut -d':' -f2 | tr -d '\r')
        
        debug_log "Redis memory usage: ${used_memory} bytes, max: ${max_memory} bytes"
        
        # Convert to MB for easier reading
        local used_mb=$(echo "scale=2; ${used_memory} / 1024 / 1024" | bc -l 2>/dev/null || echo "0")
        
        if [[ -n "${used_mb}" ]]; then
            test_result "Redis Memory Usage" "PASS" "Memory usage: ${used_mb} MB"
        else
            test_result "Redis Memory Usage" "FAIL" "Cannot determine memory usage"
        fi
    else
        test_result "Redis Memory Usage" "FAIL" "Cannot retrieve memory information"
    fi
}

# =============================================================================
# Resource Utilization Tests
# =============================================================================

test_cpu_utilization() {
    log "INFO" "Testing CPU utilization..."
    
    # Get current CPU usage
    local cpu_usage
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' 2>> "${TEST_LOG}" || echo "0")
    
    if [[ -n "${cpu_usage}" ]]; then
        debug_log "Current CPU usage: ${cpu_usage}%"
        
        # Check if CPU usage is reasonable (< 80%)
        if (( $(echo "${cpu_usage} < 80" | bc -l 2>/dev/null || echo "1") )); then
            test_result "CPU Utilization" "PASS" "CPU usage: ${cpu_usage}%"
        else
            test_result "CPU Utilization" "FAIL" "CPU usage too high: ${cpu_usage}%"
        fi
    else
        test_result "CPU Utilization" "FAIL" "Cannot determine CPU usage"
    fi
}

test_memory_utilization() {
    log "INFO" "Testing memory utilization..."
    
    # Get current memory usage
    local memory_info
    memory_info=$(free -m | grep "Mem:" 2>> "${TEST_LOG}")
    
    if [[ -n "${memory_info}" ]]; then
        local total=$(echo "${memory_info}" | awk '{print $2}')
        local used=$(echo "${memory_info}" | awk '{print $3}')
        local usage_percent=$((used * 100 / total))
        
        debug_log "Memory usage: ${used}MB/${total}MB (${usage_percent}%)"
        
        # Check if memory usage is reasonable (< 90%)
        if [[ ${usage_percent} -lt 90 ]]; then
            test_result "Memory Utilization" "PASS" "Memory usage: ${usage_percent}%"
        else
            test_result "Memory Utilization" "FAIL" "Memory usage too high: ${usage_percent}%"
        fi
    else
        test_result "Memory Utilization" "FAIL" "Cannot determine memory usage"
    fi
}

test_disk_utilization() {
    log "INFO" "Testing disk utilization..."
    
    # Get current disk usage
    local disk_usage
    disk_usage=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//' 2>> "${TEST_LOG}")
    
    if [[ -n "${disk_usage}" ]]; then
        debug_log "Disk usage: ${disk_usage}%"
        
        # Check if disk usage is reasonable (< 85%)
        if [[ ${disk_usage} -lt 85 ]]; then
            test_result "Disk Utilization" "PASS" "Disk usage: ${disk_usage}%"
        else
            test_result "Disk Utilization" "FAIL" "Disk usage too high: ${disk_usage}%"
        fi
    else
        test_result "Disk Utilization" "FAIL" "Cannot determine disk usage"
    fi
}

test_docker_resource_usage() {
    log "INFO" "Testing Docker container resource usage..."
    
    if ! command -v docker &> /dev/null; then
        test_result "Docker Resource Usage" "SKIP" "Docker not available"
        return
    fi
    
    # Get Docker container stats
    local container_stats
    container_stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>> "${TEST_LOG}")
    
    if [[ -n "${container_stats}" ]]; then
        debug_log "Docker stats: ${container_stats}"
        
        # Check if any container is using excessive resources
        local high_usage_containers=$(echo "${container_stats}" | grep -E "([8-9][0-9]\.[0-9]%|100\.0%)" | wc -l)
        
        if [[ ${high_usage_containers} -eq 0 ]]; then
            test_result "Docker Resource Usage" "PASS" "All containers within resource limits"
        else
            test_result "Docker Resource Usage" "FAIL" "${high_usage_containers} containers with high resource usage"
        fi
    else
        test_result "Docker Resource Usage" "FAIL" "Cannot retrieve Docker stats"
    fi
}

# =============================================================================
# Response Time Validation
# =============================================================================

test_api_response_times() {
    log "INFO" "Testing API response times..."
    
    local app_url="http://${DOMAIN}:${APP_PORT}"
    local endpoints=(
        "/health"
        "/metrics"
        "/status"
    )
    
    local slow_endpoints=()
    
    for endpoint in "${endpoints[@]}"; do
        local response_info
        response_info=$(measure_response_time "${app_url}${endpoint}")
        
        local response_time=$(echo "${response_info}" | cut -d',' -f1)
        local response_code=$(echo "${response_info}" | cut -d',' -f2)
        
        debug_log "Endpoint ${endpoint}: ${response_time}s, code: ${response_code}"
        
        # Check if response time is acceptable (< 2 seconds)
        if (( $(echo "${response_time} >= 2.0" | bc -l 2>/dev/null || echo "0") )); then
            slow_endpoints+=("${endpoint} (${response_time}s)")
        fi
    done
    
    if [[ ${#slow_endpoints[@]} -eq 0 ]]; then
        test_result "API Response Times" "PASS" "All endpoints responding quickly"
    else
        test_result "API Response Times" "FAIL" "Slow endpoints: ${slow_endpoints[*]}"
    fi
}

test_database_response_times() {
    log "INFO" "Testing database response times..."
    
    if [[ -z "${DB_HOST:-}" || -z "${DB_USER:-}" || -z "${DB_PASSWORD:-}" || -z "${DB_NAME:-}" ]]; then
        test_result "Database Response Times" "SKIP" "Database credentials not set"
        return
    fi
    
    local postgres_host="${DB_HOST:-localhost}"
    local queries=(
        "SELECT 1;"
        "SELECT version();"
        "SELECT COUNT(*) FROM pg_tables;"
    )
    
    local slow_queries=()
    
    for query in "${queries[@]}"; do
        local start_time=$(date +%s.%N)
        if PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "${query}" &>> "${TEST_LOG}"; then
            local end_time=$(date +%s.%N)
            local query_time=$(echo "${end_time} - ${start_time}" | bc -l 2>/dev/null || echo "0")
            
            debug_log "Query '${query}': ${query_time}s"
            
            # Check if query time is acceptable (< 1 second)
            if (( $(echo "${query_time} >= 1.0" | bc -l 2>/dev/null || echo "0") )); then
                slow_queries+=("${query} (${query_time}s)")
            fi
        else
            slow_queries+=("${query} (failed)")
        fi
    done
    
    if [[ ${#slow_queries[@]} -eq 0 ]]; then
        test_result "Database Response Times" "PASS" "All queries responding quickly"
    else
        test_result "Database Response Times" "FAIL" "Slow queries: ${slow_queries[*]}"
    fi
}

# =============================================================================
# Test Execution and Reporting
# =============================================================================

run_all_tests() {
    log "INFO" "Starting comprehensive performance test suite..."
    log "INFO" "Environment: ${ENVIRONMENT}"
    log "INFO" "Test log: ${TEST_LOG}"
    
    # Initialize test results file
    echo "result,test_name,message" > "${TEST_RESULTS_DIR}/performance-test-results.csv"
    
    # Discord bot load tests
    test_discord_bot_health_endpoint
    test_discord_bot_load
    test_discord_bot_concurrent_requests
    
    # Database performance tests
    test_postgres_connection_performance
    test_postgres_query_performance
    test_postgres_connection_pooling
    
    # Redis performance tests
    test_redis_connection_performance
    test_redis_operations_performance
    test_redis_memory_usage
    
    # Resource utilization tests
    test_cpu_utilization
    test_memory_utilization
    test_disk_utilization
    test_docker_resource_usage
    
    # Response time validation
    test_api_response_times
    test_database_response_times
    
    # Generate test report
    generate_test_report
}

generate_test_report() {
    log "INFO" "Generating performance test report..."
    
    local report_file="${TEST_RESULTS_DIR}/performance-test-report-$(date +%Y%m%d-%H%M%S).json"
    local summary_file="${TEST_RESULTS_DIR}/performance-test-summary-$(date +%Y%m%d-%H%M%S).txt"
    
    # Generate JSON report
    cat > "${report_file}" << EOF
{
    "test_suite": "performance-test-suite",
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "environment": "${ENVIRONMENT}",
    "total_tests": ${TOTAL_TESTS},
    "passed_tests": ${PASSED_TESTS},
    "failed_tests": ${FAILED_TESTS},
    "skipped_tests": ${SKIPPED_TESTS},
    "success_rate": "$(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")",
    "log_file": "${TEST_LOG}",
    "results_file": "${TEST_RESULTS_DIR}/performance-test-results.csv",
    "test_parameters": {
        "load_test_duration": "${LOAD_TEST_DURATION}",
        "load_test_concurrency": "${LOAD_TEST_CONCURRENCY}",
        "load_test_rps": "${LOAD_TEST_RPS}",
        "db_connection_pool_size": "${DB_CONNECTION_POOL_SIZE}",
        "redis_connection_pool_size": "${REDIS_CONNECTION_POOL_SIZE}"
    },
    "service_endpoints": {
        "discord_bot": "http://${DOMAIN}:${APP_PORT}",
        "postgres": "${DB_HOST:-localhost}:${POSTGRES_PORT}",
        "redis": "${REDIS_HOST:-localhost}:${REDIS_PORT}"
    }
}
EOF
    
    # Generate text summary
    cat > "${summary_file}" << EOF
Discord Bot Performance Test Suite Summary
========================================
Environment: ${ENVIRONMENT}
Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')

Test Parameters:
- Load Test Duration: ${LOAD_TEST_DURATION}s
- Load Test Concurrency: ${LOAD_TEST_CONCURRENCY}
- Load Test RPS: ${LOAD_TEST_RPS}
- DB Connection Pool Size: ${DB_CONNECTION_POOL_SIZE}
- Redis Connection Pool Size: ${REDIS_CONNECTION_POOL_SIZE}

Service Endpoints:
- Discord Bot: http://${DOMAIN}:${APP_PORT}
- PostgreSQL: ${DB_HOST:-localhost}:${POSTGRES_PORT}
- Redis: ${REDIS_HOST:-localhost}:${REDIS_PORT}

Test Results:
- Total Tests: ${TOTAL_TESTS}
- Passed: ${PASSED_TESTS}
- Failed: ${FAILED_TESTS}
- Skipped: ${SKIPPED_TESTS}
- Success Rate: $(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")%

Files:
- Test Log: ${TEST_LOG}
- JSON Report: ${report_file}
- CSV Results: ${TEST_RESULTS_DIR}/performance-test-results.csv

EOF
    
    if [[ ${FAILED_TESTS} -gt 0 ]]; then
        echo "FAILED TESTS:" >> "${summary_file}"
        grep "^FAIL," "${TEST_RESULTS_DIR}/performance-test-results.csv" | cut -d',' -f2- >> "${summary_file}"
        echo "" >> "${summary_file}"
    fi
    
    if [[ ${SKIPPED_TESTS} -gt 0 ]]; then
        echo "SKIPPED TESTS:" >> "${summary_file}"
        grep "^SKIP," "${TEST_RESULTS_DIR}/performance-test-results.csv" | cut -d',' -f2- >> "${summary_file}"
    fi
    
    log "SUCCESS" "Performance test report generated: ${report_file}"
    log "INFO" "Performance test summary: ${summary_file}"
    
    # Display summary
    echo ""
    echo "=========================================="
    echo "Performance Test Suite Summary"
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

Run comprehensive performance tests for Discord bot Coolify deployment.

OPTIONS:
    -e, --environment ENV     Target environment (staging|production) [default: staging]
    -t, --timeout SECONDS     Test timeout in seconds [default: 1800]
    -v, --verbose             Enable verbose logging
    -s, --skip-heavy-tests    Skip heavy load tests
    -d, --domain DOMAIN       Application domain [default: localhost]
    -p, --app-port PORT       Application port [default: 8080]
    --postgres-port PORT      PostgreSQL port [default: 5432]
    --redis-port PORT         Redis port [default: 6379]
    --load-duration SECONDS   Load test duration [default: 60]
    --load-concurrency NUM    Load test concurrency [default: 10]
    --load-rps NUM           Load test requests per second [default: 100]
    -h, --help                Show this help message

ENVIRONMENT VARIABLES:
    ENVIRONMENT               Target environment
    TEST_TIMEOUT              Test timeout in seconds
    VERBOSE                   Verbose logging (true/false)
    SKIP_HEAVY_TESTS         Skip heavy tests (true/false)
    DOMAIN                    Application domain
    APP_PORT                  Application port
    POSTGRES_PORT             PostgreSQL port
    REDIS_PORT                Redis port
    DB_HOST                   Database host
    DB_USER                   Database username
    DB_PASSWORD               Database password
    DB_NAME                   Database name
    REDIS_HOST                Redis host
    REDIS_PASSWORD            Redis password

EXAMPLES:
    # Run all performance tests for staging
    ${SCRIPT_NAME} -e staging

    # Run tests with verbose output
    ${SCRIPT_NAME} -v

    # Skip heavy load tests
    ${SCRIPT_NAME} -s

    # Custom load test parameters
    ${SCRIPT_NAME} --load-duration 120 --load-concurrency 20

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
            -s|--skip-heavy-tests)
                SKIP_HEAVY_TESTS="true"
                shift
                ;;
            -d|--domain)
                DOMAIN="$2"
                shift 2
                ;;
            -p|--app-port)
                APP_PORT="$2"
                shift 2
                ;;
            --postgres-port)
                POSTGRES_PORT="$2"
                shift 2
                ;;
            --redis-port)
                REDIS_PORT="$2"
                shift 2
                ;;
            --load-duration)
                LOAD_TEST_DURATION="$2"
                shift 2
                ;;
            --load-concurrency)
                LOAD_TEST_CONCURRENCY="$2"
                shift 2
                ;;
            --load-rps)
                LOAD_TEST_RPS="$2"
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
    log "INFO" "Starting Discord bot performance test suite..."
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Set timeout for the entire test suite
    timeout "${TEST_TIMEOUT}" bash -c "run_all_tests" || {
        log "ERROR" "Performance test suite timed out after ${TEST_TIMEOUT} seconds"
        exit 1
    }
}

# Execute main function with all arguments
main "$@"