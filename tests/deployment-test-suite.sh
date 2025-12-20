#!/bin/bash

# =============================================================================
# Discord Bot Coolify Deployment Test Suite
# =============================================================================
# Comprehensive testing script for validating the deployment process
# including pre-deployment validation, configuration checks, and post-deployment verification
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
TEST_LOG="${LOG_DIR}/deployment-test-$(date +%Y%m%d-%H%M%S).log"
TEST_RESULTS_DIR="${PROJECT_ROOT}/test-results"
COOLIFY_CONFIG="${PROJECT_ROOT}/coolify.json"
COOLIFY_COMPOSE="${PROJECT_ROOT}/coolify-compose.yml"
COOLIFY_ENVIRONMENTS="${PROJECT_ROOT}/coolify-environments.yml"

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
SKIP_SLOW_TESTS="${SKIP_SLOW_TESTS:-false}"
GENERATE_REPORT="${GENERATE_REPORT:-true}"

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
    echo "${result},${test_name},${message}" >> "${TEST_RESULTS_DIR}/deployment-test-results.csv"
}

# Verbose logging function
debug_log() {
    if [[ "${VERBOSE}" == "true" ]]; then
        log "DEBUG" "$*"
    fi
}

# =============================================================================
# Pre-Deployment Validation Tests
# =============================================================================

test_project_structure() {
    log "INFO" "Testing project structure..."
    
    local required_files=(
        "package.json"
        "tsconfig.json"
        "Dockerfile.prod"
        "docker/coolify.Dockerfile"
        "coolify.json"
        "coolify-compose.yml"
        "coolify-environments.yml"
        "src/index.ts"
    )
    
    local missing_files=()
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "${PROJECT_ROOT}/${file}" ]]; then
            missing_files+=("${file}")
        fi
    done
    
    if [[ ${#missing_files[@]} -eq 0 ]]; then
        test_result "Project Structure" "PASS"
    else
        test_result "Project Structure" "FAIL" "Missing files: ${missing_files[*]}"
    fi
}

test_git_repository() {
    log "INFO" "Testing Git repository state..."
    
    # Check if we're in a Git repository
    if ! git rev-parse --git-dir &> /dev/null; then
        test_result "Git Repository" "FAIL" "Not in a Git repository"
        return
    fi
    
    # Check for uncommitted changes in production
    if [[ "${ENVIRONMENT}" == "production" ]] && ! git diff-index --quiet HEAD --; then
        test_result "Git Repository" "FAIL" "Production deployment requires clean working directory"
        return
    fi
    
    test_result "Git Repository" "PASS"
}

test_dependencies() {
    log "INFO" "Testing project dependencies..."
    
    # Check if package.json exists and is valid
    if [[ ! -f "${PROJECT_ROOT}/package.json" ]]; then
        test_result "Dependencies Check" "FAIL" "package.json not found"
        return
    fi
    
    # Validate package.json syntax
    if ! jq empty "${PROJECT_ROOT}/package.json" 2>/dev/null; then
        test_result "Dependencies Check" "FAIL" "package.json is not valid JSON"
        return
    fi
    
    # Check if node_modules exists or can be installed
    if [[ ! -d "${PROJECT_ROOT}/node_modules" ]]; then
        log "INFO" "Installing dependencies for testing..."
        if ! (cd "${PROJECT_ROOT}" && npm ci --silent); then
            test_result "Dependencies Check" "FAIL" "Failed to install dependencies"
            return
        fi
    fi
    
    test_result "Dependencies Check" "PASS"
}

test_environment_variables() {
    log "INFO" "Testing environment variables..."
    
    local required_vars=(
        "DISCORD_TOKEN"
        "DB_USER"
        "DB_PASSWORD"
        "DB_NAME"
        "REDIS_PASSWORD"
        "OPENAI_API_KEY"
        "S3_BUCKET"
        "S3_REGION"
        "S3_ACCESS_KEY_ID"
        "S3_SECRET_ACCESS_KEY"
    )
    
    local missing_vars=()
    local empty_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            empty_vars+=("${var}")
        fi
    done
    
    # Check environment-specific variables
    if [[ "${ENVIRONMENT}" == "staging" ]]; then
        local staging_vars=(
            "DISCORD_TOKEN_STAGING"
            "DB_USER_STAGING"
            "DB_PASSWORD_STAGING"
            "DB_NAME_STAGING"
            "REDIS_PASSWORD_STAGING"
        )
        
        for var in "${staging_vars[@]}"; do
            if [[ -z "${!var:-}" ]]; then
                empty_vars+=("${var}")
            fi
        done
    fi
    
    if [[ ${#empty_vars[@]} -gt 0 ]]; then
        test_result "Environment Variables" "FAIL" "Empty or missing variables: ${empty_vars[*]}"
    else
        test_result "Environment Variables" "PASS"
    fi
}

# =============================================================================
# Configuration Validation Tests
# =============================================================================

test_coolify_json() {
    log "INFO" "Testing Coolify JSON configuration..."
    
    if [[ ! -f "${COOLIFY_CONFIG}" ]]; then
        test_result "Coolify JSON Config" "FAIL" "coolify.json not found"
        return
    fi
    
    # Validate JSON syntax
    if ! jq empty "${COOLIFY_CONFIG}" 2>/dev/null; then
        test_result "Coolify JSON Config" "FAIL" "coolify.json is not valid JSON"
        return
    fi
    
    # Check required sections
    local required_sections=("name" "version" "environments" "applications" "services")
    local missing_sections=()
    
    for section in "${required_sections[@]}"; do
        if ! jq -e ".${section}" "${COOLIFY_CONFIG}" &> /dev/null; then
            missing_sections+=("${section}")
        fi
    done
    
    if [[ ${#missing_sections[@]} -gt 0 ]]; then
        test_result "Coolify JSON Config" "FAIL" "Missing sections: ${missing_sections[*]}"
        return
    fi
    
    # Check if environment exists
    if ! jq -e ".environments.${ENVIRONMENT}" "${COOLIFY_CONFIG}" &> /dev/null; then
        test_result "Coolify JSON Config" "FAIL" "Environment '${ENVIRONMENT}' not found in configuration"
        return
    fi
    
    test_result "Coolify JSON Config" "PASS"
}

test_coolify_compose() {
    log "INFO" "Testing Coolify Compose configuration..."
    
    if [[ ! -f "${COOLIFY_COMPOSE}" ]]; then
        test_result "Coolify Compose Config" "FAIL" "coolify-compose.yml not found"
        return
    fi
    
    # Validate YAML syntax
    if ! python3 -c "import yaml; yaml.safe_load(open('${COOLIFY_COMPOSE}'))" 2>/dev/null; then
        test_result "Coolify Compose Config" "FAIL" "coolify-compose.yml is not valid YAML"
        return
    fi
    
    # Check required services
    local required_services=("app" "postgres" "redis")
    local missing_services=()
    
    for service in "${required_services[@]}"; do
        if ! grep -q "^  ${service}:" "${COOLIFY_COMPOSE}"; then
            missing_services+=("${service}")
        fi
    done
    
    if [[ ${#missing_services[@]} -gt 0 ]]; then
        test_result "Coolify Compose Config" "FAIL" "Missing services: ${missing_services[*]}"
        return
    fi
    
    test_result "Coolify Compose Config" "PASS"
}

test_coolify_environments() {
    log "INFO" "Testing Coolify Environments configuration..."
    
    if [[ ! -f "${COOLIFY_ENVIRONMENTS}" ]]; then
        test_result "Coolify Environments Config" "FAIL" "coolify-environments.yml not found"
        return
    fi
    
    # Validate YAML syntax
    if ! python3 -c "import yaml; yaml.safe_load(open('${COOLIFY_ENVIRONMENTS}'))" 2>/dev/null; then
        test_result "Coolify Environments Config" "FAIL" "coolify-environments.yml is not valid YAML"
        return
    fi
    
    # Check if environment exists
    if ! grep -q "^  ${ENVIRONMENT}:" "${COOLIFY_ENVIRONMENTS}"; then
        test_result "Coolify Environments Config" "FAIL" "Environment '${ENVIRONMENT}' not found in configuration"
        return
    fi
    
    test_result "Coolify Environments Config" "PASS"
}

test_configuration_consistency() {
    log "INFO" "Testing configuration consistency..."
    
    # Check if service names are consistent across files
    local compose_services=$(grep -E "^  [a-z-]+:" "${COOLIFY_COMPOSE}" | sed 's/.*: //' | tr '\n' ' ')
    local json_services=$(jq -r '.services | keys | join(" ")' "${COOLIFY_CONFIG}")
    
    if [[ "${compose_services}" != "${json_services}" ]]; then
        test_result "Configuration Consistency" "FAIL" "Service names inconsistent between compose and JSON files"
        return
    fi
    
    # Check port conflicts
    local port_conflicts=$(grep -E "^[[:space:]]*-[[:space:]]*[0-9]+:[0-9]+" "${COOLIFY_COMPOSE}" | sort | uniq -d)
    if [[ -n "${port_conflicts}" ]]; then
        test_result "Configuration Consistency" "FAIL" "Port conflicts found: ${port_conflicts}"
        return
    fi
    
    test_result "Configuration Consistency" "PASS"
}

# =============================================================================
# Docker Image Build Tests
# =============================================================================

test_dockerfile_exists() {
    log "INFO" "Testing Dockerfile existence..."
    
    local dockerfile="docker/coolify.Dockerfile"
    
    if [[ ! -f "${PROJECT_ROOT}/${dockerfile}" ]]; then
        test_result "Dockerfile Exists" "FAIL" "${dockerfile} not found"
        return
    fi
    
    test_result "Dockerfile Exists" "PASS"
}

test_docker_build() {
    if [[ "${SKIP_SLOW_TESTS}" == "true" ]]; then
        test_result "Docker Build" "SKIP" "Slow tests disabled"
        return
    fi
    
    log "INFO" "Testing Docker image build..."
    
    local dockerfile="docker/coolify.Dockerfile"
    local image_name="discord-bot:test-$(date +%s)"
    
    # Build Docker image
    if ! docker build -t "${image_name}" -f "${dockerfile}" "${PROJECT_ROOT}" &>> "${TEST_LOG}"; then
        test_result "Docker Build" "FAIL" "Docker image build failed"
        return
    fi
    
    # Clean up test image
    docker rmi "${image_name}" &>> "${TEST_LOG}" || true
    
    test_result "Docker Build" "PASS"
}

test_docker_image_security() {
    if [[ "${SKIP_SLOW_TESTS}" == "true" ]]; then
        test_result "Docker Image Security" "SKIP" "Slow tests disabled"
        return
    fi
    
    log "INFO" "Testing Docker image security..."
    
    # Check if Docker image was built in previous test
    local test_images=$(docker images "discord-bot:test-*" -q)
    if [[ -z "${test_images}" ]]; then
        test_result "Docker Image Security" "SKIP" "No test image found"
        return
    fi
    
    # Basic security checks
    local image_id=$(echo "${test_images}" | head -1)
    
    # Check if image runs as non-root user
    local user=$(docker inspect "${image_id}" | jq -r '.[0].Config.User // "root"')
    if [[ "${user}" == "root" || "${user}" == "0" ]]; then
        test_result "Docker Image Security" "FAIL" "Container runs as root user"
        return
    fi
    
    test_result "Docker Image Security" "PASS"
}

# =============================================================================
# Coolify API Connectivity Tests
# =============================================================================

test_coolify_api_connection() {
    log "INFO" "Testing Coolify API connection..."
    
    if [[ -z "${COOLIFY_URL:-}" ]]; then
        test_result "Coolify API Connection" "SKIP" "COOLIFY_URL not set"
        return
    fi
    
    if [[ -z "${COOLIFY_API_TOKEN:-}" ]]; then
        test_result "Coolify API Connection" "SKIP" "COOLIFY_API_TOKEN not set"
        return
    fi
    
    # Test API health endpoint
    local api_endpoint="${COOLIFY_URL%/}/api/v1/health"
    if curl -s -f -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}" &>> "${TEST_LOG}"; then
        test_result "Coolify API Connection" "PASS"
    else
        test_result "Coolify API Connection" "FAIL" "Cannot connect to Coolify API"
    fi
}

test_coolify_authentication() {
    log "INFO" "Testing Coolify authentication..."
    
    if [[ -z "${COOLIFY_URL:-}" || -z "${COOLIFY_API_TOKEN:-}" ]]; then
        test_result "Coolify Authentication" "SKIP" "Coolify credentials not set"
        return
    fi
    
    # Test authenticated endpoint
    local api_endpoint="${COOLIFY_URL%/}/api/v1/applications"
    local response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}" 2>> "${TEST_LOG}")
    
    if [[ -n "${response}" ]] && echo "${response}" | jq empty 2>/dev/null; then
        test_result "Coolify Authentication" "PASS"
    else
        test_result "Coolify Authentication" "FAIL" "Authentication failed"
    fi
}

test_coolify_application_exists() {
    log "INFO" "Testing Coolify application existence..."
    
    if [[ -z "${COOLIFY_URL:-}" || -z "${COOLIFY_API_TOKEN:-}" ]]; then
        test_result "Coolify Application Exists" "SKIP" "Coolify credentials not set"
        return
    fi
    
    local api_endpoint="${COOLIFY_URL%/}/api/v1/applications"
    local response=$(curl -s -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" "${api_endpoint}" 2>> "${TEST_LOG}")
    
    if echo "${response}" | jq -e '.data[] | select(.name == "discord-bot")' &> /dev/null; then
        test_result "Coolify Application Exists" "PASS"
    else
        test_result "Coolify Application Exists" "FAIL" "Discord bot application not found in Coolify"
    fi
}

# =============================================================================
# End-to-End Deployment Simulation
# =============================================================================

test_deployment_simulation() {
    if [[ "${SKIP_SLOW_TESTS}" == "true" ]]; then
        test_result "Deployment Simulation" "SKIP" "Slow tests disabled"
        return
    fi
    
    log "INFO" "Running deployment simulation..."
    
    # Check if deployment script exists
    local deploy_script="${PROJECT_ROOT}/scripts/deploy-to-coolify.sh"
    if [[ ! -f "${deploy_script}" ]]; then
        test_result "Deployment Simulation" "FAIL" "Deployment script not found"
        return
    fi
    
    # Run deployment in dry-run mode
    if DRY_RUN=true "${deploy_script}" -e "${ENVIRONMENT}" &>> "${TEST_LOG}"; then
        test_result "Deployment Simulation" "PASS"
    else
        test_result "Deployment Simulation" "FAIL" "Deployment simulation failed"
    fi
}

test_rollback_simulation() {
    if [[ "${SKIP_SLOW_TESTS}" == "true" ]]; then
        test_result "Rollback Simulation" "SKIP" "Slow tests disabled"
        return
    fi
    
    log "INFO" "Running rollback simulation..."
    
    # Check if deployment script exists
    local deploy_script="${PROJECT_ROOT}/scripts/deploy-to-coolify.sh"
    if [[ ! -f "${deploy_script}" ]]; then
        test_result "Rollback Simulation" "SKIP" "Deployment script not found"
        return
    fi
    
    # Run rollback in dry-run mode
    if DRY_RUN=true "${deploy_script}" -r &>> "${TEST_LOG}"; then
        test_result "Rollback Simulation" "PASS"
    else
        test_result "Rollback Simulation" "FAIL" "Rollback simulation failed"
    fi
}

# =============================================================================
# Post-Deployment Verification Tests
# =============================================================================

test_health_endpoint() {
    log "INFO" "Testing health endpoint..."
    
    # This would typically test against a running instance
    # For testing purposes, we'll check if the health check script exists
    local health_script="${PROJECT_ROOT}/docker/health-check.sh"
    
    if [[ ! -f "${health_script}" ]]; then
        test_result "Health Endpoint" "FAIL" "Health check script not found"
        return
    fi
    
    # Check if health script is executable
    if [[ ! -x "${health_script}" ]]; then
        test_result "Health Endpoint" "FAIL" "Health check script is not executable"
        return
    fi
    
    test_result "Health Endpoint" "PASS"
}

test_monitoring_configuration() {
    log "INFO" "Testing monitoring configuration..."
    
    # Check Prometheus configuration
    local prometheus_config="${PROJECT_ROOT}/monitoring/prometheus.yml"
    if [[ -f "${prometheus_config}" ]]; then
        if python3 -c "import yaml; yaml.safe_load(open('${prometheus_config}'))" 2>/dev/null; then
            test_result "Monitoring Configuration" "PASS"
        else
            test_result "Monitoring Configuration" "FAIL" "Prometheus configuration is invalid"
        fi
    else
        test_result "Monitoring Configuration" "SKIP" "Prometheus configuration not found"
    fi
}

test_logging_configuration() {
    log "INFO" "Testing logging configuration..."
    
    # Check if logging is properly configured in compose file
    if grep -q "logging:" "${COOLIFY_COMPOSE}"; then
        test_result "Logging Configuration" "PASS"
    else
        test_result "Logging Configuration" "FAIL" "Logging not configured in compose file"
    fi
}

test_network_configuration() {
    log "INFO" "Testing network configuration..."
    
    # Check if network is properly configured
    if grep -q "networks:" "${COOLIFY_COMPOSE}"; then
        test_result "Network Configuration" "PASS"
    else
        test_result "Network Configuration" "FAIL" "Network not configured in compose file"
    fi
}

# =============================================================================
# Test Execution and Reporting
# =============================================================================

run_all_tests() {
    log "INFO" "Starting comprehensive deployment test suite..."
    log "INFO" "Environment: ${ENVIRONMENT}"
    log "INFO" "Test log: ${TEST_LOG}"
    
    # Initialize test results file
    echo "result,test_name,message" > "${TEST_RESULTS_DIR}/deployment-test-results.csv"
    
    # Pre-deployment validation tests
    test_project_structure
    test_git_repository
    test_dependencies
    test_environment_variables
    
    # Configuration validation tests
    test_coolify_json
    test_coolify_compose
    test_coolify_environments
    test_configuration_consistency
    
    # Docker image build tests
    test_dockerfile_exists
    test_docker_build
    test_docker_image_security
    
    # Coolify API connectivity tests
    test_coolify_api_connection
    test_coolify_authentication
    test_coolify_application_exists
    
    # End-to-end deployment simulation
    test_deployment_simulation
    test_rollback_simulation
    
    # Post-deployment verification tests
    test_health_endpoint
    test_monitoring_configuration
    test_logging_configuration
    test_network_configuration
    
    # Generate test report
    generate_test_report
}

generate_test_report() {
    log "INFO" "Generating test report..."
    
    local report_file="${TEST_RESULTS_DIR}/deployment-test-report-$(date +%Y%m%d-%H%M%S).json"
    local summary_file="${TEST_RESULTS_DIR}/deployment-test-summary-$(date +%Y%m%d-%H%M%S).txt"
    
    # Generate JSON report
    cat > "${report_file}" << EOF
{
    "test_suite": "deployment-test-suite",
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "environment": "${ENVIRONMENT}",
    "total_tests": ${TOTAL_TESTS},
    "passed_tests": ${PASSED_TESTS},
    "failed_tests": ${FAILED_TESTS},
    "skipped_tests": ${SKIPPED_TESTS},
    "success_rate": "$(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")",
    "log_file": "${TEST_LOG}",
    "results_file": "${TEST_RESULTS_DIR}/deployment-test-results.csv"
}
EOF
    
    # Generate text summary
    cat > "${summary_file}" << EOF
Discord Bot Deployment Test Suite Summary
========================================
Environment: ${ENVIRONMENT}
Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')

Test Results:
- Total Tests: ${TOTAL_TESTS}
- Passed: ${PASSED_TESTS}
- Failed: ${FAILED_TESTS}
- Skipped: ${SKIPPED_TESTS}
- Success Rate: $(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")%

Files:
- Test Log: ${TEST_LOG}
- JSON Report: ${report_file}
- CSV Results: ${TEST_RESULTS_DIR}/deployment-test-results.csv

EOF
    
    if [[ ${FAILED_TESTS} -gt 0 ]]; then
        echo "FAILED TESTS:" >> "${summary_file}"
        grep "^FAIL," "${TEST_RESULTS_DIR}/deployment-test-results.csv" | cut -d',' -f2- >> "${summary_file}"
        echo "" >> "${summary_file}"
    fi
    
    if [[ ${SKIPPED_TESTS} -gt 0 ]]; then
        echo "SKIPPED TESTS:" >> "${summary_file}"
        grep "^SKIP," "${TEST_RESULTS_DIR}/deployment-test-results.csv" | cut -d',' -f2- >> "${summary_file}"
    fi
    
    log "SUCCESS" "Test report generated: ${report_file}"
    log "INFO" "Test summary: ${summary_file}"
    
    # Display summary
    echo ""
    echo "========================================"
    echo "Deployment Test Suite Summary"
    echo "========================================"
    echo "Environment: ${ENVIRONMENT}"
    echo "Total Tests: ${TOTAL_TESTS}"
    echo "Passed: ${PASSED_TESTS}"
    echo "Failed: ${FAILED_TESTS}"
    echo "Skipped: ${SKIPPED_TESTS}"
    echo "Success Rate: $(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")%"
    echo "========================================"
    
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

Run comprehensive deployment tests for Discord bot Coolify deployment.

OPTIONS:
    -e, --environment ENV     Target environment (staging|production) [default: staging]
    -t, --timeout SECONDS     Test timeout in seconds [default: 600]
    -v, --verbose             Enable verbose logging
    -s, --skip-slow-tests     Skip slow-running tests
    -r, --no-report           Skip report generation
    -h, --help                Show this help message

ENVIRONMENT VARIABLES:
    ENVIRONMENT               Target environment
    TEST_TIMEOUT              Test timeout in seconds
    VERBOSE                   Verbose logging (true/false)
    SKIP_SLOW_TESTS           Skip slow tests (true/false)
    GENERATE_REPORT           Generate report (true/false)
    COOLIFY_URL               Coolify instance URL
    COOLIFY_API_TOKEN         Coolify API token

EXAMPLES:
    # Run all tests for staging
    ${SCRIPT_NAME} -e staging

    # Run tests with verbose output
    ${SCRIPT_NAME} -v

    # Skip slow tests
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
            -s|--skip-slow-tests)
                SKIP_SLOW_TESTS="true"
                shift
                ;;
            -r|--no-report)
                GENERATE_REPORT="false"
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

# Main function
main() {
    log "INFO" "Starting Discord bot deployment test suite..."
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Set timeout for the entire test suite
    timeout "${TEST_TIMEOUT}" bash -c "run_all_tests" || {
        log "ERROR" "Test suite timed out after ${TEST_TIMEOUT} seconds"
        exit 1
    }
}

# Execute main function with all arguments
main "$@"