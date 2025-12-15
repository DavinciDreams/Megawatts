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

Happy coding! 🚀