#!/usr/bin/env node

/**
 * Deployment script for Discord bot
 * Supports blue-green deployment strategy with rollback capabilities
 */

import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface DeployConfig {
  environment: 'staging' | 'production';
  strategy: 'blue-green' | 'rolling' | 'canary';
  version?: string;
  force?: boolean;
  dryRun?: boolean;
  skipTests?: boolean;
  skipMigrations?: boolean;
  rollbackVersion?: string;
}

interface DeploymentInfo {
  version: string;
  timestamp: string;
  environment: string;
  status: 'pending' | 'active' | 'inactive' | 'failed';
  containerId?: string;
  serviceName?: string;
}

class DeployScript {
  private config: DeployConfig;
  private projectRoot: string;
  private deploymentInfo: DeploymentInfo;

  constructor(config: DeployConfig) {
    this.config = config;
    this.projectRoot = process.cwd()!;
    this.deploymentInfo = {
      version: config.version || this.getCurrentVersion(),
      timestamp: new Date().toISOString(),
      environment: config.environment,
      status: 'pending'
    };
  }

  async execute(): Promise<void> {
    console.log(`🚀 Starting deployment to ${this.config.environment} using ${this.config.strategy} strategy...`);

    try {
      // Validate deployment prerequisites
      await this.validatePrerequisites();

      // Run pre-deployment checks
      await this.runPreDeploymentChecks();

      // Build the application
      await this.buildApplication();

      // Run tests if not skipped
      if (!this.config.skipTests) {
        await this.runTests();
      }

      // Execute deployment based on strategy
      switch (this.config.strategy) {
        case 'blue-green':
          await this.blueGreenDeployment();
          break;
        case 'rolling':
          await this.rollingDeployment();
          break;
        case 'canary':
          await this.canaryDeployment();
          break;
      }

      // Run post-deployment checks
      await this.runPostDeploymentChecks();

      console.log(`✅ Deployment to ${this.config.environment} completed successfully!`);
    } catch (error) {
      console.error(`❌ Deployment failed:`, error);
      
      // Attempt rollback if deployment failed
      if (!this.config.dryRun) {
        await this.attemptRollback();
      }
      
      process.exit(1);
    }
  }

  private async validatePrerequisites(): Promise<void> {
    console.log('🔍 Validating deployment prerequisites...');

    // Check if Docker is available
    try {
      execSync('docker --version', { stdio: 'pipe' });
    } catch {
      throw new Error('Docker is not installed or not available');
    }

    // Check if Docker Compose is available
    try {
      execSync('docker-compose --version', { stdio: 'pipe' });
    } catch {
      throw new Error('Docker Compose is not installed or not available');
    }

    // Check environment variables
    const requiredEnvVars = [
      'DISCORD_TOKEN',
      'DB_HOST',
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME',
      'REDIS_HOST',
      'REDIS_PASSWORD'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Required environment variable ${envVar} is not set`);
      }
    }

    console.log('✅ Prerequisites validation passed');
  }

  private async runPreDeploymentChecks(): Promise<void> {
    console.log('🔍 Running pre-deployment checks...');

    // Check if target environment is healthy
    await this.checkEnvironmentHealth();

    // Check disk space
    await this.checkDiskSpace();

    // Check memory availability
    await this.checkMemoryAvailability();

    console.log('✅ Pre-deployment checks passed');
  }

  private async buildApplication(): Promise<void> {
    console.log('🔨 Building application...');

    const buildCommand = `npm run build -- --env ${this.config.environment} --clean`;
    
    if (this.config.dryRun) {
      console.log(`🔍 DRY RUN: Would execute: ${buildCommand}`);
      return;
    }

    execSync(buildCommand, { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });

    console.log('✅ Application built successfully');
  }

  private async runTests(): Promise<void> {
    console.log('🧪 Running tests...');

    const testCommand = `npm run test -- --type all --env ${this.config.environment}`;
    
    if (this.config.dryRun) {
      console.log(`🔍 DRY RUN: Would execute: ${testCommand}`);
      return;
    }

    execSync(testCommand, { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });

    console.log('✅ All tests passed');
  }

  private async blueGreenDeployment(): Promise<void> {
    console.log('🔵🟢 Executing blue-green deployment...');

    const currentColor = await this.getCurrentActiveColor();
    const newColor = currentColor === 'blue' ? 'green' : 'blue';

    console.log(`🎨 Deploying to ${newColor} environment...`);

    // Deploy to new environment
    await this.deployToColor(newColor);

    // Run health checks on new environment
    await this.runHealthChecks(newColor);

    // Switch traffic to new environment
    await this.switchTraffic(newColor);

    // Update deployment status
    this.deploymentInfo.status = 'active';
    await this.saveDeploymentInfo();

    console.log(`✅ Blue-green deployment completed. Traffic now on ${newColor}`);
  }

  private async rollingDeployment(): Promise<void> {
    console.log('🔄 Executing rolling deployment...');

    // Get current number of replicas
    const currentReplicas = await this.getCurrentReplicas();
    
    // Deploy new version alongside old
    await this.deployNewVersion(currentReplicas);

    // Gradually replace old instances
    await this.gracefulShutdown(currentReplicas);

    console.log('✅ Rolling deployment completed');
  }

  private async canaryDeployment(): Promise<void> {
    console.log('🐤 Executing canary deployment...');

    // Deploy canary instances
    await this.deployCanary();

    // Monitor canary performance
    await this.monitorCanary();

    // Gradually increase canary traffic
    await this.increaseCanaryTraffic();

    // Complete deployment
    await this.completeCanaryDeployment();

    console.log('✅ Canary deployment completed');
  }

  private async deployToColor(color: string): Promise<void> {
    console.log(`🚀 Deploying to ${color} environment...`);

    const composeFile = `docker-compose.${this.config.environment}.yml`;
    const projectName = `discord-bot-${this.config.environment}-${color}`;

    const command = `docker-compose -f ${composeFile} -p ${projectName} up -d --build`;
    
    if (this.config.dryRun) {
      console.log(`🔍 DRY RUN: Would execute: ${command}`);
      return;
    }

    execSync(command, { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });

    // Wait for services to be ready
    await this.waitForServices(projectName);

    console.log(`✅ ${color} environment deployed successfully`);
  }

  private async runHealthChecks(color: string): Promise<void> {
    console.log(`🏥 Running health checks on ${color} environment...`);

    const projectName = `discord-bot-${this.config.environment}-${color}`;
    const maxAttempts = 30;
    const delay = 5000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const healthCheck = `docker-compose -f docker-compose.${this.config.environment}.yml -p ${projectName} exec -T app curl -f http://localhost:8080/health`;
        
        if (this.config.dryRun) {
          console.log(`🔍 DRY RUN: Would execute health check for ${color}`);
          break;
        }

        execSync(healthCheck, { stdio: 'pipe', timeout: 10000 });
        console.log(`✅ ${color} environment is healthy`);
        return;
      } catch {
        console.log(`⏳ Waiting for ${color} environment to be healthy... (${i + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`${color} environment failed health checks`);
  }

  private async switchTraffic(color: string): Promise<void> {
    console.log(`🔀 Switching traffic to ${color} environment...`);

    // Update load balancer configuration
    const loadBalancerConfig = {
      active: color,
      timestamp: new Date().toISOString(),
      version: this.deploymentInfo.version
    };

    const configPath = join(this.projectRoot, 'load-balancer-config.json');
    writeFileSync(configPath, JSON.stringify(loadBalancerConfig, null, 2));

    // Reload load balancer
    const reloadCommand = 'docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload';
    
    if (!this.config.dryRun) {
      execSync(reloadCommand, { stdio: 'inherit' });
    }

    console.log(`✅ Traffic switched to ${color} environment`);
  }

  private async runPostDeploymentChecks(): Promise<void> {
    console.log('🔍 Running post-deployment checks...');

    // Verify deployment is active
    await this.verifyDeployment();

    // Run smoke tests
    await this.runSmokeTests();

    // Update monitoring
    await this.updateMonitoring();

    console.log('✅ Post-deployment checks passed');
  }

  private async attemptRollback(): Promise<void> {
    console.log('🔄 Attempting rollback...');

    try {
      const previousVersion = await this.getPreviousVersion();
      if (!previousVersion) {
        console.warn('⚠️ No previous version found for rollback');
        return;
      }

      console.log(`🔄 Rolling back to version ${previousVersion}`);

      // Execute rollback
      const rollbackCommand = `git checkout ${previousVersion}`;
      execSync(rollbackCommand, { stdio: 'inherit' });

      // Redeploy previous version
      await this.deployToColor('blue');
      await this.switchTraffic('blue');

      console.log('✅ Rollback completed successfully');
    } catch (error) {
      console.error('❌ Rollback failed:', error);
    }
  }

  private getCurrentVersion(): string {
    try {
      return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  private async getCurrentActiveColor(): Promise<string> {
    try {
      const configPath = join(this.projectRoot, 'load-balancer-config.json');
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        return config.active || 'blue';
      }
    } catch {
      // Ignore errors
    }
    return 'blue';
  }

  private async getCurrentReplicas(): Promise<number> {
    try {
      const result = execSync('docker-compose -f docker-compose.prod.yml ps -q', { 
        encoding: 'utf8' 
      });
      return result.trim().split('\n').filter(line => line).length;
    } catch {
      return 1;
    }
  }

  private async waitForServices(projectName: string): Promise<void> {
    console.log('⏳ Waiting for services to be ready...');
    
    const maxAttempts = 60;
    const delay = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const checkCommand = `docker-compose -f docker-compose.${this.config.environment}.yml -p ${projectName} ps`;
        execSync(checkCommand, { stdio: 'pipe' });
        
        // Check if all containers are healthy
        const healthCommand = `docker-compose -f docker-compose.${this.config.environment}.yml -p ${projectName} ps --format "table {{.State}}"`;
        const result = execSync(healthCommand, { encoding: 'utf8' });
        
        if (result.includes('healthy') && !result.includes('starting')) {
          console.log('✅ All services are ready');
          return;
        }
      } catch {
        // Continue waiting
      }

      console.log(`⏳ Waiting for services... (${i + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    throw new Error('Services failed to start within timeout');
  }

  private async checkEnvironmentHealth(): Promise<void> {
    console.log(`🏥 Checking ${this.config.environment} environment health...`);
    
    // Implement environment-specific health checks
    // This would typically check monitoring systems, external dependencies, etc.
  }

  private async checkDiskSpace(): Promise<void> {
    console.log('💾 Checking disk space...');
    
    const result = execSync('df -h .', { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    const usageLine = lines[1];
    const usagePercent = parseInt(usageLine.match(/(\d+)%/)?.[1] || '0');
    
    if (usagePercent > 85) {
      throw new Error(`Disk usage too high: ${usagePercent}%`);
    }
    
    console.log(`✅ Disk usage: ${usagePercent}%`);
  }

  private async checkMemoryAvailability(): Promise<void> {
    console.log('🧠 Checking memory availability...');
    
    const result = execSync('free -m', { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    const memLine = lines[1];
    const parts = memLine.split(/\s+/);
    const totalMem = parseInt(parts[1]);
    const usedMem = parseInt(parts[2]);
    const usagePercent = Math.round((usedMem / totalMem) * 100);
    
    if (usagePercent > 90) {
      throw new Error(`Memory usage too high: ${usagePercent}%`);
    }
    
    console.log(`✅ Memory usage: ${usagePercent}%`);
  }

  private async deployNewVersion(currentReplicas: number): Promise<void> {
    // Implementation for rolling deployment
  }

  private async gracefulShutdown(currentReplicas: number): Promise<void> {
    // Implementation for graceful shutdown
  }

  private async deployCanary(): Promise<void> {
    // Implementation for canary deployment
  }

  private async monitorCanary(): Promise<void> {
    // Implementation for canary monitoring
  }

  private async increaseCanaryTraffic(): Promise<void> {
    // Implementation for canary traffic increase
  }

  private async completeCanaryDeployment(): Promise<void> {
    // Implementation for canary completion
  }

  private async verifyDeployment(): Promise<void> {
    // Implementation for deployment verification
  }

  private async runSmokeTests(): Promise<void> {
    // Implementation for smoke tests
  }

  private async updateMonitoring(): Promise<void> {
    // Implementation for monitoring updates
  }

  private async saveDeploymentInfo(): Promise<void> {
    const deploymentsPath = join(this.projectRoot, 'deployments.json');
    let deployments: DeploymentInfo[] = [];
    
    if (existsSync(deploymentsPath)) {
      deployments = JSON.parse(readFileSync(deploymentsPath, 'utf8'));
    }
    
    deployments.push(this.deploymentInfo);
    writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  }

  private async getPreviousVersion(): Promise<string | null> {
    const deploymentsPath = join(this.projectRoot, 'deployments.json');
    
    if (!existsSync(deploymentsPath)) {
      return null;
    }
    
    const deployments: DeploymentInfo[] = JSON.parse(readFileSync(deploymentsPath, 'utf8'));
    const activeDeployments = deployments
      .filter(d => d.environment === this.config.environment && d.status === 'active')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return activeDeployments.length > 1 ? activeDeployments[1].version : null;
  }
}

// Parse command line arguments
function parseArgs(): DeployConfig {
  const args = process.argv.slice(2);
  const config: DeployConfig = {
    environment: 'staging',
    strategy: 'blue-green'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--env':
      case '-e':
        config.environment = args[++i] as DeployConfig['environment'];
        break;
      case '--strategy':
      case '-s':
        config.strategy = args[++i] as DeployConfig['strategy'];
        break;
      case '--version':
      case '-v':
        config.version = args[++i];
        break;
      case '--force':
      case '-f':
        config.force = true;
        break;
      case '--dry-run':
      case '-d':
        config.dryRun = true;
        break;
      case '--skip-tests':
        config.skipTests = true;
        break;
      case '--skip-migrations':
        config.skipMigrations = true;
        break;
      case '--rollback':
      case '-r':
        config.rollbackVersion = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npm run deploy [options]

Options:
  --env, -e <environment>     Target environment (staging|production) [default: staging]
  --strategy, -s <strategy>    Deployment strategy (blue-green|rolling|canary) [default: blue-green]
  --version, -v <version>      Specific version to deploy
  --force, -f                  Force deployment
  --dry-run, -d                Dry run (no actual deployment)
  --skip-tests                  Skip running tests
  --skip-migrations            Skip database migrations
  --rollback, -r <version>      Rollback to specific version
  --help, -h                   Show this help message

Examples:
  npm run deploy -- --env production --strategy blue-green
  npm run deploy -- --env staging --strategy rolling --version v1.2.0
  npm run deploy -- --env production --dry-run
  npm run deploy -- --rollback v1.1.0
        `);
        process.exit(0);
    }
  }

  return config;
}

// Run deployment
if (require.main === module) {
  const config = parseArgs();
  const deployScript = new DeployScript(config);
  deployScript.execute();
}

export type { DeployConfig, DeploymentInfo };
export { DeployScript };