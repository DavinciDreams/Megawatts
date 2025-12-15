import { Message } from 'discord.js';
import { Logger } from '../../utils/logger';
import { MessageContext, ProcessingResult, PipelineConfig, PipelineStats } from './types';
import { ContextExtractor } from './contextExtractor';
import { IntentRecognizer } from './intentRecognizer';
import { SafetyChecker } from './safetyChecker';
import { MessageRouter } from './messageRouter';

/**
 * Main message processor that orchestrates the entire processing pipeline
 */
export class MessageProcessor {
  private contextExtractor: ContextExtractor;
  private intentRecognizer: IntentRecognizer;
  private safetyChecker: SafetyChecker;
  private messageRouter: MessageRouter;
  private config: PipelineConfig;
  private stats: PipelineStats;
  private logger: Logger;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.logger = new Logger('MessageProcessor');
    this.stats = {
      totalProcessed: 0,
      averageProcessingTime: 0,
      intentDistribution: {} as any,
      safetyViolations: {} as any,
      routingDistribution: {} as any,
      errorRate: 0
    };

    // Initialize pipeline components
    this.contextExtractor = new ContextExtractor(config);
    this.intentRecognizer = new IntentRecognizer(config);
    this.safetyChecker = new SafetyChecker(config);
    this.messageRouter = new MessageRouter(config);
  }

  /**
   * Process a message through the complete pipeline
   */
  async processMessage(message: Message): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Processing message ${message.id} from user ${message.author?.id}`);
      
      // Step 1: Extract context
      const context = await this.extractContext(message);
      
      // Step 2: Recognize intent
      const intent = await this.recognizeIntent(message, context);
      
      // Step 3: Safety checks
      const safety = await this.performSafetyChecks(message, context, intent);
      
      // Step 4: Route message
      const routing = await this.routeMessage(message, context, intent, safety);
      
      const processingTime = Date.now() - startTime;
      
      // Update statistics
      this.updateStats(intent, safety, routing, processingTime, true);
      
      const result: ProcessingResult = {
        originalMessage: message,
        context,
        intent,
        safety,
        routing,
        processingTime,
        success: true
      };
      
      this.logger.debug(`Message processed successfully in ${processingTime}ms`);
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(null as any, null as any, null as any, processingTime, false);
      
      this.logger.error('Error processing message:', error);
      
      return {
        originalMessage: message,
        context: this.getEmptyContext(message),
        intent: this.getEmptyIntent(),
        safety: this.getEmptySafetyResult(),
        routing: this.getEmptyRouting(),
        processingTime,
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Extract context for the message
   */
  private async extractContext(message: Message): Promise<MessageContext> {
    if (!this.config.enableContextExtraction) {
      return this.getEmptyContext(message);
    }
    
    return await this.contextExtractor.extractContext(message);
  }

  /**
   * Recognize intent of the message
   */
  private async recognizeIntent(message: Message, context: MessageContext) {
    if (!this.config.enableIntentRecognition) {
      return this.getEmptyIntent();
    }
    
    return await this.intentRecognizer.recognizeIntent(message, context);
  }

  /**
   * Perform safety checks on the message
   */
  private async performSafetyChecks(message: Message, context: MessageContext, intent: any) {
    if (!this.config.enableSafetyChecks) {
      return this.getEmptySafetyResult();
    }
    
    return await this.safetyChecker.checkSafety(message, context, intent);
  }

  /**
   * Route the message to appropriate handler
   */
  private async routeMessage(message: Message, context: MessageContext, intent: any, safety: any) {
    return await this.messageRouter.routeMessage(message, context, intent, safety);
  }

  /**
   * Update processing statistics
   */
  private updateStats(intent: any, safety: any, routing: any, processingTime: number, success: boolean) {
    this.stats.totalProcessed++;
    
    // Update average processing time
    this.stats.averageProcessingTime = 
      (this.stats.averageProcessingTime * (this.stats.totalProcessed - 1) + processingTime) / 
      this.stats.totalProcessed;
    
    // Update intent distribution
    if (intent && intent.type) {
      this.stats.intentDistribution[intent.type] = 
        (this.stats.intentDistribution[intent.type] || 0) + 1;
    }
    
    // Update safety violations
    if (safety && !safety.isSafe && safety.violations) {
      safety.violations.forEach((violation: any) => {
        this.stats.safetyViolations[violation.type] = 
          (this.stats.safetyViolations[violation.type] || 0) + 1;
      });
    }
    
    // Update routing distribution
    if (routing && routing.handler) {
      this.stats.routingDistribution[routing.handler] = 
        (this.stats.routingDistribution[routing.handler] || 0) + 1;
    }
    
    // Update error rate
    if (!success) {
      this.stats.errorRate = (this.stats.errorRate * (this.stats.totalProcessed - 1) + 1) / 
        this.stats.totalProcessed;
    }
  }

  /**
   * Get empty context for fallback
   */
  private getEmptyContext(message: Message): MessageContext {
    return {
      userId: message.author?.id || 'unknown',
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      timestamp: new Date()
    };
  }

  /**
   * Get empty intent for fallback
   */
  private getEmptyIntent() {
    return {
      type: 'unknown' as any,
      confidence: 0,
      entities: []
    };
  }

  /**
   * Get empty safety result for fallback
   */
  private getEmptySafetyResult() {
    return {
      isSafe: true,
      riskLevel: 'low' as any,
      violations: [],
      confidence: 1.0,
      requiresAction: false
    };
  }

  /**
   * Get empty routing decision for fallback
   */
  private getEmptyRouting() {
    return {
      handler: 'ignore' as any,
      priority: 0,
      requiresModeration: false,
      shouldRespond: false
    };
  }

  /**
   * Get current processing statistics
   */
  getStats(): PipelineStats {
    return { ...this.stats };
  }

  /**
   * Reset processing statistics
   */
  resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      averageProcessingTime: 0,
      intentDistribution: {} as any,
      safetyViolations: {} as any,
      routingDistribution: {} as any,
      errorRate: 0
    };
  }

  /**
   * Update processor configuration
   */
  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update component configurations
    this.contextExtractor.updateConfig(this.config);
    this.intentRecognizer.updateConfig(this.config);
    this.safetyChecker.updateConfig(this.config);
    this.messageRouter.updateConfig(this.config);
    
    this.logger.info('Message processor configuration updated');
  }
}