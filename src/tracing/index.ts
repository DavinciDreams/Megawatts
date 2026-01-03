/**
 * @fileoverview Distributed Tracing Module
 * 
 * Comprehensive distributed tracing implementation for the Megawatts project.
 * Provides end-to-end request visibility with support for multiple exporters.
 * 
 * @module tracing
 * 
 * @example
 * ```typescript
 * import { initializeTracing, tracer } from './tracing';
 * 
 * // Initialize tracing
 * await initializeTracing({
 *   serviceName: 'megawatts-bot',
 *   exporterType: 'otlp',
 *   endpoint: 'http://localhost:4317',
 * });
 * 
 * // Use tracer
 * const span = tracer.startSpan('my-operation');
 * try {
 *   // Do work
 *   span.setAttribute('key', 'value');
 * } finally {
 *   tracer.endSpan(span);
 * }
 * ```
 */

import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';
import { MegawattsTracer, TracerConfig, SpanStatusCode } from './tracer';
import {
  TracingExporter,
  ExporterType,
  ExporterConfig,
  createExporter,
  createJaegerExporter,
  createZipkinExporter,
  createOTLPExporter,
  createConsoleExporter,
} from './exporter';
import {
  TraceContextManager,
  TraceContextData,
  BaggageItem,
  getDefaultContextManager,
  extractTraceContextFromHeaders,
  injectTraceContextToHeaders,
  withBaggage,
  createBaggageFromRecord,
  getBaggageAsRecord,
} from './context';
import {
  TracingInstrumentation,
  InstrumentationConfig,
  HttpRequestOptions,
  HttpResponseOptions,
  DatabaseQueryOptions,
  RedisCommandOptions,
  DiscordApiOptions,
  instrumentHttpRequest,
  instrumentDatabaseQuery,
  instrumentRedisCommand,
  instrumentDiscordApi,
} from './instrumentation';

/**
 * Tracing initialization options
 */
export interface TracingInitOptions {
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Exporter type */
  exporterType?: ExporterType;
  /** Exporter endpoint (for OTLP) */
  endpoint?: string;
  /** Jaeger endpoint (for Jaeger exporter) */
  jaegerEndpoint?: string;
  /** Zipkin endpoint (for Zipkin exporter) */
  zipkinEndpoint?: string;
  /** Sampling rate (0.0 to 1.0) */
  samplingRate?: number;
  /** Enable batch processing */
  enableBatch?: boolean;
  /** Enable HTTP instrumentation */
  enableHttpInstrumentation?: boolean;
  /** Enable database instrumentation */
  enableDatabaseInstrumentation?: boolean;
  /** Enable Redis instrumentation */
  enableRedisInstrumentation?: boolean;
  /** Enable Discord API instrumentation */
  enableDiscordInstrumentation?: boolean;
}

/**
 * Global tracer instance
 */
let globalTracer: MegawattsTracer | undefined;

/**
 * Global instrumentation instance
 */
let globalInstrumentation: TracingInstrumentation | undefined;

/**
 * Global context manager instance
 */
let globalContextManager: TraceContextManager | undefined;

/**
 * Global logger
 */
const logger = new Logger('TracingModule');

/**
 * Initializes distributed tracing for the application
 * @param options - Tracing initialization options
 * @returns Promise that resolves when tracing is initialized
 * 
 * @example
 * ```typescript
 * await initializeTracing({
 *   serviceName: 'megawatts-bot',
 *   exporterType: 'otlp',
 *   endpoint: 'http://localhost:4317',
 *   samplingRate: 0.1,
 * });
 * ```
 */
export async function initializeTracing(
  options: TracingInitOptions
): Promise<void> {
  try {
    logger.info('Initializing distributed tracing', {
      serviceName: options.serviceName,
      exporterType: options.exporterType || 'console',
    });

    // Determine exporter type
    const exporterType = options.exporterType || ExporterType.CONSOLE;

    // Create exporter
    let exporter: TracingExporter;
    switch (exporterType) {
      case ExporterType.JAEGER:
        exporter = createJaegerExporter(options.serviceName, {
          endpoint: options.jaegerEndpoint || 'http://localhost:14268/api/traces',
        });
        break;
      case ExporterType.ZIPKIN:
        exporter = createZipkinExporter(options.serviceName, {
          url: options.zipkinEndpoint || 'http://localhost:9411/api/v2/spans',
        });
        break;
      case ExporterType.OTLP:
        exporter = createOTLPExporter(options.serviceName, {
          url: options.endpoint || 'http://localhost:4317',
        });
        break;
      case ExporterType.CONSOLE:
      default:
        exporter = createConsoleExporter(options.serviceName);
        break;
    }

    // Create tracer configuration
    const tracerConfig: TracerConfig = {
      serviceName: options.serviceName,
      serviceVersion: options.serviceVersion,
      samplingRate: options.samplingRate || 1.0,
      enableBatch: options.enableBatch !== false,
    };

    // Create tracer
    globalTracer = new MegawattsTracer(tracerConfig, exporter);

    // Create context manager
    globalContextManager = new TraceContextManager();

    // Create instrumentation
    globalInstrumentation = new TracingInstrumentation(globalTracer, {
      enableHttp: options.enableHttpInstrumentation !== false,
      enableDatabase: options.enableDatabaseInstrumentation !== false,
      enableRedis: options.enableRedisInstrumentation !== false,
      enableDiscord: options.enableDiscordInstrumentation !== false,
    });

    logger.info('Distributed tracing initialized successfully', {
      serviceName: options.serviceName,
      exporterType,
      samplingRate: tracerConfig.samplingRate,
    });
  } catch (error) {
    logger.error('Failed to initialize tracing', error as Error);
    throw new BotError('Failed to initialize distributed tracing', 'high', {
      error,
      options,
    });
  }
}

/**
 * Gets the global tracer instance
 * @returns Global tracer instance
 * @throws Error if tracing is not initialized
 */
export function getTracer(): MegawattsTracer {
  if (!globalTracer) {
    throw new BotError(
      'Tracing is not initialized. Call initializeTracing() first.',
      'medium'
    );
  }
  return globalTracer;
}

/**
 * Gets the global instrumentation instance
 * @returns Global instrumentation instance
 * @throws Error if tracing is not initialized
 */
export function getInstrumentation(): TracingInstrumentation {
  if (!globalInstrumentation) {
    throw new BotError(
      'Tracing is not initialized. Call initializeTracing() first.',
      'medium'
    );
  }
  return globalInstrumentation;
}

/**
 * Gets the global context manager instance
 * @returns Global context manager instance
 */
export function getContextManager(): TraceContextManager {
  return globalContextManager || getDefaultContextManager();
}

/**
 * Shuts down distributed tracing
 * @returns Promise that resolves when shutdown is complete
 */
export async function shutdownTracing(): Promise<void> {
  logger.info('Shutting down distributed tracing');

  try {
    // Shutdown instrumentation
    if (globalInstrumentation) {
      globalInstrumentation.disable();
    }

    // Shutdown tracer
    if (globalTracer) {
      await globalTracer.shutdown();
    }

    globalTracer = undefined;
    globalInstrumentation = undefined;
    globalContextManager = undefined;

    logger.info('Distributed tracing shutdown complete');
  } catch (error) {
    logger.error('Failed to shutdown tracing', error as Error);
    throw new BotError('Failed to shutdown distributed tracing', 'high', {
      error,
    });
  }
}

/**
 * Checks if tracing is initialized
 * @returns True if tracing is initialized
 */
export function isTracingInitialized(): boolean {
  return globalTracer !== undefined;
}

/**
 * Factory function to create a custom tracer
 * @param config - Tracer configuration
 * @param exporter - Tracing exporter
 * @returns New tracer instance
 */
export function createTracer(
  config: TracerConfig,
  exporter: TracingExporter
): MegawattsTracer {
  return new MegawattsTracer(config, exporter);
}

/**
 * Factory function to create a custom instrumentation
 * @param tracer - Megawatts tracer instance
 * @param config - Instrumentation configuration
 * @returns New instrumentation instance
 */
export function createInstrumentation(
  tracer: MegawattsTracer,
  config?: InstrumentationConfig
): TracingInstrumentation {
  return new TracingInstrumentation(tracer, config);
}

// ============================================================================
// Exports
// ============================================================================

// Tracer exports
export {
  MegawattsTracer,
  TracerConfig,
  SpanStatusCode,
  SpanEventData,
  SpanLinkData,
  SpanStatus,
} from './tracer';

// Exporter exports
export {
  TracingExporter,
  ExporterType,
  ExporterConfig,
  ExportStats,
  createExporter,
  createJaegerExporter,
  createZipkinExporter,
  createOTLPExporter,
  createConsoleExporter,
} from './exporter';

// Context exports
export {
  TraceContextManager,
  TraceContextData,
  BaggageItem,
  getDefaultContextManager,
  extractTraceContextFromHeaders,
  injectTraceContextToHeaders,
  withBaggage,
  createBaggageFromRecord,
  getBaggageAsRecord,
} from './context';

// Instrumentation exports
export {
  TracingInstrumentation,
  InstrumentationConfig,
  HttpRequestOptions,
  HttpResponseOptions,
  DatabaseQueryOptions,
  RedisCommandOptions,
  DiscordApiOptions,
  instrumentHttpRequest,
  instrumentDatabaseQuery,
  instrumentRedisCommand,
  instrumentDiscordApi,
} from './instrumentation';

// Re-export global tracer for convenience
export const tracer = {
  /**
   * Gets the global tracer instance
   * @returns Global tracer instance
   */
  get: getTracer,

  /**
   * Checks if tracing is initialized
   * @returns True if tracing is initialized
   */
  isInitialized: isTracingInitialized,
};
