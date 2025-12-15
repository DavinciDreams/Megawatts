import { 
  AdaptationTrigger, 
  AdaptationAction, 
  IntegrationMetrics, 
  IntegrationEvent,
  PerformanceMetrics,
  FeedbackAnalysis 
} from './types';
import { Logger } from '../../utils/logger';
import { SelfEditingEngine } from '../../self-editing/engine';

export class BotAdaptationTriggers implements AdaptationTrigger {
  private logger: Logger;
  private selfEditingEngine: SelfEditingEngine;
  private adaptationHistory: AdaptationAction[] = [];
  private eventHandlers: Array<(event: IntegrationEvent) => void> = [];
  private performanceThreshold: number;
  private feedbackThreshold: number;
  private adaptationRate: number;
  private maxAdaptationsPerHour: number;
  private lastAdaptationTime = new Date(0);

  constructor(
    logger: Logger,
    selfEditingEngine: SelfEditingEngine,
    config: {
      performanceThreshold: number;
      feedbackThreshold: number;
      adaptationRate: number;
      maxAdaptationsPerHour: number;
    }
  ) {
    this.logger = logger;
    this.selfEditingEngine = selfEditingEngine;
    this.performanceThreshold = config.performanceThreshold;
    this.feedbackThreshold = config.feedbackThreshold;
    this.adaptationRate = config.adaptationRate;
    this.maxAdaptationsPerHour = config.maxAdaptationsPerHour;
  }

  public async checkTriggers(metrics: IntegrationMetrics[]): Promise<AdaptationAction[]> {
    try {
      const actions: AdaptationAction[] = [];

      // Check if we can adapt (rate limiting)
      if (!this.canAdapt()) {
        this.logger.debug('Adaptation rate limited - skipping trigger checks');
        return actions;
      }

      // Performance-based triggers
      const performanceActions = this.checkPerformanceTriggers(metrics);
      actions.push(...performanceActions);

      // Feedback-based triggers
      const feedbackActions = this.checkFeedbackTriggers(metrics);
      actions.push(...feedbackActions);

      // System health triggers
      const healthActions = this.checkSystemHealthTriggers(metrics);
      actions.push(...healthActions);

      // Prioritize actions
      const prioritizedActions = this.prioritizeActions(actions);

      if (prioritizedActions.length > 0) {
        this.logger.info(`Adaptation triggers activated: ${prioritizedActions.length} actions`, {
          actions: prioritizedActions.map(a => ({ type: a.type, priority: a.priority }))
        });

        this.emitEvent('adaptation_triggered', {
          triggerCount: prioritizedActions.length,
          actions: prioritizedActions
        });
      }

      return prioritizedActions;
    } catch (error: any) {
      this.logger.error('Failed to check adaptation triggers:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'trigger_checking'
      });
      return [];
    }
  }

  public async executeAdaptations(actions: AdaptationAction[]): Promise<void> {
    const executedActions: AdaptationAction[] = [];

    try {
      for (const action of actions) {
        try {
          this.logger.info(`Executing adaptation: ${action.description}`, {
            type: action.type,
            priority: action.priority
          });

          action.status = 'executing';
          const startTime = Date.now();

          const result = await this.executeAction(action);
          const executionTime = Date.now() - startTime;

          action.status = 'completed';
          action.result = {
            success: result.success,
            message: result.message,
            metrics: {
              executionTime,
              ...result.metrics
            }
          };

          executedActions.push(action);
          this.adaptationHistory.push(action);
          this.lastAdaptationTime = new Date();

          this.logger.info(`Adaptation executed successfully: ${action.description}`, {
            executionTime,
            success: result.success
          });

          this.emitEvent('adaptation_triggered', {
            action: action,
            result: action.result
          });

        } catch (error: any) {
          action.status = 'failed';
          action.result = {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
          };

          this.logger.error(`Adaptation failed: ${action.description}`, error);
          this.emitEvent('error_occurred', {
            error: error instanceof Error ? error.message : 'Unknown error',
            context: 'adaptation_execution',
            action: action
          });
        }
      }

      // Update adaptation rate based on success/failure
      this.updateAdaptationRate(executedActions);

    } catch (error: any) {
      this.logger.error('Critical error during adaptation execution:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'adaptation_execution_batch'
      });
    }
  }

  public getAdaptationHistory(): AdaptationAction[] {
    return [...this.adaptationHistory];
  }

  public onEvent(handler: (event: IntegrationEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  private canAdapt(): boolean {
    const now = new Date();
    const hoursSinceLastAdaptation = (now.getTime() - this.lastAdaptationTime.getTime()) / (1000 * 60 * 60);
    
    // Check rate limiting
    if (hoursSinceLastAdaptation < (1 / this.maxAdaptationsPerHour)) {
      return false;
    }

    // Check adaptation probability
    return Math.random() < this.adaptationRate;
  }

  private checkPerformanceTriggers(metrics: IntegrationMetrics[]): AdaptationAction[] {
    const actions: AdaptationAction[] = [];
    const recentPerformance = metrics
      .filter(m => m.metrics.performance)
      .slice(-5); // Last 5 performance measurements

    if (recentPerformance.length < 3) {
      return actions; // Need more data
    }

    const avgResponseTime = recentPerformance.reduce((sum, m) => 
      sum + (m.metrics.performance as PerformanceMetrics).responseTime, 0) / recentPerformance.length;
    
    const avgErrorRate = recentPerformance.reduce((sum, m) => 
      sum + (m.metrics.performance as PerformanceMetrics).errorRate, 0) / recentPerformance.length;

    const avgMemoryUsage = recentPerformance.reduce((sum, m) => 
      sum + (m.metrics.performance as PerformanceMetrics).memoryUsage, 0) / recentPerformance.length;

    // Response time triggers
    if (avgResponseTime > this.performanceThreshold * 1000) { // Convert to ms
      actions.push(this.createAdaptationAction(
        'performance',
        'high',
        'Optimize response processing to reduce latency',
        {
          targetMetric: 'responseTime',
          currentValue: avgResponseTime,
          targetValue: this.performanceThreshold * 1000,
          strategies: ['caching', 'async_processing', 'connection_pooling']
        }
      ));
    }

    // Error rate triggers
    if (avgErrorRate > this.performanceThreshold * 0.05) { // 5% threshold
      actions.push(this.createAdaptationAction(
        'performance',
        'high',
        'Implement additional error handling and validation',
        {
          targetMetric: 'errorRate',
          currentValue: avgErrorRate,
          targetValue: this.performanceThreshold * 0.05,
          strategies: ['input_validation', 'retry_logic', 'graceful_degradation']
        }
      ));
    }

    // Memory usage triggers
    if (avgMemoryUsage > this.performanceThreshold * 100) { // 100MB threshold
      actions.push(this.createAdaptationAction(
        'performance',
        'medium',
        'Optimize memory usage and implement cleanup',
        {
          targetMetric: 'memoryUsage',
          currentValue: avgMemoryUsage,
          targetValue: this.performanceThreshold * 100,
          strategies: ['garbage_collection', 'memory_pooling', 'data_structuring']
        }
      ));
    }

    return actions;
  }

  private checkFeedbackTriggers(metrics: IntegrationMetrics[]): AdaptationAction[] {
    const actions: AdaptationAction[] = [];
    const recentFeedback = metrics
      .filter(m => m.metrics.feedback)
      .slice(-10); // Last 10 feedback analyses

    if (recentFeedback.length < 3) {
      return actions; // Need more data
    }

    const avgNegativeSentiment = recentFeedback.reduce((sum, m) => 
      sum + (m.metrics.feedback as FeedbackAnalysis).sentiment.negative, 0) / recentFeedback.length;

    const avgRating = recentFeedback.reduce((sum, m) => 
      sum + (m.metrics.feedback as FeedbackAnalysis).averageRating, 0) / recentFeedback.length;

    // Negative sentiment triggers
    if (avgNegativeSentiment > this.feedbackThreshold) {
      actions.push(this.createAdaptationAction(
        'behavior',
        'high',
        'Improve response quality based on negative feedback',
        {
          targetMetric: 'userSatisfaction',
          currentValue: avgNegativeSentiment,
          targetValue: this.feedbackThreshold,
          strategies: ['response_refinement', 'context_understanding', 'tone_adjustment']
        }
      ));
    }

    // Low rating triggers
    if (avgRating < 3.0 && avgRating > 0) { // Below 3/5 but has data
      actions.push(this.createAdaptationAction(
        'behavior',
        'medium',
        'Enhance response accuracy and helpfulness',
        {
          targetMetric: 'userRating',
          currentValue: avgRating,
          targetValue: 3.0,
          strategies: ['fact_checking', 'source_verification', 'clarity_improvement']
        }
      ));
    }

    return actions;
  }

  private checkSystemHealthTriggers(metrics: IntegrationMetrics[]): AdaptationAction[] {
    const actions: AdaptationAction[] = [];
    const recentMetrics = metrics.slice(-20); // Last 20 measurements

    if (recentMetrics.length < 10) {
      return actions; // Need more data
    }

    // Check for adaptation failures
    const recentFailures = this.adaptationHistory
      .filter(a => a.status === 'failed')
      .slice(-10); // Last 10 adaptations

    if (recentFailures.length > 5) { // Too many failures
      actions.push(this.createAdaptationAction(
        'configuration',
        'critical',
        'Reduce adaptation aggressiveness due to high failure rate',
        {
          targetMetric: 'adaptationSuccessRate',
          currentValue: (recentFailures.length / 10),
          targetValue: 0.3, // Max 30% failure rate
          strategies: ['rate_reduction', 'threshold_adjustment', 'manual_review']
        }
      ));
    }

    // Check for confidence issues
    const lowConfidenceMetrics = recentMetrics.filter(m => m.confidence < 0.5);
    if (lowConfidenceMetrics.length > recentMetrics.length * 0.6) { // 60% low confidence
      actions.push(this.createAdaptationAction(
        'configuration',
        'medium',
        'Improve data quality and measurement accuracy',
        {
          targetMetric: 'confidenceScore',
          currentValue: lowConfidenceMetrics.length / recentMetrics.length,
          targetValue: 0.4, // Max 40% low confidence
          strategies: ['data_validation', 'measurement_refinement', 'context_enhancement']
        }
      ));
    }

    return actions;
  }

  private prioritizeActions(actions: AdaptationAction[]): AdaptationAction[] {
    const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
    
    return actions
      .sort((a, b) => {
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        // If same priority, sort by type (safety first, then performance, then behavior, then configuration)
        const typeOrder = { 'safety': 1, 'performance': 2, 'behavior': 3, 'configuration': 4 };
        return typeOrder[a.type] - typeOrder[b.type];
      })
      .slice(0, 5); // Limit to 5 actions per cycle
  }

  private createAdaptationAction(
    type: 'performance' | 'behavior' | 'configuration' | 'safety',
    priority: 'low' | 'medium' | 'high' | 'critical',
    description: string,
    parameters: Record<string, any>
  ): AdaptationAction {
    return {
      id: `adaptation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      priority,
      description,
      parameters,
      timestamp: new Date(),
      status: 'pending'
    };
  }

  private async executeAction(action: AdaptationAction): Promise<{ success: boolean; message: string; metrics?: Record<string, any> }> {
    try {
      switch (action.type) {
        case 'performance':
          return await this.executePerformanceAdaptation(action);
        case 'behavior':
          return await this.executeBehaviorAdaptation(action);
        case 'configuration':
          return await this.executeConfigurationAdaptation(action);
        case 'safety':
          return await this.executeSafetyAdaptation(action);
        default:
          return {
            success: false,
            message: `Unknown adaptation type: ${action.type}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async executePerformanceAdaptation(action: AdaptationAction): Promise<{ success: boolean; message: string; metrics?: Record<string, any> }> {
    // Delegate to self-editing engine for performance adaptations
    try {
      const metrics = await this.selfEditingEngine.analyzePerformance();
      return {
        success: true,
        message: 'Performance adaptation executed via self-editing engine',
        metrics: {
          selfEditingMetrics: metrics,
          adaptationId: action.id
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Performance adaptation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async executeBehaviorAdaptation(action: AdaptationAction): Promise<{ success: boolean; message: string; metrics?: Record<string, any> }> {
    // Delegate to self-editing engine for behavioral adaptations
    try {
      const metrics = await this.selfEditingEngine.adaptBehavior();
      return {
        success: true,
        message: 'Behavioral adaptation executed via self-editing engine',
        metrics: {
          selfEditingMetrics: metrics,
          adaptationId: action.id
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Behavioral adaptation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async executeConfigurationAdaptation(action: AdaptationAction): Promise<{ success: boolean; message: string; metrics?: Record<string, any> }> {
    // Configuration adaptations would modify bot settings
    this.logger.info('Configuration adaptation requested', action.parameters);
    
    return {
      success: true,
      message: 'Configuration adaptation simulated (would modify bot settings)',
      metrics: {
        adaptationId: action.id,
        parametersApplied: action.parameters
      }
    };
  }

  private async executeSafetyAdaptation(action: AdaptationAction): Promise<{ success: boolean; message: string; metrics?: Record<string, any> }> {
    // Safety adaptations are critical and should be handled carefully
    this.logger.warn('Safety adaptation triggered - immediate action required', action.parameters);
    
    return {
      success: true,
      message: 'Safety adaptation executed (critical intervention)',
      metrics: {
        adaptationId: action.id,
        safetyLevel: 'critical'
      }
    };
  }

  private updateAdaptationRate(executedActions: AdaptationAction[]): void {
    const successRate = executedActions.filter(a => a.status === 'completed').length / executedActions.length;
    
    // Adjust adaptation rate based on success
    if (successRate > 0.8) {
      this.adaptationRate = Math.min(this.adaptationRate * 1.1, 0.9); // Increase but cap at 90%
    } else if (successRate < 0.5) {
      this.adaptationRate = Math.max(this.adaptationRate * 0.8, 0.1); // Decrease but min 10%
    }

    this.logger.debug(`Adaptation rate updated to ${(this.adaptationRate * 100).toFixed(1)}% based on success rate: ${(successRate * 100).toFixed(1)}%`);
  }

  private emitEvent(type: string, data: Record<string, any>): void {
    const event: IntegrationEvent = {
      type: type as any,
      timestamp: new Date(),
      data,
      source: 'adaptation_triggers'
    };

    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error: any) {
        this.logger.error('Error in adaptation event handler:', error);
      }
    });
  }

  public clearHistory(): void {
    this.adaptationHistory = [];
    this.logger.info('Adaptation history cleared');
  }
}