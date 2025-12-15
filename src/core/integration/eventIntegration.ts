import { 
  EventIntegrationInterface, 
  IntegrationMetrics, 
  IntegrationEvent,
  EventProcessingContext,
  IntegrationConfig 
} from './types';
import { DiscordEvent } from './types';
import { Logger } from '../../utils/logger';
import { BotPerformanceMonitor } from './performanceMonitor';
import { BotFeedbackCollector } from './feedbackCollector';
import { BotAdaptationTriggers } from './adaptationTriggers';

export class BotEventIntegration implements EventIntegrationInterface {
  private logger: Logger;
  private config: IntegrationConfig;
  private performanceMonitor: BotPerformanceMonitor;
  private feedbackCollector: BotFeedbackCollector;
  private adaptationTriggers: BotAdaptationTriggers;
  private metrics: IntegrationMetrics[] = [];
  private eventHandlers: Array<(event: IntegrationEvent) => void> = [];
  private isInitialized = false;
  private processingContexts = new Map<string, EventProcessingContext>();

  constructor(
    logger: Logger,
    config: IntegrationConfig,
    performanceMonitor: BotPerformanceMonitor,
    feedbackCollector: BotFeedbackCollector,
    adaptationTriggers: BotAdaptationTriggers
  ) {
    this.logger = logger;
    this.config = config;
    this.performanceMonitor = performanceMonitor;
    this.feedbackCollector = feedbackCollector;
    this.adaptationTriggers = adaptationTriggers;
  }

  public connectEventHandlers(): void {
    if (this.isInitialized) {
      this.logger.warn('Event integration already initialized');
      return;
    }

    try {
      // Subscribe to performance monitor events
      this.performanceMonitor.onEvent(this.handleIntegrationEvent.bind(this));
      
      // Subscribe to feedback collector events
      this.feedbackCollector.onEvent(this.handleIntegrationEvent.bind(this));
      
      // Subscribe to adaptation trigger events
      this.adaptationTriggers.onEvent(this.handleIntegrationEvent.bind(this));

      this.isInitialized = true;
      this.logger.info('Event integration handlers connected successfully');

      this.emitEvent('integration_initialized', {
        components: ['performance_monitor', 'feedback_collector', 'adaptation_triggers'],
        config: this.config
      });

    } catch (error: any) {
      this.logger.error('Failed to connect event handlers:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'event_handler_connection'
      });
    }
  }

  public disconnectEventHandlers(): void {
    if (!this.isInitialized) {
      this.logger.warn('Event integration not initialized');
      return;
    }

    try {
      // Clear event handlers
      this.performanceMonitor = null as any;
      this.feedbackCollector = null as any;
      this.adaptationTriggers = null as any;

      this.isInitialized = false;
      this.logger.info('Event integration handlers disconnected');

      this.emitEvent('integration_disconnected', {
        reason: 'manual_disconnect'
      });

    } catch (error: any) {
      this.logger.error('Failed to disconnect event handlers:', error);
    }
  }

  public async processEvent(event: DiscordEvent): Promise<void> {
    if (!this.isInitialized) {
      this.logger.warn('Event integration not initialized - cannot process event');
      return;
    }

    const eventId = this.generateEventId(event);
    const startTime = Date.now();

    try {
      this.logger.debug(`Processing event: ${event.type}`, {
        eventId,
        userId: event.userId,
        guildId: event.guildId
      });

      // Create processing context
      const context: EventProcessingContext = {
        event,
        startTime,
        metadata: {
          eventId,
          processingStart: startTime
        },
        performance: {
          processingTime: 0,
          memoryBefore: this.getMemoryUsage(),
          memoryAfter: 0
        }
      };

      this.processingContexts.set(eventId, context);

      // Start performance monitoring for this event
      this.performanceMonitor.startEventTiming(eventId);

      // Process event through different components
      await this.processThroughComponents(event, context);

      // End performance monitoring
      const processingTime = this.performanceMonitor.endEventTiming(eventId);
      context.performance.processingTime = processingTime;
      context.performance.memoryAfter = this.getMemoryUsage();

      // Update counters
      this.performanceMonitor.incrementEventCounter(event.type, true);

      // Collect feedback if applicable
      if (this.shouldCollectFeedback(event)) {
        await this.feedbackCollector.collectFeedback(event);
      }

      // Create integration metrics
      const integrationMetrics = await this.createIntegrationMetrics(event, context);
      this.metrics.push(integrationMetrics);

      // Check for adaptation triggers
      await this.checkAdaptationTriggers();

      this.logger.debug(`Event processed successfully: ${event.type}`, {
        eventId,
        processingTime,
        memoryDelta: context.performance.memoryAfter - context.performance.memoryBefore
      });

      this.emitEvent('event_processed', {
        eventType: event.type,
        eventId,
        processingTime,
        metrics: integrationMetrics
      });

    } catch (error: any) {
      this.performanceMonitor.incrementEventCounter(event.type, false);
      this.processingContexts.delete(eventId);

      this.logger.error(`Failed to process event: ${event.type}`, error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'event_processing',
        eventType: event.type,
        eventId
      });
    } finally {
      // Cleanup
      this.processingContexts.delete(eventId);
    }
  }

  public getMetrics(): IntegrationMetrics[] {
    return [...this.metrics];
  }

  public getProcessingContext(eventId: string): EventProcessingContext | undefined {
    return this.processingContexts.get(eventId);
  }

  public onEvent(handler: (event: IntegrationEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  private async processThroughComponents(event: DiscordEvent, context: EventProcessingContext): Promise<void> {
    // Process through performance monitor
    if (this.config.performanceMonitoring.enabled) {
      // Performance monitoring is already tracking the event timing
      this.logger.debug('Event being tracked by performance monitor');
    }

    // Process through feedback collector
    if (this.config.feedbackCollection.enabled) {
      this.logger.debug('Event processed through feedback collector');
    }

    // Additional component processing can be added here
    // For example: safety checks, content filtering, etc.
  }

  private shouldCollectFeedback(event: DiscordEvent): boolean {
    if (!this.config.feedbackCollection.enabled) {
      return false;
    }

    // Check if event is in a tracked channel
    if (event.channelId && this.config.feedbackCollection.channels.length > 0) {
      return this.config.feedbackCollection.channels.includes(event.channelId);
    }

    // Check if event type should collect feedback
    const feedbackEventTypes = ['messageCreate', 'messageReactionAdd', 'interactionCreate'];
    return feedbackEventTypes.includes(event.type);
  }

  private async createIntegrationMetrics(event: DiscordEvent, context: EventProcessingContext): Promise<IntegrationMetrics> {
    const metrics: IntegrationMetrics = {
      timestamp: new Date(),
      eventType: event.type,
      metrics: {},
      confidence: this.calculateMetricsConfidence(event, context)
    };

    // Add performance metrics if available
    if (this.config.performanceMonitoring.enabled) {
      const performanceData = await this.performanceMonitor.collectMetrics();
      metrics.metrics.performance = performanceData;
    }

    // Add feedback metrics if available
    if (this.config.feedbackCollection.enabled) {
      const feedbackAnalysis = await this.feedbackCollector.analyzeFeedback();
      metrics.metrics.feedback = feedbackAnalysis;
    }

    // Add adaptation metrics if available
    if (this.config.adaptationTriggers.enabled) {
      const recentAdaptations = this.adaptationTriggers.getAdaptationHistory().slice(-5);
      metrics.metrics.adaptations = recentAdaptations;
    }

    return metrics;
  }

  private calculateMetricsConfidence(event: DiscordEvent, context: EventProcessingContext): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on processing time consistency
    if (context.performance.processingTime < 1000) { // Less than 1 second
      confidence += 0.2;
    }

    // Increase confidence based on memory usage stability
    const memoryDelta = Math.abs(context.performance.memoryAfter - context.performance.memoryBefore);
    if (memoryDelta < 10) { // Less than 10MB delta
      confidence += 0.1;
    }

    // Increase confidence based on event completeness
    if (event.userId && event.guildId && event.timestamp) {
      confidence += 0.1;
    }

    // Increase confidence based on system health
    if (this.isInitialized) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.95); // Cap at 95%
  }

  private async checkAdaptationTriggers(): Promise<void> {
    if (!this.config.adaptationTriggers.enabled) {
      return;
    }

    try {
      const recentMetrics = this.metrics.slice(-20); // Last 20 metrics
      const adaptationActions = await this.adaptationTriggers.checkTriggers(recentMetrics);

      if (adaptationActions.length > 0) {
        await this.adaptationTriggers.executeAdaptations(adaptationActions);
      }
    } catch (error: any) {
      this.logger.error('Failed to check adaptation triggers:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'adaptation_trigger_check'
      });
    }
  }

  private generateEventId(event: DiscordEvent): string {
    const timestamp = event.timestamp.getTime();
    const random = Math.random().toString(36).substr(2, 9);
    return `${event.type}_${timestamp}_${random}`;
  }

  private getMemoryUsage(): number {
    try {
      if (typeof globalThis !== 'undefined' && (globalThis as any).process?.memoryUsage) {
        const usage = (globalThis as any).process.memoryUsage();
        return Math.round(usage.heapUsed / 1024 / 1024); // Convert to MB
      }
    } catch (error: any) {
      this.logger.debug('Could not get memory usage:', error);
    }
    return 0;
  }

  private emitEvent(type: string, data: Record<string, any>): void {
    const event: IntegrationEvent = {
      type: type as any,
      timestamp: new Date(),
      data,
      source: 'event_integration'
    };

    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error: any) {
        this.logger.error('Error in integration event handler:', error);
      }
    });
  }

  private handleIntegrationEvent(event: IntegrationEvent): void {
    this.logger.debug(`Integration event received: ${event.type}`, event.data);
  }

  public clearMetrics(): void {
    this.metrics = [];
    this.processingContexts.clear();
    this.logger.info('Integration metrics cleared');
  }

  public getHealthStatus(): {
    isHealthy: boolean;
    issues: string[];
    metrics: {
      totalEvents: number;
      averageProcessingTime: number;
      errorRate: number;
      memoryUsage: number;
    };
  } {
    const issues: string[] = [];
    const totalEvents = this.metrics.length;
    
    if (totalEvents === 0) {
      return {
        isHealthy: false,
        issues: ['No metrics available'],
        metrics: { totalEvents: 0, averageProcessingTime: 0, errorRate: 0, memoryUsage: 0 }
      };
    }

    const recentMetrics = this.metrics.slice(-50); // Last 50 events
    const averageProcessingTime = recentMetrics.reduce((sum, m) => {
      const perf = m.metrics.performance;
      return sum + (perf?.responseTime || 0);
    }, 0) / recentMetrics.length;

    const errorRate = this.performanceMonitor.getMetrics().slice(-10)
      .reduce((sum, m) => sum + m.errorRate, 0) / Math.min(10, this.performanceMonitor.getMetrics().length);

    const memoryUsage = this.getMemoryUsage();

    // Health checks
    if (averageProcessingTime > 2000) {
      issues.push('High average processing time');
    }

    if (errorRate > 0.1) {
      issues.push('High error rate');
    }

    if (memoryUsage > 500) {
      issues.push('High memory usage');
    }

    if (!this.isInitialized) {
      issues.push('Integration not initialized');
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      metrics: {
        totalEvents,
        averageProcessingTime,
        errorRate,
        memoryUsage
      }
    };
  }
}