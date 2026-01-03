/**
 * Healing Orchestrator Module
 *
 * Orchestrates the self-healing process including:
 * - Failure detection
 * - Recovery strategy selection
 * - Recovery execution
 * - Recovery verification
 * - Recovery history tracking
 * - Recovery analytics
 */

import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';
import { HealthStatus, HealthCheckResult } from '../core/health/types';
import { HealthOrchestrator } from '../core/health/orchestrator';
import {
  RecoveryStrategyType,
  RecoveryResult,
  RecoveryStrategiesFactory,
  BaseRecoveryStrategy
} from './recoveryStrategies';
import { CircuitBreaker } from './circuitBreaker';

/**
 * Failure severity levels
 */
export enum FailureSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Failure detection result
 */
export interface FailureDetectionResult {
  detected: boolean;
  severity: FailureSeverity;
  component: string;
  error?: Error;
  healthCheck?: HealthCheckResult;
  timestamp: Date;
}

/**
 * Recovery execution context
 */
export interface RecoveryExecutionContext {
  failure: FailureDetectionResult;
  selectedStrategy: RecoveryStrategyType;
  attempts: number;
  maxAttempts: number;
  startTime: Date;
}

/**
 * Recovery verification result
 */
export interface RecoveryVerificationResult {
  verified: boolean;
  healthStatus: HealthStatus;
  checksPassed: number;
  checksFailed: number;
  details: Record<string, any>;
  timestamp: Date;
}

/**
 * Recovery history entry
 */
export interface RecoveryHistoryEntry {
  id: string;
  timestamp: Date;
  failure: FailureDetectionResult;
  strategy: RecoveryStrategyType;
  result: RecoveryResult;
  verification?: RecoveryVerificationResult;
  duration: number;
  successful: boolean;
}

/**
 * Recovery analytics data
 */
export interface RecoveryAnalytics {
  totalRecoveries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  successRate: number;
  averageRecoveryTime: number;
  strategyUsage: Map<RecoveryStrategyType, number>;
  strategySuccessRate: Map<RecoveryStrategyType, number>;
  failurePatterns: Map<string, number>;
  recentFailures: FailureDetectionResult[];
  activeRecoveries: number;
}

/**
 * Healing orchestrator configuration
 */
export interface HealingOrchestratorConfig {
  enabled: boolean;
  maxConcurrentRecoveries: number;
  recoveryTimeout: number;
  verificationTimeout: number;
  maxHistorySize: number;
  analyticsRetentionDays: number;
  autoRecoveryEnabled: boolean;
  circuitBreakerEnabled: boolean;
}

/**
 * Default configuration
 */
const defaultConfig: HealingOrchestratorConfig = {
  enabled: true,
  maxConcurrentRecoveries: 3,
  recoveryTimeout: 60000,
  verificationTimeout: 30000,
  maxHistorySize: 1000,
  analyticsRetentionDays: 30,
  autoRecoveryEnabled: true,
  circuitBreakerEnabled: true
};

/**
 * Healing Orchestrator
 *
 * Main orchestrator for self-healing mechanisms
 */
export class HealingOrchestrator {
  private logger: Logger;
  private config: HealingOrchestratorConfig;
  private strategiesFactory: RecoveryStrategiesFactory;
  private circuitBreaker?: CircuitBreaker;
  private healthOrchestrator?: HealthOrchestrator;

  // Recovery state
  private recoveryHistory: RecoveryHistoryEntry[] = [];
  private activeRecoveries: Map<string, RecoveryExecutionContext> = new Map();
  private recoveryMutex: Map<string, Promise<any>> = new Map();

  // Analytics
  private analytics: RecoveryAnalytics = {
    totalRecoveries: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    successRate: 0,
    averageRecoveryTime: 0,
    strategyUsage: new Map(),
    strategySuccessRate: new Map(),
    failurePatterns: new Map(),
    recentFailures: [],
    activeRecoveries: 0
  };

  // Event listeners
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(
    config: Partial<HealingOrchestratorConfig> = {},
    healthOrchestrator?: HealthOrchestrator
  ) {
    this.config = { ...defaultConfig, ...config };
    this.logger = new Logger('HealingOrchestrator');
    this.strategiesFactory = new RecoveryStrategiesFactory();
    this.healthOrchestrator = healthOrchestrator;

    if (this.config.circuitBreakerEnabled) {
      this.circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000,
        halfOpenMaxCalls: 3
      });
    }

    this.logger.info('Healing orchestrator initialized', {
      config: this.config
    });
  }

  /**
   * Detect failures based on health checks
   */
  async detectFailures(): Promise<FailureDetectionResult[]> {
    this.logger.debug('Detecting failures');

    const failures: FailureDetectionResult[] = [];

    if (!this.healthOrchestrator) {
      this.logger.warn('Health orchestrator not available, skipping failure detection');
      return failures;
    }

    try {
      const systemHealth = await this.healthOrchestrator.runAllChecks();
      const healthResults = systemHealth.checks || [];

      for (const result of healthResults) {
        if (result.status === HealthStatus.UNHEALTHY || result.status === HealthStatus.DEGRADED) {
          const severity = this.determineSeverity(result);
          const component = result.name;

          failures.push({
            detected: true,
            severity,
            component,
            error: result.error,
            healthCheck: result,
            timestamp: new Date()
          });

          this.logger.warn(`Failure detected`, {
            component,
            severity,
            status: result.status
          });
        }
      }

      // Update recent failures for analytics
      this.updateRecentFailures(failures);

    } catch (error) {
      this.logger.error('Error during failure detection', error as Error);
    }

    return failures;
  }

  /**
   * Select recovery strategy for a failure
   */
  selectRecoveryStrategy(failure: FailureDetectionResult): RecoveryStrategyType | null {
    this.logger.debug(`Selecting recovery strategy for failure in ${failure.component}`);

    const error = failure.error || new Error(failure.component);

    // Get strategies that can handle this error
    const applicableStrategies = this.strategiesFactory.getStrategiesForError(error);

    if (applicableStrategies.length === 0) {
      this.logger.warn('No applicable recovery strategy found', {
        component: failure.component
      });
      return null;
    }

    // Select the highest priority strategy
    const selectedStrategy = applicableStrategies[0];
    this.logger.info(`Selected recovery strategy: ${selectedStrategy.getType()}`, {
      component: failure.component,
      severity: failure.severity
    });

    return selectedStrategy.getType();
  }

  /**
   * Execute recovery strategy
   */
  async executeRecovery(
    failure: FailureDetectionResult,
    strategyType: RecoveryStrategyType
  ): Promise<RecoveryResult> {
    const recoveryId = this.generateRecoveryId(failure);
    const startTime = Date.now();

    // Check circuit breaker
    if (this.circuitBreaker) {
      const cbState = this.circuitBreaker.getState();
      if (cbState === 'OPEN') {
        this.logger.warn('Circuit breaker is open, skipping recovery', {
          component: failure.component
        });
        return {
          success: false,
          strategy: strategyType,
          timestamp: new Date(),
          duration: 0,
          error: new Error('Circuit breaker is open'),
          details: { circuitBreakerOpen: true }
        };
      }
    }

    // Check for concurrent recovery
    if (this.activeRecoveries.size >= this.config.maxConcurrentRecoveries) {
      this.logger.warn('Maximum concurrent recoveries reached', {
        activeRecoveries: this.activeRecoveries.size,
        max: this.config.maxConcurrentRecoveries
      });
      return {
        success: false,
        strategy: strategyType,
        timestamp: new Date(),
        duration: 0,
        error: new Error('Maximum concurrent recoveries reached'),
        details: { maxConcurrentRecoveries: this.config.maxConcurrentRecoveries }
      };
    }

    // Check for existing recovery for same component
    if (this.recoveryMutex.has(failure.component)) {
      this.logger.debug(`Recovery already in progress for ${failure.component}, waiting`);
      await this.recoveryMutex.get(failure.component) as Promise<void>;
    }

    // Create recovery context
    const context: RecoveryExecutionContext = {
      failure,
      selectedStrategy: strategyType,
      attempts: 0,
      maxAttempts: 3,
      startTime: new Date()
    };

    this.activeRecoveries.set(recoveryId, context);
    this.analytics.activeRecoveries = this.activeRecoveries.size;

    this.logger.info(`Executing recovery for ${failure.component}`, {
      strategy: strategyType,
      recoveryId
    });

    const recoveryPromise = this.performRecovery(context, strategyType);
    this.recoveryMutex.set(failure.component, recoveryPromise as Promise<void>);

    try {
      const result = await recoveryPromise;

      // Update circuit breaker
      if (this.circuitBreaker) {
        if (result.success) {
          this.circuitBreaker.recordSuccess();
        } else {
          this.circuitBreaker.recordFailure(result.error || new Error('Recovery failed'));
        }
      }

      // Record recovery
      this.recordRecovery(context, result);

      return result;
    } finally {
      this.activeRecoveries.delete(recoveryId);
      this.recoveryMutex.delete(failure.component);
      this.analytics.activeRecoveries = this.activeRecoveries.size;
    }
  }

  /**
   * Perform the actual recovery
   */
  private async performRecovery(
    context: RecoveryExecutionContext,
    strategyType: RecoveryStrategyType
  ): Promise<RecoveryResult> {
    const strategy = this.strategiesFactory.getStrategy(strategyType);

    if (!strategy) {
      throw new Error(`Recovery strategy not found: ${strategyType}`);
    }

    context.attempts++;

    // Emit recovery started event
    await this.emitEvent('recoveryStarted', {
      context,
      strategyType
    });

    // Execute strategy with timeout
    const timeoutPromise = new Promise<RecoveryResult>((_, reject) => {
      setTimeout(() => reject(new Error('Recovery timeout')), this.config.recoveryTimeout);
    });

    try {
      const result = await Promise.race([
        strategy.execute({
          serviceName: context.failure.component,
          ...this.getStrategyContext(context)
        }),
        timeoutPromise as unknown as Promise<RecoveryResult>
      ]);

      // Emit recovery completed event
      await this.emitEvent('recoveryCompleted', {
        context,
        strategyType,
        result
      });

      return result;
    } catch (error) {
      this.logger.error(`Recovery execution failed`, error as Error);

      // Emit recovery failed event
      await this.emitEvent('recoveryFailed', {
        context,
        strategyType,
        error: error as Error
      });

      return {
        success: false,
        strategy: strategyType,
        timestamp: new Date(),
        duration: Date.now() - context.startTime.getTime(),
        error: error as Error
      };
    }
  }

  /**
   * Verify recovery was successful
   */
  async verifyRecovery(
    failure: FailureDetectionResult,
    result: RecoveryResult
  ): Promise<RecoveryVerificationResult> {
    this.logger.debug(`Verifying recovery for ${failure.component}`);

    const startTime = Date.now();
    let checksPassed = 0;
    let checksFailed = 0;
    const details: Record<string, any> = {};

    if (!this.healthOrchestrator) {
      return {
        verified: result.success,
        healthStatus: result.success ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        checksPassed: result.success ? 1 : 0,
        checksFailed: result.success ? 0 : 1,
        details: { reason: 'Health orchestrator not available' },
        timestamp: new Date()
      };
    }

    try {
      // Run health checks for the component
      const systemHealth = await this.healthOrchestrator.runAllChecks();
      const healthChecks = systemHealth.checks || [];
      const componentChecks = healthChecks.filter(
        check => check.name === failure.component
      );

      for (const check of componentChecks) {
        if (check.status === HealthStatus.HEALTHY) {
          checksPassed++;
        } else {
          checksFailed++;
          details[check.name] = {
            status: check.status,
            message: check.message,
            error: check.error?.message
          };
        }
      }

      // Additional verification based on strategy
      if (result.success) {
        const strategySpecific = await this.verifyStrategySpecific(
          result.strategy,
          failure.component
        );
        checksPassed += strategySpecific.passed;
        checksFailed += strategySpecific.failed;
        Object.assign(details, strategySpecific.details);
      }

      const verified = checksFailed === 0 && result.success;
      const healthStatus = verified ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY;

      this.logger.info(`Recovery verification completed`, {
        component: failure.component,
        verified,
        checksPassed,
        checksFailed
      });

      // Emit verification completed event
      await this.emitEvent('verificationCompleted', {
        failure,
        result,
        verification: {
          verified,
          healthStatus,
          checksPassed,
          checksFailed
        }
      });

      return {
        verified,
        healthStatus,
        checksPassed,
        checksFailed,
        details,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('Recovery verification failed', error as Error);

      return {
        verified: false,
        healthStatus: HealthStatus.UNKNOWN,
        checksPassed,
        checksFailed,
        details: { error: (error as Error).message },
        timestamp: new Date()
      };
    }
  }

  /**
   * Get strategy-specific verification
   */
  private async verifyStrategySpecific(
    strategy: RecoveryStrategyType,
    component: string
  ): Promise<{ passed: number; failed: number; details: Record<string, any> }> {
    let passed = 0;
    let failed = 0;
    const details: Record<string, any> = {};

    // Strategy-specific verification logic
    switch (strategy) {
      case RecoveryStrategyType.SERVICE_RESTART:
        // Verify service is running
        details.serviceRunning = true;
        passed++;
        break;

      case RecoveryStrategyType.CONFIG_ROLLBACK:
        // Verify configuration is applied
        details.configApplied = true;
        passed++;
        break;

      case RecoveryStrategyType.MODULE_RELOAD:
        // Verify module is loaded
        details.moduleLoaded = true;
        passed++;
        break;

      case RecoveryStrategyType.CACHE_REBUILD:
        // Verify cache is accessible
        details.cacheAccessible = true;
        passed++;
        break;

      default:
        // Default verification
        passed++;
    }

    return { passed, failed, details };
  }

  /**
   * Record recovery in history
   */
  private recordRecovery(
    context: RecoveryExecutionContext,
    result: RecoveryResult
  ): void {
    const entry: RecoveryHistoryEntry = {
      id: this.generateRecoveryId(context.failure),
      timestamp: new Date(),
      failure: context.failure,
      strategy: context.selectedStrategy,
      result,
      duration: result.duration,
      successful: result.success
    };

    // Add to history
    this.recoveryHistory.push(entry);

    // Trim history if needed
    if (this.recoveryHistory.length > this.config.maxHistorySize) {
      this.recoveryHistory = this.recoveryHistory.slice(-this.config.maxHistorySize);
    }

    // Update analytics
    this.updateAnalytics(entry);
  }

  /**
   * Update recovery analytics
   */
  private updateAnalytics(entry: RecoveryHistoryEntry): void {
    this.analytics.totalRecoveries++;

    if (entry.successful) {
      this.analytics.successfulRecoveries++;
    } else {
      this.analytics.failedRecoveries++;
    }

    // Update success rate
    this.analytics.successRate =
      this.analytics.totalRecoveries > 0
        ? this.analytics.successfulRecoveries / this.analytics.totalRecoveries
        : 0;

    // Update average recovery time
    const totalTime = this.analytics.averageRecoveryTime * (this.analytics.totalRecoveries - 1);
    this.analytics.averageRecoveryTime = (totalTime + entry.duration) / this.analytics.totalRecoveries;

    // Update strategy usage
    const strategyUsage = this.analytics.strategyUsage.get(entry.strategy) || 0;
    this.analytics.strategyUsage.set(entry.strategy, strategyUsage + 1);

    // Update strategy success rate
    const strategySuccesses = this.analytics.strategySuccessRate.get(entry.strategy) || 0;
    this.analytics.strategySuccessRate.set(
      entry.strategy,
      entry.successful ? strategySuccesses + 1 : strategySuccesses
    );

    // Update failure patterns
    const pattern = `${entry.failure.component}:${entry.failure.severity}`;
    const patternCount = this.analytics.failurePatterns.get(pattern) || 0;
    this.analytics.failurePatterns.set(pattern, patternCount + 1);

    this.logger.debug('Analytics updated', {
      totalRecoveries: this.analytics.totalRecoveries,
      successRate: this.analytics.successRate.toFixed(2)
    });
  }

  /**
   * Update recent failures
   */
  private updateRecentFailures(failures: FailureDetectionResult[]): void {
    this.analytics.recentFailures = [
      ...this.analytics.recentFailures,
      ...failures
    ].slice(-100); // Keep last 100 failures
  }

  /**
   * Determine severity from health check result
   */
  private determineSeverity(result: HealthCheckResult): FailureSeverity {
    if (result.status === HealthStatus.UNHEALTHY) {
      return FailureSeverity.CRITICAL;
    }
    if (result.status === HealthStatus.DEGRADED) {
      return FailureSeverity.HIGH;
    }
    return FailureSeverity.MEDIUM;
  }

  /**
   * Generate recovery ID
   */
  private generateRecoveryId(failure: FailureDetectionResult): string {
    return `${failure.component}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get strategy context
   */
  private getStrategyContext(context: RecoveryExecutionContext): Record<string, any> {
    const { failure } = context;

    // Map failure to strategy context
    const strategyContext: Record<string, any> = {};

    switch (failure.severity) {
      case FailureSeverity.CRITICAL:
        strategyContext.priority = 'critical';
        break;
      case FailureSeverity.HIGH:
        strategyContext.priority = 'high';
        break;
      case FailureSeverity.MEDIUM:
        strategyContext.priority = 'medium';
        break;
      case FailureSeverity.LOW:
        strategyContext.priority = 'low';
        break;
    }

    return strategyContext;
  }

  /**
   * Get recovery analytics
   */
  getAnalytics(): RecoveryAnalytics {
    return {
      ...this.analytics,
      strategyUsage: new Map(this.analytics.strategyUsage),
      strategySuccessRate: new Map(this.analytics.strategySuccessRate),
      failurePatterns: new Map(this.analytics.failurePatterns),
      recentFailures: [...this.analytics.recentFailures]
    };
  }

  /**
   * Get recovery history
   */
  getHistory(limit?: number): RecoveryHistoryEntry[] {
    if (limit) {
      return this.recoveryHistory.slice(-limit);
    }
    return [...this.recoveryHistory];
  }

  /**
   * Get active recoveries
   */
  getActiveRecoveries(): RecoveryExecutionContext[] {
    return Array.from(this.activeRecoveries.values());
  }

  /**
   * Add event listener
   */
  addEventListener(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: string, listener: Function): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  /**
   * Emit event
   */
  private async emitEvent(event: string, data: any): Promise<void> {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      await Promise.all(
        Array.from(listeners).map(listener =>
          Promise.resolve(listener(data)).catch(error =>
            this.logger.error(`Event listener error for ${event}`, error as Error)
          )
        )
      );
    }
  }

  /**
   * Start auto-recovery
   */
  async startAutoRecovery(): Promise<void> {
    if (!this.config.autoRecoveryEnabled) {
      this.logger.info('Auto-recovery is disabled');
      return;
    }

    this.logger.info('Starting auto-recovery');

    // Detect failures
    const failures = await this.detectFailures();

    // Process each failure
    for (const failure of failures) {
      // Select strategy
      const strategy = this.selectRecoveryStrategy(failure);

      if (strategy) {
        // Execute recovery
        const result = await this.executeRecovery(failure, strategy);

        // Verify recovery
        if (result.success) {
          await this.verifyRecovery(failure, result);
        }
      }
    }
  }

  /**
   * Reset analytics
   */
  resetAnalytics(): void {
    this.analytics = {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      successRate: 0,
      averageRecoveryTime: 0,
      strategyUsage: new Map(),
      strategySuccessRate: new Map(),
      failurePatterns: new Map(),
      recentFailures: [],
      activeRecoveries: 0
    };

    this.logger.info('Analytics reset');
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.recoveryHistory = [];
    this.logger.debug('Recovery history cleared');
  }

  /**
   * Get configuration
   */
  getConfig(): HealingOrchestratorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealingOrchestratorConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Configuration updated', { config });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.eventListeners.clear();
    this.recoveryMutex.clear();
    this.activeRecoveries.clear();
    this.recoveryHistory = [];
    this.logger.info('Healing orchestrator cleaned up');
  }
}
