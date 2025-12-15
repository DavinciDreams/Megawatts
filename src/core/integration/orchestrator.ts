import { 
  IntegrationOrchestratorDependencies,
  IntegrationConfig,
  IntegrationEvent,
  IntegrationMetrics
} from './types';
import { Logger } from '../../utils/logger';
import { SelfEditingEngine } from '../../self-editing/engine';
import { BotEventIntegration } from './eventIntegration';
import { BotPerformanceMonitor } from './performanceMonitor';
import { BotFeedbackCollector } from './feedbackCollector';
import { BotAdaptationTriggers } from './adaptationTriggers';

export class IntegrationOrchestrator {
  private logger: Logger;
  private config: IntegrationConfig;
  private selfEditingEngine: SelfEditingEngine;
  private eventIntegration: BotEventIntegration;
  private performanceMonitor: BotPerformanceMonitor;
  private feedbackCollector: BotFeedbackCollector;
  private adaptationTriggers: BotAdaptationTriggers;
  private isInitialized = false;
  private eventHandlers: Array<(event: IntegrationEvent) => void> = [];
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor(dependencies: IntegrationOrchestratorDependencies) {
    this.logger = dependencies.logger;
    this.config = dependencies.config;
    this.selfEditingEngine = dependencies.selfEditingEngine;
    
    // Initialize components
    this.performanceMonitor = new BotPerformanceMonitor(
      this.logger,
      this.config.performanceMonitoring.thresholds
    );
    
    this.feedbackCollector = new BotFeedbackCollector(
      this.logger,
      this.config.feedbackCollection
    );
    
    this.adaptationTriggers = new BotAdaptationTriggers(
      this.logger,
      this.selfEditingEngine,
      this.config.adaptationTriggers
    );
    
    this.eventIntegration = new BotEventIntegration(
      this.logger,
      this.config,
      this.performanceMonitor,
      this.feedbackCollector,
      this.adaptationTriggers
    );
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Integration orchestrator already initialized');
      return;
    }

    try {
      this.logger.info('Initializing integration orchestrator...');

      // Start performance monitoring
      if (this.config.performanceMonitoring.enabled) {
        this.performanceMonitor.startMonitoring();
        this.logger.info('Performance monitoring started');
      }

      // Connect event integration
      this.eventIntegration.connectEventHandlers();
      
      // Subscribe to component events
      this.performanceMonitor.onEvent(this.handleIntegrationEvent.bind(this));
      this.feedbackCollector.onEvent(this.handleIntegrationEvent.bind(this));
      this.adaptationTriggers.onEvent(this.handleIntegrationEvent.bind(this));
      this.eventIntegration.onEvent(this.handleIntegrationEvent.bind(this));

      // Start health checks
      this.startHealthChecks();

      this.isInitialized = true;
      this.logger.info('Integration orchestrator initialized successfully');

      this.emitEvent('orchestrator_initialized', {
        components: {
          performanceMonitor: this.config.performanceMonitoring.enabled,
          feedbackCollector: this.config.feedbackCollection.enabled,
          adaptationTriggers: this.config.adaptationTriggers.enabled
        }
      });

    } catch (error: any) {
      this.logger.error('Failed to initialize integration orchestrator:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'orchestrator_initialization'
      });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      this.logger.warn('Integration orchestrator not initialized');
      return;
    }

    try {
      this.logger.info('Shutting down integration orchestrator...');

      // Stop health checks
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null as any;
      }

      // Disconnect event integration
      this.eventIntegration.disconnectEventHandlers();

      // Stop performance monitoring
      if (this.config.performanceMonitoring.enabled) {
        this.performanceMonitor.stopMonitoring();
        this.logger.info('Performance monitoring stopped');
      }

      this.isInitialized = false;
      this.logger.info('Integration orchestrator shutdown successfully');

      this.emitEvent('orchestrator_shutdown', {
        reason: 'manual_shutdown'
      });

    } catch (error: any) {
      this.logger.error('Failed to shutdown integration orchestrator:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'orchestrator_shutdown'
      });
    }
  }

  public async processEvent(event: any): Promise<void> {
    if (!this.isInitialized) {
      this.logger.warn('Integration orchestrator not initialized - cannot process event');
      return;
    }

    try {
      // Convert to DiscordEvent format
      const discordEvent = this.convertToDiscordEvent(event);
      
      // Process through event integration
      await this.eventIntegration.processEvent(discordEvent);

    } catch (error: any) {
      this.logger.error('Failed to process event in orchestrator:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'orchestrator_event_processing',
        eventType: event.type
      });
    }
  }

  public getMetrics(): IntegrationMetrics[] {
    return this.eventIntegration.getMetrics();
  }

  public getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }

  public getFeedbackData() {
    return this.feedbackCollector.getFeedback();
  }

  public getAdaptationHistory() {
    return this.adaptationTriggers.getAdaptationHistory();
  }

  public getHealthStatus() {
    const integrationHealth = this.eventIntegration.getHealthStatus();
    const performanceHealth = this.performanceMonitor.getAverageMetrics();
    
    return {
      orchestrator: {
        isInitialized: this.isInitialized,
        uptime: this.isInitialized ? Date.now() - (this as any).startTime : 0
      },
      integration: integrationHealth,
      performance: performanceHealth,
      components: {
        performanceMonitor: this.config.performanceMonitoring.enabled,
        feedbackCollector: this.config.feedbackCollection.enabled,
        adaptationTriggers: this.config.adaptationTriggers.enabled
      }
    };
  }

  public onEvent(handler: (event: IntegrationEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  public async triggerAnalysis(): Promise<void> {
    if (!this.isInitialized) {
      this.logger.warn('Integration orchestrator not initialized - cannot trigger analysis');
      return;
    }

    try {
      this.logger.info('Manual analysis triggered');

      // Trigger performance analysis
      if (this.config.performanceMonitoring.enabled) {
        const performanceMetrics = await this.selfEditingEngine.analyzePerformance();
        this.logger.info('Performance analysis completed', performanceMetrics);
      }

      // Trigger feedback analysis
      if (this.config.feedbackCollection.enabled) {
        const feedbackMetrics = await this.selfEditingEngine.analyzeUserFeedback();
        this.logger.info('User feedback analysis completed', feedbackMetrics);
      }

      // Trigger code quality analysis
      const codeQualityMetrics = await this.selfEditingEngine.analyzeCodeQuality();
      this.logger.info('Code quality analysis completed', codeQualityMetrics);

      // Trigger behavioral adaptation
      if (this.config.adaptationTriggers.enabled) {
        const adaptationMetrics = await this.selfEditingEngine.adaptBehavior();
        this.logger.info('Behavioral adaptation completed', adaptationMetrics);
      }

      this.emitEvent('manual_analysis_completed', {
        performance: true,
        feedback: true,
        codeQuality: true,
        adaptation: true
      });

    } catch (error: any) {
      this.logger.error('Failed to trigger manual analysis:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'manual_analysis'
      });
    }
  }

  public updateConfig(newConfig: Partial<IntegrationConfig>): void {
    try {
      const oldConfig = { ...this.config };
      this.config = { ...this.config, ...newConfig };

      this.logger.info('Integration configuration updated', {
        oldConfig,
        newConfig: this.config
      });

      // Update component configurations
      if (newConfig.performanceMonitoring) {
        this.performanceMonitor.setThresholds(this.config.performanceMonitoring.thresholds);
      }

      if (newConfig.feedbackCollection) {
        // Feedback collector would need to be re-initialized with new config
        this.logger.info('Feedback collection configuration updated');
      }

      if (newConfig.adaptationTriggers) {
        // Adaptation triggers would need to be re-initialized with new config
        this.logger.info('Adaptation triggers configuration updated');
      }

      this.emitEvent('config_updated', {
        oldConfig,
        newConfig: this.config
      });

    } catch (error: any) {
      this.logger.error('Failed to update configuration:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'config_update'
      });
    }
  }

  public clearAllData(): void {
    try {
      this.performanceMonitor.clearMetrics();
      this.feedbackCollector.clearFeedback();
      this.adaptationTriggers.clearHistory();
      this.eventIntegration.clearMetrics();

      this.logger.info('All integration data cleared');
      this.emitEvent('data_cleared', {
        components: ['performance_monitor', 'feedback_collector', 'adaptation_triggers', 'event_integration']
      });

    } catch (error: any) {
      this.logger.error('Failed to clear data:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'data_clearing'
      });
    }
  }

  private convertToDiscordEvent(event: any): any {
    // Convert various event formats to DiscordEvent interface
    // This would depend on the actual Discord.js event structure
    
    const discordEvent = {
      type: this.getEventType(event),
      data: event,
      timestamp: new Date(),
      userId: this.extractUserId(event),
      guildId: this.extractGuildId(event),
      channelId: this.extractChannelId(event)
    };

    return discordEvent;
  }

  private getEventType(event: any): string {
    if (event.type) return event.type;
    if (event.event) return event.event;
    if (event.constructor) return event.constructor.name;
    return 'unknown';
  }

  private extractUserId(event: any): string | undefined {
    return event.author?.id || event.user?.id || event.userId;
  }

  private extractGuildId(event: any): string | undefined {
    return event.guild?.id || event.guildId;
  }

  private extractChannelId(event: any): string | undefined {
    return event.channel?.id || event.channelId;
  }

  private startHealthChecks(): void {
    // Run health checks every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 5 * 60 * 1000);
  }

  private performHealthCheck(): void {
    try {
      const health = this.getHealthStatus();
      
      if (!health.integration.isHealthy) {
        this.logger.warn('Integration health check failed', health.integration.issues);
        this.emitEvent('health_check_failed', {
          issues: health.integration.issues,
          metrics: health
        });
      }

      if (health.performance && health.performance.errorRate > 0.1) {
        this.logger.warn('Performance health check failed', { errorRate: health.performance.errorRate });
      }

    } catch (error: any) {
      this.logger.error('Health check failed:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'health_check'
      });
    }
  }

  private handleIntegrationEvent(event: IntegrationEvent): void {
    this.logger.debug(`Orchestrator received integration event: ${event.type}`, event.data);
    
    // Forward to external handlers
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error: any) {
        this.logger.error('Error in orchestrator event handler:', error);
      }
    });
  }

  private emitEvent(type: string, data: Record<string, any>): void {
    const event: IntegrationEvent = {
      type: type as any,
      timestamp: new Date(),
      data,
      source: 'integration_orchestrator'
    };

    // Handle internally first
    this.handleIntegrationEvent(event);

    // Then forward to external handlers
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error: any) {
        this.logger.error('Error in external event handler:', error);
      }
    });
  }
}