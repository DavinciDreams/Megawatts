import { PerformanceMonitor, PerformanceMetrics, PerformanceThresholds, IntegrationEvent } from './types';
import { Logger } from '../../utils/logger';
import { BotError } from '../../types';

export class BotPerformanceMonitor implements PerformanceMonitor {
  private logger: Logger;
  private config: PerformanceThresholds;
  private isMonitoring = false;
  private metrics: PerformanceMetrics[] = [];
  private monitoringInterval?: ReturnType<typeof setInterval>;
  private eventCounters = new Map<string, number>();
  private startTimes = new Map<string, number>();
  private eventHandlers: Array<(event: IntegrationEvent) => void> = [];

  constructor(logger: Logger, config: PerformanceThresholds) {
    this.logger = logger;
    this.config = config;
  }

  public startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.warn('Performance monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    this.logger.info('Starting performance monitoring...');

    // Start periodic metrics collection
    this.monitoringInterval = setInterval(() => {
      this.collectPeriodicMetrics();
    }, 60000); // Collect every minute

    this.logger.info('Performance monitoring started');
  }

  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      this.logger.warn('Performance monitoring is not running');
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null as any;
    }

    this.logger.info('Performance monitoring stopped');
  }

  public async collectMetrics(): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {
      timestamp: new Date(),
      responseTime: this.calculateAverageResponseTime(),
      errorRate: this.calculateErrorRate(),
      memoryUsage: this.getMemoryUsage(),
      cpuUsage: this.getCPUUsage(),
      activeConnections: this.getActiveConnections(),
      processedEvents: this.getTotalProcessedEvents(),
      failedEvents: this.getFailedEvents(),
    };

    this.metrics.push(metrics);
    this.emitEvent('metric_collected', { metrics });

    this.logger.debug('Performance metrics collected', metrics);
    return metrics;
  }

  public getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  public setThresholds(thresholds: PerformanceThresholds): void {
    this.config = thresholds;
    this.logger.info('Performance thresholds updated', thresholds);
  }

  public startEventTiming(eventId: string): void {
    this.startTimes.set(eventId, Date.now());
  }

  public endEventTiming(eventId: string): number {
    const startTime = this.startTimes.get(eventId);
    if (!startTime) {
      this.logger.warn(`No start time found for event: ${eventId}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.startTimes.delete(eventId);
    return duration;
  }

  public incrementEventCounter(eventType: string, success: boolean = true): void {
    const key = success ? `${eventType}_success` : `${eventType}_failure`;
    this.eventCounters.set(key, (this.eventCounters.get(key) || 0) + 1);
  }

  public onEvent(handler: (event: IntegrationEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  private async collectPeriodicMetrics(): Promise<void> {
    try {
      const metrics = await this.collectMetrics();
      await this.checkThresholds(metrics);
    } catch (error: any) {
      this.logger.error('Failed to collect periodic metrics:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'periodic_metrics_collection'
      });
    }
  }

  private async checkThresholds(metrics: PerformanceMetrics): Promise<void> {
    const alerts: string[] = [];

    if (metrics.responseTime > this.config.responseTime) {
      alerts.push(`Response time (${metrics.responseTime}ms) exceeds threshold (${this.config.responseTime}ms)`);
    }

    if (metrics.errorRate > this.config.errorRate) {
      alerts.push(`Error rate (${(metrics.errorRate * 100).toFixed(2)}%) exceeds threshold (${(this.config.errorRate * 100).toFixed(2)}%)`);
    }

    if (metrics.memoryUsage > this.config.memoryUsage) {
      alerts.push(`Memory usage (${metrics.memoryUsage}MB) exceeds threshold (${this.config.memoryUsage}MB)`);
    }

    if (metrics.cpuUsage > this.config.cpuUsage) {
      alerts.push(`CPU usage (${metrics.cpuUsage}%) exceeds threshold (${this.config.cpuUsage}%)`);
    }

    if (alerts.length > 0) {
      this.logger.warn('Performance thresholds exceeded', { alerts, metrics });
      this.emitEvent('metric_collected', { 
        type: 'threshold_exceeded',
        alerts,
        metrics 
      });
    }
  }

  private calculateAverageResponseTime(): number {
    const recentMetrics = this.metrics.slice(-10); // Last 10 measurements
    if (recentMetrics.length === 0) return 0;

    const totalTime = recentMetrics.reduce((sum, metric) => sum + metric.responseTime, 0);
    return totalTime / recentMetrics.length;
  }

  private calculateErrorRate(): number {
    const totalSuccess = Array.from(this.eventCounters.entries())
      .filter(([key]) => key.endsWith('_success'))
      .reduce((sum, [, count]) => sum + count, 0);

    const totalFailure = Array.from(this.eventCounters.entries())
      .filter(([key]) => key.endsWith('_failure'))
      .reduce((sum, [, count]) => sum + count, 0);

    const total = totalSuccess + totalFailure;
    return total > 0 ? totalFailure / total : 0;
  }

  private getMemoryUsage(): number {
    try {
      // Check if we're in Node.js environment
      if (typeof globalThis !== 'undefined' && (globalThis as any).process?.memoryUsage) {
        const usage = (globalThis as any).process.memoryUsage();
        return Math.round(usage.heapUsed / 1024 / 1024); // Convert to MB
      }
    } catch (error: any) {
      this.logger.debug('Could not get memory usage:', error);
    }
    return 0;
  }

  private getCPUUsage(): number {
    // Mock CPU usage - in a real implementation, you'd use system monitoring
    return Math.random() * 20 + 10; // 10-30% usage
  }

  private getActiveConnections(): number {
    // Mock active connections - would be implemented based on actual connection tracking
    return Math.floor(Math.random() * 50) + 10;
  }

  private getTotalProcessedEvents(): number {
    return Array.from(this.eventCounters.entries())
      .filter(([key]) => key.endsWith('_success'))
      .reduce((sum, [, count]) => sum + count, 0);
  }

  private getFailedEvents(): number {
    return Array.from(this.eventCounters.entries())
      .filter(([key]) => key.endsWith('_failure'))
      .reduce((sum, [, count]) => sum + count, 0);
  }

  private emitEvent(type: string, data: Record<string, any>): void {
    const event: IntegrationEvent = {
      type: type as any,
      timestamp: new Date(),
      data,
      source: 'performance_monitor'
    };

    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error: any) {
        this.logger.error('Error in event handler:', error);
      }
    });
  }

  public clearMetrics(): void {
    this.metrics = [];
    this.eventCounters.clear();
    this.startTimes.clear();
    this.logger.info('Performance metrics cleared');
  }

  public getAverageMetrics(timeWindow: number = 300000): PerformanceMetrics | null {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentMetrics = this.metrics.filter(metric => metric.timestamp >= cutoff);
    
    if (recentMetrics.length === 0) return null;

    return {
      timestamp: new Date(),
      responseTime: recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length,
      errorRate: recentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / recentMetrics.length,
      memoryUsage: recentMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / recentMetrics.length,
      cpuUsage: recentMetrics.reduce((sum, m) => sum + m.cpuUsage, 0) / recentMetrics.length,
      activeConnections: recentMetrics.reduce((sum, m) => sum + m.activeConnections, 0) / recentMetrics.length,
      processedEvents: recentMetrics.reduce((sum, m) => sum + m.processedEvents, 0),
      failedEvents: recentMetrics.reduce((sum, m) => sum + m.failedEvents, 0),
    };
  }
}