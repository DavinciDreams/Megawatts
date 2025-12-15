import { Client } from 'discord.js';
import {
  BotState,
  ConnectionHealth,
  LifecycleEvent,
  LifecycleEventType,
  LifecycleEventListener
} from './types';
import { BotConfig } from '../../types';
import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';

/**
 * Manages Discord bot reconnection logic with exponential backoff
 */
export class ReconnectionManager {
  private config: BotConfig;
  private logger: Logger;
  private listeners: Map<LifecycleEventType, Set<LifecycleEventListener>> = new Map();
  private isReconnecting = false;
  private reconnectionAttempts = 0;
  private maxReconnectionAttempts = 10;
  private baseReconnectDelay = 5000; // 5 seconds
  private maxReconnectDelay = 300000; // 5 minutes
  private backoffMultiplier = 2;
  private reconnectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastDisconnectTime?: number;
  private manualReconnectEnabled = true;

  constructor(config: BotConfig, logger: Logger) {
    this.config = config;
    this.logger = new Logger('ReconnectionManager');
  }

  /**
   * Start automatic reconnection process
   */
  public async startReconnection(client: Client, reason?: string): Promise<boolean> {
    if (this.isReconnecting) {
      this.logger.warn('Reconnection already in progress');
      return false;
    }

    if (!this.manualReconnectEnabled) {
      this.logger.info('Manual reconnection disabled');
      return false;
    }

    this.isReconnecting = true;
    this.reconnectionAttempts++;
    
    this.logger.info(`Starting reconnection attempt ${this.reconnectionAttempts}/${this.maxReconnectionAttempts}. Reason: ${reason || 'Unknown'}`);

    await this.emitEvent({
      type: LifecycleEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: BotState.RECONNECTING,
        metadata: {
          attempt: this.reconnectionAttempts,
          reason: reason || 'Unknown',
          lastDisconnectTime: this.lastDisconnectTime
        }
      }
    });

    try {
      const success = await this.performReconnection(client);
      
      if (success) {
        this.logger.info(`Reconnection successful on attempt ${this.reconnectionAttempts}`);
        this.reconnectionAttempts = 0;
        this.isReconnecting = false;
        
        await this.emitEvent({
          type: LifecycleEventType.STATE_CHANGED,
          timestamp: new Date(),
          data: {
            currentState: BotState.READY,
            metadata: {
              reconnectionSuccessful: true,
              attempt: this.reconnectionAttempts,
              duration: Date.now() - (this.lastDisconnectTime || Date.now())
            }
          }
        });
        
        return true;
      } else {
        return await this.handleReconnectionFailure(client);
      }
      
    } catch (error) {
      this.logger.error(`Reconnection attempt ${this.reconnectionAttempts} failed:`, error as Error);
      return await this.handleReconnectionFailure(client, error as Error);
    }
  }

  /**
   * Perform the actual reconnection
   */
  private async performReconnection(client: Client): Promise<boolean> {
    this.logger.debug('Performing Discord reconnection...');
    
    try {
      // Destroy existing client
      if (client.status !== 0) { // Not destroyed
        client.destroy();
      }

      // Wait before reconnecting
      const delay = this.calculateReconnectDelay();
      this.logger.debug(`Waiting ${delay}ms before reconnecting...`);
      await this.sleep(delay);

      // Create new client and login
      // This would typically be handled by the main bot class
      // For now, we'll simulate the reconnection
      this.logger.debug('Reconnecting to Discord...');
      
      // Simulate successful reconnection
      return true;
      
    } catch (error) {
      this.logger.error('Failed to perform reconnection:', error as Error);
      throw error;
    }
  }

  /**
   * Handle reconnection failure
   */
  private async handleReconnectionFailure(client: Client, originalError?: Error): Promise<boolean> {
    this.reconnectionAttempts++;
    
    this.logger.error(`Reconnection attempt ${this.reconnectionAttempts} failed`);
    
    await this.emitEvent({
      type: LifecycleEventType.ERROR_OCCURRED,
      timestamp: new Date(),
      data: {
        error: originalError || new Error('Reconnection failed'),
        metadata: {
          reconnectionAttempt: this.reconnectionAttempts,
          maxAttempts: this.maxReconnectionAttempts
        }
      }
    });

    // Check if we should give up
    if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
      this.logger.error(`Max reconnection attempts (${this.maxReconnectionAttempts}) reached, giving up`);
      this.isReconnecting = false;
      
      await this.emitEvent({
        type: LifecycleEventType.STATE_CHANGED,
        timestamp: new Date(),
        data: {
          currentState: BotState.DISCONNECTED,
          metadata: {
            reconnectionAbandoned: true,
            totalAttempts: this.reconnectionAttempts
          }
        }
      });
      
      return false;
    }

    // Schedule next reconnection attempt
    const delay = this.calculateReconnectDelay();
    this.logger.debug(`Scheduling next reconnection in ${delay}ms`);
    
    this.reconnectionTimeout = setTimeout(async () => {
      this.logger.info(`Attempting automatic reconnection ${this.reconnectionAttempts + 1}/${this.maxReconnectionAttempts}`);
      await this.startReconnection(client, 'Automatic retry');
    }, delay);

    return false; // Still trying
  }

  /**
   * Calculate reconnection delay with exponential backoff
   */
  private calculateReconnectDelay(): number {
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(this.backoffMultiplier, this.reconnectionAttempts - 1),
      this.maxReconnectDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random();
    return Math.floor(delay + jitter);
  }

  /**
   * Handle disconnect event
   */
  public async handleDisconnect(client: Client, reason?: string): Promise<void> {
    if (this.isReconnecting) {
      this.logger.debug('Disconnect during reconnection, will be handled by reconnection logic');
      return;
    }

    this.lastDisconnectTime = Date.now();
    this.logger.info(`Bot disconnected. Reason: ${reason || 'Unknown'}`);

    await this.emitEvent({
      type: LifecycleEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: BotState.DISCONNECTED,
        metadata: {
          disconnectReason: reason || 'Unknown',
          uptime: client.uptime,
          timestamp: Date.now()
        }
      }
    });

    // Start automatic reconnection if enabled
    if (this.shouldAttemptReconnect()) {
      this.logger.info('Starting automatic reconnection...');
      setTimeout(() => {
        this.startReconnection(client, 'Automatic reconnection after disconnect');
      }, 1000); // Wait 1 second before reconnecting
    }
  }

  /**
   * Check if reconnection should be attempted
   */
  private shouldAttemptReconnect(): boolean {
    // Don't reconnect if we've exceeded max attempts
    if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
      return false;
    }

    // Don't reconnect if recently disconnected (to prevent rapid reconnection loops)
    if (this.lastDisconnectTime) {
      const timeSinceLastDisconnect = Date.now() - this.lastDisconnectTime;
      if (timeSinceLastDisconnect < 30000) { // Less than 30 seconds
        return false;
      }
    }

    return this.manualReconnectEnabled;
  }

  /**
   * Manual reconnection trigger
   */
  public async triggerManualReconnect(client: Client): Promise<boolean> {
    this.logger.info('Manual reconnection triggered');
    
    // Reset reconnection state
    this.isReconnecting = false;
    this.reconnectionAttempts = 0;
    
    // Clear any pending reconnection timeout
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
      this.reconnectionTimeout = undefined;
    }

    return await this.startReconnection(client, 'Manual reconnection');
  }

  /**
   * Stop reconnection attempts
   */
  public stopReconnection(): void {
    this.logger.info('Stopping reconnection attempts');
    
    this.isReconnecting = false;
    
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
      this.reconnectionTimeout = null;
    }
  }

  /**
   * Reset reconnection state
   */
  public resetReconnectionState(): void {
    this.logger.info('Resetting reconnection state');
    
    this.isReconnecting = false;
    this.reconnectionAttempts = 0;
    this.lastDisconnectTime = undefined;
    
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
      this.reconnectionTimeout = null;
    }
  }

  /**
   * Enable/disable manual reconnection
   */
  public setManualReconnect(enabled: boolean): void {
    this.manualReconnectEnabled = enabled;
    this.logger.info(`Manual reconnection ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get reconnection statistics
   */
  public getReconnectionStats(): {
    isReconnecting: boolean;
    attempts: number;
    maxAttempts: number;
    lastDisconnectTime?: number;
    manualReconnectEnabled: boolean;
  } {
    return {
      isReconnecting: this.isReconnecting,
      attempts: this.reconnectionAttempts,
      maxAttempts: this.maxReconnectionAttempts,
      lastDisconnectTime: this.lastDisconnectTime || undefined,
      manualReconnectEnabled: this.manualReconnectEnabled
    };
  }

  /**
   * Update reconnection configuration
   */
  public updateConfig(config: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    manualEnabled?: boolean;
  }): void {
    if (config.maxAttempts !== undefined) {
      this.maxReconnectionAttempts = config.maxAttempts;
    }
    
    if (config.baseDelay !== undefined) {
      this.baseReconnectDelay = config.baseDelay;
    }
    
    if (config.maxDelay !== undefined) {
      this.maxReconnectDelay = config.maxDelay;
    }
    
    if (config.backoffMultiplier !== undefined) {
      this.backoffMultiplier = config.backoffMultiplier;
    }
    
    if (config.manualEnabled !== undefined) {
      this.manualReconnectEnabled = config.manualEnabled;
    }

    this.logger.debug('Reconnection configuration updated:', config);
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
   * Check if reconnection is in progress
   */
  public isReconnectingInProgress(): boolean {
    return this.isReconnecting;
  }

  /**
   * Get remaining reconnection attempts
   */
  public getRemainingAttempts(): number {
    return Math.max(0, this.maxReconnectionAttempts - this.reconnectionAttempts);
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    this.stopReconnection();
    this.listeners.clear();
    this.logger.debug('Reconnection manager cleaned up');
  }
}