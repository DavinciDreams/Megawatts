import { Logger } from '../../utils/logger';
import { MessageProcessor } from './messageProcessor';
import { PipelineConfig, ProcessingResult, PipelineStats } from './types';

/**
 * Simple event emitter for pipeline
 */
class SimpleEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  emit(event: string, data?: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(data));
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

/**
 * Main processing pipeline orchestrator
 * Manages overall message processing workflow
 */
export class ProcessingPipeline extends SimpleEventEmitter {
  private processor: MessageProcessor;
  private config: PipelineConfig;
  private logger: Logger;
  private isProcessing: boolean = false;
  private processingQueue: ProcessingQueueItem[] = [];
  private maxQueueSize: number = 1000;
  private processingInterval: number = 100; // ms between batch processing
  private batchProcessing: boolean = false;
  private batchSize: number = 10;

  constructor(config: PipelineConfig) {
    super();
    this.config = config;
    this.logger = new Logger('ProcessingPipeline');
    this.processor = new MessageProcessor(config);
    
    this.setupEventHandlers();
  }

  /**
   * Process a single message
   */
  async processMessage(message: any): Promise<ProcessingResult> {
    if (this.batchProcessing) {
      return this.queueMessage(message);
    }

    return this.processSingleMessage(message);
  }

  /**
   * Process multiple messages in batch
   */
  async processMessages(messages: any[]): Promise<ProcessingResult[]> {
    this.batchProcessing = true;
    
    try {
      const results: ProcessingResult[] = [];
      
      for (const message of messages) {
        const result = await this.processSingleMessage(message);
        results.push(result);
      }

      this.emit('batchProcessed', { messages, results });
      return results;

    } finally {
      this.batchProcessing = false;
    }
  }

  /**
   * Process single message internally
   */
  private async processSingleMessage(message: any): Promise<ProcessingResult> {
    try {
      this.isProcessing = true;
      this.logger.debug(`Processing message: ${message.id}`);

      // Emit processing start event
      this.emit('processingStart', { message, timestamp: new Date() });

      // Process message through processor
      const result = await this.processor.processMessage(message);

      // Emit processing complete event
      this.emit('processingComplete', { message, result, timestamp: new Date() });

      // Handle routing if configured
      if (this.config.enableLogging && result.routing.shouldRespond) {
        this.emit('responseRequired', { message, result });
      }

      // Handle moderation if required
      if (result.routing.requiresModeration) {
        this.emit('moderationRequired', { message, result });
      }

      return result;

    } catch (error) {
      this.logger.error('Error in pipeline processing:', error instanceof Error ? error : new Error('Unknown error'));
      this.emit('processingError', { message, error, timestamp: new Date() });
      
      return {
        originalMessage: message,
        context: this.getEmptyContext(message),
        intent: this.getEmptyIntent(),
        safety: this.getEmptySafetyResult(),
        routing: this.getEmptyRouting(),
        processingTime: 0,
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Queue message for batch processing
   */
  private async queueMessage(message: any): Promise<ProcessingResult> {
    return new Promise((resolve, reject) => {
      if (this.processingQueue.length >= this.maxQueueSize) {
        reject(new Error('Processing queue is full'));
        return;
      }

      const queueItem: ProcessingQueueItem = {
        message,
        resolve,
        reject,
        timestamp: new Date(),
        retryCount: 0
      };

      this.processingQueue.push(queueItem);
      
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued messages
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batch = this.processingQueue.splice(0, this.batchSize);
      
      const results = await Promise.all(
        batch.map(async (item) => {
          try {
            const result = await this.processor.processMessage(item.message);
            item.resolve(result);
            return result;
          } catch (error) {
            const errorObj = error instanceof Error ? error : new Error('Unknown error');
            item.reject(errorObj);
            throw errorObj;
          }
        })
      );

      this.emit('batchProcessed', { 
        messages: batch.map(item => item.message), 
        results 
      });

      // Continue processing if queue has items
      if (this.processingQueue.length > 0) {
        setTimeout(() => this.processQueue(), this.processingInterval);
      }

    } catch (error) {
      this.logger.error('Error processing queue:', error instanceof Error ? error : new Error('Unknown error'));
      
      // Reject remaining items in batch
      const batch = this.processingQueue.splice(0, this.batchSize);
      const errorObj = error instanceof Error ? error : new Error('Unknown error');
      batch.forEach(item => item.reject(errorObj));
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('processingComplete', (data: any) => {
      if (this.config.enableLogging) {
        this.logger.debug(`Message processed: ${data.message.id}`, {
          intent: data.result.intent.type,
          confidence: data.result.intent.confidence,
          handler: data.result.routing.handler,
          processingTime: data.result.processingTime
        });
      }
    });

    this.on('processingError', (data: any) => {
      this.logger.error(`Processing error for message ${data.message.id}:`, data.error);
    });

    this.on('moderationRequired', (data: any) => {
      this.logger.warn(`Moderation required for message ${data.message.id}`, {
        violations: data.result.safety.violations,
        riskLevel: data.result.safety.riskLevel
      });
    });
  }

  /**
   * Get pipeline statistics
   */
  getStats(): PipelineStats {
    const processorStats = this.processor.getStats();
    
    return {
      ...processorStats,
      queueSize: this.processingQueue.length,
      isProcessing: this.isProcessing
    } as PipelineStats;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    size: number;
    maxSize: number;
    isProcessing: boolean;
    oldestItem?: Date;
  } {
    const oldestItem = this.processingQueue.length > 0 
      ? this.processingQueue[0].timestamp 
      : undefined;

    return {
      size: this.processingQueue.length,
      maxSize: this.maxQueueSize,
      isProcessing: this.isProcessing,
      oldestItem: oldestItem || undefined
    };
  }

  /**
   * Clear processing queue
   */
  clearQueue(): void {
    // Reject all queued items
    this.processingQueue.forEach(item => {
      item.reject(new Error('Queue cleared'));
    });

    this.processingQueue = [];
    this.logger.info('Processing queue cleared');
  }

  /**
   * Pause processing
   */
  pause(): void {
    this.isProcessing = true;
    this.logger.info('Processing pipeline paused');
  }

  /**
   * Resume processing
   */
  resume(): void {
    this.isProcessing = false;
    this.logger.info('Processing pipeline resumed');
    
    // Start processing queue if there are items
    if (this.processingQueue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * Update pipeline configuration
   */
  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
    this.processor.updateConfig(this.config);
    
    this.emit('configUpdated', { config: this.config, timestamp: new Date() });
    this.logger.info('Pipeline configuration updated');
  }

  /**
   * Enable/disable batch processing
   */
  setBatchProcessing(enabled: boolean, batchSize?: number): void {
    this.batchProcessing = enabled;
    if (batchSize !== undefined) {
      this.batchSize = Math.max(1, Math.min(100, batchSize));
    }
    
    this.logger.info(`Batch processing ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set processing interval
   */
  setProcessingInterval(interval: number): void {
    this.processingInterval = Math.max(10, interval);
    this.logger.info(`Processing interval set to ${this.processingInterval}ms`);
  }

  /**
   * Set maximum queue size
   */
  setMaxQueueSize(size: number): void {
    this.maxQueueSize = Math.max(10, size);
    this.logger.info(`Max queue size set to ${this.maxQueueSize}`);
  }

  /**
   * Shutdown pipeline
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down processing pipeline');
    
    // Wait for current processing to complete
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clear queue and reject all items
    this.clearQueue();
    
    // Remove all event listeners
    this.removeAllListeners();
    
    this.logger.info('Processing pipeline shutdown complete');
  }

  /**
   * Empty context for fallback
   */
  private getEmptyContext(message: any) {
    return {
      userId: message.author?.id || 'unknown',
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      timestamp: new Date()
    };
  }

  /**
   * Empty intent for fallback
   */
  private getEmptyIntent() {
    return {
      type: 'unknown' as any,
      confidence: 0,
      entities: []
    };
  }

  /**
   * Empty safety result for fallback
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
   * Empty routing for fallback
   */
  private getEmptyRouting() {
    return {
      handler: 'ignore' as any,
      priority: 0,
      requiresModeration: false,
      shouldRespond: false
    };
  }
}

/**
 * Queue item interface
 */
interface ProcessingQueueItem {
  message: any;
  resolve: (result: ProcessingResult) => void;
  reject: (error: Error) => void;
  timestamp: Date;
  retryCount: number;
}