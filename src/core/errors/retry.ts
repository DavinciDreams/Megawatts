import { RetryConfig, ErrorClassification } from './types';
import { Logger } from '../../utils/logger';

export interface RetryAttempt {
  attempt: number;
  delay: number;
  timestamp: Date;
  error: Error;
}

export interface RetryResult {
  success: boolean;
  attempts: RetryAttempt[];
  finalError?: Error | undefined;
  result?: any;
}

export class RetryHandler {
  private logger: Logger;
  private defaultConfig: RetryConfig;

  constructor(defaultConfig: RetryConfig, logger: Logger) {
    this.defaultConfig = defaultConfig;
    this.logger = logger;
  }

  /**
   * Execute a function with retry logic
   */
  public async executeWithRetry<T>(
    fn: () => Promise<T>,
    classification: ErrorClassification,
    customConfig?: Partial<RetryConfig>
  ): Promise<RetryResult> {
    const config = { ...this.defaultConfig, ...customConfig, ...classification.retryConfig };
    const attempts: RetryAttempt[] = [];
    let lastError: Error | undefined;

    this.logger.debug('Starting retry execution', {
      maxAttempts: config.maxAttempts,
      baseDelay: config.baseDelay,
      isRetryable: classification.isRetryable
    });

    if (!classification.isRetryable) {
      this.logger.info('Operation is not retryable, executing once');
      try {
        const result = await fn();
        return {
          success: true,
          attempts: [],
          result
        };
      } catch (error) {
        return {
          success: false,
          attempts: [],
          finalError: error as Error
        };
      }
    }

    for (let attempt = 1; attempt <= config.maxAttempts!; attempt++) {
      try {
        this.logger.debug(`Executing attempt ${attempt}/${config.maxAttempts}`);
        const result = await fn();
        
        if (attempt > 1) {
          this.logger.info(`Operation succeeded on attempt ${attempt}`, {
            totalAttempts: attempt,
            classification: classification.category
          });
        }

        return {
          success: true,
          attempts,
          result
        };
      } catch (error) {
        lastError = error as Error;
        
        const retryAttempt: RetryAttempt = {
          attempt,
          delay: this.calculateDelay(attempt, config),
          timestamp: new Date(),
          error: lastError
        };
        
        attempts.push(retryAttempt);

        this.logger.warn(`Attempt ${attempt} failed`, {
          error: lastError.message,
          nextDelay: retryAttempt.delay,
          remainingAttempts: config.maxAttempts! - attempt
        });

        // Don't wait after the last attempt
        if (attempt < config.maxAttempts!) {
          await this.wait(retryAttempt.delay);
        }
      }
    }

    this.logger.error('All retry attempts failed', {
      totalAttempts: config.maxAttempts,
      finalError: lastError?.message,
      classification: classification.category
    });

    return {
      success: false,
      attempts,
      finalError: lastError
    };
  }

  /**
   * Calculate delay for retry attempt with exponential backoff and jitter
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay! * Math.pow(config.backoffMultiplier!, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay!);
    
    // Add jitter if enabled
    if (config.jitter) {
      const jitterRange = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * jitterRange;
    }
    
    return Math.max(0, Math.floor(delay));
  }

  /**
   * Wait for specified milliseconds
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if an error should be retried based on classification
   */
  public shouldRetry(error: Error, classification: ErrorClassification, currentAttempt: number): boolean {
    if (!classification.isRetryable) {
      return false;
    }

    if (currentAttempt >= classification.maxRetries!) {
      return false;
    }

    // Check for specific error types that should not be retried
    const nonRetryablePatterns = [
      /permission denied/i,
      /unauthorized/i,
      /forbidden/i,
      /not found/i,
      /invalid.*token/i,
      /authentication/i
    ];

    return !nonRetryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Get retry statistics for monitoring
   */
  public getRetryStats(results: RetryResult[]): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageAttempts: number;
    maxAttempts: number;
    totalRetries: number;
  } {
    const totalOperations = results.length;
    const successfulOperations = results.filter(r => r.success).length;
    const failedOperations = totalOperations - successfulOperations;
    
    const allAttempts = results.flatMap(r => r.attempts);
    const totalRetries = allAttempts.length;
    const averageAttempts = totalOperations > 0 ? totalRetries / totalOperations : 0;
    const maxAttempts = allAttempts.length > 0 ? Math.max(...allAttempts.map(a => a.attempt)) : 0;

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageAttempts,
      maxAttempts,
      totalRetries
    };
  }

  /**
   * Create a retryable function wrapper
   */
  public createRetryableFunction<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    classification: ErrorClassification,
    customConfig?: Partial<RetryConfig>
  ): (...args: T) => Promise<RetryResult> {
    return async (...args: T): Promise<RetryResult> => {
      return this.executeWithRetry(
        () => fn(...args),
        classification,
        customConfig
      );
    };
  }

  /**
   * Execute multiple operations with retry logic in parallel
   */
  public async executeWithRetryParallel<T>(
    operations: Array<{
      fn: () => Promise<T>;
      classification: ErrorClassification;
      customConfig?: Partial<RetryConfig>;
    }>
  ): Promise<RetryResult[]> {
    this.logger.debug('Executing parallel retry operations', {
      operationCount: operations.length
    });

    const promises = operations.map(({ fn, classification, customConfig }) =>
      this.executeWithRetry(fn, classification, customConfig)
    );

    return Promise.all(promises);
  }

  /**
   * Execute operations with retry logic in sequence (fail-fast)
   */
  public async executeWithRetrySequence<T>(
    operations: Array<{
      fn: () => Promise<T>;
      classification: ErrorClassification;
      customConfig?: Partial<RetryConfig>;
    }>
  ): Promise<RetryResult[]> {
    this.logger.debug('Executing sequential retry operations', {
      operationCount: operations.length
    });

    const results: RetryResult[] = [];

    for (const { fn, classification, customConfig } of operations) {
      const result = await this.executeWithRetry(fn, classification, customConfig);
      results.push(result);

      // Stop sequence if operation failed
      if (!result.success) {
        this.logger.warn('Sequential operation failed, stopping sequence', {
          error: result.finalError?.message
        });
        break;
      }
    }

    return results;
  }
}