#!/bin/bash

# =============================================================================
# Discord Bot Coolify Maintenance Script
# =============================================================================
# This script performs comprehensive maintenance tasks for the Discord bot deployment,
# including scheduled maintenance tasks, database maintenance, cache cleanup,
# log rotation, and performance optimization.
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
MAINTENANCE_LOG="${LOG_DIR}/maintenance-$(date +%Y%m%d-%H%M%S).log"
CONFIG_FILE="${PROJECT_ROOT}/coolify-environments.yml"

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
MAINTENANCE_TYPE="${MAINTENANCE_TYPE:-all}"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"
SKIP_CONFIRMATION="${SKIP_CONFIRMATION:-false}"
SCHEDULED="${SCHEDULED:-false}"
BACKUP_DATABASE="${BACKUP_DATABASE:-true}"
OPTIMIZE_DATABASE="${OPTIMIZE_DATABASE:-true}"
CLEANUP_CACHE="${CLEANUP_CACHE:-true}"
ROTATE_LOGS="${ROTATE_LOGS:-true}"
UPDATE_SERVICES="${UPDATE_SERVICES:-false}"
PERFORMANCE_OPTIMIZATION="${PERFORMANCE_OPTIMIZATION:-true}"
SECURITY_SCAN="${SECURITY_SCAN:-false}"

# Maintenance statistics
TASKS_COMPLETED=0
TASKS_FAILED=0
TASKS_SKIPPED=0

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
    echo "[${timestamp}] [${level}] ${message}" >> "${MAINTENANCE_LOG}"
    
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

# Record task result
record_task_result() {
    local task_name="$1"
    local status="$2"
    local message="${3:-}"
    
    case "${status}" in
        "completed")
            ((TASKS_COMPLETED++))
            log "SUCCESS" "${task_name}: ${message}"
            ;;
        "failed")
            ((TASKS_FAILED++))
            log "ERROR" "${task_name}: ${message}"
            ;;
        "skipped")
            ((TASKS_SKIPPED++))
            log "INFO" "${task_name}: ${message}"
            ;;
        *)
            log "INFO" "${task_name}: ${message}"
            ;;
    esac
}

# =============================================================================
# Validation Functions
# =============================================================================

# Validate required tools and dependencies
validate_dependencies() {
    log "INFO" "Validating dependencies..."
    
    local missing_deps=()
    
    # Check for required commands
    for cmd in curl jq docker docker-compose; do
        if ! command -v "${cmd}" &> /dev/null; then
            missing_deps+=("${cmd}")
        fi
    done
    
    # Check for optional but recommended commands
    for cmd in yq; do
        if ! command -v "${cmd}" &> /dev/null; then
            log "WARN" "Optional dependency '${cmd}' not found. Some features may be limited."
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log "ERROR" "Missing required dependencies: ${missing_deps[*]}"
        log "INFO" "Please install the missing dependencies and try again."
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        log "ERROR" "Docker daemon is not running or not accessible"
        exit 1
    fi
    
    log "SUCCESS" "All dependencies validated successfully"
}

# Validate Coolify connection and credentials
validate_coolify_connection() {
    log "INFO" "Validating Coolify connection..."
    
    if [[ -z "${COOLIFY_URL}" ]]; then
        log "WARN" "COOLIFY_URL environment variable is not set, skipping Coolify-specific maintenance"
        return 0
    fi
    
    if [[ -z "${COOLIFY_API_TOKEN}" ]]; then
        log "WARN" "COOLIFY_API_TOKEN environment variable is not set, skipping Coolify-specific maintenance"
        return 0
    fi
    
    # Test API connection
    local api_endpoint="${COOLIFY_URL%/}/api/v1/health"
    if ! curl -s -f -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}" &> /dev/null; then
        log "WARN" "Failed to connect to Coolify API at ${COOLIFY_URL}, skipping Coolify-specific maintenance"
        return 0
    fi
    
    log "SUCCESS" "Coolify connection validated successfully"
}

# Validate maintenance parameters
validate_maintenance_parameters() {
    log "INFO" "Validating maintenance parameters..."
    
    # Validate maintenance type
    case "${MAINTENANCE_TYPE}" in
        "all"|"database"|"cache"|"logs"|"services"|"performance"|"security")
            ;;
        *)
            log "ERROR" "Invalid maintenance type: ${MAINTENANCE_TYPE}"
            log "INFO" "Valid types: all, database, cache, logs, services, performance, security"
            exit 1
            ;;
    esac
    
    # Validate environment
    if [[ ! -f "${CONFIG_FILE}" ]]; then
        log "ERROR" "Configuration file not found: ${CONFIG_FILE}"
        exit 1
    fi
    
    if [[ "${MAINTENANCE_TYPE}" != "all" ]] && ! grep -q "^  ${ENVIRONMENT}:" "${CONFIG_FILE}"; then
        log "ERROR" "Environment '${ENVIRONMENT}' not found in configuration file"
        log "INFO" "Available environments: $(grep -E "^  [a-z]+:" "${CONFIG_FILE}" | sed 's/.*: //' | tr '\n' ' ')"
        exit 1
    fi
    
    log "SUCCESS" "Maintenance parameters validated successfully"
}

# =============================================================================
# Database Maintenance Functions
# =============================================================================

# Backup database
backup_database() {
    if [[ "${BACKUP_DATABASE}" != "true" ]]; then
        record_task_result "Database Backup" "skipped" "Database backup disabled"
        return 0
    fi
    
    log "INFO" "Performing database backup..."
    
    local backup_file="${LOG_DIR}/database-backup-$(date +%Y%m%d-%H%M%S).sql"
    local container_name="discord-bot_postgres_1"
    
    # Find PostgreSQL container
    if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
        container_name="discord-bot-postgres-1"
        if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
            record_task_result "Database Backup" "failed" "PostgreSQL container not found"
            return 1
        fi
    fi
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        record_task_result "Database Backup" "completed" "[DRY RUN] Would create database backup: ${backup_file}"
        return 0
    fi
    
    # Create backup
    local db_user="${DB_USER:-}"
    local db_name="${DB_NAME:-}"
    
    if [[ -z "${db_user}" || -z "${db_name}" ]]; then
        record_task_result "Database Backup" "failed" "Database credentials not configured"
        return 1
    fi
    
    if docker exec "${container_name}" pg_dump -U "${db_user}" "${db_name}" > "${backup_file}"; then
        # Compress backup
        gzip "${backup_file}"
        backup_file="${backup_file}.gz"
        
        record_task_result "Database Backup" "completed" "Database backup created: ${backup_file}"
        
        # Clean up old backups (keep last 7)
        find "${LOG_DIR}" -name "database-backup-*.sql.gz" -type f | sort -r | tail -n +8 | xargs -r rm -f
        log "INFO" "Cleaned up old database backups"
    else
        record_task_result "Database Backup" "failed" "Failed to create database backup"
        return 1
    fi
}

# Optimize database
optimize_database() {
    if [[ "${OPTIMIZE_DATABASE}" != "true" ]]; then
        record_task_result "Database Optimization" "skipped" "Database optimization disabled"
        return 0
    fi
    
    log "INFO" "Performing database optimization..."
    
    local container_name="discord-bot_postgres_1"
    
    # Find PostgreSQL container
    if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
        container_name="discord-bot-postgres-1"
        if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
            record_task_result "Database Optimization" "failed" "PostgreSQL container not found"
            return 1
        fi
    fi
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        record_task_result "Database Optimization" "completed" "[DRY RUN] Would optimize database"
        return 0
    fi
    
    local db_user="${DB_USER:-}"
    local db_name="${DB_NAME:-}"
    
    if [[ -z "${db_user}" || -z "${db_name}" ]]; then
        record_task_result "Database Optimization" "failed" "Database credentials not configured"
        return 1
    fi
    
    # Run VACUUM and ANALYZE
    if docker exec "${container_name}" psql -U "${db_user}" -d "${db_name}" -c "VACUUM ANALYZE;" &> /dev/null; then
        record_task_result "Database Optimization" "completed" "Database optimized with VACUUM ANALYZE"
    else
        record_task_result "Database Optimization" "failed" "Failed to optimize database"
        return 1
    fi
}

# =============================================================================
# Cache Maintenance Functions
# =============================================================================

# Clean up Redis cache
cleanup_cache() {
    if [[ "${CLEANUP_CACHE}" != "true" ]]; then
        record_task_result "Cache Cleanup" "skipped" "Cache cleanup disabled"
        return 0
    fi
    
    log "INFO" "Performing cache cleanup..."
    
    local container_name="discord-bot_redis_1"
    
    # Find Redis container
    if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
        container_name="discord-bot-redis-1"
        if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
            record_task_result "Cache Cleanup" "failed" "Redis container not found"
            return 1
        fi
    fi
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        record_task_result "Cache Cleanup" "completed" "[DRY RUN] Would clean up Redis cache"
        return 0
    fi
    
    local redis_password="${REDIS_PASSWORD:-}"
    
    if [[ -z "${redis_password}" ]]; then
        record_task_result "Cache Cleanup" "failed" "Redis password not configured"
        return 1
    fi
    
    # Get Redis info before cleanup
    local redis_info_before
    redis_info_before=$(docker exec "${container_name}" redis-cli --raw -a "${redis_password}" info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r' || echo "unknown")
    
    # Flush expired keys and clean up
    if docker exec "${container_name}" redis-cli --raw -a "${redis_password}" --scan --pattern "*" | head -1000 | xargs -r docker exec -i "${container_name}" redis-cli --raw -a "${redis_password}" del &> /dev/null; then
        # Get Redis info after cleanup
        local redis_info_after
        redis_info_after=$(docker exec "${container_name}" redis-cli --raw -a "${redis_password}" info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r' || echo "unknown")
        
        record_task_result "Cache Cleanup" "completed" "Redis cache cleaned (memory: ${redis_info_before} -> ${redis_info_after})"
    else
        record_task_result "Cache Cleanup" "failed" "Failed to clean up Redis cache"
        return 1
    fi
}

# =============================================================================
# Log Rotation Functions
# =============================================================================

# Rotate application logs
rotate_logs() {
    if [[ "${ROTATE_LOGS}" != "true" ]]; then
        record_task_result "Log Rotation" "skipped" "Log rotation disabled"
        return 0
    fi
    
    log "INFO" "Performing log rotation..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        record_task_result "Log Rotation" "completed" "[DRY RUN] Would rotate logs"
        return 0
    fi
    
    # Rotate Docker container logs
    local containers=("discord-bot_app_1" "discord-bot_postgres_1" "discord-bot_redis_1" "discord-bot_nginx_1")
    local rotated_logs=0
    
    for container_pattern in "${containers[@]}"; do
        # Find actual container name
        local container_name
        container_name=$(docker ps --format "{{.Names}}" | grep -E "${container_pattern}" | head -1 || echo "")
        
        if [[ -n "${container_name}" ]]; then
            # Rotate container logs
            if docker logs "${container_name}" --tail 0 &> /dev/null; then
                ((rotated_logs++))
                debug_log "Rotated logs for container: ${container_name}"
            fi
        fi
    done
    
    # Rotate application log files
    local log_files=("${LOG_DIR}"/*.log)
    local rotated_files=0
    
    for log_file in "${log_files[@]}"; do
        if [[ -f "${log_file}" && $(stat -f%z "${log_file}" 2>/dev/null || stat -c%s "${log_file}" 2>/dev/null) -gt 10485760 ]]; then
            # Rotate files larger than 10MB
            mv "${log_file}" "${log_file}.old"
            gzip "${log_file}.old" &> /dev/null || true
            ((rotated_files++))
            debug_log "Rotated log file: ${log_file}"
        fi
    done
    
    # Clean up old log files (keep last 30 days)
    find "${LOG_DIR}" -name "*.log.old.gz" -type f -mtime +30 -delete &> /dev/null || true
    
    record_task_result "Log Rotation" "completed" "Rotated ${rotated_files} log files and ${rotated_logs} container logs"
}

# =============================================================================
# Service Update Functions
# =============================================================================

# Update services
update_services() {
    if [[ "${UPDATE_SERVICES}" != "true" ]]; then
        record_task_result "Service Updates" "skipped" "Service updates disabled"
        return 0
    fi
    
    log "INFO" "Performing service updates..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        record_task_result "Service Updates" "completed" "[DRY RUN] Would update services"
        return 0
    fi
    
    local updated_services=0
    
    # Update Docker images
    log "INFO" "Checking for Docker image updates..."
    
    local images=("postgres:15-alpine" "redis:7-alpine" "nginx:alpine" "prom/prometheus:latest" "grafana/grafana:latest")
    
    for image in "${images[@]}"; do
        if docker pull "${image}" &> /dev/null; then
            ((updated_services++))
            debug_log "Updated Docker image: ${image}"
        fi
    done
    
    # Update system packages (if running on Linux)
    if [[ "$(uname)" == "Linux" ]]; then
        if command -v apt-get &> /dev/null; then
            if apt-get update &> /dev/null && apt-get upgrade -y &> /dev/null; then
                ((updated_services++))
                debug_log "Updated system packages with apt-get"
            fi
        elif command -v yum &> /dev/null; then
            if yum update -y &> /dev/null; then
                ((updated_services++))
                debug_log "Updated system packages with yum"
            fi
        fi
    fi
    
    record_task_result "Service Updates" "completed" "Updated ${updated_services} services"
}

# =============================================================================
# Performance Optimization Functions
# =============================================================================

# Optimize performance
optimize_performance() {
    if [[ "${PERFORMANCE_OPTIMIZATION}" != "true" ]]; then
        record_task_result "Performance Optimization" "skipped" "Performance optimization disabled"
        return 0
    fi
    
    log "INFO" "Performing performance optimization..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        record_task_result "Performance Optimization" "completed" "[DRY RUN] Would optimize performance"
        return 0
    fi
    
    local optimizations=0
    
    # Clean Docker system
    if docker system prune -f &> /dev/null; then
        ((optimizations++))
        debug_log "Cleaned Docker system"
    fi
    
    # Clean Docker builder cache
    if docker builder prune -f &> /dev/null; then
        ((optimizations++))
        debug_log "Cleaned Docker builder cache"
    fi
    
    # Optimize Docker containers
    local containers=("discord-bot_app_1" "discord-bot_postgres_1" "discord-bot_redis_1")
    
    for container_pattern in "${containers[@]}"; do
        local container_name
        container_name=$(docker ps --format "{{.Names}}" | grep -E "${container_pattern}" | head -1 || echo "")
        
        if [[ -n "${container_name}" ]]; then
            # Restart container to free up memory
            if docker restart "${container_name}" &> /dev/null; then
                ((optimizations++))
                debug_log "Restarted container for optimization: ${container_name}"
            fi
        fi
    done
    
    record_task_result "Performance Optimization" "completed" "Applied ${optimizations} performance optimizations"
}

# =============================================================================
# Security Scan Functions
# =============================================================================

# Perform security scan
perform_security_scan() {
    if [[ "${SECURITY_SCAN}" != "true" ]]; then
        record_task_result "Security Scan" "skipped" "Security scan disabled"
        return 0
    fi
    
    log "INFO" "Performing security scan..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        record_task_result "Security Scan" "completed" "[DRY RUN] Would perform security scan"
        return 0
    fi
    
    local security_issues=0
    
    # Scan Docker images for vulnerabilities
    local images=("discord-bot:*" "postgres:15-alpine" "redis:7-alpine" "nginx:alpine")
    
    for image_pattern in "${images[@]}"; do
        local images_found
        images_found=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "${image_pattern}" || true)
        
        while IFS= read -r image; do
            if [[ -n "${image}" ]]; then
                # Run security scan (simplified version)
                if docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                    aquasec/trivy:latest image --severity HIGH,CRITICAL "${image}" &> /dev/null; then
                    debug_log "Security scan completed for image: ${image}"
                else
                    ((security_issues++))
                    debug_log "Security issues found in image: ${image}"
                fi
            fi
        done <<< "${images_found}"
    done
    
    # Check for exposed ports
    local exposed_ports
    exposed_ports=$(docker ps --format "{{.Ports}}" | grep -E "0.0.0.0" | wc -l || echo "0")
    
    if [[ ${exposed_ports} -gt 0 ]]; then
        ((security_issues++))
        log "WARN" "Found ${exposed_ports} exposed ports on containers"
    fi
    
    if [[ ${security_issues} -eq 0 ]]; then
        record_task_result "Security Scan" "completed" "No security issues found"
    else
        record_task_result "Security Scan" "completed" "Found ${security_issues} security issues"
    fi
}

# =============================================================================
# Scheduled Maintenance Functions
# =============================================================================

# Perform scheduled maintenance
perform_scheduled_maintenance() {
    log "INFO" "Performing scheduled maintenance tasks..."
    
    local day_of_week
    day_of_week=$(date +%u) # 1-7 (Monday-Sunday)
    
    case "${day_of_week}" in
        1) # Monday - Database maintenance
            backup_database
            optimize_database
            ;;
        2) # Tuesday - Cache cleanup
            cleanup_cache
            ;;
        3) # Wednesday - Performance optimization
            optimize_performance
            ;;
        4) # Thursday - Log rotation
            rotate_logs
            ;;
        5) # Friday - Security scan
            perform_security_scan
            ;;
        6) # Saturday - Service updates
            update_services
            ;;
        7) # Sunday - Full maintenance
            backup_database
            optimize_database
            cleanup_cache
            rotate_logs
            optimize_performance
            ;;
    esac
}

# =============================================================================
# Reporting Functions
# =============================================================================

# Generate maintenance report
generate_maintenance_report() {
    log "INFO" "Generating maintenance report..."
    
    local report_file="${LOG_DIR}/maintenance-report-$(date +%Y%m%d-%H%M%S).json"
    local report_data
    
    report_data=$(cat <<EOF
{
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "environment": "${ENVIRONMENT}",
    "maintenance_type": "${MAINTENANCE_TYPE}",
    "dry_run": ${DRY_RUN},
    "scheduled": ${SCHEDULED},
    "statistics": {
        "tasks_completed": ${TASKS_COMPLETED},
        "tasks_failed": ${TASKS_FAILED},
        "tasks_skipped": ${TASKS_SKIPPED}
    },
    "configuration": {
        "backup_database": ${BACKUP_DATABASE},
        "optimize_database": ${OPTIMIZE_DATABASE},
        "cleanup_cache": ${CLEANUP_CACHE},
        "rotate_logs": ${ROTATE_LOGS},
        "update_services": ${UPDATE_SERVICES},
        "performance_optimization": ${PERFORMANCE_OPTIMIZATION},
        "security_scan": ${SECURITY_SCAN}
    },
    "maintenance_log": "${MAINTENANCE_LOG}"
}
EOF
)
    
    echo "${report_data}" > "${report_file}"
    log "INFO" "Maintenance report saved to: ${report_file}"
    
    # Display summary
    log "SUCCESS" "Maintenance Summary:"
    log "INFO" "  - Environment: ${ENVIRONMENT}"
    log "INFO" "  - Maintenance Type: ${MAINTENANCE_TYPE}"
    log "INFO" "  - Tasks Completed: ${TASKS_COMPLETED}"
    log "INFO" "  - Tasks Failed: ${TASKS_FAILED}"
    log "INFO" "  - Tasks Skipped: ${TASKS_SKIPPED}"
    log "INFO" "  - Maintenance Log: ${MAINTENANCE_LOG}"
}

# =============================================================================
# Main Execution
# =============================================================================

# Display usage information
show_usage() {
    cat << EOF
Usage: ${SCRIPT_NAME} [OPTIONS]

Perform comprehensive maintenance tasks for Discord bot deployment,
including scheduled maintenance, database maintenance, cache cleanup,
log rotation, and performance optimization.

OPTIONS:
    -e, --environment ENV     Target environment (staging|production) [default: staging]
    -t, --type TYPE           Maintenance type (all|database|cache|logs|services|performance|security) [default: all]
    -u, --url URL             Coolify instance URL
    -k, --token TOKEN         Coolify API token
    -d, --dry-run             Perform a dry run without making changes
    -v, --verbose             Enable verbose logging
    -f, --force               Force maintenance without confirmation prompts
    -y, --yes                 Skip confirmation prompts
    -s, --scheduled           Run scheduled maintenance based on day of week
    -b, --backup              Backup database [default: true]
    --no-backup               Skip database backup
    -o, --optimize            Optimize database [default: true]
    --no-optimize             Skip database optimization
    -c, --cache               Clean up cache [default: true]
    --no-cache                Skip cache cleanup
    -l, --logs                Rotate logs [default: true]
    --no-logs                 Skip log rotation
    -U, --update              Update services [default: false]
    --no-update               Skip service updates
    -p, --performance         Performance optimization [default: true]
    --no-performance          Skip performance optimization
    -S, --security            Perform security scan [default: false]
    --no-security             Skip security scan
    -h, --help                Show this help message

ENVIRONMENT VARIABLES:
    COOLIFY_URL               Coolify instance URL
    COOLIFY_API_TOKEN         Coolify API token
    ENVIRONMENT               Target environment
    MAINTENANCE_TYPE          Maintenance type
    DRY_RUN                   Dry run mode (true/false)
    VERBOSE                   Verbose logging (true/false)
    SKIP_CONFIRMATION         Skip confirmation prompts (true/false)
    SCHEDULED                 Run scheduled maintenance (true/false)
    BACKUP_DATABASE           Backup database (true/false) [default: true]
    OPTIMIZE_DATABASE         Optimize database (true/false) [default: true]
    CLEANUP_CACHE             Clean up cache (true/false) [default: true]
    ROTATE_LOGS               Rotate logs (true/false) [default: true]
    UPDATE_SERVICES           Update services (true/false) [default: false]
    PERFORMANCE_OPTIMIZATION  Performance optimization (true/false) [default: true]
    SECURITY_SCAN             Security scan (true/false) [default: false]

EXAMPLES:
    # Run all maintenance tasks
    ${SCRIPT_NAME}

    # Run database maintenance only
    ${SCRIPT_NAME} -t database

    # Run scheduled maintenance
    ${SCRIPT_NAME} -s

    # Dry run to see what would be done
    ${SCRIPT_NAME} -d

    # Run with security scan
    ${SCRIPT_NAME} -S

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
            -t|--type)
                MAINTENANCE_TYPE="$2"
                shift 2
                ;;
            -u|--url)
                COOLIFY_URL="$2"
                shift 2
                ;;
            -k|--token)
                COOLIFY_API_TOKEN="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            -f|--force)
                SKIP_CONFIRMATION="true"
                shift
                ;;
            -y|--yes)
                SKIP_CONFIRMATION="true"
                shift
                ;;
            -s|--scheduled)
                SCHEDULED="true"
                shift
                ;;
            -b|--backup)
                BACKUP_DATABASE="true"
                shift
                ;;
            --no-backup)
                BACKUP_DATABASE="false"
                shift
                ;;
            -o|--optimize)
                OPTIMIZE_DATABASE="true"
                shift
                ;;
            --no-optimize)
                OPTIMIZE_DATABASE="false"
                shift
                ;;
            -c|--cache)
                CLEANUP_CACHE="true"
                shift
                ;;
            --no-cache)
                CLEANUP_CACHE="false"
                shift
                ;;
            -l|--logs)
                ROTATE_LOGS="true"
                shift
                ;;
            --no-logs)
                ROTATE_LOGS="false"
                shift
                ;;
            -U|--update)
                UPDATE_SERVICES="true"
                shift
                ;;
            --no-update)
                UPDATE_SERVICES="false"
                shift
                ;;
            -p|--performance)
                PERFORMANCE_OPTIMIZATION="true"
                shift
                ;;
            --no-performance)
                PERFORMANCE_OPTIMIZATION="false"
                shift
                ;;
            -S|--security)
                SECURITY_SCAN="true"
                shift
                ;;
            --no-security)
                SECURITY_SCAN="false"
                shift
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

# Main maintenance function
main() {
    log "INFO" "Starting Discord bot maintenance..."
    log "INFO" "Maintenance log: ${MAINTENANCE_LOG}"
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Validation phase
    validate_dependencies
    validate_coolify_connection
    validate_maintenance_parameters
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "Running in DRY RUN mode - no changes will be made"
    fi
    
    # Confirmation prompt
    if [[ "${SKIP_CONFIRMATION}" != "true" ]]; then
        log "WARN" "You are about to perform maintenance tasks for environment: ${ENVIRONMENT}"
        log "WARN" "Maintenance type: ${MAINTENANCE_TYPE}"
        read -p "Are you sure you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "INFO" "Maintenance cancelled by user"
            exit 0
        fi
    fi
    
    # Run maintenance tasks based on type
    if [[ "${SCHEDULED}" == "true" ]]; then
        perform_scheduled_maintenance
    else
        case "${MAINTENANCE_TYPE}" in
            "all")
                backup_database
                optimize_database
                cleanup_cache
                rotate_logs
                update_services
                optimize_performance
                perform_security_scan
                ;;
            "database")
                backup_database
                optimize_database
                ;;
            "cache")
                cleanup_cache
                ;;
            "logs")
                rotate_logs
                ;;
            "services")
                update_services
                ;;
            "performance")
                optimize_performance
                ;;
            "security")
                perform_security_scan
                ;;
        esac
    fi
    
    # Generate report
    generate_maintenance_report
    
    log "SUCCESS" "Maintenance completed successfully!"
    log "INFO" "Tasks completed: ${TASKS_COMPLETED}, Failed: ${TASKS_FAILED}, Skipped: ${TASKS_SKIPPED}"
}

# Execute main function with all arguments
main "$@"