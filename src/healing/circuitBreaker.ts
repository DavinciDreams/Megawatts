/**
 * Circuit Breaker Module
 *
 * Implements the circuit breaker pattern to prevent cascading failures:
 * - State transitions (CLOSED, OPEN, HALF_OPEN)
 * - Failure threshold tracking
 * - Automatic recovery
 * - Fallback mechanisms
 */

import { Logger } from '../utils/logger';

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenMaxCalls: number;
  resetTimeout?: number;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  stateChangeCount: number;
}

/**
 * Circuit breaker event
 */
export interface CircuitBreakerEvent {
  type: 'stateChanged' | 'failure' | 'success' | 'timeout';
  timestamp: Date;
  fromState?: CircuitBreakerState;
  toState?: CircuitBreakerState;
  error?: Error;
}

/**
 * Default circuit breaker configuration
 */
const defaultConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,
  halfOpenMaxCalls: 3,
  resetTimeout: 120000
};

/**
 * Circuit Breaker
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 */
export class CircuitBreaker {
  private logger: Logger;
  private config: CircuitBreakerConfig;

  // State
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private openTime?: Date;
  private halfOpenCalls: number = 0;

  // Statistics
  private totalCalls: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private stateChangeCount: number = 0;

  // Event listeners
  private eventListeners: Map<string, Set<Function>> = new Map();

  // Fallback function
  private fallback?: () => any;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.logger = new Logger('CircuitBreaker');

    this.logger.info('Circuit breaker initialized', {
      config: this.config
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      // Check if timeout has passed
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
      } else {
        // Use fallback if available
        if (this.fallback) {
          this.logger.debug('Circuit breaker is open, using fallback');
          return this.fallback();
        }

        const error = new Error('Circuit breaker is OPEN');
        this.emitEvent({
          type: 'stateChanged',
          timestamp: new Date(),
          error
        });
        throw error;
      }
    }

    try {
      const result = await fn();

      // Record success
      this.recordSuccess();

      return result;
    } catch (error) {
      // Record failure
      this.recordFailure(error as Error);

      throw error;
    }
  }

  /**
   * Record a failure
   */
  recordFailure(error: Error): void {
    this.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = new Date();

    this.logger.warn('Circuit breaker recorded failure', {
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold
    });

    this.emitEvent({
      type: 'failure',
      timestamp: new Date(),
      error
    });

    // Check if threshold reached
    if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo(CircuitBreakerState.OPEN);
    }
  }

  /**
   * Record a success
   */
  recordSuccess(): void {
    this.totalSuccesses++;
    this.successCount++;
    this.lastSuccessTime = new Date();

    this.logger.debug('Circuit breaker recorded success', {
      successCount: this.successCount,
      threshold: this.config.successThreshold
    });

    this.emitEvent({
      type: 'success',
      timestamp: new Date()
    });

    // Handle half-open state
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenCalls++;

      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitBreakerState.CLOSED);
      }
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      stateChangeCount: this.stateChangeCount
    };
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === CircuitBreakerState.OPEN;
  }

  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  /**
   * Check if circuit is half-open
   */
  isHalfOpen(): boolean {
    return this.state === CircuitBreakerState.HALF_OPEN;
  }

  /**
   * Set fallback function
   */
  setFallback(fallback: () => any): void {
    this.fallback = fallback;
    this.logger.debug('Fallback function set');
  }

  /**
   * Clear fallback function
   */
  clearFallback(): void {
    this.fallback = undefined;
    this.logger.debug('Fallback function cleared');
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    const previousState = this.state;

    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.openTime = undefined;

    this.logger.info('Circuit breaker reset', {
      fromState: previousState
    });

    this.emitEvent({
      type: 'stateChanged',
      timestamp: new Date(),
      fromState: previousState,
      toState: CircuitBreakerState.CLOSED
    });
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const previousState = this.state;

    if (previousState === newState) {
      return;
    }

    this.state = newState;
    this.stateChangeCount++;

    // Reset counters based on state
    switch (newState) {
      case CircuitBreakerState.OPEN:
        this.openTime = new Date();
        this.logger.warn('Circuit breaker opened', {
          failureCount: this.failureCount
        });
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.successCount = 0;
        this.halfOpenCalls = 0;
        this.logger.info('Circuit breaker moved to half-open');
        break;

      case CircuitBreakerState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        this.halfOpenCalls = 0;
        this.openTime = undefined;
        this.logger.info('Circuit breaker closed');
        break;
    }

    this.emitEvent({
      type: 'stateChanged',
      timestamp: new Date(),
      fromState: previousState,
      toState: newState
    });
  }

  /**
   * Check if should attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (!this.openTime) {
      return false;
    }

    const now = Date.now();
    const elapsed = now - this.openTime.getTime();
    const resetTimeout = this.config.resetTimeout || this.config.timeout;

    return elapsed >= resetTimeout;
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
  private emitEvent(event: CircuitBreakerEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          this.logger.error('Event listener error', error as Error);
        }
      });
    }
  }

  /**
   * Get configuration
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Configuration updated', { config });
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    healthy: boolean;
    state: CircuitBreakerState;
    message: string;
  } {
    const stats = this.getStats();
    const failureRate = stats.totalCalls > 0
      ? stats.totalFailures / stats.totalCalls
      : 0;

    if (this.state === CircuitBreakerState.CLOSED && failureRate < 0.1) {
      return {
        healthy: true,
        state: this.state,
        message: 'Circuit breaker is healthy and closed'
      };
    }

    if (this.state === CircuitBreakerState.OPEN) {
      return {
        healthy: false,
        state: this.state,
        message: `Circuit breaker is open due to ${this.failureCount} failures`
      };
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      return {
        healthy: false,
        state: this.state,
        message: 'Circuit breaker is testing recovery'
      };
    }

    return {
      healthy: true,
      state: this.state,
      message: 'Circuit breaker is operational'
    };
  }
}

/**
 * Circuit Breaker Factory
 */
export class CircuitBreakerFactory {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('CircuitBreakerFactory');
  }

  /**
   * Create or get circuit breaker for a service
   */
  getOrCreate(
    name: string,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    let cb = this.circuitBreakers.get(name);

    if (!cb) {
      cb = new CircuitBreaker(config);
      this.circuitBreakers.set(name, cb);
      this.logger.debug(`Created circuit breaker for: ${name}`);
    }

    return cb;
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): CircuitBreaker[] {
    return Array.from(this.circuitBreakers.values());
  }

  /**
   * Remove circuit breaker
   */
  remove(name: string): void {
    this.circuitBreakers.delete(name);
    this.logger.debug(`Removed circuit breaker for: ${name}`);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.circuitBreakers.forEach(cb => cb.reset());
    this.logger.info('All circuit breakers reset');
  }

  /**
   * Get all statistics
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();

    this.circuitBreakers.forEach((cb, name) => {
      stats.set(name, cb.getStats());
    });

    return stats;
  }
}
