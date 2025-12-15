import { Client } from 'discord.js';
import {
  BotState,
  ConnectionHealth,
  LifecycleConfig,
  LifecycleEvent,
  LifecycleEventType,
  LifecycleEventListener,
  ConnectionStateSnapshot
} from './types';
import { BotConfig } from '../../types';
import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';
import { ConnectionManager } from './connectionManager';
import { StartupManager } from './startupManager';
import { ShutdownManager } from './shutdownManager';
import { ErrorRecoveryManager } from './errorRecovery';
import { ReconnectionManager } from './reconnectionManager';

/**
 * Main lifecycle orchestrator that coordinates all lifecycle management components
 */
export class LifecycleOrchestrator {
  private config: BotConfig;
  private lifecycleConfig: LifecycleConfig;
  private logger: Logger;
  private listeners: Map<LifecycleEventType, Set<LifecycleEventListener>> = new Map();
  
  // Component managers
  private connectionManager!: ConnectionManager;
  private startupManager!: StartupManager;
  private shutdownManager!: ShutdownManager;
  private errorRecoveryManager!: ErrorRecoveryManager;
  private reconnectionManager!: ReconnectionManager;
  
  // State tracking
  private currentState: BotState = BotState.INITIALIZING;
  private client?: Client;
  private isLifecycleRunning = false;
  private healthCheckInterval?: ReturnType<typeof setInterval> | null;

  constructor(config: BotConfig, lifecycleConfig: LifecycleConfig, logger: Logger) {
    this.config = config;
    this.lifecycleConfig = lifecycleConfig;
    this.logger = new Logger('LifecycleOrchestrator');
    
    this.initializeManagers();
    this.setupEventForwarding();
  }

  /**
   * Initialize all component managers
   */
  private initializeManagers(): void {
    this.logger.debug('Initializing lifecycle managers...');
    
    this.connectionManager = new ConnectionManager(this.config, this.logger);
    this.startupManager = new StartupManager(this.config, this.lifecycleConfig.startup, this.logger);
    this.shutdownManager = new ShutdownManager(this.config, this.lifecycleConfig.shutdown, this.logger);
    this.errorRecoveryManager = new ErrorRecoveryManager(this.lifecycleConfig.recovery, this.logger);
    this.reconnectionManager = new ReconnectionManager(this.config, this.logger);
    
    this.logger.debug('Lifecycle managers initialized');
  }

  /**
   * Setup event forwarding between managers
   */
  private setupEventForwarding(): void {
    this.logger.debug('Setting up event forwarding between managers...');
    
    // Forward connection manager events to orchestrator
    this.connectionManager.addEventListener(LifecycleEventType.STATE_CHANGED, this.handleConnectionStateChange.bind(this));
    this.connectionManager.addEventListener(LifecycleEventType.CONNECTION_HEALTH_CHANGED, this.handleConnectionHealthChange.bind(this));
    this.connectionManager.addEventListener(LifecycleEventType.ERROR_OCCURRED, this.handleConnectionError.bind(this));
    
    // Forward startup manager events
    this.startupManager.addEventListener(LifecycleEventType.STATE_CHANGED, this.handleStartupStateChange.bind(this));
    this.startupManager.addEventListener(LifecycleEventType.ERROR_OCCURRED, this.handleStartupError.bind(this));
    
    // Forward shutdown Manager events
    this.shutdownManager.addEventListener(LifecycleEventType.SHUTDOWN_INITIATED, this.handleShutdownInitiated.bind(this));
    this.shutdownManager.addEventListener(LifecycleEventType.SHUTDOWN_COMPLETED, this.handleShutdownCompleted.bind(this));
    
    // Forward error recovery events
    this.errorRecoveryManager.addEventListener(LifecycleEventType.RECOVERY_ATTEMPTED, this.handleRecoveryAttempted.bind(this));
    this.errorRecoveryManager.addEventListener(LifecycleEventType.RECOVERY_COMPLETED, this.handleRecoveryCompleted.bind(this));
    this.errorRecoveryManager.addEventListener(LifecycleEventType.RECOVERY_FAILED, this.handleRecoveryFailed.bind(this));
    
    // Forward reconnection events
    this.reconnectionManager.addEventListener(LifecycleEventType.STATE_CHANGED, this.handleReconnectionStateChange.bind(this));
    
    this.logger.debug('Event forwarding setup completed');
  }

  /**
   * Start the bot lifecycle
   */
  public async start(): Promise<{ success: boolean; client?: Client; error?: Error }> {
    if (this.isLifecycleRunning) {
      this.logger.warn('Bot is already running');
      return { success: false, error: new Error('Bot already running') };
    }

    this.logger.info('Starting bot lifecycle...');
    this.isLifecycleRunning = true;
    this.currentState = BotState.INITIALIZING;

    try {
      await this.emitEvent({
        type: LifecycleEventType.STATE_CHANGED,
        timestamp: new Date(),
        data: {
          currentState: BotState.INITIALIZING,
          metadata: { phase: 'lifecycle_start' }
        }
      });

      // Execute startup sequence
      const startupResult = await this.startupManager.executeStartup();
      
      if (!startupResult.success) {
        this.currentState = BotState.ERROR;
        await this.emitEvent({
          type: LifecycleEventType.STATE_CHANGED,
          timestamp: new Date(),
          data: {
            currentState: BotState.ERROR,
            metadata: { 
              phase: 'startup_failed',
              error: startupResult.error?.message
            }
          }
        });
        
        return { success: false, error: startupResult.error };
      }

      this.client = startupResult.client;
      
      // Setup client in other managers
      this.setupClientInManagers();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.currentState = BotState.READY;
      
      await this.emitEvent({
        type: LifecycleEventType.STATE_CHANGED,
        timestamp: new Date(),
        data: {
          currentState: BotState.READY,
          metadata: { 
            phase: 'lifecycle_ready',
            startupTime: Date.now()
          }
        }
      });

      this.logger.info('Bot lifecycle started successfully');
      return { success: true, client: this.client };
      
    } catch (error) {
      this.currentState = BotState.ERROR;
      this.logger.error('Failed to start bot lifecycle:', error as Error);
      
      await this.emitEvent({
        type: LifecycleEventType.STATE_CHANGED,
        timestamp: new Date(),
        data: {
          currentState: BotState.ERROR,
          metadata: { 
            phase: 'lifecycle_failed',
            error: error as Error
          }
        }
      });
      
      return { success: false, error: error as Error };
    }
  }

  /**
   * Setup client in all managers
   */
  private setupClientInManagers(): void {
    if (!this.client) {
      this.logger.warn('No client available for manager setup');
      return;
    }

    // This would be used by managers that need direct client access
    // For now, we'll rely on the connection manager's client
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.connectionManager.performHealthCheck();
        
        if (!health.isHealthy) {
          this.logger.warn('Health check detected issues:', health.issues);
          
          // Trigger error recovery for health issues
          if (health.issues.length > 0) {
            const error = new BotError(
              `Health issues detected: ${health.issues.join(', ')}`,
              'medium',
              { healthIssues: health.issues, healthStatus: health.healthStatus }
            );
            
            await this.errorRecoveryManager.handleError(error);
          }
        }
        
      } catch (error) {
        this.logger.error('Health check failed:', error as Error);
      }
    }, this.lifecycleConfig.startup.healthCheckInterval);
  }

  /**
   * Stop the bot lifecycle
   */
  public async stop(reason?: string): Promise<{ success: boolean; error?: Error }> {
    if (!this.isRunning) {
      this.logger.warn('Bot is not running');
      return { success: false, error: new Error('Bot is not running') };
    }

    this.logger.info(`Stopping bot lifecycle. Reason: ${reason || 'Manual stop'}`);
    this.currentState = BotState.SHUTTING_DOWN;

    try {
      await this.emitEvent({
        type: LifecycleEventType.SHUTDOWN_INITIATED,
        timestamp: new Date(),
        data: {
          shutdownReason: reason || 'Manual stop',
          metadata: { phase: 'lifecycle_shutdown_start' }
        }
      });

      // Stop health monitoring
      this.stopHealthMonitoring();
      
      // Execute shutdown sequence
      const shutdownResult = await this.shutdownManager.executeShutdown(this.client, reason);
      
      if (shutdownResult.success) {
        this.currentState = BotState.SHUTDOWN;
        
        await this.emitEvent({
          type: LifecycleEventType.SHUTDOWN_COMPLETED,
          timestamp: new Date(),
          data: {
            shutdownReason: reason || 'Manual stop',
            metadata: { 
              phase: 'lifecycle_shutdown_complete',
              graceful: true
            }
          }
        });

        this.logger.info('Bot lifecycle stopped successfully');
        return { success: true };
      } else {
        this.currentState = BotState.ERROR;
        
        await this.emitEvent({
          type: LifecycleEventType.ERROR_OCCURRED,
          timestamp: new Date(),
          data: {
            error: shutdownResult.error || new Error('Unknown shutdown error'),
            metadata: { phase: 'lifecycle_shutdown_failed' }
          }
        });

        return { success: false, error: shutdownResult.error };
      }
      
    } catch (error) {
      this.currentState = BotState.ERROR;
      this.logger.error('Failed to stop bot lifecycle:', error as Error);
      
      return { success: false, error: error as Error };
    }
  }

  /**
   * Handle connection state changes
   */
  private async handleConnectionStateChange(event: LifecycleEvent): Promise<void> {
    this.logger.debug('Connection state changed:', event.data.currentState);
    
    // Update orchestrator state if it's a major state change
    if (event.data.currentState && 
        [BotState.READY, BotState.DISCONNECTED, BotState.ERROR].includes(event.data.currentState)) {
      this.currentState = event.data.currentState;
      
      await this.emitEvent({
        type: LifecycleEventType.STATE_CHANGED,
        timestamp: new Date(),
        data: {
          currentState: this.currentState,
          previousState: event.data.previousState,
          metadata: {
            source: 'connection_manager'
          }
        }
      });
    }
  }

  /**
   * Handle connection health changes
   */
  private async handleConnectionHealthChange(event: LifecycleEvent): Promise<void> {
    this.logger.debug('Connection health changed:', event.data.healthStatus);
    
    // Forward to external listeners
    await this.emitEvent({
      type: LifecycleEventType.CONNECTION_HEALTH_CHANGED,
      timestamp: new Date(),
      data: {
        healthStatus: event.data.healthStatus,
        metadata: { source: 'connection_manager' }
      }
    });
  }

  /**
   * Handle connection errors
   */
  private async handleConnectionError(event: LifecycleEvent): Promise<void> {
    this.logger.error('Connection error:', event.data.error);
    
    // Try to recover from connection errors
    if (event.data.error) {
      await this.errorRecoveryManager.handleError(event.data.error);
    }
    
    // Forward to external listeners
    await this.emitEvent({
      type: LifecycleEventType.ERROR_OCCURRED,
      timestamp: new Date(),
      data: {
        error: event.data.error,
        metadata: { source: 'connection_manager' }
      }
    });
  }

  /**
   * Handle startup state changes
   */
  private async handleStartupStateChange(event: LifecycleEvent): Promise<void> {
    this.logger.debug('Startup state changed:', event.data.currentState);
    
    // Forward to external listeners
    await this.emitEvent({
      type: LifecycleEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: event.data.currentState,
        metadata: { source: 'startup_manager' }
      }
    });
  }

  /**
   * Handle startup errors
   */
  private async handleStartupError(event: LifecycleEvent): Promise<void> {
    this.logger.error('Startup error:', event.data.error);
    
    // Forward to external listeners
    await this.emitEvent({
      type: LifecycleEventType.ERROR_OCCURRED,
      timestamp: new Date(),
      data: {
        error: event.data.error,
        metadata: { source: 'startup_manager' }
      }
    });
  }

  /**
   * Handle shutdown initiated
   */
  private async handleShutdownInitiated(event: LifecycleEvent): Promise<void> {
    this.logger.info('Shutdown initiated:', event.data.shutdownReason);
    
    // Forward to external listeners
    await this.emitEvent({
      type: LifecycleEventType.SHUTDOWN_INITIATED,
      timestamp: new Date(),
      data: {
        shutdownReason: event.data.shutdownReason,
        metadata: { source: 'shutdown_manager' }
      }
    });
  }

  /**
   * Handle shutdown completed
   */
  private async handleShutdownCompleted(event: LifecycleEvent): Promise<void> {
    this.logger.info('Shutdown completed:', event.data.shutdownReason);
    
    this.currentState = BotState.SHUTDOWN;
    this.isRunning = false;
    
    // Forward to external listeners
    await this.emitEvent({
      type: LifecycleEventType.SHUTDOWN_COMPLETED,
      timestamp: new Date(),
      data: {
        shutdownReason: event.data.shutdownReason,
        metadata: { source: 'shutdown_manager' }
      }
    });
  }

  /**
   * Handle recovery attempted
   */
  private async handleRecoveryAttempted(event: LifecycleEvent): Promise<void> {
    this.logger.debug('Recovery attempted:', event.data.recoveryAttempt);
    
    // Forward to external listeners
    await this.emitEvent({
      type: LifecycleEventType.RECOVERY_ATTEMPTED,
      timestamp: new Date(),
      data: {
        recoveryAttempt: event.data.recoveryAttempt,
        metadata: { source: 'error_recovery_manager' }
      }
    });
  }

  /**
   * Handle recovery completed
   */
  private async handleRecoveryCompleted(event: LifecycleEvent): Promise<void> {
    this.logger.info('Recovery completed:', event.data.recoveryResult);
    
    // Forward to external listeners
    await this.emitEvent({
      type: LifecycleEventType.RECOVERY_COMPLETED,
      timestamp: new Date(),
      data: {
        recoveryResult: event.data.recoveryResult,
        metadata: { source: 'error_recovery_manager' }
      }
    });
  }

  /**
   * Handle recovery failed
   */
  private async handleRecoveryFailed(event: LifecycleEvent): Promise<void> {
    this.logger.error('Recovery failed:', event.data.error);
    
    // Forward to external listeners
    await this.emitEvent({
      type: LifecycleEventType.RECOVERY_FAILED,
      timestamp: new Date(),
      data: {
        error: event.data.error,
        metadata: { source: 'error_recovery_manager' }
      }
    });
  }

  /**
   * Handle reconnection state changes
   */
  private async handleReconnectionStateChange(event: LifecycleEvent): Promise<void> {
    this.logger.debug('Reconnection state changed:', event.data.currentState);
    
    // Update orchestrator state if it's a major state change
    if (event.data.currentState && 
        [BotState.RECONNECTING, BotState.READY].includes(event.data.currentState)) {
      this.currentState = event.data.currentState;
      
      await this.emitEvent({
        type: LifecycleEventType.STATE_CHANGED,
        timestamp: new Date(),
        data: {
          currentState: this.currentState,
          metadata: { 
            source: 'reconnection_manager',
            previousState: event.data.previousState
          }
        }
      });
    }
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Get current bot state
   */
  public getState(): BotState {
    return this.currentState;
  }

  /**
   * Check if bot is running
   */
  public isRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get Discord client
   */
  public getClient(): Client | undefined {
    return this.client;
  }

  /**
   * Get connection manager
   */
  public getConnectionManager(): ConnectionManager {
    return this.connectionManager;
  }

  /**
   * Get startup manager
   */
  public getStartupManager(): StartupManager {
    return this.startupManager;
  }

  /**
   * Get shutdown manager
   */
  public getShutdownManager(): ShutdownManager {
    return this.shutdownManager;
  }

  /**
   * Get error recovery manager
   */
  public getErrorRecoveryManager(): ErrorRecoveryManager {
    return this.errorRecoveryManager;
  }

  /**
   * Get reconnection manager
   */
  public getReconnectionManager(): ReconnectionManager {
    return this.reconnectionManager;
  }

  /**
   * Get comprehensive lifecycle snapshot
   */
  public getLifecycleSnapshot(): ConnectionStateSnapshot {
    return {
      state: this.currentState,
      health: this.connectionManager.getHealth(),
      metrics: this.connectionManager.getMetrics(),
      timestamp: new Date(),
      config: this.lifecycleConfig
    };
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
   * Update lifecycle configuration
   */
  public updateLifecycleConfig(config: Partial<LifecycleConfig>): void {
    this.lifecycleConfig = { ...this.lifecycleConfig, ...config };
    
    // Update individual manager configurations
    this.startupManager.updateStartupConfig(this.lifecycleConfig.startup);
    this.shutdownManager.updateShutdownConfig(this.lifecycleConfig.shutdown);
    this.errorRecoveryManager.updateRecoveryConfig(this.lifecycleConfig.recovery);
    this.reconnectionManager.updateConfig({
      maxAttempts: 10,
      baseDelay: 5000,
      maxDelay: 300000,
      backoffMultiplier: 2,
      manualEnabled: true
    });
    
    this.logger.debug('Lifecycle configuration updated:', config);
  }

  /**
   * Get lifecycle configuration
   */
  public getLifecycleConfig(): LifecycleConfig {
    return { ...this.lifecycleConfig };
  }

  /**
   * Cleanup all resources
   */
  public async cleanup(): Promise<void> {
    this.logger.info('Cleaning up lifecycle orchestrator...');
    
    this.stopHealthMonitoring();
    
    // Cleanup all managers
    const cleanupPromises = [
      this.connectionManager.cleanup(),
      this.startupManager.cleanup(),
      this.shutdownManager.cleanup(),
      this.errorRecoveryManager.cleanup(),
      this.reconnectionManager.cleanup()
    ];
    
    await Promise.allSettled(cleanupPromises);
    
    this.listeners.clear();
    this.currentState = BotState.SHUTDOWN;
    this.isRunning = false;
    this.client = undefined;
    
    this.logger.info('Lifecycle orchestrator cleaned up');
  }
}