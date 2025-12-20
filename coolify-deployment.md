# Discord Bot Coolify Deployment Guide

This guide provides step-by-step instructions for deploying the Discord bot using Coolify, a self-hosting platform with a focus on simplicity and user experience.

## Prerequisites

Before you begin, ensure you have:

1. **Coolify Instance**: A running Coolify instance (self-hosted or cloud-hosted)
2. **Docker**: Docker installed on your Coolify server
3. **Domain**: A domain name configured to point to your Coolify server
4. **SSL Certificates**: SSL certificates for your domain (optional but recommended)
5. **Discord Bot Token**: A Discord bot token from the Discord Developer Portal
6. **API Keys**: OpenAI and/or Anthropic API keys for AI features

## Quick Start

For experienced users, here's the condensed deployment process:

1. Fork this repository to your Git provider
2. Add the repository to Coolify
3. Configure environment variables using `coolify-secrets.env.example`
4. Deploy to staging environment
5. Test and validate
6. Deploy to production environment

## Detailed Deployment Steps

### Step 1: Prepare Your Repository

1. **Fork the Repository**:
   - Fork this repository to your Git provider (GitHub, GitLab, etc.)
   - Ensure the repository is public or accessible by your Coolify instance

2. **Verify Configuration Files**:
   - Confirm `coolify.json`, `coolify-compose.yml`, and `coolify-secrets.env.example` are in the root directory
   - Check that `Dockerfile.prod` exists and is properly configured

### Step 2: Add Repository to Coolify

1. **Log in to Coolify**:
   - Access your Coolify instance at `https://your-coolify-domain.com`
   - Log in with your credentials

2. **Create a New Project**:
   - Click "New Project" in the Coolify dashboard
   - Give your project a name (e.g., "Discord Bot")
   - Select your Git provider and connect your account if needed

3. **Add the Repository**:
   - Select your forked repository from the list
   - Choose the branch to deploy (typically `main` or `master`)
   - Click "Add"

### Step 3: Configure the Application

1. **Select Application Type**:
   - Choose "Docker Compose" as the application type
   - Coolify will detect the `coolify-compose.yml` file automatically

2. **Configure Basic Settings**:
   - Set the application name (e.g., "discord-bot")
   - Choose the deployment environment (start with "staging")
   - Set the domain for your application

3. **Configure Environment Variables**:
   - Go to the "Environment Variables" tab
   - Use `coolify-secrets.env.example` as a reference
   - Add all required variables and secrets
   - **Important**: Use Coolify's secret manager for sensitive values

### Step 4: Configure Secrets

1. **Discord Bot Token**:
   - Get your bot token from the Discord Developer Portal
   - Add it as a secret named `DISCORD_TOKEN`

2. **Database Credentials**:
   - Generate strong passwords for PostgreSQL and Redis
   - Add them as secrets: `DB_PASSWORD` and `REDIS_PASSWORD`

3. **API Keys**:
   - Add your OpenAI API key as `OPENAI_API_KEY`
   - Add your Anthropic API key as `ANTHROPIC_API_KEY` (if using)

4. **S3 Credentials**:
   - Add your S3 credentials as `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`

### Step 5: Configure Persistent Volumes

1. **Database Volumes**:
   - Ensure PostgreSQL data volume is configured
   - Set appropriate size (10GB for production, 5GB for staging)

2. **Cache Volumes**:
   - Configure Redis data volume
   - Set appropriate size (2GB for production, 1GB for staging)

3. **Monitoring Volumes**:
   - Configure volumes for Prometheus and Grafana
   - Set appropriate sizes based on your retention needs

### Step 6: Configure Networking

1. **Domain Configuration**:
   - Set your domain name in the `DOMAIN` environment variable
   - Configure DNS to point to your Coolify server

2. **Port Configuration**:
   - Review port mappings in `coolify-compose.yml`
   - Ensure no conflicts with other services

3. **SSL/TLS**:
   - Configure SSL certificates for your domain
   - Enable HTTPS for all external services

### Step 7: Deploy to Staging

1. **Initial Deployment**:
   - Click "Deploy" to start the deployment process
   - Coolify will build and deploy all services
   - Monitor the deployment logs for any issues

2. **Verify Deployment**:
   - Check that all services are running
   - Access the health check endpoint: `http://your-domain.com/health`
   - Verify database connections and Redis connectivity

3. **Test Bot Functionality**:
   - Invite the bot to your Discord server
   - Test basic commands and features
   - Verify AI functionality if configured

### Step 8: Configure Monitoring

1. **Prometheus Setup**:
   - Access Prometheus at `http://prometheus.your-domain.com`
   - Verify metrics collection is working
   - Check targets are all up

2. **Grafana Setup**:
   - Access Grafana at `http://grafana.your-domain.com`
   - Log in with the admin credentials
   - Import the provided dashboards
   - Create alerts for critical metrics

3. **Log Aggregation**:
   - Configure log aggregation if desired
   - Set up alerts for error logs

### Step 9: Deploy to Production

1. **Create Production Environment**:
   - Duplicate the staging configuration
   - Name it "production"
   - Adjust resource limits as needed

2. **Update Production Variables**:
   - Update environment variables for production
   - Use production-specific API keys and tokens
   - Increase replica counts as needed

3. **Deploy to Production**:
   - Deploy the application to production
   - Monitor the deployment closely
   - Verify all services are functioning correctly

### Step 10: Post-Deployment Configuration

1. **Backup Configuration**:
   - Configure automated database backups
   - Set up backup retention policies
   - Test backup restoration

2. **Security Hardening**:
   - Configure firewall rules
   - Restrict access to monitoring services
   - Enable security scanning

3. **Performance Optimization**:
   - Monitor resource usage
   - Adjust resource limits as needed
   - Optimize database queries

## Environment-Specific Configurations

### Staging Environment

- **Replicas**: 2 app instances, 1 PostgreSQL instance
- **Resources**: Lower CPU and memory limits
- **Retention**: 72 hours for Prometheus data
- **Logging**: Debug level logging enabled
- **Ports**: Non-standard ports to avoid conflicts

### Production Environment

- **Replicas**: 3 app instances, 2 PostgreSQL instances
- **Resources**: Higher CPU and memory limits
- **Retention**: 200 hours for Prometheus data
- **Logging**: Info level logging
- **Ports**: Standard ports with SSL termination

## Troubleshooting

### Common Issues

1. **Deployment Fails**:
   - Check environment variables are correctly set
   - Verify all secrets are properly configured
   - Review deployment logs for error messages

2. **Database Connection Issues**:
   - Verify database credentials
   - Check network connectivity between services
   - Review database health checks

3. **Bot Not Responding**:
   - Verify Discord token is valid
   - Check bot has proper permissions
   - Review application logs for errors

4. **Monitoring Issues**:
   - Verify Prometheus configuration
   - Check Grafana data source settings
   - Review network policies

### Debug Commands

1. **Check Service Status**:
   ```bash
   docker-compose ps
   ```

2. **View Service Logs**:
   ```bash
   docker-compose logs [service-name]
   ```

3. **Access Service Shell**:
   ```bash
   docker-compose exec [service-name] sh
   ```

4. **Check Health Status**:
   ```bash
   curl http://your-domain.com/health
   ```

## Maintenance

### Regular Tasks

1. **Updates**:
   - Regularly update all services
   - Monitor for security vulnerabilities
   - Test updates in staging first

2. **Backups**:
   - Verify backups are running correctly
   - Test restoration procedures
   - Monitor backup storage usage

3. **Monitoring**:
   - Review metrics and logs regularly
   - Respond to alerts promptly
   - Optimize based on usage patterns

### Scaling

1. **Horizontal Scaling**:
   - Increase replica counts in `coolify.json`
   - Update load balancer configuration
   - Monitor resource usage

2. **Vertical Scaling**:
   - Adjust CPU and memory limits
   - Monitor performance impact
   - Update resource quotas

## Security Considerations

1. **Secrets Management**:
   - Use Coolify's secret manager for all sensitive data
   - Rotate secrets regularly
   - Never commit secrets to version control

2. **Network Security**:
   - Configure firewall rules
   - Use VPN for administrative access
   - Enable SSL/TLS for all services

3. **Access Control**:
   - Implement role-based access control
   - Use strong authentication methods
   - Regularly review access permissions

## Rollback Procedures

1. **Automatic Rollback**:
   - Coolify automatically rolls back failed deployments
   - Monitor rollback notifications
   - Investigate failure causes

2. **Manual Rollback**:
   - Select previous deployment in Coolify
   - Click "Redeploy" to restore
   - Verify functionality after rollback

## Support and Resources

- **Coolify Documentation**: https://coolify.io/docs
- **Discord Bot Documentation**: See project README
- **Issue Tracking**: Use the project's issue tracker
- **Community Support**: Join the Coolify Discord community

## Conclusion

This deployment guide provides a comprehensive approach to deploying the Discord bot using Coolify. By following these steps, you'll have a robust, scalable, and maintainable deployment that leverages Coolify's powerful features for container orchestration and management.

Remember to regularly review and update your deployment configuration to ensure it continues to meet your needs as your application evolves.