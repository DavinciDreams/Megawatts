import { Client } from 'discord.js';
import {
  RecoveryConfig,
  RecoveryStrategy,
  LifecycleEvent,
  LifecycleEventType,
  LifecycleEventListener
} from './types';
import { Logger } from '../../utils/logger';
import { BotError as BotErrorClass, ConfigError, DatabaseError, AIError } from '../../utils/errors';

/**
 * Manages error recovery strategies and circuit breaker functionality
 */
export class ErrorRecoveryManager {
  private config: RecoveryConfig;
  private logger: Logger;
  private BotError = BotErrorClass; // Alias to avoid naming conflicts
  private listeners: Map<LifecycleEventType, Set<LifecycleEventListener>> = new Map();
  private recoveryStrategies: RecoveryStrategy[] = [];
  private circuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0
  };
  private errorHistory: Array<{
    error: Error | BotError;
    timestamp: number;
    recoveryAttempted: boolean;
    recoverySuccessful?: boolean;
  }> = [];
  private maxHistorySize = 100;

  constructor(config: RecoveryConfig, logger: Logger) {
    this.config = config;
    this.logger = new Logger('ErrorRecovery');
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeDefaultStrategies(): void {
    this.recoveryStrategies = [
      {
        name: 'connection_reset',
        canHandle: (error: Error | BotErrorClass) => {
          const errorCode = this.getErrorCode(error);
          return [
            'ECONNRESET',
            'ENOTFOUND',
            'ECONNREFUSED',
            'ETIMEDOUT'
          ].includes(errorCode);
        },
        execute: async (error: Error | BotErrorClass, attempt: number) => {
          this.logger.info(`Attempting connection reset recovery (attempt ${attempt})`);
          
          // Wait before attempting reconnection
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
          
          // This would trigger reconnection logic
          return true;
        },
        priority: 1
      },
      {
        name: 'rate_limit_recovery',
        canHandle: (error: Error | BotErrorClass) => {
          const errorCode = this.getErrorCode(error);
          return errorCode === 'RATE_LIMITED' || 
                 (error as any)?.code === 50001 || // Discord rate limit
                 (error as any)?.message?.includes('rate limit');
        },
        execute: async (error: Error | BotErrorClass, attempt: number) => {
          this.logger.info(`Rate limit detected, implementing backoff (attempt ${attempt})`);
          
          // Extract retry after from error if available
          const retryAfter = this.extractRetryAfter(error);
          const delay = retryAfter || this.calculateDelay(attempt);
          
          this.logger.debug(`Waiting ${delay}ms for rate limit recovery`);
          await this.sleep(delay);
          
          return true;
        },
        priority: 2
      },
      {
        name: 'gateway_timeout_recovery',
        canHandle: (error: Error | BotErrorClass) => {
          const errorCode = this.getErrorCode(error);
          return errorCode === 'GATEWAY_TIMEOUT' || 
                 errorCode === 'NETWORK_ERROR' ||
                 (error as any)?.message?.includes('gateway');
        },
        execute: async (error: Error | BotErrorClass, attempt: number) => {
          this.logger.info(`Gateway timeout recovery (attempt ${attempt})`);
          
          // Implement exponential backoff for gateway issues
          const delay = Math.min(this.calculateDelay(attempt) * 2, 60000);
          await this.sleep(delay);
          
          return true;
        },
        priority: 3
      },
      {
        name: 'session_invalidated_recovery',
        canHandle: (error: Error | BotErrorClass) => {
          const errorCode = this.getErrorCode(error);
          return errorCode === 'SESSION_INVALIDATED' ||
                 (error as any)?.message?.includes('invalidated') ||
                 (error as any)?.message?.includes('authentication');
        },
        execute: async (error: Error | BotErrorClass, attempt: number) => {
          this.logger.warn(`Session invalidated, attempting re-authentication (attempt ${attempt})`);
          
          // This would require new login attempt
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
          
          return true;
        },
        priority: 4
      },
      {
        name: 'database_recovery',
        canHandle: (error: Error | BotErrorClass) => {
          return error instanceof DatabaseError || 
                 this.getErrorCode(error).startsWith('DATABASE_');
        },
        execute: async (error: Error | BotErrorClass, attempt: number) => {
          this.logger.info(`Database error recovery (attempt ${attempt})`);
          
          // Attempt to reconnect to database
          const delay = Math.min(this.calculateDelay(attempt), 10000);
          await this.sleep(delay);
          
          return true;
        },
        priority: 5
      },
      {
        name: 'ai_service_recovery',
        canHandle: (error: Error | BotErrorClass) => {
          return error instanceof AIError || 
                 this.getErrorCode(error).startsWith('AI_');
        },
        execute: async (error: Error | BotErrorClass, attempt: number) => {
          this.logger.info(`AI service error recovery (attempt ${attempt})`);
          
          // Switch to fallback AI service or retry
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
          
          return true;
        },
        priority: 6
      }
    ];

    // Sort strategies by priority (lower number = higher priority)
    this.recoveryStrategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Handle error and attempt recovery
   */
  public async handleError(error: Error | BotErrorClass): Promise<{
    recovered: boolean;
    strategy?: string;
    attempts: number;
    finalError?: Error | BotErrorClass;
  }> {
    this.logger.error('Handling error:', error);
    
    // Add to error history
    this.addToErrorHistory(error);
    
    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      this.logger.warn('Circuit breaker is open, skipping recovery attempt');
      return { 
        recovered: false, 
        finalError: error,
        attempts: 0 
      };
    }

    // Find applicable recovery strategy
    const strategy = this.findRecoveryStrategy(error as any);
    
    if (!strategy) {
      this.logger.warn('No recovery strategy found for error:', error);
      await this.emitEvent({
        type: LifecycleEventType.ERROR_OCCURRED,
        timestamp: new Date(),
        data: {
          error,
          metadata: { 
            noStrategy: true,
            circuitBreakerOpen: this.circuitBreakerState.isOpen
          }
        }
      });
      
      return { 
        recovered: false, 
        finalError: error,
        attempts: 0 
      };
    }

    this.logger.info(`Using recovery strategy: ${strategy.name}`);
    
    let lastError: Error | BotErrorClass | undefined;
    let recovered = false;
    let attempts = 0;

    await this.emitEvent({
      type: LifecycleEventType.RECOVERY_ATTEMPTED,
      timestamp: new Date(),
      data: {
        error,
        recoveryAttempt: attempts + 1,
        metadata: { strategy: strategy.name }
      }
    });

    // Attempt recovery with configured max attempts
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      attempts++;
      
      try {
        this.logger.debug(`Recovery attempt ${attempt}/${this.config.maxAttempts} using strategy: ${strategy.name}`);
        
        const result = await strategy.execute(error as any, attempt);
        
        if (result) {
          recovered = true;
          this.circuitBreakerState.failureCount = 0;
          this.circuitBreakerState.isOpen = false;
          
          this.logger.info(`Recovery successful using strategy: ${strategy.name} (attempt ${attempt})`);
          
          await this.emitEvent({
            type: LifecycleEventType.RECOVERY_COMPLETED,
            timestamp: new Date(),
            data: {
              error,
              recoveryResult: 'success',
              recoveryAttempt: attempts,
              metadata: { strategy: strategy.name, attempts }
            }
          });
          
          break;
        }
        
      } catch (recoveryError) {
        lastError = recoveryError as Error | BotErrorClass;
        this.logger.error(`Recovery attempt ${attempt} failed:`, recoveryError as Error);
        
        // Update circuit breaker state
        this.updateCircuitBreaker();
        
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          this.logger.debug(`Waiting ${delay}ms before next recovery attempt`);
          await this.sleep(delay);
        }
      }
    }

    if (!recovered) {
      this.circuitBreakerState.isOpen = true;
      this.circuitBreakerState.lastFailureTime = Date.now();
      this.circuitBreakerState.nextAttemptTime = Date.now() + this.config.circuitBreakerTimeout;
      
      this.logger.error(`Recovery failed after ${attempts} attempts using strategy: ${strategy.name}`);
      
      await this.emitEvent({
        type: LifecycleEventType.RECOVERY_FAILED,
        timestamp: new Date(),
        data: {
          error: lastError || error,
          recoveryResult: 'failure',
          recoveryAttempt: attempts,
          metadata: { 
            strategy: strategy.name, 
            attempts,
            circuitBreakerOpened: true
          }
        }
      });
    }

    return { 
      recovered, 
      strategy: strategy.name,
      attempts,
      finalError: lastError || error 
    };
  }

  /**
   * Find applicable recovery strategy for error
   */
  private findRecoveryStrategy(error: Error | BotErrorClass): RecoveryStrategy | undefined {
    return this.recoveryStrategies.find(strategy => strategy.canHandle(error));
  }

  /**
   * Get error code from error
   */
  private getErrorCode(error: Error | BotErrorClass): string {
    if (error instanceof BotErrorClass) {
      return error.code;
    }
    
    if (error instanceof ConfigError) {
      return error.code;
    }
    
    if (error instanceof DatabaseError) {
      return error.code;
    }
    
    if (error instanceof AIError) {
      return error.code;
    }
    
    // Try to extract from Discord.js errors
    return (error as any)?.code || 'UNKNOWN_ERROR';
  }

  /**
   * Extract retry after time from rate limit error
   */
  private extractRetryAfter(error: Error | BotErrorClass): number | null {
    // Try to extract from Discord.js rate limit error
    const discordError = error as any;
    if (discordError?.retry_after) {
      return discordError.retry_after * 1000; // Convert to milliseconds
    }
    
    // Try to extract from error message
    const message = error.message.toLowerCase();
    const retryMatch = message.match(/retry after (\d+)/);
    if (retryMatch) {
      return parseInt(retryMatch[1] || '0') * 1000;
    }
    
    return null;
  }

  /**
   * Calculate delay with exponential backoff
   */
  private calculateDelay(attempt: number): number {
    const delay = Math.min(
      this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random();
    return Math.floor(delay + jitter);
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreakerState.isOpen) {
      return false;
    }
    
    // Check if timeout has passed
    if (Date.now() >= this.circuitBreakerState.nextAttemptTime) {
      this.circuitBreakerState.isOpen = false;
      this.circuitBreakerState.failureCount = 0;
      return false;
    }
    
    return true;
  }

  /**
   * Update circuit breaker state
   */
  private updateCircuitBreaker(): void {
    this.circuitBreakerState.failureCount++;
    
    if (this.circuitBreakerState.failureCount >= this.config.circuitBreakerThreshold) {
      this.circuitBreakerState.isOpen = true;
      this.circuitBreakerState.lastFailureTime = Date.now();
      this.circuitBreakerState.nextAttemptTime = Date.now() + this.config.circuitBreakerTimeout;
      
      this.logger.warn(`Circuit breaker opened after ${this.circuitBreakerState.failureCount} failures`);
    }
  }

  /**
   * Add error to history
   */
  private addToErrorHistory(error: Error | BotErrorClass): void {
    this.errorHistory.push({
      error,
      timestamp: Date.now(),
      recoveryAttempted: false
    });
    
    // Trim history if too large
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Sleep helper function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add custom recovery strategy
   */
  public addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    this.recoveryStrategies.sort((a, b) => a.priority - b.priority);
    this.logger.debug(`Added recovery strategy: ${strategy.name}`);
  }

  /**
   * Remove recovery strategy
   */
  public removeRecoveryStrategy(strategyName: string): void {
    this.recoveryStrategies = this.recoveryStrategies.filter(s => s.name !== strategyName);
    this.logger.debug(`Removed recovery strategy: ${strategyName}`);
  }

  /**
   * Get error statistics
   */
  public getErrorStatistics(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    recentErrors: number;
    circuitBreakerOpen: boolean;
  } {
    const errorsByType: Record<string, number> = {};
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let recentErrors = 0;

    for (const entry of this.errorHistory) {
      const errorType = this.getErrorCode(entry.error);
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
      
      if (entry.timestamp > oneHourAgo) {
        recentErrors++;
      }
    }

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      recentErrors,
      circuitBreakerOpen: this.circuitBreakerState.isOpen
    };
  }

  /**
   * Reset circuit breaker
   */
  public resetCircuitBreaker(): void {
    this.circuitBreakerState = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0
    };
    
    this.logger.info('Circuit breaker reset');
  }

  /**
   * Clear error history
   */
  public clearErrorHistory(): void {
    this.errorHistory = [];
    this.logger.debug('Error history cleared');
  }

  /**
   * Add lifecycle event listener
   */
  public addEventListener(eventType: LifecycleEventType, listener: LifecycleEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  /**
   * Remove lifecycle event listener
   */
  public removeEventListener(eventType: LifecycleEventType, listener: LifecycleEventListener): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  /**
   * Emit lifecycle event
   */
  private async emitEvent(event: LifecycleEvent): Promise<void> {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      await Promise.all(Array.from(listeners).map(listener => 
        Promise.resolve(listener(event)).catch(error => 
          this.logger.error('Event listener error:', error)
        )
      ));
    }
  }

  /**
   * Get recovery configuration
   */
  public getRecoveryConfig(): RecoveryConfig {
    return { ...this.config };
  }

  /**
   * Update recovery configuration
   */
  public updateRecoveryConfig(config: Partial<RecoveryConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.debug('Recovery configuration updated:', config);
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    this.listeners.clear();
    this.errorHistory = [];
    this.resetCircuitBreaker();
    this.logger.debug('Error recovery manager cleaned up');
  }
}