/**
 * AI SDK Module
 *
 * This module provides the hybrid AI SDK integration layer.
 * It exports the adapter, provider factory, and tool converter
 * for use throughout the application.
 */

export { AISDKAdapter } from './ai-sdk-adapter';
export { ProviderFactory, CreatedProvider } from './provider-factory';
export { ToolConverter, ConversionOptions, ConversionResult } from './tool-converter';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create a new AI SDK adapter instance
 */
export function createAISDKAdapter(config: AIAdapterConfig, logger: any): AISDKAdapter {
  return new AISDKAdapter(config, logger);
}

/**
 * Create a new provider factory instance
 */
export function createProviderFactory(config: ProviderFactoryConfig, logger: any): ProviderFactory {
  return new ProviderFactory(config, logger);
}

/**
 * Create a new tool converter instance
 */
export function createToolConverter(logger: any): ToolConverter {
  return new ToolConverter(logger);
}

// Re-export types for convenience
export type {
  AISDKTool,
  AIAdapterConfig,
  CreatedProvider,
  ConversionOptions,
  ConversionResult
} from './ai-sdk-adapter';
export type {
  ProviderFactoryConfig,
  CreatedProvider
} from './provider-factory';
export type {
  ConversionOptions,
  ConversionResult
} from './tool-converter';
