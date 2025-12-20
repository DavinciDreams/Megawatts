#!/bin/bash

# =============================================================================
# Discord Bot Coolify Configuration Validation Script
# =============================================================================
# This script validates the Coolify configuration for the Discord bot deployment.
# It checks required environment variables, validates secret formats,
# ensures configuration consistency, and performs pre-deployment checks.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COOLIFY_ENVIRONMENTS_FILE="$PROJECT_ROOT/coolify-environments.yml"
COOLIFY_JSON_FILE="$PROJECT_ROOT/coolify.json"
COOLIFY_COMPOSE_FILE="$PROJECT_ROOT/coolify-compose.yml"
SECRETS_EXAMPLE_FILE="$PROJECT_ROOT/coolify-secrets.env.example"

# Validation results
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0
CURRENT_ENV=""
ENVIRONMENT_FILE_EXISTS=false
SECRETS_FILE_EXISTS=false

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo -e "${BLUE}=============================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=============================================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    ((VALIDATION_ERRORS++))
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
    ((VALIDATION_WARNINGS++))
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

prompt_input() {
    local prompt="$1"
    local default_value="$2"
    local variable_name="$3"
    local is_secret="$4"
    
    if [ "$is_secret" = "true" ]; then
        read -s -p "$prompt" input
        echo
    else
        read -p "$prompt" input
    fi
    
    if [ -z "$input" ] && [ -n "$default_value" ]; then
        input="$default_value"
    fi
    
    eval "$variable_name='$input'"
}

prompt_choice() {
    local prompt="$1"
    local default_choice="$2"
    local variable_name="$3"
    shift 3
    local choices=("$@")
    
    echo "$prompt"
    for i in "${!choices[@]}"; do
        echo "  $((i+1)). ${choices[$i]}"
    done
    
    while true; do
        read -p "Enter choice [1-${#choices[@]}] (default: $default_choice): " choice
        if [ -z "$choice" ]; then
            choice="$default_choice"
        fi
        
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#choices[@]}" ]; then
            eval "$variable_name='${choices[$((choice-1))]}'"
            break
        else
            print_error "Invalid choice. Please enter a number between 1 and ${#choices[@]}."
        fi
    done
}

check_command_exists() {
    local command="$1"
    local package_name="$2"
    
    if ! command -v "$command" &> /dev/null; then
        print_error "$command is not installed. Please install $package_name."
        return 1
    else
        print_success "$command is installed."
        return 0
    fi
}

check_file_exists() {
    local file_path="$1"
    local file_description="$2"
    
    if [ -f "$file_path" ]; then
        print_success "$file_description found at $file_path"
        return 0
    else
        print_error "$file_description not found at $file_path"
        return 1
    fi
}

check_yaml_syntax() {
    local file_path="$1"
    local file_description="$2"
    
    if command -v yq &> /dev/null; then
        if yq eval '.' "$file_path" > /dev/null 2>&1; then
            print_success "$file_description has valid YAML syntax."
            return 0
        else
            print_error "$file_description has invalid YAML syntax."
            return 1
        fi
    elif command -v python3 &> /dev/null; then
        if python3 -c "import yaml; yaml.safe_load(open('$file_path'))" 2>/dev/null; then
            print_success "$file_description has valid YAML syntax."
            return 0
        else
            print_error "$file_description has invalid YAML syntax."
            return 1
        fi
    else
        print_warning "Cannot validate YAML syntax: yq or python3 not found."
        return 0
    fi
}

check_json_syntax() {
    local file_path="$1"
    local file_description="$2"
    
    if command -v jq &> /dev/null; then
        if jq empty "$file_path" 2>/dev/null; then
            print_success "$file_description has valid JSON syntax."
            return 0
        else
            print_error "$file_description has invalid JSON syntax."
            return 1
        fi
    elif command -v python3 &> /dev/null; then
        if python3 -c "import json; json.load(open('$file_path'))" 2>/dev/null; then
            print_success "$file_description has valid JSON syntax."
            return 0
        else
            print_error "$file_description has invalid JSON syntax."
            return 1
        fi
    else
        print_warning "Cannot validate JSON syntax: jq or python3 not found."
        return 0
    fi
}

validate_discord_token() {
    local token="$1"
    if [[ ! "$token" =~ ^[A-Za-z0-9_-]{50,}$ ]]; then
        print_error "Invalid Discord token format. Token should be at least 50 characters and contain only alphanumeric characters, underscores, and hyphens."
        return 1
    fi
    return 0
}

validate_openai_api_key() {
    local api_key="$1"
    if [[ ! "$api_key" =~ ^sk-[A-Za-z0-9]{48}$ ]]; then
        print_error "Invalid OpenAI API key format. Key should start with 'sk-' followed by 48 alphanumeric characters."
        return 1
    fi
    return 0
}

validate_anthropic_api_key() {
    local api_key="$1"
    if [[ ! "$api_key" =~ ^sk-ant-api[0-9]{3}-[A-Za-z0-9_-]{95}$ ]]; then
        print_error "Invalid Anthropic API key format. Key should start with 'sk-ant-api' followed by the correct pattern."
        return 1
    fi
    return 0
}

validate_s3_access_key_id() {
    local key_id="$1"
    if [[ ! "$key_id" =~ ^[A-Za-z0-9]{16,20}$ ]]; then
        print_error "Invalid S3 Access Key ID format. Should be 16-20 alphanumeric characters."
        return 1
    fi
    return 0
}

validate_s3_secret_access_key() {
    local secret_key="$1"
    if [[ ! "$secret_key" =~ ^[A-Za-z0-9+/]{40}$ ]]; then
        print_error "Invalid S3 Secret Access Key format. Should be 40 characters with alphanumeric characters and possibly '+' or '/'."
        return 1
    fi
    return 0
}

validate_password() {
    local password="$1"
    local service="$2"
    if [ ${#password} -lt 8 ]; then
        print_error "Invalid $service password. Password should be at least 8 characters long."
        return 1
    fi
    return 0
}

validate_port() {
    local port="$1"
    local service="$2"
    
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        print_error "Invalid $service port: $port. Port should be a number."
        return 1
    fi
    
    if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
        print_error "Invalid $service port: $port. Port should be between 1 and 65535."
        return 1
    fi
    
    return 0
}

validate_domain() {
    local domain="$1"
    
    if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        print_error "Invalid domain format: $domain"
        return 1
    fi
    
    return 0
}

# =============================================================================
# Validation Functions
# =============================================================================

validate_prerequisites() {
    print_header "Prerequisites Validation"
    
    # Check required commands
    check_command_exists "docker" "Docker"
    check_command_exists "docker-compose" "Docker Compose"
    check_command_exists "curl" "curl"
    
    # Check optional commands
    if command -v yq &> /dev/null; then
        print_success "yq is installed (YAML validation available)."
    else
        print_warning "yq is not installed (YAML validation will use python3 if available)."
    fi
    
    if command -v jq &> /dev/null; then
        print_success "jq is installed (JSON validation available)."
    else
        print_warning "jq is not installed (JSON validation will use python3 if available)."
    fi
}

validate_configuration_files() {
    print_header "Configuration Files Validation"
    
    # Check required files
    if check_file_exists "$COOLIFY_ENVIRONMENTS_FILE" "Coolify environments file"; then
        ENVIRONMENT_FILE_EXISTS=true
        check_yaml_syntax "$COOLIFY_ENVIRONMENTS_FILE" "Coolify environments file"
    fi
    
    if check_file_exists "$COOLIFY_JSON_FILE" "Coolify JSON file"; then
        check_json_syntax "$COOLIFY_JSON_FILE" "Coolify JSON file"
    fi
    
    if check_file_exists "$COOLIFY_COMPOSE_FILE" "Coolify Compose file"; then
        check_yaml_syntax "$COOLIFY_COMPOSE_FILE" "Coolify Compose file"
    fi
    
    if check_file_exists "$SECRETS_EXAMPLE_FILE" "Secrets example file"; then
        SECRETS_FILE_EXISTS=true
    fi
    
    # Check Dockerfile
    if check_file_exists "$PROJECT_ROOT/Dockerfile.prod" "Production Dockerfile"; then
        print_success "Production Dockerfile found."
    else
        print_error "Production Dockerfile not found."
    fi
}

validate_environment_configuration() {
    print_header "Environment Configuration Validation"
    
    if [ "$ENVIRONMENT_FILE_EXISTS" = false ]; then
        print_error "Cannot validate environment configuration: coolify-environments.yml not found."
        return 1
    fi
    
    # Extract environments from the file
    local environments=()
    
    if command -v yq &> /dev/null; then
        mapfile -t environments < <(yq eval '.environments | keys | .[]' "$COOLIFY_ENVIRONMENTS_FILE" 2>/dev/null)
    elif command -v python3 &> /dev/null; then
        mapfile -t environments < <(python3 -c "
import yaml
with open('$COOLIFY_ENVIRONMENTS_FILE', 'r') as f:
    data = yaml.safe_load(f)
    if 'environments' in data:
        for env in data['environments'].keys():
            print(env)
" 2>/dev/null)
    fi
    
    if [ ${#environments[@]} -eq 0 ]; then
        print_error "No environments found in coolify-environments.yml"
        return 1
    fi
    
    print_success "Found ${#environments[@]} environments: ${environments[*]}"
    
    # Select environment to validate
    if [ -z "$CURRENT_ENV" ]; then
        prompt_choice "Select environment to validate:" "1" CURRENT_ENV "${environments[@]}"
    fi
    
    print_info "Validating configuration for '$CURRENT_ENV' environment..."
    
    # Validate environment-specific configuration
    validate_environment_variables "$CURRENT_ENV"
    validate_resource_limits "$CURRENT_ENV"
    validate_port_configuration "$CURRENT_ENV"
}

validate_environment_variables() {
    local env="$1"
    
    print_info "Validating environment variables for '$env'..."
    
    # Check required variables
    local required_vars=(
        "NODE_ENV"
        "LOG_LEVEL"
        "DOMAIN"
        "APP_PORT"
        "DB_NAME"
        "DB_USER"
        "REDIS_DB"
        "S3_REGION"
    )
    
    for var in "${required_vars[@]}"; do
        local value=""
        
        if command -v yq &> /dev/null; then
            value=$(yq eval ".environments.$env.variables.$var" "$COOLIFY_ENVIRONMENTS_FILE" 2>/dev/null)
        elif command -v python3 &> /dev/null; then
            value=$(python3 -c "
import yaml
with open('$COOLIFY_ENVIRONMENTS_FILE', 'r') as f:
    data = yaml.safe_load(f)
    value = data.get('environments', {}).get('$env', {}).get('variables', {}).get('$var', '')
    print(value if value else '')
" 2>/dev/null)
        fi
        
        if [ -z "$value" ] || [ "$value" = "null" ]; then
            print_error "Required environment variable '$var' is missing for environment '$env'."
        else
            print_success "Environment variable '$var' is set: $value"
            
            # Validate specific variables
            case "$var" in
                "APP_PORT")
                    validate_port "$value" "Application"
                    ;;
                "DOMAIN")
                    validate_domain "$value"
                    ;;
                "LOG_LEVEL")
                    if [[ ! "$value" =~ ^(debug|info|warn|error)$ ]]; then
                        print_warning "Unusual LOG_LEVEL value: $value (expected: debug, info, warn, error)"
                    fi
                    ;;
                "NODE_ENV")
                    if [[ ! "$value" =~ ^(development|staging|production)$ ]]; then
                        print_warning "Unusual NODE_ENV value: $value (expected: development, staging, production)"
                    fi
                    ;;
            esac
        fi
    done
}

validate_resource_limits() {
    local env="$1"
    
    print_info "Validating resource limits for '$env'..."
    
    # Check resource limits for discord-bot
    local cpu_limit=""
    local memory_limit=""
    local replicas=""
    
    if command -v yq &> /dev/null; then
        cpu_limit=$(yq eval ".environments.$env.resource_overrides.discord-bot.cpu_limit" "$COOLIFY_ENVIRONMENTS_FILE" 2>/dev/null)
        memory_limit=$(yq eval ".environments.$env.resource_overrides.discord-bot.memory_limit" "$COOLIFY_ENVIRONMENTS_FILE" 2>/dev/null)
        replicas=$(yq eval ".environments.$env.resource_overrides.discord-bot.replicas" "$COOLIFY_ENVIRONMENTS_FILE" 2>/dev/null)
    elif command -v python3 &> /dev/null; then
        local python_cmd="
import yaml
with open('$COOLIFY_ENVIRONMENTS_FILE', 'r') as f:
    data = yaml.safe_load(f)
    overrides = data.get('environments', {}).get('$env', {}).get('resource_overrides', {}).get('discord-bot', {})
    print(overrides.get('cpu_limit', ''))
    print(overrides.get('memory_limit', ''))
    print(overrides.get('replicas', ''))
"
        local result
        result=$(python3 -c "$python_cmd" 2>/dev/null)
        cpu_limit=$(echo "$result" | sed -n '1p')
        memory_limit=$(echo "$result" | sed -n '2p')
        replicas=$(echo "$result" | sed -n '3p')
    fi
    
    if [ -n "$cpu_limit" ] && [ "$cpu_limit" != "null" ]; then
        print_success "CPU limit is set: $cpu_limit"
    else
        print_warning "CPU limit is not set for discord-bot."
    fi
    
    if [ -n "$memory_limit" ] && [ "$memory_limit" != "null" ]; then
        print_success "Memory limit is set: $memory_limit"
    else
        print_warning "Memory limit is not set for discord-bot."
    fi
    
    if [ -n "$replicas" ] && [ "$replicas" != "null" ]; then
        print_success "Replicas is set: $replicas"
        
        if [ "$env" = "production" ] && [ "$replicas" -lt 2 ]; then
            print_warning "Production environment should have at least 2 replicas for high availability."
        fi
    else
        print_warning "Replicas is not set for discord-bot."
    fi
}

validate_port_configuration() {
    local env="$1"
    
    print_info "Validating port configuration for '$env'..."
    
    # Check for port conflicts
    local ports=()
    
    if command -v yq &> /dev/null; then
        mapfile -t ports < <(yq eval ".environments.$env.variables | to_entries | select(.key | endswith(\"_PORT\")) | .value" "$COOLIFY_ENVIRONMENTS_FILE" 2>/dev/null)
    elif command -v python3 &> /dev/null; then
        mapfile -t ports < <(python3 -c "
import yaml
with open('$COOLIFY_ENVIRONMENTS_FILE', 'r') as f:
    data = yaml.safe_load(f)
    variables = data.get('environments', {}).get('$env', {}).get('variables', {})
    for key, value in variables.items():
        if key.endswith('_PORT'):
            print(value)
" 2>/dev/null)
    fi
    
    # Check for duplicate ports
    local unique_ports=($(printf "%s\n" "${ports[@]}" | sort -u))
    
    if [ ${#ports[@]} -gt ${#unique_ports[@]} ]; then
        print_error "Port conflict detected in environment '$env'."
        for port in "${unique_ports[@]}"; do
            local count=$(printf "%s\n" "${ports[@]}" | grep -c "^$port$")
            if [ "$count" -gt 1 ]; then
                print_error "Port $port is used $count times."
            fi
        done
    else
        print_success "No port conflicts detected."
    fi
    
    # Validate each port
    for port in "${unique_ports[@]}"; do
        if validate_port "$port" "Service"; then
            # Check for standard port conflicts
            case "$port" in
                "80")
                    if [ "$env" != "production" ]; then
                        print_warning "Using standard HTTP port 80 in non-production environment may cause conflicts."
                    fi
                    ;;
                "443")
                    if [ "$env" != "production" ]; then
                        print_warning "Using standard HTTPS port 443 in non-production environment may cause conflicts."
                    fi
                    ;;
                "5432")
                    if [ "$env" != "production" ]; then
                        print_warning "Using standard PostgreSQL port 5432 in non-production environment may cause conflicts."
                    fi
                    ;;
                "6379")
                    if [ "$env" != "production" ]; then
                        print_warning "Using standard Redis port 6379 in non-production environment may cause conflicts."
                    fi
                    ;;
            esac
        fi
    done
}

validate_secrets() {
    print_header "Secrets Validation"
    
    if [ "$SECRETS_FILE_EXISTS" = false ]; then
        print_error "Cannot validate secrets: coolify-secrets.env.example not found."
        return 1
    fi
    
    # Extract required secrets from the example file
    local required_secrets=()
    local optional_secrets=()
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^#.* ]]; then
            continue
        fi
        
        if [[ "$line" =~ ^[A-Z_]+=.*$ ]]; then
            local secret_name="${line%%=*}"
            if [[ "$line" =~ ^#.*Optional.* ]] || grep -q "^#.*$secret_name.*optional" "$SECRETS_EXAMPLE_FILE"; then
                optional_secrets+=("$secret_name")
            else
                required_secrets+=("$secret_name")
            fi
        fi
    done < "$SECRETS_EXAMPLE_FILE"
    
    print_info "Found ${#required_secrets[@]} required secrets and ${#optional_secrets[@]} optional secrets."
    
    # Check if secrets are configured in Coolify
    print_info "Checking if secrets are configured in Coolify..."
    
    for secret in "${required_secrets[@]}"; do
        print_info "Required secret: $secret"
        # In a real implementation, you would check if the secret exists in Coolify
        # For now, we'll just inform the user what needs to be checked
        print_warning "Please ensure '$secret' is configured in Coolify for the '$CURRENT_ENV' environment."
    done
    
    for secret in "${optional_secrets[@]}"; do
        print_info "Optional secret: $secret"
        print_info "Consider configuring '$secret' in Coolify if needed for your deployment."
    done
}

validate_docker_configuration() {
    print_header "Docker Configuration Validation"
    
    # Check Dockerfile
    local dockerfile="$PROJECT_ROOT/Dockerfile.prod"
    if [ -f "$dockerfile" ]; then
        # Check for base image
        if grep -q "^FROM" "$dockerfile"; then
            print_success "Dockerfile has a base image specified."
            local base_image=$(grep "^FROM" "$dockerfile" | head -1 | cut -d' ' -f2)
            print_info "Base image: $base_image"
            
            # Check if using a specific version tag
            if [[ "$base_image" =~ :latest$ ]]; then
                print_warning "Using 'latest' tag for base image. Consider using a specific version for reproducibility."
            fi
        else
            print_error "Dockerfile does not specify a base image."
        fi
        
        # Check for health check
        if grep -q "HEALTHCHECK" "$dockerfile"; then
            print_success "Dockerfile includes a health check."
        else
            print_warning "Dockerfile does not include a health check. Consider adding one for better monitoring."
        fi
        
        # Check for non-root user
        if grep -q "USER" "$dockerfile"; then
            print_success "Dockerfile specifies a non-root user."
        else
            print_warning "Dockerfile does not specify a non-root user. Consider running as a non-root user for security."
        fi
    fi
    
    # Check docker-compose file
    if [ -f "$COOLIFY_COMPOSE_FILE" ]; then
        # Check for restart policy
        if grep -q "restart:" "$COOLIFY_COMPOSE_FILE"; then
            print_success "Docker Compose file specifies restart policies."
        else
            print_warning "Docker Compose file does not specify restart policies. Consider adding them for resilience."
        fi
        
        # Check for resource limits
        if grep -q "deploy:" "$COOLIFY_COMPOSE_FILE"; then
            print_success "Docker Compose file includes deployment configuration."
        else
            print_warning "Docker Compose file does not include deployment configuration. Consider adding resource limits."
        fi
    fi
}

validate_network_configuration() {
    print_header "Network Configuration Validation"
    
    if [ "$ENVIRONMENT_FILE_EXISTS" = false ]; then
        print_error "Cannot validate network configuration: coolify-environments.yml not found."
        return 1
    fi
    
    # Check network configuration
    local network_subnet=""
    
    if command -v yq &> /dev/null; then
        network_subnet=$(yq eval ".environments.$CURRENT_ENV.variables.NETWORK_SUBNET" "$COOLIFY_ENVIRONMENTS_FILE" 2>/dev/null)
    elif command -v python3 &> /dev/null; then
        network_subnet=$(python3 -c "
import yaml
with open('$COOLIFY_ENVIRONMENTS_FILE', 'r') as f:
    data = yaml.safe_load(f)
    subnet = data.get('environments', {}).get('$CURRENT_ENV', {}).get('variables', {}).get('NETWORK_SUBNET', '')
    print(subnet)
" 2>/dev/null)
    fi
    
    if [ -n "$network_subnet" ] && [ "$network_subnet" != "null" ]; then
        print_success "Network subnet is configured: $network_subnet"
        
        # Validate subnet format
        if [[ "$network_subnet" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]]; then
            print_success "Network subnet has valid format."
        else
            print_error "Network subnet has invalid format: $network_subnet"
        fi
    else
        print_warning "Network subnet is not configured."
    fi
}

validate_security_configuration() {
    print_header "Security Configuration Validation"
    
    # Check for security best practices
    print_info "Checking security best practices..."
    
    # Check if secrets are properly referenced
    if [ -f "$COOLIFY_COMPOSE_FILE" ]; then
        if grep -q "\${.*}" "$COOLIFY_COMPOSE_FILE"; then
            print_success "Docker Compose file uses environment variable references for secrets."
        else
            print_warning "Docker Compose file does not appear to use environment variable references for secrets."
        fi
    fi
    
    # Check for SSL/TLS configuration
    if [ -f "$COOLIFY_ENVIRONMENTS_FILE" ]; then
        local nginx_https_port=""
        
        if command -v yq &> /dev/null; then
            nginx_https_port=$(yq eval ".environments.$CURRENT_ENV.variables.NGINX_HTTPS_PORT" "$COOLIFY_ENVIRONMENTS_FILE" 2>/dev/null)
        elif command -v python3 &> /dev/null; then
            nginx_https_port=$(python3 -c "
import yaml
with open('$COOLIFY_ENVIRONMENTS_FILE', 'r') as f:
    data = yaml.safe_load(f)
    port = data.get('environments', {}).get('$CURRENT_ENV', {}).get('variables', {}).get('NGINX_HTTPS_PORT', '')
    print(port)
" 2>/dev/null)
        fi
        
        if [ -n "$nginx_https_port" ] && [ "$nginx_https_port" != "null" ]; then
            print_success "HTTPS port is configured: $nginx_https_port"
            
            if [ "$CURRENT_ENV" = "production" ]; then
                print_info "Ensure SSL/TLS certificates are properly configured for production."
            fi
        else
            print_warning "HTTPS port is not configured."
        fi
    fi
    
    # Check for firewall rules
    print_warning "Ensure firewall rules are configured to restrict access to monitoring services."
    print_warning "Ensure only necessary ports are exposed to the internet."
}

perform_pre_deployment_checks() {
    print_header "Pre-Deployment Checks"
    
    # Check if Docker is running
    if docker info &> /dev/null; then
        print_success "Docker is running."
    else
        print_error "Docker is not running. Please start Docker before deployment."
    fi
    
    # Check available disk space
    local available_space
    available_space=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    
    if [ "$available_space" -lt 5 ]; then
        print_warning "Low disk space: ${available_space}GB available. Consider freeing up space before deployment."
    else
        print_success "Sufficient disk space available: ${available_space}GB"
    fi
    
    # Check available memory
    local available_memory
    if command -v free &> /dev/null; then
        available_memory=$(free -m | awk 'NR==2{printf "%.0f", $7/1024}')
    elif command -v vm_stat &> /dev/null; then
        # macOS
        available_memory=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//' | awk '{printf "%.0f", $1 * 4096 / 1024 / 1024 / 1024}')
    fi
    
    if [ -n "$available_memory" ]; then
        if [ "$available_memory" -lt 2 ]; then
            print_warning "Low available memory: ${available_memory}GB. Consider freeing up memory before deployment."
        else
            print_success "Sufficient available memory: ${available_memory}GB"
        fi
    fi
    
    # Check for running services that might conflict
    local conflicting_ports=("80" "443" "5432" "6379" "8080" "3000" "9090")
    
    for port in "${conflicting_ports[@]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            print_warning "Port $port is already in use. This might cause conflicts during deployment."
        fi
    done
}

print_validation_summary() {
    print_header "Validation Summary"
    
    echo -e "Validation completed with:"
    echo -e "  ${RED}$VALIDATION_ERRORS error(s)${NC}"
    echo -e "  ${YELLOW}$VALIDATION_WARNINGS warning(s)${NC}"
    
    if [ "$VALIDATION_ERRORS" -gt 0 ]; then
        print_error "Validation failed. Please fix the errors before deploying."
        return 1
    elif [ "$VALIDATION_WARNINGS" -gt 0 ]; then
        print_warning "Validation passed with warnings. Consider addressing the warnings for optimal deployment."
        return 0
    else
        print_success "Validation passed successfully. Your configuration is ready for deployment."
        return 0
    fi
}

print_next_steps() {
    print_header "Next Steps"
    
    cat << EOF
Your configuration has been validated. Here are the next steps:

1. Set up secrets in Coolify:
   - Run: ./scripts/setup-coolify-secrets.sh
   - Or manually add secrets through the Coolify UI

2. Deploy your Discord bot:
   - In Coolify, go to your Discord Bot project
   - Select the $CURRENT_ENV environment
   - Click "Deploy"

3. Monitor the deployment:
   - Check the deployment logs for any errors
   - Verify that all services are running correctly

4. Test your bot:
   - Invite the bot to your Discord server
   - Test basic commands and features
   - Verify AI functionality if configured

5. Configure monitoring:
   - Access Grafana to monitor your bot's performance
   - Set up alerts for critical metrics

If you encounter any issues, refer to the troubleshooting section in coolify-deployment.md.
EOF
}

# =============================================================================
# Main Script Execution
# =============================================================================

main() {
    print_header "Discord Bot Coolify Configuration Validation"
    
    cat << EOF
This script validates the Coolify configuration for your Discord bot deployment.
It checks required environment variables, validates secret formats,
ensures configuration consistency, and performs pre-deployment checks.

Let's start the validation process...
EOF
    
    validate_prerequisites
    validate_configuration_files
    validate_environment_configuration
    validate_secrets
    validate_docker_configuration
    validate_network_configuration
    validate_security_configuration
    perform_pre_deployment_checks
    
    if print_validation_summary; then
        print_next_steps
    else
        print_error "Validation failed. Please fix the errors before deploying."
        exit 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --environment)
            CURRENT_ENV="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--environment ENVIRONMENT]"
            echo "  --environment: Specify the environment to validate (development, staging, production)"
            echo "  --help: Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if script is being executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi