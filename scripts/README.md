# Discord Bot Coolify Scripts

This directory contains scripts to help with the deployment of the Discord bot using Coolify.

## Scripts Overview

### 1. setup-coolify-secrets.sh

Interactive script to help users set up secrets in Coolify for the Discord bot deployment.

**Features:**
- Interactive prompts for required secrets
- Validation of secret formats
- Instructions for adding secrets to Coolify
- Environment-specific secret setup
- Option to add secrets automatically via Coolify API
- Option to save secrets locally for backup

**Usage:**

On Linux/macOS:
```bash
./scripts/setup-coolify-secrets.sh
```

On Windows (using Git Bash or WSL):
```bash
bash scripts/setup-coolify-secrets.sh
```

### 2. validate-coolify-config.sh

Validation script for checking the Coolify configuration before deployment.

**Features:**
- Checking required environment variables
- Validating secret formats
- Ensuring configuration consistency
- Pre-deployment checks
- Docker configuration validation
- Network configuration validation
- Security configuration validation

**Usage:**

On Linux/macOS:
```bash
./scripts/validate-coolify-config.sh
```

On Windows (using Git Bash or WSL):
```bash
bash scripts/validate-coolify-config.sh
```

With specific environment:
```bash
./scripts/validate-coolify-config.sh --environment production
```

## Prerequisites

### Required Tools

1. **Docker** - For containerization
2. **Docker Compose** - For multi-container applications
3. **curl** - For API calls and health checks

### Optional Tools (for enhanced validation)

1. **yq** - For YAML validation and parsing
   - Install on macOS: `brew install yq`
   - Install on Linux: `sudo apt-get install yq` or `sudo yum install yq`

2. **jq** - For JSON validation and parsing
   - Install on macOS: `brew install jq`
   - Install on Linux: `sudo apt-get install jq` or `sudo yum install jq`

3. **Python 3** - Alternative for YAML/JSON validation if yq/jq are not available

## Windows Setup

### Option 1: Using Git Bash

1. Install Git for Windows from https://git-scm.com/download/win
2. Open Git Bash and run the scripts:
   ```bash
   bash scripts/setup-coolify-secrets.sh
   bash scripts/validate-coolify-config.sh
   ```

### Option 2: Using WSL (Windows Subsystem for Linux)

1. Install WSL by running in PowerShell as Administrator:
   ```powershell
   wsl --install
   ```

2. After installation, open WSL and run:
   ```bash
   bash scripts/setup-coolify-secrets.sh
   bash scripts/validate-coolify-config.sh
   ```

### Option 3: Using PowerShell

1. Install PowerShell 7+ if not already installed
2. Run the scripts with:
   ```powershell
   bash scripts/setup-coolify-secrets.sh
   bash scripts/validate-coolify-config.sh
   ```

## Environment Variables

The scripts work with the following environment variables:

### Required Secrets

- `DISCORD_TOKEN` - Discord bot token
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name
- `REDIS_PASSWORD` - Redis password
- `REDIS_DB` - Redis database number
- `OPENAI_API_KEY` - OpenAI API key
- `S3_BUCKET` - S3 bucket name
- `S3_REGION` - S3 region
- `S3_ACCESS_KEY_ID` - S3 access key ID
- `S3_SECRET_ACCESS_KEY` - S3 secret access key
- `GRAFANA_PASSWORD` - Grafana admin password

### Optional Secrets

- `ANTHROPIC_API_KEY` - Anthropic API key

### Environment-Specific Suffixes

For different environments, the following suffixes are added to secret names:

- Development: `_DEV`
- Staging: `_STAGING`
- Production: (no suffix)

## Configuration Files

The scripts work with the following configuration files:

1. `coolify-environments.yml` - Environment-specific configurations
2. `coolify.json` - Coolify application configuration
3. `coolify-compose.yml` - Docker Compose configuration for Coolify
4. `coolify-secrets.env.example` - Example secrets file

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - On Linux/macOS: Make sure scripts are executable: `chmod +x scripts/*.sh`
   - On Windows: Use Git Bash or WSL to run the scripts

2. **Command Not Found**
   - Install required tools (Docker, Docker Compose, curl)
   - For enhanced validation, install yq and jq

3. **Validation Failures**
   - Check that all required configuration files exist
   - Verify that environment variables are properly set
   - Ensure secret formats match the expected patterns

4. **Coolify API Connection Issues**
   - Verify Coolify URL and API token
   - Check network connectivity to Coolify instance
   - Ensure API token has proper permissions

### Getting Help

For additional help:

1. Check the main documentation in `coolify-deployment.md`
2. Review the example configuration in `coolify-secrets.env.example`
3. Consult the Coolify documentation at https://coolify.io/docs
4. Check the project's issue tracker for known issues

## Security Considerations

1. **Never commit secrets to version control**
   - Use environment variables or Coolify's secret manager
   - Add `.env*` files to `.gitignore`

2. **Use strong, unique passwords**
   - Generate strong passwords for database and Redis
   - Rotate API keys and passwords regularly

3. **Limit access to monitoring services**
   - Configure firewall rules for Grafana and Prometheus
   - Use VPN for administrative access

4. **Enable SSL/TLS**
   - Configure SSL certificates for production
   - Use HTTPS for all external communications

## Contributing

When contributing to these scripts:

1. Test on multiple platforms (Linux, macOS, Windows)
2. Ensure backward compatibility with existing configurations
3. Update documentation for any new features
4. Follow the existing code style and conventions