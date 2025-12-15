# Integration Layer

This directory contains the integration layer that connects bot events to the self-editing engine, providing performance monitoring, user feedback collection, and behavioral adaptation capabilities.

## Components

### Core Files

- **types.ts** - Type definitions for the integration layer
- **index.ts** - Main exports and orchestrator access point

### Integration Components

#### **performanceMonitor.ts**
Monitors bot performance metrics including:
- Response times
- Error rates
- Memory usage
- CPU usage
- Event processing statistics

Features:
- Real-time metric collection
- Threshold-based alerting
- Historical data tracking
- Configurable monitoring intervals

#### **feedbackCollector.ts**
Collects and analyzes user feedback from various sources:
- Message reactions
- Direct ratings
- Text sentiment analysis
- Interaction feedback

Features:
- Multi-channel feedback tracking
- Sentiment analysis
- Common issue identification
- Improvement suggestion generation

#### **adaptationTriggers.ts**
Manages behavioral adaptation based on performance and feedback:
- Performance-based triggers
- Feedback-based triggers
- System health triggers
- Rate-limited adaptations

Features:
- Priority-based action execution
- Adaptation history tracking
- Self-adjusting adaptation rates
- Safety-first approach

#### **eventIntegration.ts**
Coordinates event processing across all components:
- Event routing and processing
- Component coordination
- Metrics collection
- Health monitoring

Features:
- Unified event processing
- Component communication
- Processing context tracking
- Health status reporting

#### **orchestrator.ts**
Main controller for the entire integration system:
- Component initialization
- Lifecycle management
- Configuration updates
- Health monitoring

Features:
- Centralized control
- Component coordination
- Manual analysis triggers
- Configuration management

## Usage

```typescript
import { IntegrationOrchestrator, IntegrationConfig } from './core/integration';

// Initialize with configuration
const config: IntegrationConfig = {
  enabled: true,
  performanceMonitoring: {
    enabled: true,
    interval: 5,
    metrics: ['responseTime', 'errorRate', 'memoryUsage', 'cpuUsage'],
    thresholds: {
      responseTime: 1000,
      errorRate: 0.05,
      memoryUsage: 100,
      cpuUsage: 80
    }
  },
  feedbackCollection: {
    enabled: true,
    channels: ['feedback-channel-id'],
    reactions: ['👍', '👎', '⭐'],
    minInteractions: 10,
    feedbackWeight: 0.7
  },
  adaptationTriggers: {
    enabled: true,
    performanceThreshold: 0.8,
    feedbackThreshold: 0.3,
    adaptationRate: 0.2,
    maxAdaptationsPerHour: 3
  }
};

// Create orchestrator
const orchestrator = new IntegrationOrchestrator(dependencies);

// Initialize the system
await orchestrator.initialize();

// Process events
await orchestrator.processEvent(discordEvent);

// Get metrics
const metrics = orchestrator.getMetrics();
const health = orchestrator.getHealthStatus();

// Trigger manual analysis
await orchestrator.triggerAnalysis();
```

## Event Flow

1. **Event Reception** - Discord events are received by the orchestrator
2. **Event Processing** - Events are processed through the integration layer
3. **Metric Collection** - Performance and feedback data are collected
4. **Trigger Evaluation** - Adaptation triggers are evaluated
5. **Adaptation Execution** - Behavioral adaptations are executed if needed
6. **Health Monitoring** - System health is continuously monitored

## Configuration

The integration layer accepts a comprehensive configuration object that controls:

- **Performance Monitoring** - Enable/disable and configure performance tracking
- **Feedback Collection** - Set up channels and feedback types to track
- **Adaptation Triggers** - Control when and how adaptations occur

## Health Monitoring

The integration system provides comprehensive health monitoring:

- Component initialization status
- Performance metric health
- Error rate monitoring
- Memory usage tracking
- Adaptation success rates

## Error Handling

All components implement comprehensive error handling:

- Graceful degradation on failures
- Detailed error logging
- Context preservation
- Recovery mechanisms

## Integration with Self-Editing Engine

The integration layer connects to the self-editing engine through:

- Performance analysis delegation
- Feedback analysis delegation
- Behavioral adaptation delegation
- Metric synchronization

This creates a seamless bridge between real-time bot operations and the self-editing capabilities.