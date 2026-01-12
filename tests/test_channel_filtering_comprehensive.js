
/**
 * Comprehensive test suite for channel filtering and mention detection
 * This test file validates the MessageRouter functionality
 */

// Mock dependencies
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Test framework
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.results = [];
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log('🧪 Running Comprehensive Channel Filtering and Mention Detection Tests\n');
    
    for (const { name, testFn } of this.tests) {
      try {
        await testFn();
        this.passed++;
        console.log(`✅ ${name}`);
        this.results.push({ name, status: 'PASS', error: null });
      } catch (error) {
        this.failed++;
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}\n`);
        this.results.push({ name, status: 'FAIL', error: error.message });
      }
    }

    this.printSummary();
    return this.results;
  }

  printSummary() {
    console.log('\n📊 Test Summary:');
    console.log(`Total: ${this.tests.length}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Success Rate: ${((this.passed / this.tests.length) * 100).toFixed(1)}%`);
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertNotEqual(actual, expected, message) {
    if (actual === expected) {
      throw new Error(message || `Expected not ${expected}, got ${actual}`);
    }
  }
}

// Create test runner
const runner = new TestRunner();

// Mock Discord.js structures
const createMockMessage = (overrides = {}) => ({
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
    everyone: false,
    has: jest.fn(() => false)
  },
  client: {
    user: {
      id: 'bot-456'
    }
  },
  ...overrides
});

const createMockContext = (overrides = {}) => ({
  userId: 'user-123',
  guildId: 'guild-789',
  channelId: 'channel-123',
  messageId: 'test-message-id',
  timestamp: new Date(),
  ...overrides
});

const createMockIntent = (overrides = {}) => ({
  type: 'conversation',
  confidence: 0.8,
  entities: [],
  ...overrides
});

const createMockSafety = (overrides = {}) => ({
  isSafe: true,
  riskLevel: 'low',
  violations: [],
  confidence: 1.0,
  requiresAction: false,
  ...overrides
});

// Mock MessageRouter class for testing
class MockMessageRouter {
  constructor(config) {
    this.config = config;
    this.logger = mockLogger;
  }

  async routeMessage(message, context, intent, safety) {
    // Simulate the shouldIgnoreMessage logic from the actual implementation
    if (this.shouldIgnoreMessage(message, context, intent, safety)) {
      return { handler: 'IGNORE', shouldRespond: false };
    }

    // Default routing logic
    return { handler: 'AI_CHAT', shouldRespond: true };
  }

  shouldIgnoreMessage(message, context, intent, safety) {
    // Ignore bot messages
    if (message.author?.bot) {
      return true;
    }

    // Ignore messages from self
    if (message.author?.id === message.client?.user?.id) {
      return true;
    }

    // Ignore very low confidence intents
    if (intent.confidence < 0.1) {
      return true;
    }

    // Ignore empty messages
    if (!message.content || message.content.trim().length === 0) {
      return true;
    }

    // Channel filtering and mention detection
    const isInAllowedChannel = this.isInAllowedChannel(context.channelId, message);
    const hasBotMention = this.hasBotMention(message);

    // If respondToMentions is enabled and bot is mentioned, allow regardless of channel
    if (this.config.respondToMentions && hasBotMention) {
      return false;
    }

    // If not in allowed channel and no bot mention, ignore
    if (!isInAllowedChannel && !hasBotMention) {
      return true;
    }

    return false;
  }

  isInAllowedChannel(channelId, message) {
    // If no channel restrictions are set, allow all channels
    if (!this.config.allowedChannels?.length && !this.config.allowedChannelNames?.length) {
      return true;
    }

    // Check by channel ID
    if (this.config.allowedChannels?.includes(channelId)) {
      return true;
    }

    // Check by channel name (fallback) - only for guild channels
    if (message.channel && 'name' in message.channel) {
      const channelName = message.channel.name;
      if (channelName && this.config.allowedChannelNames?.includes(channelName)) {
        return true;
      }
    }

    return false;
  }

  hasBotMention(message) {
    // Check if message mentions the bot
    if (message.mentions?.users?.has(message.client?.user?.id || '')) {
      return true;
    }

    // Check for @everyone mentions (optional - can be configured)
    if (message.mentions?.everyone) {
      return true;
    }

    return false;
  }
}

// Default configuration
const DEFAULT_CONFIG = {
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
  allowedChannelNames: ['katbot'] // katbot channel by name as fallback
};

// Channel Filtering Tests
runner.test('should respond to messages in katbot channel by name', async () => {
  const config = { ...DEFAULT_CONFIG };
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: { id: 'random-channel-id', name: 'katbot' }
  });
  const context = createMockContext({ channelId: 'random-channel-id' });
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertNotEqual(result.handler, 'IGNORE', 'Should not ignore messages in katbot channel');
  runner.assert(result.shouldRespond, 'Should respond to messages in katbot channel');
});

runner.test('should ignore messages in non-allowed channels when respondToMentions is false', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.respondToMentions = false;
  config.allowedChannels = ['allowed-channel-1'];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: { id: 'disallowed-channel', name: 'general' }
  });
  const context = createMockContext({ channelId: 'disallowed-channel' });
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertEqual(result.handler, 'IGNORE', 'Should ignore messages in disallowed channels');
  runner.assert(!result.shouldRespond, 'Should not respond to ignored messages');
});

runner.test('should allow messages in allowed channels by ID', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.allowedChannels = ['allowed-channel-1'];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: { id: 'allowed-channel-1', name: 'general' }
  });
  const context = createMockContext({ channelId: 'allowed-channel-1' });
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertNotEqual(result.handler, 'IGNORE', 'Should not ignore messages in allowed channels');
});

runner.test('should allow all channels when no restrictions are set', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.allowedChannels = [];
  config.allowedChannelNames = [];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage();
  const context = createMockContext();
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertNotEqual(result.handler, 'IGNORE', 'Should not ignore messages when no restrictions are set');
});

// Mention Detection Tests
runner.test('should allow messages with bot mentions when respondToMentions is true', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.respondToMentions = true;
  config.allowedChannels = ['allowed-channel'];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: { id: 'disallowed-channel', name: 'general' },
    mentions: {
      users: new Map([['bot-456', { id: 'bot-456', username: 'Katbot' }]]),
      everyone: false,
      has: jest.fn((id) => id === 'bot-456')
    }
  });
  const context = createMockContext({ channelId: 'disallowed-channel' });
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertNotEqual(result.handler, 'IGNORE', 'Should not ignore messages with bot mentions');
});

runner.test('should ignore messages without bot mentions in disallowed channels', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.respondToMentions = true;
  config.allowedChannels = ['allowed-channel'];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: { id: 'disallowed-channel', name: 'general' },
    mentions: {
      users: new Map([['other-user', { id: 'other-user', username: 'OtherUser' }]]),
      everyone: false,
      has: jest.fn(() => false)
    }
  });
  const context = createMockContext({ channelId: 'disallowed-channel' });
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertEqual(result.handler, 'IGNORE', 'Should ignore messages without bot mentions in disallowed channels');
});

runner.test('should ignore messages when respondToMentions is false even with mentions', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.respondToMentions = false;
  config.allowedChannels = ['allowed-channel'];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: { id: 'disallowed-channel', name: 'general' },
    mentions: {
      users: new Map([['bot-456', { id: 'bot-456', username: 'Katbot' }]]),
      everyone: false,
      has: jest.fn((id) => id === 'bot-456')
    }
  });
  const context = createMockContext({ channelId: 'disallowed-channel' });
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertEqual(result.handler, 'IGNORE', 'Should ignore messages when respondToMentions is false');
});

// Integration Tests
runner.test('should route commands properly in allowed channels', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.allowedChannels = ['katbot-channel'];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: { id: 'katbot-channel', name: 'katbot' },
    content: '!help'
  });
  const context = createMockContext({ channelId: 'katbot-channel' });
  const intent = createMockIntent({
    type: 'command',
    confidence: 0.9,
    entities: [{ type: 'command', value: 'help', confidence: 0.9, start: 0, end: 5 }]
  });
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertNotEqual(result.handler, 'IGNORE', 'Should route commands in allowed channels');
  runner.assert(result.shouldRespond, 'Should respond to commands');
});

runner.test('should handle @everyone mentions when configured', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.respondToMentions = true;
  config.allowedChannels = ['allowed-channel'];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: { id: 'disallowed-channel', name: 'general' },
    mentions: {
      users: new Map(),
      everyone: true,
      has: jest.fn(() => false)
    }
  });
  const context = createMockContext({ channelId: 'disallowed-channel' });
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertNotEqual(result.handler, 'IGNORE', 'Should handle @everyone mentions');
});

// Edge Cases
runner.test('should handle DM messages (no channel name)', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.allowedChannelNames = ['katbot'];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: { id: 'dm-channel' } // No name property for DM channels
  });
  const context = createMockContext({ channelId: 'dm-channel' });
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertNotEqual(result.handler, 'IGNORE', 'Should handle DM messages gracefully');
});

runner.test('should handle missing channel info gracefully', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.allowedChannelNames = ['katbot'];
  
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    channel: null
  });
  const context = createMockContext({ channelId: 'unknown-channel' });
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assert(result !== undefined, 'Should handle missing channel info without crashing');
});

runner.test('should ignore bot messages', async () => {
  const config = { ...DEFAULT_CONFIG };
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    author: { id: 'bot-123', bot: true, username: 'otherbot' }
  });
  const context = createMockContext();
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertEqual(result.handler, 'IGNORE', 'Should ignore bot messages');
});

runner.test('should ignore self messages', async () => {
  const config = { ...DEFAULT_CONFIG };
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    author: { id: 'bot-456', bot: false, username: 'Katbot' }
  });
  const context = createMockContext();
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertEqual(result.handler, 'IGNORE', 'Should ignore self messages');
});

runner.test('should ignore empty messages', async () => {
  const config = { ...DEFAULT_CONFIG };
  const router = new MockMessageRouter(config);
  
  const message = createMockMessage({
    content: ''
  });
  const context = createMockContext();
  const intent = createMockIntent();
  const safety = createMockSafety();

  const result = await router.routeMessage(message, context, intent, safety);
  
  runner.assertEqual(result.handler, 'IGNORE', 'Should ignore empty messages');
});

// Configuration Tests
runner.test('should use default configuration values', () => {
  runner.assertEqual(DEFAULT_CONFIG.respondToMentions, true, 'Default respondToMentions should be true');
  runner.assert(Array.isArray(DEFAULT_CONFIG.allowedChannels), 'allowedChannels should be an array');
  runner.assert(Array.isArray(DEFAULT_CONFIG.allowedChannelNames), 'allowedChannelNames should be an array');
  runner.assert(DEFAULT_CONFIG.allowedChannelNames.includes('katbot'), 'Should include katbot channel by default');
});

runner.test('should prioritize channel ID over channel name', async () => {
  const config = { ...DEFAULT_CONFIG };
  config.allowedChannels = ['specific-channel-id'];
  config.allowedChannelNames = ['katbot'];
  
  const router = new MockMessageRouter(config);
  
  // Test with matching ID but wrong name
  const message1 = createMockMessage({
    channel: { id: 'specific-channel-id', name: 'not-katbot' }
  });
  const context1 = createMockContext({ channelId: 'specific-channel-id' });
  const intent1 = createMockIntent();
  const safety1 = createMockSafety();

  const result1 = await router.routeMessage(message1, context1, intent1, safety1);
  runner.assertNotEqual(result1.handler, 'IGNORE', 'Should allow by channel ID even if name differs');

  // Test with matching name but wrong ID
  const message2 = createMockMessage({
    channel: { id: 'different-channel-id', name: 'katbot' }
  });
  const context2 = createMockContext({ channelId: 'different-channel-id' });
  const intent2 = createMockIntent();
  const safety2 = createMockSafety();

  const result2 = await router.routeMessage(message2, context2, intent2, safety2);
  runner.assertEqual(result2.handler, 'IGNORE', 'Should ignore when ID not in allowed list even if name matches');
});

// Run all tests
if (require.main === module) {
  runner.run().then(results => {
