#!/bin/bash

# =============================================================================
# Discord Bot Coolify Cleanup Script
# =============================================================================
# This script performs cleanup operations for the Discord bot deployment,
# including removing old deployments, cleaning up unused images, log rotation,
# temporary file cleanup, and resource optimization.
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
CLEANUP_LOG="${LOG_DIR}/cleanup-$(date +%Y%m%d-%H%M%S).log"
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
ENVIRONMENT="${ENVIRONMENT:-all}"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"
FORCE_CLEANUP="${FORCE_CLEANUP:-false}"
CLEANUP_IMAGES="${CLEANUP_IMAGES:-true}"
CLEANUP_VOLUMES="${CLEANUP_VOLUMES:-false}"
CLEANUP_LOGS="${CLEANUP_LOGS:-true}"
CLEANUP_TEMP="${CLEANUP_TEMP:-true}"
CLEANUP_DEPLOYMENTS="${CLEANUP_DEPLOYMENTS:-true}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-7}"
TEMP_RETENTION_DAYS="${TEMP_RETENTION_DAYS:-1}"

# Cleanup statistics
DEPLOYMENTS_REMOVED=0
IMAGES_REMOVED=0
VOLUMES_REMOVED=0
LOGS_REMOVED=0
TEMP_FILES_REMOVED=0
SPACE_FREED=0

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
    echo "[${timestamp}] [${level}] ${message}" >> "${CLEANUP_LOG}"
    
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

# Convert bytes to human readable format
bytes_to_human() {
    local bytes=$1
    local units=('B' 'KB' 'MB' 'GB' 'TB')
    local unit=0
    
    while [[ $bytes -gt 1024 && $unit -lt 4 ]]; do
        bytes=$((bytes / 1024))
        unit=$((unit + 1))
    done
    
    echo "${bytes}${units[$unit]}"
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
        log "WARN" "COOLIFY_URL environment variable is not set, skipping Coolify-specific cleanup"
        return 0
    fi
    
    if [[ -z "${COOLIFY_API_TOKEN}" ]]; then
        log "WARN" "COOLIFY_API_TOKEN environment variable is not set, skipping Coolify-specific cleanup"
        return 0
    fi
    
    # Test API connection
    local api_endpoint="${COOLIFY_URL%/}/api/v1/health"
    if ! curl -s -f -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}" &> /dev/null; then
        log "WARN" "Failed to connect to Coolify API at ${COOLIFY_URL}, skipping Coolify-specific cleanup"
        return 0
    fi
    
    log "SUCCESS" "Coolify connection validated successfully"
}

# =============================================================================
# Deployment Cleanup Functions
# =============================================================================

# Get list of old deployments from Coolify
get_old_deployments() {
    log "INFO" "Retrieving old deployments from Coolify..."
    
    if [[ -z "${COOLIFY_URL}" || -z "${COOLIFY_API_TOKEN}" ]]; then
        log "WARN" "Coolify credentials not available, skipping deployment cleanup"
        return 0
    fi
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/applications"
    local response
    local old_deployments=()
    
    response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "WARN" "Failed to retrieve applications from Coolify"
        return 0
    fi
    
    # Get application ID for discord-bot
    local app_id
    app_id=$(echo "${response}" | jq -r '.data[] | select(.name == "discord-bot") | .id // empty')
    
    if [[ -z "${app_id}" ]]; then
        log "WARN" "Discord bot application not found in Coolify"
        return 0
    fi
    
    # Get deployment history
    api_endpoint="${COOLIFY_URL%/}/api/v1/applications/${app_id}/deployments"
    response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "WARN" "Failed to retrieve deployment history from Coolify"
        return 0
    fi
    
    # Filter old deployments (older than RETENTION_DAYS and not the latest)
    local cutoff_date
    cutoff_date=$(date -d "${RETENTION_DAYS} days ago" -u +'%Y-%m-%dT%H:%M:%SZ')
    
    while IFS= read -r deployment; do
        local deployment_id=$(echo "${deployment}" | jq -r '.id')
        local created_at=$(echo "${deployment}" | jq -r '.created_at')
        local status=$(echo "${deployment}" | jq -r '.status')
        
        # Skip if deployment is too recent or still running
        if [[ "${created_at}" > "${cutoff_date}" ]] || [[ "${status}" == "running" ]]; then
            continue
        fi
        
        old_deployments+=("${deployment_id}")
    done < <(echo "${response}" | jq -c '.data[]')
    
    log "INFO" "Found ${#old_deployments[@]} old deployments to clean up"
    
    # Return the array of old deployment IDs
    printf '%s\n' "${old_deployments[@]}"
}

# Remove old deployments from Coolify
remove_old_deployments() {
    if [[ "${CLEANUP_DEPLOYMENTS}" != "true" ]]; then
        log "INFO" "Skipping deployment cleanup as requested"
        return 0
    fi
    
    log "INFO" "Removing old deployments..."
    
    local old_deployments
    readarray -t old_deployments < <(get_old_deployments)
    
    if [[ ${#old_deployments[@]} -eq 0 ]]; then
        log "INFO" "No old deployments to remove"
        return 0
    fi
    
    for deployment_id in "${old_deployments[@]}"; do
        log "INFO" "Removing deployment: ${deployment_id}"
        
        if [[ "${DRY_RUN}" == "true" ]]; then
            log "INFO" "[DRY RUN] Would remove deployment: ${deployment_id}"
            ((DEPLOYMENTS_REMOVED++))
            continue
        fi
        
        local api_endpoint="${COOLIFY_URL%/}/api/v1/deployments/${deployment_id}"
        
        if curl -s -X DELETE -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}" &> /dev/null; then
            log "SUCCESS" "Removed deployment: ${deployment_id}"
            ((DEPLOYMENTS_REMOVED++))
        else
            log "WARN" "Failed to remove deployment: ${deployment_id}"
        fi
    done
    
    log "SUCCESS" "Removed ${DEPLOYMENTS_REMOVED} old deployments"
}

# =============================================================================
# Docker Cleanup Functions
# =============================================================================

# Clean up unused Docker images
cleanup_docker_images() {
    if [[ "${CLEANUP_IMAGES}" != "true" ]]; then
        log "INFO" "Skipping Docker image cleanup as requested"
        return 0
    fi
    
    log "INFO" "Cleaning up unused Docker images..."
    
    local images_before
    local images_after
    local space_before
    local space_after
    
    # Get current image count and space usage
    images_before=$(docker images --format "table {{.Repository}}:{{.Tag}}" | wc -l)
    space_before=$(docker system df --format "{{.Size}}" | head -1)
    
    debug_log "Images before cleanup: ${images_before}, Space used: ${space_before}"
    
    # Remove dangling images
    log "INFO" "Removing dangling images..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would remove dangling images"
    else
        local dangling_images
        dangling_images=$(docker images --filter "dangling=true" --format "{{.ID}}")
        
        if [[ -n "${dangling_images}" ]]; then
            echo "${dangling_images}" | xargs -r docker rmi &> /dev/null || true
            log "SUCCESS" "Removed dangling images"
        fi
    fi
    
    # Remove unused images older than RETENTION_DAYS
    log "INFO" "Removing unused images older than ${RETENTION_DAYS} days..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would remove old unused images"
    else
        # Get images older than retention period
        local old_images
        old_images=$(docker images --format "{{.ID}} {{.CreatedAt}}" | \
            awk -v cutoff="$(date -d "${RETENTION_DAYS} days ago" +'%Y-%m-%d %H:%M:%S')" \
            '$2 < cutoff {print $1}')
        
        if [[ -n "${old_images}" ]]; then
            echo "${old_images}" | xargs -r docker rmi &> /dev/null || true
            log "SUCCESS" "Removed old unused images"
        fi
    fi
    
    # Remove discord-bot images with more than 5 versions
    log "INFO" "Cleaning up old discord-bot images (keeping latest 5)..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would clean up old discord-bot images"
    else
        local bot_images
        bot_images=$(docker images "discord-bot:*" --format "{{.Repository}}:{{.Tag}}" | \
            tail -n +6)
        
        if [[ -n "${bot_images}" ]]; then
            echo "${bot_images}" | xargs -r docker rmi &> /dev/null || true
            log "SUCCESS" "Cleaned up old discord-bot images"
        fi
    fi
    
    # Calculate space freed
    images_after=$(docker images --format "table {{.Repository}}:{{.Tag}}" | wc -l)
    space_after=$(docker system df --format "{{.Size}}" | head -1)
    
    debug_log "Images after cleanup: ${images_after}, Space used: ${space_after}"
    
    log "SUCCESS" "Docker image cleanup completed"
    log "INFO" "Images removed: $((images_before - images_after))"
}

# Clean up Docker volumes (with caution)
cleanup_docker_volumes() {
    if [[ "${CLEANUP_VOLUMES}" != "true" ]]; then
        log "INFO" "Skipping Docker volume cleanup as requested"
        return 0
    fi
    
    log "WARN" "Cleaning up unused Docker volumes..."
    log "WARN" "This will remove all unused volumes. Ensure you have backups!"
    
    if [[ "${FORCE_CLEANUP}" != "true" ]]; then
        read -p "Are you sure you want to remove unused Docker volumes? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "INFO" "Docker volume cleanup cancelled"
            return 0
        fi
    fi
    
    local volumes_before
    local volumes_after
    
    volumes_before=$(docker volume ls --format "{{.Name}}" | wc -l)
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would remove unused Docker volumes"
    else
        # Remove unused volumes (excluding named volumes from our compose files)
        local unused_volumes
        unused_volumes=$(docker volume ls --filter "dangling=true" --format "{{.Name}}")
        
        # Filter out our known volumes
        local protected_volumes=("postgres_data" "redis_data" "prometheus_data" "grafana_data")
        local volumes_to_remove=()
        
        while IFS= read -r volume; do
            local protected=false
            for protected_volume in "${protected_volumes[@]}"; do
                if [[ "${volume}" == "${protected_volume}" || "${volume}" == *"${protected_volume}"* ]]; then
                    protected=true
                    break
                fi
            done
            
            if [[ "${protected}" == "false" ]]; then
                volumes_to_remove+=("${volume}")
            fi
        done < <(echo "${unused_volumes}")
        
        if [[ ${#volumes_to_remove[@]} -gt 0 ]]; then
            printf '%s\n' "${volumes_to_remove[@]}" | xargs -r docker volume rm &> /dev/null || true
            log "SUCCESS" "Removed unused Docker volumes"
        fi
    fi
    
    volumes_after=$(docker volume ls --format "{{.Name}}" | wc -l)
    
    log "SUCCESS" "Docker volume cleanup completed"
    log "INFO" "Volumes removed: $((volumes_before - volumes_after))"
}

# =============================================================================
# Log Cleanup Functions
# =============================================================================

# Clean up application logs
cleanup_logs() {
    if [[ "${CLEANUP_LOGS}" != "true" ]]; then
        log "INFO" "Skipping log cleanup as requested"
        return 0
    fi
    
    log "INFO" "Cleaning up application logs..."
    
    # Clean up old deployment logs
    log "INFO" "Removing deployment logs older than ${LOG_RETENTION_DAYS} days..."
    
    local old_logs
    old_logs=$(find "${LOG_DIR}" -name "deployment-*.log" -type f -mtime +${LOG_RETENTION_DAYS} 2>/dev/null || true)
    
    if [[ -n "${old_logs}" ]]; then
        if [[ "${DRY_RUN}" == "true" ]]; then
            log "INFO" "[DRY RUN] Would remove old deployment logs"
            echo "${old_logs}" | wc -l | xargs -I {} log "INFO" "[DRY RUN] Would remove {} log files"
        else
            echo "${old_logs}" | xargs -r rm -f
            log "SUCCESS" "Removed old deployment logs"
        fi
        LOGS_REMOVED=$(echo "${old_logs}" | wc -l)
    fi
    
    # Clean up old cleanup logs
    log "INFO" "Removing cleanup logs older than ${LOG_RETENTION_DAYS} days..."
    
    old_logs=$(find "${LOG_DIR}" -name "cleanup-*.log" -type f -mtime +${LOG_RETENTION_DAYS} 2>/dev/null || true)
    
    if [[ -n "${old_logs}" ]]; then
        if [[ "${DRY_RUN}" == "true" ]]; then
            log "INFO" "[DRY RUN] Would remove old cleanup logs"
            echo "${old_logs}" | wc -l | xargs -I {} log "INFO" "[DRY RUN] Would remove {} log files"
        else
            echo "${old_logs}" | xargs -r rm -f
            log "SUCCESS" "Removed old cleanup logs"
        fi
        LOGS_REMOVED=$((LOGS_REMOVED + $(echo "${old_logs}" | wc -l)))
    fi
    
    # Rotate large log files
    log "INFO" "Rotating large log files (>10MB)..."
    
    local large_logs
    large_logs=$(find "${LOG_DIR}" -name "*.log" -type f -size +10M 2>/dev/null || true)
    
    if [[ -n "${large_logs}" ]]; then
        if [[ "${DRY_RUN}" == "true" ]]; then
            log "INFO" "[DRY RUN] Would rotate large log files"
        else
            while IFS= read -r log_file; do
                mv "${log_file}" "${log_file}.old"
                gzip "${log_file}.old" &> /dev/null || true
            done < <(echo "${large_logs}")
            log "SUCCESS" "Rotated large log files"
        fi
    fi
    
    log "SUCCESS" "Log cleanup completed"
    log "INFO" "Log files removed: ${LOGS_REMOVED}"
}

# =============================================================================
# Temporary File Cleanup Functions
# =============================================================================

# Clean up temporary files
cleanup_temp_files() {
    if [[ "${CLEANUP_TEMP}" != "true" ]]; then
        log "INFO" "Skipping temporary file cleanup as requested"
        return 0
    fi
    
    log "INFO" "Cleaning up temporary files..."
    
    # Clean up node_modules in temporary directories
    log "INFO" "Removing temporary node_modules directories..."
    
    local temp_node_modules
    temp_node_modules=$(find /tmp -name "node_modules" -type d -mtime +${TEMP_RETENTION_DAYS} 2>/dev/null || true)
    
    if [[ -n "${temp_node_modules}" ]]; then
        if [[ "${DRY_RUN}" == "true" ]]; then
            log "INFO" "[DRY RUN] Would remove temporary node_modules directories"
        else
            echo "${temp_node_modules}" | xargs -r rm -rf
            log "SUCCESS" "Removed temporary node_modules directories"
        fi
        TEMP_FILES_REMOVED=$((TEMP_FILES_REMOVED + $(echo "${temp_node_modules}" | wc -l)))
    fi
    
    # Clean up Docker temporary files
    log "INFO" "Removing Docker temporary files..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would clean Docker temporary files"
    else
        # Clean Docker builder cache
        docker builder prune --force --filter "until=${RETENTION_DAYS}h" &> /dev/null || true
        
        # Clean unused networks
        docker network prune --force &> /dev/null || true
        
        log "SUCCESS" "Cleaned Docker temporary files"
    fi
    
    # Clean up OS temporary files
    log "INFO" "Removing OS temporary files older than ${TEMP_RETENTION_DAYS} days..."
    
    local temp_files
    temp_files=$(find /tmp -type f -mtime +${TEMP_RETENTION_DAYS} 2>/dev/null || true)
    
    if [[ -n "${temp_files}" ]]; then
        if [[ "${DRY_RUN}" == "true" ]]; then
            log "INFO" "[DRY RUN] Would remove OS temporary files"
            echo "${temp_files}" | wc -l | xargs -I {} log "INFO" "[DRY RUN] Would remove {} temporary files"
        else
            echo "${temp_files}" | xargs -r rm -f
            log "SUCCESS" "Removed OS temporary files"
        fi
        TEMP_FILES_REMOVED=$((TEMP_FILES_REMOVED + $(echo "${temp_files}" | wc -l)))
    fi
    
    log "SUCCESS" "Temporary file cleanup completed"
    log "INFO" "Temporary files removed: ${TEMP_FILES_REMOVED}"
}

# =============================================================================
# Resource Optimization Functions
# =============================================================================

# Optimize system resources
optimize_resources() {
    log "INFO" "Optimizing system resources..."
    
    # Get current disk usage
    local disk_usage
    disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    log "INFO" "Current disk usage: ${disk_usage}%"
    
    if [[ ${disk_usage} -gt 80 ]]; then
        log "WARN" "High disk usage detected (${disk_usage}%), running aggressive cleanup..."
        
        # Aggressive cleanup options
        if [[ "${DRY_RUN}" == "true" ]]; then
            log "INFO" "[DRY RUN] Would run aggressive cleanup"
        else
            # Clean package manager caches
            if command -v apt-get &> /dev/null; then
                apt-get clean &> /dev/null || true
            elif command -v yum &> /dev/null; then
                yum clean all &> /dev/null || true
            fi
            
            # Clean npm cache
            if command -v npm &> /dev/null; then
                npm cache clean --force &> /dev/null || true
            fi
            
            log "SUCCESS" "Aggressive cleanup completed"
        fi
    fi
    
    # Check memory usage
    local memory_usage
    memory_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    log "INFO" "Current memory usage: ${memory_usage}%"
    
    if [[ ${memory_usage} -gt 85 ]]; then
        log "WARN" "High memory usage detected (${memory_usage}%)"
        log "INFO" "Consider restarting services or adding more memory"
    fi
    
    log "SUCCESS" "Resource optimization completed"
}

# =============================================================================
# Reporting Functions
# =============================================================================

# Generate cleanup report
generate_cleanup_report() {
    log "INFO" "Generating cleanup report..."
    
    local report_file="${LOG_DIR}/cleanup-report-$(date +%Y%m%d-%H%M%S).json"
    local report_data
    
    report_data=$(cat <<EOF
{
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "environment": "${ENVIRONMENT}",
    "dry_run": ${DRY_RUN},
    "statistics": {
        "deployments_removed": ${DEPLOYMENTS_REMOVED},
        "images_removed": ${IMAGES_REMOVED},
        "volumes_removed": ${VOLUMES_REMOVED},
        "logs_removed": ${LOGS_REMOVED},
        "temp_files_removed": ${TEMP_FILES_REMOVED},
        "space_freed": "${SPACE_FREED}"
    },
    "configuration": {
        "retention_days": ${RETENTION_DAYS},
        "log_retention_days": ${LOG_RETENTION_DAYS},
        "temp_retention_days": ${TEMP_RETENTION_DAYS},
        "cleanup_images": ${CLEANUP_IMAGES},
        "cleanup_volumes": ${CLEANUP_VOLUMES},
        "cleanup_logs": ${CLEANUP_LOGS},
        "cleanup_temp": ${CLEANUP_TEMP},
        "cleanup_deployments": ${CLEANUP_DEPLOYMENTS}
    },
    "cleanup_log": "${CLEANUP_LOG}"
}
EOF
)
    
    echo "${report_data}" > "${report_file}"
    log "INFO" "Cleanup report saved to: ${report_file}"
    
    # Display summary
    log "SUCCESS" "Cleanup Summary:"
    log "INFO" "  - Deployments removed: ${DEPLOYMENTS_REMOVED}"
    log "INFO" "  - Docker images removed: ${IMAGES_REMOVED}"
    log "INFO" "  - Docker volumes removed: ${VOLUMES_REMOVED}"
    log "INFO" "  - Log files removed: ${LOGS_REMOVED}"
    log "INFO" "  - Temporary files removed: ${TEMP_FILES_REMOVED}"
    log "INFO" "  - Space freed: ${SPACE_FREED}"
    log "INFO" "  - Cleanup log: ${CLEANUP_LOG}"
}

# =============================================================================
# Main Execution
# =============================================================================

# Display usage information
show_usage() {
    cat << EOF
Usage: ${SCRIPT_NAME} [OPTIONS]

Clean up Discord bot deployment resources including old deployments,
unused Docker images, logs, and temporary files.

OPTIONS:
    -e, --environment ENV     Target environment (staging|production|all) [default: all]
    -u, --url URL             Coolify instance URL
    -t, --token TOKEN         Coolify API token
    -d, --dry-run             Perform a dry run without making changes
    -v, --verbose             Enable verbose logging
    -f, --force               Force cleanup without confirmation prompts
    --skip-images             Skip Docker image cleanup
    --skip-volumes            Skip Docker volume cleanup
    --skip-logs               Skip log file cleanup
    --skip-temp               Skip temporary file cleanup
    --skip-deployments        Skip deployment cleanup
    --retention-days DAYS     Retention period for deployments [default: 30]
    --log-retention-days DAYS Retention period for logs [default: 7]
    --temp-retention-days DAYS Retention period for temp files [default: 1]
    -h, --help                Show this help message

ENVIRONMENT VARIABLES:
    COOLIFY_URL               Coolify instance URL
    COOLIFY_API_TOKEN         Coolify API token
    ENVIRONMENT               Target environment
    DRY_RUN                   Dry run mode (true/false)
    VERBOSE                   Verbose logging (true/false)
    FORCE_CLEANUP             Force cleanup without prompts (true/false)
    CLEANUP_IMAGES            Clean Docker images (true/false) [default: true]
    CLEANUP_VOLUMES           Clean Docker volumes (true/false) [default: false]
    CLEANUP_LOGS              Clean log files (true/false) [default: true]
    CLEANUP_TEMP              Clean temp files (true/false) [default: true]
    CLEANUP_DEPLOYMENTS       Clean deployments (true/false) [default: true]
    RETENTION_DAYS            Retention period in days [default: 30]
    LOG_RETENTION_DAYS        Log retention period in days [default: 7]
    TEMP_RETENTION_DAYS       Temp file retention period in days [default: 1]

EXAMPLES:
    # Standard cleanup
    ${SCRIPT_NAME}

    # Cleanup for production environment
    ${SCRIPT_NAME} -e production

    # Dry run to see what would be cleaned
    ${SCRIPT_NAME} -d

    # Aggressive cleanup with force
    ${SCRIPT_NAME} -f --retention-days 7

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
            -u|--url)
                COOLIFY_URL="$2"
                shift 2
                ;;
            -t|--token)
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
                FORCE_CLEANUP="true"
                shift
                ;;
            --skip-images)
                CLEANUP_IMAGES="false"
                shift
                ;;
            --skip-volumes)
                CLEANUP_VOLUMES="false"
                shift
                ;;
            --skip-logs)
                CLEANUP_LOGS="false"
                shift
                ;;
            --skip-temp)
                CLEANUP_TEMP="false"
                shift
                ;;
            --skip-deployments)
                CLEANUP_DEPLOYMENTS="false"
                shift
                ;;
            --retention-days)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            --log-retention-days)
                LOG_RETENTION_DAYS="$2"
                shift 2
                ;;
            --temp-retention-days)
                TEMP_RETENTION_DAYS="$2"
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

# Main cleanup function
main() {
    log "INFO" "Starting Discord bot cleanup..."
    log "INFO" "Cleanup log: ${CLEANUP_LOG}"
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Validation phase
    validate_dependencies
    validate_coolify_connection
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "Running in DRY RUN mode - no changes will be made"
    fi
    
    # Cleanup phases
    remove_old_deployments
    cleanup_docker_images
    cleanup_docker_volumes
    cleanup_logs
    cleanup_temp_files
    optimize_resources
    
    # Generate report
    generate_cleanup_report
    
    log "SUCCESS" "Cleanup completed successfully!"
}

# Execute main function with all arguments
main "$@"