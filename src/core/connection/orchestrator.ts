// import { Client } from 'discord.js'; // Commented out to avoid dependency issues
import {
  ConnectionState,
  ConnectionConfig,
  ConnectionEvent,
  ConnectionEventType,
  ConnectionEventListener,
  ConnectionStatus,
  ConnectionStatistics,
  ConnectionDiagnostics,
  ConnectionStateSnapshot,
  RecoveryStrategy,
  ConnectionRecoveryOptions
} from './types';
import { ConnectionHealthMonitor } from './healthMonitor';
import { CircuitBreaker } from './circuitBreaker';
import { DegradationHandler } from './degradationHandler';
import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';

/**
 * Connection orchestrator that coordinates all connection management components
 */
export class ConnectionOrchestrator {
  private config: ConnectionConfig;
  private logger: Logger;
  private client: any;
  private healthMonitor: ConnectionHealthMonitor;
  private circuitBreaker: CircuitBreaker;
  private degradationHandler: DegradationHandler;
  private listeners: Map<ConnectionEventType, Set<ConnectionEventListener>> = new Map();
  private currentState: ConnectionState = ConnectionState.DISCONNECTED;
  private connectionStartTime?: Date;
  private statistics: ConnectionStatistics;
  private recoveryStrategies: RecoveryStrategy[] = [];
  private isShuttingDown = false;

  constructor(config: ConnectionConfig, logger: Logger) {
    this.config = config;
    this.logger = new Logger('ConnectionOrchestrator');
    
    // Initialize Discord client
    this.client = this.createClient();
    
    // Initialize components
    this.healthMonitor = new ConnectionHealthMonitor(config.healthCheck, logger);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker, logger);
    this.degradationHandler = new DegradationHandler(config.degradation, logger);
    
    // Initialize statistics
    this.statistics = this.initializeStatistics();
    
    // Setup component event handlers
    this.setupComponentEventHandlers();
    
    // Setup client event handlers
    this.setupClientEventHandlers();
  }

  /**
   * Initialize connection statistics
   */
  private initializeStatistics(): ConnectionStatistics {
    return {
      totalSessions: 0,
      totalConnections: 0,
      totalDisconnections: 0,
      totalReconnections: 0,
      totalErrors: 0,
      averageSessionDuration: 0,
      averageUptime: 0,
      averageLatency: 0,
      reliability: 0,
      availability: 0,
      lastReset: new Date()
    };
  }

  /**
   * Create Discord client with configuration
   */
  private createClient(): Client {
    // This would use the actual Discord.js client creation
    // For now, return a mock client
    return new Client() as any;
  }

  /**
   * Setup component event handlers
   */
  private setupComponentEventHandlers(): void {
    // Health monitor events
    this.healthMonitor.addEventListener(ConnectionEventType.HEALTH_CHANGED, this.handleHealthChanged.bind(this));
    this.healthMonitor.addEventListener(ConnectionEventType.ERROR_OCCURRED, this.handleErrorOccurred.bind(this));
    
    // Circuit breaker events
    this.circuitBreaker.addEventListener(ConnectionEventType.CIRCUIT_BREAKER_TRIGGERED, this.handleCircuitBreakerTriggered.bind(this));
    
    // Degradation handler events
    this.degradationHandler.addEventListener(ConnectionEventType.DEGRADATION_ACTIVATED, this.handleDegradationActivated.bind(this));
    this.degradationHandler.addEventListener(ConnectionEventType.DEGRADATION_DEACTIVATED, this.handleDegradationDeactivated.bind(this));
  }

  /**
   * Setup Discord client event handlers
   */
  private setupClientEventHandlers(): void {
    this.client.once('clientReady', this.handleClientReady.bind(this));
    this.client.on('disconnect', this.handleClientDisconnect.bind(this));
    this.client.on('reconnecting', this.handleClientReconnecting.bind(this));
    this.client.on('resume', this.handleClientResume.bind(this));
    this.client.on('error', this.handleClientError.bind(this));
  }

  /**
   * Start connection
   */
  public async start(): Promise<void> {
    if (this.currentState !== ConnectionState.DISCONNECTED) {
      this.logger.warn('Connection already started or in progress');
      return;
    }

    this.logger.info('Starting connection orchestrator');
    this.setState(ConnectionState.CONNECTING);
    this.statistics.totalSessions++;

    try {
      // Start health monitoring
      this.healthMonitor.startMonitoring();
      
      // Execute connection through circuit breaker
      await this.circuitBreaker.execute(
        () => this.performConnection(),
        'initial_connection'
      );
      
    } catch (error) {
      this.logger.error('Failed to start connection:', error as Error);
      await this.handleConnectionFailure(error as Error);
      throw error;
    }
  }

  /**
   * Perform actual connection
   */
  private async performConnection(): Promise<void> {
    this.logger.info('Connecting to Discord...');
    
    // Login to Discord
    await this.client.login(this.config.token);
    
    // Connection successful
    this.connectionStartTime = new Date();
    this.setState(ConnectionState.CONNECTED);
    this.statistics.totalConnections++;
    
    this.logger.info('Successfully connected to Discord');
    
    await this.emitEvent({
      type: ConnectionEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: ConnectionState.CONNECTED,
        metadata: {
          sessionId: this.config.sessionId,
          connectionTime: this.connectionStartTime
        }
      }
    });
  }

  /**
   * Stop connection
   */
  public async stop(): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Stopping connection orchestrator');
    this.setState(ConnectionState.DISCONNECTING);

    try {
      // Deactivate any active degradation
      if (this.degradationHandler.isCurrentlyDegraded()) {
        await this.degradationHandler.deactivateDegradation('Manual shutdown');
      }

      // Stop health monitoring
      this.healthMonitor.stopMonitoring();
      
      // Disconnect from Discord
      if (this.client.readyState !== 0) { // Not destroyed
        this.client.destroy();
      }
      
      // Update statistics
      if (this.connectionStartTime) {
        const sessionDuration = Date.now() - this.connectionStartTime.getTime();
        this.updateStatistics(sessionDuration);
      }
      
      this.setState(ConnectionState.DISCONNECTED);
      this.statistics.totalDisconnections++;
      
      this.logger.info('Connection stopped successfully');
      
    } catch (error) {
      this.logger.error('Error during connection stop:', error as Error);
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Handle client ready event
   */
  private async handleClientReady(): Promise<void> {
    this.logger.info('Discord client ready and connected');
    this.setState(ConnectionState.CONNECTED);
    
    // Update health monitor with connection info
    this.healthMonitor.updateConnectionMetrics({
      lastConnected: new Date(),
      totalConnections: this.statistics.totalConnections,
      currentUptime: 0 // Will be updated over time
    });
    
    await this.emitEvent({
      type: ConnectionEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: ConnectionState.CONNECTED,
        metadata: {
          userTag: this.client.user?.tag,
          guilds: this.client.guilds.cache.size
        }
      }
    });
  }

  // Backward compatibility method for deprecated ready event
  private async handleReady(): Promise<void> {
    this.logger.warn('Using deprecated ready event. Please migrate to clientReady event.');
    await this.handleClientReady();
  }

  /**
   * Handle client disconnect event
   */
  private async handleClientDisconnect(): Promise<void> {
    this.logger.warn('Discord client disconnected');
    this.setState(ConnectionState.DISCONNECTED);
    this.statistics.totalDisconnections++;
    
    // Update health monitor
    this.healthMonitor.updateConnectionMetrics({
      lastDisconnected: new Date(),
      totalDisconnections: this.statistics.totalDisconnections,
      currentUptime: 0
    });
    
    // Start automatic reconnection if enabled
    if (this.config.autoReconnect && !this.isShuttingDown) {
      setTimeout(() => {
        this.attemptReconnection('Automatic reconnection after disconnect');
      }, this.config.reconnectDelay);
    }
    
    await this.emitEvent({
      type: ConnectionEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: ConnectionState.DISCONNECTED,
        metadata: {
          autoReconnect: this.config.autoReconnect,
          reconnectDelay: this.config.reconnectDelay
        }
      }
    });
  }

  /**
   * Handle client reconnecting event
   */
  private async handleClientReconnecting(): Promise<void> {
    this.logger.info('Discord client reconnecting');
    this.setState(ConnectionState.RECONNECTING);
    this.statistics.totalReconnections++;
    
    await this.emitEvent({
      type: ConnectionEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: ConnectionState.RECONNECTING,
        metadata: {
          totalReconnections: this.statistics.totalReconnections
        }
      }
    });
  }

  /**
   * Handle client resume event
   */
  private async handleClientResume(): Promise<void> {
    this.logger.info('Discord client resumed');
    this.setState(ConnectionState.CONNECTED);
    
    // Reset consecutive errors on successful resume
    this.healthMonitor.resetConsecutiveErrors();
    
    await this.emitEvent({
      type: ConnectionEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: ConnectionState.CONNECTED,
        metadata: {
          resumed: true
        }
      }
    });
  }

  /**
   * Handle client error event
   */
  private async handleClientError(error: Error): Promise<void> {
    this.logger.error('Discord client error:', error);
    this.statistics.totalErrors++;
    
    // Record error in health monitor
    this.healthMonitor.recordError(error);
    
    // Check if degradation should be activated
    const healthStatus = this.healthMonitor.getHealthStatus();
    const degradationEvaluation = this.degradationHandler.evaluateDegradation(healthStatus.metrics);
    
    if (degradationEvaluation.shouldDegrade) {
      await this.degradationHandler.activateDegradation(
        degradationEvaluation.level,
        degradationEvaluation.actions,
        degradationEvaluation.reason
      );
    }
    
    await this.emitEvent({
      type: ConnectionEventType.ERROR_OCCURRED,
      timestamp: new Date(),
      data: {
        error,
        metadata: {
          source: 'discord_client',
          totalErrors: this.statistics.totalErrors
        }
      }
    });
  }

  /**
   * Handle health changed event
   */
  private async handleHealthChanged(event: ConnectionEvent): Promise<void> {
    this.logger.debug('Health status changed', {
      previousHealth: event.data.previousHealth,
      currentHealth: event.data.currentHealth,
      score: event.data.metadata?.score
    });
    
    // Check if circuit breaker should be triggered
    if (event.data.currentHealth === 'critical') {
      this.circuitBreaker.forceState('open', 'Critical health status');
    }
    
    // Emit to external listeners
    await this.emitEvent(event);
  }

  /**
   * Handle error occurred event
   */
  private async handleErrorOccurred(event: ConnectionEvent): Promise<void> {
    this.logger.debug('Error occurred', {
      error: event.data.error?.message,
      consecutiveErrors: event.data.metadata?.consecutiveErrors
    });
    
    // Emit to external listeners
    await this.emitEvent(event);
  }

  /**
   * Handle circuit breaker triggered event
   */
  private async handleCircuitBreakerTriggered(event: ConnectionEvent): Promise<void> {
    this.logger.warn('Circuit breaker triggered', {
      state: event.data.circuitBreakerState,
      rejectedCalls: event.data.metadata?.rejectedCalls
    });
    
    // Emit to external listeners
    await this.emitEvent(event);
  }

  /**
   * Handle degradation activated event
   */
  private async handleDegradationActivated(event: ConnectionEvent): Promise<void> {
    this.logger.warn('Degradation activated', {
      level: event.data.degradationLevel,
      actions: event.data.metadata?.actions
    });
    
    // Emit to external listeners
    await this.emitEvent(event);
  }

  /**
   * Handle degradation deactivated event
   */
  private async handleDegradationDeactivated(event: ConnectionEvent): Promise<void> {
    this.logger.info('Degradation deactivated', {
      previousLevel: event.data.metadata?.previousLevel,
      duration: event.data.metadata?.duration
    });
    
    // Emit to external listeners
    await this.emitEvent(event);
  }

  /**
   * Attempt reconnection
   */
  public async attemptReconnection(reason: string): Promise<boolean> {
    if (this.currentState === ConnectionState.CONNECTED) {
      this.logger.warn('Already connected, skipping reconnection');
      return true;
    }

    this.logger.info(`Attempting reconnection: ${reason}`);
    this.setState(ConnectionState.RECONNECTING);

    try {
      await this.circuitBreaker.execute(
        () => this.performConnection(),
        'reconnection'
      );
      
      this.logger.info('Reconnection successful');
      return true;
      
    } catch (error) {
      this.logger.error('Reconnection failed:', error as Error);
      await this.handleConnectionFailure(error as Error);
      return false;
    }
  }

  /**
   * Handle connection failure
   */
  private async handleConnectionFailure(error: Error): Promise<void> {
    this.statistics.totalErrors++;
    
    // Try recovery strategies
    for (const strategy of this.recoveryStrategies) {
      if (strategy.conditions(error, this.healthMonitor.getHealthStatus().metrics)) {
        this.logger.info(`Attempting recovery strategy: ${strategy.name}`);
        
        try {
          const success = await strategy.execute(error, this.healthMonitor.getHealthStatus().metrics);
          if (success) {
            this.logger.info(`Recovery strategy ${strategy.name} succeeded`);
            return;
          }
        } catch (recoveryError) {
          this.logger.error(`Recovery strategy ${strategy.name} failed:`, recoveryError as Error);
        }
      }
    }
    
    // Schedule next reconnection attempt
    if (this.config.autoReconnect && !this.isShuttingDown) {
      const delay = Math.min(
        this.config.reconnectDelay * Math.pow(2, this.statistics.totalReconnections),
        this.config.maxReconnectDelay
      );
      
      setTimeout(() => {
        this.attemptReconnection('Scheduled reconnection attempt');
      }, delay);
    }
  }

  /**
   * Set connection state
   */
  private setState(newState: ConnectionState): void {
    if (this.currentState !== newState) {
      const previousState = this.currentState;
      this.currentState = newState;
      
      this.logger.debug(`State changed: ${previousState} -> ${newState}`);
    }
  }

  /**
   * Update statistics
   */
  private updateStatistics(sessionDuration: number): void {
    // Update averages
    const totalSessions = this.statistics.totalSessions;
    this.statistics.averageSessionDuration = 
      (this.statistics.averageSessionDuration * (totalSessions - 1) + sessionDuration) / totalSessions;
    
    // Update reliability and availability
    this.statistics.reliability = 
      this.statistics.totalConnections > 0 ? 
        ((this.statistics.totalConnections - this.statistics.totalErrors) / this.statistics.totalConnections) * 100 : 0;
    
    this.statistics.availability = 
      this.statistics.totalSessions > 0 ? 
        (this.statistics.totalConnections / this.statistics.totalSessions) * 100 : 0;
  }

  /**
   * Add recovery strategy
   */
  public addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    this.recoveryStrategies.sort((a, b) => b.priority - a.priority);
    this.logger.debug(`Added recovery strategy: ${strategy.name}`);
  }

  /**
   * Remove recovery strategy
   */
  public removeRecoveryStrategy(name: string): void {
    this.recoveryStrategies = this.recoveryStrategies.filter(s => s.name !== name);
    this.logger.debug(`Removed recovery strategy: ${name}`);
  }

  /**
   * Get current status
   */
  public getStatus(): ConnectionStatus {
    const healthStatus = this.healthMonitor.getHealthStatus();
    const circuitBreakerStatus = this.circuitBreaker.getStatus();
    const degradationStatus = this.degradationHandler.getStatus();
    
    return {
      state: this.currentState,
      health: healthStatus.health,
      uptime: healthStatus.metrics.currentUptime,
      latency: healthStatus.metrics.latency,
      errorRate: healthStatus.metrics.errorRate,
      lastError: healthStatus.metrics.lastError?.toISOString(),
      lastConnected: healthStatus.metrics.lastConnected,
      sessionId: this.config.sessionId
    };
  }

  /**
   * Get statistics
   */
  public getStatistics(): ConnectionStatistics {
    return { ...this.statistics };
  }

  /**
   * Get diagnostics
   */
  public getDiagnostics(): ConnectionDiagnostics {
    const healthDiagnostics = this.healthMonitor.getDiagnostics();
    const circuitBreakerMetrics = this.circuitBreaker.getMetrics();
    const degradationMetrics = this.degradationHandler.getMetrics();
    
    return {
      timestamp: new Date(),
      state: this.currentState,
      health: healthDiagnostics.health,
      metrics: healthDiagnostics.metrics,
      circuitBreaker: circuitBreakerMetrics,
      degradation: degradationMetrics,
      recentErrors: healthDiagnostics.recentErrors,
      recentEvents: healthDiagnostics.recentEvents,
      systemInfo: healthDiagnostics.systemInfo
    };
  }

  /**
   * Get state snapshot
   */
  public getStateSnapshot(): ConnectionStateSnapshot {
    return {
      state: this.currentState,
      health: this.healthMonitor.getHealthStatus().health,
      metrics: this.healthMonitor.getHealthStatus().metrics,
      circuitBreaker: this.circuitBreaker.getMetrics(),
      degradation: this.degradationHandler.getMetrics(),
      timestamp: new Date(),
      config: { ...this.config }
    };
  }

  /**
   * Force recovery
   */
  public async forceRecovery(options: ConnectionRecoveryOptions): Promise<boolean> {
    this.logger.info(`Forcing recovery with strategy: ${options.strategy}`);
    
    await this.emitEvent({
      type: ConnectionEventType.RECOVERY_ATTEMPTED,
      timestamp: new Date(),
      data: {
        metadata: {
          strategy: options.strategy,
          maxAttempts: options.maxAttempts,
          forceReconnect: options.forceReconnect
        }
      }
    });
    
    try {
      // Reset circuit breaker
      if (options.forceReconnect) {
        this.circuitBreaker.reset();
      }
      
      // Deactivate degradation
      if (this.degradationHandler.isCurrentlyDegraded()) {
        await this.degradationHandler.deactivateDegradation('Forced recovery');
      }
      
      // Attempt reconnection
      let attempts = 0;
      let lastError: Error | null = null;
      
      while (attempts < options.maxAttempts) {
        attempts++;
        
        try {
          const success = await this.attemptReconnection(`Forced recovery attempt ${attempts}`);
          if (success) {
            await this.emitEvent({
              type: ConnectionEventType.RECOVERY_COMPLETED,
              timestamp: new Date(),
              data: {
                metadata: {
                  strategy: options.strategy,
                  attempts,
                  success: true
                }
              }
            });
            
            return true;
          }
        } catch (error) {
          lastError = error as Error;
          this.logger.error(`Recovery attempt ${attempts} failed:`, error as Error);
        }
        
        // Wait before next attempt
        if (attempts < options.maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, options.delay * Math.pow(options.backoffMultiplier, attempts - 1)));
        }
      }
      
      await this.emitEvent({
        type: ConnectionEventType.RECOVERY_COMPLETED,
        timestamp: new Date(),
        data: {
          metadata: {
            strategy: options.strategy,
            attempts,
            success: false,
            lastError: lastError?.message
          }
        }
      });
      
      return false;
      
    } catch (error) {
      this.logger.error('Forced recovery failed:', error as Error);
      return false;
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ConnectionConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update component configurations
    if (config.healthCheck) {
      this.healthMonitor.updateConfig(config.healthCheck);
    }
    if (config.circuitBreaker) {
      this.circuitBreaker.updateConfig(config.circuitBreaker);
    }
    if (config.degradation) {
      this.degradationHandler.updateConfig(config.degradation);
    }
    
    this.logger.debug('Connection orchestrator configuration updated');
  }

  /**
   * Add event listener
   */
  public addEventListener(eventType: ConnectionEventType, listener: ConnectionEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  /**
   * Remove event listener
   */
  public removeEventListener(eventType: ConnectionEventType, listener: ConnectionEventListener): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  /**
   * Emit connection event
   */
  private async emitEvent(event: ConnectionEvent): Promise<void> {
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
   * Reset statistics
   */
  public resetStatistics(): void {
    this.statistics = this.initializeStatistics();
    this.healthMonitor.resetMetrics();
    this.circuitBreaker.reset();
    this.degradationHandler.resetMetrics();
    this.logger.info('Connection orchestrator statistics reset');
  }

  /**
   * Get Discord client
   */
  public getClient(): Client {
    return this.client;
  }

  /**
   * Get health monitor
   */
  public getHealthMonitor(): ConnectionHealthMonitor {
    return this.healthMonitor;
  }

  /**
   * Get circuit breaker
   */
  public getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Get degradation handler
   */
  public getDegradationHandler(): DegradationHandler {
    return this.degradationHandler;
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    this.logger.info('Cleaning up connection orchestrator');
    
    // Stop connection if running
    if (this.currentState !== ConnectionState.DISCONNECTED) {
      await this.stop();
    }
    
    // Cleanup components
    this.healthMonitor.cleanup();
    this.circuitBreaker.cleanup();
    this.degradationHandler.cleanup();
    
    // Clear listeners
    this.listeners.clear();
    this.recoveryStrategies = [];
    
    this.logger.debug('Connection orchestrator cleaned up');
  }
}