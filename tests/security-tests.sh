#!/bin/bash

# =============================================================================
# Discord Bot Coolify Security Test Suite
# =============================================================================
# Comprehensive security testing script for container security validation,
# network security tests, secret management, access control, and vulnerability scanning
# =============================================================================

set -euo pipefail

# Script configuration
SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
TEST_LOG="${LOG_DIR}/security-test-$(date +%Y%m%d-%H%M%S).log"
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
TEST_TIMEOUT="${TEST_TIMEOUT:-1200}"
VERBOSE="${VERBOSE:-false}"
SKIP_EXTERNAL_TESTS="${SKIP_EXTERNAL_TESTS:-false}"
DOMAIN="${DOMAIN:-localhost}"
APP_PORT="${APP_PORT:-8080}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"

# Security test parameters
ENABLE_VULNERABILITY_SCAN="${ENABLE_VULNERABILITY_SCAN:-true}"
ENABLE_NETWORK_SCAN="${ENABLE_NETWORK_SCAN:-true}"
ENABLE_SECRET_SCAN="${ENABLE_SECRET_SCAN:-true}"

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
    echo "${result},${test_name},${message}" >> "${TEST_RESULTS_DIR}/security-test-results.csv"
}

# Verbose logging function
debug_log() {
    if [[ "${VERBOSE}" == "true" ]]; then
        log "DEBUG" "$*"
    fi
}

# Check if port is open
is_port_open() {
    local host="$1"
    local port="$2"
    local timeout="${3:-5}"
    
    if timeout "${timeout}" bash -c ">/dev/tcp/${host}/${port}" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Check for common vulnerabilities in HTTP headers
check_http_headers() {
    local url="$1"
    local headers
    headers=$(curl -s -I "${url}" 2>> "${TEST_LOG}")
    
    local vulnerabilities=()
    
    # Check for security headers
    if ! echo "${headers}" | grep -qi "x-frame-options"; then
        vulnerabilities+=("Missing X-Frame-Options header")
    fi
    
    if ! echo "${headers}" | grep -qi "x-content-type-options"; then
        vulnerabilities+=("Missing X-Content-Type-Options header")
    fi
    
    if ! echo "${headers}" | grep -qi "x-xss-protection"; then
        vulnerabilities+=("Missing X-XSS-Protection header")
    fi
    
    if ! echo "${headers}" | grep -qi "strict-transport-security"; then
        vulnerabilities+=("Missing Strict-Transport-Security header")
    fi
    
    if ! echo "${headers}" | grep -qi "content-security-policy"; then
        vulnerabilities+=("Missing Content-Security-Policy header")
    fi
    
    # Check for server information disclosure
    if echo "${headers}" | grep -qi "server:"; then
        vulnerabilities+=("Server header reveals information")
    fi
    
    # Check for powered-by header
    if echo "${headers}" | grep -qi "x-powered-by"; then
        vulnerabilities+=("X-Powered-By header reveals technology")
    fi
    
    echo "${vulnerabilities[@]}"
}

# Scan for secrets in files
scan_for_secrets() {
    local file_path="$1"
    local secrets_found=()
    
    # Common secret patterns
    local patterns=(
        "password[[:space:]]*=[[:space:]]*['\"][^'\"]{8,}['\"]"
        "secret[[:space:]]*=[[:space:]]*['\"][^'\"]{8,}['\"]"
        "token[[:space:]]*=[[:space:]]*['\"][^'\"]{20,}['\"]"
        "api[_-]?key[[:space:]]*=[[:space:]]*['\"][^'\"]{20,}['\"]"
        "sk-[a-zA-Z0-9]{48}"
        "sk-ant-api[0-9]{3}-[A-Za-z0-9_-]{95}"
        "AKIA[0-9A-Z]{16}"
        "[a-zA-Z0-9+/]{40}"
    )
    
    for pattern in "${patterns[@]}"; do
        if grep -Ei "${pattern}" "${file_path}" &>> "${TEST_LOG}"; then
            secrets_found+=("Pattern matched: ${pattern}")
        fi
    done
    
    echo "${secrets_found[@]}"
}

# =============================================================================
# Container Security Validation
# =============================================================================

test_docker_image_security() {
    log "INFO" "Testing Docker image security..."
    
    if ! command -v docker &> /dev/null; then
        test_result "Docker Image Security" "SKIP" "Docker not available"
        return
    fi
    
    local dockerfile="docker/coolify.Dockerfile"
    if [[ ! -f "${PROJECT_ROOT}/${dockerfile}" ]]; then
        test_result "Docker Image Security" "FAIL" "Dockerfile not found"
        return
    fi
    
    local security_issues=()
    
    # Check if Dockerfile uses non-root user
    if ! grep -qi "USER.*node\|user.*1001" "${PROJECT_ROOT}/${dockerfile}"; then
        security_issues+=("Container may run as root user")
    fi
    
    # Check for security hardening
    if ! grep -qi "adduser\|addgroup" "${PROJECT_ROOT}/${dockerfile}"; then
        security_issues+=("No non-root user creation found")
    fi
    
    # Check for base image updates
    if grep -q "FROM.*:latest" "${PROJECT_ROOT}/${dockerfile}"; then
        security_issues+=("Using 'latest' tag for base image")
    fi
    
    # Check for unnecessary packages
    if grep -qi "apk add.*git\|apk add.*curl\|apk add.*wget" "${PROJECT_ROOT}/${dockerfile}"; then
        security_issues+=("Development tools in production image")
    fi
    
    if [[ ${#security_issues[@]} -eq 0 ]]; then
        test_result "Docker Image Security" "PASS"
    else
        test_result "Docker Image Security" "FAIL" "Security issues: ${security_issues[*]}"
    fi
}

test_container_runtime_security() {
    log "INFO" "Testing container runtime security..."
    
    if ! command -v docker &> /dev/null; then
        test_result "Container Runtime Security" "SKIP" "Docker not available"
        return
    fi
    
    local security_issues=()
    
    # Get running containers
    local containers
    containers=$(docker ps --format "{{.Names}}" 2>> "${TEST_LOG}")
    
    if [[ -z "${containers}" ]]; then
        test_result "Container Runtime Security" "SKIP" "No running containers"
        return
    fi
    
    for container in ${containers}; do
        # Check if container is running as root
        local user
        user=$(docker inspect "${container}" | jq -r '.[0].Config.User // "root"' 2>> "${TEST_LOG}")
        if [[ "${user}" == "root" || "${user}" == "0" || "${user}" == "" ]]; then
            security_issues+=("${container} running as root")
        fi
        
        # Check for privileged containers
        local privileged
        privileged=$(docker inspect "${container}" | jq -r '.[0].Host.Privileged // false' 2>> "${TEST_LOG}")
        if [[ "${privileged}" == "true" ]]; then
            security_issues+=("${container} running in privileged mode")
        fi
        
        # Check for excessive capabilities
        local caps
        caps=$(docker inspect "${container}" | jq -r '.[0].Host.Capabilities // [] | length' 2>> "${TEST_LOG}")
        if [[ ${caps} -gt 2 ]]; then
            security_issues+=("${container} has excessive capabilities")
        fi
    done
    
    if [[ ${#security_issues[@]} -eq 0 ]]; then
        test_result "Container Runtime Security" "PASS"
    else
        test_result "Container Runtime Security" "FAIL" "Security issues: ${security_issues[*]}"
    fi
}

test_dockerfile_hardening() {
    log "INFO" "Testing Dockerfile hardening..."
    
    local dockerfile="docker/coolify.Dockerfile"
    if [[ ! -f "${PROJECT_ROOT}/${dockerfile}" ]]; then
        test_result "Dockerfile Hardening" "FAIL" "Dockerfile not found"
        return
    fi
    
    local hardening_issues=()
    
    # Check for multi-stage builds
    if ! grep -q "AS.*builder" "${PROJECT_ROOT}/${dockerfile}"; then
        hardening_issues+=("No multi-stage build detected")
    fi
    
    # Check for minimal base image
    if ! grep -qi "alpine\|slim" "${PROJECT_ROOT}/${dockerfile}"; then
        hardening_issues+=("Not using minimal base image")
    fi
    
    # Check for security updates
    if ! grep -qi "apk.*update\|apk.*upgrade" "${PROJECT_ROOT}/${dockerfile}"; then
        hardening_issues+=("No security updates in Dockerfile")
    fi
    
    # Check for cleanup
    if ! grep -qi "rm.*-rf\|apk.*del\|apt.*autoremove" "${PROJECT_ROOT}/${dockerfile}"; then
        hardening_issues+=("No cleanup of temporary files")
    fi
    
    # Check for health checks
    if ! grep -qi "HEALTHCHECK" "${PROJECT_ROOT}/${dockerfile}"; then
        hardening_issues+=("No health check defined")
    fi
    
    if [[ ${#hardening_issues[@]} -eq 0 ]]; then
        test_result "Dockerfile Hardening" "PASS"
    else
        test_result "Dockerfile Hardening" "FAIL" "Hardening issues: ${hardening_issues[*]}"
    fi
}

# =============================================================================
# Network Security Tests
# =============================================================================

test_open_ports() {
    log "INFO" "Testing open ports..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "Open Ports" "SKIP" "External tests disabled"
        return
    fi
    
    local expected_ports=(
        "${APP_PORT}"
        "${POSTGRES_PORT}"
        "${REDIS_PORT}"
    )
    
    local unexpected_ports=()
    local common_ports=(22 23 53 135 139 445 993 995)
    
    # Check for unexpected open ports
    for port in "${common_ports[@]}"; do
        if is_port_open "${DOMAIN}" "${port}" 2; then
            unexpected_ports+=("${port}")
        fi
    done
    
    if [[ ${#unexpected_ports[@]} -eq 0 ]]; then
        test_result "Open Ports" "PASS" "No unexpected open ports"
    else
        test_result "Open Ports" "FAIL" "Unexpected open ports: ${unexpected_ports[*]}"
    fi
}

test_ssl_configuration() {
    log "INFO" "Testing SSL configuration..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "SSL Configuration" "SKIP" "External tests disabled"
        return
    fi
    
    local ssl_port=443
    local ssl_issues=()
    
    # Check if SSL port is open
    if ! is_port_open "${DOMAIN}" "${ssl_port}" 5; then
        test_result "SSL Configuration" "SKIP" "SSL port not accessible"
        return
    fi
    
    # Test SSL with openssl if available
    if command -v openssl &> /dev/null; then
        # Check SSL certificate
        if ! echo | openssl s_client -connect "${DOMAIN}:${ssl_port}" -servername "${DOMAIN}" 2>> "${TEST_LOG}" | openssl x509 -noout -dates &>> "${TEST_LOG}"; then
            ssl_issues+=("Invalid SSL certificate")
        fi
        
        # Check for weak ciphers
        if echo | openssl s_client -connect "${DOMAIN}:${ssl_port}" -cipher LOW:EXP 2>> "${TEST_LOG}" | grep -q "Cipher is"; then
            ssl_issues+=("Weak ciphers supported")
        fi
        
        # Check for TLS version
        if echo | openssl s_client -connect "${DOMAIN}:${ssl_port}" -tls1_1 2>> "${TEST_LOG}" | grep -q "Protocol.*TLSv1.1"; then
            ssl_issues+=("TLS 1.1 supported (should be disabled)")
        fi
    else
        test_result "SSL Configuration" "SKIP" "OpenSSL not available"
        return
    fi
    
    if [[ ${#ssl_issues[@]} -eq 0 ]]; then
        test_result "SSL Configuration" "PASS"
    else
        test_result "SSL Configuration" "FAIL" "SSL issues: ${ssl_issues[*]}"
    fi
}

test_http_security_headers() {
    log "INFO" "Testing HTTP security headers..."
    
    if [[ "${SKIP_EXTERNAL_TESTS}" == "true" ]]; then
        test_result "HTTP Security Headers" "SKIP" "External tests disabled"
        return
    fi
    
    local app_url="http://${DOMAIN}:${APP_PORT}"
    local vulnerabilities
    vulnerabilities=$(check_http_headers "${app_url}")
    
    if [[ -z "${vulnerabilities}" ]]; then
        test_result "HTTP Security Headers" "PASS"
    else
        test_result "HTTP Security Headers" "FAIL" "Security issues: ${vulnerabilities[*]}"
    fi
}

test_network_isolation() {
    log "INFO" "Testing network isolation..."
    
    if ! command -v docker &> /dev/null; then
        test_result "Network Isolation" "SKIP" "Docker not available"
        return
    fi
    
    local isolation_issues=()
    
    # Get running containers
    local containers
    containers=$(docker ps --format "{{.Names}}" 2>> "${TEST_LOG}")
    
    for container in ${containers}; do
        # Check if container is using default bridge network
        local networks
        networks=$(docker inspect "${container}" | jq -r '.[0].NetworkSettings.Networks | keys[]' 2>> "${TEST_LOG}")
        
        if echo "${networks}" | grep -q "bridge"; then
            isolation_issues+=("${container} using default bridge network")
        fi
        
        # Check for exposed ports
        local exposed_ports
        exposed_ports=$(docker inspect "${container}" | jq -r '.[0].NetworkSettings.Ports | keys[]' 2>> "${TEST_LOG}")
        
        if [[ -n "${exposed_ports}" ]]; then
            debug_log "Container ${container} has exposed ports: ${exposed_ports}"
        fi
    done
    
    if [[ ${#isolation_issues[@]} -eq 0 ]]; then
        test_result "Network Isolation" "PASS"
    else
        test_result "Network Isolation" "FAIL" "Isolation issues: ${isolation_issues[*]}"
    fi
}

# =============================================================================
# Secret Management Validation
# =============================================================================

test_environment_variable_secrets() {
    log "INFO" "Testing environment variable secret management..."
    
    local secret_files=(
        ".env"
        ".env.production"
        ".env.staging"
        "coolify-secrets.env.example"
    )
    
    local exposed_secrets=()
    
    for file in "${secret_files[@]}"; do
        if [[ -f "${PROJECT_ROOT}/${file}" ]]; then
            local secrets
            secrets=$(scan_for_secrets "${PROJECT_ROOT}/${file}")
            if [[ -n "${secrets}" ]]; then
                exposed_secrets+=("${file}: ${secrets}")
            fi
        fi
    done
    
    if [[ ${#exposed_secrets[@]} -eq 0 ]]; then
        test_result "Environment Variable Secrets" "PASS"
    else
        test_result "Environment Variable Secrets" "FAIL" "Exposed secrets: ${exposed_secrets[*]}"
    fi
}

test_codebase_secrets() {
    log "INFO" "Testing codebase for secrets..."
    
    if [[ "${ENABLE_SECRET_SCAN}" != "true" ]]; then
        test_result "Codebase Secrets" "SKIP" "Secret scanning disabled"
        return
    fi
    
    local sensitive_dirs=("src" "config" "scripts")
    local exposed_secrets=()
    
    for dir in "${sensitive_dirs[@]}"; do
        if [[ -d "${PROJECT_ROOT}/${dir}" ]]; then
            while IFS= read -r -d '' file; do
                if [[ "${file}" == *.js || "${file}" == *.ts || "${file}" == *.json || "${file}" == *.yml || "${file}" == *.yaml ]]; then
                    local secrets
                    secrets=$(scan_for_secrets "${file}")
                    if [[ -n "${secrets}" ]]; then
                        exposed_secrets+=("${file}: ${secrets}")
                    fi
                fi
            done < <(find "${PROJECT_ROOT}/${dir}" -type f -print0 2>> "${TEST_LOG}")
        fi
    done
    
    if [[ ${#exposed_secrets[@]} -eq 0 ]]; then
        test_result "Codebase Secrets" "PASS"
    else
        test_result "Codebase Secrets" "FAIL" "Secrets found in code: ${exposed_secrets[*]}"
    fi
}

test_docker_secrets() {
    log "INFO" "Testing Docker secrets management..."
    
    if ! command -v docker &> /dev/null; then
        test_result "Docker Secrets" "SKIP" "Docker not available"
        return
    fi
    
    local secret_issues=()
    
    # Check for secrets in Dockerfiles
    local dockerfiles=("docker/coolify.Dockerfile" "Dockerfile.prod")
    
    for dockerfile in "${dockerfiles[@]}"; do
        if [[ -f "${PROJECT_ROOT}/${dockerfile}" ]]; then
            # Check for hardcoded secrets
            if grep -iE "(password|secret|token|key).*=" "${PROJECT_ROOT}/${dockerfile}" &>> "${TEST_LOG}"; then
                secret_issues+=("Hardcoded secrets in ${dockerfile}")
            fi
            
            # Check for ARG/ENV with sensitive values
            if grep -iE "ARG.*PASSWORD|ARG.*SECRET|ARG.*TOKEN|ENV.*PASSWORD|ENV.*SECRET|ENV.*TOKEN" "${PROJECT_ROOT}/${dockerfile}" &>> "${TEST_LOG}"; then
                secret_issues+=("Sensitive ARG/ENV in ${dockerfile}")
            fi
        fi
    done
    
    # Check docker-compose files for secrets
    local compose_files=("coolify-compose.yml" "docker-compose.yml")
    
    for compose_file in "${compose_files[@]}"; do
        if [[ -f "${PROJECT_ROOT}/${compose_file}" ]]; then
            # Check for plaintext secrets
            if grep -A5 -B5 "password\|secret\|token\|key" "${PROJECT_ROOT}/${compose_file}" | grep -v "^\-\-\-" | grep -v "^#" | grep -v "\${" &>> "${TEST_LOG}"; then
                secret_issues+=("Plaintext secrets in ${compose_file}")
            fi
        fi
    done
    
    if [[ ${#secret_issues[@]} -eq 0 ]]; then
        test_result "Docker Secrets" "PASS"
    else
        test_result "Docker Secrets" "FAIL" "Secret issues: ${secret_issues[*]}"
    fi
}

# =============================================================================
# Access Control Tests
# =============================================================================

test_file_permissions() {
    log "INFO" "Testing file permissions..."
    
    local permission_issues=()
    
    # Check sensitive files permissions
    local sensitive_files=(
        ".env"
        ".env.production"
        ".env.staging"
        "coolify-secrets.env.example"
        "id_rsa"
        "id_rsa.pub"
    )
    
    for file in "${sensitive_files[@]}"; do
        if [[ -f "${PROJECT_ROOT}/${file}" ]]; then
            local perms
            perms=$(stat -c "%a" "${PROJECT_ROOT}/${file}" 2>> "${TEST_LOG}")
            
            # Check if file is world-readable
            if [[ "${perms: -1}" -ge 4 ]]; then
                permission_issues+=("${file} is world-readable (${perms})")
            fi
            
            # Check if file is group-writable
            if [[ "${perms:1:1}" -ge 2 ]]; then
                permission_issues+=("${file} is group-writable (${perms})")
            fi
        fi
    done
    
    # Check directory permissions
    local dirs=("src" "config" "scripts")
    for dir in "${dirs[@]}"; do
        if [[ -d "${PROJECT_ROOT}/${dir}" ]]; then
            local perms
            perms=$(stat -c "%a" "${PROJECT_ROOT}/${dir}" 2>> "${TEST_LOG}")
            
            # Check if directory is world-writable
            if [[ "${perms: -1}" -ge 2 ]]; then
                permission_issues+=("${dir} is world-writable (${perms})")
            fi
        fi
    done
    
    if [[ ${#permission_issues[@]} -eq 0 ]]; then
        test_result "File Permissions" "PASS"
    else
        test_result "File Permissions" "FAIL" "Permission issues: ${permission_issues[*]}"
    fi
}

test_database_access_control() {
    log "INFO" "Testing database access control..."
    
    if [[ -z "${DB_HOST:-}" || -z "${DB_USER:-}" || -z "${DB_PASSWORD:-}" || -z "${DB_NAME:-}" ]]; then
        test_result "Database Access Control" "SKIP" "Database credentials not set"
        return
    fi
    
    local postgres_host="${DB_HOST:-localhost}"
    local access_issues=()
    
    # Test if default postgres user exists
    if PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U postgres -d "${DB_NAME}" -c "SELECT 1;" &>> "${TEST_LOG} 2>&1"; then
        access_issues+=("Default postgres user accessible")
    fi
    
    # Test for weak passwords (common patterns)
    local weak_patterns=("password" "123456" "admin" "root" "postgres")
    for pattern in "${weak_patterns[@]}"; do
        if [[ "${DB_PASSWORD}" == "${pattern}" ]]; then
            access_issues+=("Database password matches weak pattern: ${pattern}")
        fi
    done
    
    # Check database connection encryption
    if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${postgres_host}" -p "${POSTGRES_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SHOW ssl;" &>> "${TEST_LOG} | grep -q "on"; then
        access_issues+=("Database connection not encrypted")
    fi
    
    if [[ ${#access_issues[@]} -eq 0 ]]; then
        test_result "Database Access Control" "PASS"
    else
        test_result "Database Access Control" "FAIL" "Access issues: ${access_issues[*]}"
    fi
}

test_redis_access_control() {
    log "INFO" "Testing Redis access control..."
    
    if [[ -z "${REDIS_HOST:-}" || -z "${REDIS_PASSWORD:-}" ]]; then
        test_result "Redis Access Control" "SKIP" "Redis credentials not set"
        return
    fi
    
    local redis_host="${REDIS_HOST:-localhost}"
    local access_issues=()
    
    # Test if Redis requires authentication
    if redis-cli -h "${redis_host}" -p "${REDIS_PORT}" ping &>> "${TEST_LOG} 2>&1 | grep -q "PONG"; then
        access_issues+=("Redis accessible without password")
    fi
    
    # Test for weak Redis password
    local weak_patterns=("password" "123456" "admin" "root" "redis")
    for pattern in "${weak_patterns[@]}"; do
        if [[ "${REDIS_PASSWORD}" == "${pattern}" ]]; then
            access_issues+=("Redis password matches weak pattern: ${pattern}")
        fi
    done
    
    # Check if dangerous commands are disabled
    local dangerous_commands=("FLUSHDB" "FLUSHALL" "CONFIG" "KEYS" "DEBUG")
    for cmd in "${dangerous_commands[@]}"; do
        if redis-cli -h "${redis_host}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" command info "${cmd}" &>> "${TEST_LOG} 2>&1 | grep -q "allowed"; then
            access_issues+=("Dangerous command ${cmd} is allowed")
        fi
    done
    
    if [[ ${#access_issues[@]} -eq 0 ]]; then
        test_result "Redis Access Control" "PASS"
    else
        test_result "Redis Access Control" "FAIL" "Access issues: ${access_issues[*]}"
    fi
}

# =============================================================================
# Vulnerability Scanning
# =============================================================================

test_dependency_vulnerabilities() {
    log "INFO" "Testing dependency vulnerabilities..."
    
    if [[ "${ENABLE_VULNERABILITY_SCAN}" != "true" ]]; then
        test_result "Dependency Vulnerabilities" "SKIP" "Vulnerability scanning disabled"
        return
    fi
    
    if [[ ! -f "${PROJECT_ROOT}/package.json" ]]; then
        test_result "Dependency Vulnerabilities" "SKIP" "package.json not found"
        return
    fi
    
    local vulnerabilities=()
    
    # Run npm audit if available
    if command -v npm &> /dev/null; then
        local audit_output
        audit_output=$(cd "${PROJECT_ROOT}" && npm audit --json 2>> "${TEST_LOG}" || echo '{"vulnerabilities": {}}')
        
        # Parse audit results
        local vuln_count
        vuln_count=$(echo "${audit_output}" | jq '.metadata.vulnerabilities.total // 0' 2>> "${TEST_LOG}")
        
        if [[ ${vuln_count} -gt 0 ]]; then
            local high_vulns
            high_vulns=$(echo "${audit_output}" | jq '.metadata.vulnerabilities.high // 0' 2>> "${TEST_LOG}")
            local critical_vulns
            critical_vulns=$(echo "${audit_output}" | jq '.metadata.vulnerabilities.critical // 0' 2>> "${TEST_LOG}")
            
            if [[ ${high_vulns} -gt 0 || ${critical_vulns} -gt 0 ]]; then
                vulnerabilities+=("${vuln_count} total vulnerabilities (${high_vulns} high, ${critical_vulns} critical)")
            fi
        fi
    fi
    
    if [[ ${#vulnerabilities[@]} -eq 0 ]]; then
        test_result "Dependency Vulnerabilities" "PASS"
    else
        test_result "Dependency Vulnerabilities" "FAIL" "Vulnerabilities found: ${vulnerabilities[*]}"
    fi
}

test_container_vulnerabilities() {
    log "INFO" "Testing container vulnerabilities..."
    
    if [[ "${ENABLE_VULNERABILITY_SCAN}" != "true" ]]; then
        test_result "Container Vulnerabilities" "SKIP" "Vulnerability scanning disabled"
        return
    fi
    
    if ! command -v docker &> /dev/null; then
        test_result "Container Vulnerabilities" "SKIP" "Docker not available"
        return
    fi
    
    local vulnerabilities=()
    
    # Check if Trivy is available for container scanning
    if command -v trivy &> /dev/null; then
        local images
        images=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "(discord-bot|app)" | head -1)
        
        if [[ -n "${images}" ]]; then
            local scan_output
            scan_output=$(trivy image --format json "${images}" 2>> "${TEST_LOG}")
            
            if [[ -n "${scan_output}" ]]; then
                local vuln_count
                vuln_count=$(echo "${scan_output}" | jq '.Results[]?.Vulnerabilities | length // 0' 2>> "${TEST_LOG}")
                
                if [[ ${vuln_count} -gt 0 ]]; then
                    vulnerabilities+=("${vuln_count} container vulnerabilities found")
                fi
            fi
        else
            vulnerabilities+=("No Discord bot image found for scanning")
        fi
    else
        test_result "Container Vulnerabilities" "SKIP" "Trivy not available for container scanning"
        return
    fi
    
    if [[ ${#vulnerabilities[@]} -eq 0 ]]; then
        test_result "Container Vulnerabilities" "PASS"
    else
        test_result "Container Vulnerabilities" "FAIL" "Vulnerabilities: ${vulnerabilities[*]}"
    fi
}

test_system_vulnerabilities() {
    log "INFO" "Testing system vulnerabilities..."
    
    if [[ "${ENABLE_VULNERABILITY_SCAN}" != "true" ]]; then
        test_result "System Vulnerabilities" "SKIP" "Vulnerability scanning disabled"
        return
    fi
    
    local vulnerabilities=()
    
    # Check for outdated system packages (basic check)
    if command -v apt &> /dev/null; then
        if apt list --upgradable 2>> "${TEST_LOG}" | grep -q "upgradable"; then
            vulnerabilities+=("System packages need updates")
        fi
    elif command -v apk &> /dev/null; then
        if apk update &>> "${TEST_LOG} && apk upgrade --simulate &>> "${TEST_LOG} | grep -q "Upgrading"; then
            vulnerabilities+=("System packages need updates")
        fi
    fi
    
    # Check for common security issues
    local security_files=("/etc/passwd" "/etc/shadow" "/etc/hosts")
    for file in "${security_files[@]}"; do
        if [[ -f "${file}" ]]; then
            local perms
            perms=$(stat -c "%a" "${file}" 2>> "${TEST_LOG}")
            
            # Check for world-readable sensitive files
            if [[ "${file}" == "/etc/shadow" && "${perms: -1}" -ge 4 ]]; then
                vulnerabilities+=("${file} is world-readable")
            fi
        fi
    done
    
    if [[ ${#vulnerabilities[@]} -eq 0 ]]; then
        test_result "System Vulnerabilities" "PASS"
    else
        test_result "System Vulnerabilities" "FAIL" "Vulnerabilities: ${vulnerabilities[*]}"
    fi
}

# =============================================================================
# Test Execution and Reporting
# =============================================================================

run_all_tests() {
    log "INFO" "Starting comprehensive security test suite..."
    log "INFO" "Environment: ${ENVIRONMENT}"
    log "INFO" "Test log: ${TEST_LOG}"
    
    # Initialize test results file
    echo "result,test_name,message" > "${TEST_RESULTS_DIR}/security-test-results.csv"
    
    # Container security validation
    test_docker_image_security
    test_container_runtime_security
    test_dockerfile_hardening
    
    # Network security tests
    test_open_ports
    test_ssl_configuration
    test_http_security_headers
    test_network_isolation
    
    # Secret management validation
    test_environment_variable_secrets
    test_codebase_secrets
    test_docker_secrets
    
    # Access control tests
    test_file_permissions
    test_database_access_control
    test_redis_access_control
    
    # Vulnerability scanning
    test_dependency_vulnerabilities
    test_container_vulnerabilities
    test_system_vulnerabilities
    
    # Generate test report
    generate_test_report
}

generate_test_report() {
    log "INFO" "Generating security test report..."
    
    local report_file="${TEST_RESULTS_DIR}/security-test-report-$(date +%Y%m%d-%H%M%S).json"
    local summary_file="${TEST_RESULTS_DIR}/security-test-summary-$(date +%Y%m%d-%H%M%S).txt"
    
    # Generate JSON report
    cat > "${report_file}" << EOF
{
    "test_suite": "security-test-suite",
    "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
    "environment": "${ENVIRONMENT}",
    "total_tests": ${TOTAL_TESTS},
    "passed_tests": ${PASSED_TESTS},
    "failed_tests": ${FAILED_TESTS},
    "skipped_tests": ${SKIPPED_TESTS},
    "success_rate": "$(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")",
    "log_file": "${TEST_LOG}",
    "results_file": "${TEST_RESULTS_DIR}/security-test-results.csv",
    "test_parameters": {
        "enable_vulnerability_scan": "${ENABLE_VULNERABILITY_SCAN}",
        "enable_network_scan": "${ENABLE_NETWORK_SCAN}",
        "enable_secret_scan": "${ENABLE_SECRET_SCAN}"
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
Discord Bot Security Test Suite Summary
=======================================
Environment: ${ENVIRONMENT}
Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')

Test Parameters:
- Vulnerability Scanning: ${ENABLE_VULNERABILITY_SCAN}
- Network Scanning: ${ENABLE_NETWORK_SCAN}
- Secret Scanning: ${ENABLE_SECRET_SCAN}

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
- CSV Results: ${TEST_RESULTS_DIR}/security-test-results.csv

EOF
    
    if [[ ${FAILED_TESTS} -gt 0 ]]; then
        echo "FAILED TESTS:" >> "${summary_file}"
        grep "^FAIL," "${TEST_RESULTS_DIR}/security-test-results.csv" | cut -d',' -f2- >> "${summary_file}"
        echo "" >> "${summary_file}"
    fi
    
    if [[ ${SKIPPED_TESTS} -gt 0 ]]; then
        echo "SKIPPED TESTS:" >> "${summary_file}"
        grep "^SKIP," "${TEST_RESULTS_DIR}/security-test-results.csv" | cut -d',' -f2- >> "${summary_file}"
    fi
    
    log "SUCCESS" "Security test report generated: ${report_file}"
    log "INFO" "Security test summary: ${summary_file}"
    
    # Display summary
    echo ""
    echo "======================================="
    echo "Security Test Suite Summary"
    echo "======================================="
    echo "Environment: ${ENVIRONMENT}"
    echo "Total Tests: ${TOTAL_TESTS}"
    echo "Passed: ${PASSED_TESTS}"
    echo "Failed: ${FAILED_TESTS}"
    echo "Skipped: ${SKIPPED_TESTS}"
    echo "Success Rate: $(echo "scale=2; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc -l 2>/dev/null || echo "0")%"
    echo "======================================="
    
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

Run comprehensive security tests for Discord bot Coolify deployment.

OPTIONS:
    -e, --environment ENV     Target environment (staging|production) [default: staging]
    -t, --timeout SECONDS     Test timeout in seconds [default: 1200]
    -v, --verbose             Enable verbose logging
    -s, --skip-external-tests Skip external service tests
    -d, --domain DOMAIN       Application domain [default: localhost]
    -p, --app-port PORT       Application port [default: 8080]
    --postgres-port PORT      PostgreSQL port [default: 5432]
    --redis-port PORT         Redis port [default: 6379]
    --enable-vuln-scan       Enable vulnerability scanning [default: true]
    --disable-vuln-scan      Disable vulnerability scanning
    --enable-secret-scan      Enable secret scanning [default: true]
    --disable-secret-scan     Disable secret scanning
    -h, --help                Show this help message

ENVIRONMENT VARIABLES:
    ENVIRONMENT               Target environment
    TEST_TIMEOUT              Test timeout in seconds
    VERBOSE                   Verbose logging (true/false)
    SKIP_EXTERNAL_TESTS       Skip external tests (true/false)
    DOMAIN                    Application domain
    APP_PORT                  Application port
    POSTGRES_PORT             PostgreSQL port
    REDIS_PORT                Redis port
    ENABLE_VULNERABILITY_SCAN Enable vulnerability scanning (true/false)
    ENABLE_NETWORK_SCAN       Enable network scanning (true/false)
    ENABLE_SECRET_SCAN        Enable secret scanning (true/false)
    DB_HOST                   Database host
    DB_USER                   Database username
    DB_PASSWORD               Database password
    DB_NAME                   Database name
    REDIS_HOST                Redis host
    REDIS_PASSWORD            Redis password

EXAMPLES:
    # Run all security tests for staging
    ${SCRIPT_NAME} -e staging

    # Run tests with verbose output
    ${SCRIPT_NAME} -v

    # Skip external tests
    ${SCRIPT_NAME} -s

    # Disable vulnerability scanning
    ${SCRIPT_NAME} --disable-vuln-scan

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
            --enable-vuln-scan)
                ENABLE_VULNERABILITY_SCAN="true"
                shift
                ;;
            --disable-vuln-scan)
                ENABLE_VULNERABILITY_SCAN="false"
                shift
                ;;
            --enable-secret-scan)
                ENABLE_SECRET_SCAN="true"
                shift
                ;;
            --disable-secret-scan)
                ENABLE_SECRET_SCAN="false"
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
    log "INFO" "Starting Discord bot security test suite..."
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Set timeout for the entire test suite
    timeout "${TEST_TIMEOUT}" bash -c "run_all_tests" || {
        log "ERROR" "Security test suite timed out after ${TEST_TIMEOUT} seconds"
        exit 1
    }
}

# Execute main function with all arguments
main "$@"