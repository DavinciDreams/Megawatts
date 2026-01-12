# Environment Variables Setup

This document explains how to set up environment variables for different deployment environments.

## Environment Files

- `.env` - Development environment variables
- `.env.staging` - Staging environment variables  
- `.env.production` - Production environment variables

## Required Variables

### Discord Configuration
- `DISCORD_TOKEN` / `DISCORD_TOKEN_STAGING` - Discord bot token
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_ID_STAGING` - Discord application client ID

### Database Configuration
- `DB_USER` / `DB_USER_STAGING` - Database username
- `DB_PASSWORD` / `DB_PASSWORD_STAGING` - Database password
- `DB_NAME` / `DB_NAME_STAGING` - Database name

### Redis Configuration
- `REDIS_PASSWORD` / `REDIS_PASSWORD_STAGING` - Redis password
- `REDIS_DB` / `REDIS_DB_STAGING` - Redis database number

### AI Configuration
- `OPENAI_API_KEY` / `OPENAI_API_KEY_STAGING` - OpenAI API key
- `ANTHROPIC_API_KEY` / `ANTHROPIC_API_KEY_STAGING` - Anthropic API key

### Storage Configuration
- `S3_BUCKET` / `S3_BUCKET_STAGING` - AWS S3 bucket name
- `S3_ACCESS_KEY_ID` / `S3_ACCESS_KEY_ID_STAGING` - AWS access key ID
- `S3_SECRET_ACCESS_KEY` / `S3_SECRET_ACCESS_KEY_STAGING` - AWS secret access key

### Monitoring Configuration
- `GRAFANA_PASSWORD` / `GRAFANA_PASSWORD_STAGING` - Grafana admin password

## Deployment Commands

### Development
```bash
docker-compose -f docker/docker-compose.dev.yml up
```

### Staging
```bash
docker-compose -f docker/docker-compose.staging.yml up
```

### Production
```bash
docker-compose -f docker/docker-compose.prod.yml up
```

## Security Notes

- All environment files are listed in `.gitignore` and should not be committed to version control
- Replace placeholder values with actual secrets before deployment
- Use different credentials for each environment
- Consider using a secret management system for production deployments

## Variable Resolution

The docker-compose files use the `env_file` directive to load the appropriate environment file. This ensures:

1. Each environment uses its own set of variables
2. No variable name conflicts between environments
3. Clean separation of configuration
4. Easy environment-specific deployments

## Troubleshooting

If you see warnings like "The X variable is not set. Defaulting to a blank string":

1. Ensure the correct environment file exists
2. Check that all required variables are defined in the file
3. Verify the file is properly formatted (no trailing spaces, correct syntax)
4. Make sure the docker-compose file references the correct env_file path