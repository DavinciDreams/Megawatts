/**
 * Self-Editing Monitoring System
 * 
 * Main export file for all monitoring-related modules.
 * Provides comprehensive health, performance, metrics, and anomaly detection.
 */

// Health monitor
export {
  HealthMonitor,
  getHealthMonitor,
  DEFAULT_HEALTH_CHECK_CONFIG,
  HealthCheckConfig,
} from './health-monitor.js';

export type {
  HealthStatus,
  ComponentHealth,
  SystemHealth,
} from './health-monitor.js';

// Performance tracker
export {
  PerformanceTracker,
  getPerformanceTracker,
  DEFAULT_PERFORMANCE_TRACKER_CONFIG,
  PerformanceTrackerConfig,
  MetricType,
} from './performance-tracker.js';

export type {
  PerformanceMetric,
  PerformanceSummary,
  PerformanceComparison,
} from './performance-tracker.js';

// Metrics collector
export {
  MetricsCollector,
  getMetricsCollector,
  DEFAULT_METRICS_COLLECTOR_CONFIG,
  MetricsCollectorConfig,
  MetricSource,
} from './metrics-collector.js';

export type {
  MetricData,
  AggregatedMetric,
} from './metrics-collector.js';

// Anomaly detector
export {
  AnomalyDetector,
  getAnomalyDetector,
  DEFAULT_ANOMALY_DETECTOR_CONFIG,
  AnomalyDetectorConfig,
  AnomalyType,
  AnomalySeverity,
} from './anomaly-detector.js';

export type {
  Anomaly,
} from './anomaly-detector.js';

/**
 * Monitoring system initialization
 */
export class MonitoringSystem {
  private static instance: MonitoringSystem | null = null;

  private constructor() {}

  static getInstance(): MonitoringSystem {
    if (!MonitoringSystem.instance) {
      MonitoringSystem.instance = new MonitoringSystem();
    }
    return MonitoringSystem.instance;
  }

  /**
   * Initialize the monitoring system
   */
  initialize(
    healthConfig?: any,
    performanceConfig?: any,
    metricsConfig?: any,
    anomalyConfig?: any
  ): void {
    // Initialize health monitor
    const healthMonitor = getHealthMonitor(healthConfig);
    healthMonitor.start();

    // Initialize performance tracker
    const performanceTracker = getPerformanceTracker(performanceConfig);
    performanceTracker.start();

    // Initialize metrics collector
    const metricsCollector = getMetricsCollector(metricsConfig);
    metricsCollector.start();

    // Initialize anomaly detector
    const anomalyDetector = getAnomalyDetector(anomalyConfig);

    // Set up event listeners
    this.setupEventListeners(healthMonitor, performanceTracker, metricsCollector, anomalyDetector);
  }

  /**
   * Set up event listeners between monitoring components
   */
  private setupEventListeners(
    healthMonitor: any,
    performanceTracker: any,
    metricsCollector: any,
    anomalyDetector: any
  ): void {
    // Forward health check events
    healthMonitor.on('healthCheck', (health: any) => {
      // Record health metrics
      metricsCollector.collectSelfEditing('system_health', health.status === 'healthy' ? 1 : 0, {
        component: 'system',
        error_count: health.errorCount,
        uptime: health.uptime,
      });
    });

    // Forward performance alerts
    performanceTracker.on('alert', (alert: any) => {
      // Check for anomalies
      if (alert.type === 'latency') {
        anomalyDetector.analyze('latency', alert.value, 'self-editing', {
          threshold: alert.threshold,
        });
      }
    });

    // Forward metric collection events
    metricsCollector.on('collected', (metric: any) => {
      // Analyze for anomalies
      anomalyDetector.analyze(metric.name, metric.value, metric.source, metric.tags);
    });
  }

  /**
   * Get health monitor
   */
  getHealthMonitor(): any {
    return getHealthMonitor();
  }

  /**
   * Get performance tracker
   */
  getPerformanceTracker(): any {
    return getPerformanceTracker();
  }

  /**
   * Get metrics collector
   */
  getMetricsCollector(): any {
    return getMetricsCollector();
  }

  /**
   * Get anomaly detector
   */
  getAnomalyDetector(): any {
    return getAnomalyDetector();
  }

  /**
   * Get complete monitoring snapshot
   */
  getMonitoringSnapshot(): any {
    return {
      health: this.getHealthMonitor().getSystemHealth(),
      performance: this.getPerformanceTracker().getAllSummaries(),
      metrics: this.getMetricsCollector().getAggregatedMetrics(),
      anomalies: this.getAnomalyDetector().getAnomalies(),
    };
  }

  /**
   * Stop all monitoring
   */
  stop(): void {
    this.getHealthMonitor().stop();
    this.getPerformanceTracker().stop();
    this.getMetricsCollector().stop();
  }
}

/**
 * Get the monitoring system instance
 */
export function getMonitoringSystem(): MonitoringSystem {
  return MonitoringSystem.getInstance();
}
