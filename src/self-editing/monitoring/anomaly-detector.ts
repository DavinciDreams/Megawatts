/**
 * Anomaly Detector
 * 
 * Detects unusual patterns and anomalies in system behavior.
 * Provides alerts for potential issues and security concerns.
 */

import { EventEmitter } from 'events';
import { getMetricsCollector, MetricSource } from './metrics-collector.js';

/**
 * Anomaly severity levels
 */
export enum AnomalySeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Anomaly types
 */
export enum AnomalyType {
  SPIKE = 'spike',
  DROP = 'drop',
  TREND = 'trend',
  PATTERN = 'pattern',
  OUTLIER = 'outlier',
}

/**
 * Anomaly detection result
 */
export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  metric: string;
  source: MetricSource;
  value: number;
  expected: number;
  deviation: number;
  timestamp: Date;
  message: string;
  tags?: Record<string, string>;
}

/**
 * Anomaly detection configuration
 */
export interface AnomalyDetectorConfig {
  enabled: boolean;
  sensitivity: number; // 0-1, higher is more sensitive
  windowSize: number; // Number of data points to consider
  minDataPoints: number; // Minimum data points before detection
  alertThresholds: {
    spike: number; // Standard deviations
    drop: number; // Standard deviations
    trend: number; // Rate of change
  };
}

/**
 * Default anomaly detection configuration
 */
export const DEFAULT_ANOMALY_DETECTOR_CONFIG: AnomalyDetectorConfig = {
  enabled: true,
  sensitivity: 0.8,
  windowSize: 100,
  minDataPoints: 10,
  alertThresholds: {
    spike: 3, // 3 standard deviations
    drop: 2, // 2 standard deviations
    trend: 0.5, // 50% rate of change
  },
};

/**
 * Anomaly detector
 */
export class AnomalyDetector extends EventEmitter {
  private config: AnomalyDetectorConfig;
  private metricHistory: Map<string, number[]> = new Map();
  private detectedAnomalies: Anomaly[] = [];

  constructor(config: Partial<AnomalyDetectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_ANOMALY_DETECTOR_CONFIG, ...config };
  }

  /**
   * Analyze a metric value for anomalies
   */
  analyze(
    metric: string,
    value: number,
    source: MetricSource,
    tags?: Record<string, string>
  ): Anomaly | null {
    if (!this.config.enabled) {
      return null;
    }

    // Get metric history
    const history = this.metricHistory.get(metric) || [];
    history.push(value);

    // Trim to window size
    if (history.length > this.config.windowSize) {
      history.shift();
    }

    this.metricHistory.set(metric, history);

    // Check if we have enough data points
    if (history.length < this.config.minDataPoints) {
      return null;
    }

    // Perform anomaly detection
    const anomaly = this.detectAnomaly(metric, value, history, source, tags);

    if (anomaly) {
      this.detectedAnomalies.push(anomaly);
      this.emit('anomaly', anomaly);
    }

    return anomaly;
  }

  /**
   * Detect anomaly in metric data
   */
  private detectAnomaly(
    metric: string,
    value: number,
    history: number[],
    source: MetricSource,
    tags?: Record<string, string>
  ): Anomaly | null {
    const stats = this.calculateStatistics(history);
    const stdDev = stats.standardDeviation;
    const mean = stats.mean;

    // Check for spike
    if (value > mean + stdDev * this.config.alertThresholds.spike) {
      return {
        id: this.generateId(),
        type: AnomalyType.SPIKE,
        severity: this.calculateSeverity(value, mean, stdDev),
        metric,
        source,
        value,
        expected: mean,
        deviation: value - mean,
        timestamp: new Date(),
        message: `Spike detected in ${metric}: ${value.toFixed(2)} (expected: ${mean.toFixed(2)})`,
        tags,
      };
    }

    // Check for drop
    if (value < mean - stdDev * this.config.alertThresholds.drop) {
      return {
        id: this.generateId(),
        type: AnomalyType.DROP,
        severity: this.calculateSeverity(value, mean, stdDev),
        metric,
        source,
        value,
        expected: mean,
        deviation: value - mean,
        timestamp: new Date(),
        message: `Drop detected in ${metric}: ${value.toFixed(2)} (expected: ${mean.toFixed(2)})`,
        tags,
      };
    }

    // Check for trend
    const recent = history.slice(-10);
    if (recent.length >= 5) {
      const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
      const trendRate = Math.abs((value - recentMean) / recentMean);

      if (trendRate > this.config.alertThresholds.trend) {
        return {
          id: this.generateId(),
          type: AnomalyType.TREND,
          severity: this.calculateSeverity(value, mean, stdDev),
          metric,
          source,
          value,
          expected: mean,
          deviation: value - mean,
          timestamp: new Date(),
          message: `Trend detected in ${metric}: ${value.toFixed(2)} (rate: ${(trendRate * 100).toFixed(2)}%)`,
          tags,
        };
      }
    }

    // Check for outlier using IQR method
    const iqrAnomaly = this.detectOutlierUsingIQR(metric, value, history, source, tags);
    if (iqrAnomaly) {
      return iqrAnomaly;
    }

    return null;
  }

  /**
   * Detect outlier using Interquartile Range (IQR) method
   */
  private detectOutlierUsingIQR(
    metric: string,
    value: number,
    history: number[],
    source: MetricSource,
    tags?: Record<string, string>
  ): Anomaly | null {
    const sorted = [...history].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    if (value < lowerBound || value > upperBound) {
      return {
        id: this.generateId(),
        type: AnomalyType.OUTLIER,
        severity: this.calculateSeverity(value, (q1 + q3) / 2, iqr),
        metric,
        source,
        value,
        expected: (q1 + q3) / 2,
        deviation: value - (q1 + q3) / 2,
        timestamp: new Date(),
        message: `Outlier detected in ${metric}: ${value.toFixed(2)} (range: ${lowerBound.toFixed(2)} - ${upperBound.toFixed(2)})`,
        tags,
      };
    }

    return null;
  }

  /**
   * Calculate statistics from data
   */
  private calculateStatistics(data: number[]): {
    mean: number;
    standardDeviation: number;
  } {
    const n = data.length;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const standardDeviation = Math.sqrt(variance);

    return { mean, standardDeviation };
  }

  /**
   * Calculate anomaly severity
   */
  private calculateSeverity(
    value: number,
    mean: number,
    stdDev: number
  ): AnomalySeverity {
    const deviation = Math.abs(value - mean);
    const zScore = stdDev > 0 ? deviation / stdDev : 0;

    if (zScore > 4) {
      return AnomalySeverity.CRITICAL;
    } else if (zScore > 3) {
      return AnomalySeverity.ERROR;
    } else if (zScore > 2) {
      return AnomalySeverity.WARNING;
    } else {
      return AnomalySeverity.INFO;
    }
  }

  /**
   * Generate unique ID for anomaly
   */
  private generateId(): string {
    return `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get detected anomalies
   */
  getAnomalies(
    metric?: string,
    source?: MetricSource,
    severity?: AnomalySeverity,
    limit?: number
  ): Anomaly[] {
    let anomalies = [...this.detectedAnomalies];

    if (metric) {
      anomalies = anomalies.filter(a => a.metric === metric);
    }

    if (source) {
      anomalies = anomalies.filter(a => a.source === source);
    }

    if (severity) {
      anomalies = anomalies.filter(a => a.severity === severity);
    }

    if (limit) {
      anomalies = anomalies.slice(-limit);
    }

    return anomalies;
  }

  /**
   * Get anomaly statistics
   */
  getAnomalyStats(): {
    total: number;
    byType: Record<AnomalyType, number>;
    bySeverity: Record<AnomalySeverity, number>;
    bySource: Record<MetricSource, number>;
  } {
    const stats = {
      total: this.detectedAnomalies.length,
      byType: {} as Record<AnomalyType, number>,
      bySeverity: {} as Record<AnomalySeverity, number>,
      bySource: {} as Record<MetricSource, number>,
    };

    for (const anomaly of this.detectedAnomalies) {
      stats.byType[anomaly.type] = (stats.byType[anomaly.type] || 0) + 1;
      stats.bySeverity[anomaly.severity] = (stats.bySeverity[anomaly.severity] || 0) + 1;
      stats.bySource[anomaly.source] = (stats.bySource[anomaly.source] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear anomalies
   */
  clearAnomalies(metric?: string, source?: MetricSource): void {
    if (metric && source) {
      this.detectedAnomalies = this.detectedAnomalies.filter(
        a => a.metric !== metric || a.source !== source
      );
    } else if (metric) {
      this.detectedAnomalies = this.detectedAnomalies.filter(a => a.metric !== metric);
    } else if (source) {
      this.detectedAnomalies = this.detectedAnomalies.filter(a => a.source !== source);
    } else {
      this.detectedAnomalies = [];
    }
  }

  /**
   * Clear metric history
   */
  clearHistory(metric?: string): void {
    if (metric) {
      this.metricHistory.delete(metric);
    } else {
      this.metricHistory.clear();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AnomalyDetectorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Singleton instance
let anomalyDetectorInstance: AnomalyDetector | null = null;

export function getAnomalyDetector(config?: Partial<AnomalyDetectorConfig>): AnomalyDetector {
  if (!anomalyDetectorInstance) {
    anomalyDetectorInstance = new AnomalyDetector(config);
  }
  return anomalyDetectorInstance;
}
