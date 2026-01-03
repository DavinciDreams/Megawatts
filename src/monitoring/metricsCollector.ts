/**
 * Metrics Collector - Comprehensive Prometheus-based metrics collection
 *
 * This module provides comprehensive metrics collection capabilities including:
 * - Custom Prometheus metrics (Counter, Gauge, Histogram, Summary)
 * - Performance metrics (CPU, memory, disk, network)
 * - Application metrics (request latency, throughput, error rates)
 * - Business metrics (active users, messages, commands)
 * - Database metrics (query performance, connection pool, cache)
 * - API metrics (endpoint performance, rate limiting, auth)
 * - Metrics aggregation and export endpoints
 */

import { Counter, Gauge, Histogram, Summary, Registry, collectDefaultMetrics } from 'prom-client';
import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';

/**
 * Metric types supported by the collector
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

/**
 * Performance metric categories
 */
export enum PerformanceCategory {
  CPU = 'cpu',
  MEMORY = 'memory',
  DISK = 'disk',
  NETWORK = 'network'
}

/**
 * Application metric categories
 */
export enum ApplicationCategory {
  REQUEST = 'request',
  THROUGHPUT = 'throughput',
  ERROR_RATE = 'error_rate',
  LATENCY = 'latency'
}

/**
 * Business metric categories
 */
export enum BusinessCategory {
  ACTIVE_USERS = 'active_users',
  MESSAGES_PROCESSED = 'messages_processed',
  COMMANDS_EXECUTED = 'commands_executed',
  FEATURES_USED = 'features_used'
}

/**
 * Database metric categories
 */
export enum DatabaseCategory {
  QUERY_PERFORMANCE = 'query_performance',
  CONNECTION_POOL = 'connection_pool',
  CACHE_HIT_RATE = 'cache_hit_rate',
  TRANSACTION_RATE = 'transaction_rate'
}

/**
 * API metric categories
 */
export enum ApiCategory {
  ENDPOINT_PERFORMANCE = 'endpoint_performance',
  RATE_LIMITING = 'rate_limiting',
  AUTHENTICATION = 'authentication',
  RESPONSE_CODES = 'response_codes'
}

/**
 * Error tracking categories
 */
export enum ErrorCategory {
  TYPE = 'error_type',
  SEVERITY = 'error_severity',
  COMPONENT = 'error_component'
}

/**
 * Metric definition interface
 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  help: string;
  labelNames?: string[];
  buckets?: number[];
  percentiles?: number[];
  ageBuckets?: number;
  maxAgeSeconds?: number;
}

/**
 * Aggregated metric data
 */
export interface AggregatedMetric {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

/**
 * Metrics collector configuration
 */
export interface MetricsCollectorConfig {
  enabled: boolean;
  interval: number;
  retention: number;
  aggregation: boolean;
  defaultLabels?: Record<string, string>;
  collectDefaultMetrics?: boolean;
}

/**
 * Performance metrics data
 */
export interface PerformanceMetrics {
  cpu: {
    usage: number;
    user: number;
    system: number;
    loadAverage: number[];
  };
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
    usagePercent: number;
  };
  disk: {
    used: number;
    free: number;
    total: number;
    usagePercent: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
}

/**
 * Application metrics data
 */
export interface ApplicationMetrics {
  requestLatency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  throughput: {
    requestsPerSecond: number;
    messagesPerSecond: number;
    commandsPerSecond: number;
  };
  errorRates: {
    totalErrors: number;
    errorRate: number;
    criticalErrors: number;
  };
}

/**
 * Business metrics data
 */
export interface BusinessMetrics {
  activeUsers: number;
  messagesProcessed: number;
  commandsExecuted: number;
  featuresUsed: Record<string, number>;
}

/**
 * Database metrics data
 */
export interface DatabaseMetrics {
  queryPerformance: {
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
    slowQueries: number;
  };
  connectionPool: {
    active: number;
    idle: number;
    waiting: number;
    max: number;
  };
  cacheHitRate: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/**
 * API metrics data
 */
export interface ApiMetrics {
  endpointPerformance: Record<string, {
    requests: number;
    avgLatency: number;
    errorRate: number;
  }>;
  rateLimiting: {
    blocked: number;
    allowed: number;
    blockRate: number;
  };
  authentication: {
    successes: number;
    failures: number;
    failureRate: number;
  };
}

/**
 * Error tracking data
 */
export interface ErrorTrackingMetrics {
  errorsByType: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  errorsByComponent: Record<string, number>;
  totalErrors: number;
}

/**
 * Metrics Collector Class
 *
 * Provides comprehensive metrics collection using Prometheus client
 */
export class MetricsCollector {
  private logger: Logger;
  private registry: Registry;
  private config: MetricsCollectorConfig;
  private metrics: Map<string, Counter | Gauge | Histogram | Summary>;
  private aggregatedMetrics: AggregatedMetric[];
  private collectionInterval?: NodeJS.Timeout;
  private startTime: Date;

  // Performance metrics
  private cpuUsageGauge: Gauge<string>;
  private memoryUsageGauge: Gauge<string>;
  private diskUsageGauge: Gauge<string>;
  private networkBytesGauge: Gauge<string>;

  // Application metrics
  private requestLatencyHistogram: Histogram<string>;
  private requestCounter: Counter<string>;
  private errorCounter: Counter<string>;

  // Business metrics
  private activeUsersGauge: Gauge<string>;
  private messagesProcessedCounter: Counter<string>;
  private commandsExecutedCounter: Counter<string>;
  private featuresUsedCounter: Counter<string>;

  // Database metrics
  private queryLatencyHistogram: Histogram<string>;
  private dbConnectionPoolGauge: Gauge<string>;
  private cacheHitsCounter: Counter<string>;
  private cacheMissesCounter: Counter<string>;

  // API metrics
  private apiRequestDuration: Histogram<string>;
  private apiRequestCounter: Counter<string>;
  private rateLimitCounter: Counter<string>;
  private authFailureCounter: Counter<string>;

  // Error tracking metrics
  private errorTypeCounter: Counter<string>;
  private errorSeverityCounter: Counter<string>;

  constructor(config: Partial<MetricsCollectorConfig> = {}) {
    this.logger = new Logger('MetricsCollector');
    this.startTime = new Date();
    this.registry = new Registry();
    this.metrics = new Map();
    this.aggregatedMetrics = [];

    this.config = {
      enabled: true,
      interval: 60000, // 1 minute
      retention: 30, // 30 days
      aggregation: true,
      collectDefaultMetrics: true,
      ...config
    };

    this.initializeMetrics();
    this.setupDefaultMetrics();
  }

  /**
   * Initialize all custom metrics
   */
  private initializeMetrics(): void {
    // Performance metrics
    this.cpuUsageGauge = new Gauge({
      name: 'megawatts_cpu_usage_percent',
      help: 'CPU usage percentage',
      labelNames: ['type', 'core'],
      registers: [this.registry]
    });

    this.memoryUsageGauge = new Gauge({
      name: 'megawatts_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry]
    });

    this.diskUsageGauge = new Gauge({
      name: 'megawatts_disk_usage_bytes',
      help: 'Disk usage in bytes',
      labelNames: ['type', 'mount'],
      registers: [this.registry]
    });

    this.networkBytesGauge = new Gauge({
      name: 'megawatts_network_bytes',
      help: 'Network bytes transferred',
      labelNames: ['direction', 'interface'],
      registers: [this.registry]
    });

    // Application metrics
    this.requestLatencyHistogram = new Histogram({
      name: 'megawatts_request_duration_seconds',
      help: 'Request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry]
    });

    this.requestCounter = new Counter({
      name: 'megawatts_requests_total',
      help: 'Total number of requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry]
    });

    this.errorCounter = new Counter({
      name: 'megawatts_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'severity', 'component'],
      registers: [this.registry]
    });

    // Business metrics
    this.activeUsersGauge = new Gauge({
      name: 'megawatts_active_users',
      help: 'Number of active users',
      labelNames: ['period'],
      registers: [this.registry]
    });

    this.messagesProcessedCounter = new Counter({
      name: 'megawatts_messages_processed_total',
      help: 'Total number of messages processed',
      labelNames: ['channel_type', 'status'],
      registers: [this.registry]
    });

    this.commandsExecutedCounter = new Counter({
      name: 'megawatts_commands_executed_total',
      help: 'Total number of commands executed',
      labelNames: ['command', 'status'],
      registers: [this.registry]
    });

    this.featuresUsedCounter = new Counter({
      name: 'megawatts_features_used_total',
      help: 'Total number of times features were used',
      labelNames: ['feature', 'success'],
      registers: [this.registry]
    });

    // Database metrics
    this.queryLatencyHistogram = new Histogram({
      name: 'megawatts_db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry]
    });

    this.dbConnectionPoolGauge = new Gauge({
      name: 'megawatts_db_connection_pool',
      help: 'Database connection pool status',
      labelNames: ['state'],
      registers: [this.registry]
    });

    this.cacheHitsCounter = new Counter({
      name: 'megawatts_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'],
      registers: [this.registry]
    });

    this.cacheMissesCounter = new Counter({
      name: 'megawatts_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type'],
      registers: [this.registry]
    });

    // API metrics
    this.apiRequestDuration = new Histogram({
      name: 'megawatts_api_request_duration_seconds',
      help: 'External API request duration in seconds',
      labelNames: ['api', 'endpoint', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry]
    });

    this.apiRequestCounter = new Counter({
      name: 'megawatts_api_requests_total',
      help: 'Total number of external API requests',
      labelNames: ['api', 'endpoint', 'status'],
      registers: [this.registry]
    });

    this.rateLimitCounter = new Counter({
      name: 'megawatts_rate_limit_total',
      help: 'Total number of rate limit events',
      labelNames: ['action', 'source'],
      registers: [this.registry]
    });

    this.authFailureCounter = new Counter({
      name: 'megawatts_auth_failures_total',
      help: 'Total number of authentication failures',
      labelNames: ['method', 'reason'],
      registers: [this.registry]
    });

    // Error tracking metrics
    this.errorTypeCounter = new Counter({
      name: 'megawatts_error_type_total',
      help: 'Total errors by type',
      labelNames: ['error_type'],
      registers: [this.registry]
    });

    this.errorSeverityCounter = new Counter({
      name: 'megawatts_error_severity_total',
      help: 'Total errors by severity',
      labelNames: ['severity'],
      registers: [this.registry]
    });
  }

  /**
   * Set up default Prometheus metrics
   */
  private setupDefaultMetrics(): void {
    if (this.config.collectDefaultMetrics) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: 'megawatts_'
      });
    }
  }

  /**
   * Start metrics collection
   */
  start(): void {
    if (!this.config.enabled) {
      this.logger.warn('Metrics collection is disabled');
      return;
    }

    if (this.collectionInterval) {
      this.logger.warn('Metrics collection already started');
      return;
    }

    this.logger.info(`Starting metrics collection with interval: ${this.config.interval}ms`);
    this.collectionInterval = setInterval(() => {
      this.collectPerformanceMetrics();
    }, this.config.interval);

    this.collectPerformanceMetrics();
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
      this.logger.info('Metrics collection stopped');
    }
  }

  /**
   * Collect performance metrics
   */
  private collectPerformanceMetrics(): void {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Memory metrics
      this.memoryUsageGauge.set({ type: 'rss' }, memoryUsage.rss);
      this.memoryUsageGauge.set({ type: 'heapTotal' }, memoryUsage.heapTotal);
      this.memoryUsageGauge.set({ type: 'heapUsed' }, memoryUsage.heapUsed);
      this.memoryUsageGauge.set({ type: 'external' }, memoryUsage.external);
      this.memoryUsageGauge.set({ type: 'arrayBuffers' }, memoryUsage.arrayBuffers);

      // CPU metrics
      const totalCpuTime = cpuUsage.user + cpuUsage.system;
      const elapsed = (Date.now() - this.startTime.getTime()) * 1000;
      const cpuPercent = (totalCpuTime / elapsed) * 100;

      this.cpuUsageGauge.set({ type: 'usage', core: 'total' }, cpuPercent);
      this.cpuUsageGauge.set({ type: 'user', core: 'total' }, cpuUsage.user);
      this.cpuUsageGauge.set({ type: 'system', core: 'total' }, cpuUsage.system);

      this.logger.debug('Performance metrics collected');
    } catch (error) {
      this.logger.error('Error collecting performance metrics', error);
    }
  }

  /**
   * Record request latency
   */
  recordRequestLatency(method: string, route: string, status: string, duration: number): void {
    this.requestLatencyHistogram.observe({ method, route, status }, duration);
    this.requestCounter.inc({ method, route, status });
  }

  /**
   * Record error
   */
  recordError(error: Error, severity: 'low' | 'medium' | 'high' | 'critical', component: string): void {
    const errorType = error.constructor.name;
    this.errorCounter.inc({ type: errorType, severity, component });
    this.errorTypeCounter.inc({ error_type: errorType });
    this.errorSeverityCounter.inc({ severity });
  }

  /**
   * Record bot error specifically
   */
  recordBotError(error: BotError): void {
    this.recordError(error, error.severity, error.context?.component || 'unknown');
  }

  /**
   * Update active users count
   */
  updateActiveUsers(count: number, period: string = '1m'): void {
    this.activeUsersGauge.set({ period }, count);
  }

  /**
   * Record message processed
   */
  recordMessageProcessed(channelType: string, status: string): void {
    this.messagesProcessedCounter.inc({ channel_type: channelType, status });
  }

  /**
   * Record command executed
   */
  recordCommandExecuted(command: string, status: string): void {
    this.commandsExecutedCounter.inc({ command, status });
  }

  /**
   * Record feature usage
   */
  recordFeatureUsed(feature: string, success: boolean): void {
    this.featuresUsedCounter.inc({ feature, success: success.toString() });
  }

  /**
   * Record database query latency
   */
  recordDbQuery(operation: string, table: string, duration: number): void {
    this.queryLatencyHistogram.observe({ operation, table }, duration);
  }

  /**
   * Update database connection pool
   */
  updateDbConnectionPool(state: string, count: number): void {
    this.dbConnectionPoolGauge.set({ state }, count);
  }

  /**
   * Record cache hit
   */
  recordCacheHit(cacheType: string): void {
    this.cacheHitsCounter.inc({ cache_type: cacheType });
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(cacheType: string): void {
    this.cacheMissesCounter.inc({ cache_type: cacheType });
  }

  /**
   * Record API request
   */
  recordApiRequest(api: string, endpoint: string, status: string, duration: number): void {
    this.apiRequestDuration.observe({ api, endpoint, status }, duration);
    this.apiRequestCounter.inc({ api, endpoint, status });
  }

  /**
   * Record rate limit event
   */
  recordRateLimit(action: string, source: string): void {
    this.rateLimitCounter.inc({ action, source });
  }

  /**
   * Record authentication failure
   */
  recordAuthFailure(method: string, reason: string): void {
    this.authFailureCounter.inc({ method, reason });
  }

  /**
   * Create custom metric
   */
  createCustomMetric(definition: MetricDefinition): Counter | Gauge | Histogram | Summary {
    let metric: Counter | Gauge | Histogram | Summary;

    const commonConfig = {
      name: definition.name,
      help: definition.help,
      labelNames: definition.labelNames || [],
      registers: [this.registry]
    };

    switch (definition.type) {
      case MetricType.COUNTER:
        metric = new Counter(commonConfig);
        break;
      case MetricType.GAUGE:
        metric = new Gauge(commonConfig);
        break;
      case MetricType.HISTOGRAM:
        metric = new Histogram({
          ...commonConfig,
          buckets: definition.buckets
        });
        break;
      case MetricType.SUMMARY:
        metric = new Summary({
          ...commonConfig,
          percentiles: definition.percentiles,
          ageBuckets: definition.ageBuckets,
          maxAgeSeconds: definition.maxAgeSeconds
        });
        break;
      default:
        throw new BotError(`Unknown metric type: ${definition.type}`, 'medium');
    }

    this.metrics.set(definition.name, metric);
    this.logger.info(`Created custom metric: ${definition.name}`);
    return metric;
  }

  /**
   * Get metric by name
   */
  getMetric(name: string): Counter | Gauge | Histogram | Summary | undefined {
    return this.metrics.get(name);
  }

  /**
   * Get all metrics as Prometheus format
   */
  async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsAsJson(): Promise<Record<string, any>> {
    return await this.registry.getMetricsAsJSON();
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.registry.resetMetrics();
    this.logger.info('All metrics reset');
  }

  /**
   * Clear aggregated metrics
   */
  clearAggregatedMetrics(): void {
    this.aggregatedMetrics = [];
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): AggregatedMetric[] {
    return [...this.aggregatedMetrics];
  }

  /**
   * Get performance metrics summary
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const cpuUsage = await this.cpuUsageGauge.get();
    const memoryUsage = await this.memoryUsageGauge.get();

    const getValue = (metric: any, labels: Record<string, string>): number => {
      const values = metric.values || [];
      const match = values.find((v: any) => {
        return Object.entries(labels).every(([k, v]) => v.metric?.[k] === v);
      });
      return match?.value || 0;
    };

    return {
      cpu: {
        usage: getValue(cpuUsage, { type: 'usage', core: 'total' }),
        user: getValue(cpuUsage, { type: 'user', core: 'total' }),
        system: getValue(cpuUsage, { type: 'system', core: 'total' }),
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
      },
      memory: {
        rss: getValue(memoryUsage, { type: 'rss' }),
        heapTotal: getValue(memoryUsage, { type: 'heapTotal' }),
        heapUsed: getValue(memoryUsage, { type: 'heapUsed' }),
        external: getValue(memoryUsage, { type: 'external' }),
        arrayBuffers: getValue(memoryUsage, { type: 'arrayBuffers' }),
        usagePercent: 0
      },
      disk: {
        used: 0,
        free: 0,
        total: 0,
        usagePercent: 0
      },
      network: {
        bytesReceived: 0,
        bytesSent: 0,
        packetsReceived: 0,
        packetsSent: 0
      }
    };
  }

  /**
   * Get application metrics summary
   */
  getApplicationMetrics(): ApplicationMetrics {
    const requestLatency = this.requestLatencyHistogram;
    const latencyMetrics = requestLatency.get();

    return {
      requestLatency: {
        p50: 0,
        p95: 0,
        p99: 0,
        avg: 0
      },
      throughput: {
        requestsPerSecond: 0,
        messagesPerSecond: 0,
        commandsPerSecond: 0
      },
      errorRates: {
        totalErrors: 0,
        errorRate: 0,
        criticalErrors: 0
      }
    };
  }

  /**
   * Get business metrics summary
   */
  async getBusinessMetrics(): Promise<BusinessMetrics> {
    const activeUsersMetric = await this.activeUsersGauge.get();
    const getValue = (metric: any, labels: Record<string, string>): number => {
      const values = metric.values || [];
      const match = values.find((v: any) => {
        return Object.entries(labels).every(([k, v]) => v.metric[k] === v);
      });
      return match?.value || 0;
    };

    const activeUsers = getValue(activeUsersMetric, { period: '1m' });

    return {
      activeUsers,
      messagesProcessed: 0,
      commandsExecuted: 0,
      featuresUsed: {}
    };
  }

  /**
   * Get database metrics summary
   */
  getDatabaseMetrics(): DatabaseMetrics {
    return {
      queryPerformance: {
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        slowQueries: 0
      },
      connectionPool: {
        active: 0,
        idle: 0,
        waiting: 0,
        max: 0
      },
      cacheHitRate: {
        hits: 0,
        misses: 0,
        hitRate: 0
      }
    };
  }

  /**
   * Get API metrics summary
   */
  getApiMetrics(): ApiMetrics {
    return {
      endpointPerformance: {},
      rateLimiting: {
        blocked: 0,
        allowed: 0,
        blockRate: 0
      },
      authentication: {
        successes: 0,
        failures: 0,
        failureRate: 0
      }
    };
  }

  /**
   * Get error tracking metrics summary
   */
  getErrorTrackingMetrics(): ErrorTrackingMetrics {
    return {
      errorsByType: {},
      errorsBySeverity: {},
      errorsByComponent: {},
      totalErrors: 0
    };
  }

  /**
   * Get the Prometheus registry
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Get metrics configuration
   */
  getConfig(): MetricsCollectorConfig {
    return { ...this.config };
  }

  /**
   * Update metrics configuration
   */
  updateConfig(config: Partial<MetricsCollectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Metrics configuration updated');
  }
}

/**
 * Create a singleton instance of the metrics collector
 */
let metricsCollectorInstance: MetricsCollector | null = null;

/**
 * Get or create the metrics collector instance
 */
export function getMetricsCollector(config?: Partial<MetricsCollectorConfig>): MetricsCollector {
  if (!metricsCollectorInstance) {
    metricsCollectorInstance = new MetricsCollector(config);
  }
  return metricsCollectorInstance;
}

/**
 * Reset the metrics collector instance (mainly for testing)
 */
export function resetMetricsCollector(): void {
  if (metricsCollectorInstance) {
    metricsCollectorInstance.stop();
    metricsCollectorInstance = null;
  }
}
