import { Client, GatewayIntentBits, Status } from 'discord.js';
import {
  BotState,
  ConnectionHealth,
  ConnectionMetrics,
  LifecycleEvent,
  LifecycleEventType,
  LifecycleEventListener,
  HealthCheckResult
} from './types';
import { BotConfig } from '../../types';
import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';

/**
 * Manages Discord API connection health and metrics
 */
export class ConnectionManager {
  private client: Client;
  private config: BotConfig;
  private logger: Logger;
  private metrics: ConnectionMetrics;
  private healthCheckInterval?: ReturnType<typeof setInterval> | null;
  private pingInterval?: ReturnType<typeof setInterval> | null;
  private eventListeners: Map<LifecycleEventType, Set<LifecycleEventListener>> = new Map();
  private currentState: BotState = BotState.INITIALIZING;
  private currentHealth: ConnectionHealth = ConnectionHealth.UNKNOWN;
  private listeners: Map<LifecycleEventType, Set<LifecycleEventListener>> = new Map();

  constructor(config: BotConfig, logger: Logger) {
    this.config = config;
    this.logger = new Logger('ConnectionManager');
    this.metrics = this.initializeMetrics();
    this.client = this.createClient();
    this.setupClientEventHandlers();
  }

  /**
   * Initialize connection metrics
   */
  private initializeMetrics(): ConnectionMetrics {
    return {
      totalConnections: 0,
      totalDisconnections: 0,
      totalReconnections: 0,
      averageConnectionTime: 0,
      uptime: 0,
      latency: 0,
      healthStatus: ConnectionHealth.UNKNOWN,
      consecutiveErrors: 0
    };
  }

  /**
   * Create Discord.js client with proper configuration
   */
  private createClient(): Client {
    return new Client({
      intents: this.getIntents(),
      partials: {
        user: true,
        guild: true,
        channel: true,
        message: true,
        reaction: true,
        guildMember: true,
        guildScheduledEvent: true,
        guildScheduledEventUser: true,
      },
      rest: {
        timeout: 30000,
        userAgent: 'DiscordBot (https://github.com/your-repo)',
        retries: 3
      }
    });
  }

  /**
   * Get gateway intents from configuration
   */
  private getIntents(): GatewayIntentBits[] {
    const intentMap: Record<string, GatewayIntentBits> = {
      'Guilds': GatewayIntentBits.Guilds,
      'GuildMembers': GatewayIntentBits.GuildMembers,
      'GuildBans': GatewayIntentBits.GuildBans,
      'GuildEmojis': GatewayIntentBits.GuildEmojis,
      'GuildIntegrations': GatewayIntentBits.GuildIntegrations,
      'GuildWebhooks': GatewayIntentBits.GuildWebhooks,
      'GuildInvites': GatewayIntentBits.GuildInvites,
      'GuildVoiceStates': GatewayIntentBits.GuildVoiceStates,
      'GuildPresences': GatewayIntentBits.GuildPresences,
      'GuildMessages': GatewayIntentBits.GuildMessages,
      'GuildMessageReactions': GatewayIntentBits.GuildMessageReactions,
      'GuildMessageTyping': GatewayIntentBits.GuildMessageTyping,
      'DirectMessages': GatewayIntentBits.DirectMessages,
      'DirectMessageReactions': GatewayIntentBits.DirectMessageReactions,
      'DirectMessageTyping': GatewayIntentBits.DirectMessageTyping,
      'MessageContent': GatewayIntentBits.MessageContent,
    };

    return this.config.intents
      .filter((intent: string) => intentMap[intent])
      .reduce((acc: GatewayIntentBits, intent: string) => acc | intentMap[intent]!, 0 as GatewayIntentBits);
  }

  /**
   * Setup Discord.js client event handlers
   */
  private setupClientEventHandlers(): void {
    this.client.once('ready', this.handleReady.bind(this));
    this.client.on('disconnect', this.handleDisconnect.bind(this));
    this.client.on('reconnecting', this.handleReconnecting.bind(this));
    this.client.on('resume', this.handleResume.bind(this));
    this.client.on('error', this.handleError.bind(this));
    this.client.on('rateLimit', this.handleRateLimit.bind(this));
    this.client.on('invalidated', this.handleInvalidated.bind(this));
  }

  /**
   * Handle client ready event
   */
  private async handleReady(): Promise<void> {
    this.setState(BotState.CONNECTED);
    this.metrics.lastConnected = new Date();
    this.metrics.totalConnections++;
    this.metrics.consecutiveErrors = 0;
    
    this.logger.info(`Bot connected as ${this.client.user?.tag}`);
    
    // Set bot presence if configured
    if (this.config.presence) {
      try {
        await this.client.user?.setPresence(this.config.presence);
        this.logger.debug('Bot presence set successfully');
      } catch (error) {
        this.logger.warn('Failed to set bot presence:', error as Error);
      }
    }

    this.setState(BotState.READY);
    this.updateHealth(ConnectionHealth.HEALTHY);
    
    this.emitEvent({
      type: LifecycleEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: BotState.READY,
        metadata: { userTag: this.client.user?.tag }
      }
    });
  }

  /**
   * Handle disconnect event
   */
  private handleDisconnect(): void {
    this.setState(BotState.DISCONNECTED);
    this.metrics.lastDisconnected = new Date();
    this.metrics.totalDisconnections++;
    this.updateHealth(ConnectionHealth.UNHEALTHY);
    
    this.logger.warn('Bot disconnected from Discord');
    
    this.emitEvent({
      type: LifecycleEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: BotState.DISCONNECTED,
        metadata: { 
          totalDisconnections: this.metrics.totalDisconnections,
          lastConnected: this.metrics.lastConnected
        }
      }
    });
  }

  /**
   * Handle reconnecting event
   */
  private handleReconnecting(): void {
    this.setState(BotState.RECONNECTING);
    this.metrics.totalReconnections++;
    this.updateHealth(ConnectionHealth.DEGRADED);
    
    this.logger.info('Bot attempting to reconnect...');
    
    this.emitEvent({
      type: LifecycleEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: BotState.RECONNECTING,
        metadata: { totalReconnections: this.metrics.totalReconnections }
      }
    });
  }

  /**
   * Handle resume event
   */
  private handleResume(): void {
    this.setState(BotState.READY);
    this.metrics.consecutiveErrors = 0;
    this.updateHealth(ConnectionHealth.HEALTHY);
    
    this.logger.info('Bot session resumed');
    
    this.emitEvent({
      type: LifecycleEventType.STATE_CHANGED,
      timestamp: new Date(),
      data: {
        currentState: BotState.READY,
        metadata: { resumed: true }
      }
    });
  }

  /**
   * Handle client error
   */
  private handleError(error: Error): void {
    this.metrics.consecutiveErrors++;
    this.metrics.lastError = new Date();
    
    this.logger.error('Discord client error:', error);
    
    this.emitEvent({
      type: LifecycleEventType.ERROR_OCCURRED,
      timestamp: new Date(),
      data: {
        error,
        metadata: { 
          consecutiveErrors: this.metrics.consecutiveErrors,
          source: 'discord_client'
        }
      }
    });

    // Update health based on error frequency
    if (this.metrics.consecutiveErrors >= 5) {
      this.updateHealth(ConnectionHealth.UNHEALTHY);
    } else if (this.metrics.consecutiveErrors >= 2) {
      this.updateHealth(ConnectionHealth.DEGRADED);
    }
  }

  /**
   * Handle rate limit event
   */
  private handleRateLimit(rateLimitInfo: any): void {
    this.logger.warn('Rate limit hit:', {
      limit: rateLimitInfo.limit,
      timeout: rateLimitInfo.timeout,
      method: rateLimitInfo.method,
      path: rateLimitInfo.path
    });
    
    this.updateHealth(ConnectionHealth.DEGRADED);
    
    this.emitEvent({
      type: LifecycleEventType.ERROR_OCCURRED,
      timestamp: new Date(),
      data: {
        error: new BotError('Rate limit exceeded', 'medium', rateLimitInfo),
        metadata: { source: 'rate_limit' }
      }
    });
  }

  /**
   * Handle session invalidated event
   */
  private handleInvalidated(): void {
    this.logger.warn('Bot session invalidated');
    this.setState(BotState.DISCONNECTED);
    this.updateHealth(ConnectionHealth.UNHEALTHY);
    
    this.emitEvent({
      type: LifecycleEventType.ERROR_OCCURRED,
      timestamp: new Date(),
      data: {
        error: new BotError('Session invalidated', 'high'),
        metadata: { source: 'session_invalidated' }
      }
    });
  }

  /**
   * Set bot state and emit event if changed
   */
  private setState(newState: BotState): void {
    if (this.currentState !== newState) {
      const previousState = this.currentState;
      this.currentState = newState;
      
      this.logger.debug(`State changed: ${previousState} -> ${newState}`);
      
      this.emitEvent({
        type: LifecycleEventType.STATE_CHANGED,
        timestamp: new Date(),
        data: {
          previousState,
          currentState: newState
        }
      });
    }
  }

  /**
   * Update connection health and emit event if changed
   */
  private updateHealth(newHealth: ConnectionHealth): void {
    if (this.currentHealth !== newHealth) {
      const previousHealth = this.currentHealth;
      this.currentHealth = newHealth;
      this.metrics.healthStatus = newHealth;
      
      this.logger.debug(`Health changed: ${previousHealth} -> ${newHealth}`);
      
      this.emitEvent({
        type: LifecycleEventType.CONNECTION_HEALTH_CHANGED,
        timestamp: new Date(),
        data: {
          healthStatus: newHealth,
          metadata: { metrics: this.metrics }
        }
      });
    }
  }

  /**
   * Perform health check
   */
  public async performHealthCheck(): Promise<HealthCheckResult> {
    const issues: string[] = [];
    let isHealthy = true;
    let healthStatus = ConnectionHealth.HEALTHY;

    // Check client status
    if (!this.client || this.client.status !== Status.Ready) {
      issues.push('Discord client is not ready');
      isHealthy = false;
      healthStatus = ConnectionHealth.UNHEALTHY;
    }

    // Check connection metrics
    if (this.metrics.consecutiveErrors >= 5) {
      issues.push(`High error count: ${this.metrics.consecutiveErrors}`);
      isHealthy = false;
      healthStatus = ConnectionHealth.UNHEALTHY;
    } else if (this.metrics.consecutiveErrors >= 2) {
      issues.push(`Elevated error count: ${this.metrics.consecutiveErrors}`);
      healthStatus = ConnectionHealth.DEGRADED;
    }

    // Check uptime
    if (this.metrics.lastConnected) {
      const uptime = Date.now() - this.metrics.lastConnected.getTime();
      if (uptime < 60000) { // Less than 1 minute
        issues.push('Recent connection, monitoring stability');
        healthStatus = ConnectionHealth.DEGRADED;
      }
    }

    // Check latency
    if (this.client.ws?.ping) {
      this.metrics.latency = this.client.ws.ping;
      if (this.metrics.latency > 1000) {
        issues.push(`High latency: ${this.metrics.latency}ms`);
        healthStatus = ConnectionHealth.DEGRADED;
      }
    }

    this.updateHealth(healthStatus);

    return {
      isHealthy,
      healthStatus,
      issues,
      metrics: { ...this.metrics },
      timestamp: new Date()
    };
  }

  /**
   * Start health monitoring
   */
  public startHealthMonitoring(intervalMs: number): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.performHealthCheck();
        this.logger.debug('Health check completed:', health);
      } catch (error) {
        this.logger.error('Health check failed:', error as Error);
      }
    }, intervalMs);

    this.logger.debug(`Health monitoring started with ${intervalMs}ms interval`);
  }

  /**
   * Stop health monitoring
   */
  public stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.debug('Health monitoring stopped');
    }
  }

  /**
   * Add lifecycle event listener
   */
  public addEventListener(eventType: LifecycleEventType, listener: LifecycleEventListener): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);
  }

  /**
   * Remove lifecycle event listener
   */
  public removeEventListener(eventType: LifecycleEventType, listener: LifecycleEventListener): void {
    this.eventListeners.get(eventType)?.delete(listener);
  }

  /**
   * Emit lifecycle event
   */
  private async emitEvent(event: LifecycleEvent): Promise<void> {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      await Promise.all(Array.from(listeners).map(listener =>
        Promise.resolve(listener(event)).catch(error =>
          this.logger.error('Event listener error:', error)
        )
      ));
    }
  }

  /**
   * Get Discord client
   */
  public getClient(): Client {
    return this.client;
  }

  /**
   * Get current state
   */
  public getState(): BotState {
    return this.currentState;
  }

  /**
   * Get current health
   */
  public getHealth(): ConnectionHealth {
    return this.currentHealth;
  }

  /**
   * Get connection metrics
   */
  public getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Update uptime calculation
   */
  public updateUptime(): void {
    if (this.metrics.lastConnected && this.currentState === BotState.READY) {
      this.metrics.uptime = Date.now() - this.metrics.lastConnected.getTime();
    }
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.logger.debug('Connection metrics reset');
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    this.stopHealthMonitoring();
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.client && this.client.status !== Status.Destroyed) {
      this.client.destroy();
    }

    this.eventListeners.clear();
    this.logger.debug('Connection manager cleaned up');
  }
}