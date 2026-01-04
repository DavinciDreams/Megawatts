# Discord Conversational Mode Integration Guide

This guide explains how to integrate and use the conversational Discord mode with the bot.

## Overview

The conversational Discord mode enables the bot to handle natural language conversations through AI integration, while maintaining full backward compatibility with existing command-based interactions.

## Table of Contents

1. [Enabling Conversational Mode](#enabling-conversational-mode)
2. [Required Dependencies](#required-dependencies)
3. [Configuration Options](#configuration-options)
4. [Integration Points](#integration-points)
5. [Usage Examples](#usage-examples)
6. [Operating Modes](#operating-modes)

## Enabling Conversational Mode

### Step 1: Set Environment Variables

Add the following environment variables to your `.env` file:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Conversational Discord Mode
CONVERSATIONAL_DISCORD_ENABLED=true
CONVERSATIONAL_DISCORD_MODE=hybrid

# AI Provider Configuration (OpenAI)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=4096
OPENAI_TEMPERATURE=0.7
OPENAI_TIMEOUT=30000
OPENAI_RETRY_ATTEMPTS=3

# Redis Configuration (for distributed locking)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

### Step 2: Create Conversational Discord Configuration

Create a `ConversationalDiscordConfig` object when initializing the bot:

```typescript
import { SelfEditingDiscordBot } from './index';
import { ConversationalDiscordConfig } from './types/conversational';

const conversationalConfig: ConversationalDiscordConfig = {
  enabled: true,
  mode: 'hybrid', // 'conversational', 'command', or 'hybrid'
  contextWindow: 10,
  maxTokens: 2048,
  temperature: 0.7,
  personality: 'friendly',
  tone: 'professional',
  emotionalIntelligence: {
    enabled: true,
    empathy: 0.8,
    sentimentAnalysis: true,
    emotionalStateTracking: true,
  },
  memory: {
    enabled: true,
    maxHistoryLength: 100,
    contextRetention: 0.9,
  },
  multilingual: {
    enabled: true,
    defaultLanguage: 'en',
    autoDetect: true,
  },
  safety: {
    enabled: true,
    contentFiltering: true,
    profanityFilter: true,
    harassmentDetection: true,
  },
  rateLimiting: {
    enabled: true,
    maxRequestsPerMinute: 60,
    maxRequestsPerHour: 1000,
  },
  features: {
    toolUse: true,
    codeExecution: false,
    webSearch: false,
  },
};

const bot = new SelfEditingDiscordBot(
  token,
  logger,
  config,
  conversationalConfig
);
```

## Required Dependencies

### Core Dependencies

```json
{
  "dependencies": {
    "discord.js": "^14.0.0",
    "openai": "^4.0.0",
    "ioredis": "^5.0.0",
    "dotenv": "^16.0.0"
  }
}
```

### Installation

```bash
npm install discord.js openai ioredis dotenv
```

## Configuration Options

### ConversationalDiscordConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable conversational Discord mode |
| `mode` | `'conversational' \| 'command' \| 'hybrid'` | `'hybrid'` | Operating mode (see [Operating Modes](#operating-modes)) |
| `contextWindow` | `number` | `10` | Number of messages to keep in context |
| `maxTokens` | `number` | `2048` | Maximum tokens for AI response |
| `temperature` | `number` | `0.7` | AI response randomness (0-1) |
| `personality` | `string` | `'friendly'` | Bot personality style |
| `tone` | `string` | `'professional'` | Bot tone |
| `emotionalIntelligence` | `object` | See below | Emotional intelligence settings |
| `memory` | `object` | See below | Memory management settings |
| `multilingual` | `object` | See below | Multilingual support settings |
| `safety` | `object` | See below | Safety and moderation settings |
| `rateLimiting` | `object` | See below | Rate limiting settings |
| `features` | `object` | See below | Feature flags |

### Emotional Intelligence Configuration

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable emotional intelligence |
| `empathy` | `number` | `0.8` | Empathy level (0-1) |
| `sentimentAnalysis` | `boolean` | `true` | Analyze message sentiment |
| `emotionalStateTracking` | `boolean` | `true` | Track user emotional state |

### Memory Configuration

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable conversation memory |
| `maxHistoryLength` | `number` | `100` | Maximum messages in history |
| `contextRetention` | `number` | `0.9` | Context retention score (0-1) |

### Multilingual Configuration

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable multilingual support |
| `defaultLanguage` | `string` | `'en'` | Default language code |
| `autoDetect` | `boolean` | `true` | Auto-detect user language |

### Safety Configuration

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable safety features |
| `contentFiltering` | `boolean` | `true` | Filter inappropriate content |
| `profanityFilter` | `boolean` | `true` | Filter profanity |
| `harassmentDetection` | `boolean` | `true` | Detect harassment |

### Rate Limiting Configuration

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable rate limiting |
| `maxRequestsPerMinute` | `number` | `60` | Max requests per minute per user |
| `maxRequestsPerHour` | `number` | `1000` | Max requests per hour per user |

### Features Configuration

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `toolUse` | `boolean` | `true` | Enable AI tool use |
| `codeExecution` | `boolean` | `false` | Enable code execution |
| `webSearch` | `boolean` | `false` | Enable web search |

## Integration Points

### 1. Bot Initialization

The conversational integration is initialized in the bot's [`initialize()`](../index.ts:229) method:

```typescript
await this.client.login(this.token);

// Initialize Discord bot integration for conversational mode
await this.initializeDiscordIntegration(this.conversationalDiscordConfig);
```

### 2. Message Handling

Messages are routed through the [`handleMessage()`](../index.ts:381) method:

```typescript
private async handleMessage(message: Message): Promise<void> {
  // Check if conversational mode should handle this message
  if (this.discordBotIntegration && 
      this.discordBotIntegration.shouldUseConversationalMode(message)) {
    // Handle through conversational integration
    const response = await this.discordBotIntegration.processMessage(message);
    
    if (response) {
      // Send the conversational response
      await message.reply(response.content);
    }
    return;
  }
  
  // ... existing command handling
}
```

### 3. Bot Integration Module

The [`DiscordBotIntegration`](./integration/botIntegration.ts:15) interface provides:

```typescript
interface DiscordBotIntegration {
  processMessage(message: Message): Promise<ConversationResponse | null>;
  isConversationalMode(): boolean;
  shouldUseConversationalMode(message: Message): boolean;
  getConversationHandler(): DiscordConversationHandler | null;
  updateConfig(config: Partial<ConversationalDiscordConfig>): void;
}
```

## Usage Examples

### Example 1: Basic Conversational Bot

```typescript
import { SelfEditingDiscordBot } from './index';
import { ConversationalDiscordConfig } from './types/conversational';

const config: ConversationalDiscordConfig = {
  enabled: true,
  mode: 'conversational',
};

const bot = new SelfEditingDiscordBot(token, logger, botConfig, config);
await bot.initialize();
```

### Example 2: Hybrid Mode (Commands + Conversational)

```typescript
const config: ConversationalDiscordConfig = {
  enabled: true,
  mode: 'hybrid', // Commands with '!' prefix, conversational otherwise
  personality: 'friendly',
  tone: 'casual',
};

const bot = new SelfEditingDiscordBot(token, logger, botConfig, config);
await bot.initialize();
```

### Example 3: Advanced Configuration

```typescript
const config: ConversationalDiscordConfig = {
  enabled: true,
  mode: 'hybrid',
  contextWindow: 20,
  maxTokens: 4096,
  temperature: 0.5,
  personality: 'professional',
  tone: 'formal',
  emotionalIntelligence: {
    enabled: true,
    empathy: 0.9,
    sentimentAnalysis: true,
    emotionalStateTracking: true,
  },
  memory: {
    enabled: true,
    maxHistoryLength: 200,
    contextRetention: 0.95,
  },
  safety: {
    enabled: true,
    contentFiltering: true,
    profanityFilter: true,
    harassmentDetection: true,
  },
  rateLimiting: {
    enabled: true,
    maxRequestsPerMinute: 30,
    maxRequestsPerHour: 500,
  },
};

const bot = new SelfEditingDiscordBot(token, logger, botConfig, config);
await bot.initialize();
```

## Operating Modes

### Conversational Mode

All messages are processed through the conversational AI handler. Commands are not recognized.

```typescript
mode: 'conversational'
```

**Behavior:**
- `!help` → Treated as conversational input
- `Hello bot!` → Conversational response
- No command recognition

### Command Mode

All messages are processed through the command handler. Conversational mode is disabled.

```typescript
mode: 'command'
```

**Behavior:**
- `!help` → Shows help command
- `Hello bot!` → Ignored (not a command)
- Only `!` prefixed messages are processed

### Hybrid Mode (Recommended)

Messages starting with the command prefix (`!`) go to the command handler. All other messages go to the conversational handler.

```typescript
mode: 'hybrid'
```

**Behavior:**
- `!help` → Shows help command
- `!ping` → Bot responds with pong
- `Hello bot!` → Conversational response
- Best of both worlds

## Backward Compatibility

The conversational mode is **fully backward compatible** with existing Discord bot functionality:

1. **Optional**: Conversational mode is disabled by default
2. **Non-intrusive**: Existing commands work unchanged
3. **Graceful degradation**: If AI integration fails, commands still work
4. **Distributed locking**: Message processing remains thread-safe

## Troubleshooting

### Issue: Conversational responses not appearing

**Solution:**
1. Verify `CONVERSATIONAL_DISCORD_ENABLED=true` in environment
2. Check that `OPENAI_API_KEY` is set correctly
3. Ensure the mode is set to `'conversational'` or `'hybrid'`

### Issue: Commands not working in hybrid mode

**Solution:**
1. Verify command prefix is `!`
2. Check that routing logic is properly configured
3. Ensure `messageRouter` is initialized

### Issue: Rate limiting errors

**Solution:**
1. Adjust `maxRequestsPerMinute` in configuration
2. Check Redis connection for distributed locking
3. Verify rate limiting is not too aggressive

## Additional Resources

- [DiscordConversationHandler](./conversation/DiscordConversationHandler.ts) - Main conversational handler
- [DiscordContextManager](./context/DiscordContextManager.ts) - Context management
- [EmotionalIntelligenceEngine](./emotional/EmotionalIntelligenceEngine.ts) - Emotional intelligence
- [Bot Integration Module](./integration/botIntegration.ts) - Integration layer
