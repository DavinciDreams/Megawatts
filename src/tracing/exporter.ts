/**
 * @fileoverview Tracing Exporters Implementation
 * 
 * Provides multiple exporters for distributed tracing:
 * - Jaeger exporter
 * - Zipkin exporter
 * - OTLP (OpenTelemetry Protocol) exporter
 * - Console exporter for development
 * - Batch export with retry logic
 * - Export queue management
 * 
 * @module tracing/exporter
 */

import {
  SpanExporter,
  ReadableSpan,
  ExportResult,
  ExportResultCode,
} from '@opentelemetry/sdk-trace-base';
import {
  JaegerExporter,
  JaegerExporterOptions,
} from '@opentelemetry/exporter-jaeger';
import {
  ZipkinExporter,
  ZipkinExporterOptions,
} from '@opentelemetry/exporter-zipkin';
import {
  OTLPTraceExporter,
  OTLPTraceExporterOptions,
} from '@opentelemetry/exporter-trace-otlp-grpc';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';

/**
 * Exporter type enumeration
 */
export enum ExporterType {
  /** Jaeger exporter */
  JAEGER = 'jaeger',
  /** Zipkin exporter */
  ZIPKIN = 'zipkin',
  /** OTLP exporter */
  OTLP = 'otlp',
  /** Console exporter */
  CONSOLE = 'console',
}

/**
 * Exporter configuration options
 */
export interface ExporterConfig {
  /** Exporter type */
  type: ExporterType;
  /** Service name */
  serviceName: string;
  /** Jaeger configuration (for Jaeger exporter) */
  jaeger?: JaegerExporterOptions;
  /** Zipkin configuration (for Zipkin exporter) */
  zipkin?: ZipkinExporterOptions;
  /** OTLP configuration (for OTLP exporter) */
  otlp?: OTLPTraceExporterOptions;
  /** Enable console output (for Console exporter) */
  console?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Enable batch export */
  enableBatch?: boolean;
}

/**
 * Export queue item
 */
interface ExportQueueItem {
  /** Spans to export */
  spans: ReadableSpan[];
  /** Resolve function */
  resolve: (result: ExportResult) => void;
  /** Reject function */
  reject: (error: Error) => void;
  /** Retry count */
  retryCount: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Export statistics
 */
export interface ExportStats {
  /** Total exports */
  totalExports: number;
  /** Successful exports */
  successfulExports: number;
  /** Failed exports */
  failedExports: number;
  /** Retried exports */
  retriedExports: number;
  /** Current queue size */
  queueSize: number;
}

/**
 * Tracing exporter class
 */
export class TracingExporter {
  private exporter: SpanExporter;
  private logger: Logger;
  private config: ExporterConfig;
  private exportQueue: ExportQueueItem[] = [];
  private isProcessing: boolean = false;
  private stats: ExportStats = {
    totalExports: 0,
    successfulExports: 0,
    failedExports: 0,
    retriedExports: 0,
    queueSize: 0,
  };
  private maxRetries: number;
  private retryDelay: number;
  private queueTimer?: NodeJS.Timeout;

  /**
   * Creates a new TracingExporter instance
   * @param config - Exporter configuration
   */
  constructor(config: ExporterConfig) {
    this.logger = new Logger('TracingExporter');
    this.config = config;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;

    this.exporter = this.createExporter(config);
    this.startQueueProcessor();

    this.logger.info('Tracing exporter initialized', {
      type: config.type,
      serviceName: config.serviceName,
      maxRetries: this.maxRetries,
    });
  }

  /**
   * Creates the appropriate exporter based on configuration
   * @param config - Exporter configuration
   * @returns Span exporter instance
   */
  private createExporter(config: ExporterConfig): SpanExporter {
    switch (config.type) {
      case ExporterType.JAEGER:
        return this.createJaegerExporter(config);
      case ExporterType.ZIPKIN:
        return this.createZipkinExporter(config);
      case ExporterType.OTLP:
        return this.createOTLPExporter(config);
      case ExporterType.CONSOLE:
        return this.createConsoleExporter(config);
      default:
        this.logger.warn(`Unknown exporter type: ${config.type}, using console`);
        return this.createConsoleExporter(config);
    }
  }

  /**
   * Creates a Jaeger exporter
   * @param config - Exporter configuration
   * @returns Jaeger exporter instance
   */
  private createJaegerExporter(config: ExporterConfig): SpanExporter {
    const jaegerConfig: JaegerExporterOptions = {
      serviceName: config.serviceName,
      ...config.jaeger,
    };

    this.logger.info('Creating Jaeger exporter', jaegerConfig);
    return new JaegerExporter(jaegerConfig);
  }

  /**
   * Creates a Zipkin exporter
   * @param config - Exporter configuration
   * @returns Zipkin exporter instance
   */
  private createZipkinExporter(config: ExporterConfig): SpanExporter {
    const zipkinConfig: ZipkinExporterOptions = {
      serviceName: config.serviceName,
      ...config.zipkin,
    };

    this.logger.info('Creating Zipkin exporter', zipkinConfig);
    return new ZipkinExporter(zipkinConfig);
  }

  /**
   * Creates an OTLP exporter
   * @param config - Exporter configuration
   * @returns OTLP exporter instance
   */
  private createOTLPExporter(config: ExporterConfig): SpanExporter {
    const otlpConfig: OTLPTraceExporterOptions = {
      ...config.otlp,
    };

    this.logger.info('Creating OTLP exporter', otlpConfig);
    return new OTLPTraceExporter(otlpConfig);
  }

  /**
   * Creates a console exporter
   * @param config - Exporter configuration
   * @returns Console exporter instance
   */
  private createConsoleExporter(config: ExporterConfig): SpanExporter {
    this.logger.info('Creating console exporter');
    return new ConsoleSpanExporter();
  }

  /**
   * Exports spans
   * @param spans - Spans to export
   * @param resultCallback - Callback for export result
   */
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    if (spans.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    const queueItem: ExportQueueItem = {
      spans,
      resolve: resultCallback,
      reject: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
      retryCount: 0,
      timestamp: Date.now(),
    };

    this.exportQueue.push(queueItem);
    this.stats.totalExports++;
    this.stats.queueSize = this.exportQueue.length;

    this.logger.debug('Spans queued for export', {
      spanCount: spans.length,
      queueSize: this.exportQueue.length,
    });
  }

  /**
   * Starts the queue processor
   */
  private startQueueProcessor(): void {
    this.queueTimer = setInterval(() => {
      this.processQueue();
    }, 100);
  }

  /**
   * Stops the queue processor
   */
  private stopQueueProcessor(): void {
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = undefined;
    }
  }

  /**
   * Processes the export queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.exportQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const item = this.exportQueue.shift();
      if (!item) {
        this.isProcessing = false;
        return;
      }

      this.stats.queueSize = this.exportQueue.length;

      await this.exportWithRetry(item);
    } catch (error) {
      this.logger.error('Error processing export queue', error as Error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Exports spans with retry logic
   * @param item - Export queue item
   */
  private async exportWithRetry(item: ExportQueueItem): Promise<void> {
    try {
      const result = await this.performExport(item.spans);

      if (result.code === ExportResultCode.SUCCESS) {
        this.stats.successfulExports++;
        item.resolve(result);
        this.logger.debug('Export successful', {
          spanCount: item.spans.length,
          retryCount: item.retryCount,
        });
      } else {
        throw new Error(`Export failed with code: ${result.code}`);
      }
    } catch (error) {
      item.retryCount++;

      if (item.retryCount <= this.maxRetries) {
        this.stats.retriedExports++;
        this.exportQueue.unshift(item);
        this.stats.queueSize = this.exportQueue.length;

        this.logger.warn('Export failed, retrying', {
          retryCount: item.retryCount,
          maxRetries: this.maxRetries,
          error: (error as Error).message,
        });

        // Wait before retry
        await this.delay(this.retryDelay * item.retryCount);
      } else {
        this.stats.failedExports++;
        item.resolve({
          code: ExportResultCode.FAILED,
          error: error as Error,
        });

        this.logger.error('Export failed after max retries', error as Error, {
          retryCount: item.retryCount,
          spanCount: item.spans.length,
        });
      }
    }
  }

  /**
   * Performs the actual export
   * @param spans - Spans to export
   * @returns Export result
   */
  private performExport(spans: ReadableSpan[]): Promise<ExportResult> {
    return new Promise((resolve, reject) => {
      try {
        this.exporter.export(spans, result => {
          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Delays execution
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Forces an immediate export of all queued spans
   * @returns Promise that resolves when export is complete
   */
  async forceFlush(): Promise<void> {
    this.logger.info('Force flushing export queue');

    // Process all remaining items
    while (this.exportQueue.length > 0) {
      await this.processQueue();
      await this.delay(100);
    }

    this.logger.info('Export queue flushed', {
      stats: this.stats,
    });
  }

  /**
   * Shuts down the exporter
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down exporter');

    // Stop queue processor
    this.stopQueueProcessor();

    // Flush remaining items
    await this.forceFlush();

    // Shutdown underlying exporter
    try {
      await this.exporter.shutdown();
      this.logger.info('Exporter shutdown complete');
    } catch (error) {
      this.logger.error('Failed to shutdown exporter', error as Error);
      throw new BotError('Failed to shutdown exporter', 'medium', { error });
    }
  }

  /**
   * Gets the underlying exporter
   * @returns Span exporter instance
   */
  getExporter(): SpanExporter {
    return this.exporter;
  }

  /**
   * Gets export statistics
   * @returns Export statistics
   */
  getStats(): ExportStats {
    return { ...this.stats };
  }

  /**
   * Resets export statistics
   */
  resetStats(): void {
    this.stats = {
      totalExports: 0,
      successfulExports: 0,
      failedExports: 0,
      retriedExports: 0,
      queueSize: this.exportQueue.length,
    };
    this.logger.debug('Export statistics reset');
  }

  /**
   * Gets the current queue size
   * @returns Number of items in queue
   */
  getQueueSize(): number {
    return this.exportQueue.length;
  }

  /**
   * Clears the export queue
   */
  clearQueue(): void {
    const size = this.exportQueue.length;
    this.exportQueue = [];
    this.stats.queueSize = 0;
    this.logger.info('Export queue cleared', { itemsCleared: size });
  }

  /**
   * Gets the exporter type
   * @returns Exporter type
   */
  getType(): ExporterType {
    return this.config.type;
  }
}

/**
 * Factory function to create exporters
 * @param type - Exporter type
 * @param serviceName - Service name
 * @param options - Additional exporter options
 * @returns Tracing exporter instance
 */
export function createExporter(
  type: ExporterType,
  serviceName: string,
  options?: Partial<ExporterConfig>
): TracingExporter {
  const config: ExporterConfig = {
    type,
    serviceName,
    maxRetries: 3,
    retryDelay: 1000,
    enableBatch: true,
    ...options,
  };

  return new TracingExporter(config);
}

/**
 * Creates a Jaeger exporter
 * @param serviceName - Service name
 * @param options - Jaeger exporter options
 * @returns Tracing exporter instance
 */
export function createJaegerExporter(
  serviceName: string,
  options?: JaegerExporterOptions
): TracingExporter {
  return createExporter(ExporterType.JAEGER, serviceName, {
    jaeger: options,
  });
}

/**
 * Creates a Zipkin exporter
 * @param serviceName - Service name
 * @param options - Zipkin exporter options
 * @returns Tracing exporter instance
 */
export function createZipkinExporter(
  serviceName: string,
  options?: ZipkinExporterOptions
): TracingExporter {
  return createExporter(ExporterType.ZIPKIN, serviceName, {
    zipkin: options,
  });
}

/**
 * Creates an OTLP exporter
 * @param serviceName - Service name
 * @param options - OTLP exporter options
 * @returns Tracing exporter instance
 */
export function createOTLPExporter(
  serviceName: string,
  options?: OTLPTraceExporterOptions
): TracingExporter {
  return createExporter(ExporterType.OTLP, serviceName, {
    otlp: options,
  });
}

/**
 * Creates a console exporter
 * @param serviceName - Service name
 * @returns Tracing exporter instance
 */
export function createConsoleExporter(
  serviceName: string
): TracingExporter {
  return createExporter(ExporterType.CONSOLE, serviceName);
}
