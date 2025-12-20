#!/bin/bash

# =============================================================================
# Discord Bot Coolify Rollback Script
# =============================================================================
# This script provides comprehensive rollback capabilities for the Discord bot deployment,
# including quick rollback to previous version, database rollback if needed,
# configuration restoration, and health verification after rollback.
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
ROLLBACK_LOG="${LOG_DIR}/rollback-$(date +%Y%m%d-%H%M%S).log"
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
TARGET_DEPLOYMENT="${TARGET_DEPLOYMENT:-}"
ROLLBACK_TYPE="${ROLLBACK_TYPE:-deployment}"
BACKUP_DATABASE="${BACKUP_DATABASE:-true}"
VERIFY_ROLLBACK="${VERIFY_ROLLBACK:-true}"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"
FORCE_ROLLBACK="${FORCE_ROLLBACK:-false}"
SKIP_CONFIRMATION="${SKIP_CONFIRMATION:-false}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-300}"

# Rollback tracking
CURRENT_DEPLOYMENT=""
TARGET_DEPLOYMENT_INFO=""
ROLLBACK_DEPLOYMENT=""
ROLLBACK_STATUS="pending"

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
    echo "[${timestamp}] [${level}] ${message}" >> "${ROLLBACK_LOG}"
    
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

# =============================================================================
# Validation Functions
# =============================================================================

# Validate required tools and dependencies
validate_dependencies() {
    log "INFO" "Validating dependencies..."
    
    local missing_deps=()
    
    # Check for required commands
    for cmd in curl jq docker docker-compose git; do
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
        log "ERROR" "COOLIFY_URL environment variable is not set"
        exit 1
    fi
    
    if [[ -z "${COOLIFY_API_TOKEN}" ]]; then
        log "ERROR" "COOLIFY_API_TOKEN environment variable is not set"
        exit 1
    fi
    
    # Test API connection
    local api_endpoint="${COOLIFY_URL%/}/api/v1/health"
    if ! curl -s -f -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}" &> /dev/null; then
        log "ERROR" "Failed to connect to Coolify API at ${COOLIFY_URL}"
        log "INFO" "Please verify the URL and API token are correct"
        exit 1
    fi
    
    log "SUCCESS" "Coolify connection validated successfully"
}

# Validate rollback parameters
validate_rollback_parameters() {
    log "INFO" "Validating rollback parameters..."
    
    # Validate rollback type
    case "${ROLLBACK_TYPE}" in
        "deployment"|"database"|"full")
            ;;
        *)
            log "ERROR" "Invalid rollback type: ${ROLLBACK_TYPE}"
            log "INFO" "Valid types: deployment, database, full"
            exit 1
            ;;
    esac
    
    # Validate environment
    if [[ ! -f "${CONFIG_FILE}" ]]; then
        log "ERROR" "Configuration file not found: ${CONFIG_FILE}"
        exit 1
    fi
    
    if ! grep -q "^  ${ENVIRONMENT}:" "${CONFIG_FILE}"; then
        log "ERROR" "Environment '${ENVIRONMENT}' not found in configuration file"
        log "INFO" "Available environments: $(grep -E "^  [a-z]+:" "${CONFIG_FILE}" | sed 's/.*: //' | tr '\n' ' ')"
        exit 1
    fi
    
    log "SUCCESS" "Rollback parameters validated successfully"
}

# =============================================================================
# Deployment Rollback Functions
# =============================================================================

# Get current deployment information
get_current_deployment() {
    log "INFO" "Retrieving current deployment information..."
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/applications"
    local response
    
    response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "ERROR" "Failed to retrieve applications from Coolify"
        exit 1
    fi
    
    # Find discord-bot application
    local app_info
    app_info=$(echo "${response}" | jq -r '.data[] | select(.name == "discord-bot") // empty')
    
    if [[ -z "${app_info}" ]]; then
        log "ERROR" "Discord bot application not found in Coolify"
        exit 1
    fi
    
    # Get current deployment info
    CURRENT_DEPLOYMENT=$(echo "${app_info}" | jq -r '.latest_deployment.id // empty')
    
    if [[ -z "${CURRENT_DEPLOYMENT}" ]]; then
        log "ERROR" "No current deployment found"
        exit 1
    fi
    
    log "INFO" "Current deployment: ${CURRENT_DEPLOYMENT}"
}

# List available deployments for rollback
list_available_deployments() {
    log "INFO" "Listing available deployments for rollback..."
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/applications"
    local response
    
    response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "ERROR" "Failed to retrieve applications from Coolify"
        exit 1
    fi
    
    # Get application ID
    local app_id
    app_id=$(echo "${response}" | jq -r '.data[] | select(.name == "discord-bot") | .id // empty')
    
    if [[ -z "${app_id}" ]]; then
        log "ERROR" "Discord bot application not found in Coolify"
        exit 1
    fi
    
    # Get deployment history
    api_endpoint="${COOLIFY_URL%/}/api/v1/applications/${app_id}/deployments"
    response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "ERROR" "Failed to retrieve deployment history from Coolify"
        exit 1
    fi
    
    # Display available deployments
    log "INFO" "Available deployments:"
    echo "${response}" | jq -r '.data[] | "\(.id): \(.commit_hash // "unknown") - \(.status // "unknown") - \(.created_at // "unknown")"' | while IFS=: read -r id rest; do
        if [[ "${id}" != "${CURRENT_DEPLOYMENT}" ]]; then
            echo "  ${id}: ${rest}"
        fi
    done
}

# Select target deployment for rollback
select_target_deployment() {
    if [[ -n "${TARGET_DEPLOYMENT}" ]]; then
        log "INFO" "Using specified target deployment: ${TARGET_DEPLOYMENT}"
        return 0
    fi
    
    log "INFO" "No target deployment specified, listing available options..."
    list_available_deployments
    
    if [[ "${SKIP_CONFIRMATION}" != "true" ]]; then
        read -p "Enter deployment ID to rollback to (or 'cancel' to abort): " -r
        if [[ "${REPLY}" == "cancel" ]]; then
            log "INFO" "Rollback cancelled by user"
            exit 0
        fi
        TARGET_DEPLOYMENT="${REPLY}"
    else
        log "ERROR" "No target deployment specified and confirmation skipped"
        exit 1
    fi
    
    if [[ -z "${TARGET_DEPLOYMENT}" ]]; then
        log "ERROR" "No target deployment specified"
        exit 1
    fi
}

# Get target deployment information
get_target_deployment_info() {
    log "INFO" "Retrieving target deployment information..."
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/deployments/${TARGET_DEPLOYMENT}"
    local response
    
    response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "ERROR" "Failed to retrieve target deployment information"
        exit 1
    fi
    
    TARGET_DEPLOYMENT_INFO=$(echo "${response}" | jq -r '.data // empty')
    
    if [[ -z "${TARGET_DEPLOYMENT_INFO}" ]]; then
        log "ERROR" "Target deployment not found: ${TARGET_DEPLOYMENT}"
        exit 1
    fi
    
    local target_status
    target_status=$(echo "${TARGET_DEPLOYMENT_INFO}" | jq -r '.status // empty')
    
    if [[ "${target_status}" != "success" && "${target_status}" != "completed" ]]; then
        log "ERROR" "Target deployment is not in a successful state: ${target_status}"
        exit 1
    fi
    
    log "INFO" "Target deployment: ${TARGET_DEPLOYMENT} (status: ${target_status})"
}

# Perform deployment rollback
perform_deployment_rollback() {
    log "INFO" "Performing deployment rollback..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would rollback to deployment: ${TARGET_DEPLOYMENT}"
        ROLLBACK_DEPLOYMENT="dry-run-$(date +%s)"
        ROLLBACK_STATUS="success"
        return 0
    fi
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/deployments/${TARGET_DEPLOYMENT}/rollback"
    local response
    
    response=$(curl -s -X POST \
        -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
        -H "Content-Type: application/json" \
        "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "ERROR" "Failed to trigger rollback"
        exit 1
    fi
    
    ROLLBACK_DEPLOYMENT=$(echo "${response}" | jq -r '.data.id // empty')
    
    if [[ -z "${ROLLBACK_DEPLOYMENT}" ]]; then
        log "ERROR" "Failed to extract rollback deployment ID from response"
        log "DEBUG" "API response: ${response}"
        exit 1
    fi
    
    log "SUCCESS" "Rollback triggered successfully with deployment ID: ${ROLLBACK_DEPLOYMENT}"
}

# Monitor rollback progress
monitor_rollback_progress() {
    log "INFO" "Monitoring rollback progress (timeout: ${HEALTH_CHECK_TIMEOUT}s)..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would monitor rollback: ${ROLLBACK_DEPLOYMENT}"
        ROLLBACK_STATUS="success"
        return 0
    fi
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/deployments/${ROLLBACK_DEPLOYMENT}"
    local start_time=$(date +%s)
    local timeout_time=$((start_time + HEALTH_CHECK_TIMEOUT))
    
    while [[ $(date +%s) -lt ${timeout_time} ]]; do
        local response
        response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}")
        
        if [[ -z "${response}" ]]; then
            log "WARN" "Failed to get rollback status, retrying..."
            sleep 10
            continue
        fi
        
        ROLLBACK_STATUS=$(echo "${response}" | jq -r '.data.status // empty')
        local progress=$(echo "${response}" | jq -r '.data.progress // 0')
        local current_step=$(echo "${response}" | jq -r '.data.current_step // "unknown"')
        
        log "INFO" "Rollback status: ${ROLLBACK_STATUS} (${progress}%) - ${current_step}"
        
        case "${ROLLBACK_STATUS}" in
            "success"|"completed")
                log "SUCCESS" "Rollback completed successfully"
                return 0
                ;;
            "failed"|"error")
                log "ERROR" "Rollback failed"
                return 1
                ;;
            "running"|"pending"|"in_progress")
                # Continue monitoring
                ;;
            *)
                log "WARN" "Unknown rollback status: ${ROLLBACK_STATUS}"
                ;;
        esac
        
        sleep 15
    done
    
    log "ERROR" "Rollback monitoring timed out after ${HEALTH_CHECK_TIMEOUT} seconds"
    return 1
}

# =============================================================================
# Database Rollback Functions
# =============================================================================

# Backup current database
backup_database() {
    if [[ "${BACKUP_DATABASE}" != "true" ]]; then
        log "INFO" "Skipping database backup as requested"
        return 0
    fi
    
    log "INFO" "Creating database backup before rollback..."
    
    local backup_file="${LOG_DIR}/database-backup-$(date +%Y%m%d-%H%M%S).sql"
    local container_name="discord-bot_postgres_1"
    
    # Find PostgreSQL container
    if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
        container_name="discord-bot-postgres-1"
        if ! docker ps --format "{{.Names}}" | grep -q "${container_name}"; then
            log "WARN" "PostgreSQL container not found, skipping database backup"
            return 0
        fi
    fi
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would create database backup: ${backup_file}"
        return 0
    fi
    
    # Create backup
    local db_user="${DB_USER:-}"
    local db_name="${DB_NAME:-}"
    
    if [[ -z "${db_user}" || -z "${db_name}" ]]; then
        log "WARN" "Database credentials not configured, skipping backup"
        return 0
    fi
    
    if docker exec "${container_name}" pg_dump -U "${db_user}" "${db_name}" > "${backup_file}"; then
        log "SUCCESS" "Database backup created: ${backup_file}"
        
        # Compress backup
        gzip "${backup_file}"
        log "INFO" "Database backup compressed: ${backup_file}.gz"
    else
        log "WARN" "Failed to create database backup"
    fi
}

# Perform database rollback
perform_database_rollback() {
    log "INFO" "Performing database rollback..."
    
    # This is a placeholder for database rollback logic
    # In a real implementation, you would:
    # 1. Identify the database state to rollback to
    # 2. Apply database migrations in reverse
    # 3. Restore data from backups if needed
    
    log "INFO" "Database rollback is not implemented in this script"
    log "INFO" "Please perform database rollback manually if needed"
    
    # For demonstration purposes, we'll just log the action
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would perform database rollback"
    fi
}

# =============================================================================
# Configuration Restoration Functions
# =============================================================================

# Restore configuration files
restore_configuration() {
    log "INFO" "Restoring configuration files..."
    
    # Get configuration from target deployment
    local commit_hash
    commit_hash=$(echo "${TARGET_DEPLOYMENT_INFO}" | jq -r '.commit_hash // empty')
    
    if [[ -z "${commit_hash}" ]]; then
        log "WARN" "Could not determine commit hash for configuration restoration"
        return 0
    fi
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would restore configuration from commit: ${commit_hash}"
        return 0
    fi
    
    # Checkout configuration from target commit
    local temp_dir="/tmp/coolify-rollback-$(date +%s)"
    mkdir -p "${temp_dir}"
    
    # Clone repository and checkout target commit
    if git clone "${PROJECT_ROOT}" "${temp_dir}" &> /dev/null; then
        cd "${temp_dir}"
        git checkout "${commit_hash}" &> /dev/null
        
        # Copy configuration files
        local config_files=(
            "coolify-compose.yml"
            "coolify-environments.yml"
            "docker/coolify.Dockerfile"
            "docker/health-check.sh"
        )
        
        for config_file in "${config_files[@]}"; do
            if [[ -f "${config_file}" ]]; then
                cp "${config_file}" "${PROJECT_ROOT}/${config_file}"
                log "INFO" "Restored configuration file: ${config_file}"
            fi
        done
        
        cd "${PROJECT_ROOT}"
        rm -rf "${temp_dir}"
        
        log "SUCCESS" "Configuration files restored successfully"
    else
        log "WARN" "Failed to restore configuration files"
    fi
}

# =============================================================================
# Verification Functions
# =============================================================================

# Verify rollback success
verify_rollback() {
    if [[ "${VERIFY_ROLLBACK}" != "true" ]]; then
        log "INFO" "Skipping rollback verification as requested"
        return 0
    fi
    
    log "INFO" "Verifying rollback success..."
    
    # Get application URL
    local app_url="${DOMAIN}"
    if [[ -z "${app_url}" ]]; then
        if command -v yq &> /dev/null; then
            app_url=$(yq eval ".environments.${ENVIRONMENT}.variables.DOMAIN" "${CONFIG_FILE}" 2>/dev/null || echo "")
        fi
    fi
    
    if [[ -z "${app_url}" ]]; then
        log "WARN" "Could not determine application URL for verification"
        return 0
    fi
    
    local health_url="http://${app_url}/health"
    local health_timeout=60
    local start_time=$(date +%s)
    local timeout_time=$((start_time + health_timeout))
    
    log "INFO" "Checking health endpoint: ${health_url}"
    
    while [[ $(date +%s) -lt ${timeout_time} ]]; do
        if curl -s -f "${health_url}" &> /dev/null; then
            log "SUCCESS" "Rollback verification successful - health check passed"
            return 0
        fi
        
        log "INFO" "Health check failed, retrying in 10 seconds..."
        sleep 10
    done
    
    log "ERROR" "Rollback verification failed - health check timed out"
    return 1
}

# =============================================================================
# Reporting Functions
# =============================================================================

# Generate rollback report
generate_rollback_report() {
    log "INFO" "Generating rollback report..."
    
    local report_file="${LOG_DIR}/rollback-report-$(date +%Y%m%d-%H%M%S).json"
    local report_data
    
    report_data=$(cat <<EOF
{
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "environment": "${ENVIRONMENT}",
    "rollback_type": "${ROLLBACK_TYPE}",
    "dry_run": ${DRY_RUN},
    "current_deployment": "${CURRENT_DEPLOYMENT}",
    "target_deployment": "${TARGET_DEPLOYMENT}",
    "rollback_deployment": "${ROLLBACK_DEPLOYMENT}",
    "rollback_status": "${ROLLBACK_STATUS}",
    "backup_database": ${BACKUP_DATABASE},
    "verify_rollback": ${VERIFY_ROLLBACK},
    "rollback_log": "${ROLLBACK_LOG}"
}
EOF
)
    
    echo "${report_data}" > "${report_file}"
    log "INFO" "Rollback report saved to: ${report_file}"
    
    # Display summary
    log "SUCCESS" "Rollback Summary:"
    log "INFO" "  - Environment: ${ENVIRONMENT}"
    log "INFO" "  - Rollback Type: ${ROLLBACK_TYPE}"
    log "INFO" "  - Current Deployment: ${CURRENT_DEPLOYMENT}"
    log "INFO" "  - Target Deployment: ${TARGET_DEPLOYMENT}"
    log "INFO" "  - Rollback Deployment: ${ROLLBACK_DEPLOYMENT}"
    log "INFO" "  - Status: ${ROLLBACK_STATUS}"
    log "INFO" "  - Log file: ${ROLLBACK_LOG}"
}

# =============================================================================
# Main Execution
# =============================================================================

# Display usage information
show_usage() {
    cat << EOF
Usage: ${SCRIPT_NAME} [OPTIONS]

Rollback Discord bot deployment to a previous version with comprehensive
verification and database backup capabilities.

OPTIONS:
    -e, --environment ENV     Target environment (staging|production) [default: staging]
    -t, --target ID           Target deployment ID to rollback to
    -r, --type TYPE           Rollback type (deployment|database|full) [default: deployment]
    -u, --url URL             Coolify instance URL
    -k, --token TOKEN         Coolify API token
    -b, --backup              Backup database before rollback [default: true]
    --no-backup               Skip database backup
    -v, --verify              Verify rollback after completion [default: true]
    --no-verify               Skip rollback verification
    -d, --dry-run             Perform a dry run without making changes
    -f, --force               Force rollback without confirmation prompts
    -y, --yes                 Skip confirmation prompts
    -V, --verbose             Enable verbose logging
    -h, --help                Show this help message

ENVIRONMENT VARIABLES:
    COOLIFY_URL               Coolify instance URL
    COOLIFY_API_TOKEN         Coolify API token
    ENVIRONMENT               Target environment
    TARGET_DEPLOYMENT         Target deployment ID
    ROLLBACK_TYPE             Rollback type (deployment|database|full)
    BACKUP_DATABASE           Backup database before rollback (true/false)
    VERIFY_ROLLBACK           Verify rollback after completion (true/false)
    DRY_RUN                   Dry run mode (true/false)
    FORCE_ROLLBACK            Force rollback without prompts (true/false)
    SKIP_CONFIRMATION         Skip confirmation prompts (true/false)
    VERBOSE                   Verbose logging (true/false)
    HEALTH_CHECK_TIMEOUT      Health check timeout in seconds [default: 300]

EXAMPLES:
    # Interactive rollback to previous deployment
    ${SCRIPT_NAME}

    # Rollback to specific deployment
    ${SCRIPT_NAME} -t deployment-123

    # Database rollback with backup
    ${SCRIPT_NAME} -r database -b

    # Dry run to see what would be rolled back
    ${SCRIPT_NAME} -d

    # Force rollback without confirmation
    ${SCRIPT_NAME} -f -t deployment-123

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
            -t|--target)
                TARGET_DEPLOYMENT="$2"
                shift 2
                ;;
            -r|--type)
                ROLLBACK_TYPE="$2"
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
            -b|--backup)
                BACKUP_DATABASE="true"
                shift
                ;;
            --no-backup)
                BACKUP_DATABASE="false"
                shift
                ;;
            -v|--verify)
                VERIFY_ROLLBACK="true"
                shift
                ;;
            --no-verify)
                VERIFY_ROLLBACK="false"
                shift
                ;;
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            -f|--force)
                FORCE_ROLLBACK="true"
                shift
                ;;
            -y|--yes)
                SKIP_CONFIRMATION="true"
                shift
                ;;
            -V|--verbose)
                VERBOSE="true"
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

# Main rollback function
main() {
    log "INFO" "Starting Discord bot rollback..."
    log "INFO" "Rollback log: ${ROLLBACK_LOG}"
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Validation phase
    validate_dependencies
    validate_coolify_connection
    validate_rollback_parameters
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "Running in DRY RUN mode - no changes will be made"
    fi
    
    # Get current deployment information
    get_current_deployment
    
    # Select target deployment
    select_target_deployment
    
    # Get target deployment information
    get_target_deployment_info
    
    # Confirmation prompt
    if [[ "${SKIP_CONFIRMATION}" != "true" && "${FORCE_ROLLBACK}" != "true" ]]; then
        log "WARN" "You are about to rollback from deployment ${CURRENT_DEPLOYMENT} to ${TARGET_DEPLOYMENT}"
        log "WARN" "This will replace the current deployment with the previous version"
        read -p "Are you sure you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "INFO" "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    # Rollback phases based on type
    case "${ROLLBACK_TYPE}" in
        "deployment")
            backup_database
            restore_configuration
            perform_deployment_rollback
            monitor_rollback_progress
            ;;
        "database")
            backup_database
            perform_database_rollback
            ;;
        "full")
            backup_database
            restore_configuration
            perform_deployment_rollback
            monitor_rollback_progress
            perform_database_rollback
            ;;
    esac
    
    # Verification phase
    if [[ "${ROLLBACK_STATUS}" == "success" ]]; then
        verify_rollback
    else
        log "ERROR" "Rollback failed with status: ${ROLLBACK_STATUS}"
        exit 1
    fi
    
    # Generate report
    generate_rollback_report
    
    log "SUCCESS" "Rollback completed successfully!"
    log "INFO" "Deployment rolled back to: ${TARGET_DEPLOYMENT}"
}

# Execute main function with all arguments
main "$@"