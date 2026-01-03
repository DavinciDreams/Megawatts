/**
 * Monitoring System - Comprehensive monitoring and observability
 *
 * This module provides a complete monitoring solution including:
 * - Metrics collection (Prometheus-based)
 * - Health monitoring (component and dependency checks)
 * - Anomaly detection (statistical and ML-based)
 * - Alert management (rules and notifications)
 *
 * @module monitoring
 */

// Export metrics collector
export {
  MetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
  MetricType,
  PerformanceCategory,
  ApplicationCategory,
  BusinessCategory,
  DatabaseCategory,
  ApiCategory,
  ErrorCategory,
  type MetricsCollectorConfig,
  type MetricDefinition,
  type AggregatedMetric,
  type PerformanceMetrics,
  type ApplicationMetrics,
  type BusinessMetrics,
  type DatabaseMetrics,
  type ApiMetrics,
  type ErrorTrackingMetrics
} from './metricsCollector';

// Export health monitor
export {
  HealthMonitor,
  getHealthMonitor,
  resetHealthMonitor,
  type HealthMonitorConfig,
  type HealthScoreWeights,
  type HealthHistoryEntry,
  type DependencyHealth,
  type ComponentHealth,
  type AggregatedHealth,
  type RecoveryAction
} from './healthMonitor';

// Export anomaly detector
export {
  AnomalyDetector,
  getAnomalyDetector,
  resetAnomalyDetector,
  AnomalySeverity,
  AnomalyType,
  AnomalyClassification,
  type AnomalyDetectorConfig,
  type DataPoint,
  type BaselineStatistics,
  type AnomalyDetectionResult,
  type AnomalyAlert,
  type RootCauseAnalysis,
  type BehavioralBaseline,
  type Pattern,
  type Seasonality,
  type Trend
} from './anomalyDetector';

// Export alert manager
export {
  AlertManager,
  getAlertManager,
  resetAlertManager,
  AlertSeverity,
  AlertStatus,
  NotificationChannel,
  AlertRuleType,
  type AlertManagerConfig,
  type AlertRule,
  type AlertCondition,
  type EscalationPolicy,
  type EscalationLevel,
  type Alert,
  type AlertMetric,
  type Notification,
  type EmailConfig,
  type SlackConfig,
  type DiscordConfig,
  type PagerDutyConfig,
  type WebhookConfig
} from './alertManager';

// Re-export health types from core
export {
  HealthStatus,
  CheckType,
  type HealthCheckResult,
  type HealthCheckOptions,
  type HealthCheck,
  type SystemHealth,
  type HealthEndpointConfig,
  type HealthMonitorConfig as CoreHealthMonitorConfig,
  type HealthMetrics,
  type HealthAlert
} from '../core/health/types';

/**
 * Monitoring system configuration
 */
export interface MonitoringSystemConfig {
  metrics?: Partial<import('./metricsCollector').MetricsCollectorConfig>;
  health?: Partial<import('./healthMonitor').HealthMonitorConfig>;
  anomaly?: Partial<import('./anomalyDetector').AnomalyDetectorConfig>;
  alerts?: Partial<import('./alertManager').AlertManagerConfig>;
}

/**
 * Monitoring system instance
 */
export interface MonitoringSystem {
  metrics: import('./metricsCollector').MetricsCollector;
  health: import('./healthMonitor').HealthMonitor;
  anomaly: import('./anomalyDetector').AnomalyDetector;
  alerts: import('./alertManager').AlertManager;
}

/**
 * Create a complete monitoring system
 *
 * @param config - Configuration for all monitoring components
 * @returns Monitoring system instance
 *
 * @example
 * ```typescript
 * const monitoring = createMonitoringSystem({
 *   metrics: { enabled: true, interval: 60000 },
 *   health: { enabled: true, checkInterval: 30000 },
 *   anomaly: { enabled: true, mlEnabled: true },
 *   alerts: { enabled: true, evaluationInterval: 60000 }
 * });
 *
 * await monitoring.start();
 * ```
 */
export function createMonitoringSystem(
  config?: MonitoringSystemConfig
): MonitoringSystem {
  const {
    getMetricsCollector
  } = require('./metricsCollector');
  const {
    getHealthMonitor
  } = require('./healthMonitor');
  const {
    getAnomalyDetector
  } = require('./anomalyDetector');
  const {
    getAlertManager
  } = require('./alertManager');

  const metrics = getMetricsCollector(config?.metrics);
  const health = getHealthMonitor(config?.health);
  const anomaly = getAnomalyDetector(config?.anomaly);
  const alerts = getAlertManager(config?.alerts);

  return {
    metrics,
    health,
    anomaly,
    alerts
  };
}

/**
 * Start the complete monitoring system
 *
 * @param monitoring - Monitoring system instance
 * @returns Promise that resolves when all components are started
 */
export async function startMonitoringSystem(
  monitoring: MonitoringSystem
): Promise<void> {
  await Promise.all([
    monitoring.metrics.start(),
    monitoring.health.start(),
    monitoring.alerts.start()
  ]);

  // Anomaly detector doesn't have a start method, it's event-driven
}

/**
 * Stop the complete monitoring system
 *
 * @param monitoring - Monitoring system instance
 */
export function stopMonitoringSystem(monitoring: MonitoringSystem): void {
  monitoring.metrics.stop();
  monitoring.health.stop();
  monitoring.alerts.stop();
}

/**
 * Reset the complete monitoring system
 *
 * @param monitoring - Monitoring system instance
 */
export function resetMonitoringSystem(monitoring: MonitoringSystem): void {
  monitoring.metrics.stop();
  monitoring.health.stop();
  monitoring.alerts.stop();

  const {
    resetMetricsCollector
  } = require('./metricsCollector');
  const {
    resetHealthMonitor
  } = require('./healthMonitor');
  const {
    resetAnomalyDetector
  } = require('./anomalyDetector');
  const {
    resetAlertManager
  } = require('./alertManager');

  resetMetricsCollector();
  resetHealthMonitor();
  resetAnomalyDetector();
  resetAlertManager();
}

/**
 * Get monitoring system status
 *
 * @param monitoring - Monitoring system instance
 * @returns Object containing status of all components
 */
export function getMonitoringSystemStatus(monitoring: MonitoringSystem): {
  metrics: { running: boolean; uptime: number };
  health: { running: boolean; uptime: number; status: any };
  anomaly: { running: boolean; uptime: number };
  alerts: { running: boolean; uptime: number };
} {
  return {
    metrics: {
      running: monitoring.metrics.getConfig().enabled,
      uptime: Date.now() - monitoring.metrics['startTime'].getTime()
    },
    health: {
      running: monitoring.health.getConfig().enabled,
      uptime: monitoring.health.getUptime(),
      status: monitoring.health.getCurrentHealth()
    },
    anomaly: {
      running: monitoring.anomaly.getConfig().enabled,
      uptime: monitoring.anomaly.getUptime()
    },
    alerts: {
      running: monitoring.alerts.getConfig().enabled,
      uptime: monitoring.alerts.getUptime()
    }
  };
}

/**
 * Create default monitoring configuration
 *
 * @returns Default configuration for all monitoring components
 */
export function createDefaultMonitoringConfig(): MonitoringSystemConfig {
  return {
    metrics: {
      enabled: true,
      interval: 60000,
      retention: 30,
      aggregation: true,
      collectDefaultMetrics: true
    },
    health: {
      enabled: true,
      checkInterval: 30000,
      alertThreshold: 0.7,
      metricsRetention: 10080,
      recoveryEnabled: true,
      recoveryAttempts: 3,
      recoveryDelay: 5000
    },
    anomaly: {
      enabled: true,
      baselineWindow: 100,
      detectionThreshold: 3,
      alertThreshold: 0.8,
      mlEnabled: true,
      mlModelType: 'isolation_forest',
      statisticalEnabled: true,
      realTimeAlerting: true,
      historyRetention: 10080
    },
    alerts: {
      enabled: true,
      evaluationInterval: 60000,
      historyRetention: 10080,
      maxRetries: 3,
      retryDelay: 30000,
      defaultChannels: ['console' as any]
    }
  };
}

/**
 * Get comprehensive monitoring summary
 *
 * @param monitoring - Monitoring system instance
 * @returns Object containing comprehensive monitoring summary
 */
export async function getMonitoringSummary(
  monitoring: MonitoringSystem
): Promise<{
    metrics: import('./metricsCollector').PerformanceMetrics;
    health: import('./healthMonitor').AggregatedHealth | null;
    anomaly: {
      baselines: Map<string, import('./anomalyDetector').BehavioralBaseline>;
      alerts: import('./anomalyDetector').AnomalyAlert[];
    };
    alerts: {
      active: import('./alertManager').Alert[];
      history: import('./alertManager').Alert[];
    };
    uptime: {
      metrics: number;
      health: number;
      anomaly: number;
      alerts: number;
    };
  }> {
  const performanceMetrics = await monitoring.metrics.getPerformanceMetrics();
  const currentHealth = monitoring.health.getCurrentHealth();
  const allBaselines = monitoring.anomaly.getAllBaselines();
  const anomalyAlerts = monitoring.anomaly.getAnomalyHistory();
  const activeAlerts = monitoring.alerts.getActiveAlerts();
  const alertHistory = monitoring.alerts.getAlertHistory();

  return {
    metrics: performanceMetrics,
    health: currentHealth,
    anomaly: {
      baselines: allBaselines,
      alerts: anomalyAlerts
    },
    alerts: {
      active: activeAlerts,
      history: alertHistory
    },
    uptime: {
      metrics: Date.now() - monitoring.metrics['startTime'].getTime(),
      health: monitoring.health.getUptime(),
      anomaly: monitoring.anomaly.getUptime(),
      alerts: monitoring.alerts.getUptime()
    }
  };
}

/**
 * Create monitoring health check for the monitoring system itself
 *
 * @param monitoring - Monitoring system instance
 * @returns Health check result
 */
export async function createMonitoringHealthCheck(
  monitoring: MonitoringSystem
): Promise<import('../core/health/types').HealthCheckResult> {
  const { HealthStatus, CheckType } = require('../core/health/types');

  const startTime = Date.now();
  const checks = [];

  // Check metrics collector
  const metricsConfig = monitoring.metrics.getConfig();
  if (!metricsConfig.enabled) {
    checks.push('Metrics collector disabled');
  }

  // Check health monitor
  const healthConfig = monitoring.health.getConfig();
  if (!healthConfig.enabled) {
    checks.push('Health monitor disabled');
  }

  // Check anomaly detector
  const anomalyConfig = monitoring.anomaly.getConfig();
  if (!anomalyConfig.enabled) {
    checks.push('Anomaly detector disabled');
  }

  // Check alert manager
  const alertsConfig = monitoring.alerts.getConfig();
  if (!alertsConfig.enabled) {
    checks.push('Alert manager disabled');
  }

  const responseTime = Date.now() - startTime;

  if (checks.length === 0) {
    return {
      status: HealthStatus.HEALTHY,
      checkType: CheckType.CUSTOM,
      name: 'monitoring_system',
      message: 'All monitoring components healthy',
      responseTime,
      timestamp: new Date()
    };
  }

  return {
    status: HealthStatus.DEGRADED,
    checkType: CheckType.CUSTOM,
    name: 'monitoring_system',
    message: `Monitoring system issues: ${checks.join(', ')}`,
    responseTime,
    timestamp: new Date(),
    details: { issues: checks }
  };
}

/**
 * Export monitoring metrics for Prometheus
 *
 * @param monitoring - Monitoring system instance
 * @returns Prometheus metrics string
 */
export async function exportMonitoringMetrics(
  monitoring: MonitoringSystem
): Promise<string> {
  return await monitoring.metrics.getMetrics();
}

/**
 * Get Grafana dashboard configuration
 *
 * @returns JSON configuration for Grafana dashboard
 */
export function getGrafanaDashboardConfig(): string {
  return JSON.stringify({
    dashboard: {
      title: 'Megawatts Monitoring',
      panels: [
        {
          title: 'System Health',
          type: 'stat',
          targets: [
            {
              expr: 'megawatts_health_score'
            }
          ]
        },
        {
          title: 'CPU Usage',
          type: 'graph',
          targets: [
            {
              expr: 'megawatts_cpu_usage_percent'
            }
          ]
        },
        {
          title: 'Memory Usage',
          type: 'graph',
          targets: [
            {
              expr: 'megawatts_memory_usage_bytes'
            }
          ]
        },
        {
          title: 'Request Rate',
          type: 'graph',
          targets: [
            {
              expr: 'rate(megawatts_requests_total[5m])'
            }
          ]
        },
        {
          title: 'Error Rate',
          type: 'graph',
          targets: [
            {
              expr: 'rate(megawatts_errors_total[5m])'
            }
          ]
        },
        {
          title: 'Active Users',
          type: 'graph',
          targets: [
            {
              expr: 'megawatts_active_users'
            }
          ]
        },
        {
          title: 'Database Query Latency',
          type: 'graph',
          targets: [
            {
              expr: 'megawatts_db_query_duration_seconds'
            }
          ]
        },
        {
          title: 'Cache Hit Rate',
          type: 'graph',
          targets: [
            {
              expr: 'megawatts_cache_hits_total / (megawatts_cache_hits_total + megawatts_cache_misses_total)'
            }
          ]
        }
      ]
    }
  }, null, 2);
}
