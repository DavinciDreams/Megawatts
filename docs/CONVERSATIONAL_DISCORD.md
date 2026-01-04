# Conversational Discord Mode Guide

This guide provides comprehensive documentation for the Conversational Discord mode feature, which transforms the bot into an intelligent, emotionally-aware conversational assistant.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Modes](#usage-modes)
- [Emotional Intelligence](#emotional-intelligence)
- [Safety & Moderation](#safety--moderation)
- [Memory Management](#memory-management)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

## Overview

The Conversational Discord mode enables the bot to engage in natural, context-aware conversations with users across Discord servers. Powered by advanced AI models (OpenAI, Anthropic) and equipped with emotional intelligence capabilities, the bot can understand user intent, adapt to emotional states, and provide empathetic, contextually relevant responses.

### Core Capabilities

- **AI-Powered Conversations**: Leverages state-of-the-art language models for natural dialogue
- **Emotional Intelligence**: Real-time sentiment analysis, emotion detection, and mood inference
- **Context Management**: Maintains conversation history and context across interactions
- **Adaptive Responses**: Dynamically adjusts tone and content based on user state
- **Safety Features**: Content filtering, moderation, and emergency stop functionality
- **Multilingual Support**: Automatic language detection and multi-language capabilities
- **Conflict Resolution**: Intelligent de-escalation strategies for tense situations

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Discord API Layer                          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              DiscordConversationHandler                          │
│  - Message processing                                         │
│  - Context management                                         │
│  - Emergency stop handling                                     │
└──┬──────────────┬──────────────┬──────────────┬────────────┘
   │              │              │              │
   ▼              ▼              ▼              ▼
┌─────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐
│ Discord │  │ Emotional   │  │ Conversation│  │   AI Provider│
│ Context │  │ Intelligence│  │  Manager   │  │   Router    │
│ Manager │  │   Engine    │  │             │  │              │
└─────────┘  └──────────────┘  └─────────────┘  └──────┬───────┘
                                                         │
                                          ┌──────────────┴──────────────┐
                                          │                             │
                                          ▼                             ▼
                                   ┌─────────────┐              ┌─────────────┐
                                   │   OpenAI    │              │  Anthropic   │
                                   │   Provider  │              │   Provider   │
                                   └─────────────┘              └─────────────┘
```

### Data Flow

1. **Message Reception**: Discord message received via Discord API
2. **Context Extraction**: [`DiscordContextManager`](../src/discord/context/DiscordContextManager.ts:1) extracts channel, guild, and user context
3. **Emotional Analysis**: [`EmotionalIntelligenceEngine`](../src/discord/emotional/EmotionalIntelligenceEngine.ts:1) analyzes sentiment, emotion, and mood
4. **Conflict Detection**: Checks for conflict indicators and triggers de-escalation if needed
5. **AI Processing**: [`ConversationalAIProviderRouter`](../src/ai/providers/conversationalAIProviderRouter.ts:1) routes to appropriate AI provider
6. **Response Adaptation**: Adapts response based on emotional context and user preferences
7. **Response Delivery**: Sends response through Discord API

## Key Features

### 1. Emotional Intelligence

The bot employs a sophisticated emotional intelligence system that includes:

- **Sentiment Analysis**: Rule-based analysis using a comprehensive sentiment lexicon
- **Emotion Detection**: Identifies primary and secondary emotions (joy, sadness, anger, fear, surprise, disgust)
- **Mood Inference**: Determines overall mood state (happy, neutral, frustrated, excited, anxious, calm)
- **Empathetic Responses**: Generates empathetic responses based on detected emotions
- **Conflict Detection**: Identifies conflict indicators and escalation patterns

### 2. Context Management

The bot maintains multi-layered context for each conversation:

- **Short-term Memory**: In-memory conversation history with configurable TTL
- **Medium-term Memory**: Persistent storage for conversation history (7-30 days)
- **Long-term Memory**: Optional vector search for historical context
- **Cross-channel Awareness**: Tracks user activity across multiple channels
- **Temporal Context**: Considers time of day, day of week, and seasonal factors

### 3. Safety & Moderation

Comprehensive safety features ensure appropriate and safe interactions:

- **Content Filtering**: Blocks harmful, violent, or inappropriate content
- **Moderation Levels**: Configurable strictness (strict, moderate, relaxed)
- **Emergency Stop**: Users can trigger immediate conversation halt with specific phrases
- **Rate Limiting**: Per-user and per-channel rate limits to prevent abuse
- **Personal Information Protection**: Blocks sharing of personal or sensitive information

### 4. Adaptive Responses

The bot dynamically adapts responses based on:

- **User Preferences**: Tone, verbosity, and language preferences
- **Emotional State**: Adjusts tone and empathy level based on detected emotions
- **Conversation History**: Maintains context for coherent multi-turn conversations
- **Temporal Context**: Adjusts responses based on time and context

## Quick Start

### 1. Enable Conversational Mode

Add the following to your `.env` file:

```env
DISCORD_CONVERSATIONAL_ENABLED=true
DISCORD_CONVERSATIONAL_MODE=conversational
DISCORD_CONVERSATIONAL_TONE=friendly
DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE=true
```

### 2. Configure AI Provider

Ensure you have AI provider API keys configured:

```env
# OpenAI (recommended)
OPENAI_API_KEY=your_openai_api_key_here

# Or Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. Start the Bot

```bash
npm run dev
```

### 4. Test the Feature

In Discord, send a message to a channel where the bot has access:

```
Hello! How are you today?
```

The bot should respond with a friendly, context-aware message.

## Configuration

### Environment Variables

All conversational Discord configuration is done through environment variables. See [`.env.example`](../.env.example:1) for the complete list.

#### Core Settings

| Variable | Type | Default | Description |
|----------|------|----------|-------------|
| `DISCORD_CONVERSATIONAL_ENABLED` | boolean | `false` | Enable conversational mode |
| `DISCORD_CONVERSATIONAL_MODE` | enum | `conversational` | Operation mode: `conversational`, `command`, `hybrid` |
| `DISCORD_CONVERSATIONAL_RESPONSE_CHANNEL` | string | `bot-responses` | Channel for bot responses |
| `DISCORD_CONVERSATIONAL_RESPONSE_CHANNEL_TYPE` | enum | `same` | Response type: `same`, `dm`, `custom` |
| `DISCORD_CONVERSATIONAL_CONTEXT_WINDOW` | number | `50` | Number of messages in conversation history (1-100) |
| `DISCORD_CONVERSATIONAL_MAX_TOKENS` | number | `2000` | Maximum tokens for AI responses (100-10000) |
| `DISCORD_CONVERSATIONAL_TEMPERATURE` | number | `0.7` | AI temperature (0.0-2.0) |

#### Personality Settings

| Variable | Type | Default | Description |
|----------|------|----------|-------------|
| `DISCORD_CONVERSATIONAL_TONE` | enum | `friendly` | Bot tone: `friendly`, `professional`, `casual`, `playful` |
| `DISCORD_CONVERSATIONAL_FORMALITY` | enum | `casual` | Formality: `formal`, `casual`, `adaptive` |
| `DISCORD_CONVERSATIONAL_VERBOSITY` | enum | `balanced` | Verbosity: `concise`, `normal`, `detailed`, `adaptive` |

#### Emotional Intelligence Settings

| Variable | Type | Default | Description |
|----------|------|----------|-------------|
| `DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE` | boolean | `true` | Enable emotional intelligence features |
| `DISCORD_CONVERSATIONAL_EMOTION_INFLUENCE` | number | `0.7` | Emotion influence on responses (0.0-1.0) |

#### Memory Settings

| Variable | Type | Default | Description |
|----------|------|----------|-------------|
| `DISCORD_CONVERSATIONAL_MEMORY_RETENTION_DAYS` | number | `30` | Medium-term memory retention (1-365 days) |

#### Multilingual Settings

| Variable | Type | Default | Description |
|----------|------|----------|-------------|
| `DISCORD_CONVERSATIONAL_MULTILINGUAL_ENABLED` | boolean | `false` | Enable multilingual support |
| `DISCORD_CONVERSATIONAL_DEFAULT_LANGUAGE` | string | `en` | Default language (ISO 639-1 code) |

#### Safety Settings

| Variable | Type | Default | Description |
|----------|------|----------|-------------|
| `DISCORD_CONVERSATIONAL_CONTENT_FILTERING` | boolean | `true` | Enable content filtering |
| `DISCORD_CONVERSATIONAL_MODERATION_LEVEL` | enum | `moderate` | Moderation strictness: `strict`, `moderate`, `relaxed` |
| `DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED` | boolean | `true` | Enable emergency stop functionality |
| `DISCORD_CONVERSATIONAL_EMERGENCY_STOP_PHRASES` | string | `stop,emergency stop,halt,abort` | Comma-separated emergency stop phrases |
| `DISCORD_CONVERSATIONAL_MAX_RESPONSE_LENGTH` | number | `2000` | Maximum response length (100-10000) |

### Configuration File

You can also provide configuration via a JSON file at `conversational-discord.config.json`:

```json
{
  "enabled": true,
  "mode": "conversational",
  "responseChannel": "bot-responses",
  "responseChannelType": "same",
  "contextWindow": 50,
  "maxTokens": 2000,
  "temperature": 0.7,
  "tone": "friendly",
  "formality": "casual",
  "verbosity": "balanced",
  "personality": {
    "id": "megawatts-default",
    "name": "Megawatts",
    "description": "A helpful and intelligent Discord assistant",
    "systemPrompt": "You are Megawatts, a helpful and intelligent Discord assistant. You are friendly, professional, and always aim to provide accurate and useful information.",
    "defaultTone": "friendly",
    "defaultFormality": "casual",
    "defaultVerbosity": "balanced"
  },
  "emotionalIntelligence": {
    "enabled": true,
    "sentimentAnalysis": true,
    "emotionDetection": true,
    "empatheticResponses": true,
    "conflictDeescalation": true,
    "moodAdaptation": true,
    "emotionInfluence": 0.7
  },
  "memory": {
    "shortTermEnabled": true,
    "shortTermTTL": 3600,
    "mediumTermEnabled": true,
    "mediumTermRetentionDays": 7,
    "longTermEnabled": false,
    "longTermRetentionDays": 30,
    "vectorSearchEnabled": false,
    "vectorSimilarityThreshold": 0.7
  },
  "multilingual": {
    "enabled": false,
    "defaultLanguage": "en",
    "autoDetectLanguage": false,
    "supportedLanguages": ["en"]
  },
  "safety": {
    "enabled": true,
    "contentFiltering": true,
    "moderationLevel": "moderate",
    "blockHarmfulContent": true,
    "blockPersonalInfo": true,
    "emergencyStop": true,
    "emergencyStopPhrases": ["stop", "emergency stop", "halt", "abort"],
    "maxResponseLength": 2000
  },
  "rateLimiting": {
    "enabled": true,
    "messagesPerMinute": 10,
    "messagesPerHour": 100,
    "messagesPerDay": 500,
    "perUserLimit": true,
    "perChannelLimit": true,
    "cooldownPeriod": 5
  },
  "features": {
    "crossChannelAwareness": true,
    "temporalContext": true,
    "userLearning": false,
    "adaptiveResponses": true,
    "toolCalling": false,
    "codeExecution": false,
    "selfEditing": false
  }
}
```

**Note**: Environment variables override configuration file values.

## Usage Modes

### Conversational Mode

In conversational mode, the bot responds to all messages with AI-generated responses:

```env
DISCORD_CONVERSATIONAL_MODE=conversational
```

**Use Case**: General-purpose conversational assistant

**Example Interaction**:
```
User: What's the weather like today?
Bot: I don't have access to real-time weather data, but I can help you find weather information if you tell me your location!
```

### Command Mode

In command mode, the bot only responds to Discord slash commands:

```env
DISCORD_CONVERSATIONAL_MODE=command
```

**Use Case**: Command-focused bot with minimal conversational features

**Example Interaction**:
```
User: /help
Bot: Here are the available commands...
```

### Hybrid Mode

In hybrid mode, the bot responds to both commands and conversational messages:

```env
DISCORD_CONVERSATIONAL_MODE=hybrid
```

**Use Case**: Bot with both command and conversational capabilities

**Example Interaction**:
```
User: /status
Bot: Bot is online and operational.

User: How are you?
Bot: I'm doing great, thanks for asking! How can I help you today?
```

## Emotional Intelligence

### Sentiment Analysis

The bot analyzes sentiment using a rule-based approach with a comprehensive lexicon:

- **Score**: Range from -1.0 (very negative) to 1.0 (very positive)
- **Magnitude**: Strength of sentiment (0.0 to 1.0)
- **Confidence**: Confidence in the sentiment analysis (0.0 to 1.0)

**Example**:
```typescript
const sentiment = await emotionalIntelligenceEngine.analyzeSentiment("I'm so happy today!");
// Returns: { score: 0.8, magnitude: 0.8, confidence: 0.6, approach: 'rule-based' }
```

### Emotion Detection

The bot detects emotions from text using keyword matching:

- **Supported Emotions**: Joy, Sadness, Anger, Fear, Surprise, Disgust
- **Primary Emotion**: The dominant emotion detected
- **Secondary Emotion**: The second most prominent emotion (if any)
- **Emotion Scores**: Confidence scores for each detected emotion

**Example**:
```typescript
const emotion = await emotionalIntelligenceEngine.detectEmotion("I'm so excited about this!");
// Returns: { 
//   primary: 'joy', 
//   secondary: undefined, 
//   emotions: { joy: 1.0 }, 
//   confidence: 0.5 
// }
```

### Mood Inference

The bot infers overall mood from sentiment, emotion, and conversation history:

- **Supported Moods**: Happy, Neutral, Frustrated, Excited, Anxious, Calm
- **Intensity**: Strength of the mood (0.0 to 1.0)
- **Factors**: List of factors contributing to mood inference

**Example**:
```typescript
const mood = await emotionalIntelligenceEngine.inferMood("I'm feeling great today!");
// Returns: {
//   mood: 'happy',
//   intensity: 0.8,
//   confidence: 0.6,
//   factors: ['positive sentiment']
// }
```

### Conflict Detection

The bot detects conflict situations using:

- **Aggression Indicators**: Hostile language, insults, threats
- **Escalation Patterns**: Repeated negative sentiment, dismissive language
- **Hostility Indicators**: Commands to leave, shut up, etc.
- **Severity Levels**: Low, Medium, High

**Example**:
```typescript
const conflict = await emotionalIntelligenceEngine.detectConflict("You're so stupid!");
// Returns: {
//   isConflict: true,
//   severity: 'high',
//   confidence: 0.8,
//   indicators: ['aggression', 'negative sentiment']
// }
```

### De-escalation

When conflict is detected, the bot generates de-escalation responses:

**Low Severity**:
- "I understand your perspective. Let us find a constructive way forward."
- "I hear what you are saying. How can we work together on this?"

**Medium Severity**:
- "I can see this is important to you. Let us take a step back and find common ground."
- "I understand you are upset. I want to help resolve this situation."

**High Severity**:
- "I hear that you are very upset. Let us take a moment to breathe."
- "I want to help, but let us calm down first."

## Safety & Moderation

### Content Filtering

The bot filters harmful content including:

- Violence and threats
- Hate speech and discrimination
- Self-harm and suicide
- Sexual content
- Harassment and bullying

### Moderation Levels

**Strict**: Blocks all potentially harmful content, may have false positives
**Moderate**: Balanced approach, recommended for most use cases
**Relaxed**: Minimal filtering, may allow some borderline content

### Emergency Stop

Users can trigger an emergency stop using configured phrases:

```env
DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED=true
DISCORD_CONVERSATIONAL_EMERGENCY_STOP_PHRASES=stop,emergency stop,halt,abort
```

When triggered, the bot responds:
```
Conversation stopped. If you need help, please contact an administrator.
```

### Rate Limiting

The bot enforces rate limits to prevent abuse:

- **Messages Per Minute**: Default 10
- **Messages Per Hour**: Default 100
- **Messages Per Day**: Default 500
- **Cooldown Period**: Default 5 seconds

## Memory Management

### Short-term Memory

- **Storage**: In-memory
- **TTL**: Configurable (default 3600 seconds / 1 hour)
- **Purpose**: Fast access to recent conversation history

### Medium-term Memory

- **Storage**: PostgreSQL database
- **Retention**: Configurable (default 7-30 days)
- **Purpose**: Persistent conversation history for context

### Long-term Memory

- **Storage**: Vector database (optional)
- **Retention**: Configurable (default 30 days)
- **Purpose**: Semantic search across historical conversations

### Vector Search

When enabled, the bot can perform semantic search across conversation history:

```env
# Enable vector search (requires vector database configuration)
DISCORD_CONVERSATIONAL_VECTOR_SEARCH_ENABLED=true
DISCORD_CONVERSATIONAL_VECTOR_SIMILARITY_THRESHOLD=0.7
```

## Troubleshooting

### Bot Not Responding

**Problem**: Bot is not responding to messages

**Solutions**:
1. Verify conversational mode is enabled:
   ```env
   DISCORD_CONVERSATIONAL_ENABLED=true
   ```
2. Check bot has permission to read/send messages in the channel
3. Verify AI provider API key is configured
4. Check logs for errors

### Responses Too Generic

**Problem**: Bot responses lack personality or context

**Solutions**:
1. Adjust temperature for more creativity:
   ```env
   DISCORD_CONVERSATIONAL_TEMPERATURE=0.8
   ```
2. Increase context window:
   ```env
   DISCORD_CONVERSATIONAL_CONTEXT_WINDOW=100
   ```
3. Customize system prompt in configuration file

### Emotional Intelligence Not Working

**Problem**: Bot not adapting to emotions

**Solutions**:
1. Verify emotional intelligence is enabled:
   ```env
   DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE=true
   ```
2. Adjust emotion influence:
   ```env
   DISCORD_CONVERSATIONAL_EMOTION_INFLUENCE=0.9
   ```
3. Check logs for sentiment/emotion analysis errors

### Rate Limiting Too Aggressive

**Problem**: Legitimate users being rate-limited

**Solutions**:
1. Increase rate limits:
   ```env
   DISCORD_CONVERSATIONAL_MESSAGES_PER_MINUTE=20
   DISCORD_CONVERSATIONAL_MESSAGES_PER_HOUR=200
   ```
2. Adjust cooldown period:
   ```env
   DISCORD_CONVERSATIONAL_COOLDOWN_PERIOD=3
   ```

### Content Filtering Too Strict

**Problem**: False positives in content filtering

**Solutions**:
1. Adjust moderation level:
   ```env
   DISCORD_CONVERSATIONAL_MODERATION_LEVEL=relaxed
   ```
2. Review and customize emergency stop phrases

### Memory Issues

**Problem**: Bot not remembering previous conversations

**Solutions**:
1. Verify database connection is working
2. Check memory retention settings:
   ```env
   DISCORD_CONVERSATIONAL_MEMORY_RETENTION_DAYS=30
   ```
3. Enable long-term memory with vector search if needed

## API Reference

### DiscordConversationHandler

Main handler for processing Discord messages in conversational mode.

**Location**: [`src/discord/conversation/DiscordConversationHandler.ts`](../src/discord/conversation/DiscordConversationHandler.ts:1)

#### Methods

##### `processMessage(message: DiscordMessage): Promise<ConversationResponse>`

Process a Discord message through the conversational pipeline.

**Parameters**:
- `message`: Discord message object

**Returns**: Conversation response object

**Example**:
```typescript
const response = await conversationHandler.processMessage({
  id: 'msg_123',
  content: 'Hello!',
  author: { id: 'user_456', username: 'User', discriminator: '1234' },
  channelId: 'channel_789',
  timestamp: new Date()
});
```

##### `startConversation(userId: string, channelId: string, guildId?: string): Promise<string>`

Start a new conversation for a user.

**Parameters**:
- `userId`: User ID
- `channelId`: Channel ID
- `guildId`: Optional guild ID

**Returns**: Conversation ID

##### `endConversation(conversationId: string): Promise<void>`

End an active conversation.

**Parameters**:
- `conversationId`: Conversation ID to end

### EmotionalIntelligenceEngine

Engine for analyzing emotions and adapting responses.

**Location**: [`src/discord/emotional/EmotionalIntelligenceEngine.ts`](../src/discord/emotional/EmotionalIntelligenceEngine.ts:1)

#### Methods

##### `analyzeSentiment(text: string): Promise<SentimentAnalysis>`

Analyze sentiment of text.

**Parameters**:
- `text`: Text to analyze

**Returns**: Sentiment analysis object with score, magnitude, and confidence

##### `detectEmotion(text: string): Promise<EmotionDetection>`

Detect emotions in text.

**Parameters**:
- `text`: Text to analyze

**Returns**: Emotion detection object with primary emotion, secondary emotion, and confidence

##### `inferMood(text: string, history?: MessageHistoryEntry[]): Promise<MoodInference>`

Infer mood from text and conversation history.

**Parameters**:
- `text`: Text to analyze
- `history`: Optional message history

**Returns**: Mood inference object with mood, intensity, and confidence

##### `adaptResponse(response: string, emotionalContext: EmotionalContext): Promise<AdaptedResponse>`

Adapt response based on emotional context.

**Parameters**:
- `response`: Original response text
- `emotionalContext`: Emotional context object

**Returns**: Adapted response with tone and empathy level

##### `detectConflict(text: string, history?: MessageHistoryEntry[]): Promise<ConflictDetection>`

Detect conflict in text and conversation history.

**Parameters**:
- `text`: Text to analyze
- `history`: Optional message history

**Returns**: Conflict detection object with severity and indicators

##### `generateDeEscalationResponse(conflictContext: ConflictContext): Promise<string>`

Generate de-escalation response for conflict.

**Parameters**:
- `conflictContext`: Conflict context object

**Returns**: De-escalation response text

### ConversationalConfigManager

Manager for loading and managing conversational Discord configuration.

**Location**: [`src/config/conversationalConfigManager.ts`](../src/config/conversationalConfigManager.ts:1)

#### Methods

##### `getConfiguration(): ConversationalDiscordConfig`

Get full configuration object.

**Returns**: Complete conversational Discord configuration

##### `updateConfiguration(updates: Partial<ConversationalDiscordConfig>): void`

Update configuration with partial values.

**Parameters**:
- `updates`: Partial configuration object with values to update

##### `reload(): void`

Reload configuration from file and environment variables.

##### `isEnabled(): boolean`

Check if conversational Discord mode is enabled.

**Returns**: `true` if enabled, `false` otherwise

##### `getResponseChannel(): string | null`

Get configured response channel.

**Returns**: Channel name or ID, or `null` if not configured

##### `getContextWindow(): number`

Get configured context window size.

**Returns**: Number of messages in context window

### Type Definitions

#### ConversationalDiscordConfig

Main configuration interface for conversational Discord mode.

**Location**: [`src/types/conversational.ts`](../src/types/conversational.ts:141)

```typescript
interface ConversationalDiscordConfig {
  enabled: boolean;
  mode: 'conversational' | 'command' | 'hybrid';
  responseChannel: string | null;
  responseChannelType: 'same' | 'dm' | 'custom';
  contextWindow: number;
  maxTokens: number;
  temperature: number;
  personality: PersonalityProfile;
  tone: 'friendly' | 'professional' | 'casual' | 'playful';
  formality: 'formal' | 'casual' | 'adaptive';
  verbosity: 'concise' | 'detailed' | 'balanced' | 'adaptive';
  emotionalIntelligence: EmotionalIntelligenceConfig;
  memory: MemoryConfig;
  multilingual: MultilingualConfig;
  safety: SafetyConfig;
  rateLimiting: RateLimitingConfig;
  features: ConversationalFeatures;
}
```

#### EmotionalContext

Context containing emotional analysis results.

**Location**: [`src/types/conversational.ts`](../src/types/conversational.ts:98)

```typescript
interface EmotionalContext {
  sentiment: SentimentAnalysis;
  emotion: EmotionDetection;
  mood: MoodInference;
  conflict?: ConflictDetection;
}
```

#### ConversationResponse

Response object from conversation processing.

**Location**: [`src/types/conversational.ts`](../src/types/conversational.ts:109)

```typescript
interface ConversationResponse {
  content: string;
  tone: 'friendly' | 'professional' | 'casual' | 'playful' | 'adaptive';
  emotion?: string;
  metadata?: Record<string, unknown>;
}
```

## Best Practices

### 1. Start with Moderate Settings

Begin with moderate settings and adjust based on usage:

```env
DISCORD_CONVERSATIONAL_TEMPERATURE=0.7
DISCORD_CONVERSATIONAL_MODERATION_LEVEL=moderate
DISCORD_CONVERSATIONAL_EMOTION_INFLUENCE=0.7
```

### 2. Monitor Performance

Regularly check logs and metrics to identify issues:

- Response times
- Error rates
- User feedback
- Rate limit violations

### 3. Customize Personality

Tailor the bot's personality to your community:

```json
{
  "personality": {
    "systemPrompt": "You are a helpful assistant for our gaming community. You're enthusiastic about games and always ready to help with strategies and tips.",
    "defaultTone": "casual",
    "defaultFormality": "casual"
  }
}
```

### 4. Enable Safety Features

Always keep safety features enabled:

```env
DISCORD_CONVERSATIONAL_CONTENT_FILTERING=true
DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED=true
DISCORD_CONVERSATIONAL_RATE_LIMITING_ENABLED=true
```

### 5. Test Thoroughly

Test the bot in a controlled environment before deploying to production:

- Test various emotional states
- Verify conflict de-escalation
- Check rate limiting
- Validate emergency stop functionality

## Additional Resources

- [Main README](../README.md)
- [Development Guide](../src/docs/DEVELOPMENT.md)
- [API Documentation](../src/docs/API.md)
- [Contributing Guidelines](../CONTRIBUTING.md)

## Support

For issues or questions:

- [GitHub Issues](https://github.com/your-org/self-editing-discord-bot/issues)
- [Discord Community](https://discord.gg/support)
- [Email Support](support@discord-bot.example.com)
