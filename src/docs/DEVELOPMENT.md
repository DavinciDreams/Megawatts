# Development Setup Guide

This guide will help you set up a complete development environment for the self-editing Discord bot.

## Prerequisites

### System Requirements

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Docker**: Version 20.0.0 or higher
- **Docker Compose**: Version 2.0.0 or higher
- **Git**: Version 2.30.0 or higher
- **PostgreSQL**: Version 15.0 or higher (for local development)
- **Redis**: Version 7.0 or higher (for local development)

### Development Tools

- **IDE**: Visual Studio Code (recommended) with these extensions:
  - TypeScript and JavaScript Language Features
  - ESLint
  - Prettier
  - Docker
  - GitLens
  - Thunder Client (for GraphQL)

- **API Client**: Postman or Insomnia for API testing
- **Database Client**: pgAdmin, DBeaver, or TablePlus

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/self-editing-discord-bot.git
cd self-editing-discord-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_GUILD_ID=your_test_guild_id

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=botuser
DB_PASSWORD=botpass
DB_NAME=discord_bot_dev

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redispass

# AI Service Configuration
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Storage Configuration
S3_BUCKET=your_s3_bucket
S3_REGION=your_s3_region
S3_ACCESS_KEY_ID=your_s3_access_key
S3_SECRET_ACCESS_KEY=your_s3_secret_key

# Development Configuration
NODE_ENV=development
LOG_LEVEL=debug
```

### 4. Start Development Environment

#### Option A: Docker Development (Recommended)

```bash
# Start all services with Docker Compose
npm run docker:dev

# Or manually
docker-compose -f docker/docker-compose.dev.yml up --build
```

This will start:
- The bot application with hot-reloading
- PostgreSQL database
- Redis cache
- Adminer (database admin UI) at http://localhost:8081
- Redis Commander (Redis admin UI) at http://localhost:8082

#### Option B: Local Development

```bash
# Start local services
npm run dev

# Or with specific configuration
npm run dev -- --env development --log-level debug
```

### 5. Verify Setup

1. **Check Application Health**:
   ```bash
   curl http://localhost:8080/health
   ```

2. **Check Database Connection**:
   ```bash
   npm run db:check
   ```

3. **Check Redis Connection**:
   ```bash
   npm run redis:check
   ```

## Development Workflow

### Daily Development

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**:
   - Write TypeScript code in `src/`
   - Follow the established patterns and conventions
   - Add tests for new functionality

3. **Run Tests**:
   ```bash
   # Run all tests
   npm run test
   
   # Run specific test types
   npm run test:unit
   npm run test:integration
   npm run test:e2e
   ```

4. **Code Quality Checks**:
   ```bash
   # Lint code
   npm run lint
   
   # Format code
   npm run format
   
   # Type check
   npm run type-check
   ```

5. **Commit Changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push and Create PR**:
   ```bash
   git push origin feature/your-feature-name
   # Create pull request on GitHub
   ```

### Testing Strategy

#### Unit Tests
- Location: `src/**/__tests__/*.test.ts`
- Run with: `npm run test:unit`
- Coverage requirement: 80% minimum

#### Integration Tests
- Location: `src/tests/integration/*.test.ts`
- Run with: `npm run test:integration`
- Test database and external service interactions

#### End-to-End Tests
- Location: `src/tests/e2e/*.test.ts`
- Run with: `npm run test:e2e`
- Test complete user workflows

#### Performance Tests
- Location: `tests/performance/*.js`
- Run with: `npm run test:performance`
- Load testing with k6

## Database Management

### Migrations

```bash
# Run pending migrations
npm run migrate -- --direction up

# Rollback migration
npm run migrate -- --direction down --version 1.0.0

# Check migration status
npm run migrate -- --direction status
```

### Database Seeding

```bash
# Seed development data
npm run db:seed

# Reset database
npm run db:reset
```

## Debugging

### VS Code Debugging

1. Install the recommended VS Code extensions
2. Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Bot",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Docker Debugging

```bash
# Attach to running container
docker exec -it discord-bot-dev /bin/sh

# View logs
docker-compose -f docker/docker-compose.dev.yml logs -f app

# Debug with Node.js inspector
docker-compose -f docker/docker-compose.dev.yml run --rm --service-ports app node --inspect=0.0.0.0:9229 dist/index.js
```

### Logging

Configure logging levels in `.env`:

```bash
LOG_LEVEL=debug    # Most verbose
LOG_LEVEL=info     # Normal operation
LOG_LEVEL=warn     # Warnings only
LOG_LEVEL=error    # Errors only
```

## Code Organization

### Project Structure

```
src/
├── ai/                    # AI and machine learning components
├── core/                   # Core bot functionality
│   ├── bot.ts            # Main bot class
│   ├── commands/          # Command handling
│   ├── events/            # Event handling
│   ├── health/            # Health checks
│   └── lifecycle/         # Lifecycle management
├── config/                 # Configuration management
├── self-editing/           # Self-editing capabilities
├── storage/                # Data storage
├── utils/                  # Utility functions
├── types/                  # TypeScript type definitions
├── scripts/                # Build and deployment scripts
├── tests/                  # Test setup and utilities
└── docs/                   # Documentation
```

### Coding Standards

1. **TypeScript**: Use strict TypeScript with proper typing
2. **ESLint**: Follow the configured linting rules
3. **Prettier**: Use the configured formatting
4. **Naming**: Use descriptive names following conventions
5. **Comments**: Document complex logic and public APIs
6. **Error Handling**: Use proper error handling patterns

## Common Issues & Solutions

### Port Conflicts

If ports are already in use:

```bash
# Find what's using the port
lsof -i :8080

# Kill the process
kill -9 <PID>

# Or use different ports in docker-compose.dev.yml
```

### Docker Issues

```bash
# Clean up Docker resources
docker system prune -f

# Rebuild containers
docker-compose -f docker/docker-compose.dev.yml up --build --force-recreate
```

### Database Connection Issues

```bash
# Check PostgreSQL status
docker-compose -f docker/docker-compose.dev.yml ps postgres

# View database logs
docker-compose -f docker/docker-compose.dev.yml logs postgres

# Reset database
docker-compose -f docker/docker-compose.dev.yml down -v
docker-compose -f docker/docker-compose.dev.yml up -d postgres
```

### Node Modules Issues

```bash
# Clean node modules
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

## Performance Tips

### Development Performance

1. **Use Hot Reloading**: Enabled by default in development
2. **Enable Source Maps**: For better debugging
3. **Use SSD**: For better I/O performance
4. **Allocate Enough Memory**: At least 4GB RAM recommended

### Build Performance

```bash
# Use build cache
npm run build -- --cached

# Parallel builds
npm run build -- --parallel

# Incremental builds
npm run build -- --incremental
```

## Contributing

### Before Contributing

1. Read the [Contributing Guide](CONTRIBUTING.md)
2. Check existing issues and pull requests
3. Discuss significant changes in an issue first

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Ensure all tests pass
6. Update documentation
7. Submit a pull request

### Code Review

All pull requests require:
- At least one approval
- Passing tests
- No linting errors
- Documentation updates for new features

## Getting Help

### Resources

- **Documentation**: [src/docs/](./)
- **API Reference**: [API.md](./API.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/self-editing-discord-bot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/self-editing-discord-bot/discussions)

### Troubleshooting

If you encounter issues:

1. Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)
2. Search existing issues
3. Create a new issue with:
   - Detailed description
   - Steps to reproduce
   - Environment details
   - Error logs
   - Expected vs actual behavior

## Advanced Features

This section documents the advanced features implemented in the bot.

### Code Modification Engine

The Code Modification Engine ([`code-modification-engine.ts`](../self-editing/modification/code-modification-engine.ts:1)) provides sophisticated autonomous code analysis and modification capabilities.

#### Overview

The engine enables the bot to:
- Analyze code using Abstract Syntax Tree (AST) parsing
- Apply targeted code modifications with precise line-level control
- Validate changes through comprehensive testing and verification
- Maintain complete modification history with rollback capabilities
- Support multiple modification types: ADD, MODIFY, DELETE, REFACTOR, OPTIMIZE, ENHANCE, FIX

#### Usage Example

```typescript
import { CodeModificationEngine } from './self-editing/modification/code-modification-engine';
import { Logger } from './utils/logger';

const logger = new Logger('CodeModification');
const engine = new CodeModificationEngine(logger);

// Define code changes
const changes = [
  {
    id: 'change_1',
    type: ModificationType.MODIFY,
    file: 'src/example.ts',
    location: {
        file: 'src/example.ts',
        line: 42,
        function: 'processData',
        class: 'DataProcessor'
    },
    originalCode: 'const result = data.map(x => x * 2);',
    newCode: 'const result = data.map(x => x * 2).filter(x => x > 0);',
    description: 'Add filter to ensure positive values'
  }
];

// Apply modification with validation
const modificationId = await engine.applyModification(changes, {
    dryRun: false,
    skipValidation: false,
    skipBackup: false,
    priority: 'high'
});

console.log(`Modification ${modificationId} completed successfully`);

// Get modification history
const history = engine.getModificationHistory(10);
console.log('Recent modifications:', history);

// Get statistics
const stats = engine.getModificationStatistics();
console.log('Modification stats:', stats);
```

#### Configuration Options

- **dryRun**: Preview changes without applying them (default: `false`)
- **skipValidation**: Skip validation checks (not recommended) (default: `false`)
- **skipBackup**: Skip creating backups (not recommended) (default: `false`)
- **force**: Force modification even if validation fails (default: `false`)
- **priority**: Modification priority level: `'low' | 'medium' | 'high' | 'critical'` (default: `'medium'`)

#### Modification Workflow

1. **Pre-modification Validation**: Static analysis and security scanning
2. **Backup Creation**: Automatic backup of files before modification
3. **Change Application**: Apply changes with line-level precision
4. **Post-modification Validation**: TypeScript compilation and verification
5. **Test Execution**: Run relevant Jest tests
6. **Verification**: Confirm changes applied correctly
7. **Rollback**: Automatic rollback on failure

#### Troubleshooting

**Issue**: Modification fails validation
- **Solution**: Check code syntax, ensure originalCode matches exactly, verify file path is correct

**Issue**: Tests fail after modification
- **Solution**: Review test files, ensure new code logic is correct, check for missing dependencies

**Issue**: Rollback fails
- **Solution**: Verify backup files exist in `.backups` directory, check file permissions

**Issue**: TypeScript compilation errors
- **Solution**: Run `npx tsc --noEmit` to identify type errors, ensure imports are correct

---

### Vector Database Integration

The Vector Database Integration ([`vectorDatabase.ts`](../storage/vector/vectorDatabase.ts:1)) provides semantic search and embedding storage capabilities.

#### Overview

Supports multiple vector database providers:
- **Qdrant** (fully implemented)
- **Pinecone** (placeholder)
- **Weaviate** (placeholder)
- **Chroma** (placeholder)
- **Milvus** (placeholder)

Features include:
- Semantic search with configurable distance metrics (cosine, euclidean, dotproduct)
- Batch embedding generation with OpenAI models
- Message embedding and storage for Discord messages
- Hybrid search combining vector and keyword matching
- Automatic caching for embeddings to reduce API calls

#### Usage Example

```typescript
import { createVectorDatabaseClient } from './storage/vector';
import { AdvancedBotConfig } from './config/advancedConfig';

const config: AdvancedBotConfig = {
    // ... other config
    storage: {
        vectorDatabase: {
            provider: 'qdrant',
            apiKey: process.env.QDRANT_API_KEY,
            cloud: {
                endpoint: process.env.QDRANT_ENDPOINT || 'http://localhost:6333'
            },
            dimension: 1536,
            metric: 'cosine'
        }
    }
};

const vectorDb = createVectorDatabaseClient(config, process.env.OPENAI_API_KEY);

// Connect to database
await vectorDb.connect();

// Create collection
await vectorDb.createCollection('messages', 1536);

// Embed and store a Discord message
await vectorDb.embedMessage('messages', {
    messageId: 'msg_123456',
    channelId: 'channel_789',
    guildId: 'guild_123',
    authorId: 'user_456',
    authorName: 'User123',
    content: 'This is a sample message',
    timestamp: new Date()
});

// Semantic search
const query = 'Find messages about AI';
const results = await vectorDb.searchMessages('messages', query, 10);

console.log('Search results:', results);

// Hybrid search
const hybridResults = await vectorDb.hybridSearch(
    'messages',
    'AI and machine learning',
    10,
    { channel: 'channel_789' },
    0.7,  // vector weight
    0.3   // keyword weight
);

console.log('Hybrid search results:', hybridResults);

// Disconnect
await vectorDb.disconnect();
```

#### Configuration Options

**VectorDatabaseConfig**:
- **provider**: `'qdrant' | 'pinecone' | 'weaviate' | 'chroma' | 'milvus'` (required)
- **apiKey**: API key for the provider (optional for local instances)
- **environment**: Environment identifier (e.g., 'production', 'development')
- **indexName**: Name of the index/collection (default: auto-generated)
- **dimension**: Vector dimension (default: 1536 for OpenAI embeddings)
- **metric**: Distance metric: `'cosine' | 'euclidean' | 'dotproduct'` (default: `'cosine'`)
- **cloud**: Cloud configuration with `region` and `endpoint`

**SearchFilter**:
- **channel**: Filter by channel ID(s)
- **author**: Filter by author ID(s)
- **startDate**: Filter messages after this date
- **endDate**: Filter messages before this date

#### Supported Embedding Models

- `text-embedding-3-small`: 1536 dimensions
- `text-embedding-3-large`: 3072 dimensions
- `text-embedding-ada-002`: 1536 dimensions

#### Troubleshooting

**Issue**: Connection fails to vector database
- **Solution**: Verify endpoint URL, check API key, ensure database is running, check network connectivity

**Issue**: Embedding generation fails
- **Solution**: Verify OpenAI API key, check API quota, ensure model name is correct

**Issue**: Search returns no results
- **Solution**: Check collection exists, verify data was inserted, try different query terms, check filter conditions

**Issue**: High API costs
- **Solution**: Enable embedding caching, use batch operations, monitor cache hit rate with `getEmbeddingCacheSize()`

---

### Safety Validation Pipeline

The Safety Validation Pipeline ([`validation-pipeline.ts`](../self-editing/safety/validation-pipeline.ts:1)) orchestrates comprehensive safety checks for self-editing operations.

#### Overview

Multi-stage validation system including:
- **Static Analysis**: Code security scanning and quality metrics
- **Security Scanning**: Vulnerability detection (SQL injection, XSS, command injection, etc.)
- **Code Quality Analysis**: Cyclomatic complexity, maintainability index, technical debt
- **Dependency Validation**: Version compatibility and vulnerability scanning
- **Impact Analysis**: Pre and post-modification impact assessment
- **Behavioral Monitoring**: Runtime behavior consistency checks

#### Usage Example

```typescript
import { ValidationPipeline } from './self-editing/safety/validation-pipeline';
import { SafetyAnalyzer } from './ai/safety/safety-analyzer';
import { SafetyValidator } from './self-editing/safety/safety-validator';
import { ImpactAnalyzer } from './self-editing/safety/impact-analyzer';
import { Logger } from './utils/logger';

const logger = new Logger('ValidationPipeline');

// Initialize components
const safetyAnalyzer = new SafetyAnalyzer({
    enabledChecks: ['toxicity', 'personal_info', 'violence', 'security'],
    strictMode: true,
    maxConcurrentAnalyses: 10,
    enableCodeSecurityAnalysis: true,
    maxCyclomaticComplexity: 15,
    minMaintainabilityIndex: 50,
    enableSecretDetection: true,
    enableDependencyScanning: true,
    securityThresholds: {
        critical: 25,
        high: 15,
        medium: 8
    }
}, logger);

const safetyValidator = new SafetyValidator({
    strictMode: true,
    requireHumanReviewForCritical: true,
    maxModificationsPerHour: 10,
    maxModificationsPerDay: 50,
    enableBehavioralMonitoring: true,
    enablePerformanceMonitoring: true
}, logger);

const impactAnalyzer = new ImpactAnalyzer({
    enablePerformanceImpact: true,
    enableBehavioralImpact: true,
    enableSecurityImpact: true,
    enableDataIntegrityImpact: true,
    performanceThresholds: {
        responseTime: { warning: 200, critical: 500 },
        throughput: { warning: 0.9, critical: 0.7 },
        errorRate: { warning: 0.05, critical: 0.1 }
    }
}, logger);

const validationPipeline = new ValidationPipeline(
    safetyAnalyzer,
    safetyValidator,
    impactAnalyzer,
    {
        safetyAnalyzer: safetyAnalyzer.config,
        safetyValidator: safetyValidator.config,
        impactAnalyzer: impactAnalyzer.config,
        enableParallelExecution: true,
        maxConcurrentValidations: 5,
        timeoutPerStage: 30000, // 30 seconds
        autoApproveSafeChanges: false,
        requireHumanReviewForCritical: true,
        approvalWorkflow: 'semi-automatic',
        approvalThresholds: {
            maxViolations: 0,
            maxWarnings: 5,
            maxCriticalIssues: 0
        }
    },
    logger
);

// Validate a modification
const modification: ModificationContext = {
    id: 'mod_123',
    filePath: 'src/example.ts',
    code: 'const result = data.map(x => x * 2);',
    newCode: 'const result = data.map(x => x * 2).filter(x => x > 0);',
    language: 'typescript',
    dependencies: [
        { name: 'lodash', version: '^4.17.0' }
    ]
};

const report = await validationPipeline.validateModification(modification);

console.log('Validation report:', report);
console.log('Overall passed:', report.overallPassed);
console.log('Can proceed:', report.canProceed);
console.log('Requires human review:', report.requiresHumanReview);
console.log('Recommended action:', report.recommendedAction);

// Get validation history
const history = validationPipeline.getValidationHistory('mod_123');
console.log('Validation history:', history);
```

#### Configuration Options

**SafetyAnalyzerConfig**:
- **enabledChecks**: Array of safety check types to enable
- **strictMode**: Enable strict validation mode (default: `false`)
- **blockThreshold**: Safety level threshold for blocking
- **maxConcurrentAnalyses**: Maximum concurrent safety analyses (default: `10`)
- **enableCodeSecurityAnalysis**: Enable static code security analysis (default: `true`)
- **maxCyclomaticComplexity**: Maximum allowed complexity (default: `15`)
- **minMaintainabilityIndex**: Minimum maintainability score (default: `50`)
- **enableSecretDetection**: Detect hardcoded secrets (default: `true`)
- **enableDependencyScanning**: Scan dependencies for vulnerabilities (default: `true`)
- **securityThresholds**: Score thresholds for security issues

**ValidationPipelineConfig**:
- **enableParallelExecution**: Run stages in parallel (default: `true`)
- **maxConcurrentValidations**: Maximum parallel validations (default: `5`)
- **timeoutPerStage**: Timeout per stage in milliseconds (default: `30000`)
- **autoApproveSafeChanges**: Auto-approve safe changes (default: `false`)
- **requireHumanReviewForCritical**: Require human review for critical (default: `true`)
- **approvalWorkflow**: `'automatic' | 'semi-automatic' | 'manual'` (default: `'semi-automatic'`)
- **approvalThresholds**: Limits for violations, warnings, and critical issues

#### Validation Stages

1. **Static Analysis**: Security vulnerability scanning
2. **Security Scanning**: Code security checks
3. **Code Quality**: Complexity and maintainability analysis
4. **Dependency Validation**: Version compatibility checks
5. **Impact Analysis**: Pre-modification impact assessment
6. **Dynamic Analysis**: Post-modification runtime validation
7. **Behavioral Consistency**: Behavior monitoring and comparison

#### Troubleshooting

**Issue**: Validation fails with no clear reason
- **Solution**: Enable debug logging, check validation logs, verify configuration is correct

**Issue**: False positives in security scanning
- **Solution**: Adjust security thresholds, add exceptions for known safe patterns, review security rules

**Issue**: Validation timeout
- **Solution**: Increase `timeoutPerStage`, optimize code complexity, reduce concurrent validations

**Issue**: Too many human reviews required
- **Solution**: Adjust `approvalWorkflow` to `'automatic'`, tune `approvalThresholds`, improve code quality

---

### Tool Execution Framework

The Tool Execution Framework ([`discord-tools.ts`](../tools/discord-tools.ts:1)) provides an extensible system for executing Discord-specific operations.

#### Overview

Comprehensive Discord tool library including:
- **Role Management**: Create, update, delete, assign, and remove roles
- **Channel Management**: Create, update, delete channels, get channel info
- **User Management**: Kick, ban, timeout users, get user info
- **Message Management**: Send, edit, delete, pin/unpin messages
- **Server Management**: Get server info, members, and channels
- **Webhook Management**: Create, update, delete, and execute webhooks

Each tool includes:
- Parameter validation with type checking
- Safety level classification (safe, restricted, dangerous)
- Permission requirements
- Rate limiting
- Usage examples

#### Usage Example

```typescript
import { DiscordToolExecutor, discordTools } from './tools/discord-tools';
import { Logger } from './utils/logger';

const logger = new Logger('DiscordTools');
const executor = new DiscordToolExecutor(logger);

// Set Discord client (injected from main bot)
executor.setClient(discordClient);

// List available tools
console.log('Available tools:', discordTools.map(t => t.name));

// Execute a tool
const result = await executor.execute('create_role', {
    guild_id: '123456789012345678',
    name: 'Moderator',
    description: 'Server moderation team',
    color: '#00FF00',
    permissions: ['KICK_MEMBERS', 'BAN_MEMBERS', 'MANAGE_MESSAGES'],
    hoist: true,
    mentionable: true
});

console.log('Tool execution result:', result);

// Execute multiple tools
const results = await Promise.all([
    executor.execute('assign_role', {
        guild_id: '123456789012345678',
        user_id: '987654321098765432',
        role_id: '111222333444555666',
        reason: 'User reached VIP status'
    }),
    executor.execute('send_message', {
        channel_id: '123456789012345678',
        content: 'Welcome to the server!',
        embed: {
            title: 'Welcome',
            color: '#00FF00',
            description: 'Please read our community guidelines.'
        }
    })
]);

console.log('Batch execution results:', results);
```

#### Tool Categories

**Role Management**:
- `create_role`: Create new role with permissions
- `update_role`: Update existing role
- `delete_role`: Delete a role
- `assign_role`: Assign role to user
- `remove_role`: Remove role from user

**Channel Management**:
- `create_channel`: Create text/voice/category channel
- `update_channel`: Update channel settings
- `delete_channel`: Delete a channel
- `get_channel_info`: Get channel information

**User Management**:
- `kick_user`: Kick user from server
- `ban_user`: Ban user from server
- `timeout_user`: Timeout user for specified duration
- `remove_timeout`: Remove timeout from user
- `get_user_info`: Get user information

**Message Management**:
- `send_message`: Send message to channel
- `edit_message`: Edit existing message
- `delete_message`: Delete message
- `get_message`: Get message by ID
- `pin_message`: Pin message
- `unpin_message`: Unpin message

**Server Management**:
- `get_server_info`: Get server information
- `get_server_members`: Get server members
- `get_server_channels`: Get server channels

**Webhook Management**:
- `create_webhook`: Create webhook for channel
- `update_webhook`: Update existing webhook
- `delete_webhook`: Delete webhook
- `execute_webhook`: Execute webhook to send message

#### Safety Levels

- **safe**: Read-only operations, no side effects
- **restricted**: Operations requiring permissions, monitored
- **dangerous**: Destructive operations (delete, ban, kick), heavily monitored

#### Rate Limits

Tools include built-in rate limiting (requests per minute):
- Safe operations: 60 requests/minute
- Restricted operations: 10-20 requests/minute
- Dangerous operations: 3-5 requests/minute

#### Troubleshooting

**Issue**: Tool execution fails with permission error
- **Solution**: Verify bot has required permissions, check role hierarchy, ensure bot is in server

**Issue**: Tool returns "Unknown Discord tool"
- **Solution**: Verify tool name is correct, check tool is registered, ensure executor is initialized

**Issue**: Rate limit exceeded
- **Solution**: Reduce request frequency, implement retry logic, check rate limit configuration

**Issue**: Webhook execution fails
- **Solution**: Verify webhook URL is correct, check webhook token, ensure webhook exists

---

### Plugin Loading System

The Plugin Loading System ([`plugin-loader.ts`](../self-editing/plugins/plugin-loader.ts:1)) provides dynamic plugin discovery, loading, validation, and hot-reloading.

#### Overview

Comprehensive plugin system featuring:
- **Dynamic Discovery**: Auto-discover plugins from filesystem
- **Multi-Source Loading**: Load from file, URL, or package
- **Validation**: Manifest validation, security scanning, dependency resolution
- **Version Compatibility**: Semantic version checking and constraint validation
- **Hot-Reloading**: Watch for changes and auto-reload plugins
- **Dependency Resolution**: Topological sort for load order
- **Security Scanning**: Detect dangerous patterns in plugin code
- **Sandboxing**: Isolated plugin execution environment

#### Usage Example

```typescript
import { PluginLoader } from './self-editing/plugins/plugin-loader';
import { Logger } from './utils/logger';

const logger = new Logger('PluginLoader');

// Initialize plugin loader with hot-reload
const pluginLoader = new PluginLoader(
    logger,
    './plugins',  // plugin directory
    {
        enabled: true,
        watchPaths: ['./plugins'],
        debounceMs: 500,
        reloadOnFileChange: true
    }
);

// Discover plugins
const { discovered, failed } = await pluginLoader.discoverPlugins();

console.log(`Discovered ${discovered.length} plugins`);
console.log('Failed discoveries:', failed);

// Load a plugin from file
const loadResult = await pluginLoader.loadFromSource('./plugins/my-plugin', 'file');

if (loadResult.success) {
    console.log('Plugin loaded:', loadResult.plugin);
    console.log('Manifest:', loadResult.plugin.manifest);
} else {
    console.error('Load failed:', loadResult.error);
}

// Validate a plugin
const validation = await pluginLoader.validatePlugin(
    loadResult.plugin.manifest,
    loadResult.plugin.code
);

console.log('Validation result:', validation);
console.log('Valid:', validation.valid);
console.log('Errors:', validation.errors);
console.log('Warnings:', validation.warnings);
console.log('Security issues:', validation.securityIssues);

// Resolve dependencies
const depResult = await pluginLoader.resolveDependencies(loadResult.plugin.manifest);

console.log('Dependencies resolved:', depResult.resolved);
console.log('Missing dependencies:', depResult.missing);
console.log('Conflicts:', depResult.conflicts);
console.log('Resolution order:', depResult.resolutionOrder);

// Enable hot-reload for a plugin
await pluginLoader.enableHotReload('my-plugin-id');

// Reload a plugin
await pluginLoader.reloadPlugin('my-plugin-id');

// Get loaded plugins
const loadedPlugins = pluginLoader.getAllLoadedPlugins();
console.log('Loaded plugins:', loadedPlugins);

// Unload a plugin
await pluginLoader.unloadPlugin('my-plugin-id');

// Cleanup
await pluginLoader.cleanup();
```

#### Plugin Manifest Structure

```json
{
  "id": "my-plugin-id",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample plugin for demonstration",
  "author": "Plugin Author",
  "main": "index.js",
  "dependencies": [
    {
      "name": "another-plugin",
      "version": "^2.0.0",
      "optional": false
    }
  ],
  "peerDependencies": [
    {
      "name": "core-plugin",
      "version": ">=1.0.0",
      "optional": true
    }
  ],
  "permissions": ["read_messages", "send_messages"],
  "minMegawattsVersion": "1.0.0",
  "maxMegawattsVersion": "2.0.0",
  "keywords": ["plugin", "example"],
  "license": "MIT",
  "homepage": "https://example.com/my-plugin",
  "repository": "https://github.com/example/my-plugin"
}
```

#### Configuration Options

**HotReloadConfig**:
- **enabled**: Enable hot-reloading (default: `false`)
- **watchPaths**: Array of paths to watch (default: `[pluginDirectory]`)
- **debounceMs**: Debounce delay in milliseconds (default: `500`)
- **reloadOnFileChange**: Reload on file change (default: `true`)

#### Security Scanning

The plugin loader scans for dangerous patterns:
- `eval()` usage (critical)
- `Function()` constructor (critical)
- `child_process` usage (high)
- `fs` module usage (medium)
- `net` module usage (medium)
- `http`/`https` module usage (medium)
- `process.env` access (low)
- `__dirname`/`__filename` exposure (low)

#### Troubleshooting

**Issue**: Plugin discovery fails
- **Solution**: Check plugin directory exists, verify `plugin.json` or `package.json` is present, validate manifest structure

**Issue**: Plugin validation fails
- **Solution**: Fix manifest errors, address security issues, ensure version format is valid, resolve dependencies

**Issue**: Dependency resolution fails
- **Solution**: Install missing dependencies, resolve version conflicts, check for circular dependencies

**Issue**: Hot-reload not working
- **Solution**: Verify hot-reload is enabled, check watch paths, ensure file system events are supported

**Issue**: Plugin fails to load
- **Solution**: Verify main file exists, check exports (default or initialize), ensure no syntax errors

**Issue**: Security scan blocks valid plugin
- **Solution**: Review security issues, fix dangerous patterns, add exceptions if needed, adjust security thresholds

---

### Multi-tier Storage

The Multi-tier Storage system ([`tieredStorage.ts`](../storage/tiered/tieredStorage.ts:1)) provides intelligent data management with automatic migration between storage tiers.

#### Overview

The tiered storage system enables automatic data migration between four storage tiers based on access patterns:

- **Hot Tier**: Redis cache for frequently accessed data (<1ms access)
- **Warm Tier**: PostgreSQL for recently accessed data (<50ms access)
- **Cold Tier**: PostgreSQL with compression for historical data (<200ms access)
- **Backup Tier**: Encrypted storage for long-term archival (<500ms access)

#### Usage Example

```typescript
import { createTieredStorageSystem } from './storage/tiered';
import { PostgresConnectionManager } from './storage/database/postgres';
import { RedisConnectionManager } from './storage/database/redis';
import { DataType } from './storage/tiered';

const postgresManager = new PostgresConnectionManager(postgresConfig);
const redisManager = new RedisConnectionManager(redisConfig);

const { tieredStorage, lifecycleManager, policyManager } = createTieredStorageSystem(
    postgresManager,
    redisManager,
    {
        hot: { enabled: true, ttl: 3600, maxSize: 10000 },
        warm: { enabled: true, retentionDays: 90 },
        cold: { enabled: true, retentionDays: 365, compressionEnabled: true },
        backup: { enabled: true, retentionDays: 2555, schedule: '0 2 * * *' },
        migration: { enabled: true, intervalMinutes: 60, batchSize: 100 }
    }
);

await tieredStorage.initialize();
await lifecycleManager.initialize();
await policyManager.initialize();

// Store data
await tieredStorage.store('user:123', userData, DataType.USER_PROFILE);

// Retrieve data
const data = await tieredStorage.retrieve('user:123');

// Track data lifecycle
await lifecycleManager.trackData('user:123', {
    dataType: DataType.USER_PROFILE,
    accessCount: 10,
    lastAccessed: new Date()
});

// Analyze access patterns
const pattern = await lifecycleManager.analyzeAccessPattern('user:123');
console.log('Access pattern:', pattern);

// Create retention policy
const policy = await policyManager.createPolicy({
    name: 'User Data Policy',
    dataType: DataType.USER_PROFILE,
    tier: 'warm',
    maxRetentionDays: 30,
    enabled: true,
    priority: 5,
    description: 'Retention policy for user profiles'
});
```

#### Configuration Options

**TieredStorageConfig**:
- **hot**: Hot tier configuration (TTL, max size)
- **warm**: Warm tier configuration (retention days)
- **cold**: Cold tier configuration (retention days, compression)
- **backup**: Backup tier configuration (retention days, schedule)
- **migration**: Migration configuration (enabled, interval, batch size)

**DataType**:
- `USER_PROFILE` - User profile data
- `CONVERSATION` - Conversation history
- `ANALYTICS` - Analytics data
- `CACHE` - Cache data
- `CONFIGURATION` - Configuration data

#### Troubleshooting

**Issue**: Data not migrating between tiers
- **Solution**: Check migration is enabled, verify interval settings, check logs for migration errors

**Issue**: High memory usage in hot tier
- **Solution**: Reduce hot tier TTL, decrease max size, increase migration frequency

**Issue**: Data retrieval slow
- **Solution**: Check which tier data is in, optimize access patterns, consider increasing cache size

---

### Monitoring and Metrics

The Monitoring and Metrics system ([`metricsCollector.ts`](../monitoring/metricsCollector.ts:1)) provides comprehensive observability with Prometheus-based metrics, health monitoring, anomaly detection, and alert management.

#### Overview

Comprehensive monitoring solution including:
- **Metrics Collection**: Prometheus-based metrics for performance, application, business, database, API, and error tracking
- **Health Monitoring**: Component and dependency health checks with recovery actions
- **Anomaly Detection**: Statistical and ML-based anomaly detection with baseline learning
- **Alert Management**: Rules-based alerting with multiple notification channels (Email, Slack, Discord, PagerDuty, Webhook)

#### Usage Example

```typescript
import { createMonitoringSystem, startMonitoringSystem } from './monitoring';

const monitoring = createMonitoringSystem({
    metrics: {
        enabled: true,
        interval: 60000,
        retention: 30,
        aggregation: true,
        collectDefaultMetrics: true
    },
    health: {
        enabled: true,
        checkInterval: 30000,
        alertThreshold: 0.7,
        metricsRetention: 10080,
        recoveryEnabled: true,
        recoveryAttempts: 3,
        recoveryDelay: 5000
    },
    anomaly: {
        enabled: true,
        baselineWindow: 100,
        detectionThreshold: 3,
        alertThreshold: 0.8,
        mlEnabled: true,
        mlModelType: 'isolation_forest',
        statisticalEnabled: true,
        realTimeAlerting: true,
        historyRetention: 10080
    },
    alerts: {
        enabled: true,
        evaluationInterval: 60000,
        historyRetention: 10080,
        maxRetries: 3,
        retryDelay: 30000,
        defaultChannels: ['console']
    }
});

await startMonitoringSystem(monitoring);

// Record metrics
monitoring.metrics.recordCounter('requests_total', 1, { method: 'GET', endpoint: '/api/users' });
monitoring.metrics.recordGauge('active_connections', 42);
monitoring.metrics.recordHistogram('request_duration_ms', 125, { endpoint: '/api/users' });

// Check health
const health = monitoring.health.getCurrentHealth();
console.log('System health:', health);

// Detect anomalies
const anomaly = await monitoring.anomaly.detectAnomaly('cpu_usage', 85.5);
console.log('Anomaly detected:', anomaly);

// Create alert rule
await monitoring.alerts.createRule({
    name: 'High CPU Usage',
    condition: {
        metric: 'cpu_usage_percent',
        operator: '>',
        threshold: 80,
        duration: 300000 // 5 minutes
    },
    severity: 'high',
    notificationChannels: ['slack', 'discord']
});

// Get monitoring summary
const summary = await getMonitoringSummary(monitoring);
console.log('Monitoring summary:', summary);
```

#### Configuration Options

**MetricsCollectorConfig**:
- **enabled**: Enable metrics collection (default: `true`)
- **interval**: Collection interval in milliseconds (default: `60000`)
- **retention**: Data retention in days (default: `30`)
- **aggregation**: Enable metric aggregation (default: `true`)
- **collectDefaultMetrics**: Collect default system metrics (default: `true`)

**HealthMonitorConfig**:
- **enabled**: Enable health monitoring (default: `true`)
- **checkInterval**: Check interval in milliseconds (default: `30000`)
- **alertThreshold**: Health score threshold for alerts (default: `0.7`)
- **recoveryEnabled**: Enable automatic recovery (default: `true`)
- **recoveryAttempts**: Maximum recovery attempts (default: `3`)

**AnomalyDetectorConfig**:
- **enabled**: Enable anomaly detection (default: `true`)
- **baselineWindow**: Baseline window size (default: `100`)
- **detectionThreshold**: Detection threshold in standard deviations (default: `3`)
- **mlEnabled**: Enable ML-based detection (default: `true`)
- **mlModelType**: ML model type ('isolation_forest', 'one_class_svm')

**AlertManagerConfig**:
- **enabled**: Enable alert management (default: `true`)
- **evaluationInterval**: Evaluation interval in milliseconds (default: `60000`)
- **notificationChannels**: Default notification channels

#### Troubleshooting

**Issue**: Metrics not being collected
- **Solution**: Verify metrics collector is enabled, check interval settings, review logs for errors

**Issue**: Too many false positive alerts
- **Solution**: Adjust detection thresholds, increase baseline window size, fine-tune alert rules

**Issue**: Health checks failing
- **Solution**: Check component dependencies, verify health check endpoints, review recovery actions

---

### Distributed Tracing

The Distributed Tracing system ([`index.ts`](../tracing/index.ts:1)) provides end-to-end request visibility with support for multiple exporters and automatic context propagation.

#### Overview

Comprehensive distributed tracing implementation featuring:
- **Multiple Exporters**: OTLP, Jaeger, Zipkin, and Console exporters
- **Context Propagation**: Automatic trace context propagation across services
- **Instrumentation**: Built-in instrumentation for HTTP, database, Redis, and Discord API calls
- **Span Management**: Create and manage spans with attributes, events, and links
- **Sampling**: Configurable sampling rates for production efficiency

#### Usage Example

```typescript
import { initializeTracing, getTracer, tracer } from './tracing';

// Initialize tracing
await initializeTracing({
    serviceName: 'megawatts-bot',
    serviceVersion: '1.0.0',
    exporterType: 'otlp',
    endpoint: 'http://localhost:4317',
    samplingRate: 0.1,
    enableHttpInstrumentation: true,
    enableDatabaseInstrumentation: true,
    enableRedisInstrumentation: true,
    enableDiscordInstrumentation: true
});

// Get tracer instance
const tracer = getTracer();

// Create a span
const span = tracer.startSpan('process_message', {
    attributes: {
        'message.id': 'msg_123',
        'channel.id': 'channel_456'
    }
});

try {
    // Add events
    span.addEvent('processing_started');
    
    // Do work
    await processMessage();
    
    // Add more events
    span.addEvent('processing_completed');
    
    span.setStatus({ code: 0, message: 'OK' });
} catch (error) {
    span.setStatus({
        code: 2,
        message: 'ERROR',
        message: error.message
    });
    span.recordException(error);
} finally {
    tracer.endSpan(span);
}

// Use helper function
await tracer.withSpan('database_query', async (span) => {
    span.setAttribute('query.type', 'SELECT');
    span.setAttribute('table.name', 'users');
    
    const result = await database.query('SELECT * FROM users');
    
    span.setAttribute('result.count', result.length);
});

// Extract/inject context
const headers = {};
injectTraceContextToHeaders(tracer.getCurrentContext(), headers);

// Later, extract context
const context = extractTraceContextFromHeaders(headers);
tracer.setContext(context);

// Shutdown tracing
await shutdownTracing();
```

#### Configuration Options

**TracingInitOptions**:
- **serviceName**: Service name (required)
- **serviceVersion**: Service version (optional)
- **exporterType**: Exporter type ('otlp', 'jaeger', 'zipkin', 'console')
- **endpoint**: Exporter endpoint for OTLP
- **samplingRate**: Sampling rate 0.0 to 1.0 (default: `1.0`)
- **enableHttpInstrumentation**: Enable HTTP instrumentation (default: `true`)
- **enableDatabaseInstrumentation**: Enable database instrumentation (default: `true`)
- **enableRedisInstrumentation**: Enable Redis instrumentation (default: `true`)
- **enableDiscordInstrumentation**: Enable Discord API instrumentation (default: `true`)

#### Instrumentation Types

- **HTTP**: Automatic instrumentation for HTTP requests/responses
- **Database**: Automatic instrumentation for database queries
- **Redis**: Automatic instrumentation for Redis commands
- **Discord API**: Automatic instrumentation for Discord API calls

#### Troubleshooting

**Issue**: Traces not appearing in backend
- **Solution**: Verify exporter endpoint is correct, check network connectivity, ensure exporter is running

**Issue**: Too many traces collected
- **Solution**: Reduce sampling rate, adjust sampling strategy

**Issue**: Missing context in distributed traces
- **Solution**: Ensure context is properly injected/extracted, verify headers are passed correctly

---

### Self-healing Mechanisms

The Self-healing Mechanisms ([`index.ts`](../healing/index.ts:1)) provide automatic recovery from failures with multiple recovery strategies.

#### Overview

Comprehensive self-healing system featuring:
- **Service Restart Automation**: Automatic restart of failed services
- **Configuration Rollback**: Automatic rollback to previous stable configuration
- **Module Reload**: Hot-reload of modules without downtime
- **Cache Rebuild**: Automatic cache rebuilding on corruption
- **Graceful Degradation**: Reduce functionality to maintain core operations
- **Emergency Mode**: Activate minimal functionality mode
- **Circuit Breaker Pattern**: Prevent cascading failures
- **Failure Detection**: Automatic detection of component failures
- **Recovery Strategy Selection**: Intelligent selection of appropriate recovery strategy
- **Recovery Execution**: Execute recovery with verification
- **Recovery History Tracking**: Track all recovery attempts and outcomes

#### Usage Example

```typescript
import { createHealingSystem } from './healing';
import { HealthOrchestrator } from './core/health/orchestrator';

const healthOrchestrator = new HealthOrchestrator(healthConfig);

const healingSystem = await createHealingSystem({
    autoRecoveryEnabled: true,
    monitoringInterval: 30000,
    orchestratorConfig: {
        maxConcurrentRecoveries: 3,
        recoveryTimeout: 300000,
        strategySelection: 'intelligent'
    },
    circuitBreakerConfig: {
        enabled: true,
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
        halfOpenMaxCalls: 3
    },
    gracefulDegradationConfig: {
        enabled: true,
        levels: ['full', 'reduced', 'minimal', 'emergency'],
        autoActivate: true
    }
}, healthOrchestrator);

// System will automatically detect and recover from failures
// Manual recovery trigger
await healingSystem.triggerRecovery('database_service', 'restart');

// Get system status
const status = healingSystem.getSystemStatus();
console.log('Healing system status:', status);

// Get recovery history
const history = healingSystem.getRecoveryHistory(10);
console.log('Recovery history:', history);

// Get recovery analytics
const analytics = healingSystem.getRecoveryAnalytics();
console.log('Recovery analytics:', analytics);

// Stop healing system
await healingSystem.stop();
```

#### Configuration Options

**HealingSystemConfig**:
- **autoRecoveryEnabled**: Enable automatic recovery (default: `true`)
- **monitoringInterval**: Monitoring interval in milliseconds (default: `30000`)
- **orchestratorConfig**: Orchestrator configuration (max concurrent recoveries, timeout)
- **circuitBreakerConfig**: Circuit breaker configuration (failure threshold, success threshold, timeout)
- **gracefulDegradationConfig**: Graceful degradation configuration (levels, auto-activate)

#### Recovery Strategies

- **Service Restart**: Restart failed service
- **Configuration Rollback**: Rollback to previous configuration
- **Module Reload**: Hot-reload module
- **Cache Rebuild**: Rebuild corrupted cache
- **Graceful Degradation**: Reduce functionality
- **Emergency Mode**: Activate minimal functionality

#### Troubleshooting

**Issue**: Recovery not triggering
- **Solution**: Verify auto-recovery is enabled, check monitoring interval, review failure detection logic

**Issue**: Recovery failing repeatedly
- **Solution**: Review recovery strategy, check for underlying issues, consider manual intervention

**Issue**: Circuit breaker not opening
- **Solution**: Verify failure threshold is configured correctly, check failure detection logic

---

### Advanced Caching

The Advanced Caching system ([`index.ts`](../storage/cache/index.ts:1)) provides multi-level caching with intelligent warming and invalidation strategies.

#### Overview

Sophisticated caching system featuring:
- **Multi-level Cache**: L1 (memory), L2 (Redis), L3 (CDN) layers
- **Cache Warming**: Pre-populate cache with frequently accessed data
- **Predictive Pre-fetching**: ML-based prediction of future access patterns
- **Cache Invalidation**: Event-based and dependency-based invalidation
- **Eviction Policies**: LRU, LFU, FIFO, and custom policies
- **Cache Analytics**: Detailed metrics on cache performance
- **Priority Caching**: Prioritize important data

#### Usage Example

```typescript
import { createDefaultCacheSystem } from './storage/cache';
import { LRUPolicy, EvictionPolicy } from './storage/cache';

const cacheSystem = createDefaultCacheSystem({
    l1: {
        maxSize: 1000,
        ttl: 60000, // 1 minute
        policy: new LRUPolicy()
    },
    l2: {
        host: 'localhost',
        port: 6379,
        ttl: 3600000, // 1 hour
        policy: new LRUPolicy()
    },
    l3: {
        enabled: false // CDN not configured
    },
    warming: {
        enabled: true,
        schedule: '0 */5 * * *', // Every 5 minutes
        strategy: 'access_frequency'
    },
    invalidation: {
        enabled: true,
        checkInterval: 60000
    }
});

await cacheSystem.initialize();

// Set cache value
await cacheSystem.set('user:123', userData, {
    ttl: 3600000,
    priority: 'high',
    tags: ['user', 'profile']
});

// Get cache value
const data = await cacheSystem.get('user:123');
console.log('Cache hit:', data !== undefined);

// Check if value exists
const exists = await cacheSystem.has('user:123');

// Delete value
await cacheSystem.delete('user:123');

// Invalidate by tag
await cacheSystem.invalidateByTag('user');

// Get cache statistics
const stats = await cacheSystem.getStats();
console.log('Cache statistics:', stats);
console.log('Hit rate:', stats.hits / (stats.hits + stats.misses));

// Warm cache
await cacheSystem.warmCache([
    { key: 'user:123', value: userData },
    { key: 'user:456', value: userData2 }
]);

// Clear cache
await cacheSystem.clear();
```

#### Configuration Options

**MultiLevelCacheConfig**:
- **l1**: L1 (memory) cache configuration (max size, TTL, policy)
- **l2**: L2 (Redis) cache configuration (host, port, TTL, policy)
- **l3**: L3 (CDN) cache configuration (enabled, TTL, policy)
- **warming**: Cache warming configuration (enabled, schedule, strategy)
- **invalidation**: Cache invalidation configuration (enabled, check interval)

**Eviction Policies**:
- **LRU**: Least Recently Used
- **LFU**: Least Frequently Used
- **FIFO**: First In First Out
- **Custom**: Custom eviction policy

#### Cache Warming Strategies

- **Access Frequency**: Warm most frequently accessed data
- **Time-based**: Warm data based on access time patterns
- **Predictive**: ML-based prediction of future access

#### Troubleshooting

**Issue**: Low cache hit rate
- **Solution**: Adjust TTL values, review warming strategy, check cache size limits

**Issue**: Cache not warming
- **Solution**: Verify warming is enabled, check schedule configuration, review warming strategy

**Issue**: Stale data in cache
- **Solution**: Reduce TTL, enable invalidation, review invalidation rules

---

### Conversational Discord Mode

The Conversational Discord mode ([`DiscordConversationHandler.ts`](../discord/conversation/DiscordConversationHandler.ts:1)) provides intelligent, emotionally-aware conversational capabilities for Discord interactions.

#### Overview

The conversational Discord system enables the bot to:
- Engage in natural, context-aware conversations with users
- Analyze emotional state and adapt responses accordingly
- Maintain conversation history across multiple interactions
- Detect and de-escalate conflicts automatically
- Provide multilingual support with automatic language detection
- Enforce safety and moderation policies

#### Architecture

The conversational Discord architecture consists of several interconnected components:

**Core Components**:
- [`DiscordConversationHandler`](../discord/conversation/DiscordConversationHandler.ts:1): Main handler for processing Discord messages
- [`DiscordContextManager`](../discord/context/DiscordContextManager.ts:1): Manages Discord-specific context (channels, guilds, users)
- [`ConversationManager`](../ai/conversation/conversation-manager.ts:1): Handles conversation lifecycle and persistence
- [`ConversationalAIProviderRouter`](../ai/providers/conversationalAIProviderRouter.ts:1): Routes requests to appropriate AI providers

**Emotional Intelligence**:
- [`EmotionalIntelligenceEngine`](../discord/emotional/EmotionalIntelligenceEngine.ts:1): Analyzes sentiment, emotion, and mood
- [`EmergencyStopHandler`](../discord/emotional/EmergencyStopHandler.ts:1): Handles emergency stop functionality

**Configuration**:
- [`ConversationalConfigManager`](../config/conversationalConfigManager.ts:1): Manages configuration loading and hot-reloading

#### Component Integration

The components integrate through a clear pipeline:

1. **Message Reception**: Discord message received via Discord API
2. **Context Extraction**: [`DiscordContextManager`](../discord/context/DiscordContextManager.ts:1) extracts channel, guild, and user context
3. **Emotional Analysis**: [`EmotionalIntelligenceEngine`](../discord/emotional/EmotionalIntelligenceEngine.ts:1) analyzes sentiment, emotion, and mood
4. **Conflict Detection**: Checks for conflict indicators and triggers de-escalation if needed
5. **AI Processing**: [`ConversationalAIProviderRouter`](../ai/providers/conversationalAIProviderRouter.ts:1) routes to appropriate AI provider
6. **Response Adaptation**: Adapts response based on emotional context and user preferences
7. **Response Delivery**: Sends response through Discord API

#### Usage Example

```typescript
import { DiscordConversationHandler } from './discord/conversation/DiscordConversationHandler';
import { ConversationalConfigManager } from './config/conversationalConfigManager';
import { EmotionalIntelligenceEngine } from './discord/emotional/EmotionalIntelligenceEngine';
import { DiscordContextManager } from './discord/context/DiscordContextManager';
import { ConversationManager } from './ai/conversation/conversation-manager';
import { ConversationalAIProviderRouter } from './ai/providers/conversationalAIProviderRouter';
import { EmergencyStopHandler } from './discord/emotional/EmergencyStopHandler';
import { Logger } from './utils/logger';

const logger = new Logger('ConversationalDiscord');

// Load configuration
const config = new ConversationalConfigManager().getConfiguration();

// Initialize components
const discordContextManager = new DiscordContextManager(config, logger);
const conversationManager = new ConversationManager(logger);
const emotionalIntelligenceEngine = new EmotionalIntelligenceEngine(config, logger);
const emergencyStopHandler = new EmergencyStopHandler(config.safety, logger);
const aiProvider = new ConversationalAIProviderRouter(config, logger);

// Create conversation handler
const conversationHandler = new DiscordConversationHandler(
  config,
  aiProvider,
  discordContextManager,
  conversationManager,
  emotionalIntelligenceEngine,
  emergencyStopHandler,
  logger
);

// Process a Discord message
const response = await conversationHandler.processMessage({
  id: 'msg_123',
  content: 'Hello! How are you?',
  author: {
    id: 'user_456',
    username: 'User',
    discriminator: '1234',
    bot: false
  },
  channelId: 'channel_789',
  guildId: 'guild_123',
  timestamp: new Date(),
  mentions: []
});

console.log('Response:', response.content);
console.log('Tone:', response.tone);
console.log('Emotion:', response.emotion);
```

#### Configuration Options

**ConversationalDiscordConfig**:
- **enabled**: Enable conversational mode (default: `false`)
- **mode**: Operation mode: `'conversational' | 'command' | 'hybrid'` (default: `'conversational'`)
- **responseChannel**: Channel for bot responses (default: `'bot-responses'`)
- **responseChannelType**: Response type: `'same' | 'dm' | 'custom'` (default: `'same'`)
- **contextWindow**: Number of messages in conversation history (default: `50`)
- **maxTokens**: Maximum tokens for AI responses (default: `2000`)
- **temperature**: AI temperature (default: `0.7`)
- **tone**: Bot tone: `'friendly' | 'professional' | 'casual' | 'playful'` (default: `'friendly'`)
- **formality**: Response formality: `'formal' | 'casual' | 'adaptive'` (default: `'casual'`)
- **verbosity**: Response verbosity: `'concise' | 'detailed' | 'balanced' | 'adaptive'` (default: `'balanced'`)
- **emotionalIntelligence**: Emotional intelligence configuration
- **memory**: Memory management configuration
- **multilingual**: Multilingual support configuration
- **safety**: Safety and moderation configuration
- **rateLimiting**: Rate limiting configuration
- **features**: Feature flags

#### Development Guidelines

**Extending Emotional Intelligence**:

To add new emotion detection capabilities:

```typescript
// Extend EMOTION_KEYWORDS in EmotionalIntelligenceEngine
const EMOTION_KEYWORDS: Record<string, string[]> = {
  [EMOTIONS.JOY]: [...],
  [EMOTIONS.SADNESS]: [...],
  // Add new emotion
  [EMOTIONS.CURIOSITY]: [
    'curious', 'wonder', 'interested', 'fascinated',
    'intrigued', 'puzzled', 'questioning'
  ],
};

// Update emotion detection logic
async detectEmotion(text: string): Promise<EmotionDetection> {
  // ... existing logic
  // Add detection for new emotion
}
```

**Adding New Safety Checks**:

To add new content filtering rules:

```typescript
// Extend SafetyConfig interface
interface SafetyConfig {
  enabled: boolean;
  contentFiltering: boolean;
  moderationLevel: 'strict' | 'moderate' | 'relaxed';
  // Add new safety check
  blockSpam: boolean;
  blockPhishing: boolean;
}

// Implement filtering logic in DiscordConversationHandler
async processMessage(message: DiscordMessage): Promise<ConversationResponse> {
  // ... existing checks
  
  // Add new safety check
  if (this.config.safety.blockSpam && this.isSpam(message)) {
    return {
      content: '',
      tone: 'professional',
      metadata: { skipped: true, reason: 'Spam detected' }
    };
  }
}
```

**Customizing Response Adaptation**:

To customize how responses are adapted based on emotions:

```typescript
// Extend adaptResponse method in EmotionalIntelligenceEngine
async adaptResponse(response: string, emotionalContext: EmotionalContext): Promise<AdaptedResponse> {
  let adaptedContent = response;
  const adaptations: string[] = [];
  
  // Add custom adaptation logic
  if (emotionalContext.mood.mood === 'curious') {
    adaptedContent = `${adaptedContent} Would you like to know more about this topic?`;
    adaptations.push('curiosity engagement added');
  }
  
  // ... existing adaptation logic
  
  return {
    content: adaptedContent,
    tone: adaptedTone,
    empathyLevel,
    adaptations
  };
}
```

#### Testing Guidelines

**Unit Testing**:

Test individual components in isolation:

```typescript
import { EmotionalIntelligenceEngine } from './discord/emotional/EmotionalIntelligenceEngine';

describe('EmotionalIntelligenceEngine', () => {
  let engine: EmotionalIntelligenceEngine;
  
  beforeEach(() => {
    const config = createTestConfig();
    engine = new EmotionalIntelligenceEngine(config, createTestLogger());
  });
  
  describe('analyzeSentiment', () => {
    it('should detect positive sentiment', async () => {
      const result = await engine.analyzeSentiment('I am so happy today!');
      expect(result.score).toBeGreaterThan(0.5);
    });
    
    it('should detect negative sentiment', async () => {
      const result = await engine.analyzeSentiment('I am very upset about this.');
      expect(result.score).toBeLessThan(-0.5);
    });
  });
  
  describe('detectEmotion', () => {
    it('should detect joy emotion', async () => {
      const result = await engine.detectEmotion('I am so excited!');
      expect(result.primary).toBe('joy');
    });
  });
});
```

**Integration Testing**:

Test component interactions:

```typescript
import { DiscordConversationHandler } from './discord/conversation/DiscordConversationHandler';

describe('DiscordConversationHandler Integration', () => {
  let handler: DiscordConversationHandler;
  
  beforeEach(async () => {
    handler = await createTestHandler();
  });
  
  it('should process message and return response', async () => {
    const message = createTestMessage('Hello!');
    const response = await handler.processMessage(message);
    
    expect(response.content).toBeDefined();
    expect(response.tone).toBeDefined();
  });
  
  it('should trigger emergency stop', async () => {
    const message = createTestMessage('emergency stop');
    const response = await handler.processMessage(message);
    
    expect(response.metadata?.emergencyStop).toBe(true);
  });
});
```

**End-to-End Testing**:

Test complete conversation flows:

```typescript
describe('Conversation Flow E2E', () => {
  it('should maintain context across multiple messages', async () => {
    const userId = 'user_123';
    const channelId = 'channel_456';
    
    // Send first message
    const msg1 = createTestMessage('My name is Alice', userId, channelId);
    const resp1 = await handler.processMessage(msg1);
    
    // Send follow-up message
    const msg2 = createTestMessage('What is my name?', userId, channelId);
    const resp2 = await handler.processMessage(msg2);
    
    // Verify context is maintained
    expect(resp2.content.toLowerCase()).toContain('alice');
  });
});
```

#### Troubleshooting

**Issue**: Emotional analysis not working
- **Solution**: Verify `DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE=true` is set
- Check sentiment lexicon is loaded correctly
- Review logs for analysis errors

**Issue**: Context not maintained
- **Solution**: Verify context window is configured correctly
- Check conversation manager is persisting messages
- Ensure database connection is working

**Issue**: Responses too generic
- **Solution**: Adjust temperature for more creativity
- Increase context window size
- Customize system prompt

**Issue**: Conflict detection false positives
- **Solution**: Adjust conflict indicator keywords
- Review sentiment thresholds
- Tune moderation level

---

Happy coding! 🚀