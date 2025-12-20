# Channel Filter Feature Documentation

## Table of Contents

1. [Overview](#overview)
2. [Environment Variable Configuration](#environment-variable-configuration)
3. [Implementation Details](#implementation-details)
4. [Usage Instructions](#usage-instructions)
5. [Migration Guide from 'katbot' to 'megawatts' Channel](#migration-guide-from-katbot-to-megawatts-channel)
6. [Troubleshooting](#troubleshooting)
7. [API Reference](#api-reference)

## Overview

The channel filter feature is a sophisticated message routing system that allows the Discord bot to selectively respond to messages based on channel restrictions and mention detection. This feature provides fine-grained control over where the bot operates and how it interacts with users.

### Key Features

- **Channel-based filtering**: Restrict bot responses to specific channels by ID or name
- **Mention detection**: Allow the bot to respond when mentioned, even in restricted channels
- **Flexible configuration**: Support for both channel IDs and channel names
- **Environment-based configuration**: Easy setup across different environments
- **Graceful fallbacks**: Robust handling of edge cases and missing information

### Benefits

- Reduces noise in channels where the bot shouldn't operate
- Provides clear boundaries for bot interactions
- Enables mention-based interactions in any channel when needed
- Supports different configurations for development, staging, and production

## Environment Variable Configuration

### Primary Configuration

The channel filter feature is primarily configured through the `BOT_RESPONSE_CHANNEL` environment variable:

```bash
# Set the primary channel for bot responses
BOT_RESPONSE_CHANNEL=megawatts
```

### Configuration Files

#### Development (.env.example)

```bash
# Bot Configuration
BOT_RESPONSE_CHANNEL=megawatts
```

#### Production (.env.production)

```bash
# Bot Configuration - Production
# Note: BOT_RESPONSE_CHANNEL should be explicitly set in production
# BOT_RESPONSE_CHANNEL=megawatts
```

### Configuration Loading

The configuration is loaded in the following order of precedence:

1. Environment variables (highest priority)
2. Default values (fallback)

The configuration is handled in [`src/index.ts`](src/index.ts:48) and [`src/core/processing/types.ts`](src/core/processing/types.ts:191).

## Implementation Details

### Core Components

#### 1. MessageRouter Class

The [`MessageRouter`](src/core/processing/messageRouter.ts:16) class is the heart of the channel filtering system. It handles:

- Channel validation
- Mention detection
- Message routing decisions
- Configuration management

#### 2. Pipeline Configuration

The [`PipelineConfig`](src/core/processing/types.ts:163) interface defines the channel filtering options:

```typescript
interface PipelineConfig {
  // Channel filtering and mention detection
  allowedChannels?: string[];        // Array of allowed channel IDs
  respondToMentions?: boolean;       // Whether to respond to mentions
  allowedChannelNames?: string[];     // Array of allowed channel names
}
```

#### 3. Default Configuration

The default configuration is defined in [`DEFAULT_PIPELINE_CONFIG`](src/core/processing/types.ts:180):

```typescript
const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  // ... other config
  allowedChannels: [], // Empty by default, will be configured
  respondToMentions: true, // Enabled by default
  allowedChannelNames: [process.env.BOT_RESPONSE_CHANNEL || 'megawatts'] // Use environment variable or fallback to megawatts
};
```

### Filtering Logic

The filtering logic is implemented in the [`shouldIgnoreMessage`](src/core/processing/messageRouter.ts:203) method:

1. **Bot message filtering**: Ignore messages from other bots
2. **Self-message filtering**: Ignore messages from the bot itself
3. **Confidence filtering**: Ignore low-confidence intent messages
4. **Empty message filtering**: Ignore empty messages
5. **Channel filtering**: Check if message is in allowed channels
6. **Mention detection**: Allow messages with bot mentions when configured

### Channel Validation

The channel validation is handled by the [`isInAllowedChannel`](src/core/processing/messageRouter.ts:255) method:

1. **No restrictions**: If no channel restrictions are set, allow all channels
2. **Channel ID check**: Check if channel ID is in the allowed list
3. **Channel name check**: Fallback to channel name check (for guild channels only)

### Mention Detection

The mention detection is handled by the [`hasBotMention`](src/core/processing/messageRouter.ts:282) method:

1. **Bot mention check**: Check if message mentions the bot
2. **@everyone check**: Check for @everyone mentions (configurable)

## Usage Instructions

### Basic Setup

1. **Set the environment variable**:
   ```bash
   export BOT_RESPONSE_CHANNEL=megawatts
   ```

2. **Configure your bot**:
   The bot will automatically use the channel specified in `BOT_RESPONSE_CHANNEL`

### Advanced Configuration

#### Multiple Channels by ID

```typescript
// In your bot configuration
const config = {
  allowedChannels: ['channel-id-1', 'channel-id-2', 'channel-id-3'],
  respondToMentions: true
};
```

#### Multiple Channels by Name

```typescript
// In your bot configuration
const config = {
  allowedChannelNames: ['megawatts', 'bot-commands', 'support'],
  respondToMentions: true
};
```

#### Disable Mention Responses

```typescript
// In your bot configuration
const config = {
  allowedChannels: ['megawatts-channel-id'],
  respondToMentions: false
};
```

### Runtime Configuration Updates

You can update the channel filtering configuration at runtime:

```typescript
// Update the message router configuration
messageRouter.updateConfig({
  allowedChannels: ['new-channel-id'],
  respondToMentions: false
});
```

### Custom Routing Rules

You can add custom routing rules for specific scenarios:

```typescript
// Add a custom routing rule
messageRouter.addRoutingRule({
  name: 'admin_override',
  priority: 200,
  condition: (message, context, intent, safety) => {
    // Custom condition logic
    return context.userRoles.includes('admin');
  },
  action: (message, context, intent, safety) => ({
    handler: HandlerType.AI_CHAT,
    priority: 200,
    requiresModeration: false,
    shouldRespond: true,
    metadata: { reason: 'admin_override' }
  })
});
```

## Migration Guide from 'katbot' to 'megawatts' Channel

This section guides you through migrating from the 'katbot' channel to the 'megawatts' channel.

### Step 1: Update Environment Variables

#### Development Environment

Update your `.env` file:
```bash
# Old configuration
# BOT_RESPONSE_CHANNEL=katbot

# New configuration
BOT_RESPONSE_CHANNEL=megawatts
```

#### Production Environment

Update your production environment variables:
```bash
# Set in your production environment
export BOT_RESPONSE_CHANNEL=megawatts
```

### Step 2: Update Configuration Files

#### Docker Configuration

Update your Docker environment files:

**docker-compose.dev.yml**:
```yaml
services:
  bot:
    environment:
      - BOT_RESPONSE_CHANNEL=megawatts
```

**docker-compose.prod.yml**:
```yaml
services:
  bot:
    environment:
      - BOT_RESPONSE_CHANNEL=megawatts
```

#### Kubernetes Configuration

If using Kubernetes, update your ConfigMap or Secret:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: bot-config
data:
  BOT_RESPONSE_CHANNEL: "megawatts"
```

### Step 3: Update Channel References

#### Discord Server Setup

1. **Create the new channel**:
   - Create a new channel named `megawatts` in your Discord server
   - Set appropriate permissions for the bot

2. **Update bot permissions**:
   - Ensure the bot has read/write permissions in the new channel
   - Remove permissions from the old `katbot` channel if needed

#### Code References

Update any hardcoded channel references:

```typescript
// Old code
const KATBOT_CHANNEL = 'katbot';

// New code
const MEGAWATTS_CHANNEL = 'megawatts';
```

### Step 4: Update Tests

Update your test files to reflect the new channel name:

```typescript
// Old test
test('should respond to messages in katbot channel', async () => {
  config.allowedChannelNames = ['katbot'];
  // ... test code
});

// New test
test('should respond to messages in megawatts channel', async () => {
  config.allowedChannelNames = ['megawatts'];
  // ... test code
});
```

### Step 5: Deployment and Verification

1. **Deploy the changes**:
   ```bash
   # Deploy your updated configuration
   docker-compose up -d  # or your deployment method
   ```

2. **Verify the migration**:
   - Test that the bot responds in the `megawatts` channel
   - Verify that the bot doesn't respond in the old `katbot` channel
   - Check that mention-based responses work correctly

3. **Monitor logs**:
   ```bash
   # Check for channel filtering logs
   docker logs your-bot-container | grep "Channel"
   ```

### Step 6: Cleanup (Optional)

Once you've verified the migration is successful:

1. **Archive the old channel**:
   - Consider archiving the `katbot` channel instead of deleting it
   - This preserves message history

2. **Update documentation**:
   - Update any user-facing documentation
   - Update internal team documentation

3. **Remove old configurations**:
   - Remove any remaining references to `katbot` in configuration files

### Rollback Plan

If you need to rollback during migration:

1. **Revert environment variables**:
   ```bash
   export BOT_RESPONSE_CHANNEL=katbot
   ```

2. **Redeploy with old configuration**:
   ```bash
   docker-compose up -d
   ```

3. **Verify rollback**:
   - Test that the bot responds in the `katbot` channel again
   - Check that all functionality is restored

## Troubleshooting

### Common Issues

#### Bot Not Responding in Configured Channel

**Symptoms**: Bot doesn't respond to messages in the configured channel

**Possible Causes**:
1. Incorrect channel ID or name in configuration
2. Bot lacks permissions in the channel
3. Environment variable not loaded correctly

**Solutions**:
1. Verify the channel configuration:
   ```bash
   echo $BOT_RESPONSE_CHANNEL
   ```

2. Check bot permissions in Discord:
   - Ensure bot has "Read Messages" and "Send Messages" permissions
   - Verify bot is actually in the channel

3. Check application logs:
   ```bash
   docker logs your-bot-container | grep -i "channel"
   ```

#### Bot Responding in Unwanted Channels

**Symptoms**: Bot responds in channels where it shouldn't

**Possible Causes**:
1. `respondToMentions` is enabled and bot is being mentioned
2. No channel restrictions configured
3. Configuration not applied correctly

**Solutions**:
1. Check mention detection:
   ```typescript
   // Disable mention responses if not needed
   config.respondToMentions = false;
   ```

2. Verify channel restrictions:
   ```typescript
   // Ensure channel restrictions are properly set
   config.allowedChannels = ['your-channel-id'];
   config.allowedChannelNames = ['your-channel-name'];
   ```

#### Environment Variable Not Loading

**Symptoms**: Bot uses default channel name instead of configured one

**Possible Causes**:
1. Environment variable not set
2. .env file not loaded
3. Variable name typo

**Solutions**:
1. Verify environment variable:
   ```bash
   env | grep BOT_RESPONSE_CHANNEL
   ```

2. Check .env file loading:
   ```bash
   # Ensure dotenv is called before configuration
   dotenv.config();
   ```

3. Verify variable name:
   - Check for typos in `BOT_RESPONSE_CHANNEL`

### Debugging Tools

#### Enable Debug Logging

Enable debug logging to trace message routing:

```typescript
// In your bot configuration
const config = {
  enableLogging: true,
  logLevel: 'debug'
};
```

#### Test Channel Filtering

Use the comprehensive test suite to verify channel filtering:

```bash
# Run the channel filtering tests
npm test -- --testPathPattern=messageRouter
```

#### Manual Testing

Create a test script to verify channel filtering:

```javascript
// test-channel-filter.js
const { MessageRouter } = require('./src/core/processing/messageRouter');
const { DEFAULT_PIPELINE_CONFIG } = require('./src/core/processing/types');

const router = new MessageRouter(DEFAULT_PIPELINE_CONFIG);

// Test your specific channel configuration
const testMessage = {
  id: 'test-message',
  content: 'Hello bot',
  author: { id: 'user-123', bot: false },
  channel: { id: 'your-channel-id', name: 'your-channel-name' },
  mentions: { users: new Map(), everyone: false },
  client: { user: { id: 'bot-456' } }
};

const testContext = {
  userId: 'user-123',
  channelId: 'your-channel-id',
  messageId: 'test-message',
  timestamp: new Date()
};

router.routeMessage(testMessage, testContext, testIntent, testSafety)
  .then(result => {
    console.log('Routing result:', result);
  })
  .catch(error => {
    console.error('Routing error:', error);
  });
```

## API Reference

### MessageRouter Class

#### Constructor

```typescript
constructor(config: PipelineConfig)
```

Creates a new MessageRouter instance with the provided configuration.

#### Methods

##### routeMessage

```typescript
async routeMessage(
  message: Message,
  context: MessageContext,
  intent: MessageIntent,
  safety: SafetyCheckResult
): Promise<RoutingDecision>
```

Routes a message through the filtering system and returns a routing decision.

**Parameters**:
- `message`: Discord.js Message object
- `context`: Message context information
- `intent`: Recognized message intent
- `safety`: Safety check results

**Returns**: Promise resolving to a RoutingDecision object

##### addRoutingRule

```typescript
addRoutingRule(rule: RoutingRule): void
```

Adds a custom routing rule to the router.

**Parameters**:
- `rule`: Routing rule to add

##### removeRoutingRule

```typescript
removeRoutingRule(ruleName: string): boolean
```

Removes a routing rule by name.

**Parameters**:
- `ruleName`: Name of the rule to remove

**Returns**: Boolean indicating if the rule was found and removed

##### updateConfig

```typescript
updateConfig(config: PipelineConfig): void
```

Updates the router configuration.

**Parameters**:
- `config`: New configuration to apply

### Interfaces

#### PipelineConfig

```typescript
interface PipelineConfig {
  enableSafetyChecks: boolean;
  enableIntentRecognition: boolean;
  enableContextExtraction: boolean;
  safetyThreshold: number;
  contextHistorySize: number;
  intentConfidenceThreshold: number;
  enableLogging: boolean;
  // Channel filtering and mention detection
  allowedChannels?: string[];
  respondToMentions?: boolean;
  allowedChannelNames?: string[];
}
```

#### RoutingDecision

```typescript
interface RoutingDecision {
  handler: HandlerType;
  priority: number;
  requiresModeration: boolean;
  shouldRespond: boolean;
  responseChannel?: string;
  metadata?: Record<string, any>;
}
```

#### RoutingRule

```typescript
interface RoutingRule {
  name: string;
  priority: number;
  condition: (
    message: Message,
    context: MessageContext,
    intent: MessageIntent,
    safety: SafetyCheckResult
  ) => boolean;
  action: (
    message: Message,
    context: MessageContext,
    intent: MessageIntent,
    safety: SafetyCheckResult
  ) => RoutingDecision;
}
```

### Enums

#### HandlerType

```typescript
enum HandlerType {
  COMMAND = 'command',
  AI_CHAT = 'ai_chat',
  MODERATION = 'moderation',
  HELP_SYSTEM = 'help_system',
  IGNORE = 'ignore',
  LOG_ONLY = 'log_only'
}
```

### Default Values

```typescript
const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  enableSafetyChecks: true,
  enableIntentRecognition: true,
  enableContextExtraction: true,
  safetyThreshold: 0.7,
  contextHistorySize: 10,
  intentConfidenceThreshold: 0.5,
  enableLogging: true,
  // Channel filtering and mention detection defaults
  allowedChannels: [], // Empty by default, will be configured
  respondToMentions: true, // Enabled by default
  allowedChannelNames: [process.env.BOT_RESPONSE_CHANNEL || 'megawatts'] // Use environment variable or fallback to megawatts
};
```

## Best Practices

### Configuration Management

1. **Use environment variables**: Always use environment variables for channel configuration
2. **Document your configuration**: Keep clear documentation of your channel setup
3. **Test configuration changes**: Always test configuration changes in a development environment first

### Security Considerations

1. **Principle of least privilege**: Only grant the bot permissions it needs
2. **Channel permissions**: Ensure proper channel permissions are set
3. **Audit logs**: Monitor channel usage and bot responses

### Performance Optimization

1. **Channel ID over name**: Use channel IDs instead of names when possible (faster lookup)
2. **Limit channel restrictions**: Don't over-restrict channels unless necessary
3. **Monitor performance**: Keep an eye on message routing performance

### Maintenance

1. **Regular testing**: Run the test suite regularly to ensure functionality
2. **Log monitoring**: Monitor logs for channel filtering issues
3. **Configuration reviews**: Periodically review and update channel configurations

## Conclusion

The channel filter feature provides a robust and flexible system for controlling where and how your Discord bot responds to messages. By properly configuring the `BOT_RESPONSE_CHANNEL` environment variable and understanding the implementation details, you can ensure your bot operates exactly where you want it to.

For additional support or questions, refer to the test files in [`src/core/processing/__tests__/`](src/core/processing/__tests__/) or the implementation in [`src/core/processing/messageRouter.ts`](src/core/processing/messageRouter.ts).