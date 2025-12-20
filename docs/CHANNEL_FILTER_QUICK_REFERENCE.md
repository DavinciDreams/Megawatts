# Channel Filter Feature - Quick Reference

## Configuration at a Glance

### Environment Variable

```bash
# Set the primary channel for bot responses
BOT_RESPONSE_CHANNEL=megawatts
```

### Configuration Files

| Environment | File | Example |
|-------------|------|---------|
| Development | `.env` | `BOT_RESPONSE_CHANNEL=megawatts` |
| Production | `.env.production` | `BOT_RESPONSE_CHANNEL=megawatts` |

## Quick Setup

### 1. Basic Configuration

```bash
# Set environment variable
export BOT_RESPONSE_CHANNEL=megawatts

# Or add to .env file
echo "BOT_RESPONSE_CHANNEL=megawatts" >> .env
```

### 2. Advanced Configuration

```typescript
// Multiple channels by ID
const config = {
  allowedChannels: ['channel-id-1', 'channel-id-2'],
  respondToMentions: true
};

// Multiple channels by name
const config = {
  allowedChannelNames: ['megawatts', 'bot-commands'],
  respondToMentions: true
};

// Disable mention responses
const config = {
  allowedChannels: ['megawatts-channel-id'],
  respondToMentions: false
};
```

## Migration: 'katbot' → 'megawatts'

### 1. Update Environment Variables

```bash
# Old
# BOT_RESPONSE_CHANNEL=katbot

# New
BOT_RESPONSE_CHANNEL=megawatts
```

### 2. Update Docker Configuration

```yaml
# docker-compose.yml
services:
  bot:
    environment:
      - BOT_RESPONSE_CHANNEL=megawatts
```

### 3. Update Discord Server

1. Create `#megawatts` channel
2. Set bot permissions in new channel
3. Remove permissions from `#katbot` (optional)

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Bot not responding | Wrong channel name/ID | Verify `BOT_RESPONSE_CHANNEL` value |
| Bot responds everywhere | No channel restrictions | Set `allowedChannels` or `allowedChannelNames` |
| Bot responds in wrong channels | `respondToMentions` is true | Set `respondToMentions: false` or check mentions |

## Key Implementation Files

| File | Purpose |
|------|---------|
| [`src/core/processing/messageRouter.ts`](src/core/processing/messageRouter.ts) | Main routing logic |
| [`src/core/processing/types.ts`](src/core/processing/types.ts) | Configuration interfaces |
| [`src/index.ts`](src/index.ts) | Environment variable loading |
| [`src/core/processing/__tests__/messageRouter.test.ts`](src/core/processing/__tests__/messageRouter.test.ts) | Test suite |

## Testing

```bash
# Run channel filtering tests
npm test -- --testPathPattern=messageRouter

# Run comprehensive tests
node src/core/processing/test-channel-filtering-comprehensive.js
```

## Debug Commands

```bash
# Check environment variable
echo $BOT_RESPONSE_CHANNEL

# View channel filtering logs
docker logs bot-container | grep -i "channel"

# Test configuration
node -e "console.log(process.env.BOT_RESPONSE_CHANNEL)"
```

## Default Configuration

```typescript
const DEFAULT_PIPELINE_CONFIG = {
  allowedChannels: [], // Empty by default
  respondToMentions: true, // Enabled by default
  allowedChannelNames: [process.env.BOT_RESPONSE_CHANNEL || 'megawatts']
};
```

## API Quick Reference

### MessageRouter Methods

```typescript
// Route a message
router.routeMessage(message, context, intent, safety)

// Add custom rule
router.addRoutingRule(rule)

// Update configuration
router.updateConfig(config)
```

### Configuration Interface

```typescript
interface PipelineConfig {
  allowedChannels?: string[];        // Channel IDs
  respondToMentions?: boolean;       // Mention detection
  allowedChannelNames?: string[];     // Channel names
}
```

## Migration Checklist

- [ ] Update `BOT_RESPONSE_CHANNEL` environment variable
- [ ] Update Docker/Kubernetes configuration
- [ ] Create new Discord channel
- [ ] Set bot permissions in new channel
- [ ] Update any hardcoded channel references
- [ ] Update tests
- [ ] Deploy changes
- [ ] Verify bot responds in new channel
- [ ] Verify bot doesn't respond in old channel
- [ ] Clean up old configuration (optional)

## Support

For detailed information, see [Channel Filter Guide](./CHANNEL_FILTER_GUIDE.md).