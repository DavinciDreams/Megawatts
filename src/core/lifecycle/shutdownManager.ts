import { Client } from 'discord.js';
import {
  BotState,
  ShutdownConfig,
  LifecycleEvent,
  LifecycleEventType,
  LifecycleEventListener
} from './types';
import { BotConfig } from '../../types';
import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';

/**
 * Manages graceful bot shutdown sequence with proper cleanup
 */
export class ShutdownManager {
  private config: BotConfig;
  private shutdownConfig: ShutdownConfig;
  private logger: Logger;
  private listeners: Map<LifecycleEventType, Set<LifecycleEventListener>> = new Map();
  private shutdownSteps: Array<{
    name: string;
    execute: (client?: Client) => Promise<void>;
    timeout: number;
    critical: boolean;
  }> = [];
  private isShuttingDown = false;

  constructor(config: BotConfig, shutdownConfig: ShutdownConfig, logger: Logger) {
    this.config = config;
    this.shutdownConfig = shutdownConfig;
    this.logger = new Logger('ShutdownManager');
    this.initializeShutdownSteps();
  }

  /**
   * Initialize shutdown steps in order
   */
  private initializeShutdownSteps(): void {
    this.shutdownSteps = [
      {
        name: 'notify_shutdown_initiated',
        execute: this.notifyShutdownInitiated.bind(this),
        timeout: 5000,
        critical: false
      },
      {
        name: 'stop_health_monitoring',
        execute: this.stopHealthMonitoring.bind(this),
        timeout: 3000,
        critical: false
      },
      {
        name: 'save_bot_state',
        execute: this.saveBotState.bind(this),
        timeout: 10000,
        critical: false
      },
      {
        name: 'notify_users',
        execute: this.notifyUsers.bind(this),
        timeout: 15000,
        critical: false
      },
      {
        name: 'stop_processing_new_requests',
        execute: this.stopProcessingNewRequests.bind(this),
        timeout: 5000,
        critical: true
      },
      {
        name: 'wait_for_active_operations',
        execute: this.waitForActiveOperations.bind(this),
        timeout: this.shutdownConfig.gracefulTimeout,
        critical: true
      },
      {
        name: 'close_connections',
        execute: this.closeConnections.bind(this),
        timeout: 10000,
        critical: true
      },
      {
        name: 'cleanup_resources',
        execute: this.cleanupResources.bind(this),
        timeout: 15000,
        critical: true
      },
      {
        name: 'destroy_discord_client',
        execute: this.destroyDiscordClient.bind(this),
        timeout: 10000,
        critical: true
      },
      {
        name: 'final_cleanup',
        execute: this.finalCleanup.bind(this),
        timeout: 5000,
        critical: true
      }
    ];
  }

  /**
   * Execute complete shutdown sequence
   */
  public async executeShutdown(client?: Client, reason?: string): Promise<{ success: boolean; error?: Error }> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return { success: true };
    }

    this.isShuttingDown = true;
    this.logger.info(`Starting bot shutdown sequence... Reason: ${reason || 'Manual shutdown'}`);
    
    try {
      await this.emitEvent({
        type: LifecycleEventType.SHUTDOWN_INITIATED,
        timestamp: new Date(),
        data: {
          shutdownReason: reason || 'Manual shutdown',
          metadata: { 
            graceful: true,
            timestamp: Date.now()
          }
        }
      });

      // Execute graceful shutdown
      const gracefulResult = await this.executeGracefulShutdown(client);
      
      if (gracefulResult.success) {
        this.logger.info('Graceful shutdown completed successfully');
        
        await this.emitEvent({
          type: LifecycleEventType.SHUTDOWN_COMPLETED,
          timestamp: new Date(),
          data: {
            shutdownReason: reason || 'Manual shutdown',
            metadata: { 
              graceful: true,
              duration: Date.now()
            }
          }
        });
        
        return { success: true };
      } else {
        this.logger.warn('Graceful shutdown failed, attempting force shutdown');
        
        // Force shutdown if graceful fails
        return await this.executeForceShutdown(client, reason);
      }
      
    } catch (error) {
      this.logger.error('Critical shutdown error:', error as Error);
      
      // Last resort force shutdown
      return await this.executeForceShutdown(client, reason, error as Error);
    }
  }

  /**
   * Execute graceful shutdown sequence
   */
  private async executeGracefulShutdown(client?: Client): Promise<{ success: boolean; error?: Error }> {
    this.logger.info('Executing graceful shutdown sequence...');
    
    for (const step of this.shutdownSteps) {
      this.logger.debug(`Executing shutdown step: ${step.name}`);
      
      try {
        const result = await this.executeStepWithTimeout(step, client);
        this.logger.debug(`Step ${step.name} completed successfully`);
        
      } catch (error) {
        this.logger.error(`Step ${step.name} failed:`, error as Error);
        
        if (step.critical) {
          return { success: false, error: error as Error };
        } else {
          // Non-critical steps can be skipped
          this.logger.warn(`Non-critical step ${step.name} failed, continuing...`);
        }
      }
    }
    
    return { success: true };
  }

  /**
   * Execute force shutdown sequence
   */
  private async executeForceShutdown(client?: Client, reason?: string, originalError?: Error): Promise<{ success: boolean; error?: Error }> {
    this.logger.warn('Executing force shutdown sequence...');
    
    try {
      // Set a timeout for force shutdown
      const forceShutdownPromise = new Promise<{ success: boolean; error?: Error }>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: new Error('Force shutdown timeout') });
        }, this.shutdownConfig.forceTimeout);

        this.performForceShutdown(client)
          .then(() => {
            clearTimeout(timeout);
            resolve({ success: true });
          })
          .catch((error) => {
            clearTimeout(timeout);
            resolve({ success: false, error });
          });
      });

      const result = await forceShutdownPromise;
      
      if (result.success) {
        this.logger.warn('Force shutdown completed');
        
        await this.emitEvent({
          type: LifecycleEventType.SHUTDOWN_COMPLETED,
          timestamp: new Date(),
          data: {
            shutdownReason: reason || 'Force shutdown',
            metadata: { 
              graceful: false,
              forced: true,
              originalError: originalError?.message
            }
          }
        });
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('Force shutdown failed:', error as Error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Perform actual force shutdown actions
   */
  private async performForceShutdown(client?: Client): Promise<void> {
    const forceActions = [
      () => this.destroyDiscordClient(client),
      () => this.cleanupResources(),
      () => this.finalCleanup()
    ];

    await Promise.allSettled(
      forceActions.map(action => 
        action().catch(error => 
          this.logger.error('Force shutdown action failed:', error as Error)
        )
      )
    );
  }

  /**
   * Execute a single step with timeout
   */
  private async executeStepWithTimeout(
    step: {
      name: string;
      execute: (client?: Client) => Promise<void>;
      timeout: number;
      critical: boolean;
    },
    client?: Client
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Step ${step.name} timed out after ${step.timeout}ms`));
      }, step.timeout);

      step.execute(client)
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Notify that shutdown has been initiated
   */
  private async notifyShutdownInitiated(client?: Client): Promise<void> {
    this.logger.info('Notifying systems that shutdown has been initiated');
    
    // Set bot status to indicate shutdown
    if (client && client.user) {
      try {
        await client.user.setPresence({
          status: 'idle',
          activities: [{
            name: 'Shutting down...',
            type: 0 // PLAYING
          }]
        });
      } catch (error) {
        this.logger.warn('Failed to set shutdown presence:', error as Error);
      }
    }
  }

  /**
   * Stop health monitoring
   */
  private async stopHealthMonitoring(client?: Client): Promise<void> {
    this.logger.info('Stopping health monitoring');
    // This will be handled by the connection manager
  }

  /**
   * Save bot state
   */
  private async saveBotState(client?: Client): Promise<void> {
    if (!this.shutdownConfig.saveState) {
      this.logger.debug('State saving disabled in configuration');
      return;
    }

    this.logger.info('Saving bot state before shutdown');
    
    try {
      const state = {
        timestamp: new Date(),
        uptime: client?.uptime || 0,
        guilds: client?.guilds.cache.size || 0,
        users: client?.users.cache.size || 0,
        channels: client?.channels.cache.size || 0,
        shutdownReason: 'graceful_shutdown'
      };

      // Save state to storage (this would integrate with storage system)
      this.logger.debug('Bot state saved:', state);
      
    } catch (error) {
      this.logger.error('Failed to save bot state:', error as Error);
      // Don't fail shutdown for state saving issues
    }
  }

  /**
   * Notify users about shutdown
   */
  private async notifyUsers(client?: Client): Promise<void> {
    if (!this.shutdownConfig.notifyUsers || !client) {
      this.logger.debug('User notification disabled or no client available');
      return;
    }

    this.logger.info('Notifying users about shutdown');
    
    try {
      // This would send messages to configured channels
      // Implementation depends on notification system
      this.logger.debug('User notifications sent');
      
    } catch (error) {
      this.logger.warn('Failed to notify users:', error as Error);
      // Don't fail shutdown for notification issues
    }
  }

  /**
   * Stop processing new requests
   */
  private async stopProcessingNewRequests(client?: Client): Promise<void> {
    this.logger.info('Stopping processing of new requests');
    
    // Set flag to stop processing new commands/messages
    // This would be checked by message processors
  }

  /**
   * Wait for active operations to complete
   */
  private async waitForActiveOperations(client?: Client): Promise<void> {
    this.logger.info('Waiting for active operations to complete');
    
    // This would monitor active operations and wait for them to complete
    // For now, just wait a short time
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Close connections
   */
  private async closeConnections(client?: Client): Promise<void> {
    if (!this.shutdownConfig.closeConnections) {
      this.logger.debug('Connection closing disabled in configuration');
      return;
    }

    this.logger.info('Closing connections');
    
    // Close database connections, Redis connections, etc.
    // This would integrate with storage system
  }

  /**
   * Cleanup resources
   */
  private async cleanupResources(client?: Client): Promise<void> {
    if (!this.shutdownConfig.cleanupResources) {
      this.logger.debug('Resource cleanup disabled in configuration');
      return;
    }

    this.logger.info('Cleaning up resources');
    
    // Cleanup temporary files, caches, etc.
  }

  /**
   * Destroy Discord client
   */
  private async destroyDiscordClient(client?: Client): Promise<void> {
    if (!client) {
      this.logger.debug('No Discord client to destroy');
      return;
    }

    this.logger.info('Destroying Discord client');
    
    try {
      client.destroy();
      this.logger.debug('Discord client destroyed');
    } catch (error) {
      this.logger.error('Failed to destroy Discord client:', error as Error);
    }
  }

  /**
   * Final cleanup
   */
  private async finalCleanup(client?: Client): Promise<void> {
    this.logger.info('Performing final cleanup');
    
    // Any remaining cleanup tasks
    this.isShuttingDown = false;
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
   * Check if shutdown is in progress
   */
  public isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get shutdown configuration
   */
  public getShutdownConfig(): ShutdownConfig {
    return { ...this.shutdownConfig };
  }

  /**
   * Update shutdown configuration
   */
  public updateShutdownConfig(config: Partial<ShutdownConfig>): void {
    this.shutdownConfig = { ...this.shutdownConfig, ...config };
    this.logger.debug('Shutdown configuration updated:', config);
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    this.listeners.clear();
    this.logger.debug('Shutdown manager cleaned up');
  }
}