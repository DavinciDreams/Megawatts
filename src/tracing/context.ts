/**
 * @fileoverview Trace Context Propagation Implementation
 * 
 * Provides comprehensive context management including:
 * - Trace context extraction and injection
 * - Context propagation across async operations
 * - Baggage propagation
 * - Context storage and retrieval
 * - Async context management
 * 
 * @module tracing/context
 */

import {
  Context,
  ROOT_CONTEXT,
  trace,
  propagation,
  TextMapPropagator,
  ContextManager,
  Span,
  SpanContext,
  TraceFlags,
  Baggage,
  baggage,
  BaggageEntry,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/sdk-trace-node';
import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';

/**
 * Trace context data
 */
export interface TraceContextData {
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Trace flags */
  traceFlags: number;
  /** Is sampled */
  isSampled: boolean;
  /** Trace state */
  traceState?: Record<string, string>;
}

/**
 * Baggage item
 */
export interface BaggageItem {
  /** Key */
  key: string;
  /** Value */
  value: string;
  /** Metadata */
  metadata?: string;
}

/**
 * Context storage options
 */
export interface ContextStorageOptions {
  /** Enable async local storage */
  enableAsyncLocalStorage?: boolean;
  /** Context key prefix */
  contextKeyPrefix?: string;
}

/**
 * Trace context manager class
 */
export class TraceContextManager {
  private logger: Logger;
  private contextManager: ContextManager;
  private propagator: TextMapPropagator;
  private options: ContextStorageOptions;
  private contextMap: Map<string, Context> = new Map();

  /**
   * Creates a new TraceContextManager instance
   * @param options - Context storage options
   */
  constructor(options?: ContextStorageOptions) {
    this.logger = new Logger('TraceContextManager');
    this.options = {
      enableAsyncLocalStorage: true,
      contextKeyPrefix: 'megawatts.',
      ...options,
    };

    // Set up context manager
    this.contextManager = new AsyncLocalStorageContextManager();
    propagation.setGlobalContextManager(this.contextManager);

    // Get composite propagator
    this.propagator = propagation.composite(
      propagation.traceContext(),
      propagation.baggage()
    );

    this.logger.info('Trace context manager initialized', this.options);
  }

  /**
   * Gets the current context
   * @returns Current context
   */
  getCurrentContext(): Context {
    return this.contextManager.active() || ROOT_CONTEXT;
  }

  /**
   * Sets the current context
   * @param context - Context to set
   * @returns The set context
   */
  setCurrentContext(context: Context): Context {
    return this.contextManager.active(context);
  }

  /**
   * Creates a new context with a span
   * @param span - Span to add to context
   * @returns New context with span
   */
  createContextWithSpan(span: Span): Context {
    return trace.setSpan(this.getCurrentContext(), span);
  }

  /**
   * Gets the current span from context
   * @returns Current span or undefined
   */
  getCurrentSpan(): Span | undefined {
    return trace.getSpan(this.getCurrentContext());
  }

  /**
   * Gets the span context from current span
   * @returns Span context or undefined
   */
  getSpanContext(): SpanContext | undefined {
    const span = this.getCurrentSpan();
    return span?.spanContext();
  }

  /**
   * Extracts trace context from a carrier
   * @param carrier - Carrier to extract from (e.g., HTTP headers)
   * @returns Extracted context
   */
  extractContext(carrier: Record<string, string>): Context {
    try {
      const context = this.propagator.extract(this.getCurrentContext(), carrier);
      this.logger.debug('Context extracted from carrier', {
        carrierKeys: Object.keys(carrier),
      });
      return context;
    } catch (error) {
      this.logger.error('Failed to extract context', error as Error, { carrier });
      return this.getCurrentContext();
    }
  }

  /**
   * Injects trace context into a carrier
   * @param context - Context to inject
   * @param carrier - Carrier to inject into (e.g., HTTP headers)
   */
  injectContext(context: Context, carrier: Record<string, string>): void {
    try {
      this.propagator.inject(context, carrier);
      this.logger.debug('Context injected into carrier', {
        carrierKeys: Object.keys(carrier),
      });
    } catch (error) {
      this.logger.error('Failed to inject context', error as Error, { carrier });
    }
  }

  /**
   * Extracts trace context data from current context
   * @returns Trace context data or undefined
   */
  extractTraceContextData(): TraceContextData | undefined {
    const spanContext = this.getSpanContext();
    if (!spanContext) {
      return undefined;
    }

    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
      isSampled: (spanContext.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED,
      traceState: spanContext.traceState
        ? this.traceStateToRecord(spanContext.traceState)
        : undefined,
    };
  }

  /**
   * Converts trace state to record
   * @param traceState - Trace state
   * @returns Record of trace state values
   */
  private traceStateToRecord(traceState: any): Record<string, string> {
    const result: Record<string, string> = {};
    traceState.forEach((key: string, value: string) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Gets baggage from current context
   * @returns Current baggage
   */
  getBaggage(): Baggage {
    return baggage.getBaggage(this.getCurrentContext()) || baggage.createBaggage();
  }

  /**
   * Sets baggage in current context
   * @param baggage - Baggage to set
   * @returns New context with baggage
   */
  setBaggage(baggage: Baggage): Context {
    return baggage.setBaggage(this.getCurrentContext(), baggage);
  }

  /**
   * Gets a baggage entry
   * @param key - Baggage entry key
   * @returns Baggage entry or undefined
   */
  getBaggageEntry(key: string): BaggageEntry | undefined {
    const currentBaggage = this.getBaggage();
    return currentBaggage.getEntry(key);
  }

  /**
   * Sets a baggage entry
   * @param key - Baggage entry key
   * @param value - Baggage entry value
   * @param metadata - Optional metadata
   * @returns New context with updated baggage
   */
  setBaggageEntry(
    key: string,
    value: string,
    metadata?: string
  ): Context {
    const currentBaggage = this.getBaggage();
    const entry = { value, metadata };
    const updatedBaggage = currentBaggage.setEntry(key, entry);
    return baggage.setBaggage(this.getCurrentContext(), updatedBaggage);
  }

  /**
   * Removes a baggage entry
   * @param key - Baggage entry key
   * @returns New context with updated baggage
   */
  removeBaggageEntry(key: string): Context {
    const currentBaggage = this.getBaggage();
    const updatedBaggage = currentBaggage.deleteEntry(key);
    return baggage.setBaggage(this.getCurrentContext(), updatedBaggage);
  }

  /**
   * Clears all baggage entries
   * @returns New context with cleared baggage
   */
  clearBaggage(): Context {
    const emptyBaggage = baggage.createBaggage();
    return baggage.setBaggage(this.getCurrentContext(), emptyBaggage);
  }

  /**
   * Gets all baggage entries
   * @returns Array of baggage items
   */
  getAllBaggageEntries(): BaggageItem[] {
    const currentBaggage = this.getBaggage();
    const items: BaggageItem[] = [];

    currentBaggage.getAllEntries((key, entry) => {
      items.push({
        key,
        value: entry.value,
        metadata: entry.metadata,
      });
    });

    return items;
  }

  /**
   * Stores context with a key
   * @param key - Storage key
   * @param context - Context to store
   */
  storeContext(key: string, context: Context): void {
    this.contextMap.set(`${this.options.contextKeyPrefix}${key}`, context);
    this.logger.debug('Context stored', { key });
  }

  /**
   * Retrieves stored context
   * @param key - Storage key
   * @returns Stored context or undefined
   */
  retrieveContext(key: string): Context | undefined {
    const context = this.contextMap.get(`${this.options.contextKeyPrefix}${key}`);
    this.logger.debug('Context retrieved', { key, found: !!context });
    return context;
  }

  /**
   * Removes stored context
   * @param key - Storage key
   */
  removeStoredContext(key: string): void {
    const fullKey = `${this.options.contextKeyPrefix}${key}`;
    const existed = this.contextMap.delete(fullKey);
    this.logger.debug('Context removed', { key, existed });
  }

  /**
   * Clears all stored contexts
   */
  clearAllStoredContexts(): void {
    const count = this.contextMap.size;
    this.contextMap.clear();
    this.logger.info('All stored contexts cleared', { count });
  }

  /**
   * Runs a function with a specific context
   * @param context - Context to use
   * @param fn - Function to run
   * @returns Function result
   */
  runWithContext<T>(context: Context, fn: () => T): T {
    return this.contextManager.with(context, fn);
  }

  /**
   * Runs an async function with a specific context
   * @param context - Context to use
   * @param fn - Async function to run
   * @returns Promise with function result
   */
  async runWithAsyncContext<T>(context: Context, fn: () => Promise<T>): Promise<T> {
    return this.contextManager.with(context, fn);
  }

  /**
   * Binds a function to the current context
   * @param fn - Function to bind
   * @returns Bound function
   */
  bindToContext<T extends (...args: any[]) => any>(fn: T): T {
    return this.contextManager.bind(this.getCurrentContext(), fn);
  }

  /**
   * Creates a child context from current context
   * @returns New child context
   */
  createChildContext(): Context {
    return this.getCurrentContext();
  }

  /**
   * Resets context to root
   */
  resetToRootContext(): void {
    this.contextManager.enable();
    this.logger.debug('Context reset to root');
  }

  /**
   * Disables context manager
   */
  disable(): void {
    this.contextManager.disable();
    this.logger.info('Context manager disabled');
  }

  /**
   * Enables context manager
   */
  enable(): void {
    this.contextManager.enable();
    this.logger.info('Context manager enabled');
  }

  /**
   * Gets context manager
   * @returns Context manager instance
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Gets propagator
   * @returns Text map propagator
   */
  getPropagator(): TextMapPropagator {
    return this.propagator;
  }

  /**
   * Gets number of stored contexts
   * @returns Number of stored contexts
   */
  getStoredContextCount(): number {
    return this.contextMap.size;
  }
}

/**
 * Default context manager instance
 */
let defaultContextManager: TraceContextManager | undefined;

/**
 * Gets the default context manager
 * @returns Default context manager instance
 */
export function getDefaultContextManager(): TraceContextManager {
  if (!defaultContextManager) {
    defaultContextManager = new TraceContextManager();
  }
  return defaultContextManager;
}

/**
 * Extracts trace context from HTTP headers
 * @param headers - HTTP headers
 * @returns Extracted trace context data or undefined
 */
export function extractTraceContextFromHeaders(
  headers: Record<string, string>
): TraceContextData | undefined {
  const contextManager = getDefaultContextManager();
  const context = contextManager.extractContext(headers);
  const spanContext = trace.getSpanContext(context);

  if (!spanContext) {
    return undefined;
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
    isSampled: (spanContext.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED,
    traceState: spanContext.traceState
      ? contextManager['traceStateToRecord'](spanContext.traceState)
      : undefined,
  };
}

/**
 * Injects trace context into HTTP headers
 * @param headers - HTTP headers to inject into
 * @param context - Optional context to inject (defaults to current)
 */
export function injectTraceContextToHeaders(
  headers: Record<string, string>,
  context?: Context
): void {
  const contextManager = getDefaultContextManager();
  const ctx = context || contextManager.getCurrentContext();
  contextManager.injectContext(ctx, headers);
}

/**
 * Propagates baggage across async operations
 * @param baggage - Baggage to propagate
 * @param fn - Async function to run
 * @returns Promise with function result
 */
export async function withBaggage<T>(
  baggage: Baggage,
  fn: () => Promise<T>
): Promise<T> {
  const contextManager = getDefaultContextManager();
  const ctx = baggage.setBaggage(contextManager.getCurrentContext(), baggage);
  return contextManager.runWithAsyncContext(ctx, fn);
}

/**
 * Creates baggage from a record
 * @param entries - Baggage entries
 * @returns Baggage instance
 */
export function createBaggageFromRecord(
  entries: Record<string, string>
): Baggage {
  let baggageInstance = baggage.createBaggage();

  for (const [key, value] of Object.entries(entries)) {
    baggageInstance = baggageInstance.setEntry(key, { value });
  }

  return baggageInstance;
}

/**
 * Gets baggage as a record
 * @param baggage - Baggage instance
 * @returns Record of baggage entries
 */
export function getBaggageAsRecord(baggage: Baggage): Record<string, string> {
  const result: Record<string, string> = {};

  baggage.getAllEntries((key, entry) => {
    result[key] = entry.value;
  });

  return result;
}
