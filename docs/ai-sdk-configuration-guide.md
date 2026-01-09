# AI SDK Configuration Guide

This guide explains how to configure and enable the AI SDK features in the Megawatts Discord bot.

## Overview

The AI SDK integration provides a hybrid approach that combines Vercel AI SDK primitives with the existing custom tool calling infrastructure. This allows for gradual rollout and monitoring of new features.

## Feature Flags

The AI SDK can be enabled through feature flags that control which parts of the system use the AI SDK:

| Feature Flag | Environment Variable | Description | Default |
|-------------|---------------------|-------------|----------|
| `useAISDK` | `USE_AI_SDK` | Main flag to enable AI SDK integration | `false` |
| `useAISDKForValidation` | `USE_AI_SDK_FOR_VALIDATION` | Use AI SDK (Zod) for parameter validation | `false` |
| `useAISDKForExecution` | `USE_AI_SDK_FOR_EXECUTION` | Use AI SDK for tool execution | `false` |
| `useAISDKForProviders` | `USE_AI_SDK_FOR_PROVIDERS` | Use AI SDK for provider creation | `false` |
| `useAISDKForStreaming` | `USE_AI_SDK_FOR_STREAMING` | Use AI SDK for streaming responses | `false` |

## Configuration Methods

### 1. Environment Variables (Recommended)

Add the following to your `.env` file:

```bash
# AI SDK Configuration
# Main flag to enable AI SDK
USE_AI_SDK=true

# Use AI SDK for parameter validation (Zod schemas)
USE_AI_SDK_FOR_VALIDATION=true

# Use AI SDK for tool execution
# WARNING: Start with false for safety during gradual rollout
USE_AI_SDK_FOR_EXECUTION=false

# Use AI SDK for provider creation
USE_AI_SDK_FOR_PROVIDERS=true

# Use AI SDK for streaming responses
USE_AI_SDK_FOR_STREAMING=false
```

### 2. Configuration File

Create a `ai-sdk.config.json` file in your project root:

```json
{
  "features": {
    "useAISDK": true,
    "useAISDKForValidation": true,
    "useAISDKForExecution": false,
    "useAISDKForProviders": true,
    "useAISDKForStreaming": false
  },
  "enableMultiStep": false,
  "enableStreaming": false
}
```

## Gradual Rollout Strategy

For safe deployment, follow this gradual rollout approach:

### Phase 1: Validation Only (Recommended Starting Point)

Enable AI SDK for parameter validation first. This is the safest option as it only affects validation logic:

```bash
USE_AI_SDK=true
USE_AI_SDK_FOR_VALIDATION=true
USE_AI_SDK_FOR_EXECUTION=false
USE_AI_SDK_FOR_PROVIDERS=false
USE_AI_SDK_FOR_STREAMING=false
```

**Benefits:**
- Improved parameter validation with Zod schemas
- Better error messages
- No changes to execution behavior
- Easy to rollback if issues occur

### Phase 2: Provider Creation

After validation is working well, enable AI SDK for provider creation:

```bash
USE_AI_SDK=true
USE_AI_SDK_FOR_VALIDATION=true
USE_AI_SDK_FOR_EXECUTION=false
USE_AI_SDK_FOR_PROVIDERS=true
USE_AI_SDK_FOR_STREAMING=false
```

**Benefits:**
- Uses AI SDK's provider factory for creating AI instances
- Consistent provider management
- Better error handling for provider initialization

### Phase 3: Tool Execution (Advanced)

Only enable this after thorough testing in development/staging:

```bash
USE_AI_SDK=true
USE_AI_SDK_FOR_VALIDATION=true
USE_AI_SDK_FOR_EXECUTION=true
USE_AI_SDK_FOR_PROVIDERS=true
USE_AI_SDK_FOR_STREAMING=false
```

**Benefits:**
- Uses AI SDK's tool execution engine
- Better tool call handling
- Improved performance for complex tool workflows

**Caution:**
- This is the most significant change
- Monitor closely for any behavioral changes
- Have rollback plan ready

### Phase 4: Streaming (Optional)

Enable streaming support if needed for real-time responses:

```bash
USE_AI_SDK=true
USE_AI_SDK_FOR_VALIDATION=true
USE_AI_SDK_FOR_EXECUTION=true
USE_AI_SDK_FOR_PROVIDERS=true
USE_AI_SDK_FOR_STREAMING=true
```

**Benefits:**
- Real-time streaming responses
- Better user experience for long responses
- Reduced perceived latency

## Feature Flag Details

### `useAISDK`

**Main master flag** that enables AI SDK integration. When `false`, all other flags are forced to `false` for safety.

**When to enable:**
- When you want to start using AI SDK features
- Required for any other AI SDK flags to take effect

**When to keep disabled:**
- During initial deployment (backward compatibility)
- If you encounter issues and need quick rollback

### `useAISDKForValidation`

Enables use of Zod schemas from AI SDK for validating tool parameters.

**Benefits:**
- Type-safe parameter validation
- Better error messages with detailed validation errors
- Automatic schema generation from tool definitions

**Impact:**
- Only affects validation logic
- No changes to execution behavior
- Safe to enable first

### `useAISDKForExecution`

Enables use of AI SDK's tool execution engine.

**Benefits:**
- Optimized tool call handling
- Better support for multi-step tool workflows
- Improved error recovery

**Impact:**
- Changes how tools are executed
- May affect tool call behavior
- **Start with false for safety**

### `useAISDKForProviders`

Enables use of AI SDK's provider factory for creating AI provider instances.

**Benefits:**
- Consistent provider creation
- Better provider initialization
- Improved provider error handling

**Impact:**
- Changes how AI providers are created
- Affects all AI interactions
- Safe to enable after validation works

### `useAISDKForStreaming`

Enables streaming support for AI responses.

**Benefits:**
- Real-time response streaming
- Better user experience for long responses
- Reduced perceived latency

**Impact:**
- Changes response delivery mechanism
- Requires streaming-compatible infrastructure
- Optional feature

## Configuration Priority

Configuration is loaded in this priority order:

1. **Default values** (all flags default to `false`)
2. **Configuration file** (`ai-sdk.config.json` if exists)
3. **Environment variables** (override file values)

This means you can:
- Set defaults in the config file
- Override specific flags with environment variables
- Easily test different configurations without editing files

## Monitoring and Debugging

### Check Current Configuration

The AI SDK configuration manager logs its state on startup:

```
[INFO] AI SDK configuration loaded from file: /path/to/ai-sdk.config.json
[INFO] AI SDK adapter initialized { useAISDK: true, useAISDKForExecution: false, ... }
```

### Verify AI SDK is Enabled

Check the logs for:

```
[INFO] AI SDK adapter initialized
```

If you see:

```
[INFO] AI SDK adapter not initialized (disabled by configuration)
```

Then AI SDK is disabled.

### Common Issues

**Issue: AI SDK features not working**

Check:
1. `USE_AI_SDK=true` is set in environment
2. No conflicting configuration in `ai-sdk.config.json`
3. Bot has been restarted after configuration changes

**Issue: Validation errors not using Zod**

Check:
1. `USE_AI_SDK_FOR_VALIDATION=true` is set
2. No errors in logs about missing AI SDK adapter
3. Tool definitions are valid

**Issue: Provider creation failing**

Check:
1. `USE_AI_SDK_FOR_PROVIDERS=true` is set
2. API keys are properly configured
3. No network issues preventing provider initialization

## Rollback Plan

If issues occur after enabling AI SDK features:

1. **Immediate Rollback:**
   ```bash
   USE_AI_SDK=false
   ```
   Restart the bot

2. **Partial Rollback:**
   Disable specific flags that are causing issues:
   ```bash
   USE_AI_SDK_FOR_EXECUTION=false
   ```
   Restart the bot

3. **Investigation:**
   - Check logs for error messages
   - Review which phase was most recently enabled
   - Test in development environment first

## Best Practices

1. **Start Small:** Begin with validation only, then gradually enable other features
2. **Monitor Closely:** Watch logs and metrics after each phase
3. **Test in Staging:** Always test new configurations in staging before production
4. **Document Changes:** Keep track of which flags are enabled and when
5. **Have Rollback Plan:** Know exactly which flags to disable if issues occur
6. **Use Environment Variables:** For production, prefer environment variables over config files for security
7. **Gradual Rollout:** Consider enabling features for a percentage of users/requests first

## Example Configurations

### Development Environment

```bash
# Enable all features for testing
USE_AI_SDK=true
USE_AI_SDK_FOR_VALIDATION=true
USE_AI_SDK_FOR_EXECUTION=true
USE_AI_SDK_FOR_PROVIDERS=true
USE_AI_SDK_FOR_STREAMING=true
```

### Staging Environment

```bash
# Enable validation and providers (safe middle ground)
USE_AI_SDK=true
USE_AI_SDK_FOR_VALIDATION=true
USE_AI_SDK_FOR_EXECUTION=false
USE_AI_SDK_FOR_PROVIDERS=true
USE_AI_SDK_FOR_STREAMING=false
```

### Production Environment (Initial)

```bash
# Start with validation only for safety
USE_AI_SDK=true
USE_AI_SDK_FOR_VALIDATION=true
USE_AI_SDK_FOR_EXECUTION=false
USE_AI_SDK_FOR_PROVIDERS=false
USE_AI_SDK_FOR_STREAMING=false
```

## Additional Resources

- [AI SDK Adapter Implementation](../src/ai/sdk/ai-sdk-adapter.ts)
- [Configuration Manager](../src/config/ai-sdk-config.ts)
- [Tool Registry](../src/ai/tools/tool-registry.ts)
- [Type Definitions](../src/types/ai.ts)
