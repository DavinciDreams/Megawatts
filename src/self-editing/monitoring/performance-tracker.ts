/**
 * Performance Tracker
 * 
 * Tracks and analyzes performance metrics for self-editing operations.
 * Provides insights into modification impact and system performance.
 */

import { EventEmitter } from 'events';

/**
 * Performance metric types
 */
export enum MetricType {
  LATENCY = 'latency',
  THROUGHPUT = 'throughput',
  ERROR_RATE = 'errorRate',
  MEMORY_USAGE = 'memoryUsage',
  CPU_USAGE = 'cpuUsage',
  MODIFICATION_TIME = 'modificationTime',
  VALIDATION_TIME = 'validationTime',
  ROLLBACK_TIME = 'rollbackTime',
}

/**
 * Performance metric
 */
export interface PerformanceMetric {
  type: MetricType;
  timestamp: Date;
  value: number;
  unit: string;
  tags?: Record<string, string>;
}

/**
 * Performance summary
 */
export interface PerformanceSummary {
  metricType: MetricType;
  average: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
  unit: string;
}

/**
 * Performance comparison
 */
export interface PerformanceComparison {
  metricType: MetricType;
  before: PerformanceSummary;
  after: PerformanceSummary;
  changePercent: number;
  improvement: boolean;
}

/**
 * Performance tracker configuration
 */
export interface PerformanceTrackerConfig {
  maxMetrics: number;
  aggregationInterval: number;
  alertThresholds: {
    latency: number;
    errorRate: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

/**
 * Default performance tracker configuration
 */
export const DEFAULT_PERFORMANCE_TRACKER_CONFIG: PerformanceTrackerConfig = {
  maxMetrics: 1000,
  aggregationInterval: 60000, // 1 minute
  alertThresholds: {
    latency: 2000, // 2 seconds
    errorRate: 0.05, // 5%
    memoryUsage: 0.8, // 80%
    cpuUsage: 0.8, // 80%
  },
};

/**
 * Performance tracker
 */
export class PerformanceTracker extends EventEmitter {
  private config: PerformanceTrackerConfig;
  private metrics: Map<MetricType, PerformanceMetric[]> = new Map();
  private aggregationInterval?: NodeJS.Timeout;

  constructor(config: Partial<PerformanceTrackerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PERFORMANCE_TRACKER_CONFIG, ...config };

    // Initialize metric arrays
    for (const type of Object.values(MetricType)) {
      this.metrics.set(type, []);
    }
  }

  /**
   * Start performance tracking
   */
  start(): void {
    if (this.aggregationInterval) {
      return;
    }

    this.aggregationInterval = setInterval(() => {
      this.aggregateMetrics();
    }, this.config.aggregationInterval);

    this.emit('started');
  }

  /**
   * Stop performance tracking
   */
  stop(): void {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = undefined;
      this.emit('stopped');
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(
    type: MetricType,
    value: number,
    unit: string = 'ms',
    tags?: Record<string, string>
  ): void {
    const metric: PerformanceMetric = {
      type,
      timestamp: new Date(),
      value,
      unit,
      tags,
    };

    const metrics = this.metrics.get(type);
    if (!metrics) {
      this.metrics.set(type, [metric]);
    } else {
      metrics.push(metric);

      // Trim to max metrics
      if (metrics.length > this.config.maxMetrics) {
        metrics.shift();
      }
    }

    // Check alert thresholds
    this.checkAlertThresholds(type, value);

    this.emit('metricRecorded', metric);
  }

  /**
   * Record modification performance
   */
  recordModification(
    modificationTime: number,
    validationTime: number,
    tags?: Record<string, string>
  ): void {
    this.recordMetric(MetricType.MODIFICATION_TIME, modificationTime, 'ms', tags);
    this.recordMetric(MetricType.VALIDATION_TIME, validationTime, 'ms', tags);
  }

  /**
   * Record latency
   */
  recordLatency(latency: number, tags?: Record<string, string>): void {
    this.recordMetric(MetricType.LATENCY, latency, 'ms', tags);
  }

  /**
   * Record error rate
   */
  recordErrorRate(errorRate: number, tags?: Record<string, string>): void {
    this.recordMetric(MetricType.ERROR_RATE, errorRate, '%', tags);
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(usage: number, tags?: Record<string, string>): void {
    this.recordMetric(MetricType.MEMORY_USAGE, usage, '%', tags);
  }

  /**
   * Record CPU usage
   */
  recordCpuUsage(usage: number, tags?: Record<string, string>): void {
    this.recordMetric(MetricType.CPU_USAGE, usage, '%', tags);
  }

  /**
   * Get performance summary for a metric type
   */
  getSummary(metricType: MetricType): PerformanceSummary | null {
    const metrics = this.metrics.get(metricType);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;

    return {
      metricType,
      average,
      min: values[0],
      max: values[values.length - 1],
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
      count: values.length,
      unit: metrics[0].unit,
    };
  }

  /**
   * Get all summaries
   */
  getAllSummaries(): PerformanceSummary[] {
    const summaries: PerformanceSummary[] = [];

    for (const type of Object.values(MetricType)) {
      const summary = this.getSummary(type);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  /**
   * Compare performance before and after modification
   */
  comparePerformance(
    metricType: MetricType,
    beforeMetrics: PerformanceMetric[],
    afterMetrics: PerformanceMetric[]
  ): PerformanceComparison {
    const beforeSummary = this.calculateSummary(beforeMetrics);
    const afterSummary = this.calculateSummary(afterMetrics);

    const changePercent = beforeSummary.average > 0
      ? ((afterSummary.average - beforeSummary.average) / beforeSummary.average) * 100
      : 0;

    const improvement = changePercent < 0; // Negative change is improvement

    return {
      metricType,
      before: beforeSummary,
      after: afterSummary,
      changePercent,
      improvement,
    };
  }

  /**
   * Calculate summary from metrics
   */
  private calculateSummary(metrics: PerformanceMetric[]): PerformanceSummary {
    if (metrics.length === 0) {
      throw new Error('Cannot calculate summary from empty metrics');
    }

    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;

    return {
      metricType: metrics[0].type,
      average,
      min: values[0],
      max: values[values.length - 1],
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
      count: values.length,
      unit: metrics[0].unit,
    };
  }

  /**
   * Check alert thresholds
   */
  private checkAlertThresholds(type: MetricType, value: number): void {
    let threshold: number | undefined;

    switch (type) {
      case MetricType.LATENCY:
        threshold = this.config.alertThresholds.latency;
        break;
      case MetricType.ERROR_RATE:
        threshold = this.config.alertThresholds.errorRate;
        break;
      case MetricType.MEMORY_USAGE:
        threshold = this.config.alertThresholds.memoryUsage;
        break;
      case MetricType.CPU_USAGE:
        threshold = this.config.alertThresholds.cpuUsage;
        break;
    }

    if (threshold !== undefined && value > threshold) {
      this.emit('alert', {
        type,
        value,
        threshold,
        message: `${type} exceeded threshold: ${value} > ${threshold}`,
      });
    }
  }

  /**
   * Aggregate metrics
   */
  private aggregateMetrics(): void {
    for (const type of Object.values(MetricType)) {
      const summary = this.getSummary(type);
      if (summary) {
        this.emit('aggregated', summary);
      }
    }
  }

  /**
   * Get metrics for a type
   */
  getMetrics(type: MetricType): PerformanceMetric[] {
    return this.metrics.get(type) || [];
  }

  /**
   * Clear metrics for a type
   */
  clearMetrics(type?: MetricType): void {
    if (type) {
      this.metrics.set(type, []);
    } else {
      for (const t of Object.values(MetricType)) {
        this.metrics.set(t, []);
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PerformanceTrackerConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart aggregation with new interval
    if (this.aggregationInterval) {
      this.stop();
      this.start();
    }
  }
}

// Singleton instance
let performanceTrackerInstance: PerformanceTracker | null = null;

export function getPerformanceTracker(config?: Partial<PerformanceTrackerConfig>): PerformanceTracker {
  if (!performanceTrackerInstance) {
    performanceTrackerInstance = new PerformanceTracker(config);
  }
  return performanceTrackerInstance;
}
