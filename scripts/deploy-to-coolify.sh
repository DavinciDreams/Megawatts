#!/bin/bash

# =============================================================================
# Discord Bot Coolify Deployment Script
# =============================================================================
# This script automates the deployment of the Discord bot to Coolify environments
# with comprehensive validation, monitoring, and rollback capabilities.
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
DEPLOYMENT_LOG="${LOG_DIR}/deployment-$(date +%Y%m%d-%H%M%S).log"
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
BRANCH="${BRANCH:-main}"
FORCE_DEPLOY="${FORCE_DEPLOY:-false}"
SKIP_VALIDATION="${SKIP_VALIDATION:-false}"
SKIP_BUILD="${SKIP_BUILD:-false}"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-300}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"

# Deployment tracking
DEPLOYMENT_ID=""
DEPLOYMENT_STATUS=""
PREVIOUS_DEPLOYMENT_ID=""

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
    echo "[${timestamp}] [${level}] ${message}" >> "${DEPLOYMENT_LOG}"
    
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
    
    # Attempt rollback if enabled and deployment was started
    if [[ "${ROLLBACK_ON_FAILURE}" == "true" && -n "${DEPLOYMENT_ID}" ]]; then
        log "WARN" "Attempting automatic rollback due to deployment failure..."
        rollback_deployment "${DEPLOYMENT_ID}"
    fi
    
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

# Validate environment configuration
validate_environment_config() {
    log "INFO" "Validating environment configuration for '${ENVIRONMENT}'..."
    
    if [[ ! -f "${CONFIG_FILE}" ]]; then
        log "ERROR" "Configuration file not found: ${CONFIG_FILE}"
        exit 1
    fi
    
    # Validate environment exists in configuration
    if ! grep -q "^  ${ENVIRONMENT}:" "${CONFIG_FILE}"; then
        log "ERROR" "Environment '${ENVIRONMENT}' not found in configuration file"
        log "INFO" "Available environments: $(grep -E "^  [a-z]+:" "${CONFIG_FILE}" | sed 's/.*: //' | tr '\n' ' ')"
        exit 1
    fi
    
    # Validate required environment variables
    local required_vars=("DISCORD_TOKEN" "DB_USER" "DB_PASSWORD" "DB_NAME" "REDIS_PASSWORD" "OPENAI_API_KEY")
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("${var}")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log "ERROR" "Missing required environment variables: ${missing_vars[*]}"
        log "INFO" "Please set these variables and try again"
        exit 1
    fi
    
    log "SUCCESS" "Environment configuration validated successfully"
}

# Validate Git repository state
validate_git_state() {
    log "INFO" "Validating Git repository state..."
    
    # Check if we're in a Git repository
    if ! git rev-parse --git-dir &> /dev/null; then
        log "ERROR" "Not in a Git repository"
        exit 1
    fi
    
    # Check if branch exists
    if ! git rev-parse --verify "${BRANCH}" &> /dev/null; then
        log "ERROR" "Branch '${BRANCH}' does not exist"
        exit 1
    fi
    
    # Check for uncommitted changes (only in production)
    if [[ "${ENVIRONMENT}" == "production" ]] && ! git diff-index --quiet HEAD --; then
        log "ERROR" "Production deployment requires a clean working directory"
        log "INFO" "Please commit or stash your changes and try again"
        exit 1
    fi
    
    log "SUCCESS" "Git repository state validated successfully"
}

# =============================================================================
# Deployment Functions
# =============================================================================

# Get current deployment information from Coolify
get_current_deployment() {
    log "INFO" "Retrieving current deployment information..."
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/applications"
    local response
    
    response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "WARN" "No existing deployments found"
        return 0
    fi
    
    # Extract deployment information using jq
    PREVIOUS_DEPLOYMENT_ID=$(echo "${response}" | jq -r '.data[] | select(.name == "discord-bot") | .latest_deployment.id // empty')
    
    if [[ -n "${PREVIOUS_DEPLOYMENT_ID}" ]]; then
        log "INFO" "Previous deployment found: ${PREVIOUS_DEPLOYMENT_ID}"
    else
        log "INFO" "No previous deployment found"
    fi
}

# Build Docker image
build_docker_image() {
    if [[ "${SKIP_BUILD}" == "true" ]]; then
        log "INFO" "Skipping Docker image build as requested"
        return 0
    fi
    
    log "INFO" "Building Docker image for environment: ${ENVIRONMENT}"
    
    local image_name="discord-bot:${ENVIRONMENT}-${BRANCH}-$(git rev-parse --short HEAD)"
    local dockerfile="docker/coolify.Dockerfile"
    
    if [[ ! -f "${dockerfile}" ]]; then
        log "ERROR" "Dockerfile not found: ${dockerfile}"
        exit 1
    fi
    
    # Build arguments based on environment
    local build_args=(
        "--build-arg" "NODE_ENV=${ENVIRONMENT}"
        "--build-arg" "BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
        "--build-arg" "VCS_REF=$(git rev-parse HEAD)"
        "--build-arg" "VERSION=${ENVIRONMENT}-${BRANCH}-$(git rev-parse --short HEAD)"
    )
    
    debug_log "Build command: docker build ${build_args[*]} -t ${image_name} -f ${dockerfile} ."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would build Docker image: ${image_name}"
        return 0
    fi
    
    # Build the image
    if ! docker build "${build_args[@]}" -t "${image_name}" -f "${dockerfile}" .; then
        log "ERROR" "Docker image build failed"
        exit 1
    fi
    
    log "SUCCESS" "Docker image built successfully: ${image_name}"
}

# Trigger deployment in Coolify
trigger_deployment() {
    log "INFO" "Triggering deployment to Coolify..."
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/deployments"
    local deployment_data
    local response
    
    # Prepare deployment payload
    deployment_data=$(cat <<EOF
{
    "application_name": "discord-bot",
    "branch": "${BRANCH}",
    "environment": "${ENVIRONMENT}",
    "force_rebuild": ${FORCE_DEPLOY},
    "commit_hash": "$(git rev-parse HEAD)"
}
EOF
)
    
    debug_log "Deployment data: ${deployment_data}"
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would trigger deployment with data: ${deployment_data}"
        DEPLOYMENT_ID="dry-run-$(date +%s)"
        return 0
    fi
    
    # Trigger deployment
    response=$(curl -s -X POST \
        -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "${deployment_data}" \
        "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "ERROR" "Failed to trigger deployment"
        exit 1
    fi
    
    # Extract deployment ID
    DEPLOYMENT_ID=$(echo "${response}" | jq -r '.data.id // empty')
    
    if [[ -z "${DEPLOYMENT_ID}" ]]; then
        log "ERROR" "Failed to extract deployment ID from response"
        log "DEBUG" "API response: ${response}"
        exit 1
    fi
    
    log "SUCCESS" "Deployment triggered successfully with ID: ${DEPLOYMENT_ID}"
}

# Monitor deployment progress
monitor_deployment() {
    log "INFO" "Monitoring deployment progress (timeout: ${HEALTH_CHECK_TIMEOUT}s)..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would monitor deployment: ${DEPLOYMENT_ID}"
        DEPLOYMENT_STATUS="success"
        return 0
    fi
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/deployments/${DEPLOYMENT_ID}"
    local start_time=$(date +%s)
    local timeout_time=$((start_time + HEALTH_CHECK_TIMEOUT))
    
    while [[ $(date +%s) -lt ${timeout_time} ]]; do
        local response
        response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}")
        
        if [[ -z "${response}" ]]; then
            log "WARN" "Failed to get deployment status, retrying..."
            sleep 10
            continue
        fi
        
        DEPLOYMENT_STATUS=$(echo "${response}" | jq -r '.data.status // empty')
        local progress=$(echo "${response}" | jq -r '.data.progress // 0')
        local current_step=$(echo "${response}" | jq -r '.data.current_step // "unknown"')
        
        log "INFO" "Deployment status: ${DEPLOYMENT_STATUS} (${progress}%) - ${current_step}"
        
        case "${DEPLOYMENT_STATUS}" in
            "success"|"completed")
                log "SUCCESS" "Deployment completed successfully"
                return 0
                ;;
            "failed"|"error")
                log "ERROR" "Deployment failed"
                return 1
                ;;
            "running"|"pending"|"in_progress")
                # Continue monitoring
                ;;
            *)
                log "WARN" "Unknown deployment status: ${DEPLOYMENT_STATUS}"
                ;;
        esac
        
        sleep 15
    done
    
    log "ERROR" "Deployment monitoring timed out after ${HEALTH_CHECK_TIMEOUT} seconds"
    return 1
}

# =============================================================================
# Post-Deployment Functions
# =============================================================================

# Perform health checks after deployment
perform_health_checks() {
    log "INFO" "Performing post-deployment health checks..."
    
    # Get application URL from environment configuration
    local app_url
    if command -v yq &> /dev/null; then
        app_url=$(yq eval ".environments.${ENVIRONMENT}.variables.DOMAIN" "${CONFIG_FILE}")
    else
        # Fallback to environment variable
        app_url="${DOMAIN:-localhost}"
    fi
    
    if [[ -z "${app_url}" ]]; then
        log "WARN" "Could not determine application URL for health checks"
        return 0
    fi
    
    local health_url="http://${app_url}/health"
    local health_timeout=60
    local start_time=$(date +%s)
    local timeout_time=$((start_time + health_timeout))
    
    log "INFO" "Checking health endpoint: ${health_url}"
    
    while [[ $(date +%s) -lt ${timeout_time} ]]; do
        if curl -s -f "${health_url}" &> /dev/null; then
            log "SUCCESS" "Health check passed"
            return 0
        fi
        
        log "INFO" "Health check failed, retrying in 10 seconds..."
        sleep 10
    done
    
    log "ERROR" "Health check failed after ${health_timeout} seconds"
    return 1
}

# Generate deployment report
generate_deployment_report() {
    log "INFO" "Generating deployment report..."
    
    local report_file="${LOG_DIR}/deployment-report-${DEPLOYMENT_ID}.json"
    local report_data
    
    report_data=$(cat <<EOF
{
    "deployment_id": "${DEPLOYMENT_ID}",
    "environment": "${ENVIRONMENT}",
    "branch": "${BRANCH}",
    "commit_hash": "$(git rev-parse HEAD)",
    "previous_deployment_id": "${PREVIOUS_DEPLOYMENT_ID}",
    "status": "${DEPLOYMENT_STATUS}",
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "deployment_log": "${DEPLOYMENT_LOG}",
    "duration": "$(date -d @$(date +%s) -d @$(date -r "${DEPLOYMENT_LOG}" +%s) +%s)s"
}
EOF
)
    
    echo "${report_data}" > "${report_file}"
    log "INFO" "Deployment report saved to: ${report_file}"
    
    # Display summary
    log "SUCCESS" "Deployment Summary:"
    log "INFO" "  - Deployment ID: ${DEPLOYMENT_ID}"
    log "INFO" "  - Environment: ${ENVIRONMENT}"
    log "INFO" "  - Branch: ${BRANCH}"
    log "INFO" "  - Status: ${DEPLOYMENT_STATUS}"
    log "INFO" "  - Log file: ${DEPLOYMENT_LOG}"
}

# =============================================================================
# Rollback Functions
# =============================================================================

# Rollback to previous deployment
rollback_deployment() {
    local deployment_id="$1"
    
    log "WARN" "Initiating rollback for deployment: ${deployment_id}"
    
    if [[ -z "${PREVIOUS_DEPLOYMENT_ID}" ]]; then
        log "ERROR" "No previous deployment available for rollback"
        return 1
    fi
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/deployments/${PREVIOUS_DEPLOYMENT_ID}/rollback"
    local response
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "[DRY RUN] Would rollback to deployment: ${PREVIOUS_DEPLOYMENT_ID}"
        return 0
    fi
    
    response=$(curl -s -X POST \
        -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
        -H "Content-Type: application/json" \
        "${api_endpoint}")
    
    if [[ -z "${response}" ]]; then
        log "ERROR" "Failed to trigger rollback"
        return 1
    fi
    
    local rollback_id=$(echo "${response}" | jq -r '.data.id // empty')
    
    if [[ -z "${rollback_id}" ]]; then
        log "ERROR" "Failed to extract rollback ID from response"
        return 1
    fi
    
    log "SUCCESS" "Rollback triggered successfully with ID: ${rollback_id}"
    return 0
}

# =============================================================================
# Main Execution
# =============================================================================

# Display usage information
show_usage() {
    cat << EOF
Usage: ${SCRIPT_NAME} [OPTIONS]

Deploy Discord bot to Coolify environments with comprehensive validation and monitoring.

OPTIONS:
    -e, --environment ENV     Target environment (staging|production) [default: staging]
    -b, --branch BRANCH       Git branch to deploy [default: main]
    -u, --url URL             Coolify instance URL
    -t, --token TOKEN         Coolify API token
    -f, --force               Force deployment even if no changes
    -s, --skip-validation     Skip pre-deployment validation
    -k, --skip-build          Skip Docker image build
    -d, --dry-run             Perform a dry run without making changes
    -v, --verbose             Enable verbose logging
    -r, --rollback            Rollback to previous deployment
    -h, --help                Show this help message

ENVIRONMENT VARIABLES:
    COOLIFY_URL               Coolify instance URL
    COOLIFY_API_TOKEN         Coolify API token
    DISCORD_TOKEN             Discord bot token
    DB_USER                   Database username
    DB_PASSWORD               Database password
    DB_NAME                   Database name
    REDIS_PASSWORD            Redis password
    OPENAI_API_KEY            OpenAI API key
    DOMAIN                    Application domain
    FORCE_DEPLOY              Force deployment (true/false)
    SKIP_VALIDATION           Skip validation (true/false)
    SKIP_BUILD                Skip build (true/false)
    DRY_RUN                   Dry run mode (true/false)
    VERBOSE                   Verbose logging (true/false)
    HEALTH_CHECK_TIMEOUT      Health check timeout in seconds [default: 300]
    ROLLBACK_ON_FAILURE       Auto-rollback on failure (true/false) [default: true]

EXAMPLES:
    # Deploy to staging
    ${SCRIPT_NAME} -e staging

    # Deploy to production with force
    ${SCRIPT_NAME} -e production -f

    # Dry run to staging
    ${SCRIPT_NAME} -e staging -d

    # Rollback previous deployment
    ${SCRIPT_NAME} -r

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
            -b|--branch)
                BRANCH="$2"
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
            -f|--force)
                FORCE_DEPLOY="true"
                shift
                ;;
            -s|--skip-validation)
                SKIP_VALIDATION="true"
                shift
                ;;
            -k|--skip-build)
                SKIP_BUILD="true"
                shift
                ;;
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            -r|--rollback)
                ROLLBACK_ONLY="true"
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

# Main deployment function
main() {
    log "INFO" "Starting Discord bot deployment to Coolify..."
    log "INFO" "Deployment log: ${DEPLOYMENT_LOG}"
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Handle rollback-only mode
    if [[ "${ROLLBACK_ONLY:-false}" == "true" ]]; then
        get_current_deployment
        rollback_deployment "${PREVIOUS_DEPLOYMENT_ID}"
        exit 0
    fi
    
    # Validation phase
    if [[ "${SKIP_VALIDATION}" != "true" ]]; then
        validate_dependencies
        validate_coolify_connection
        validate_environment_config
        validate_git_state
    else
        log "WARN" "Skipping validation as requested"
    fi
    
    # Get current deployment information
    get_current_deployment
    
    # Build phase
    build_docker_image
    
    # Deployment phase
    trigger_deployment
    
    # Monitoring phase
    if monitor_deployment; then
        # Post-deployment phase
        perform_health_checks
        generate_deployment_report
        
        log "SUCCESS" "Deployment completed successfully!"
        log "INFO" "Deployment ID: ${DEPLOYMENT_ID}"
        log "INFO" "Environment: ${ENVIRONMENT}"
        log "INFO" "Branch: ${BRANCH}"
    else
        log "ERROR" "Deployment failed!"
        exit 1
    fi
}

# Execute main function with all arguments
main "$@"