/**
 * @fileoverview Tracing Instrumentation Implementation
 * 
 * Provides instrumentation for various services:
 * - HTTP instrumentation
 * - Database instrumentation
 * - Redis instrumentation
 * - Discord API instrumentation
 * - Custom instrumentation helpers
 * 
 * @module tracing/instrumentation
 */

import {
  Span,
  SpanKind,
  SpanOptions,
  trace,
  Attributes,
} from '@opentelemetry/api';
import {
  registerInstrumentations,
} from '@opentelemetry/instrumentation';
import {
  HttpInstrumentation,
  HttpInstrumentationConfig,
} from '@opentelemetry/instrumentation-http';
import {
  PgInstrumentation,
  PgInstrumentationConfig,
} from '@opentelemetry/instrumentation-pg';
import {
  RedisInstrumentation,
  RedisInstrumentationConfig,
} from '@opentelemetry/instrumentation-redis';
import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';
import { MegawattsTracer, SpanAttributeValue } from './tracer';

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
  /** Request method */
  method: string;
  /** Request URL */
  url: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: any;
}

/**
 * HTTP response options
 */
export interface HttpResponseOptions {
  /** Response status code */
  statusCode: number;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body */
  body?: any;
}

/**
 * Database query options
 */
export interface DatabaseQueryOptions {
  /** Database type */
  dbType: string;
  /** Database name */
  database: string;
  /** Query type */
  queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP' | 'ALTER';
  /** Table name */
  table?: string;
  /** Query text (sanitized) */
  query?: string;
}

/**
 * Redis command options
 */
export interface RedisCommandOptions {
  /** Command name */
  command: string;
  /** Redis database index */
  db?: number;
  /** Key name (sanitized) */
  key?: string;
  /** Number of keys */
  keyCount?: number;
}

/**
 * Discord API options
 */
export interface DiscordApiOptions {
  /** API endpoint */
  endpoint: string;
  /** HTTP method */
  method: string;
  /** Discord guild ID */
  guildId?: string;
  /** Discord channel ID */
  channelId?: string;
  /** Discord user ID */
  userId?: string;
}

/**
 * Instrumentation configuration
 */
export interface InstrumentationConfig {
  /** Enable HTTP instrumentation */
  enableHttp?: boolean;
  /** Enable database instrumentation */
  enableDatabase?: boolean;
  /** Enable Redis instrumentation */
  enableRedis?: boolean;
  /** Enable Discord API instrumentation */
  enableDiscord?: boolean;
  /** Capture request/response bodies */
  captureBodies?: boolean;
  /** Sanitize queries (remove sensitive data) */
  sanitizeQueries?: boolean;
  /** Sanitize keys (remove sensitive data) */
  sanitizeKeys?: boolean;
}

/**
 * Tracing instrumentation class
 */
export class TracingInstrumentation {
  private logger: Logger;
  private tracer: MegawattsTracer;
  private config: InstrumentationConfig;
  private httpInstrumentation?: HttpInstrumentation;
  private pgInstrumentation?: PgInstrumentation;
  private redisInstrumentation?: RedisInstrumentation;

  /**
   * Creates a new TracingInstrumentation instance
   * @param tracer - Megawatts tracer instance
   * @param config - Instrumentation configuration
   */
  constructor(tracer: MegawattsTracer, config?: InstrumentationConfig) {
    this.logger = new Logger('TracingInstrumentation');
    this.tracer = tracer;
    this.config = {
      enableHttp: true,
      enableDatabase: true,
      enableRedis: true,
      enableDiscord: true,
      captureBodies: false,
      sanitizeQueries: true,
      sanitizeKeys: true,
      ...config,
    };

    this.setupInstrumentation();
    this.logger.info('Tracing instrumentation initialized', this.config);
  }

  /**
   * Sets up all instrumentations
   */
  private setupInstrumentation(): void {
    const instrumentations: any[] = [];

    if (this.config.enableHttp) {
      this.httpInstrumentation = this.setupHttpInstrumentation();
      instrumentations.push(this.httpInstrumentation);
    }

    if (this.config.enableDatabase) {
      this.pgInstrumentation = this.setupDatabaseInstrumentation();
      instrumentations.push(this.pgInstrumentation);
    }

    if (this.config.enableRedis) {
      this.redisInstrumentation = this.setupRedisInstrumentation();
      instrumentations.push(this.redisInstrumentation);
    }

    // Register all instrumentations
    if (instrumentations.length > 0) {
      registerInstrumentations(instrumentations);
      this.logger.info('Instrumentations registered', {
        count: instrumentations.length,
        types: instrumentations.map((i: any) => i.instrumentationName),
      });
    }
  }

  /**
   * Sets up HTTP instrumentation
   * @returns HTTP instrumentation instance
   */
  private setupHttpInstrumentation(): HttpInstrumentation {
    const httpConfig: HttpInstrumentationConfig = {
      applyCustomAttributesOnSpan: (span, request, response) => {
        this.applyHttpAttributes(span, request, response);
      },
      ignoreIncomingRequestHook: (request) => {
        // Ignore health check endpoints
        return request.url?.includes('/health') || request.url?.includes('/ready');
      },
    };

    return new HttpInstrumentation(httpConfig);
  }

  /**
   * Sets up database instrumentation
   * @returns PostgreSQL instrumentation instance
   */
  private setupDatabaseInstrumentation(): PgInstrumentation {
    const pgConfig: PgInstrumentationConfig = {
      enhancedDatabaseReporting: true,
      collectParameters: !this.config.sanitizeQueries,
    };

    return new PgInstrumentation(pgConfig);
  }

  /**
   * Sets up Redis instrumentation
   * @returns Redis instrumentation instance
   */
  private setupRedisInstrumentation(): RedisInstrumentation {
    const redisConfig: RedisInstrumentationConfig = {
      dbStatementSerializer: (cmdName, cmdArgs) => {
        return this.sanitizeRedisCommand(cmdName, cmdArgs);
      },
    };

    return new RedisInstrumentation(redisConfig);
  }

  /**
   * Applies HTTP attributes to a span
   * @param span - Span to apply attributes to
   * @param request - HTTP request
   * @param response - HTTP response
   */
  private applyHttpAttributes(
    span: Span,
    request: any,
    response: any
  ): void {
    const attributes: Record<string, SpanAttributeValue> = {
      'http.method': request.method,
      'http.url': this.sanitizeUrl(request.url),
      'http.scheme': request.protocol?.replace(':', ''),
      'http.host': request.headers?.host,
    };

    if (response) {
      attributes['http.status_code'] = response.statusCode;
      attributes['http.status_text'] = response.statusMessage;
    }

    // Add user agent
    const userAgent = request.headers?.['user-agent'];
    if (userAgent) {
      attributes['http.user_agent'] = userAgent;
    }

    span.setAttributes(attributes);
  }

  /**
   * Sanitizes URL by removing sensitive data
   * @param url - URL to sanitize
   * @returns Sanitized URL
   */
  private sanitizeUrl(url: string): string {
    if (!url) return '';

    // Remove API keys and tokens from URL
    return url
      .replace(/(api[_-]?key|token|secret|password)=([^&]+)/gi, '$1=***')
      .replace(/(\/auth\/[^\/]+)/gi, '/auth/***')
      .replace(/(\/api\/[^\/]+\/[^\/]+)/gi, '/api/***/***');
  }

  /**
   * Sanitizes Redis command
   * @param cmdName - Command name
   * @param cmdArgs - Command arguments
   * @returns Sanitized command string
   */
  private sanitizeRedisCommand(cmdName: string, cmdArgs: any[]): string {
    const args = cmdArgs.map(arg => {
      if (typeof arg === 'string' && this.config.sanitizeKeys) {
        return arg.length > 20 ? `${arg.substring(0, 20)}...` : arg;
      }
      return arg;
    });

    return `${cmdName} ${args.join(' ')}`;
  }

  /**
   * Instruments an HTTP request
   * @param options - HTTP request options
   * @param fn - Function to execute
   * @returns Function result
   */
  async instrumentHttpRequest<T>(
    options: HttpRequestOptions,
    fn: () => Promise<T>
  ): Promise<T> {
    const spanName = `HTTP ${options.method} ${this.sanitizeUrl(options.url)}`;
    const span = this.tracer.startSpanWithKind(spanName, SpanKind.CLIENT);

    try {
      // Set span attributes
      span.setAttributes({
        'http.method': options.method,
        'http.url': this.sanitizeUrl(options.url),
        'http.scheme': new URL(options.url).protocol.replace(':', ''),
        'http.host': new URL(options.url).host,
      });

      // Add headers if provided
      if (options.headers) {
        span.setAttributes({
          'http.request.headers': JSON.stringify(options.headers),
        });
      }

      // Execute request
      const result = await fn();

      this.tracer.endSpan(span);
      return result;
    } catch (error) {
      this.tracer.recordException(span, error as Error);
      this.tracer.endSpan(span);
      throw error;
    }
  }

  /**
   * Instruments a database query
   * @param options - Database query options
   * @param fn - Function to execute
   * @returns Function result
   */
  async instrumentDatabaseQuery<T>(
    options: DatabaseQueryOptions,
    fn: () => Promise<T>
  ): Promise<T> {
    const spanName = `${options.dbType} ${options.queryType}`;
    const span = this.tracer.startSpanWithKind(spanName, SpanKind.CLIENT);

    try {
      // Set span attributes
      const attributes: Record<string, SpanAttributeValue> = {
        'db.system': options.dbType,
        'db.name': options.database,
        'db.operation': options.queryType,
      };

      if (options.table) {
        attributes['db.sql.table'] = options.table;
      }

      if (options.query && this.config.captureBodies) {
        attributes['db.statement'] = this.config.sanitizeQueries
          ? this.sanitizeQuery(options.query)
          : options.query;
      }

      span.setAttributes(attributes);

      // Execute query
      const result = await fn();

      this.tracer.endSpan(span);
      return result;
    } catch (error) {
      this.tracer.recordException(span, error as Error);
      this.tracer.endSpan(span);
      throw error;
    }
  }

  /**
   * Sanitizes SQL query
   * @param query - Query to sanitize
   * @returns Sanitized query
   */
  private sanitizeQuery(query: string): string {
    if (!query) return '';

    // Remove string literals and numbers
    return query
      .replace(/'[^']*'/g, "'***'")
      .replace(/"[^"]*"/g, '"***"')
      .replace(/\b\d+\b/g, '?')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Instruments a Redis command
   * @param options - Redis command options
   * @param fn - Function to execute
   * @returns Function result
   */
  async instrumentRedisCommand<T>(
    options: RedisCommandOptions,
    fn: () => Promise<T>
  ): Promise<T> {
    const spanName = `Redis ${options.command}`;
    const span = this.tracer.startSpanWithKind(spanName, SpanKind.CLIENT);

    try {
      // Set span attributes
      const attributes: Record<string, SpanAttributeValue> = {
        'db.system': 'redis',
        'redis.command': options.command,
      };

      if (options.db !== undefined) {
        attributes['redis.db'] = options.db;
      }

      if (options.keyCount !== undefined) {
        attributes['redis.key_count'] = options.keyCount;
      }

      if (options.key && !this.config.sanitizeKeys) {
        attributes['redis.key'] = options.key;
      }

      span.setAttributes(attributes);

      // Execute command
      const result = await fn();

      this.tracer.endSpan(span);
      return result;
    } catch (error) {
      this.tracer.recordException(span, error as Error);
      this.tracer.endSpan(span);
      throw error;
    }
  }

  /**
   * Instruments a Discord API call
   * @param options - Discord API options
   * @param fn - Function to execute
   * @returns Function result
   */
  async instrumentDiscordApi<T>(
    options: DiscordApiOptions,
    fn: () => Promise<T>
  ): Promise<T> {
    const spanName = `Discord API ${options.method} ${options.endpoint}`;
    const span = this.tracer.startSpanWithKind(spanName, SpanKind.CLIENT);

    try {
      // Set span attributes
      const attributes: Record<string, SpanAttributeValue> = {
        'discord.api.endpoint': options.endpoint,
        'discord.api.method': options.method,
      };

      if (options.guildId) {
        attributes['discord.guild_id'] = options.guildId;
      }

      if (options.channelId) {
        attributes['discord.channel_id'] = options.channelId;
      }

      if (options.userId) {
        attributes['discord.user_id'] = options.userId;
      }

      span.setAttributes(attributes);

      // Execute API call
      const result = await fn();

      this.tracer.endSpan(span);
      return result;
    } catch (error) {
      this.tracer.recordException(span, error as Error);
      this.tracer.endSpan(span);
      throw error;
    }
  }

  /**
   * Creates a custom span for a function
   * @param name - Span name
   * @param fn - Function to instrument
   * @param options - Span options
   * @returns Instrumented function
   */
  createCustomSpan<T extends (...args: any[]) => any>(
    name: string,
    fn: T,
    options?: SpanOptions
  ): T {
    return this.tracer.wrapWithSpan(name, fn, options);
  }

  /**
   * Creates a custom async span for a function
   * @param name - Span name
   * @param fn - Async function to instrument
   * @param options - Span options
   * @returns Instrumented async function
   */
  createCustomAsyncSpan<T extends (...args: any[]) => Promise<any>>(
    name: string,
    fn: T,
    options?: SpanOptions
  ): T {
    return this.tracer.wrapAsyncWithSpan(name, fn, options);
  }

  /**
   * Adds custom attributes to a span
   * @param span - Span to add attributes to
   * @param attributes - Attributes to add
   */
  addCustomAttributes(span: Span, attributes: Record<string, SpanAttributeValue>): void {
    this.tracer.setAttributes(span, attributes);
  }

  /**
   * Adds a custom event to a span
   * @param span - Span to add event to
   * @param name - Event name
   * @param attributes - Event attributes
   */
  addCustomEvent(
    span: Span,
    name: string,
    attributes?: Record<string, SpanAttributeValue>
  ): void {
    this.tracer.addEvent(span, {
      name,
      attributes,
    });
  }

  /**
   * Disables all instrumentations
   */
  disable(): void {
    this.httpInstrumentation?.disable();
    this.pgInstrumentation?.disable();
    this.redisInstrumentation?.disable();
    this.logger.info('Instrumentations disabled');
  }

  /**
   * Enables all instrumentations
   */
  enable(): void {
    this.httpInstrumentation?.enable();
    this.pgInstrumentation?.enable();
    this.redisInstrumentation?.enable();
    this.logger.info('Instrumentations enabled');
  }

  /**
   * Gets instrumentation configuration
   * @returns Instrumentation configuration
   */
  getConfig(): InstrumentationConfig {
    return { ...this.config };
  }
}

/**
 * Helper function to instrument an HTTP request
 * @param tracer - Megawatts tracer
 * @param options - HTTP request options
 * @param fn - Function to execute
 * @returns Function result
 */
export async function instrumentHttpRequest<T>(
  tracer: MegawattsTracer,
  options: HttpRequestOptions,
  fn: () => Promise<T>
): Promise<T> {
  const instrumentation = new TracingInstrumentation(tracer);
  return instrumentation.instrumentHttpRequest(options, fn);
}

/**
 * Helper function to instrument a database query
 * @param tracer - Megawatts tracer
 * @param options - Database query options
 * @param fn - Function to execute
 * @returns Function result
 */
export async function instrumentDatabaseQuery<T>(
  tracer: MegawattsTracer,
  options: DatabaseQueryOptions,
  fn: () => Promise<T>
): Promise<T> {
  const instrumentation = new TracingInstrumentation(tracer);
  return instrumentation.instrumentDatabaseQuery(options, fn);
}

/**
 * Helper function to instrument a Redis command
 * @param tracer - Megawatts tracer
 * @param options - Redis command options
 * @param fn - Function to execute
 * @returns Function result
 */
export async function instrumentRedisCommand<T>(
  tracer: MegawattsTracer,
  options: RedisCommandOptions,
  fn: () => Promise<T>
): Promise<T> {
  const instrumentation = new TracingInstrumentation(tracer);
  return instrumentation.instrumentRedisCommand(options, fn);
}

/**
 * Helper function to instrument a Discord API call
 * @param tracer - Megawatts tracer
 * @param options - Discord API options
 * @param fn - Function to execute
 * @returns Function result
 */
export async function instrumentDiscordApi<T>(
  tracer: MegawattsTracer,
  options: DiscordApiOptions,
  fn: () => Promise<T>
): Promise<T> {
  const instrumentation = new TracingInstrumentation(tracer);
  return instrumentation.instrumentDiscordApi(options, fn);
}
