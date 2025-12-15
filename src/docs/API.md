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

## Changelog

### Version 1.0.0

- Added initial API endpoints
- Implemented authentication system
- Added self-editing management endpoints
- Added analytics and monitoring APIs

### Version 1.1.0 (Planned)

- Enhanced WebSocket API
- Added batch operations
- Improved error handling
- Added API versioning

## Support

For API support:

- **Documentation**: [src/docs/API.md](./)
- **Issues**: [GitHub Issues](https://github.com/your-org/self-editing-discord-bot/issues)
- **Email**: api-support@discord-bot.example.com
- **Discord**: [Support Discord](https://discord.gg/support)