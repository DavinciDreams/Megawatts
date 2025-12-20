# Discord Bot Coolify Deployment Scripts

This directory contains comprehensive deployment and management scripts for the Discord bot deployment on Coolify. All scripts are production-ready with proper error handling, logging, and automation capabilities.

## Scripts Overview

### 1. deploy-to-coolify.sh - Main Deployment Script

**Purpose**: Automates the deployment of the Discord bot to Coolify environments with comprehensive validation, monitoring, and rollback capabilities.

**Features**:
- Environment selection (staging/production)
- Pre-deployment validation
- Docker image building and pushing
- Coolify API integration
- Deployment orchestration
- Post-deployment verification
- Automatic rollback on failure

**Usage Examples**:
```bash
# Deploy to staging
./deploy-to-coolify.sh -e staging

# Deploy to production with force
./deploy-to-coolify.sh -e production -f

# Dry run to see what would be deployed
./deploy-to-coolify.sh -e staging -d

# Rollback previous deployment
./deploy-to-coolify.sh -r
```

### 2. coolify-cleanup.sh - Cleanup Script

**Purpose**: Performs cleanup operations for the Discord bot deployment, including removing old deployments, cleaning up unused images, log rotation, temporary file cleanup, and resource optimization.

**Features**:
- Removing old deployments
- Cleaning up unused images
- Log rotation
- Temporary file cleanup
- Resource optimization

**Usage Examples**:
```bash
# Standard cleanup
./coolify-cleanup.sh

# Cleanup for production environment
./coolify-cleanup.sh -e production

# Dry run to see what would be cleaned
./coolify-cleanup.sh -d

# Aggressive cleanup with force
./coolify-cleanup.sh -f --retention-days 7
```

### 3. coolify-health-check.sh - Health Monitoring Script

**Purpose**: Performs comprehensive health monitoring for the Discord bot deployment, including service health checks, database connectivity tests, API endpoint validation, performance metrics validation, and automated reporting.

**Features**:
- Service health checks
- Database connectivity tests
- API endpoint validation
- Performance metrics validation
- Automated reporting
- Continuous monitoring mode

**Usage Examples**:
```bash
# Run single health check
./coolify-health-check.sh

# Run health check for production
./coolify-health-check.sh -e production

# Run continuous monitoring
./coolify-health-check.sh -c -i 60

# Run with alerts
./coolify-health-check.sh -w https://hooks.slack.com/... -s https://hooks.slack.com/...
```

### 4. coolify-rollback.sh - Rollback Script

**Purpose**: Provides comprehensive rollback capabilities for Discord bot deployment, including quick rollback to previous version, database rollback if needed, configuration restoration, and health verification after rollback.

**Features**:
- Quick rollback to previous version
- Database rollback if needed
- Configuration restoration
- Health verification after rollback

**Usage Examples**:
```bash
# Interactive rollback to previous deployment
./coolify-rollback.sh

# Rollback to specific deployment
./coolify-rollback.sh -t deployment-123

# Database rollback with backup
./coolify-rollback.sh -r database -b

# Dry run to see what would be rolled back
./coolify-rollback.sh -d

# Force rollback without confirmation
./coolify-rollback.sh -f -t deployment-123
```

### 5. coolify-maintenance.sh - Maintenance Script

**Purpose**: Performs comprehensive maintenance tasks for Discord bot deployment, including scheduled maintenance tasks, database maintenance, cache cleanup, log rotation, and performance optimization.

**Features**:
- Scheduled maintenance tasks
- Database maintenance
- Cache cleanup
- Log rotation
- Performance optimization

**Usage Examples**:
```bash
# Run all maintenance tasks
./coolify-maintenance.sh

# Run database maintenance only
./coolify-maintenance.sh -t database

# Run scheduled maintenance
./coolify-maintenance.sh -s

# Dry run to see what would be done
./coolify-maintenance.sh -d

# Run with security scan
./coolify-maintenance.sh -S
```

## Installation and Setup

### Prerequisites

1. **Required Tools**:
   - Docker
   - Docker Compose
   - curl
   - jq (JSON processor)
   - Git

2. **Optional Tools** (for enhanced functionality):
   - yq (YAML processor)
   - mail (for email notifications)

3. **Coolify Instance**:
   - Running Coolify instance
   - API access token
   - Application configured

### Environment Variables

All scripts support the following environment variables:

**Coolify Configuration**:
- `COOLIFY_URL`: Coolify instance URL
- `COOLIFY_API_TOKEN`: Coolify API token

**Application Configuration**:
- `ENVIRONMENT`: Target environment (staging/production)
- `DOMAIN`: Application domain
- `DISCORD_TOKEN`: Discord bot token
- `DB_USER`: Database username
- `DB_PASSWORD`: Database password
- `DB_NAME`: Database name
- `REDIS_PASSWORD`: Redis password
- `OPENAI_API_KEY`: OpenAI API key

**Script Configuration**:
- `DRY_RUN`: Enable dry run mode (true/false)
- `VERBOSE`: Enable verbose logging (true/false)
- `FORCE_`: Force operations without confirmation (true/false)

### Making Scripts Executable

#### Linux/macOS:
```bash
chmod +x scripts/*.sh
```

#### Windows (Git Bash):
```bash
# In Git Bash
chmod +x scripts/*.sh
```

#### Windows (PowerShell):
```powershell
# PowerShell doesn't use execute permissions, scripts can be run directly
# Example: .\scripts\deploy-to-coolify.sh
```

#### Windows (WSL):
```bash
# In WSL
chmod +x scripts/*.sh
```

## Configuration Files

The scripts work with the following configuration files:

1. `coolify-environments.yml`: Environment-specific configurations
2. `coolify-compose.yml`: Docker Compose configuration for Coolify
3. `docker/coolify.Dockerfile`: Dockerfile for Coolify deployment
4. `docker/health-check.sh`: Health check script for containers

## Logging

All scripts create detailed logs in the `logs/` directory:

- Deployment logs: `logs/deployment-YYYYMMDD-HHMMSS.log`
- Cleanup logs: `logs/cleanup-YYYYMMDD-HHMMSS.log`
- Health check logs: `logs/health-check-YYYYMMDD-HHMMSS.log`
- Rollback logs: `logs/rollback-YYYYMMDD-HHMMSS.log`
- Maintenance logs: `logs/maintenance-YYYYMMDD-HHMMSS.log`

## Integration with CI/CD

These scripts are designed to work seamlessly with CI/CD pipelines:

### GitHub Actions Example:
```yaml
name: Deploy to Coolify

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to Staging
      run: ./scripts/deploy-to-coolify.sh -e staging
      env:
        COOLIFY_URL: ${{ secrets.COOLIFY_URL }}
        COOLIFY_API_TOKEN: ${{ secrets.COOLIFY_API_TOKEN }}
        DISCORD_TOKEN: ${{ secrets.DISCORD_TOKEN }}
        DB_USER: ${{ secrets.DB_USER }}
        DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
        DB_NAME: ${{ secrets.DB_NAME }}
        REDIS_PASSWORD: ${{ secrets.REDIS_PASSWORD }}
        OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### GitLab CI Example:
```yaml
deploy_staging:
  stage: deploy
  script:
    - ./scripts/deploy-to-coolify.sh -e staging
  environment:
    name: staging
    url: https://staging.your-domain.com
  only:
    - main
```

## Monitoring and Alerting

### Health Check Integration

The health check script supports multiple notification channels:

1. **Slack Webhook**:
   ```bash
   ./coolify-health-check.sh -s https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
   ```

2. **Discord Webhook**:
   ```bash
   ./coolify-health-check.sh --discord-webhook https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK
   ```

3. **Generic Webhook**:
   ```bash
   ./coolify-health-check.sh -w https://your-monitoring-system.com/webhook
   ```

4. **Email Notifications**:
   ```bash
   ./coolify-health-check.sh -m admin@example.com,devops@example.com
   ```

### Continuous Monitoring

For continuous monitoring, use the health check script with the continuous mode:

```bash
./coolify-health-check.sh -c -i 300 -s https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

This will run health checks every 5 minutes (300 seconds) and send alerts to Slack if issues are detected.

## Scheduled Maintenance

The maintenance script supports scheduled maintenance based on the day of the week:

- **Monday**: Database maintenance (backup + optimization)
- **Tuesday**: Cache cleanup
- **Wednesday**: Performance optimization
- **Thursday**: Log rotation
- **Friday**: Security scan
- **Saturday**: Service updates
- **Sunday**: Full maintenance (all tasks)

To enable scheduled maintenance:

```bash
./coolify-maintenance.sh -s
```

You can also set up a cron job for automated execution:

```bash
# Run maintenance every day at 2 AM
0 2 * * * /path/to/scripts/coolify-maintenance.sh -s >> /var/log/maintenance.log 2>&1
```

## Troubleshooting

### Common Issues

1. **Permission Denied**:
   - Ensure scripts are executable: `chmod +x scripts/*.sh`
   - On Windows, use Git Bash or WSL to run the scripts

2. **Command Not Found**:
   - Install required tools: Docker, Docker Compose, curl, jq
   - For enhanced functionality, install yq

3. **Coolify API Connection Issues**:
   - Verify Coolify URL and API token
   - Check network connectivity to Coolify instance
   - Ensure API token has proper permissions

4. **Environment Variable Issues**:
   - Set all required environment variables
   - Use `.env` file for local development
   - Use Coolify's secret manager for production

### Debug Mode

All scripts support verbose logging for debugging:

```bash
./script-name.sh -v
```

### Dry Run Mode

All scripts support dry run mode to see what would be done without making changes:

```bash
./script-name.sh -d
```

## Security Considerations

1. **Secrets Management**:
   - Never commit secrets to version control
   - Use environment variables or Coolify's secret manager
   - Rotate API keys and passwords regularly

2. **Access Control**:
   - Limit access to scripts and configuration files
   - Use role-based access control for Coolify
   - Implement proper authentication for monitoring endpoints

3. **Network Security**:
   - Use HTTPS for all external communications
   - Configure firewall rules for monitoring services
   - Use VPN for administrative access

## Contributing

When contributing to these scripts:

1. Test on multiple platforms (Linux, macOS, Windows)
2. Ensure backward compatibility with existing configurations
3. Update documentation for any new features
4. Follow the existing code style and conventions
5. Add proper error handling and logging
6. Include dry run mode for new operations

## Support

For additional help:

1. Check the main documentation in `coolify-deployment.md`
2. Review the example configuration files
3. Consult the Coolify documentation at https://coolify.io/docs
4. Check the project's issue tracker for known issues
5. Join the Coolify Discord community for community support