/**
 * @fileoverview OpenTelemetry Tracer Implementation
 * 
 * Provides comprehensive tracing capabilities including:
 * - Trace initialization and configuration
 * - Span creation and management
 * - Span attributes and events
 * - Span links and references
 * - Span status handling
 * 
 * @module tracing/tracer
 */

import {
  trace,
  Tracer,
  Span,
  SpanKind,
  SpanOptions,
  Context,
  propagation,
  diag,
  DiagConsoleLogger,
} from '@opentelemetry/api';
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';
import { TracingExporter } from './exporter';

/**
 * Tracer configuration options
 */
export interface TracerConfig {
  /** Service name for tracing */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Sampling rate (0.0 to 1.0) */
  samplingRate?: number;
  /** Enable batch processing */
  enableBatch?: boolean;
  /** Batch export timeout in milliseconds */
  batchTimeout?: number;
  /** Maximum batch size */
  maxBatchSize?: number;
  /** Maximum queue size */
  maxQueueSize?: number;
}

/**
 * Span attribute types
 */
export type SpanAttributeValue = string | number | boolean | string[] | number[] | boolean[] | null;

/**
 * Span event data
 */
export interface SpanEventData {
  /** Event name */
  name: string;
  /** Event timestamp (default: now) */
  timestamp?: number;
  /** Event attributes */
  attributes?: Record<string, SpanAttributeValue>;
}

/**
 * Span link data
 */
export interface SpanLinkData {
  /** Span context to link to */
  context: Context;
  /** Link attributes */
  attributes?: Record<string, SpanAttributeValue>;
}

/**
 * Span status codes
 */
export enum SpanStatusCode {
  /** Operation completed successfully */
  OK = 0,
  /** Operation completed with errors */
  ERROR = 1,
  /** Operation was cancelled */
  UNSET = 2,
}

/**
 * Span status
 */
export interface SpanStatus {
  /** Status code */
  code: SpanStatusCode;
  /** Status description */
  description?: string;
}

/**
 * Tracer class for managing OpenTelemetry spans
 */
export class MegawattsTracer {
  private tracer: Tracer;
  private provider: NodeTracerProvider;
  private logger: Logger;
  private config: TracerConfig;
  private activeSpans: Map<string, Span> = new Map();

  /**
   * Creates a new MegawattsTracer instance
   * @param config - Tracer configuration
   * @param exporter - Tracing exporter instance
   */
  constructor(config: TracerConfig, exporter: TracingExporter) {
    this.logger = new Logger('MegawattsTracer');
    this.config = {
      samplingRate: 1.0,
      enableBatch: true,
      batchTimeout: 5000,
      maxBatchSize: 512,
      maxQueueSize: 2048,
      ...config,
    };

    // Set up diagnostics
    diag.setLogger(new DiagConsoleLogger(), {
      logLevel: process.env.OTEL_LOG_LEVEL === 'debug' ? 'DEBUG' : 'INFO',
    });

    // Create resource
    const resource = new Resource({
      [SEMRESATTRS_SERVICE_NAME]: this.config.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: this.config.serviceVersion || '1.0.0',
    });

    // Create provider
    this.provider = new NodeTracerProvider({ resource });

    // Add span processor
    const processor = this.config.enableBatch
      ? new BatchSpanProcessor(
          exporter.getExporter(),
          this.config.batchTimeout,
          this.config.maxBatchSize,
          this.config.maxQueueSize
        )
      : new SimpleSpanProcessor(exporter.getExporter());

    this.provider.addSpanProcessor(processor);

    // Register provider
    this.provider.register({
      propagator: propagation.composite(
        propagation.traceContext(),
        propagation.baggage()
      ),
    });

    // Get tracer
    this.tracer = trace.getTracer(this.config.serviceName);

    this.logger.info('Tracer initialized', {
      serviceName: this.config.serviceName,
      samplingRate: this.config.samplingRate,
      enableBatch: this.config.enableBatch,
    });
  }

  /**
   * Starts a new span
   * @param name - Span name
   * @param options - Span options
   * @returns The created span
   */
  startSpan(name: string, options?: SpanOptions): Span {
    try {
      const span = this.tracer.startSpan(name, options);
      this.activeSpans.set(name, span);
      this.logger.debug(`Span started: ${name}`);
      return span;
    } catch (error) {
      this.logger.error('Failed to start span', error as Error, { name });
      throw new BotError('Failed to start span', 'medium', { name, error });
    }
  }

  /**
   * Starts a new span with a specific kind
   * @param name - Span name
   * @param kind - Span kind (SERVER, CLIENT, PRODUCER, CONSUMER, INTERNAL)
   * @param options - Additional span options
   * @returns The created span
   */
  startSpanWithKind(
    name: string,
    kind: SpanKind,
    options?: SpanOptions
  ): Span {
    return this.startSpan(name, { ...options, kind });
  }

  /**
   * Ends a span
   * @param span - Span to end
   * @param timestamp - Optional end timestamp
   */
  endSpan(span: Span, timestamp?: number): void {
    try {
      span.end(timestamp);
      this.activeSpans.delete(span.name);
      this.logger.debug(`Span ended: ${span.name}`);
    } catch (error) {
      this.logger.error('Failed to end span', error as Error, { name: span.name });
    }
  }

  /**
   * Sets attributes on a span
   * @param span - Span to set attributes on
   * @param attributes - Attributes to set
   */
  setAttributes(span: Span, attributes: Record<string, SpanAttributeValue>): void {
    try {
      span.setAttributes(attributes);
      this.logger.debug(`Attributes set on span: ${span.name}`, { attributes });
    } catch (error) {
      this.logger.error('Failed to set span attributes', error as Error, {
        name: span.name,
        attributes,
      });
    }
  }

  /**
   * Sets a single attribute on a span
   * @param span - Span to set attribute on
   * @param key - Attribute key
   * @param value - Attribute value
   */
  setAttribute(span: Span, key: string, value: SpanAttributeValue): void {
    try {
      span.setAttribute(key, value);
      this.logger.debug(`Attribute set on span: ${span.name}`, { key, value });
    } catch (error) {
      this.logger.error('Failed to set span attribute', error as Error, {
        name: span.name,
        key,
        value,
      });
    }
  }

  /**
   * Adds an event to a span
   * @param span - Span to add event to
   * @param eventData - Event data
   */
  addEvent(span: Span, eventData: SpanEventData): void {
    try {
      span.addEvent(eventData.name, eventData.attributes, eventData.timestamp);
      this.logger.debug(`Event added to span: ${span.name}`, { eventData });
    } catch (error) {
      this.logger.error('Failed to add event to span', error as Error, {
        name: span.name,
        eventData,
      });
    }
  }

  /**
   * Adds multiple events to a span
   * @param span - Span to add events to
   * @param events - Array of event data
   */
  addEvents(span: Span, events: SpanEventData[]): void {
    for (const event of events) {
      this.addEvent(span, event);
    }
  }

  /**
   * Sets the status of a span
   * @param span - Span to set status on
   * @param status - Span status
   */
  setStatus(span: Span, status: SpanStatus): void {
    try {
      span.setStatus({
        code: status.code,
        message: status.description,
      });
      this.logger.debug(`Status set on span: ${span.name}`, { status });
    } catch (error) {
      this.logger.error('Failed to set span status', error as Error, {
        name: span.name,
        status,
      });
    }
  }

  /**
   * Records an exception on a span
   * @param span - Span to record exception on
   * @param error - Error to record
   * @param time - Optional timestamp
   */
  recordException(span: Span, error: Error, time?: number): void {
    try {
      span.recordException(error, time);
      this.setStatus(span, {
        code: SpanStatusCode.ERROR,
        description: error.message,
      });
      this.logger.debug(`Exception recorded on span: ${span.name}`, {
        error: error.message,
      });
    } catch (err) {
      this.logger.error('Failed to record exception on span', err as Error, {
        name: span.name,
        error: error.message,
      });
    }
  }

  /**
   * Adds links to a span
   * @param span - Span to add links to
   * @param links - Array of span link data
   */
  addLinks(span: Span, links: SpanLinkData[]): void {
    try {
      const spanLinks = links.map(link => ({
        context: link.context,
        attributes: link.attributes,
      }));
      span.addLinks(...spanLinks);
      this.logger.debug(`Links added to span: ${span.name}`, { count: links.length });
    } catch (error) {
      this.logger.error('Failed to add links to span', error as Error, {
        name: span.name,
        linkCount: links.length,
      });
    }
  }

  /**
   * Gets the current span from context
   * @returns Current span or undefined
   */
  getCurrentSpan(): Span | undefined {
    return trace.getSpan(Context.active());
  }

  /**
   * Gets the active span by name
   * @param name - Span name
   * @returns Active span or undefined
   */
  getActiveSpan(name: string): Span | undefined {
    return this.activeSpans.get(name);
  }

  /**
   * Gets all active spans
   * @returns Map of active spans
   */
  getAllActiveSpans(): Map<string, Span> {
    return new Map(this.activeSpans);
  }

  /**
   * Wraps a function with a span
   * @param name - Span name
   * @param fn - Function to wrap
   * @param options - Span options
   * @returns Wrapped function
   */
  wrapWithSpan<T extends (...args: any[]) => any>(
    name: string,
    fn: T,
    options?: SpanOptions
  ): T {
    return ((...args: any[]) => {
      const span = this.startSpan(name, options);
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          return result
            .then((value: any) => {
              this.endSpan(span);
              return value;
            })
            .catch((error: Error) => {
              this.recordException(span, error);
              this.endSpan(span);
              throw error;
            });
        }
        this.endSpan(span);
        return result;
      } catch (error) {
        this.recordException(span, error as Error);
        this.endSpan(span);
        throw error;
      }
    }) as T;
  }

  /**
   * Wraps an async function with a span
   * @param name - Span name
   * @param fn - Async function to wrap
   * @param options - Span options
   * @returns Wrapped async function
   */
  wrapAsyncWithSpan<T extends (...args: any[]) => Promise<any>>(
    name: string,
    fn: T,
    options?: SpanOptions
  ): T {
    return (async (...args: any[]) => {
      const span = this.startSpan(name, options);
      try {
        const result = await fn(...args);
        this.endSpan(span);
        return result;
      } catch (error) {
        this.recordException(span, error as Error);
        this.endSpan(span);
        throw error;
      }
    }) as T;
  }

  /**
   * Creates a child span from the current context
   * @param name - Child span name
   * @param options - Span options
   * @returns Child span
   */
  startChildSpan(name: string, options?: SpanOptions): Span {
    return this.tracer.startSpan(name, {
      ...options,
    });
  }

  /**
   * Shuts down the tracer provider
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    try {
      await this.provider.shutdown();
      this.activeSpans.clear();
      this.logger.info('Tracer shutdown complete');
    } catch (error) {
      this.logger.error('Failed to shutdown tracer', error as Error);
      throw new BotError('Failed to shutdown tracer', 'high', { error });
    }
  }

  /**
   * Force flushes all pending spans
   * @returns Promise that resolves when flush is complete
   */
  async forceFlush(): Promise<void> {
    try {
      await this.provider.forceFlush();
      this.logger.debug('Tracer flushed');
    } catch (error) {
      this.logger.error('Failed to flush tracer', error as Error);
      throw new BotError('Failed to flush tracer', 'medium', { error });
    }
  }

  /**
   * Gets the tracer configuration
   * @returns Tracer configuration
   */
  getConfig(): TracerConfig {
    return { ...this.config };
  }

  /**
   * Gets the number of active spans
   * @returns Number of active spans
   */
  getActiveSpanCount(): number {
    return this.activeSpans.size;
  }
}
