#!/bin/bash

# =============================================================================
# Discord Bot Coolify Health Check Script
# =============================================================================
# This script performs comprehensive health monitoring for the Discord bot deployment,
# including service health checks, database connectivity tests, API endpoint validation,
# performance metrics validation, and automated reporting.
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
HEALTH_LOG="${LOG_DIR}/health-check-$(date +%Y%m%d-%H%M%S).log"
CONFIG_FILE="${PROJECT_ROOT}/coolify-environments.yml"
REPORT_FILE="${LOG_DIR}/health-report-$(date +%Y%m%d-%H%M%S).json"

# Create logs directory if it doesn't exist
mkdir -p "${LOG_DIR}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
COOLIFY_URL="${COOLIFY_URL:-}"
COOLIFY_API_TOKEN="${COOLIFY_API_TOKEN:-}"
ENVIRONMENT="${ENVIRONMENT:-staging}"
DOMAIN="${DOMAIN:-}"
VERBOSE="${VERBOSE:-false}"
CONTINUOUS="${CONTINUOUS:-false}"
INTERVAL="${INTERVAL:-300}"
TIMEOUT="${TIMEOUT:-30}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
EMAIL_RECIPIENTS="${EMAIL_RECIPIENTS:-}"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK:-}"
PERFORMANCE_THRESHOLD_CPU="${PERFORMANCE_THRESHOLD_CPU:-80}"
PERFORMANCE_THRESHOLD_MEMORY="${PERFORMANCE_THRESHOLD_MEMORY:-85}"
PERFORMANCE_THRESHOLD_DISK="${PERFORMANCE_THRESHOLD_DISK:-80}"
PERFORMANCE_THRESHOLD_RESPONSE_TIME="${PERFORMANCE_THRESHOLD_RESPONSE_TIME:-5000}"

# Health check results
declare -A HEALTH_RESULTS
OVERALL_HEALTH="healthy"
FAILED_CHECKS=0
TOTAL_CHECKS=0

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
    echo "[${timestamp}] [${level}] ${message}" >> "${HEALTH_LOG}"
    
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

# Error handling function
handle_error() {
    local exit_code=$?
    local line_number=$1
    
    log "ERROR" "Script failed at line ${line_number} with exit code ${exit_code}"
    exit "${exit_code}"
}

# Set up error handling
trap 'handle_error $LINENO' ERR

# Verbose logging function
debug_log() {
    if [[ "${VERBOSE}" == "true" ]]; then
        log "DEBUG" "$*"
    fi
}

# Record health check result
record_health_result() {
    local check_name="$1"
    local status="$2"
    local message="${3:-}"
    local response_time="${4:-}"
    
    HEALTH_RESULTS["${check_name}_status"]="${status}"
    HEALTH_RESULTS["${check_name}_message"]="${message}"
    HEALTH_RESULTS["${check_name}_response_time"]="${response_time}"
    HEALTH_RESULTS["${check_name}_timestamp"]=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    
    ((TOTAL_CHECKS++))
    
    if [[ "${status}" != "healthy" ]]; then
        ((FAILED_CHECKS++))
        OVERALL_HEALTH="unhealthy"
    fi
    
    log "${status^^}" "${check_name}: ${message}"
}

# Send alert notification
send_alert() {
    local severity="$1"
    local message="$2"
    local details="$3"
    
    log "INFO" "Sending ${severity} alert: ${message}"
    
    # Send to Slack webhook if configured
    if [[ -n "${SLACK_WEBHOOK}" ]]; then
        local slack_payload=$(cat <<EOF
{
    "text": "${severity^^}: Discord Bot Health Check",
    "attachments": [
        {
            "color": "$([ "${severity}" = "critical" ] && echo "danger" || echo "warning")",
            "fields": [
                {
                    "title": "Environment",
                    "value": "${ENVIRONMENT}",
                    "short": true
                },
                {
                    "title": "Timestamp",
                    "value": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
                    "short": true
                },
                {
                    "title": "Message",
                    "value": "${message}",
                    "short": false
                },
                {
                    "title": "Details",
                    "value": "${details}",
                    "short": false
                }
            ]
        }
    ]
}
EOF
)
        
        curl -s -X POST -H 'Content-type: application/json' \
            --data "${slack_payload}" "${SLACK_WEBHOOK}" &> /dev/null || true
    fi
    
    # Send to Discord webhook if configured
    if [[ -n "${DISCORD_WEBHOOK}" ]]; then
        local discord_payload=$(cat <<EOF
{
    "content": "**${severity^^}**: Discord Bot Health Check",
    "embeds": [
        {
            "title": "Health Check Alert",
            "description": "${message}",
            "color": $([ "${severity}" = "critical" ] && echo "16711680" || echo "16776960"),
            "fields": [
                {
                    "name": "Environment",
                    "value": "${ENVIRONMENT}",
                    "inline": true
                },
                {
                    "name": "Timestamp",
                    "value": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
                    "inline": true
                },
                {
                    "name": "Details",
                    "value": "${details}"
                }
            ]
        }
    ]
}
EOF
)
        
        curl -s -X POST -H 'Content-type: application/json' \
            --data "${discord_payload}" "${DISCORD_WEBHOOK}" &> /dev/null || true
    fi
    
    # Send to generic webhook if configured
    if [[ -n "${ALERT_WEBHOOK}" ]]; then
        local webhook_payload=$(cat <<EOF
{
    "severity": "${severity}",
    "service": "discord-bot",
    "environment": "${ENVIRONMENT}",
    "message": "${message}",
    "details": "${details}",
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "health_status": "${OVERALL_HEALTH}",
    "failed_checks": "${FAILED_CHECKS}",
    "total_checks": "${TOTAL_CHECKS}"
}
EOF
)
        
        curl -s -X POST -H 'Content-type: application/json' \
            --data "${webhook_payload}" "${ALERT_WEBHOOK}" &> /dev/null || true
    fi
    
    # Send email if configured (basic implementation)
    if [[ -n "${EMAIL_RECIPIENTS}" ]] && command -v mail &> /dev/null; then
        local email_subject="${severity^^}: Discord Bot Health Check - ${ENVIRONMENT}"
        local email_body="Environment: ${ENVIRONMENT}
Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
Message: ${message}
Details: ${details}
Health Status: ${OVERALL_HEALTH}
Failed Checks: ${FAILED_CHECKS}
Total Checks: ${TOTAL_CHECKS}"

        echo "${email_body}" | mail -s "${email_subject}" "${EMAIL_RECIPIENTS}" &> /dev/null || true
    fi
}

# =============================================================================
# Service Health Check Functions
# =============================================================================

# Check Discord bot service health
check_discord_bot_health() {
    local check_name="discord_bot"
    local start_time=$(date +%s%3N)
    
    log "INFO" "Checking Discord bot service health..."
    
    # Get application URL
    local app_url="${DOMAIN}"
    if [[ -z "${app_url}" ]]; then
        if command -v yq &> /dev/null; then
            app_url=$(yq eval ".environments.${ENVIRONMENT}.variables.DOMAIN" "${CONFIG_FILE}" 2>/dev/null || echo "")
        fi
    fi
    
    if [[ -z "${app_url}" ]]; then
        record_health_result "${check_name}" "unhealthy" "Could not determine application URL"
        return 1
    fi
    
    local health_url="http://${app_url}/health"
    
    # Perform health check
    local response
    local response_code
    local response_time
    
    response=$(curl -s -w "%{http_code}" -o /tmp/health_response.json --max-time "${TIMEOUT}" "${health_url}" 2>/dev/null || echo "000")
    response_code="${response: -3}"
    response_time=$(($(date +%s%3N) - start_time))
    
    if [[ "${response_code}" == "200" ]]; then
        # Parse health response
        if [[ -f /tmp/health_response.json ]] && command -v jq &> /dev/null; then
            local status
            local uptime
            local version
            
            status=$(jq -r '.status // "unknown"' /tmp/health_response.json 2>/dev/null || echo "unknown")
            uptime=$(jq -r '.uptime // "unknown"' /tmp/health_response.json 2>/dev/null || echo "unknown")
            version=$(jq -r '.version // "unknown"' /tmp/health_response.json 2>/dev/null || echo "unknown")
            
            if [[ "${status}" == "healthy" ]]; then
                record_health_result "${check_name}" "healthy" "Service is healthy (uptime: ${uptime}, version: ${version})" "${response_time}"
            else
                record_health_result "${check_name}" "unhealthy" "Service reported status: ${status}" "${response_time}"
            fi
        else
            record_health_result "${check_name}" "healthy" "Service is responding (HTTP ${response_code})" "${response_time}"
        fi
    else
        record_health_result "${check_name}" "unhealthy" "Service not responding (HTTP ${response_code})" "${response_time}"
    fi
    
    # Cleanup
    rm -f /tmp/health_response.json
}

# Check PostgreSQL database health
check_postgresql_health() {
    local check_name="postgresql"
    local start_time=$(date +%s%3N)
    
    log "INFO" "Checking PostgreSQL database health..."
    
    # Get database connection details
    local db_host="localhost"
    local db_port="5432"
    local db_user="${DB_USER:-}"
    local db_name="${DB_NAME:-}"
    
    if [[ -z "${db_user}" || -z "${db_name}" ]]; then
        record_health_result "${check_name}" "unhealthy" "Database connection details not configured"
        return 1
    fi
    
    # Check if PostgreSQL is accessible via Docker
    local container_name="discord-bot_postgres_1"
    if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
        container_name="discord-bot-postgres-1"
        if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
            record_health_result "${check_name}" "unhealthy" "PostgreSQL container not found"
            return 1
        fi
    fi
    
    # Test database connection
    local query="SELECT 1 as health_check, version() as version;"
    local response
    local response_time
    
    response=$(docker exec "${container_name}" psql -U "${db_user}" -d "${db_name}" -t -c "${query}" 2>/dev/null || echo "ERROR")
    response_time=$(($(date +%s%3N) - start_time))
    
    if [[ "${response}" == *"ERROR"* ]]; then
        record_health_result "${check_name}" "unhealthy" "Database connection failed" "${response_time}"
    else
        # Extract version from response
        local version
        version=$(echo "${response}" | grep -o "PostgreSQL [0-9.]*" | head -1 || echo "unknown")
        record_health_result "${check_name}" "healthy" "Database connection successful (${version})" "${response_time}"
    fi
}

# Check Redis cache health
check_redis_health() {
    local check_name="redis"
    local start_time=$(date +%s%3N)
    
    log "INFO" "Checking Redis cache health..."
    
    # Get Redis connection details
    local redis_host="localhost"
    local redis_port="6379"
    local redis_password="${REDIS_PASSWORD:-}"
    
    if [[ -z "${redis_password}" ]]; then
        record_health_result "${check_name}" "unhealthy" "Redis password not configured"
        return 1
    fi
    
    # Check if Redis is accessible via Docker
    local container_name="discord-bot_redis_1"
    if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
        container_name="discord-bot-redis-1"
        if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
            record_health_result "${check_name}" "unhealthy" "Redis container not found"
            return 1
        fi
    fi
    
    # Test Redis connection
    local response
    local response_time
    
    response=$(docker exec "${container_name}" redis-cli --raw -a "${redis_password}" ping 2>/dev/null || echo "ERROR")
    response_time=$(($(date +%s%3N) - start_time))
    
    if [[ "${response}" == "PONG" ]]; then
        # Get Redis info
        local redis_info
        redis_info=$(docker exec "${container_name}" redis-cli --raw -a "${redis_password}" info server 2>/dev/null | grep "redis_version" | cut -d: -f2 || echo "unknown")
        record_health_result "${check_name}" "healthy" "Redis connection successful (v${redis_info})" "${response_time}"
    else
        record_health_result "${check_name}" "unhealthy" "Redis connection failed" "${response_time}"
    fi
}

# =============================================================================
# API Endpoint Validation Functions
# =============================================================================

# Check API endpoints
check_api_endpoints() {
    local check_name="api_endpoints"
    local start_time=$(date +%s%3N)
    
    log "INFO" "Checking API endpoints..."
    
    # Get application URL
    local app_url="${DOMAIN}"
    if [[ -z "${app_url}" ]]; then
        if command -v yq &> /dev/null; then
            app_url=$(yq eval ".environments.${ENVIRONMENT}.variables.DOMAIN" "${CONFIG_FILE}" 2>/dev/null || echo "")
        fi
    fi
    
    if [[ -z "${app_url}" ]]; then
        record_health_result "${check_name}" "unhealthy" "Could not determine application URL"
        return 1
    fi
    
    local base_url="http://${app_url}"
    local endpoints=("/health" "/api/status" "/api/metrics")
    local failed_endpoints=0
    local total_endpoints=${#endpoints[@]}
    
    for endpoint in "${endpoints[@]}"; do
        local url="${base_url}${endpoint}"
        local response
        local response_code
        
        response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "${TIMEOUT}" "${url}" 2>/dev/null || echo "000")
        response_code="${response: -3}"
        
        if [[ "${response_code}" != "200" ]]; then
            ((failed_endpoints++))
            debug_log "Endpoint ${endpoint} failed with HTTP ${response_code}"
        fi
    done
    
    local response_time=$(($(date +%s%3N) - start_time))
    
    if [[ ${failed_endpoints} -eq 0 ]]; then
        record_health_result "${check_name}" "healthy" "All ${total_endpoints} API endpoints responding" "${response_time}"
    else
        record_health_result "${check_name}" "unhealthy" "${failed_endpoints}/${total_endpoints} API endpoints failing" "${response_time}"
    fi
}

# =============================================================================
# Performance Metrics Functions
# =============================================================================

# Check system performance metrics
check_performance_metrics() {
    local check_name="performance"
    local start_time=$(date +%s%3N)
    
    log "INFO" "Checking performance metrics..."
    
    local issues=()
    
    # Check CPU usage
    local cpu_usage
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    cpu_usage=${cpu_usage%.*}  # Remove decimal part
    
    if [[ ${cpu_usage} -gt ${PERFORMANCE_THRESHOLD_CPU} ]]; then
        issues+=("High CPU usage: ${cpu_usage}%")
    fi
    
    # Check memory usage
    local memory_usage
    memory_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [[ ${memory_usage} -gt ${PERFORMANCE_THRESHOLD_MEMORY} ]]; then
        issues+=("High memory usage: ${memory_usage}%")
    fi
    
    # Check disk usage
    local disk_usage
    disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [[ ${disk_usage} -gt ${PERFORMANCE_THRESHOLD_DISK} ]]; then
        issues+=("High disk usage: ${disk_usage}%")
    fi
    
    # Check Docker container resource usage
    local docker_stats
    docker_stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "")
    
    if [[ -n "${docker_stats}" ]]; then
        while IFS= read -r line; do
            if [[ "${line}" == *"discord-bot"* ]]; then
                local container_cpu
                local container_mem
                container_cpu=$(echo "${line}" | awk '{print $2}' | sed 's/%//')
                container_mem=$(echo "${line}" | awk '{print $3}' | sed 's/[^0-9.]//g')
                
                if [[ ${container_cpu%.*} -gt ${PERFORMANCE_THRESHOLD_CPU} ]]; then
                    issues+=("High container CPU: ${container_cpu}%")
                fi
                
                if [[ -n "${container_mem}" && ${container_mem%.*} -gt 90 ]]; then
                    issues+=("High container memory: ${container_mem}%")
                fi
            fi
        done <<< "${docker_stats}"
    fi
    
    local response_time=$(($(date +%s%3N) - start_time))
    
    if [[ ${#issues[@]} -eq 0 ]]; then
        record_health_result "${check_name}" "healthy" "Performance metrics within thresholds (CPU: ${cpu_usage}%, Memory: ${memory_usage}%, Disk: ${disk_usage}%)" "${response_time}"
    else
        local issues_str
        printf -v issues_str '%s, ' "${issues[@]}"
        record_health_result "${check_name}" "warning" "Performance issues detected: ${issues_str%, }" "${response_time}"
    fi
}

# =============================================================================
# Coolify Integration Functions
# =============================================================================

# Check Coolify deployment status
check_coolify_deployment_status() {
    local check_name="coolify_deployment"
    local start_time=$(date +%s%3N)
    
    log "INFO" "Checking Coolify deployment status..."
    
    if [[ -z "${COOLIFY_URL}" || -z "${COOLIFY_API_TOKEN}" ]]; then
        record_health_result "${check_name}" "warning" "Coolify credentials not configured, skipping check"
        return 0
    fi
    
    # Get application information
    local api_endpoint="${COOLIFY_URL%/}/api/v1/applications"
    local response
    
    response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}" 2>/dev/null || echo "")
    
    if [[ -z "${response}" ]]; then
        record_health_result "${check_name}" "unhealthy" "Failed to connect to Coolify API"
        return 1
    fi
    
    # Find discord-bot application
    local app_info
    app_info=$(echo "${response}" | jq -r '.data[] | select(.name == "discord-bot") // empty')
    
    if [[ -z "${app_info}" ]]; then
        record_health_result "${check_name}" "unhealthy" "Discord bot application not found in Coolify"
        return 1
    fi
    
    local app_id
    local latest_deployment_status
    local latest_deployment_url
    
    app_id=$(echo "${app_info}" | jq -r '.id')
    latest_deployment_status=$(echo "${app_info}" | jq -r '.latest_deployment.status // "unknown"')
    latest_deployment_url=$(echo "${app_info}" | jq -r '.latest_deployment.url // "unknown"')
    
    if [[ "${latest_deployment_status}" == "success" || "${latest_deployment_status}" == "completed" ]]; then
        record_health_result "${check_name}" "healthy" "Coolify deployment status: ${latest_deployment_status}" "$(($(date +%s%3N) - start_time))"
    else
        record_health_result "${check_name}" "unhealthy" "Coolify deployment status: ${latest_deployment_status}" "$(($(date +%s%3N) - start_time))"
    fi
}

# =============================================================================
# Reporting Functions
# =============================================================================

# Generate health report
generate_health_report() {
    log "INFO" "Generating health report..."
    
    local report_data
    
    report_data=$(cat <<EOF
{
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "environment": "${ENVIRONMENT}",
    "overall_health": "${OVERALL_HEALTH}",
    "total_checks": ${TOTAL_CHECKS},
    "failed_checks": ${FAILED_CHECKS},
    "health_results": {
EOF
)
    
    # Add health results for each check
    local first=true
    for key in "${!HEALTH_RESULTS[@]}"; do
        if [[ "${key}" == *"_status" ]]; then
            local check_name="${key%_status}"
            if [[ "${first}" == "true" ]]; then
                first=false
            else
                report_data+=","
            fi
            
            report_data+="
        \"${check_name}\": {
            \"status\": \"${HEALTH_RESULTS[${check_name}_status]}\",
            \"message\": \"${HEALTH_RESULTS[${check_name}_message]}\",
            \"response_time\": \"${HEALTH_RESULTS[${check_name}_response_time]:-}\",
            \"timestamp\": \"${HEALTH_RESULTS[${check_name}_timestamp]:-}\"
        }"
        fi
    done
    
    report_data+="
    },
    \"configuration\": {
        \"performance_threshold_cpu\": ${PERFORMANCE_THRESHOLD_CPU},
        \"performance_threshold_memory\": ${PERFORMANCE_THRESHOLD_MEMORY},
        \"performance_threshold_disk\": ${PERFORMANCE_THRESHOLD_DISK},
        \"performance_threshold_response_time\": ${PERFORMANCE_THRESHOLD_RESPONSE_TIME}
    },
    \"health_log\": \"${HEALTH_LOG}\"
}
EOF
)
    
    echo "${report_data}" > "${REPORT_FILE}"
    log "INFO" "Health report saved to: ${REPORT_FILE}"
    
    # Display summary
    log "INFO" "Health Check Summary:"
    log "INFO" "  - Overall Health: ${OVERALL_HEALTH}"
    log "INFO" "  - Total Checks: ${TOTAL_CHECKS}"
    log "INFO" "  - Failed Checks: ${FAILED_CHECKS}"
    log "INFO" "  - Health Log: ${HEALTH_LOG}"
    log "INFO" "  - Report File: ${REPORT_FILE}"
}

# =============================================================================
# Continuous Monitoring Functions
# =============================================================================

# Run continuous health monitoring
run_continuous_monitoring() {
    log "INFO" "Starting continuous health monitoring (interval: ${INTERVAL}s)..."
    
    while true; do
        log "INFO" "Running health check cycle at $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
        
        # Reset counters
        FAILED_CHECKS=0
        TOTAL_CHECKS=0
        declare -gA HEALTH_RESULTS=()
        OVERALL_HEALTH="healthy"
        
        # Run all health checks
        run_all_health_checks
        
        # Generate report
        generate_health_report
        
        # Send alert if unhealthy
        if [[ "${OVERALL_HEALTH}" != "healthy" ]]; then
            send_alert "warning" "Discord bot health check failed" "Overall health status: ${OVERALL_HEALTH}, Failed checks: ${FAILED_CHECKS}/${TOTAL_CHECKS}"
        fi
        
        # Wait for next interval
        sleep "${INTERVAL}"
    done
}

# =============================================================================
# Main Execution Functions
# =============================================================================

# Run all health checks
run_all_health_checks() {
    check_discord_bot_health
    check_postgresql_health
    check_redis_health
    check_api_endpoints
    check_performance_metrics
    check_coolify_deployment_status
}

# Display usage information
show_usage() {
    cat << EOF
Usage: ${SCRIPT_NAME} [OPTIONS]

Perform comprehensive health monitoring for the Discord bot deployment,
including service health checks, database connectivity tests, API endpoint validation,
performance metrics validation, and automated reporting.

OPTIONS:
    -e, --environment ENV     Target environment (staging|production) [default: staging]
    -d, --domain DOMAIN       Application domain
    -u, --url URL             Coolify instance URL
    -t, --token TOKEN         Coolify API token
    -v, --verbose             Enable verbose logging
    -c, --continuous          Run continuous monitoring
    -i, --interval SECONDS    Monitoring interval for continuous mode [default: 300]
    -o, --timeout SECONDS     Request timeout [default: 30]
    -w, --webhook URL         Alert webhook URL
    -s, --slack-webhook URL   Slack webhook URL
    -m, --email EMAIL         Email recipients for alerts
    --discord-webhook URL     Discord webhook URL
    --cpu-threshold PERCENT   CPU performance threshold [default: 80]
    --memory-threshold PERCENT Memory performance threshold [default: 85]
    --disk-threshold PERCENT  Disk performance threshold [default: 80]
    --response-threshold MS   Response time threshold [default: 5000]
    -h, --help                Show this help message

ENVIRONMENT VARIABLES:
    COOLIFY_URL               Coolify instance URL
    COOLIFY_API_TOKEN         Coolify API token
    ENVIRONMENT               Target environment
    DOMAIN                    Application domain
    VERBOSE                   Verbose logging (true/false)
    CONTINUOUS                Continuous monitoring (true/false)
    INTERVAL                  Monitoring interval in seconds
    TIMEOUT                   Request timeout in seconds
    ALERT_WEBHOOK             Alert webhook URL
    SLACK_WEBHOOK             Slack webhook URL
    EMAIL_RECIPIENTS          Email recipients for alerts
    DISCORD_WEBHOOK           Discord webhook URL
    PERFORMANCE_THRESHOLD_CPU CPU performance threshold percentage
    PERFORMANCE_THRESHOLD_MEMORY Memory performance threshold percentage
    PERFORMANCE_THRESHOLD_DISK Disk performance threshold percentage
    PERFORMANCE_THRESHOLD_RESPONSE_TIME Response time threshold in milliseconds

EXAMPLES:
    # Run single health check
    ${SCRIPT_NAME}

    # Run health check for production
    ${SCRIPT_NAME} -e production

    # Run continuous monitoring
    ${SCRIPT_NAME} -c -i 60

    # Run with alerts
    ${SCRIPT_NAME} -w https://hooks.slack.com/... -s https://hooks.slack.com/...

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
            -d|--domain)
                DOMAIN="$2"
                shift 2
                ;;
            -u|--url)
                COOLIFY_URL="$2"
                shift 2
                ;;
            -t|--token)
                COOLIFY_API_TOKEN="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            -c|--continuous)
                CONTINUOUS="true"
                shift
                ;;
            -i|--interval)
                INTERVAL="$2"
                shift 2
                ;;
            -o|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -w|--webhook)
                ALERT_WEBHOOK="$2"
                shift 2
                ;;
            -s|--slack-webhook)
                SLACK_WEBHOOK="$2"
                shift 2
                ;;
            -m|--email)
                EMAIL_RECIPIENTS="$2"
                shift 2
                ;;
            --discord-webhook)
                DISCORD_WEBHOOK="$2"
                shift 2
                ;;
            --cpu-threshold)
                PERFORMANCE_THRESHOLD_CPU="$2"
                shift 2
                ;;
            --memory-threshold)
                PERFORMANCE_THRESHOLD_MEMORY="$2"
                shift 2
                ;;
            --disk-threshold)
                PERFORMANCE_THRESHOLD_DISK="$2"
                shift 2
                ;;
            --response-threshold)
                PERFORMANCE_THRESHOLD_RESPONSE_TIME="$2"
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

# Main health check function
main() {
    log "INFO" "Starting Discord bot health check..."
    log "INFO" "Health check log: ${HEALTH_LOG}"
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Validate dependencies
    if ! command -v curl &> /dev/null; then
        log "ERROR" "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log "ERROR" "docker is required but not installed"
        exit 1
    fi
    
    # Run health checks
    if [[ "${CONTINUOUS}" == "true" ]]; then
        run_continuous_monitoring
    else
        run_all_health_checks
        generate_health_report
        
        # Send alert if unhealthy
        if [[ "${OVERALL_HEALTH}" != "healthy" ]]; then
            send_alert "warning" "Discord bot health check failed" "Overall health status: ${OVERALL_HEALTH}, Failed checks: ${FAILED_CHECKS}/${TOTAL_CHECKS}"
            exit 1
        else
            log "SUCCESS" "All health checks passed!"
        fi
    fi
}

# Execute main function with all arguments
main "$@"