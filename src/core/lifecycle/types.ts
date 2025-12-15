import { BotConfig, BotError } from '../../types';

/**
 * Bot lifecycle states
 */
export enum BotState {
  INITIALIZING = 'initializing',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  READY = 'ready',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
  SHUTTING_DOWN = 'shutting_down',
  SHUTDOWN = 'shutdown'
}

/**
 * Connection health status
 */
export enum ConnectionHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

/**
 * Lifecycle event types
 */
export enum LifecycleEventType {
  STATE_CHANGED = 'state_changed',
  CONNECTION_HEALTH_CHANGED = 'connection_health_changed',
  ERROR_OCCURRED = 'error_occurred',
  RECOVERY_ATTEMPTED = 'recovery_attempted',
  RECOVERY_COMPLETED = 'recovery_completed',
  RECOVERY_FAILED = 'recovery_failed',
  SHUTDOWN_INITIATED = 'shutdown_initiated',
  SHUTDOWN_COMPLETED = 'shutdown_completed'
}

/**
 * Lifecycle event data
 */
export interface LifecycleEvent {
  type: LifecycleEventType;
  timestamp: Date;
  data: {
    previousState?: BotState;
    currentState?: BotState;
    error?: Error | BotError;
    healthStatus?: ConnectionHealth;
    recoveryAttempt?: number;
    recoveryResult?: 'success' | 'failure';
    shutdownReason?: string;
    metadata?: Record<string, any>;
  };
}

/**
 * Connection metrics
 */
export interface ConnectionMetrics {
  lastConnected?: Date;
  lastDisconnected?: Date;
  totalConnections: number;
  totalDisconnections: number;
  totalReconnections: number;
  averageConnectionTime: number;
  uptime: number;
  latency: number;
  healthStatus: ConnectionHealth;
  consecutiveErrors: number;
  lastError?: Date;
}

/**
 * Startup configuration
 */
export interface StartupConfig {
  maxRetries: number;
  retryDelay: number;
  connectionTimeout: number;
  healthCheckInterval: number;
  gracefulShutdownTimeout: number;
  enableAutoReconnect: boolean;
  reconnectBackoffMultiplier: number;
  maxReconnectDelay: number;
}

/**
 * Shutdown configuration
 */
export interface ShutdownConfig {
  gracefulTimeout: number;
  forceTimeout: number;
  saveState: boolean;
  closeConnections: boolean;
  cleanupResources: boolean;
  notifyUsers: boolean;
}

/**
 * Recovery configuration
 */
export interface RecoveryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

/**
 * Lifecycle manager configuration
 */
export interface LifecycleConfig {
  startup: StartupConfig;
  shutdown: ShutdownConfig;
  recovery: RecoveryConfig;
}

/**
 * Default lifecycle configuration
 */
export const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  startup: {
    maxRetries: 5,
    retryDelay: 5000,
    connectionTimeout: 30000,
    healthCheckInterval: 60000,
    gracefulShutdownTimeout: 30000,
    enableAutoReconnect: true,
    reconnectBackoffMultiplier: 2,
    maxReconnectDelay: 300000
  },
  shutdown: {
    gracefulTimeout: 30000,
    forceTimeout: 10000,
    saveState: true,
    closeConnections: true,
    cleanupResources: true,
    notifyUsers: false
  },
  recovery: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'NETWORK_ERROR',
      'RATE_LIMITED',
      'GATEWAY_TIMEOUT'
    ],
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000
  }
};

/**
 * Lifecycle event listener
 */
export type LifecycleEventListener = (event: LifecycleEvent) => void | Promise<void>;

/**
 * Health check result
 */
export interface HealthCheckResult {
  isHealthy: boolean;
  healthStatus: ConnectionHealth;
  issues: string[];
  metrics: Partial<ConnectionMetrics>;
  timestamp: Date;
}

/**
 * Recovery strategy
 */
export interface RecoveryStrategy {
  name: string;
  canHandle: (error: Error | BotError) => boolean;
  execute: (error: Error | BotError, attempt: number) => Promise<boolean>;
  priority: number;
}

/**
 * Connection state snapshot
 */
export interface ConnectionStateSnapshot {
  state: BotState;
  health: ConnectionHealth;
  metrics: ConnectionMetrics;
  timestamp: Date;
  config: Partial<LifecycleConfig>;
}