# Distributed Tracing Module

Comprehensive distributed tracing implementation for the Megawatts Discord bot, providing end-to-end request visibility with support for multiple exporters.

## Features

- **Multiple Exporters**: Support for Jaeger, Zipkin, OTLP, and Console exporters
- **Trace Context Propagation**: Automatic propagation across service boundaries
- **Span Management**: Create, modify, and close spans with full control
- **Span Attributes**: Add metadata to spans for rich trace data
- **Span Events**: Record events during span execution
- **Span Links**: Link related spans for correlation
- **Sampling**: Configurable sampling strategies
- **Instrumentation**: Auto-instrument HTTP, Database, Redis, and Discord API calls
- **Baggage**: Propagate context across async operations
- **Batch Export**: Efficient batch processing with retry logic

## Installation

The required OpenTelemetry packages have been added to `package.json`. Install them with:

```bash
npm install
```

## Quick Start

### Basic Initialization

```typescript
import { initializeTracing, tracer } from './tracing';

// Initialize tracing with OTLP exporter
await initializeTracing({
  serviceName: 'megawatts-bot',
  serviceVersion: '1.0.0',
  exporterType: 'otlp',
  endpoint: 'http://localhost:4317',
  samplingRate: 0.1, // 10% sampling
});
```

### Using the Tracer

```typescript
import { getTracer } from './tracing';

const tracer = getTracer();

// Start a span
const span = tracer.startSpan('my-operation');

try {
  // Set attributes
  span.setAttribute('user.id', '12345');
  span.setAttribute('operation.type', 'custom');

  // Add events
  tracer.addEvent(span, {
    name: 'step-completed',
    attributes: { step: 'initialization' }
  });

  // Do work
  await doSomeWork();

  // Set success status
  tracer.setStatus(span, {
    code: SpanStatusCode.OK,
    description: 'Operation completed successfully'
  });
} catch (error) {
  // Record exception
  tracer.recordException(span, error as Error);
} finally {
  // End span
  tracer.endSpan(span);
}
```

### Using Context Propagation

```typescript
import { getContextManager } from './tracing';

const contextManager = getContextManager();

// Extract context from incoming request
const headers = request.headers;
const context = contextManager.extractContext(headers);

// Inject context into outgoing request
const outgoingHeaders = {};
contextManager.injectContext(context, outgoingHeaders);
```

### Using Baggage

```typescript
import { withBaggage, createBaggageFromRecord } from './tracing';

// Create baggage
const baggage = createBaggageFromRecord({
  'user.id': '12345',
  'tenant.id': 'abcde',
});

// Run function with baggage
await withBaggage(baggage, async () => {
  // Baggage is automatically propagated
  await performOperation();
});
```

## Exporters

### Jaeger Exporter

```typescript
await initializeTracing({
  serviceName: 'megawatts-bot',
  exporterType: 'jaeger',
  jaegerEndpoint: 'http://localhost:14268/api/traces',
});
```

### Zipkin Exporter

```typescript
await initializeTracing({
  serviceName: 'megawatts-bot',
  exporterType: 'zipkin',
  zipkinEndpoint: 'http://localhost:9411/api/v2/spans',
});
```

### OTLP Exporter

```typescript
await initializeTracing({
  serviceName: 'megawatts-bot',
  exporterType: 'otlp',
  endpoint: 'http://localhost:4317',
});
```

### Console Exporter (Development)

```typescript
await initializeTracing({
  serviceName: 'megawatts-bot',
  exporterType: 'console',
});
```

## Instrumentation

### HTTP Instrumentation

```typescript
import { getInstrumentation } from './tracing';

const instrumentation = getInstrumentation();

await instrumentation.instrumentHttpRequest({
  method: 'GET',
  url: 'https://api.example.com/data',
  headers: { 'Authorization': 'Bearer token' },
}, async () => {
  // HTTP request is automatically traced
  const response = await fetch('https://api.example.com/data');
  return response.json();
});
```

### Database Instrumentation

```typescript
await instrumentation.instrumentDatabaseQuery({
  dbType: 'postgresql',
  database: 'megawatts_bot',
  queryType: 'SELECT',
  table: 'users',
  query: 'SELECT * FROM users WHERE id = $1',
}, async () => {
  // Database query is automatically traced
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result;
});
```

### Redis Instrumentation

```typescript
await instrumentation.instrumentRedisCommand({
  command: 'GET',
  db: 0,
  key: 'user:12345',
}, async () => {
  // Redis command is automatically traced
  const value = await redis.get('user:12345');
  return value;
});
```

### Discord API Instrumentation

```typescript
await instrumentation.instrumentDiscordApi({
  endpoint: '/api/channels/123/messages',
  method: 'POST',
  guildId: '456',
  channelId: '123',
}, async () => {
  // Discord API call is automatically traced
  const message = await discord.channels.cache.get('123')?.send('Hello!');
  return message;
});
```

## Advanced Usage

### Custom Span Wrapping

```typescript
const tracer = getTracer();

// Wrap a function with a span
const wrappedFunction = tracer.wrapWithSpan('my-function', async () => {
  return await someAsyncOperation();
});

// Wrap an async function
const asyncWrapped = tracer.wrapAsyncWithSpan('my-async-function', async () => {
  return await someAsyncOperation();
});
```

### Child Spans

```typescript
const parentSpan = tracer.startSpan('parent-operation');

// Create child span
const childSpan = tracer.startChildSpan('child-operation');

try {
  // Do child work
  await childWork();
} finally {
  tracer.endSpan(childSpan);
}

tracer.endSpan(parentSpan);
```

### Span Links

```typescript
const span1 = tracer.startSpan('operation-1');
tracer.endSpan(span1);

const span2 = tracer.startSpan('operation-2');
tracer.addLinks(span2, [{
  context: span1.spanContext(),
  attributes: { 'link.type': 'related' }
}]);
```

### Export Statistics

```typescript
import { createExporter, ExporterType } from './tracing';

const exporter = createExporter(ExporterType.OTLP, 'megawatts-bot');
const stats = exporter.getStats();

console.log('Export statistics:', stats);
// {
//   totalExports: 100,
//   successfulExports: 95,
//   failedExports: 3,
//   retriedExports: 2,
//   queueSize: 0
// }
```

## Configuration Options

### Tracer Configuration

| Option | Type | Default | Description |
|---------|--------|----------|-------------|
| `serviceName` | string | Required | Service name for tracing |
| `serviceVersion` | string | '1.0.0' | Service version |
| `samplingRate` | number | 1.0 | Sampling rate (0.0 to 1.0) |
| `enableBatch` | boolean | true | Enable batch processing |
| `batchTimeout` | number | 5000 | Batch export timeout (ms) |
| `maxBatchSize` | number | 512 | Maximum batch size |
| `maxQueueSize` | number | 2048 | Maximum queue size |

### Instrumentation Configuration

| Option | Type | Default | Description |
|---------|--------|----------|-------------|
| `enableHttp` | boolean | true | Enable HTTP instrumentation |
| `enableDatabase` | boolean | true | Enable database instrumentation |
| `enableRedis` | boolean | true | Enable Redis instrumentation |
| `enableDiscord` | boolean | true | Enable Discord API instrumentation |
| `captureBodies` | boolean | false | Capture request/response bodies |
| `sanitizeQueries` | boolean | true | Sanitize SQL queries |
| `sanitizeKeys` | boolean | true | Sanitize Redis keys |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|----------|
| `OTEL_LOG_LEVEL` | OpenTelemetry log level | `INFO` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP exporter endpoint | `http://localhost:4317` |
| `OTEL_EXPORTER_JAEGER_ENDPOINT` | Jaeger exporter endpoint | `http://localhost:14268/api/traces` |
| `OTEL_EXPORTER_ZIPKIN_ENDPOINT` | Zipkin exporter endpoint | `http://localhost:9411/api/v2/spans` |

## Shutdown

```typescript
import { shutdownTracing } from './tracing';

// Gracefully shutdown tracing
await shutdownTracing();
```

## Best Practices

1. **Use Descriptive Span Names**: Use clear, descriptive names for spans
2. **Add Relevant Attributes**: Include meaningful attributes for filtering and analysis
3. **Record Events**: Log important events during span execution
4. **Handle Errors**: Always record exceptions and set error status
5. **Use Sampling**: Configure appropriate sampling rates for production
6. **Batch Exports**: Use batch exports for better performance
7. **Sanitize Sensitive Data**: Always sanitize queries, keys, and URLs

## Troubleshooting

### Traces Not Appearing

1. Check exporter endpoint configuration
2. Verify exporter service is running
3. Check sampling rate (may be too low)
4. Review logs for export errors

### High Memory Usage

1. Reduce `maxQueueSize` configuration
2. Lower `maxBatchSize` configuration
3. Increase sampling rate
4. Enable batch processing

### Missing Context

1. Verify context manager is initialized
2. Check propagator configuration
3. Ensure headers are being extracted/injected correctly

## Architecture

The tracing module follows OpenTelemetry standards and consists of:

- **Tracer**: Manages span lifecycle and configuration
- **Exporter**: Handles trace export to various backends
- **Context**: Manages trace context propagation
- **Instrumentation**: Provides auto-instrumentation for common libraries

## License

MIT
