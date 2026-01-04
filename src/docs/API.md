# API Documentation

This document describes the REST API endpoints provided by the self-editing Discord bot.

## Base URL

- **Development**: `http://localhost:8080/api/v1`
- **Staging**: `https://staging.discord-bot.example.com/api/v1`
- **Production**: `https://discord-bot.example.com/api/v1`

## Authentication

All API endpoints require authentication using Bearer tokens:

```http
Authorization: Bearer <your-api-token>
```

### Getting API Tokens

API tokens can be generated through the Discord bot using the `/api-token` command or through the admin panel.

## Response Format

All API responses follow this standard format:

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Operation completed successfully",
  "timestamp": "2023-12-15T10:30:00.000Z"
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      // Additional error details
    }
  },
  "timestamp": "2023-12-15T10:30:00.000Z"
}
```

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **Standard Limit**: 100 requests per minute
- **Burst Limit**: 200 requests per minute
- **Rate Limit Headers**:
  - `X-RateLimit-Limit`: Total requests allowed
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

## Endpoints

### Health Check

#### GET /health

Check the health status of the bot and its dependencies.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2023-12-15T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 86400,
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "discord": "healthy",
    "ai_services": "healthy"
  }
}
```

### Bot Management

#### GET /bot/status

Get the current status and configuration of the bot.

**Response**:
```json
{
  "status": "online",
  "guilds": 15,
  "users": 5000,
  "commands": 25,
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production"
}
```

#### POST /bot/restart

Restart the bot application.

**Request Body**:
```json
{
  "force": false,
  "reason": "Manual restart for updates"
}
```

#### POST /bot/shutdown

Gracefully shutdown the bot application.

**Request Body**:
```json
{
  "force": false,
  "reason": "Scheduled maintenance"
}
```

### Self-Editing Management

#### GET /self-editing/status

Get the current status of self-editing capabilities.

**Response**:
```json
{
  "enabled": true,
  "active": true,
  "last_edit": {
    "timestamp": "2023-12-15T09:00:00.000Z",
    "type": "performance_optimization",
    "success": true,
    "rollback_available": true
  },
  "statistics": {
    "total_edits": 150,
    "successful_edits": 142,
    "failed_edits": 8,
    "rollbacks": 5
  }
}
```

#### POST /self-editing/enable

Enable self-editing capabilities.

**Request Body**:
```json
{
  "enabled": true,
  "scope": ["performance", "security", "features"],
  "auto_approve": false,
  "backup_before_edit": true
}
```

#### POST /self-editing/disable

Disable self-editing capabilities.

**Request Body**:
```json
{
  "reason": "Manual intervention required",
  "emergency": false
}
```

#### GET /self-editing/history

Get the history of self-editing operations.

**Query Parameters**:
- `limit` (optional): Number of items to return (default: 50, max: 100)
- `offset` (optional): Number of items to skip (default: 0)
- `type` (optional): Filter by edit type (performance, security, features)
- `status` (optional): Filter by status (success, failed, rolled_back)

**Response**:
```json
{
  "edits": [
    {
      "id": "edit_123",
      "timestamp": "2023-12-15T09:00:00.000Z",
      "type": "performance_optimization",
      "description": "Optimized database query performance",
      "status": "success",
      "changes": {
        "files_modified": 3,
        "lines_added": 15,
        "lines_removed": 8
      },
      "rollback_available": true
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

#### POST /self-editing/rollback

Rollback to a previous version.

**Request Body**:
```json
{
  "edit_id": "edit_123",
  "reason": "Performance degradation detected",
  "force": false
}
```

### AI Configuration

#### GET /ai/config

Get current AI configuration and status.

**Response**:
```json
{
  "providers": {
    "openai": {
      "enabled": true,
      "model": "gpt-4",
      "status": "healthy",
      "quota": {
        "used": 1000,
        "limit": 10000
      }
    },
    "anthropic": {
      "enabled": true,
      "model": "claude-3",
      "status": "healthy",
      "quota": {
        "used": 500,
        "limit": 5000
      }
    }
  },
  "fallback_enabled": true,
  "current_provider": "openai"
}
```

#### PUT /ai/config

Update AI configuration.

**Request Body**:
```json
{
  "providers": {
    "openai": {
      "enabled": true,
      "model": "gpt-4",
      "api_key": "new_api_key"
    },
    "anthropic": {
      "enabled": false
    }
  },
  "fallback_enabled": true,
  "current_provider": "openai"
}
```

### Analytics

#### GET /analytics/overview

Get analytics overview for the bot.

**Query Parameters**:
- `period` (optional): Time period (1d, 7d, 30d, 90d)
- `metrics` (optional): Specific metrics to return

**Response**:
```json
{
  "period": "7d",
  "metrics": {
    "users": {
      "total": 5000,
      "active": 1200,
      "new": 150
    },
    "interactions": {
      "total": 25000,
      "commands": 8000,
      "messages": 17000
    },
    "performance": {
      "avg_response_time": 150,
      "uptime_percentage": 99.9,
      "error_rate": 0.1
    }
  }
}
```

#### GET /analytics/performance

Get detailed performance metrics.

**Query Parameters**:
- `start_date`: Start date (ISO 8601)
- `end_date`: End date (ISO 8601)
- `granularity`: Data granularity (minute, hour, day)

**Response**:
```json
{
  "time_series": [
    {
      "timestamp": "2023-12-15T09:00:00.000Z",
      "response_time": 145,
      "memory_usage": 512,
      "cpu_usage": 25.5,
      "active_connections": 45
    }
  ],
  "summary": {
    "avg_response_time": 150,
    "max_response_time": 500,
    "min_response_time": 50,
    "uptime_percentage": 99.9
  }
}
```

### Configuration Management

#### GET /config

Get current bot configuration.

**Response**:
```json
{
  "bot": {
    "name": "Self-Editing Discord Bot",
    "version": "1.0.0",
    "environment": "production"
  },
  "features": {
    "self_editing": {
      "enabled": true,
      "auto_approve": false
    },
    "analytics": {
      "enabled": true,
      "retention_days": 90
    },
    "monitoring": {
      "enabled": true,
      "alert_threshold": 0.05
    }
  },
  "limits": {
    "max_guilds": 100,
    "max_users_per_guild": 10000,
    "command_rate_limit": 60
  }
}
```

#### PUT /config

Update bot configuration.

**Request Body**:
```json
{
  "features": {
    "self_editing": {
      "enabled": true,
      "auto_approve": false
    },
    "analytics": {
      "enabled": true,
      "retention_days": 90
    }
  },
  "limits": {
    "command_rate_limit": 120
  }
}
```

### Logs

#### GET /logs

Get application logs.

**Query Parameters**:
- `level` (optional): Log level (debug, info, warn, error)
- `start_date`: Start date (ISO 8601)
- `end_date`: End date (ISO 8601)
- `limit`: Number of entries to return (max: 1000)
- `search`: Search term for log filtering

**Response**:
```json
{
  "logs": [
    {
      "timestamp": "2023-12-15T09:00:00.000Z",
      "level": "info",
      "message": "Bot started successfully",
      "context": {
        "module": "bot",
        "function": "start"
      }
    }
  ],
  "pagination": {
    "total": 1000,
    "limit": 100,
    "offset": 0,
    "has_more": true
  }
}
```

## WebSocket API

### Connection

Connect to the WebSocket API for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');
```

### Authentication

WebSocket connections require authentication:

```json
{
  "type": "auth",
  "token": "your-websocket-token"
}
```

### Events

#### bot.status

Bot status changes:

```json
{
  "type": "bot.status",
  "data": {
    "status": "online",
    "timestamp": "2023-12-15T09:00:00.000Z"
  }
}
```

#### self_editing.completed

Self-editing operation completed:

```json
{
  "type": "self_editing.completed",
  "data": {
    "edit_id": "edit_123",
    "success": true,
    "rollback_available": true
  }
}
```

#### analytics.update

Analytics data update:

```json
{
  "type": "analytics.update",
  "data": {
    "metric": "active_users",
    "value": 1250,
    "timestamp": "2023-12-15T09:00:00.000Z"
  }
}
```

## Error Codes

| Code | Description | HTTP Status |
|-------|-------------|-------------|
| `INVALID_TOKEN` | Invalid or expired authentication token | 401 |
| `INSUFFICIENT_PERMISSIONS` | User lacks required permissions | 403 |
| `RATE_LIMIT_EXCEEDED` | API rate limit exceeded | 429 |
| `BOT_OFFLINE` | Bot is currently offline | 503 |
| `SELF_EDITING_DISABLED` | Self-editing capabilities are disabled | 400 |
| `INVALID_EDIT_ID` | Invalid edit ID for rollback | 400 |
| `CONFIG_VALIDATION_ERROR` | Configuration validation failed | 400 |
| `INTERNAL_ERROR` | Internal server error | 500 |

## SDKs and Libraries

### JavaScript/TypeScript

```bash
npm install @discord-bot/sdk
```

```typescript
import { DiscordBotAPI } from '@discord-bot/sdk';

const api = new DiscordBotAPI({
  baseURL: 'https://discord-bot.example.com/api/v1',
  token: 'your-api-token'
});

const status = await api.getBotStatus();
const edits = await api.getSelfEditingHistory();
```

### Python

```bash
pip install discord-bot-sdk
```

```python
from discord_bot_sdk import DiscordBotAPI

api = DiscordBotAPI(
    base_url='https://discord-bot.example.com/api/v1',
    token='your-api-token'
)

status = api.get_bot_status()
edits = api.get_self_editing_history()
```

## Testing

### API Testing

Use the provided Postman collection or Insomnia workspace:

- **Postman Collection**: `src/docs/api/postman-collection.json`
- **Insomnia Workspace**: `src/docs/api/insomnia-workspace.json`

### Mock Server

Start a mock server for testing:

```bash
npm run api:mock
```

## Conversational Discord Mode

### GET /conversational/config

Get current conversational Discord configuration.

**Response**:
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
    "systemPrompt": "You are Megawatts, a helpful and intelligent Discord assistant."
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
    "vectorSearchEnabled": false
  },
  "multilingual": {
    "enabled": false,
    "defaultLanguage": "en",
    "autoDetectLanguage": false
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

### PUT /conversational/config

Update conversational Discord configuration.

**Request Body**:
```json
{
  "enabled": true,
  "mode": "conversational",
  "tone": "friendly",
  "temperature": 0.7,
  "contextWindow": 50,
  "emotionalIntelligence": {
    "enabled": true,
    "emotionInfluence": 0.7
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "mode": "conversational",
    "tone": "friendly",
    "temperature": 0.7,
    "contextWindow": 50
  },
  "message": "Configuration updated successfully",
  "timestamp": "2023-12-15T10:30:00.000Z"
}
```

### POST /conversational/message

Send a message to the conversational Discord mode and get a response.

**Request Body**:
```json
{
  "message": "Hello! How are you today?",
  "userId": "user_123",
  "channelId": "channel_456",
  "guildId": "guild_789",
  "conversationId": "user_123:channel_456"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "content": "I'm doing great, thanks for asking! How can I help you today?",
    "tone": "friendly",
    "emotion": "joy",
    "metadata": {
      "conversationId": "user_123:channel_456",
      "provider": "openai",
      "model": "gpt-4-turbo",
      "tokensUsed": 45,
      "processingTime": 1250,
      "emotionalAdaptations": true,
      "sentiment": {
        "score": 0.6,
        "magnitude": 0.6,
        "confidence": 0.8
      },
      "emotion": {
        "primary": "joy",
        "confidence": 0.7
      }
    }
  },
  "timestamp": "2023-12-15T10:30:00.000Z"
}
```

### POST /conversational/conversation/start

Start a new conversation.

**Request Body**:
```json
{
  "userId": "user_123",
  "channelId": "channel_456",
  "guildId": "guild_789"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "conversationId": "user_123:channel_456",
    "userId": "user_123",
    "channelId": "channel_456",
    "guildId": "guild_789",
    "createdAt": "2023-12-15T10:30:00.000Z"
  },
  "message": "Conversation started successfully",
  "timestamp": "2023-12-15T10:30:00.000Z"
}
```

### POST /conversational/conversation/end

End an active conversation.

**Request Body**:
```json
{
  "conversationId": "user_123:channel_456",
  "reason": "user_request"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "conversationId": "user_123:channel_456",
    "endedAt": "2023-12-15T10:35:00.000Z",
    "messageCount": 15,
    "duration": 300
  },
  "message": "Conversation ended successfully",
  "timestamp": "2023-12-15T10:35:00.000Z"
}
```

### GET /conversational/conversation/{conversationId}

Get conversation details and history.

**Query Parameters**:
- `limit` (optional): Number of messages to return (default: 50, max: 100)
- `offset` (optional): Number of messages to skip (default: 0)

**Response**:
```json
{
  "success": true,
  "data": {
    "conversationId": "user_123:channel_456",
    "userId": "user_123",
    "channelId": "channel_456",
    "guildId": "guild_789",
    "createdAt": "2023-12-15T10:30:00.000Z",
    "lastActive": "2023-12-15T10:35:00.000Z",
    "messageCount": 15,
    "messages": [
      {
        "role": "user",
        "content": "Hello! How are you today?",
        "timestamp": "2023-12-15T10:30:00.000Z"
      },
      {
        "role": "assistant",
        "content": "I'm doing great, thanks for asking!",
        "timestamp": "2023-12-15T10:30:01.000Z"
      }
    ],
    "emotionalContext": {
      "sentiment": {
        "score": 0.6,
        "magnitude": 0.6,
        "confidence": 0.8
      },
      "emotion": {
        "primary": "joy",
        "confidence": 0.7
      },
      "mood": {
        "mood": "happy",
        "intensity": 0.8,
        "confidence": 0.7
      }
    }
  },
  "timestamp": "2023-12-15T10:35:00.000Z"
}
```

### GET /conversational/conversations

Get all active conversations with optional filtering.

**Query Parameters**:
- `userId` (optional): Filter by user ID
- `channelId` (optional): Filter by channel ID
- `guildId` (optional): Filter by guild ID
- `status` (optional): Filter by status (active, ended)
- `limit` (optional): Number of conversations to return (default: 50, max: 100)
- `offset` (optional): Number of conversations to skip (default: 0)

**Response**:
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "conversationId": "user_123:channel_456",
        "userId": "user_123",
        "channelId": "channel_456",
        "guildId": "guild_789",
        "createdAt": "2023-12-15T10:30:00.000Z",
        "lastActive": "2023-12-15T10:35:00.000Z",
        "messageCount": 15,
        "status": "active"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 50,
      "offset": 0,
      "has_more": true
    }
  },
  "timestamp": "2023-12-15T10:35:00.000Z"
}
```

### POST /conversational/emotional/analyze

Analyze emotional content of a message.

**Request Body**:
```json
{
  "text": "I'm so happy today!",
  "history": [
    {
      "role": "user",
      "content": "How are you?",
      "timestamp": "2023-12-15T10:29:00.000Z"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "sentiment": {
      "score": 0.8,
      "magnitude": 0.8,
      "confidence": 0.6,
      "approach": "rule-based"
    },
    "emotion": {
      "primary": "joy",
      "secondary": undefined,
      "emotions": {
        "joy": 1.0
      },
      "confidence": 0.5
    },
    "mood": {
      "mood": "happy",
      "intensity": 0.8,
      "confidence": 0.6,
      "factors": ["positive sentiment"]
    },
    "conflict": {
      "isConflict": false,
      "severity": "low",
      "confidence": 0.0,
      "indicators": []
    }
  },
  "timestamp": "2023-12-15T10:30:00.000Z"
}
```

### POST /conversational/emergency/stop

Trigger emergency stop for a conversation.

**Request Body**:
```json
{
  "conversationId": "user_123:channel_456",
  "reason": "user_request",
  "phrase": "emergency stop"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "conversationId": "user_123:channel_456",
    "stoppedAt": "2023-12-15T10:35:00.000Z",
    "reason": "user_request",
    "phrase": "emergency stop"
  },
  "message": "Emergency stop triggered successfully",
  "timestamp": "2023-12-15T10:35:00.000Z"
}
```

### GET /conversational/analytics

Get analytics for conversational Discord mode.

**Query Parameters**:
- `period` (optional): Time period (1d, 7d, 30d, 90d)
- `metrics` (optional): Specific metrics to return (conversations, messages, emotions, conflicts)

**Response**:
```json
{
  "success": true,
  "data": {
    "period": "7d",
    "conversations": {
      "total": 1500,
      "active": 250,
      "ended": 1250,
      "avgDuration": 300
    },
    "messages": {
      "total": 15000,
      "userMessages": 7500,
      "botMessages": 7500,
      "avgResponseTime": 1250
    },
    "emotions": {
      "joy": 0.4,
      "neutral": 0.3,
      "sadness": 0.1,
      "anger": 0.05,
      "fear": 0.05,
      "surprise": 0.1
    },
    "conflicts": {
      "detected": 25,
      "deescalated": 20,
      "escalated": 5
    },
    "performance": {
      "avgTokensPerMessage": 45,
      "totalTokensUsed": 675000,
      "avgProcessingTime": 1250
    }
  },
  "timestamp": "2023-12-15T10:35:00.000Z"
}
```

### WebSocket Events

#### conversational.message

New message in conversation:

```json
{
  "type": "conversational.message",
  "data": {
    "conversationId": "user_123:channel_456",
    "message": {
      "role": "user",
      "content": "Hello!",
      "timestamp": "2023-12-15T10:30:00.000Z"
    }
  }
}
```

#### conversational.response

Bot response generated:

```json
{
  "type": "conversational.response",
  "data": {
    "conversationId": "user_123:channel_456",
    "response": {
      "content": "I'm doing great!",
      "tone": "friendly",
      "emotion": "joy",
      "tokensUsed": 45,
      "processingTime": 1250
    }
  }
}
```

#### conversational.emotional_analysis

Emotional analysis completed:

```json
{
  "type": "conversational.emotional_analysis",
  "data": {
    "conversationId": "user_123:channel_456",
    "emotionalContext": {
      "sentiment": {
        "score": 0.6,
        "magnitude": 0.6,
        "confidence": 0.8
      },
      "emotion": {
        "primary": "joy",
        "confidence": 0.7
      },
      "mood": {
        "mood": "happy",
        "intensity": 0.8,
        "confidence": 0.7
      }
    }
  }
}
```

#### conversational.conflict_detected

Conflict detected in conversation:

```json
{
  "type": "conversational.conflict_detected",
  "data": {
    "conversationId": "user_123:channel_456",
    "conflict": {
      "isConflict": true,
      "severity": "medium",
      "confidence": 0.8,
      "indicators": ["aggression", "negative sentiment"]
    }
  }
}
```

#### conversational.emergency_stop

Emergency stop triggered:

```json
{
  "type": "conversational.emergency_stop",
  "data": {
    "conversationId": "user_123:channel_456",
    "stoppedAt": "2023-12-15T10:35:00.000Z",
    "reason": "user_request",
    "phrase": "emergency stop"
  }
}
```

## Type Definitions

### ConversationalDiscordConfig

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

### ConversationResponse

```typescript
interface ConversationResponse {
  content: string;
  tone: 'friendly' | 'professional' | 'casual' | 'playful' | 'adaptive';
  emotion?: string;
  metadata?: Record<string, unknown>;
}
```

### EmotionalContext

```typescript
interface EmotionalContext {
  sentiment: SentimentAnalysis;
  emotion: EmotionDetection;
  mood: MoodInference;
  conflict?: ConflictDetection;
}
```

### SentimentAnalysis

```typescript
interface SentimentAnalysis {
  score: number; // -1 to 1
  magnitude: number; // 0 to 1
  confidence: number; // 0 to 1
  approach: 'rule-based' | 'ml' | 'contextual';
}
```

### EmotionDetection

```typescript
interface EmotionDetection {
  primary: string;
  secondary?: string;
  emotions: Record<string, number>;
  confidence: number;
}
```

### MoodInference

```typescript
interface MoodInference {
  mood: string;
  intensity: number; // 0 to 1
  confidence: number;
  factors: string[];
}
```

### ConflictDetection

```typescript
interface ConflictDetection {
  isConflict: boolean;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  indicators: string[];
}
```

## Changelog

### Version 1.2.0

- Added conversational Discord mode endpoints
- Implemented emotional intelligence APIs
- Added conversation management endpoints
- Added analytics for conversational features
- Added WebSocket events for real-time updates

### Version 1.0.0

- Added initial API endpoints
- Implemented authentication system
- Added self-editing management endpoints
- Added analytics and monitoring APIs

### Version 1.3.0 (Planned)

- Enhanced conversational analytics
- Added batch message processing
- Improved emotional intelligence accuracy
- Added user preference management

## Support

For API support:

- **Documentation**: [src/docs/API.md](./)
- **Issues**: [GitHub Issues](https://github.com/your-org/self-editing-discord-bot/issues)
- **Email**: api-support@discord-bot.example.com
- **Discord**: [Support Discord](https://discord.gg/support)