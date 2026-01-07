/**
 * Metrics Collector
 * 
 * Collects and aggregates metrics from various sources for self-editing system.
 * Provides unified metrics interface for monitoring and analysis.
 */

import { EventEmitter } from 'events';
import { getPerformanceTracker, MetricType } from './performance-tracker.js';

/**
 * Metric source types
 */
export enum MetricSource {
  SELF_EDITING = 'self-editing',
  DISCORD_BOT = 'discord-bot',
  AI_PROCESSING = 'ai-processing',
  DATABASE = 'database',
  CACHE = 'cache',
  EXTERNAL_APIS = 'external-apis',
}

/**
 * Metric data point
 */
export interface MetricData {
  name: string;
  value: number;
  timestamp: Date;
  source: MetricSource;
  tags?: Record<string, string>;
}

/**
 * Aggregated metric
 */
export interface AggregatedMetric {
  name: string;
  source: MetricSource;
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
  timestamp: Date;
  tags: Record<string, string>;
}

/**
 * Metrics collector configuration
 */
export interface MetricsCollectorConfig {
  retentionPeriod: number;
  aggregationInterval: number;
  flushInterval: number;
  maxBufferSize: number;
}

/**
 * Default metrics collector configuration
 */
export const DEFAULT_METRICS_COLLECTOR_CONFIG: MetricsCollectorConfig = {
  retentionPeriod: 3600000, // 1 hour
  aggregationInterval: 60000, // 1 minute
  flushInterval: 300000, // 5 minutes
  maxBufferSize: 10000,
};

/**
 * Metrics collector
 */
export class MetricsCollector extends EventEmitter {
  private config: MetricsCollectorConfig;
  private buffer: MetricData[] = [];
  private aggregatedMetrics: Map<string, AggregatedMetric[]> = new Map();
  private aggregationInterval?: NodeJS.Timeout;
  private flushInterval?: NodeJS.Timeout;

  constructor(config: Partial<MetricsCollectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_METRICS_COLLECTOR_CONFIG, ...config };
  }

  /**
   * Start metrics collection
   */
  start(): void {
    if (this.aggregationInterval) {
      return;
    }

    this.aggregationInterval = setInterval(() => {
      this.aggregateMetrics();
    }, this.config.aggregationInterval);

    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, this.config.flushInterval);

    this.emit('started');
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = undefined;
    }

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }

    this.flushMetrics();
    this.emit('stopped');
  }

  /**
   * Collect a metric
   */
  collect(
    name: string,
    value: number,
    source: MetricSource,
    tags?: Record<string, string>
  ): void {
    const metric: MetricData = {
      name,
      value,
      timestamp: new Date(),
      source,
      tags,
    };

    this.buffer.push(metric);

    // Check buffer size
    if (this.buffer.length > this.config.maxBufferSize) {
      this.flushMetrics();
    }

    // Also record in performance tracker for certain metrics
    this.recordToPerformanceTracker(name, value, tags);

    this.emit('collected', metric);
  }

  /**
   * Collect self-editing metrics
   */
  collectSelfEditing(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): void {
    this.collect(name, value, MetricSource.SELF_EDITING, tags);
  }

  /**
   * Collect Discord bot metrics
   */
  collectDiscordBot(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): void {
    this.collect(name, value, MetricSource.DISCORD_BOT, tags);
  }

  /**
   * Collect AI processing metrics
   */
  collectAIProcessing(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): void {
    this.collect(name, value, MetricSource.AI_PROCESSING, tags);
  }

  /**
   * Collect database metrics
   */
  collectDatabase(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): void {
    this.collect(name, value, MetricSource.DATABASE, tags);
  }

  /**
   * Collect cache metrics
   */
  collectCache(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): void {
    this.collect(name, value, MetricSource.CACHE, tags);
  }

  /**
   * Record metric to performance tracker
   */
  private recordToPerformanceTracker(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): void {
    const tracker = getPerformanceTracker();

    // Map metric names to performance tracker types
    switch (name) {
      case 'latency':
        tracker.recordLatency(value, tags);
        break;
      case 'error_rate':
        tracker.recordErrorRate(value, tags);
        break;
      case 'memory_usage':
        tracker.recordMemoryUsage(value, tags);
        break;
      case 'cpu_usage':
        tracker.recordCpuUsage(value, tags);
        break;
      case 'modification_time':
        tracker.recordMetric(MetricType.MODIFICATION_TIME, value, 'ms', tags);
        break;
      case 'validation_time':
        tracker.recordMetric(MetricType.VALIDATION_TIME, value, 'ms', tags);
        break;
    }
  }

  /**
   * Aggregate metrics
   */
  private aggregateMetrics(): void {
    // Group metrics by name and source
    const groups = new Map<string, MetricData[]>();

    for (const metric of this.buffer) {
      const key = `${metric.source}:${metric.name}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(metric);
    }

    // Calculate aggregates
    const aggregates: AggregatedMetric[] = [];

    for (const [key, metrics] of groups) {
      if (metrics.length === 0) continue;

      const values = metrics.map(m => m.value);
      const sum = values.reduce((a, b) => a + b, 0);
      const average = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      aggregates.push({
        name: metrics[0].name,
        source: metrics[0].source,
        count: metrics.length,
        sum,
        average,
        min,
        max,
        timestamp: new Date(),
        tags: metrics[0].tags || {},
      });
    }

    // Store aggregated metrics
    for (const aggregate of aggregates) {
      const key = `${aggregate.source}:${aggregate.name}`;
      if (!this.aggregatedMetrics.has(key)) {
        this.aggregatedMetrics.set(key, []);
      }

      const aggregated = this.aggregatedMetrics.get(key)!;
      aggregated.push(aggregate);

      // Trim to retention period
      const cutoff = Date.now() - this.config.retentionPeriod;
      while (aggregated.length > 0 && aggregated[0].timestamp.getTime() < cutoff) {
        aggregated.shift();
      }
    }

    this.emit('aggregated', aggregates);
  }

  /**
   * Flush metrics
   */
  private flushMetrics(): void {
    if (this.buffer.length === 0) {
      return;
    }

    this.emit('flush', [...this.buffer]);
    this.buffer = [];
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(
    source?: MetricSource,
    name?: string
  ): AggregatedMetric[] {
    const results: AggregatedMetric[] = [];

    for (const [key, metrics] of this.aggregatedMetrics) {
      for (const metric of metrics) {
        if (source && metric.source !== source) continue;
        if (name && metric.name !== name) continue;

        results.push(metric);
      }
    }

    return results;
  }

  /**
   * Get latest aggregated metric
   */
  getLatestMetric(
    source: MetricSource,
    name: string
  ): AggregatedMetric | undefined {
    const key = `${source}:${name}`;
    const metrics = this.aggregatedMetrics.get(key);
    if (!metrics || metrics.length === 0) {
      return undefined;
    }

    return metrics[metrics.length - 1];
  }

  /**
   * Get metric history
   */
  getMetricHistory(
    source: MetricSource,
    name: string,
    limit?: number
  ): AggregatedMetric[] {
    const key = `${source}:${name}`;
    const metrics = this.aggregatedMetrics.get(key);
    if (!metrics) {
      return [];
    }

    if (limit) {
      return metrics.slice(-limit);
    }

    return [...metrics];
  }

  /**
   * Clear metrics
   */
  clearMetrics(source?: MetricSource, name?: string): void {
    if (source && name) {
      const key = `${source}:${name}`;
      this.aggregatedMetrics.delete(key);
    } else if (source) {
      for (const [key, _] of this.aggregatedMetrics) {
        if (key.startsWith(`${source}:`)) {
          this.aggregatedMetrics.delete(key);
        }
      }
    } else {
      this.aggregatedMetrics.clear();
    }
  }

  /**
   * Get buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MetricsCollectorConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart intervals with new configuration
    if (this.aggregationInterval) {
      this.stop();
      this.start();
    }
  }
}

// Singleton instance
let metricsCollectorInstance: MetricsCollector | null = null;

export function getMetricsCollector(config?: Partial<MetricsCollectorConfig>): MetricsCollector {
  if (!metricsCollectorInstance) {
    metricsCollectorInstance = new MetricsCollector(config);
  }
  return metricsCollectorInstance;
}
