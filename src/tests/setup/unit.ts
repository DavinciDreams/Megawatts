/**
 * Unit test setup file
 * Configures test environment for unit tests
 */

import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Mock external dependencies
jest.mock('discord.js');
jest.mock('openai');
jest.mock('anthropic');
jest.mock('pg');
jest.mock('redis');

// Global test setup
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  
  // Mock console methods to reduce noise in tests
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
});

// Global test teardown
afterAll(() => {
  // Clean up test environment
  delete process.env.NODE_ENV;
  delete process.env.LOG_LEVEL;
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});