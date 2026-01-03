/**
 * Self-Healing Module
 *
 * Comprehensive self-healing mechanisms for automatic recovery from failures.
 * Integrates with health monitoring and provides various recovery strategies.
 *
 * Features:
 * - Service restart automation
 * - Configuration rollback
 * - Module reload
 * - Cache rebuild
 * - Graceful degradation
 * - Emergency mode activation
 * - Circuit breaker pattern
 * - Failure detection
 * - Recovery strategy selection
 * - Recovery execution
 * - Recovery verification
 * - Recovery history tracking
 * - Recovery analytics
 */

// Export all types and interfaces from submodules
export * from './recoveryStrategies';
export * from './healingOrchestrator';
export * from './circuitBreaker';
export * from './gracefulDegradation';

import { Logger } from '../utils/logger';
import { HealthOrchestrator } from '../core/health/orchestrator';

/**
 * Healing System Configuration
 */
export interface HealingSystemConfig {
  orchestratorConfig?: any;
  circuitBreakerConfig?: any;
  gracefulDegradationConfig?: any;
  autoRecoveryEnabled?: boolean;
  monitoringInterval?: number;
}

/**
 * Default healing system configuration
 */
const defaultHealingSystemConfig: HealingSystemConfig = {
  autoRecoveryEnabled: true,
  monitoringInterval: 30000 // 30 seconds
};

/**
 * Healing System
 *
 * Main entry point for self-healing mechanisms
 */
export class HealingSystem {
  private logger: Logger;
  private config: HealingSystemConfig;
  private orchestrator?: any;
  private circuitBreakerFactory?: any;
  private degradationFactory?: any;
  private healthOrchestrator?: HealthOrchestrator;
  private monitoringInterval?: NodeJS.Timeout;
  private healingSystemRunning = false;

  constructor(
    config: Partial<HealingSystemConfig> = {},
    healthOrchestrator?: HealthOrchestrator
  ) {
    this.config = { ...defaultHealingSystemConfig, ...config };
    this.logger = new Logger('HealingSystem');
    this.healthOrchestrator = healthOrchestrator;

    // Initialize factories
    this.circuitBreakerFactory = new CircuitBreakerFactory();
    this.degradationFactory = new GracefulDegradationFactory();

    this.logger.info('Healing system initialized', {
      config: this.config
    });
  }

  /**
   * Initialize healing system
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing healing system');

    // Initialize orchestrator
    this.orchestrator = new HealingOrchestrator(
      this.config.orchestratorConfig,
      this.healthOrchestrator
    );

    // Initialize circuit breaker if configured
    if (this.config.circuitBreakerConfig) {
      // Circuit breaker is created per service by orchestrator
      this.logger.debug('Circuit breaker configuration provided to orchestrator');
    }

    // Initialize graceful degradation if configured
    if (this.config.gracefulDegradationConfig) {
      // Graceful degradation is managed by orchestrator
      this.logger.debug('Graceful degradation configuration provided to orchestrator');
    }

    // Start auto-recovery if enabled
    if (this.config.autoRecoveryEnabled) {
      this.startMonitoring();
    }

    this.logger.info('Healing system initialized successfully');
  }

  /**
   * Start healing system
   */
  async start(): Promise<void> {
    if (this.healingSystemRunning) {
      this.logger.warn('Healing system is already running');
      return;
    }

    await this.initialize();
    this.healingSystemRunning = true;

    this.logger.info('Healing system started');
  }

  /**
   * Stop healing system
   */
  async stop(): Promise<void> {
    if (!this.healingSystemRunning) {
      this.logger.warn('Healing system is not running');
      return;
    }

    this.stopMonitoring();
    this.healingSystemRunning = false;

    this.logger.info('Healing system stopped');
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      this.logger.warn('Monitoring is already running');
      return;
    }

    const interval = this.config.monitoringInterval || 30000;

    this.monitoringInterval = setInterval(async () => {
      try {
        if (this.orchestrator) {
          await this.orchestrator.startAutoRecovery();
        }
      } catch (error) {
        this.logger.error('Error during monitoring cycle', error as Error);
      }
    }, interval);

    this.logger.info(`Monitoring started with interval: ${interval}ms`);
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.logger.info('Monitoring stopped');
    }
  }

  /**
   * Get orchestrator instance
   */
  getOrchestrator(): any {
    return this.orchestrator;
  }

  /**
   * Get circuit breaker factory
   */
  getCircuitBreakerFactory(): any {
    return this.circuitBreakerFactory;
  }

  /**
   * Get degradation factory
   */
  getDegradationFactory(): any {
    return this.degradationFactory;
  }

  /**
   * Get health orchestrator
   */
  getHealthOrchestrator(): HealthOrchestrator | undefined {
    return this.healthOrchestrator;
  }

  /**
   * Get configuration
   */
  getConfig(): HealingSystemConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealingSystemConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Configuration updated', { config });

    // Update orchestrator config
    if (this.orchestrator && config.orchestratorConfig) {
      this.orchestrator.updateConfig(config.orchestratorConfig);
    }
  }

  /**
   * Check if system is running
   */
  isRunning(): boolean {
    return this.healingSystemRunning;
  }

  /**
   * Get system status
   */
  getSystemStatus(): any {
    const status = {
      running: this.healingSystemRunning,
      monitoring: this.monitoringInterval !== undefined,
      autoRecovery: this.config.autoRecoveryEnabled || false,
      activeRecoveries: this.orchestrator?.getActiveRecoveries().length || 0,
      circuitBreakers: new Map()
    };

    if (this.circuitBreakerFactory) {
      const cbStats = this.circuitBreakerFactory.getAllStats();
      cbStats.forEach((stats: any, name: string) => {
        status.circuitBreakers.set(name, stats);
      });
    }

    return status;
  }

  /**
   * Trigger manual recovery
   */
  async triggerRecovery(
    component: string,
    strategy?: any
  ): Promise<any> {
    if (!this.orchestrator) {
      throw new Error('Healing orchestrator not initialized');
    }

    this.logger.info(`Triggering manual recovery for ${component}`, {
      strategy
    });

    // Detect failures
    const failures = await this.orchestrator.detectFailures();
    const failure = failures.find((f: any) => f.component === component);

    if (!failure) {
      throw new Error(`No failure detected for component: ${component}`);
    }

    // Select strategy if not provided
    const selectedStrategy = strategy || this.orchestrator.selectRecoveryStrategy(failure);

    if (!selectedStrategy) {
      throw new Error(`No recovery strategy available for component: ${component}`);
    }

    // Execute recovery
    return await this.orchestrator.executeRecovery(failure, selectedStrategy);
  }

  /**
   * Get recovery analytics
   */
  getRecoveryAnalytics(): any {
    return this.orchestrator?.getAnalytics();
  }

  /**
   * Get recovery history
   */
  getRecoveryHistory(limit?: number): any {
    return this.orchestrator?.getHistory(limit);
  }

  /**
   * Reset recovery analytics
   */
  resetRecoveryAnalytics(): void {
    this.orchestrator?.resetAnalytics();
  }

  /**
   * Clear recovery history
   */
  clearRecoveryHistory(): void {
    this.orchestrator?.clearHistory();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopMonitoring();

    if (this.orchestrator) {
      await this.orchestrator.cleanup();
    }

    this.healingSystemRunning = false;
    this.orchestrator = undefined;
    this.circuitBreakerFactory = undefined;
    this.degradationFactory = undefined;

    this.logger.info('Healing system cleaned up');
  }
}

/**
 * Create and initialize a healing system
 */
export async function createHealingSystem(
  config?: Partial<HealingSystemConfig>,
  healthOrchestrator?: HealthOrchestrator
): Promise<HealingSystem> {
  const system = new HealingSystem(config, healthOrchestrator);
  await system.initialize();
  return system;
}

/**
 * Quick setup function for healing system with health orchestrator
 */
export async function setupHealingWithHealth(
  healthOrchestrator: HealthOrchestrator,
  config?: Partial<HealingSystemConfig>
): Promise<HealingSystem> {
  return createHealingSystem({
    ...config,
    healthOrchestrator
  }, healthOrchestrator);
}
