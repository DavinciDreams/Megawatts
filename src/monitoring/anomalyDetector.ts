/**
 * Anomaly Detector - Statistical and ML-based anomaly detection
 *
 * This module provides comprehensive anomaly detection including:
 * - Behavioral baseline establishment
 * - Statistical anomaly detection
 * - Machine learning-based detection
 * - Real-time alerting
 * - Anomaly classification
 * - Root cause analysis
 */

import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';

/**
 * Anomaly severity levels
 */
export enum AnomalySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Anomaly types
 */
export enum AnomalyType {
  STATISTICAL = 'statistical',
  BEHAVIORAL = 'behavioral',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  BUSINESS = 'business',
  ML = 'machine_learning'
}

/**
 * Anomaly classification
 */
export enum AnomalyClassification {
  SPIKE = 'spike',
  DIP = 'dip',
  DRIFT = 'drift',
  OUTLIER = 'outlier',
  PATTERN = 'pattern',
  UNKNOWN = 'unknown'
}

/**
 * Anomaly detection configuration
 */
export interface AnomalyDetectorConfig {
  enabled: boolean;
  baselineWindow: number;
  detectionThreshold: number;
  alertThreshold: number;
  mlEnabled: boolean;
  mlModelType: 'isolation_forest' | 'autoencoder' | 'lof';
  statisticalEnabled: boolean;
  realTimeAlerting: boolean;
  historyRetention: number;
}

/**
 * Data point for anomaly detection
 */
export interface DataPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
  metadata?: Record<string, any>;
}

/**
 * Baseline statistics
 */
export interface BaselineStatistics {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  count: number;
  lastUpdated: Date;
}

/**
 * Anomaly detection result
 */
export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  severity: AnomalySeverity;
  type: AnomalyType;
  classification: AnomalyClassification;
  confidence: number;
  timestamp: Date;
  value: number;
  expectedValue: number;
  deviation: number;
  deviationPercent: number;
  labels?: Record<string, string>;
  metadata?: Record<string, any>;
  potentialCauses?: string[];
  recommendedActions?: string[];
}

/**
 * Anomaly alert
 */
export interface AnomalyAlert {
  id: string;
  timestamp: Date;
  severity: AnomalySeverity;
  type: AnomalyType;
  classification: AnomalyClassification;
  metric: string;
  value: number;
  expectedValue: number;
  deviationPercent: number;
  confidence: number;
  resolved: boolean;
  resolvedAt?: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  notes?: string;
}

/**
 * Root cause analysis result
 */
export interface RootCauseAnalysis {
  anomalyId: string;
  timestamp: Date;
  primaryCause: string;
  contributingFactors: string[];
  affectedComponents: string[];
  confidence: number;
  recommendedActions: string[];
  relatedAnomalies: string[];
}

/**
 * Behavioral baseline
 */
export interface BehavioralBaseline {
  metric: string;
  statistics: BaselineStatistics;
  patterns: Pattern[];
  seasonality?: Seasonality;
  trends: Trend[];
  lastUpdated: Date;
}

/**
 * Pattern detected in data
 */
export interface Pattern {
  type: 'periodic' | 'trend' | 'correlation' | 'anomaly';
  description: string;
  confidence: number;
  parameters: Record<string, any>;
}

/**
 * Seasonality information
 */
export interface Seasonality {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  period: number;
  strength: number;
}

/**
 * Trend information
 */
export interface Trend {
  direction: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  confidence: number;
  period: Date;
}

/**
 * Anomaly Detector Class
 *
 * Provides statistical and ML-based anomaly detection
 */
export class AnomalyDetector {
  private logger: Logger;
  private config: AnomalyDetectorConfig;
  private baselines: Map<string, BehavioralBaseline>;
  private dataHistory: Map<string, DataPoint[]>;
  private anomalyHistory: AnomalyAlert[];
  private mlModels: Map<string, any>;
  private alertCallbacks: Map<string, (alert: AnomalyAlert) => void>;
  private startTime: Date;

  constructor(config: Partial<AnomalyDetectorConfig> = {}) {
    this.logger = new Logger('AnomalyDetector');
    this.startTime = new Date();
    this.baselines = new Map();
    this.dataHistory = new Map();
    this.anomalyHistory = [];
    this.mlModels = new Map();
    this.alertCallbacks = new Map();

    this.config = {
      enabled: true,
      baselineWindow: 100, // Number of data points for baseline
      detectionThreshold: 3, // Standard deviations
      alertThreshold: 0.8, // Confidence threshold
      mlEnabled: true,
      mlModelType: 'isolation_forest',
      statisticalEnabled: true,
      realTimeAlerting: true,
      historyRetention: 10080, // 7 days in minutes
      ...config
    };
  }

  /**
   * Add data point for anomaly detection
   */
  async addDataPoint(
    metric: string,
    value: number,
    labels?: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<AnomalyDetectionResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    const dataPoint: DataPoint = {
      timestamp: new Date(),
      value,
      labels,
      metadata
    };

    // Add to history
    if (!this.dataHistory.has(metric)) {
      this.dataHistory.set(metric, []);
    }
    const history = this.dataHistory.get(metric)!;
    history.push(dataPoint);

    // Trim history based on retention
    const maxPoints = Math.floor(
      (this.config.historyRetention * 60) / 5 // Assuming 5-second intervals
    );
    if (history.length > maxPoints) {
      history.splice(0, history.length - maxPoints);
    }

    // Check if we have enough data for baseline
    if (history.length < this.config.baselineWindow) {
      this.logger.debug(
        `Insufficient data for baseline: ${metric} (${history.length}/${this.config.baselineWindow})`
      );
      return null;
    }

    // Update baseline if needed
    await this.updateBaseline(metric);

    // Detect anomalies
    let result: AnomalyDetectionResult | null = null;

    if (this.config.statisticalEnabled) {
      result = this.detectStatisticalAnomaly(metric, dataPoint);
    }

    if (this.config.mlEnabled && (!result || !result.isAnomaly)) {
      result = await this.detectMLAnomaly(metric, dataPoint);
    }

    // Handle anomaly detection
    if (result && result.isAnomaly) {
      await this.handleAnomaly(metric, result);
    }

    return result;
  }

  /**
   * Update baseline for a metric
   */
  private async updateBaseline(metric: string): Promise<void> {
    const history = this.dataHistory.get(metric);
    if (!history || history.length < this.config.baselineWindow) {
      return;
    }

    const baseline = this.calculateBaselineStatistics(metric);
    const patterns = this.detectPatterns(history);

    const behavioralBaseline: BehavioralBaseline = {
      metric,
      statistics: baseline,
      patterns,
      trends: this.detectTrends(history),
      lastUpdated: new Date()
    };

    this.baselines.set(metric, behavioralBaseline);
    this.logger.debug(`Baseline updated for metric: ${metric}`);
  }

  /**
   * Calculate baseline statistics
   */
  private calculateBaselineStatistics(metric: string): BaselineStatistics {
    const history = this.dataHistory.get(metric);
    if (!history || history.length === 0) {
      throw new BotError(`No data available for metric: ${metric}`, 'medium');
    }

    const values = history.map(d => d.value).sort((a, b) => a - b);
    const n = values.length;

    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const median = n % 2 === 0
      ? (values[n / 2 - 1] + values[n / 2]) / 2
      : values[Math.floor(n / 2)];

    return {
      mean,
      median,
      stdDev,
      min: values[0],
      max: values[n - 1],
      p25: values[Math.floor(n * 0.25)],
      p75: values[Math.floor(n * 0.75)],
      p90: values[Math.floor(n * 0.90)],
      p95: values[Math.floor(n * 0.95)],
      p99: values[Math.floor(n * 0.99)],
      count: n,
      lastUpdated: new Date()
    };
  }

  /**
   * Detect statistical anomaly
   */
  private detectStatisticalAnomaly(
    metric: string,
    dataPoint: DataPoint
  ): AnomalyDetectionResult | null {
    const baseline = this.baselines.get(metric);
    if (!baseline) {
      return null;
    }

    const { statistics } = baseline;
    const zScore = Math.abs((dataPoint.value - statistics.mean) / statistics.stdDev);

    const isAnomaly = zScore > this.config.detectionThreshold;
    const deviation = Math.abs(dataPoint.value - statistics.mean);
    const deviationPercent = (deviation / statistics.mean) * 100;

    if (!isAnomaly) {
      return {
        isAnomaly: false,
        severity: AnomalySeverity.LOW,
        type: AnomalyType.STATISTICAL,
        classification: AnomalyClassification.UNKNOWN,
        confidence: 0,
        timestamp: dataPoint.timestamp,
        value: dataPoint.value,
        expectedValue: statistics.mean,
        deviation,
        deviationPercent,
        labels: dataPoint.labels,
        metadata: dataPoint.metadata
      };
    }

    // Determine severity and classification
    const severity = this.determineSeverity(zScore);
    const classification = this.classifyAnomaly(dataPoint.value, statistics);

    return {
      isAnomaly: true,
      severity,
      type: AnomalyType.STATISTICAL,
      classification,
      confidence: Math.min(1, zScore / this.config.detectionThreshold),
      timestamp: dataPoint.timestamp,
      value: dataPoint.value,
      expectedValue: statistics.mean,
      deviation,
      deviationPercent,
      labels: dataPoint.labels,
      metadata: dataPoint.metadata,
      potentialCauses: this.identifyPotentialCauses(classification, metric),
      recommendedActions: this.getRecommendedActions(classification, severity)
    };
  }

  /**
   * Detect ML-based anomaly
   */
  private async detectMLAnomaly(
    metric: string,
    dataPoint: DataPoint
  ): Promise<AnomalyDetectionResult | null> {
    const history = this.dataHistory.get(metric);
    if (!history || history.length < this.config.baselineWindow) {
      return null;
    }

    // Simple ML-based anomaly detection using isolation forest concept
    // In production, this would use a proper ML library
    const anomalyScore = this.calculateIsolationScore(history, dataPoint);

    const isAnomaly = anomalyScore > (1 - this.config.alertThreshold);
    const baseline = this.baselines.get(metric);
    const expectedValue = baseline?.statistics.mean || 0;
    const deviation = Math.abs(dataPoint.value - expectedValue);
    const deviationPercent = expectedValue > 0 ? (deviation / expectedValue) * 100 : 0;

    if (!isAnomaly) {
      return {
        isAnomaly: false,
        severity: AnomalySeverity.LOW,
        type: AnomalyType.ML,
        classification: AnomalyClassification.UNKNOWN,
        confidence: anomalyScore,
        timestamp: dataPoint.timestamp,
        value: dataPoint.value,
        expectedValue,
        deviation,
        deviationPercent,
        labels: dataPoint.labels,
        metadata: dataPoint.metadata
      };
    }

    const severity = this.determineSeverityFromScore(anomalyScore);
    const classification = this.classifyAnomaly(dataPoint.value, baseline?.statistics);

    return {
      isAnomaly: true,
      severity,
      type: AnomalyType.ML,
      classification,
      confidence: anomalyScore,
      timestamp: dataPoint.timestamp,
      value: dataPoint.value,
      expectedValue,
      deviation,
      deviationPercent,
      labels: dataPoint.labels,
      metadata: dataPoint.metadata,
      potentialCauses: this.identifyPotentialCauses(classification, metric),
      recommendedActions: this.getRecommendedActions(classification, severity)
    };
  }

  /**
   * Calculate isolation score (simplified isolation forest)
   */
  private calculateIsolationScore(history: DataPoint[], dataPoint: DataPoint): number {
    const values = history.map(d => d.value);
    const k = Math.min(5, values.length - 1);

    // Calculate average distance to k nearest neighbors
    const distances = values
      .map(v => Math.abs(v - dataPoint.value))
      .sort((a, b) => a - b)
      .slice(0, k);

    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

    // Normalize to 0-1 range
    const maxDistance = Math.max(...values.map(v => Math.abs(v - dataPoint.value)));
    return avgDistance / (maxDistance || 1);
  }

  /**
   * Detect patterns in data
   */
  private detectPatterns(history: DataPoint[]): Pattern[] {
    const patterns: Pattern[] = [];

    // Check for periodic patterns
    const periodicPattern = this.detectPeriodicPattern(history);
    if (periodicPattern) {
      patterns.push(periodicPattern);
    }

    // Check for correlation patterns
    const correlationPattern = this.detectCorrelationPattern(history);
    if (correlationPattern) {
      patterns.push(correlationPattern);
    }

    return patterns;
  }

  /**
   * Detect periodic pattern
   */
  private detectPeriodicPattern(history: DataPoint[]): Pattern | null {
    const values = history.map(d => d.value);
    const n = values.length;

    if (n < 20) return null;

    // Simple autocorrelation check
    const maxLag = Math.min(20, Math.floor(n / 2));
    let maxCorrelation = 0;
    let bestLag = 0;

    for (let lag = 1; lag <= maxLag; lag++) {
      let correlation = 0;
      for (let i = 0; i < n - lag; i++) {
        correlation += values[i] * values[i + lag];
      }
      correlation /= (n - lag);

      if (Math.abs(correlation) > maxCorrelation) {
        maxCorrelation = Math.abs(correlation);
        bestLag = lag;
      }
    }

    if (maxCorrelation > 0.5) {
      return {
        type: 'periodic',
        description: `Periodic pattern detected with lag ${bestLag}`,
        confidence: Math.min(1, maxCorrelation),
        parameters: { lag: bestLag, correlation: maxCorrelation }
      };
    }

    return null;
  }

  /**
   * Detect correlation pattern
   */
  private detectCorrelationPattern(history: DataPoint[]): Pattern | null {
    // Simplified correlation detection
    // In production, this would analyze multiple metrics together
    return null;
  }

  /**
   * Detect trends in data
   */
  private detectTrends(history: DataPoint[]): Trend[] {
    const values = history.map(d => d.value);
    const n = values.length;

    if (n < 10) return [];

    // Linear regression
    const sumX = values.reduce((a, _, i) => a + i, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((a, y, i) => a + i * y, 0);
    const sumX2 = values.reduce((a, _, i) => a + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const confidence = Math.abs(slope) / (Math.max(...values) - Math.min(...values) || 1);

    let direction: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(slope) < 0.01) {
      direction = 'stable';
    } else if (slope > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    return [{
      direction,
      slope,
      confidence: Math.min(1, confidence),
      period: new Date()
    }];
  }

  /**
   * Determine anomaly severity from z-score
   */
  private determineSeverity(zScore: number): AnomalySeverity {
    if (zScore >= 5) {
      return AnomalySeverity.CRITICAL;
    } else if (zScore >= 4) {
      return AnomalySeverity.HIGH;
    } else if (zScore >= 3) {
      return AnomalySeverity.MEDIUM;
    } else {
      return AnomalySeverity.LOW;
    }
  }

  /**
   * Determine anomaly severity from score
   */
  private determineSeverityFromScore(score: number): AnomalySeverity {
    if (score >= 0.95) {
      return AnomalySeverity.CRITICAL;
    } else if (score >= 0.8) {
      return AnomalySeverity.HIGH;
    } else if (score >= 0.6) {
      return AnomalySeverity.MEDIUM;
    } else {
      return AnomalySeverity.LOW;
    }
  }

  /**
   * Classify anomaly type
   */
  private classifyAnomaly(
    value: number,
    statistics?: BaselineStatistics
  ): AnomalyClassification {
    if (!statistics) {
      return AnomalyClassification.UNKNOWN;
    }

    const mean = statistics.mean;
    const stdDev = statistics.stdDev;

    if (value > mean + 3 * stdDev) {
      return AnomalyClassification.SPIKE;
    } else if (value < mean - 3 * stdDev) {
      return AnomalyClassification.DIP;
    } else if (Math.abs(value - mean) > 2 * stdDev) {
      return AnomalyClassification.OUTLIER;
    } else {
      return AnomalyClassification.DRIFT;
    }
  }

  /**
   * Identify potential causes of anomaly
   */
  private identifyPotentialCauses(
    classification: AnomalyClassification,
    metric: string
  ): string[] {
    const causes: string[] = [];

    switch (classification) {
      case AnomalyClassification.SPIKE:
        causes.push(
          'Sudden increase in load or traffic',
          'Resource exhaustion',
          'External dependency failure',
          'Configuration change'
        );
        break;
      case AnomalyClassification.DIP:
        causes.push(
          'Service degradation',
          'Network connectivity issues',
          'Database performance issues',
          'Resource contention'
        );
        break;
      case AnomalyClassification.DRIFT:
        causes.push(
          'Gradual performance degradation',
          'Memory leak',
          'Connection pool exhaustion',
          'Cache warming up'
        );
        break;
      case AnomalyClassification.OUTLIER:
        causes.push(
          'Data quality issue',
          'Measurement error',
          'Edge case scenario',
          'Unexpected input'
        );
        break;
    }

    return causes;
  }

  /**
   * Get recommended actions for anomaly
   */
  private getRecommendedActions(
    classification: AnomalyClassification,
    severity: AnomalySeverity
  ): string[] {
    const actions: string[] = [];

    switch (classification) {
      case AnomalyClassification.SPIKE:
        actions.push(
          'Check system resources',
          'Review recent changes',
          'Scale up resources if needed',
          'Investigate external dependencies'
        );
        break;
      case AnomalyClassification.DIP:
        actions.push(
          'Check service health',
          'Review error logs',
          'Verify network connectivity',
          'Restart affected services'
        );
        break;
      case AnomalyClassification.DRIFT:
        actions.push(
          'Monitor trend closely',
          'Plan capacity adjustments',
          'Review application logs',
          'Check for memory leaks'
        );
        break;
      case AnomalyClassification.OUTLIER:
        actions.push(
          'Verify data quality',
          'Check measurement accuracy',
          'Review edge case handling',
          'Investigate unexpected inputs'
        );
        break;
    }

    if (severity === AnomalySeverity.CRITICAL) {
      actions.unshift('Escalate to operations team immediately');
    } else if (severity === AnomalySeverity.HIGH) {
      actions.unshift('Notify on-call engineer');
    }

    return actions;
  }

  /**
   * Handle detected anomaly
   */
  private async handleAnomaly(
    metric: string,
    result: AnomalyDetectionResult
  ): Promise<void> {
    // Create alert
    const alert: AnomalyAlert = {
      id: this.generateAlertId(),
      timestamp: result.timestamp,
      severity: result.severity,
      type: result.type,
      classification: result.classification,
      metric,
      value: result.value,
      expectedValue: result.expectedValue,
      deviationPercent: result.deviationPercent,
      confidence: result.confidence,
      resolved: false,
      acknowledged: false
    };

    this.anomalyHistory.push(alert);

    // Trim history
    const maxAlerts = Math.floor(this.config.historyRetention * 60 / 5);
    if (this.anomalyHistory.length > maxAlerts) {
      this.anomalyHistory.splice(0, this.anomalyHistory.length - maxAlerts);
    }

    // Log anomaly
    this.logger.warn(
      `Anomaly detected for ${metric}: ${result.classification} ` +
      `(severity: ${result.severity}, confidence: ${(result.confidence * 100).toFixed(1)}%)`
    );

    // Trigger real-time alerts if enabled
    if (this.config.realTimeAlerting) {
      await this.triggerAlertCallbacks(alert);
    }

    // Perform root cause analysis
    if (result.severity === AnomalySeverity.HIGH || result.severity === AnomalySeverity.CRITICAL) {
      await this.performRootCauseAnalysis(alert);
    }
  }

  /**
   * Trigger alert callbacks
   */
  private async triggerAlertCallbacks(alert: AnomalyAlert): Promise<void> {
    for (const [id, callback] of this.alertCallbacks) {
      try {
        await callback(alert);
      } catch (error) {
        this.logger.error(`Alert callback failed for ${id}:`, error);
      }
    }
  }

  /**
   * Perform root cause analysis
   */
  private async performRootCauseAnalysis(alert: AnomalyAlert): Promise<void> {
    const relatedAnomalies = this.anomalyHistory
      .filter(a =>
        !a.resolved &&
        a.timestamp > new Date(Date.now() - 3600000) // Last hour
      )
      .map(a => a.id);

    const analysis: RootCauseAnalysis = {
      anomalyId: alert.id,
      timestamp: new Date(),
      primaryCause: this.identifyPrimaryCause(alert),
      contributingFactors: this.identifyContributingFactors(alert),
      affectedComponents: [alert.metric],
      confidence: alert.confidence,
      recommendedActions: this.getRecommendedActions(alert.classification, alert.severity),
      relatedAnomalies
    };

    this.logger.info(`Root cause analysis completed for anomaly ${alert.id}`);
  }

  /**
   * Identify primary cause of anomaly
   */
  private identifyPrimaryCause(alert: AnomalyAlert): string {
    // Simplified root cause identification
    // In production, this would use more sophisticated analysis
    return `Anomalous ${alert.classification} detected in ${alert.metric}`;
  }

  /**
   * Identify contributing factors
   */
  private identifyContributingFactors(alert: AnomalyAlert): string[] {
    return [
      `Deviation of ${alert.deviationPercent.toFixed(1)}% from baseline`,
      `Confidence score of ${(alert.confidence * 100).toFixed(1)}%`,
      `Severity level: ${alert.severity}`
    ];
  }

  /**
   * Register alert callback
   */
  registerAlertCallback(id: string, callback: (alert: AnomalyAlert) => void): void {
    this.alertCallbacks.set(id, callback);
    this.logger.info(`Registered alert callback: ${id}`);
  }

  /**
   * Unregister alert callback
   */
  unregisterAlertCallback(id: string): void {
    this.alertCallbacks.delete(id);
    this.logger.info(`Unregistered alert callback: ${id}`);
  }

  /**
   * Acknowledge anomaly alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string, notes?: string): boolean {
    const alert = this.anomalyHistory.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.notes = notes;

    this.logger.info(`Alert ${alertId} acknowledged by ${acknowledgedBy}`);
    return true;
  }

  /**
   * Resolve anomaly alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.anomalyHistory.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();

    this.logger.info(`Alert ${alertId} resolved`);
    return true;
  }

  /**
   * Get baseline for metric
   */
  getBaseline(metric: string): BehavioralBaseline | undefined {
    return this.baselines.get(metric);
  }

  /**
   * Get all baselines
   */
  getAllBaselines(): Map<string, BehavioralBaseline> {
    return new Map(this.baselines);
  }

  /**
   * Get anomaly history
   */
  getAnomalyHistory(limit?: number): AnomalyAlert[] {
    if (limit) {
      return this.anomalyHistory.slice(-limit);
    }
    return [...this.anomalyHistory];
  }

  /**
   * Get unresolved alerts
   */
  getUnresolvedAlerts(): AnomalyAlert[] {
    return this.anomalyHistory.filter(a => !a.resolved);
  }

  /**
   * Get acknowledged alerts
   */
  getAcknowledgedAlerts(): AnomalyAlert[] {
    return this.anomalyHistory.filter(a => a.acknowledged);
  }

  /**
   * Clear anomaly history
   */
  clearHistory(): void {
    this.anomalyHistory = [];
    this.logger.info('Anomaly history cleared');
  }

  /**
   * Reset baseline for metric
   */
  resetBaseline(metric: string): void {
    this.baselines.delete(metric);
    this.dataHistory.delete(metric);
    this.logger.info(`Baseline reset for metric: ${metric}`);
  }

  /**
   * Reset all baselines
   */
  resetAllBaselines(): void {
    this.baselines.clear();
    this.dataHistory.clear();
    this.logger.info('All baselines reset');
  }

  /**
   * Get configuration
   */
  getConfig(): AnomalyDetectorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AnomalyDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Anomaly detector configuration updated');
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }
}

/**
 * Create a singleton instance of anomaly detector
 */
let anomalyDetectorInstance: AnomalyDetector | null = null;

/**
 * Get or create anomaly detector instance
 */
export function getAnomalyDetector(config?: Partial<AnomalyDetectorConfig>): AnomalyDetector {
  if (!anomalyDetectorInstance) {
    anomalyDetectorInstance = new AnomalyDetector(config);
  }
  return anomalyDetectorInstance;
}

/**
 * Reset anomaly detector instance (mainly for testing)
 */
export function resetAnomalyDetector(): void {
  if (anomalyDetectorInstance) {
    anomalyDetectorInstance = null;
  }
}
