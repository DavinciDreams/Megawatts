# Message Processing Pipeline

This directory contains the core message processing pipeline for the Discord bot, responsible for analyzing, routing, and handling incoming messages through various stages of processing.

## Architecture Overview

The processing pipeline follows a modular design with the following components:

```
Message Input → Context Extraction → Intent Recognition → Safety Checks → Message Routing → Handler
```

## Components

### 1. Pipeline (`pipeline.ts`)
**Main orchestrator** that manages the entire processing workflow.

**Features:**
- Single and batch message processing
- Queue management for high-throughput scenarios
- Event-driven architecture for extensibility
- Statistics tracking and monitoring
- Graceful shutdown handling

**Key Methods:**
- `processMessage(message)` - Process single message
- `processMessages(messages)` - Process batch of messages
- `getStats()` - Get processing statistics
- `pause()`/`resume()` - Control processing flow

### 2. Message Processor (`messageProcessor.ts`)
**Core coordinator** that orchestrates individual processing stages.

**Features:**
- Coordinates all processing components
- Maintains processing statistics
- Error handling and fallback mechanisms
- Configuration management

**Processing Flow:**
1. Extract context from message and environment
2. Recognize user intent
3. Perform safety checks
4. Route to appropriate handler
5. Return comprehensive processing result

### 3. Context Extractor (`contextExtractor.ts`)
**Gathers contextual information** for intelligent message processing.

**Features:**
- Message history tracking
- User behavior analysis
- Guild context management
- Spam score calculation
- Pattern recognition

**Context Types:**
- **Message Context**: Channel, guild, timestamp, previous messages
- **User History**: Message frequency, patterns, spam indicators
- **Guild Context**: Member count, roles, rules, moderators

### 4. Intent Recognizer (`intentRecognizer.ts`)
**Identifies user intent** using pattern matching and heuristics.

**Supported Intents:**
- `COMMAND` - Bot commands with prefixes
- `QUESTION` - Information-seeking messages
- `GREETING/FAREWELL` - Social interactions
- `HELP` - Assistance requests
- `MODERATION` - Administrative actions
- `SPAM` - Unsolicited bulk messages
- `CONVERSATION` - General chat
- `UNKNOWN` - Unrecognized intent

**Features:**
- Pattern-based recognition
- Entity extraction (users, channels, URLs)
- Confidence scoring
- Custom pattern addition

### 5. Safety Checker (`safetyChecker.ts`)
**Ensures message safety** through comprehensive content analysis.

**Safety Categories:**
- **Profanity** - Inappropriate language
- **Harassment** - Targeted negative behavior
- **Spam** - Repetitive/unsolicited content
- **Malicious Links** - Dangerous URLs
- **Personal Info** - Sensitive data exposure
- **Hate Speech** - Discriminatory content
- **Self-Harm** - Risk indicators
- **Violence** - Threat content

**Risk Levels:**
- `LOW` - Minimal risk
- `MEDIUM` - Requires attention
- `HIGH` - Immediate review needed
- `CRITICAL` - Urgent action required

### 6. Message Router (`messageRouter.ts`)
**Directs messages** to appropriate handlers based on analysis.

**Routing Logic:**
- Priority-based rule system
- Intent-based routing
- Safety-driven decisions
- Handler type assignment

**Handler Types:**
- `COMMAND` - Command processors
- `AI_CHAT` - AI conversation handlers
- `MODERATION` - Safety/moderation handlers
- `HELP_SYSTEM` - Assistance providers
- `IGNORE` - Message filtering
- `LOG_ONLY` - Silent processing

## Configuration

### Pipeline Config
```typescript
interface PipelineConfig {
  enableSafetyChecks: boolean;      // Enable safety analysis
  enableIntentRecognition: boolean;   // Enable intent detection
  enableContextExtraction: boolean;  // Enable context gathering
  safetyThreshold: number;           // Safety violation threshold
  contextHistorySize: number;        // Message history limit
  intentConfidenceThreshold: number;  // Minimum intent confidence
  enableLogging: boolean;           // Enable detailed logging
}
```

## Usage Example

```typescript
import { ProcessingPipeline, PipelineConfig } from './processing';

// Configure pipeline
const config: PipelineConfig = {
  enableSafetyChecks: true,
  enableIntentRecognition: true,
  enableContextExtraction: true,
  safetyThreshold: 0.7,
  contextHistorySize: 50,
  intentConfidenceThreshold: 0.5,
  enableLogging: true
};

// Create pipeline
const pipeline = new ProcessingPipeline(config);

// Process message
const result = await pipeline.processMessage(discordMessage);

// Handle result
if (result.success) {
  console.log(`Intent: ${result.intent.type}`);
  console.log(`Handler: ${result.routing.handler}`);
  console.log(`Safe: ${result.safety.isSafe}`);
}
```

## Event System

The pipeline emits events for monitoring and extension:

- `processingStart` - Message processing begun
- `processingComplete` - Message processed successfully
- `processingError` - Processing failed
- `batchProcessed` - Batch processing completed
- `responseRequired` - Response needed
- `moderationRequired` - Safety violation detected
- `configUpdated` - Configuration changed

## Performance Considerations

### Optimization Features
- **Caching**: Context and pattern caching for faster processing
- **Batch Processing**: Handle multiple messages efficiently
- **Queue Management**: Prevent memory overflow
- **Async Processing**: Non-blocking message handling

### Monitoring
- **Statistics**: Track processing metrics
- **Error Rates**: Monitor failure patterns
- **Performance**: Average processing times
- **Queue Status**: Real-time queue monitoring

## Extensibility

### Adding New Intents
```typescript
// Add custom intent pattern
intentRecognizer.addIntentPattern(IntentType.CUSTOM, [
  /custom pattern/gi,
  /another pattern/gi
]);
```

### Adding Safety Checks
```typescript
// Add custom profanity
safetyChecker.addProfanityWords(['word1', 'word2']);

// Add malicious domains
safetyChecker.addMaliciousDomains(['bad-site.com']);
```

### Custom Routing Rules
```typescript
// Add custom routing rule
messageRouter.addRoutingRule({
  name: 'custom_rule',
  priority: 75,
  condition: (msg, ctx, intent, safety) => /* custom logic */,
  action: (msg, ctx, intent, safety) => /* routing decision */
});
```

## Error Handling

The pipeline implements comprehensive error handling:

1. **Graceful Degradation**: Fallback behaviors for component failures
2. **Error Propagation**: Detailed error information in results
3. **Retry Logic**: Automatic retry for transient failures
4. **Logging**: Comprehensive error logging and monitoring

## Security Considerations

- **Input Validation**: All inputs are validated and sanitized
- **Rate Limiting**: Built-in protection against abuse
- **Privacy**: No sensitive data in logs or storage
- **Access Control**: Role-based routing and permissions

## Integration Points

The pipeline integrates with:
- **Discord.js**: Message input and basic types
- **Storage Systems**: Context and history persistence
- **AI Services**: Intent recognition enhancement
- **Moderation Systems**: Safety violation handling
- **Logging Infrastructure**: Centralized logging

## Testing

Each component includes comprehensive test coverage:
- Unit tests for individual functions
- Integration tests for component interaction
- Performance tests for throughput
- Error scenario testing

## Future Enhancements

Planned improvements:
1. **Machine Learning**: Enhanced intent recognition
2. **Real-time Collaboration**: Multi-bot coordination
3. **Advanced Analytics**: Deeper behavior insights
4. **Custom Rules**: User-defined routing logic
5. **Performance Optimization**: GPU acceleration for ML tasks