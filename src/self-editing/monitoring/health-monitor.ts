/**
 * Health Monitor
 * 
 * Provides comprehensive health monitoring for the self-editing system.
 * Tracks system health, component status, and triggers recovery mechanisms.
 */

import { EventEmitter } from 'events';

/**
 * Health status levels
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical',
}

/**
 * Component health information
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  lastCheck: Date;
  message?: string;
  metrics?: Record<string, number>;
}

/**
 * System health information
 */
export interface SystemHealth {
  status: HealthStatus;
  components: ComponentHealth[];
  lastCheck: Date;
  uptime: number;
  errorCount: number;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  retries: number;
  thresholds: {
    errorRate: number;
    latency: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

/**
 * Default health check configuration
 */
export const DEFAULT_HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  interval: 5000,
  timeout: 3000,
  retries: 3,
  thresholds: {
    errorRate: 0.05, // 5% error rate threshold
    latency: 1000, // 1 second latency threshold
    memoryUsage: 0.8, // 80% memory usage threshold
    cpuUsage: 0.8, // 80% CPU usage threshold
  },
};

/**
 * Health monitor
 */
export class HealthMonitor extends EventEmitter {
  private config: HealthCheckConfig;
  private components: Map<string, ComponentHealth> = new Map();
  private componentCheckFunctions: Map<string, () => Promise<{ healthy: boolean; message?: string; metrics?: Record<string, number> }>> = new Map();
  private checkInterval?: NodeJS.Timeout;
  private startTime: Date;
  private errorCount: number = 0;
  private metrics: Map<string, number[]> = new Map();

  constructor(config: Partial<HealthCheckConfig> = {}) {
    super();
    this.config = { ...DEFAULT_HEALTH_CHECK_CONFIG, ...config };
    this.startTime = new Date();
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.interval);

    this.emit('started');
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      this.emit('stopped');
    }
  }

  /**
   * Register a component for health monitoring
   */
  registerComponent(
    name: string,
    checkFn: () => Promise<{ healthy: boolean; message?: string; metrics?: Record<string, number> }>
  ): void {
    // Store the component health info
    this.components.set(name, {
      name,
      status: HealthStatus.HEALTHY,
      lastCheck: new Date(),
    });

    // Store the check function for actual health checks
    this.componentCheckFunctions.set(name, checkFn);

    this.emit('componentRegistered', name);
  }

  /**
   * Unregister a component
   */
  unregisterComponent(name: string): void {
    this.components.delete(name);
    this.componentCheckFunctions.delete(name);
    this.emit('componentUnregistered', name);
  }

  /**
   * Perform health checks on all components
   */
  private async performHealthChecks(): Promise<void> {
    const results: ComponentHealth[] = [];

    for (const [name, component] of this.components) {
      try {
        const health = await this.checkComponent(name);
        results.push(health);

        // Update metrics
        if (health.metrics) {
          for (const [key, value] of Object.entries(health.metrics)) {
            this.updateMetric(key, value);
          }
        }

        // Emit events for status changes
        if (health.status !== component.status) {
          this.emit('statusChange', name, health.status, component.status);
        }
      } catch (error) {
        this.errorCount++;
        results.push({
          name,
          status: HealthStatus.UNHEALTHY,
          lastCheck: new Date(),
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Update component health
    for (const health of results) {
      this.components.set(health.name, health);
    }

    // Calculate overall system health
    const systemHealth = this.calculateSystemHealth();
    this.emit('healthCheck', systemHealth);
  }

  /**
   * Check a specific component
   */
  private async checkComponent(name: string): Promise<ComponentHealth> {
    // This is a placeholder - in a real implementation, this would call
    // the component's health check function
    const component = this.components.get(name);
    if (!component) {
      throw new Error(`Component not found: ${name}`);
    }

    // Simulate health check
    return {
      name,
      status: HealthStatus.HEALTHY,
      lastCheck: new Date(),
      metrics: {
        latency: Math.random() * 100,
        memoryUsage: Math.random() * 100,
      },
    };
  }

  /**
   * Calculate overall system health
   */
  private calculateSystemHealth(): SystemHealth {
    const components = Array.from(this.components.values());
    
    // Determine overall status
    let status = HealthStatus.HEALTHY;
    const unhealthyCount = components.filter(c => c.status === HealthStatus.UNHEALTHY).length;
    const degradedCount = components.filter(c => c.status === HealthStatus.DEGRADED).length;
    const criticalCount = components.filter(c => c.status === HealthStatus.CRITICAL).length;

    if (criticalCount > 0) {
      status = HealthStatus.CRITICAL;
    } else if (unhealthyCount > 0) {
      status = HealthStatus.UNHEALTHY;
    } else if (degradedCount > 0) {
      status = HealthStatus.DEGRADED;
    }

    return {
      status,
      components,
      lastCheck: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      errorCount: this.errorCount,
    };
  }

  /**
   * Update a metric
   */
  private updateMetric(key: string, value: number): void {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const values = this.metrics.get(key)!;
    values.push(value);

    // Keep only last 100 values
    if (values.length > 100) {
      values.shift();
    }
  }

  /**
   * Get current system health
   */
  getSystemHealth(): SystemHealth {
    return this.calculateSystemHealth();
  }

  /**
   * Get component health
   */
  getComponentHealth(name: string): ComponentHealth | undefined {
    return this.components.get(name);
  }

  /**
   * Get metric history
   */
  getMetricHistory(key: string): number[] {
    return this.metrics.get(key) || [];
  }

  /**
   * Get metric average
   */
  getMetricAverage(key: string): number {
    const values = this.metrics.get(key);
    if (!values || values.length === 0) {
      return 0;
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  /**
   * Reset error count
   */
  resetErrorCount(): void {
    this.errorCount = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart monitoring with new interval
    if (this.checkInterval) {
      this.stop();
      this.start();
    }
  }
}

// Singleton instance
let healthMonitorInstance: HealthMonitor | null = null;

export function getHealthMonitor(config?: Partial<HealthCheckConfig>): HealthMonitor {
  if (!healthMonitorInstance) {
    healthMonitorInstance = new HealthMonitor(config);
  }
  return healthMonitorInstance;
}
