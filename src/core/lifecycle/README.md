# Bot Lifecycle Management System

This directory contains a comprehensive lifecycle management system for the Discord bot, providing proper startup and shutdown sequences, graceful error recovery, connection management, and reconnection logic.

## Architecture

The lifecycle system is built around several key components:

- **LifecycleOrchestrator**: Main coordinator that manages all lifecycle components
- **ConnectionManager**: Handles Discord API connection health monitoring and metrics
- **StartupManager**: Manages bot startup sequence with proper initialization steps
- **ShutdownManager**: Handles graceful shutdown with resource cleanup
- **ErrorRecoveryManager**: Provides error recovery strategies and circuit breaker functionality
- **ReconnectionManager**: Handles automatic reconnection with exponential backoff

## Features

### 🚀 Startup Management
- Configurable startup phases (validation, initialization, connection, ready)
- Timeout handling with retry logic
- Dependency validation and loading
- Health check integration

### 🛑 Graceful Shutdown
- Configurable shutdown timeouts
- Resource cleanup in proper order
- Force shutdown capabilities
- State preservation

### 🔄 Connection Management
- Real-time connection health monitoring
- Connection metrics collection
- Automatic health checks
- Connection state tracking

### 🛡️ Error Recovery
- Multiple recovery strategies (restart, reconnect, fallback)
- Circuit breaker pattern to prevent cascading failures
- Error classification and handling
- Configurable retry logic with exponential backoff

### 🔌 Reconnection Logic
- Exponential backoff algorithm
- Configurable retry limits and delays
- Connection state management
- Automatic reconnection on connection loss

## Usage

```typescript
import { LifecycleOrchestrator, createLifecycleOrchestrator } from './lifecycle';

// Create orchestrator with default configuration
const orchestrator = createLifecycleOrchestrator(botConfig, {
  startup: {
    timeoutMs: 30000,
    healthCheckInterval: 30000,
    enableHealthChecks: true
  },
  shutdown: {
    timeoutMs: 10000,
    gracefulShutdownTimeoutMs: 5000
  },
  recovery: {
    maxRetries: 5,
    baseDelayMs: 1000,
    backoffMultiplier: 2
  }
});

// Start the bot
const result = await orchestrator.start();
if (result.success) {
  console.log('Bot started successfully');
  const client = result.client;
} else {
  console.error('Failed to start bot:', result.error);
}
```

## Configuration Options

### Startup Configuration
- `timeoutMs`: Maximum time to wait for startup (default: 30000)
- `retryAttempts`: Number of startup retry attempts (default: 3)
- `retryDelayMs`: Delay between retry attempts (default: 5000)
- `healthCheckInterval`: Interval for health checks (default: 30000)
- `enableHealthChecks`: Enable/disable health checks (default: true)
- `startupPhases`: Custom startup phases array

### Shutdown Configuration
- `timeoutMs`: Maximum time to wait for shutdown (default: 10000)
- `gracefulShutdownTimeoutMs`: Timeout for graceful shutdown (default: 5000)
- `forceShutdownTimeoutMs`: Timeout for force shutdown (default: 2000)
- `cleanupOrder`: Order of resource cleanup (default: ['connections', 'resources', 'processes'])

### Recovery Configuration
- `maxRetries`: Maximum number of recovery attempts (default: 5)
- `baseDelayMs`: Base delay for recovery attempts (default: 1000)
- `maxDelayMs`: Maximum delay between attempts (default: 60000)
- `backoffMultiplier`: Multiplier for exponential backoff (default: 2)
- `circuitBreakerThreshold`: Threshold for circuit breaker (default: 5)
- `recoveryStrategies`: Available recovery strategies (default: ['restart', 'reconnect', 'fallback'])

## Events

The lifecycle system emits the following events:

- `STATE_CHANGED`: Bot state changes
- `CONNECTION_HEALTH_CHANGED`: Connection health status changes
- `ERROR_OCCURRED`: Error events
- `SHUTDOWN_INITIATED`: Shutdown process started
- `SHUTDOWN_COMPLETED`: Shutdown process completed
- `RECOVERY_ATTEMPTED`: Recovery attempt started
- `RECOVERY_COMPLETED`: Recovery attempt completed
- `RECOVERY_FAILED`: Recovery attempt failed

## Integration

The lifecycle system integrates seamlessly with the existing bot architecture:

1. **Bot Core**: Use `LifecycleOrchestrator` as the main lifecycle manager
2. **Event System**: All lifecycle events are forwarded to the main event system
3. **Configuration**: Load lifecycle configuration from bot configuration
4. **Logging**: Uses the centralized logging system

## Best Practices

1. **Always use the orchestrator** for lifecycle operations rather than individual managers
2. **Handle lifecycle events** to respond to state changes appropriately
3. **Configure timeouts** appropriately for your environment
4. **Monitor connection health** to detect issues early
5. **Use circuit breaker** to prevent cascading failures
6. **Implement graceful shutdown** to ensure clean resource cleanup

## Error Handling

The lifecycle system provides comprehensive error handling:

- **Connection Errors**: Automatic reconnection and recovery
- **Startup Errors**: Retry logic with exponential backoff
- **Runtime Errors**: Circuit breaker and recovery strategies
- **Shutdown Errors**: Graceful degradation and cleanup

All errors are logged and can be handled through the event system.