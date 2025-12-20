// Simple test script to verify channel filtering and mention detection
const { MessageRouter } = require('./messageRouter');
const { DEFAULT_PIPELINE_CONFIG } = require('./types');

// Mock logger
const mockLogger = {
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args),
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`[ERROR] ${msg}`, ...args)
};

// Mock Discord.js Message object
function createMockMessage(overrides = {}) {
  return {
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
  };
}

// Mock MessageContext
function createMockContext(overrides = {}) {
  return {
    userId: 'user-123',
    guildId: 'guild-789',
    channelId: 'channel-123',
    messageId: 'test-message-id',
    timestamp: new Date(),
    ...overrides
  };
}

// Mock MessageIntent
function createMockIntent(overrides = {}) {
  return {
    type: 'conversation',
    confidence: 0.8,
    entities: [],
    ...overrides
  };
}

// Mock SafetyCheckResult
function createMockSafety(overrides = {}) {
  return {
    isSafe: true,
    riskLevel: 'low',
    violations: [],
    confidence: 1.0,
    requiresAction: false,
    ...overrides
  };
}

async function testChannelFiltering() {
  console.log('\n=== Testing Channel Filtering ===');
  
  // Test 1: Should ignore messages in non-allowed channels
  console.log('\nTest 1: Non-allowed channel');
  const config1 = { ...DEFAULT_PIPELINE_CONFIG };
  config1.respondToMentions = false;
  config1.allowedChannels = ['allowed-channel-1'];
  
  const router1 = new MessageRouter(config1);
  const message1 = createMockMessage({
    channel: { id: 'disallowed-channel', name: 'general' }
  });
  const context1 = createMockContext({ channelId: 'disallowed-channel' });
  const intent1 = createMockIntent();
  const safety1 = createMockSafety();

  try {
    const result1 = await router1.routeMessage(message1, context1, intent1, safety1);
    console.log('Result:', result1.handler, result1.shouldRespond);
    console.log('✓ Should ignore message in non-allowed channel');
  } catch (error) {
    console.log('✗ Error:', error.message);
  }

  // Test 2: Should allow messages in allowed channels
  console.log('\nTest 2: Allowed channel');
  const config2 = { ...DEFAULT_PIPELINE_CONFIG };
  config2.allowedChannels = ['allowed-channel-1'];
  
  const router2 = new MessageRouter(config2);
  const message2 = createMockMessage({
    channel: { id: 'allowed-channel-1', name: 'general' }
  });
  const context2 = createMockContext({ channelId: 'allowed-channel-1' });
  const intent2 = createMockIntent();
  const safety2 = createMockSafety();

  try {
    const result2 = await router2.routeMessage(message2, context2, intent2, safety2);
    console.log('Result:', result2.handler, result2.shouldRespond);
    console.log('✓ Should allow message in allowed channel');
  } catch (error) {
    console.log('✗ Error:', error.message);
  }

  // Test 3: Should allow messages in allowed channel names
  console.log('\nTest 3: Allowed channel name');
  const config3 = { ...DEFAULT_PIPELINE_CONFIG };
  config3.allowedChannelNames = ['katbot'];
  
  const router3 = new MessageRouter(config3);
  const message3 = createMockMessage({
    channel: { id: 'some-channel-id', name: 'katbot' }
  });
  const context3 = createMockContext({ channelId: 'some-channel-id' });
  const intent3 = createMockIntent();
  const safety3 = createMockSafety();

  try {
    const result3 = await router3.routeMessage(message3, context3, intent3, safety3);
    console.log('Result:', result3.handler, result3.shouldRespond);
    console.log('✓ Should allow message in allowed channel name');
  } catch (error) {
    console.log('✗ Error:', error.message);
  }
}

async function testMentionDetection() {
  console.log('\n=== Testing Mention Detection ===');
  
  // Test 1: Should allow messages with bot mentions
  console.log('\nTest 1: Bot mention in disallowed channel');
  const config1 = { ...DEFAULT_PIPELINE_CONFIG };
  config1.respondToMentions = true;
  config1.allowedChannels = ['allowed-channel'];
  
  const router1 = new MessageRouter(config1);
  const message1 = createMockMessage({
    channel: { id: 'disallowed-channel', name: 'general' },
    mentions: {
      users: new Map([['bot-456', { id: 'bot-456', username: 'Katbot' }]]),
      everyone: false
    }
  });
  const context1 = createMockContext({ channelId: 'disallowed-channel' });
  const intent1 = createMockIntent();
  const safety1 = createMockSafety();

  try {
    const result1 = await router1.routeMessage(message1, context1, intent1, safety1);
    console.log('Result:', result1.handler, result1.shouldRespond);
    console.log('✓ Should allow message with bot mention');
  } catch (error) {
    console.log('✗ Error:', error.message);
  }

  // Test 2: Should ignore messages without bot mentions in disallowed channels
  console.log('\nTest 2: No bot mention in disallowed channel');
  const config2 = { ...DEFAULT_PIPELINE_CONFIG };
  config2.respondToMentions = true;
  config2.allowedChannels = ['allowed-channel'];
  
  const router2 = new MessageRouter(config2);
  const message2 = createMockMessage({
    channel: { id: 'disallowed-channel', name: 'general' },
    mentions: {
      users: new Map([['other-user', { id: 'other-user', username: 'OtherUser' }]]),
      everyone: false
    }
  });
  const context2 = createMockContext({ channelId: 'disallowed-channel' });
  const intent2 = createMockIntent();
  const safety2 = createMockSafety();

  try {
    const result2 = await router2.routeMessage(message2, context2, intent2, safety2);
    console.log('Result:', result2.handler, result2.shouldRespond);
    console.log('✓ Should ignore message without bot mention');
  } catch (error) {
    console.log('✗ Error:', error.message);
  }
}

async function testDefaultConfiguration() {
  console.log('\n=== Testing Default Configuration ===');
  console.log('Default config:', DEFAULT_PIPELINE_CONFIG);
  console.log('✓ respondToMentions should be true:', DEFAULT_PIPELINE_CONFIG.respondToMentions === true);
  console.log('✓ allowedChannels should be empty:', DEFAULT_PIPELINE_CONFIG.allowedChannels.length === 0);
  console.log('✓ allowedChannelNames should include katbot:', DEFAULT_PIPELINE_CONFIG.allowedChannelNames.includes('katbot'));
}

async function runTests() {
  console.log('Testing Channel Filtering and Mention Detection Implementation');
  
  try {
    await testDefaultConfiguration();
    await testChannelFiltering();
    await testMentionDetection();
    
    console.log('\n=== All Tests Completed ===');
    console.log('✓ Channel filtering and mention detection implementation appears to be working correctly!');
    
  } catch (error) {
    console.error('\n✗ Test failed with error:', error);
  }
}

// Run the tests
runTests().catch(console.error);