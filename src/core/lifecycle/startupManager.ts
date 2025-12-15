import { Client } from 'discord.js';
import {
  BotState,
  StartupConfig,
  LifecycleEvent,
  LifecycleEventType,
  LifecycleEventListener
} from './types';
import { BotConfig } from '../../types';
import { Logger } from '../../utils/logger';
import { BotError, ConfigError } from '../../utils/errors';

/**
 * Manages bot startup sequence with proper initialization and validation
 */
export class StartupManager {
  private config: BotConfig;
  private startupConfig: StartupConfig;
  private logger: Logger;
  private listeners: Map<LifecycleEventType, Set<LifecycleEventListener>> = new Map();
  private startupSteps: Array<{
    name: string;
    execute: () => Promise<void>;
    timeout: number;
    critical: boolean;
  }> = [];

  constructor(config: BotConfig, startupConfig: StartupConfig, logger: Logger) {
    this.config = config;
    this.startupConfig = startupConfig;
    this.logger = new Logger('StartupManager');
    this.initializeStartupSteps();
  }

  /**
   * Initialize startup steps in order
   */
  private initializeStartupSteps(): void {
    this.startupSteps = [
      {
        name: 'validate_configuration',
        execute: this.validateConfiguration.bind(this),
        timeout: 5000,
        critical: true
      },
      {
        name: 'initialize_logging',
        execute: this.initializeLogging.bind(this),
        timeout: 3000,
        critical: true
      },
      {
        name: 'create_discord_client',
        execute: this.createDiscordClient.bind(this),
        timeout: 10000,
        critical: true
      },
      {
        name: 'setup_event_handlers',
        execute: this.setupEventHandlers.bind(this),
        timeout: 5000,
        critical: true
      },
      {
        name: 'connect_to_discord',
        execute: async () => {
          const result = await this.connectToDiscord();
          if (!result.success) {
            throw result.error || new Error('Connection failed');
          }
        },
        timeout: this.startupConfig.connectionTimeout,
        critical: true
      },
      {
        name: 'wait_for_ready',
        execute: this.waitForReady.bind(this),
        timeout: this.startupConfig.connectionTimeout,
        critical: true
      },
      {
        name: 'set_presence',
        execute: this.setPresence.bind(this),
        timeout: 5000,
        critical: false
      },
      {
        name: 'start_health_monitoring',
        execute: this.startHealthMonitoring.bind(this),
        timeout: 3000,
        critical: false
      }
    ];
  }

  /**
   * Execute the complete startup sequence
   */
  public async executeStartup(): Promise<{ success: boolean; client?: Client; error?: Error }> {
    this.logger.info('Starting bot startup sequence...');
    
    try {
      await this.emitEvent({
        type: LifecycleEventType.STATE_CHANGED,
        timestamp: new Date(),
        data: {
          currentState: BotState.INITIALIZING,
          metadata: { step: 'startup_initiated' }
        }
      });

      for (let attempt = 1; attempt <= this.startupConfig.maxRetries; attempt++) {
        try {
          this.logger.info(`Startup attempt ${attempt}/${this.startupConfig.maxRetries}`);
          
          const result = await this.executeStartupSteps();
          
          if (result.success) {
            this.logger.info('Bot startup completed successfully');
            await this.emitEvent({
              type: LifecycleEventType.STATE_CHANGED,
              timestamp: new Date(),
              data: {
                currentState: BotState.READY,
                metadata: { 
                  startupTime: Date.now(),
                  attempt 
                }
              }
            });
            
            return result;
          } else {
            throw result.error || new Error('Unknown startup error');
          }
          
        } catch (error) {
          this.logger.error(`Startup attempt ${attempt} failed:`, error as Error);
          
          if (attempt === this.startupConfig.maxRetries) {
            this.logger.error('All startup attempts failed, giving up');
            await this.emitEvent({
              type: LifecycleEventType.ERROR_OCCURRED,
              timestamp: new Date(),
              data: {
                error: error as Error,
                metadata: { 
                  totalAttempts: attempt,
                  lastFailure: true
                }
              }
            });
            
            return { success: false, error: error as Error };
          }
          
          // Wait before retry
          if (attempt < this.startupConfig.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            this.logger.info(`Waiting ${delay}ms before retry...`);
            await this.sleep(delay);
          }
        }
      }
      
      return { success: false, error: new Error('Max retries exceeded') };
      
    } catch (error) {
      this.logger.error('Critical startup error:', error as Error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Execute all startup steps in sequence
   */
  private async executeStartupSteps(): Promise<{ success: boolean; client?: Client; error?: Error }> {
    let client: Client | undefined;
    
    for (const step of this.startupSteps) {
      this.logger.debug(`Executing startup step: ${step.name}`);
      
      try {
        const result = await this.executeStepWithTimeout(step);
        
        if (step.name === 'connect_to_discord' && result.client) {
          client = result.client;
        }
        
        this.logger.debug(`Step ${step.name} completed successfully`);
        
      } catch (error) {
        this.logger.error(`Step ${step.name} failed:`, error as Error);
        
        if (step.critical) {
          // Cleanup on critical failure
          if (client) {
            try {
              client.destroy();
            } catch (cleanupError) {
              this.logger.warn('Failed to cleanup client after critical failure:', cleanupError as Error);
            }
          }
          
          return { success: false, error: error as Error };
        } else {
          // Non-critical steps can be skipped
          this.logger.warn(`Non-critical step ${step.name} failed, continuing...`);
        }
      }
    }
    
    return { success: true, client };
  }

  /**
   * Execute a single step with timeout
   */
  private async executeStepWithTimeout(step: {
    name: string;
    execute: () => Promise<void>;
    timeout: number;
    critical: boolean;
  }): Promise<{ success: boolean; client?: Client; error?: Error }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ 
          success: false, 
          error: new Error(`Step ${step.name} timed out after ${step.timeout}ms`) 
        });
      }, step.timeout);

      step.execute()
        .then(() => {
          clearTimeout(timeout);
          resolve({ success: true });
        })
        .catch((error) => {
          clearTimeout(timeout);
          resolve({ success: false, error });
        });
    });
  }

  /**
   * Validate bot configuration
   */
  private async validateConfiguration(): Promise<void> {
    this.logger.debug('Validating bot configuration...');
    
    const requiredFields = ['token', 'clientId', 'guildId', 'prefix', 'intents'];
    
    for (const field of requiredFields) {
      if (!this.config[field as keyof BotConfig]) {
        throw new ConfigError(
          `Missing required configuration field: ${field}`,
          'MISSING_CONFIG_FIELD',
          { field, config: this.config }
        );
      }
    }
    
    if (!Array.isArray(this.config.intents) || this.config.intents.length === 0) {
      throw new ConfigError(
        'Intents must be a non-empty array',
        'INVALID_INTENTS',
        { intents: this.config.intents }
      );
    }
    
    if (typeof this.config.prefix !== 'string' || this.config.prefix.length === 0) {
      throw new ConfigError(
        'Prefix must be a non-empty string',
        'INVALID_PREFIX',
        { prefix: this.config.prefix }
      );
    }
    
    this.logger.debug('Configuration validation passed');
  }

  /**
   * Initialize logging system
   */
  private async initializeLogging(): Promise<void> {
    this.logger.debug('Initializing logging system...');
    
    // Logging is already initialized in constructor
    // This step can be used for additional logging setup
    
    this.logger.debug('Logging system initialized');
  }

  /**
   * Create Discord client (handled by connection manager)
   */
  private async createDiscordClient(): Promise<void> {
    this.logger.debug('Creating Discord client...');
    // This will be handled by connection manager
    this.logger.debug('Discord client creation delegated to connection manager');
  }

  /**
   * Setup event handlers (handled by connection manager)
   */
  private async setupEventHandlers(): Promise<void> {
    this.logger.debug('Setting up event handlers...');
    // This will be handled by connection manager
    this.logger.debug('Event handlers setup delegated to connection manager');
  }

  /**
   * Connect to Discord
   */
  private async connectToDiscord(): Promise<{ client?: Client; success: boolean; error?: Error }> {
    this.logger.debug('Connecting to Discord...');
    
    // This will be handled by the main lifecycle orchestrator
    // Returning placeholder for now
    return { success: true };
  }

  /**
   * Wait for bot to be ready
   */
  private async waitForReady(): Promise<void> {
    this.logger.debug('Waiting for bot to be ready...');
    // This will be handled by connection manager events
    this.logger.debug('Ready wait delegated to connection manager');
  }

  /**
   * Set bot presence
   */
  private async setPresence(): Promise<void> {
    this.logger.debug('Setting bot presence...');
    
    if (this.config.presence) {
      this.logger.debug('Presence configured:', this.config.presence);
    } else {
      this.logger.debug('No presence configuration found');
    }
  }

  /**
   * Start health monitoring
   */
  private async startHealthMonitoring(): Promise<void> {
    this.logger.debug('Starting health monitoring...');
    this.logger.debug(`Health monitoring interval: ${this.startupConfig.healthCheckInterval}ms`);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.startupConfig.retryDelay;
    const maxDelay = 30000; // 30 seconds max
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    return delay;
  }

  /**
   * Sleep helper function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
   * Get startup configuration
   */
  public getStartupConfig(): StartupConfig {
    return { ...this.startupConfig };
  }

  /**
   * Update startup configuration
   */
  public updateStartupConfig(config: Partial<StartupConfig>): void {
    this.startupConfig = { ...this.startupConfig, ...config };
    this.logger.debug('Startup configuration updated:', config);
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    this.listeners.clear();
    this.logger.debug('Startup manager cleaned up');
  }
}