/**
 * Unit tests for the main Bot class
 */

import { Bot } from '../bot';
import { Logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger');
const MockLogger = Logger as jest.MockedClass<typeof Logger>;

describe('Bot', () => {
  let bot: Bot;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = new MockLogger() as jest.Mocked<Logger>;
    bot = new Bot(mockLogger);
  });

  describe('constructor', () => {
    it('should create a bot instance with logger', () => {
      expect(bot).toBeInstanceOf(Bot);
      expect(mockLogger.info).toHaveBeenCalledWith('Bot instance created');
    });

    it('should initialize with default configuration', () => {
      expect(bot.getStatus()).toBe('initialized');
    });
  });

  describe('start', () => {
    it('should start the bot successfully', async () => {
      await expect(bot.start()).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Bot started successfully');
    });

    it('should handle startup errors gracefully', async () => {
      const error = new Error('Startup failed');
      jest.spyOn(bot, 'initialize').mockRejectedValue(error);

      await expect(bot.start()).rejects.toThrow('Startup failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Bot startup failed', error);
    });
  });

  describe('stop', () => {
    it('should stop the bot successfully', async () => {
      await expect(bot.stop()).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Bot stopped successfully');
    });

    it('should handle shutdown errors gracefully', async () => {
      const error = new Error('Shutdown failed');
      jest.spyOn(bot, 'cleanup').mockRejectedValue(error);

      await expect(bot.stop()).rejects.toThrow('Shutdown failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Bot shutdown failed', error);
    });
  });

  describe('getStatus', () => {
    it('should return current bot status', () => {
      const status = bot.getStatus();
      expect(typeof status).toBe('string');
    });
  });

  describe('event handling', () => {
    it('should register event handlers', () => {
      const eventNames = bot.getRegisteredEvents();
      expect(Array.isArray(eventNames)).toBe(true);
      expect(eventNames.length).toBeGreaterThan(0);
    });
  });

  describe('command handling', () => {
    it('should register command handlers', () => {
      const commandNames = bot.getRegisteredCommands();
      expect(Array.isArray(commandNames)).toBe(true);
      expect(commandNames.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle uncaught exceptions', () => {
      const error = new Error('Test error');
      bot.handleError(error);
      expect(mockLogger.error).toHaveBeenCalledWith('Unhandled error', error);
    });

    it('should handle unhandled promise rejections', () => {
      const error = new Error('Test rejection');
      bot.handleRejection(error);
      expect(mockLogger.error).toHaveBeenCalledWith('Unhandled promise rejection', error);
    });
  });
});