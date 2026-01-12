/**
 * AI Tools Module
 *
 * This module exports all tool-related functionality including
 * tool registry, execution, sandboxing, and Discord tools.
 */

// ============================================================================
// TOOL REGISTRY EXPORTS
// ============================================================================

export {
  ToolRegistry,
  ToolRegistryConfig,
  ToolExecutorConfig,
  ToolRegistryStats,
  ToolExecutionStats,
  ToolCacheEntry,
  ToolDependencyGraph,
  ToolExecutionResult,
  ValidationError
} from './tool-registry';

// ============================================================================
// TOOL EXECUTOR EXPORTS
// ============================================================================

export {
  ToolExecutor,
  ExecutionContext,
  ExecutionLimits,
  ExecutionMetrics,
  ValidationResult,
  ExecutionHistoryEntry,
  ResourceMonitor,
  ResourceUsage
} from './tool-executor';

// ============================================================================
// TOOL SANDBOX EXPORTS
// ============================================================================

export {
  ToolSandbox,
  SandboxConfig,
  SandboxContext,
  SandboxViolation,
  SandboxResult,
  FileSystemIsolationConfig,
  NetworkIsolationConfig,
  ApiRestrictionsConfig,
  VirtualFile,
  FilePermissions,
  RateLimit
} from './tool-sandbox';

// ============================================================================
// DISCORD TOOLS EXPORTS
// ============================================================================

export {
  // Role Management Tools
  createRoleTool,
  updateRoleTool,
  deleteRoleTool,
  assignRoleTool,
  removeRoleTool,

  // Channel Management Tools
  createChannelTool,
  updateChannelTool,
  deleteChannelTool,
  getChannelInfoTool,

  // User Management Tools
  kickUserTool,
  banUserTool,
  timeoutUserTool,
  removeTimeoutTool,
  getUserInfoTool,

  // Message Management Tools
  sendMessageTool,
  editMessageTool,
  deleteMessageTool,
  getMessageTool,
  pinMessageTool,
  unpinMessageTool,

  // Server Management Tools
  getServerInfoTool,
  getServerMembersTool,
  getServerChannelsTool,

  // Webhook Management Tools
  createWebhookTool,
  updateWebhookTool,
  deleteWebhookTool,
  executeWebhookTool,

  // Tool Collection
  discordTools,
  DiscordToolExecutor
} from '../../tools/discord-tools';

// ============================================================================
// RE-EXPORT TYPES FOR CONVENIENCE
// ============================================================================

export type {
  Tool,
  ToolParameter,
  ParameterType,
  ToolCategory,
  ToolSafety,
  ToolMetadata,
  ToolExample,
  ToolCall,
  ToolError
} from '../../types/ai';
