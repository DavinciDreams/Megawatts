/**
 * AI SDK Adapter Tests
 *
 * Tests for the AI SDK adapter layer and hybrid integration.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AISDKAdapter, AIAdapterConfig } from '../ai-sdk-adapter';
import { ToolConverter, ConversionOptions } from '../tool-converter';
import { ProviderFactory } from '../provider-factory';
import {
  Tool,
  ToolParameter,
  ToolCategory,
  ToolSafety,
  ToolMetadata,
  ParameterType
} from '../../../types/ai';
import { Logger } from '../../../utils/logger';

// Mock logger for testing
class MockLogger extends Logger {
  constructor() {
    super();
  }
  debug(message: string, context?: any): void {
    // Silent for tests
  }
  info(message: string, context?: any): void {
    // Silent for tests
  }
  warn(message: string, context?: any): void {
    // Silent for tests
  }
  error(message: string, error?: Error, context?: any): void {
    // Silent for tests
  }
  fatal(message: string, error?: Error, context?: any): void {
    // Silent for tests
  }
}

// Mock tool for testing
const createMockTool = (name: string, parameters: ToolParameter[] = []): Tool => ({
  name,
  description: `Mock tool ${name}`,
  parameters,
  category: ToolCategory.discord,
  permissions: ['discord:read'],
  safety: {
    level: 'safe',
    permissions: ['discord:read'],
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 10000
    },
    monitoring: true,
    sandbox: false
  },
  metadata: {
    version: '1.0.0',
    author: 'test',
    tags: ['test'],
    documentation: 'Test documentation'
  }
});

describe('AI SDK Adapter', () => {
  let adapter: AISDKAdapter;
  let logger: MockLogger;
  let config: AIAdapterConfig;

  beforeEach(() => {
    logger = new MockLogger();
    config = {
      useAISDK: true,
      useAISDKForExecution: true,
      useAISDKForProviders: true,
      enableStreaming: true,
      enableMultiStep: true
    };
    adapter = new AISDKAdapter(config, logger);
  });

  describe('Configuration', () => {
    it('should initialize with provided config', () => {
      const adapterConfig = adapter.getConfig();
      expect(adapterConfig).toEqual(config);
    });

    it('should update config', () => {
      adapter.updateConfig({ useAISDK: false });
      const updatedConfig = adapter.getConfig();
      expect(updatedConfig.useAISDK).toBe(false);
      expect(updatedConfig.useAISDKForExecution).toBe(true);
      expect(updatedConfig.useAISDKForProviders).toBe(true);
    });

    it('should determine when to use AI SDK for execution', () => {
      expect(adapter.shouldUseAISDK('execution')).toBe(true);
      expect(adapter.shouldUseAISDK('providers')).toBe(true);
      expect(adapter.shouldUseAISDK('validation')).toBe(true);
    });

    it('should determine when to use AI SDK for providers', () => {
      expect(adapter.shouldUseAISDK('providers')).toBe(true);
      expect(adapter.shouldUseAISDK('validation')).toBe(true);
    });

    it('should determine when to use AI SDK for validation', () => {
      expect(adapter.shouldUseAISDK('validation')).toBe(true);
      expect(adapter.shouldUseAISDK('execution')).toBe(true);
      expect(adapter.shouldUseAISDK('providers')).toBe(true);
    });
  });

  describe('Tool Conversion', () => {
    it('should convert tools to AI SDK format', () => {
      const tool = createMockTool('testTool', [
        {
          name: 'param1',
          type: ParameterType.string,
          required: true,
          description: 'A string parameter'
        },
        {
          name: 'param2',
          type: ParameterType.number,
          required: false,
          description: 'An optional number parameter',
          validation: { min: 0, max: 100 }
        }
      ]);

      const aiSdkTools = adapter.convertToolsToAISDK([tool]);
      
      expect(aiSdkTools).toHaveLength(1);
      expect(aiSdkTools[0]).toHaveProperty('description');
      expect(aiSdkTools[0]).toHaveProperty('inputSchema');
    });

    it('should convert tools to OpenAI format', () => {
      const tool = createMockTool('testTool', [
        {
          name: 'param1',
          type: ParameterType.string,
          required: true,
          description: 'A string parameter'
        }
      ]);

      const openaiTools = adapter.convertToolsToOpenAIFormat([tool]);
      
      expect(openaiTools).toHaveLength(1);
      expect(openaiTools[0].type).toBe('function');
      expect(openaiTools[0].function).toHaveProperty('name');
      expect(openaiTools[0].function).toHaveProperty('parameters');
      expect(openaiTools[0].function).toHaveProperty('description');
    });
  });

  describe('Parameter Validation', () => {
    it('should handle parameter validation with various types', () => {
      const tool = createMockTool('testTool', [
        {
          name: 'stringParam',
          type: ParameterType.string,
          required: true,
          description: 'String parameter',
          validation: { minLength: 1, maxLength: 100 }
        },
        {
          name: 'numberParam',
          type: ParameterType.number,
          required: true,
          description: 'Number parameter',
          validation: { min: 0, max: 100 }
        },
        {
          name: 'boolParam',
          type: ParameterType.boolean,
          required: false,
          description: 'Boolean parameter'
        }
      ]);

      const result = adapter.validateToolParameters(tool, {
        stringParam: 'test',
        numberParam: 50,
        boolParam: true
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Legacy Validation Fallback', () => {
    beforeEach(() => {
      adapter.updateConfig({ useAISDK: false });
    });

    it('should use legacy validation when AI SDK is disabled', () => {
      const tool = createMockTool('testTool', [
        {
          name: 'param1',
          type: ParameterType.string,
          required: true,
          description: 'A string parameter'
        }
      ]);

      const result = adapter.validateToolParameters(tool, { param1: 'test' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required parameters', () => {
      const tool = createMockTool('testTool', [
        {
          name: 'requiredParam',
          type: ParameterType.string,
          required: true,
          description: 'Required parameter'
        }
      ]);

      const result = adapter.validateToolParameters(tool, {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Required parameter');
    });
  });

  describe('Backward Compatibility', () => {
    let adapter: AISDKAdapter;
    let logger: MockLogger;

    beforeEach(() => {
      logger = new MockLogger();
      adapter = new AISDKAdapter({
        useAISDK: false,
        useAISDKForExecution: false,
        useAISDKForProviders: false,
        enableStreaming: false,
        enableMultiStep: false
      }, logger);
    });

    it('should work with AI SDK disabled', () => {
      const tool = createMockTool('testTool', [
        {
          name: 'param1',
          type: ParameterType.string,
          required: true,
          description: 'A string parameter'
        }
      ]);

      const aiSdkTools = adapter.convertToolsToAISDK([tool]);
      
      expect(aiSdkTools).toBeDefined();
      expect(aiSdkTools).toHaveLength(1);
    });

    it('should validate parameters using legacy method', () => {
      const tool = createMockTool('testTool', [
        {
          name: 'param1',
          type: ParameterType.string,
          required: true,
          description: 'A string parameter'
        }
      ]);

      const result = adapter.validateToolParameters(tool, { param1: 'test' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Provider Factory', () => {
    let factory: ProviderFactory;
    let logger: MockLogger;

    beforeEach(() => {
      logger = new MockLogger();
      factory = new ProviderFactory({}, logger);
    });

    describe('OpenAI Provider', () => {
      it('should create OpenAI provider', () => {
        const provider = factory.createOpenAIProvider();

        expect(provider).toBeDefined();
        expect(provider.config.apiKey).toBeDefined();
        expect(provider.config.endpoint).toBeUndefined();
      });

      it('should create OpenAI provider with custom config', () => {
        factory = new ProviderFactory({
          openai: {
            apiKey: 'test-key',
            baseURL: 'https://custom.openai.com/v1'
          }
        }, logger);
        
        const provider = factory.createOpenAIProvider();

        expect(provider.config.endpoint).toBe('https://custom.openai.com/v1');
      });
    });
    });
  });
