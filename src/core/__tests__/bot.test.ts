/**
 * Unit tests for the main Bot class
 */

import { Bot } from '../bot';
import { Logger } from '../../utils/logger';
import { BotConfig } from '../../types';

// Mock dependencies
jest.mock('../../utils/logger');
const MockLogger = Logger as jest.MockedClass<typeof Logger>;
jest.mock('discord.js', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        login: jest.fn().mockResolvedValue('mock-token'),
        destroy: jest.fn(),
        once: jest.fn(),
        on: jest.fn(),
        user: {
          setPresence: jest.fn()
        }
      };
    }),
    GatewayIntentBits: {
      Guilds: 1,
      GuildMembers: 2,
      GuildBans: 4,
      GuildIntegrations: 16,
      GuildWebhooks: 32,
      GuildInvites: 64,
      GuildVoiceStates: 128,
      GuildPresences: 256,
      GuildMessages: 512,
      GuildMessageReactions: 1024,
      GuildMessageTyping: 2048,
      DirectMessages: 4096,
      DirectMessageReactions: 8192,
      DirectMessageTyping: 16384,
      MessageContent: 32768,
    },
    Partials: {
      User: 1,
      Channel: 2,
      Message: 3,
      Reaction: 4,
      GuildMember: 5,
      GuildScheduledEvent: 6,
    }
  };
});

describe('Bot', () => {
  let bot: Bot;
  let mockLogger: jest.Mocked<Logger>;
  let mockConfig: BotConfig;

  beforeEach(() => {
    mockLogger = new MockLogger() as jest.Mocked<Logger>;
    mockConfig = {
      token: 'test_token',
      clientId: 'test_client_id',
      guildId: 'test_guild_id',
      prefix: '!',
      intents: ['Guilds', 'GuildMessages', 'MessageContent'],
      presence: {
        status: 'online',
        activities: [
          {
            name: 'testing',
            type: 'PLAYING',
          },
        ],
      },
    };
    bot = new Bot(mockConfig, mockLogger);
  });

  describe('constructor', () => {
    it('should create a bot instance', () => {
      expect(bot).toBeInstanceOf(Bot);
    });

    it('should initialize with initializing status', () => {
      expect(bot.getStatus()).toBe('initializing');
    });
  });

  describe('start', () => {
    it('should start the bot successfully', async () => {
      await expect(bot.start()).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Starting Discord bot...');
    });

    it('should handle startup errors gracefully', async () => {
      const error = new Error('Startup failed');
      (bot.getClient().login as jest.Mock).mockRejectedValue(error);

      await expect(bot.start()).rejects.toThrow('Startup failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Unhandled error:', error);
    });
  });

  describe('stop', () => {
    it('should stop the bot successfully', async () => {
      await expect(bot.stop()).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping Discord bot...');
    });
  });

  describe('getStatus', () => {
    it('should return current bot status', () => {
      const status = bot.getStatus();
      expect(status).toBe('initializing');
    });
  });

  describe('event handling', () => {
    it('should register event handlers', () => {
      const eventNames = bot.getRegisteredEvents();
      expect(Array.isArray(eventNames)).toBe(true);
      expect(eventNames).toEqual(expect.arrayContaining(['clientReady', 'messageCreate', 'error']));
    });
  });

  describe('command handling', () => {
    it('should register command handlers', () => {
      const commandNames = bot.getRegisteredCommands();
      expect(Array.isArray(commandNames)).toBe(true);
      expect(commandNames.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle uncaught exceptions', () => {
      const error = new Error('Test error');
      bot.handleError(error);
      expect(mockLogger.error).toHaveBeenCalledWith('Unhandled error:', error);
    });

    it('should handle unhandled promise rejections', () => {
      const error = new Error('Test rejection');
      bot.handleRejection(error);
      expect(mockLogger.error).toHaveBeenCalledWith('Unhandled promise rejection:', error);
    });
  });
});
