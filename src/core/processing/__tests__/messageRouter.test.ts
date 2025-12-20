import { MessageRouter } from '../messageRouter';
import { DEFAULT_PIPELINE_CONFIG, PipelineConfig, MessageContext, MessageIntent, SafetyCheckResult, HandlerType } from '../types';

// Mock Discord.js Message object
const createMockMessage = (overrides: any = {}) => ({
  id: 'test-message-id',
  content: 'Hello world',
  author: {
    id: 'user-123',
    bot: false,
    username: 'testuser'
  },
  channel: {
    id: 'channel-123',
    name: 'general'
  },
  mentions: {
    users: new Map(),
    everyone: false
  },
  client: {
    user: {
      id: 'bot-456'
    }
  },
  ...overrides
});

// Mock MessageContext
const createMockContext = (overrides: any = {}): MessageContext => ({
  userId: 'user-123',
  guildId: 'guild-789',
  channelId: 'channel-123',
  messageId: 'test-message-id',
  timestamp: new Date(),
  ...overrides
});

// Mock MessageIntent
const createMockIntent = (overrides: any = {}): MessageIntent => ({
  type: 'conversation' as any,
  confidence: 0.8,
  entities: [],
  ...overrides
});

// Mock SafetyCheckResult
const createMockSafety = (overrides: any = {}): SafetyCheckResult => ({
  isSafe: true,
  riskLevel: 'low' as any,
  violations: [],
  confidence: 1.0,
  requiresAction: false,
  ...overrides
});

describe('MessageRouter - Channel Filtering and Mention Detection', () => {
  let router: MessageRouter;
  let config: PipelineConfig;

  beforeEach(() => {
    config = { ...DEFAULT_PIPELINE_CONFIG };
    router = new MessageRouter(config);
  });

  describe('Channel Filtering', () => {
    test('should ignore messages in non-allowed channels when respondToMentions is false', async () => {
      config.respondToMentions = false;
      config.allowedChannels = ['allowed-channel-1'];
      
      const message = createMockMessage({
        channel: { id: 'disallowed-channel', name: 'general' }
      });
      const context = createMockContext({ channelId: 'disallowed-channel' });
      const intent = createMockIntent();
      const safety = createMockSafety();

      const result = await router.routeMessage(message, context, intent, safety);
      
      expect(result.handler).toBe(HandlerType.IGNORE);
      expect(result.shouldRespond).toBe(false);
    });

    test('should allow messages in allowed channels', async () => {
      config.allowedChannels = ['allowed-channel-1'];
      
      const message = createMockMessage({
        channel: { id: 'allowed-channel-1', name: 'general' }
      });
      const context = createMockContext({ channelId: 'allowed-channel-1' });
      const intent = createMockIntent();
      const safety = createMockSafety();

      const result = await router.routeMessage(message, context, intent, safety);
      
      expect(result.handler).not.toBe(HandlerType.IGNORE);
    });

    test('should allow messages in allowed channel names', async () => {
      config.allowedChannelNames = ['katbot'];
      
      const message = createMockMessage({
        channel: { id: 'some-channel-id', name: 'katbot' }
      });
      const context = createMockContext({ channelId: 'some-channel-id' });
      const intent = createMockIntent();
      const safety = createMockSafety();

      const result = await router.routeMessage(message, context, intent, safety);
      
      expect(result.handler).not.toBe(HandlerType.IGNORE);
    });

    test('should allow all channels when no restrictions are set', async () => {
      config.allowedChannels = [];
      config.allowedChannelNames = [];
      
      const message = createMockMessage();
      const context = createMockContext();
      const intent = createMockIntent();
      const safety = createMockSafety();

      const result = await router.routeMessage(message, context, intent, safety);
      
      expect(result.handler).not.toBe(HandlerType.IGNORE);
    });
  });

  describe('Mention Detection', () => {
    test('should allow messages with bot mentions when respondToMentions is true', async () => {
      config.respondToMentions = true;
      config.allowedChannels = ['allowed-channel'];
      
      const message = createMockMessage({
        channel: { id: 'disallowed-channel', name: 'general' },
        mentions: {
          users: new Map([['bot-456', { id: 'bot-456', username: 'Katbot' }]]),
          everyone: false
        }
      });
      const context = createMockContext({ channelId: 'disallowed-channel' });
      const intent = createMockIntent();
      const safety = createMockSafety();

      const result = await router.routeMessage(message, context, intent, safety);
      
      expect(result.handler).not.toBe(HandlerType.IGNORE);
    });

    test('should ignore messages without bot mentions in disallowed channels', async () => {
      config.respondToMentions = true;
      config.allowedChannels = ['allowed-channel'];
      
      const message = createMockMessage({
        channel: { id: 'disallowed-channel', name: 'general' },
        mentions: {
          users: new Map([['other-user', { id: 'other-user', username: 'OtherUser' }]]),
          everyone: false
        }
      });
      const context = createMockContext({ channelId: 'disallowed-channel' });
      const intent = createMockIntent();
      const safety = createMockSafety();

      const result = await router.routeMessage(message, context, intent, safety);
      
      expect(result.handler).toBe(HandlerType.IGNORE);
    });

    test('should ignore messages when respondToMentions is false even with mentions', async () => {
      config.respondToMentions = false;
      config.allowedChannels = ['allowed-channel'];
      
      const message = createMockMessage({
        channel: { id: 'disallowed-channel', name: 'general' },
        mentions: {
          users: new Map([['bot-456', { id: 'bot-456', username: 'Katbot' }]]),
          everyone: false
        }
      });
      const context = createMockContext({ channelId: 'disallowed-channel' });
      const intent = createMockIntent();
      const safety = createMockSafety();

      const result = await router.routeMessage(message, context, intent, safety);
      
      expect(result.handler).toBe(HandlerType.IGNORE);
    });
  });

  describe('Edge Cases', () => {
    test('should handle DM messages (no channel name)', async () => {
      config.allowedChannelNames = ['katbot'];
      
      const message = createMockMessage({
        channel: { id: 'dm-channel' } // No name property for DM channels
      });
      const context = createMockContext({ channelId: 'dm-channel' });
      const intent = createMockIntent();
      const safety = createMockSafety();

      const result = await router.routeMessage(message, context, intent, safety);
      
      // Should be allowed since no channel restrictions by ID are set
      expect(result.handler).not.toBe(HandlerType.IGNORE);
    });

    test('should handle missing channel info gracefully', async () => {
      config.allowedChannelNames = ['katbot'];
      
      const message = createMockMessage({
        channel: null
      });
      const context = createMockContext({ channelId: 'unknown-channel' });
      const intent = createMockIntent();
      const safety = createMockSafety();

      const result = await router.routeMessage(message, context, intent, safety);
      
      // Should not crash and should handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe('Default Configuration', () => {
    test('should use default configuration values', () => {
      expect(DEFAULT_PIPELINE_CONFIG.respondToMentions).toBe(true);
      expect(DEFAULT_PIPELINE_CONFIG.allowedChannels).toEqual([]);
      expect(DEFAULT_PIPELINE_CONFIG.allowedChannelNames).toEqual(['katbot']);
    });
  });
});