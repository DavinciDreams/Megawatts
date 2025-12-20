#!/bin/bash

# =============================================================================
# Discord Bot Coolify Secrets Setup Script
# =============================================================================
# This script helps users set up secrets in Coolify for the Discord bot deployment.
# It provides interactive prompts for required secrets, validates secret formats,
# and provides instructions for adding secrets to Coolify.
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
SECRETS_FILE="$PROJECT_ROOT/.coolify-secrets"

# Default values
DEFAULT_ENV="staging"
COOLIFY_URL=""
COOLIFY_API_TOKEN=""

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
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
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

# =============================================================================
# Coolify API Functions
# =============================================================================

test_coolify_connection() {
    print_info "Testing connection to Coolify..."
    
    if ! command -v curl &> /dev/null; then
        print_error "curl is not installed. Please install curl to use this script."
        return 1
    fi
    
    local response=$(curl -s -w "%{http_code}" -o /dev/null "$COOLIFY_URL/api/health" \
        -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
        -H "Content-Type: application/json")
    
    if [ "$response" = "200" ]; then
        print_success "Successfully connected to Coolify."
        return 0
    else
        print_error "Failed to connect to Coolify. HTTP status code: $response"
        print_error "Please check your Coolify URL and API token."
        return 1
    fi
}

add_secret_to_coolify() {
    local secret_name="$1"
    local secret_value="$2"
    local environment="$3"
    
    print_info "Adding secret '$secret_name' to Coolify for environment '$environment'..."
    
    local response=$(curl -s -w "%{http_code}" -o /dev/null "$COOLIFY_URL/api/v1/secrets" \
        -X POST \
        -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"$secret_name\", \"value\": \"$secret_value\", \"environment\": \"$environment\"}")
    
    if [ "$response" = "201" ] || [ "$response" = "200" ]; then
        print_success "Secret '$secret_name' added successfully."
        return 0
    elif [ "$response" = "409" ]; then
        print_warning "Secret '$secret_name' already exists. Updating..."
        
        response=$(curl -s -w "%{http_code}" -o /dev/null "$COOLIFY_URL/api/v1/secrets/$secret_name" \
            -X PUT \
            -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"value\": \"$secret_value\", \"environment\": \"$environment\"}")
        
        if [ "$response" = "200" ]; then
            print_success "Secret '$secret_name' updated successfully."
            return 0
        else
            print_error "Failed to update secret '$secret_name'. HTTP status code: $response"
            return 1
        fi
    else
        print_error "Failed to add secret '$secret_name'. HTTP status code: $response"
        return 1
    fi
}

# =============================================================================
# Main Functions
# =============================================================================

setup_coolify_connection() {
    print_header "Coolify Connection Setup"
    
    prompt_input "Enter Coolify URL (e.g., https://coolify.example.com): " "" COOLIFY_URL false
    prompt_input "Enter Coolify API Token: " "" COOLIFY_API_TOKEN true
    
    if ! test_coolify_connection; then
        print_error "Failed to connect to Coolify. Please check your credentials and try again."
        exit 1
    fi
}

collect_environment_info() {
    print_header "Environment Selection"
    
    local environments=("development" "staging" "production")
    prompt_choice "Select the environment to configure:" "2" SELECTED_ENV "${environments[@]}"
    
    print_info "Selected environment: $SELECTED_ENV"
    
    # Set environment-specific secret suffix
    case "$SELECTED_ENV" in
        "development")
            ENV_SUFFIX="_DEV"
            ;;
        "staging")
            ENV_SUFFIX="_STAGING"
            ;;
        "production")
            ENV_SUFFIX=""
            ;;
    esac
}

collect_discord_config() {
    print_header "Discord Configuration"
    
    while true; do
        prompt_input "Enter Discord Bot Token: " "" DISCORD_TOKEN true
        if validate_discord_token "$DISCORD_TOKEN"; then
            break
        fi
    done
    
    prompt_input "Enter Discord Client ID: " "" DISCORD_CLIENT_ID false
}

collect_database_config() {
    print_header "Database Configuration"
    
    prompt_input "Enter Database Name: " "discord_bot$ENV_SUFFIX" DB_NAME false
    prompt_input "Enter Database Username: " "discord_bot_user$ENV_SUFFIX" DB_USER false
    
    while true; do
        prompt_input "Enter Database Password: " "" DB_PASSWORD true
        if validate_password "$DB_PASSWORD" "database"; then
            break
        fi
    done
}

collect_redis_config() {
    print_header "Redis Configuration"
    
    while true; do
        prompt_input "Enter Redis Password: " "" REDIS_PASSWORD true
        if validate_password "$REDIS_PASSWORD" "Redis"; then
            break
        fi
    done
    
    prompt_input "Enter Redis DB Number: " "0" REDIS_DB false
}

collect_ai_config() {
    print_header "AI Service Configuration"
    
    prompt_choice "Select AI provider to configure:" "1" AI_PROVIDER "OpenAI" "Anthropic" "Both"
    
    case "$AI_PROVIDER" in
        "OpenAI")
            while true; do
                prompt_input "Enter OpenAI API Key: " "" OPENAI_API_KEY true
                if validate_openai_api_key "$OPENAI_API_KEY"; then
                    break
                fi
            done
            ;;
        "Anthropic")
            while true; do
                prompt_input "Enter Anthropic API Key: " "" ANTHROPIC_API_KEY true
                if validate_anthropic_api_key "$ANTHROPIC_API_KEY"; then
                    break
                fi
            done
            ;;
        "Both")
            while true; do
                prompt_input "Enter OpenAI API Key: " "" OPENAI_API_KEY true
                if validate_openai_api_key "$OPENAI_API_KEY"; then
                    break
                fi
            done
            
            while true; do
                prompt_input "Enter Anthropic API Key: " "" ANTHROPIC_API_KEY true
                if validate_anthropic_api_key "$ANTHROPIC_API_KEY"; then
                    break
                fi
            done
            ;;
    esac
}

collect_storage_config() {
    print_header "S3 Storage Configuration"
    
    prompt_input "Enter S3 Bucket Name: " "discord-bot-storage$ENV_SUFFIX" S3_BUCKET false
    prompt_input "Enter S3 Region: " "us-east-1" S3_REGION false
    
    while true; do
        prompt_input "Enter S3 Access Key ID: " "" S3_ACCESS_KEY_ID true
        if validate_s3_access_key_id "$S3_ACCESS_KEY_ID"; then
            break
        fi
    done
    
    while true; do
        prompt_input "Enter S3 Secret Access Key: " "" S3_SECRET_ACCESS_KEY true
        if validate_s3_secret_access_key "$S3_SECRET_ACCESS_KEY"; then
            break
        fi
    done
}

collect_monitoring_config() {
    print_header "Monitoring Configuration"
    
    while true; do
        prompt_input "Enter Grafana Admin Password: " "" GRAFANA_PASSWORD true
        if validate_password "$GRAFANA_PASSWORD" "Grafana"; then
            break
        fi
    done
}

save_secrets_locally() {
    print_header "Save Secrets Locally"
    
    prompt_choice "Do you want to save the secrets locally for backup?" "2" SAVE_LOCALLY "Yes" "No"
    
    if [ "$SAVE_LOCALLY" = "Yes" ]; then
        prompt_input "Enter path to save secrets file: " "$SECRETS_FILE" SECRETS_FILE false
        
        cat > "$SECRETS_FILE" << EOF
# Discord Bot Secrets for $SELECTED_ENV Environment
# Generated on $(date)
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

# Discord Configuration
DISCORD_TOKEN=$DISCORD_TOKEN
DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID

# Database Configuration
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Redis Configuration
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_DB=$REDIS_DB

# AI Configuration
EOF
        
        if [ -n "$OPENAI_API_KEY" ]; then
            echo "OPENAI_API_KEY=$OPENAI_API_KEY" >> "$SECRETS_FILE"
        fi
        
        if [ -n "$ANTHROPIC_API_KEY" ]; then
            echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >> "$SECRETS_FILE"
        fi
        
        cat >> "$SECRETS_FILE" << EOF

# Storage Configuration
S3_BUCKET=$S3_BUCKET
S3_REGION=$S3_REGION
S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY

# Monitoring Configuration
GRAFANA_PASSWORD=$GRAFANA_PASSWORD
EOF
        
        chmod 600 "$SECRETS_FILE"
        print_success "Secrets saved to $SECRETS_FILE"
        print_warning "Make sure to secure this file and do not commit it to version control."
    fi
}

add_secrets_to_coolify() {
    print_header "Add Secrets to Coolify"
    
    prompt_choice "Do you want to add these secrets to Coolify now?" "1" ADD_TO_COOLIFY "Yes" "No"
    
    if [ "$ADD_TO_COOLIFY" = "Yes" ]; then
        setup_coolify_connection
        
        # Add Discord secrets
        add_secret_to_coolify "DISCORD_TOKEN$ENV_SUFFIX" "$DISCORD_TOKEN" "$SELECTED_ENV"
        add_secret_to_coolify "DISCORD_CLIENT_ID$ENV_SUFFIX" "$DISCORD_CLIENT_ID" "$SELECTED_ENV"
        
        # Add database secrets
        add_secret_to_coolify "DB_NAME$ENV_SUFFIX" "$DB_NAME" "$SELECTED_ENV"
        add_secret_to_coolify "DB_USER$ENV_SUFFIX" "$DB_USER" "$SELECTED_ENV"
        add_secret_to_coolify "DB_PASSWORD$ENV_SUFFIX" "$DB_PASSWORD" "$SELECTED_ENV"
        
        # Add Redis secrets
        add_secret_to_coolify "REDIS_PASSWORD$ENV_SUFFIX" "$REDIS_PASSWORD" "$SELECTED_ENV"
        add_secret_to_coolify "REDIS_DB" "$REDIS_DB" "$SELECTED_ENV"
        
        # Add AI secrets
        if [ -n "$OPENAI_API_KEY" ]; then
            add_secret_to_coolify "OPENAI_API_KEY$ENV_SUFFIX" "$OPENAI_API_KEY" "$SELECTED_ENV"
        fi
        
        if [ -n "$ANTHROPIC_API_KEY" ]; then
            add_secret_to_coolify "ANTHROPIC_API_KEY$ENV_SUFFIX" "$ANTHROPIC_API_KEY" "$SELECTED_ENV"
        fi
        
        # Add storage secrets
        add_secret_to_coolify "S3_BUCKET$ENV_SUFFIX" "$S3_BUCKET" "$SELECTED_ENV"
        add_secret_to_coolify "S3_REGION" "$S3_REGION" "$SELECTED_ENV"
        add_secret_to_coolify "S3_ACCESS_KEY_ID$ENV_SUFFIX" "$S3_ACCESS_KEY_ID" "$SELECTED_ENV"
        add_secret_to_coolify "S3_SECRET_ACCESS_KEY$ENV_SUFFIX" "$S3_SECRET_ACCESS_KEY" "$SELECTED_ENV"
        
        # Add monitoring secrets
        add_secret_to_coolify "GRAFANA_PASSWORD$ENV_SUFFIX" "$GRAFANA_PASSWORD" "$SELECTED_ENV"
        
        print_success "All secrets have been added to Coolify for the $SELECTED_ENV environment."
    fi
}

print_manual_instructions() {
    print_header "Manual Setup Instructions"
    
    cat << EOF
If you prefer to add secrets manually to Coolify, follow these steps:

1. Log in to your Coolify instance at $COOLIFY_URL
2. Navigate to your Discord Bot project
3. Go to the "Secrets" tab
4. Add the following secrets for the $SELECTED_ENV environment:

Discord Configuration:
- DISCORD_TOKEN$ENV_SUFFIX: $DISCORD_TOKEN
- DISCORD_CLIENT_ID$ENV_SUFFIX: $DISCORD_CLIENT_ID

Database Configuration:
- DB_NAME$ENV_SUFFIX: $DB_NAME
- DB_USER$ENV_SUFFIX: $DB_USER
- DB_PASSWORD$ENV_SUFFIX: $DB_PASSWORD

Redis Configuration:
- REDIS_PASSWORD$ENV_SUFFIX: $REDIS_PASSWORD
- REDIS_DB: $REDIS_DB

AI Configuration:
EOF

    if [ -n "$OPENAI_API_KEY" ]; then
        echo "- OPENAI_API_KEY$ENV_SUFFIX: $OPENAI_API_KEY"
    fi
    
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        echo "- ANTHROPIC_API_KEY$ENV_SUFFIX: $ANTHROPIC_API_KEY"
    fi

    cat << EOF

Storage Configuration:
- S3_BUCKET$ENV_SUFFIX: $S3_BUCKET
- S3_REGION: $S3_REGION
- S3_ACCESS_KEY_ID$ENV_SUFFIX: $S3_ACCESS_KEY_ID
- S3_SECRET_ACCESS_KEY$ENV_SUFFIX: $S3_SECRET_ACCESS_KEY

Monitoring Configuration:
- GRAFANA_PASSWORD$ENV_SUFFIX: $GRAFANA_PASSWORD

5. After adding all secrets, deploy your application to the $SELECTED_ENV environment.
EOF
}

print_next_steps() {
    print_header "Next Steps"
    
    cat << EOF
Your secrets have been configured for the $SELECTED_ENV environment. Here are the next steps:

1. Deploy your Discord bot to the $SELECTED_ENV environment:
   - In Coolify, go to your Discord Bot project
   - Select the $SELECTED_ENV environment
   - Click "Deploy"

2. Monitor the deployment:
   - Check the deployment logs for any errors
   - Verify that all services are running correctly

3. Test your bot:
   - Invite the bot to your Discord server
   - Test basic commands and features
   - Verify AI functionality if configured

4. Configure monitoring:
   - Access Grafana to monitor your bot's performance
   - Set up alerts for critical metrics

5. For production deployments:
   - Ensure you have proper SSL/TLS certificates
   - Configure backup strategies
   - Set up log aggregation and alerting

If you encounter any issues, refer to the troubleshooting section in coolify-deployment.md.
EOF
}

# =============================================================================
# Main Script Execution
# =============================================================================

main() {
    print_header "Discord Bot Coolify Secrets Setup"
    
    cat << EOF
This script will help you set up secrets for your Discord bot deployment in Coolify.
It will collect all necessary secrets and provide instructions for adding them to Coolify.

You can choose to:
1. Add secrets automatically via Coolify API (requires API token)
2. Save secrets locally for manual setup
3. Get instructions for manual setup in Coolify UI

Let's get started!
EOF
    
    collect_environment_info
    collect_discord_config
    collect_database_config
    collect_redis_config
    collect_ai_config
    collect_storage_config
    collect_monitoring_config
    save_secrets_locally
    add_secrets_to_coolify
    print_manual_instructions
    print_next_steps
    
    print_header "Setup Complete"
    print_success "Discord bot secrets setup for $SELECTED_ENV environment is complete!"
}

# Check if script is being executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi