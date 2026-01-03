/**
 * Health Monitor - Comprehensive health check and monitoring system
 *
 * This module provides comprehensive health monitoring including:
 * - Component-level health checks
 * - Dependency health checks
 * - Health check aggregation
 * - Health score calculation
 * - Health history tracking
 * - Automatic recovery triggers
 */

import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';
import { HealthStatus, CheckType, HealthCheckResult, HealthCheck, HealthCheckOptions } from '../core/health/types';

/**
 * Health check configuration
 */
export interface HealthMonitorConfig {
  enabled: boolean;
  checkInterval: number;
  alertThreshold: number;
  metricsRetention: number;
  recoveryEnabled: boolean;
  recoveryAttempts: number;
  recoveryDelay: number;
}

/**
 * Health score calculation weights
 */
export interface HealthScoreWeights {
  critical: number;
  degraded: number;
  healthy: number;
  unknown: number;
}

/**
 * Health history entry
 */
export interface HealthHistoryEntry {
  timestamp: Date;
  status: HealthStatus;
  score: number;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    critical: number;
  };
}

/**
 * Dependency health status
 */
export interface DependencyHealth {
  name: string;
  type: string;
  status: HealthStatus;
  responseTime?: number;
  lastCheck: Date;
  error?: Error;
  metadata?: Record<string, any>;
}

/**
 * Component health status
 */
export interface ComponentHealth {
  name: string;
  type: CheckType;
  status: HealthStatus;
  responseTime?: number;
  lastCheck: Date;
  error?: Error;
  metadata?: Record<string, any>;
}

/**
 * Aggregated health status
 */
export interface AggregatedHealth {
  status: HealthStatus;
  score: number;
  timestamp: Date;
  components: ComponentHealth[];
  dependencies: DependencyHealth[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    critical: number;
  };
}

/**
 * Recovery action configuration
 */
export interface RecoveryAction {
  name: string;
  action: () => Promise<void>;
  maxAttempts: number;
  currentAttempt: number;
  lastAttempt?: Date;
  successCount: number;
  failureCount: number;
}

/**
 * Health Monitor Class
 *
 * Provides comprehensive health monitoring and automatic recovery
 */
export class HealthMonitor {
  private logger: Logger;
  private config: HealthMonitorConfig;
  private healthChecks: Map<string, HealthCheck>;
  private healthHistory: HealthHistoryEntry[];
  private checkInterval?: NodeJS.Timeout;
  private recoveryActions: Map<string, RecoveryAction>;
  private currentHealth: AggregatedHealth | null;
  private startTime: Date;

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    this.logger = new Logger('HealthMonitor');
    this.startTime = new Date();
    this.healthChecks = new Map();
    this.healthHistory = [];
    this.recoveryActions = new Map();
    this.currentHealth = null;

    this.config = {
      enabled: true,
      checkInterval: 30000, // 30 seconds
      alertThreshold: 0.7, // 70% health score
      metricsRetention: 10080, // 7 days in minutes
      recoveryEnabled: true,
      recoveryAttempts: 3,
      recoveryDelay: 5000, // 5 seconds
      ...config
    };
  }

  /**
   * Register a health check
   */
  registerHealthCheck(check: HealthCheck): void {
    this.healthChecks.set(check.name, check);
    this.logger.info(`Registered health check: ${check.name}`);
  }

  /**
   * Unregister a health check
   */
  unregisterHealthCheck(name: string): void {
    this.healthChecks.delete(name);
    this.logger.info(`Unregistered health check: ${name}`);
  }

  /**
   * Register a recovery action
   */
  registerRecoveryAction(component: string, action: RecoveryAction): void {
    this.recoveryActions.set(component, action);
    this.logger.info(`Registered recovery action for component: ${component}`);
  }

  /**
   * Unregister a recovery action
   */
  unregisterRecoveryAction(component: string): void {
    this.recoveryActions.delete(component);
    this.logger.info(`Unregistered recovery action for component: ${component}`);
  }

  /**
   * Start health monitoring
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.warn('Health monitoring is disabled');
      return;
    }

    if (this.checkInterval) {
      this.logger.warn('Health monitoring already started');
      return;
    }

    this.logger.info(`Starting health monitoring with interval: ${this.config.checkInterval}ms`);
    
    // Initial health check
    await this.performHealthChecks();

    // Set up periodic health checks
    this.checkInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.checkInterval);
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      this.logger.info('Health monitoring stopped');
    }
  }

  /**
   * Perform all registered health checks
   */
  private async performHealthChecks(): Promise<void> {
    try {
      const results: HealthCheckResult[] = [];
      const components: ComponentHealth[] = [];

      for (const [name, check] of this.healthChecks) {
        try {
          const result = await this.executeHealthCheck(check);
          results.push(result);
          components.push({
            name: check.name,
            type: check.type,
            status: result.status,
            responseTime: result.responseTime,
            lastCheck: result.timestamp,
            error: result.error,
            metadata: result.details
          });
        } catch (error) {
          this.logger.error(`Health check failed for ${name}:`, error);
          results.push({
            status: HealthStatus.UNHEALTHY,
            checkType: check.type,
            name: check.name,
            timestamp: new Date(),
            error: error instanceof Error ? error : new Error(String(error)),
            message: 'Health check execution failed'
          });
        }
      }

      // Calculate aggregated health
      const aggregatedHealth = this.calculateAggregatedHealth(components);
      this.currentHealth = aggregatedHealth;

      // Add to history
      this.addToHistory(aggregatedHealth);

      // Check for recovery needs
      if (this.config.recoveryEnabled) {
        await this.checkAndTriggerRecovery(aggregatedHealth);
      }

      // Log health status
      this.logHealthStatus(aggregatedHealth);

    } catch (error) {
      this.logger.error('Error performing health checks:', error);
    }
  }

  /**
   * Execute a single health check
   */
  private async executeHealthCheck(check: HealthCheck): Promise<HealthCheckResult> {
    const options = check.options || {};
    const timeout = options.timeout || 5000;
    const retries = options.retries || 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await Promise.race([
          check.check(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), timeout)
          )
        ]);
        const responseTime = Date.now() - startTime;

        return {
          status: result.status,
          checkType: check.type,
          name: check.name,
          message: result.message,
          responseTime,
          timestamp: new Date(),
          details: result.details,
          error: result.error
        };
      } catch (error) {
        if (attempt < retries) {
          this.logger.warn(`Health check ${check.name} failed, retrying (${attempt + 1}/${retries})`);
          await this.sleep(1000); // Wait before retry
          continue;
        }

        return {
          status: HealthStatus.UNHEALTHY,
          checkType: check.type,
          name: check.name,
          timestamp: new Date(),
          error: error instanceof Error ? error : new Error(String(error)),
          message: 'Health check failed after retries'
        };
      }
    }

    return {
      status: HealthStatus.UNHEALTHY,
      checkType: check.type,
      name: check.name,
      timestamp: new Date(),
      message: 'Health check failed'
    };
  }

  /**
   * Calculate aggregated health status
   */
  private calculateAggregatedHealth(components: ComponentHealth[]): AggregatedHealth {
    const summary = {
      total: components.length,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      critical: 0
    };

    components.forEach(component => {
      switch (component.status) {
        case HealthStatus.HEALTHY:
          summary.healthy++;
          break;
        case HealthStatus.DEGRADED:
          summary.degraded++;
          break;
        case HealthStatus.UNHEALTHY:
          summary.unhealthy++;
          break;
        default:
          summary.critical++;
      }
    });

    const score = this.calculateHealthScore(summary);
    const status = this.determineOverallStatus(score, summary);

    return {
      status,
      score,
      timestamp: new Date(),
      components,
      dependencies: [],
      summary
    };
  }

  /**
   * Calculate health score (0-100)
   */
  private calculateHealthScore(summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    critical: number;
  }): number {
    if (summary.total === 0) {
      return 100; // No checks = healthy
    }

    const weights = {
      critical: -50,
      unhealthy: -20,
      degraded: -10,
      healthy: 10
    };

    const score = (
      (summary.healthy * weights.healthy) +
      (summary.degraded * weights.degraded) +
      (summary.unhealthy * weights.unhealthy) +
      (summary.critical * weights.critical)
    ) / summary.total;

    return Math.max(0, Math.min(100, 50 + score));
  }

  /**
   * Determine overall health status from score
   */
  private determineOverallStatus(
    score: number,
    summary: {
      total: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
      critical: number;
    }
  ): HealthStatus {
    // Critical failures immediately set status to unhealthy
    if (summary.critical > 0) {
      return HealthStatus.UNHEALTHY;
    }

    // Score-based determination
    if (score >= 90) {
      return HealthStatus.HEALTHY;
    } else if (score >= 70) {
      return HealthStatus.DEGRADED;
    } else {
      return HealthStatus.UNHEALTHY;
    }
  }

  /**
   * Add health check result to history
   */
  private addToHistory(health: AggregatedHealth): void {
    const entry: HealthHistoryEntry = {
      timestamp: health.timestamp,
      status: health.status,
      score: health.score,
      checks: health.components.map(c => ({
        status: c.status,
        checkType: c.type,
        name: c.name,
        timestamp: c.lastCheck,
        responseTime: c.responseTime,
        message: c.error?.message,
        details: c.metadata
      })),
      summary: health.summary
    };

    this.healthHistory.push(entry);

    // Trim history based on retention
    const maxEntries = Math.floor((this.config.metricsRetention * 60) / (this.config.checkInterval / 1000));
    if (this.healthHistory.length > maxEntries) {
      this.healthHistory = this.healthHistory.slice(-maxEntries);
    }
  }

  /**
   * Check and trigger recovery actions
   */
  private async checkAndTriggerRecovery(health: AggregatedHealth): Promise<void> {
    const unhealthyComponents = health.components.filter(
      c => c.status === HealthStatus.UNHEALTHY
    );

    for (const component of unhealthyComponents) {
      const recoveryAction = this.recoveryActions.get(component.name);
      
      if (recoveryAction && recoveryAction.currentAttempt < recoveryAction.maxAttempts) {
        this.logger.info(`Triggering recovery for component: ${component.name}`);
        
        try {
          await this.executeRecoveryAction(component.name, recoveryAction);
        } catch (error) {
          this.logger.error(`Recovery action failed for ${component.name}:`, error);
        }
      }
    }
  }

  /**
   * Execute a recovery action
   */
  private async executeRecoveryAction(
    component: string,
    action: RecoveryAction
  ): Promise<void> {
    action.currentAttempt++;
    action.lastAttempt = new Date();

    try {
      await action.action();
      action.successCount++;
      this.logger.info(`Recovery action succeeded for ${component}`);
      
      // Reset attempt count on success
      action.currentAttempt = 0;
    } catch (error) {
      action.failureCount++;
      this.logger.error(`Recovery action failed for ${component}:`, error);
      
      // Wait before next attempt
      if (action.currentAttempt < action.maxAttempts) {
        await this.sleep(this.config.recoveryDelay);
      }
    }
  }

  /**
   * Log health status
   */
  private logHealthStatus(health: AggregatedHealth): void {
    const statusEmoji = {
      [HealthStatus.HEALTHY]: '✅',
      [HealthStatus.DEGRADED]: '⚠️',
      [HealthStatus.UNHEALTHY]: '❌',
      [HealthStatus.UNKNOWN]: '❓'
    };

    const emoji = statusEmoji[health.status] || '❓';
    this.logger.info(
      `${emoji} Health Status: ${health.status} (Score: ${health.score.toFixed(2)}) - ` +
      `Healthy: ${health.summary.healthy}/${health.summary.total}`
    );

    if (health.status !== HealthStatus.HEALTHY) {
      const unhealthy = health.components.filter(c => c.status !== HealthStatus.HEALTHY);
      this.logger.warn(
        `Unhealthy components: ${unhealthy.map(c => c.name).join(', ')}`
      );
    }
  }

  /**
   * Get current health status
   */
  getCurrentHealth(): AggregatedHealth | null {
    return this.currentHealth;
  }

  /**
   * Get health history
   */
  getHealthHistory(limit?: number): HealthHistoryEntry[] {
    if (limit) {
      return this.healthHistory.slice(-limit);
    }
    return [...this.healthHistory];
  }

  /**
   * Get component health
   */
  getComponentHealth(name: string): ComponentHealth | undefined {
    return this.currentHealth?.components.find(c => c.name === name);
  }

  /**
   * Get all component health
   */
  getAllComponentHealth(): ComponentHealth[] {
    return this.currentHealth?.components || [];
  }

  /**
   * Get health score
   */
  getHealthScore(): number {
    return this.currentHealth?.score || 0;
  }

  /**
   * Check if system is healthy
   */
  isHealthy(): boolean {
    return this.currentHealth?.status === HealthStatus.HEALTHY;
  }

  /**
   * Check if system is degraded
   */
  isDegraded(): boolean {
    return this.currentHealth?.status === HealthStatus.DEGRADED;
  }

  /**
   * Check if system is unhealthy
   */
  isUnhealthy(): boolean {
    return this.currentHealth?.status === HealthStatus.UNHEALTHY;
  }

  /**
   * Perform a single health check
   */
  async performSingleCheck(name: string): Promise<HealthCheckResult | null> {
    const check = this.healthChecks.get(name);
    if (!check) {
      this.logger.warn(`Health check not found: ${name}`);
      return null;
    }

    return await this.executeHealthCheck(check);
  }

  /**
   * Clear health history
   */
  clearHistory(): void {
    this.healthHistory = [];
    this.logger.info('Health history cleared');
  }

  /**
   * Get configuration
   */
  getConfig(): HealthMonitorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthMonitorConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Health monitor configuration updated');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Get uptime formatted string
   */
  getUptimeFormatted(): string {
    const uptime = this.getUptime();
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0) parts.push(`${seconds % 60}s`);

    return parts.join(' ') || '0s';
  }
}

/**
 * Create a singleton instance of health monitor
 */
let healthMonitorInstance: HealthMonitor | null = null;

/**
 * Get or create health monitor instance
 */
export function getHealthMonitor(config?: Partial<HealthMonitorConfig>): HealthMonitor {
  if (!healthMonitorInstance) {
    healthMonitorInstance = new HealthMonitor(config);
  }
  return healthMonitorInstance;
}

/**
 * Reset health monitor instance (mainly for testing)
 */
export function resetHealthMonitor(): void {
  if (healthMonitorInstance) {
    healthMonitorInstance.stop();
    healthMonitorInstance = null;
  }
}
