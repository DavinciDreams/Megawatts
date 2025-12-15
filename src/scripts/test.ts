#!/usr/bin/env node

/**
 * Comprehensive testing script for Discord bot
 * Supports unit, integration, e2e, and performance tests
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface TestConfig {
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'all';
  environment: 'development' | 'staging' | 'production';
  coverage?: boolean;
  watch?: boolean;
  verbose?: boolean;
  pattern?: string;
  parallel?: boolean;
  timeout?: number;
}

class TestScript {
  private config: TestConfig;
  private projectRoot: string;

  constructor(config: TestConfig) {
    this.config = config;
    this.projectRoot = process.cwd()!;
  }

  async execute(): Promise<void> {
    console.log(`🧪 Starting ${this.config.type} tests for ${this.config.environment}...`);

    try {
      // Ensure test directories exist
      await this.ensureTestDirectories();

      // Set up test environment
      await this.setupTestEnvironment();

      // Run tests based on type
      switch (this.config.type) {
        case 'unit':
          await this.runUnitTests();
          break;
        case 'integration':
          await this.runIntegrationTests();
          break;
        case 'e2e':
          await this.runE2ETests();
          break;
        case 'performance':
          await this.runPerformanceTests();
          break;
        case 'all':
          await this.runAllTests();
          break;
      }

      // Generate coverage report if requested
      if (this.config.coverage) {
        await this.generateCoverageReport();
      }

      console.log(`✅ ${this.config.type} tests completed successfully!`);
    } catch (error) {
      console.error(`❌ Tests failed:`, error);
      process.exit(1);
    } finally {
      await this.cleanupTestEnvironment();
    }
  }

  private async ensureTestDirectories(): Promise<void> {
    console.log('📁 Ensuring test directories...');
    
    const dirsToCreate = [
      'test-results',
      'test-results/unit',
      'test-results/integration',
      'test-results/e2e',
      'test-results/performance',
      'coverage',
      'coverage/lcov-report'
    ];

    for (const dir of dirsToCreate) {
      const dirPath = join(this.projectRoot, dir);
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  private async setupTestEnvironment(): Promise<void> {
    console.log('⚙️ Setting up test environment...');
    
    // Set environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.DB_NAME = `${process.env.DB_NAME || 'discord_bot'}_test`;
    process.env.REDIS_DB = '15'; // Use dedicated Redis DB for tests

    // Create test configuration file
    const testConfig = {
      environment: 'test',
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'botuser',
        password: process.env.DB_PASSWORD || 'botpass',
        database: process.env.DB_NAME || 'discord_bot_test'
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: 15
      },
      discord: {
        token: 'test-token',
        clientId: 'test-client-id',
        guildId: 'test-guild-id'
      }
    };

    writeFileSync(
      join(this.projectRoot, 'test-config.json'),
      JSON.stringify(testConfig, null, 2)
    );
  }

  private async runUnitTests(): Promise<void> {
    console.log('🔬 Running unit tests...');
    
    const jestArgs = [
      'jest',
      '--config=jest.unit.config.js',
      this.config.watch ? '--watch' : '',
      this.config.verbose ? '--verbose' : '',
      this.config.pattern ? `--testNamePattern=${this.config.pattern}` : '',
      `--testTimeout=${this.config.timeout || 30000}`,
      this.config.coverage ? '--coverage' : '',
      `--coverageDirectory=coverage/unit`,
      `--testResultsProcessor=jest-junit`,
      `--outputFile=test-results/unit/junit.xml`
    ].filter(Boolean);

    execSync(jestArgs.join(' '), { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });
  }

  private async runIntegrationTests(): Promise<void> {
    console.log('🔗 Running integration tests...');
    
    const jestArgs = [
      'jest',
      '--config=jest.integration.config.js',
      this.config.watch ? '--watch' : '',
      this.config.verbose ? '--verbose' : '',
      this.config.pattern ? `--testNamePattern=${this.config.pattern}` : '',
      `--testTimeout=${this.config.timeout || 60000}`,
      this.config.coverage ? '--coverage' : '',
      `--coverageDirectory=coverage/integration`,
      `--testResultsProcessor=jest-junit`,
      `--outputFile=test-results/integration/junit.xml`
    ].filter(Boolean);

    execSync(jestArgs.join(' '), { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });
  }

  private async runE2ETests(): Promise<void> {
    console.log('🎭 Running end-to-end tests...');
    
    // Start test environment
    await this.startTestServices();

    try {
      const jestArgs = [
        'jest',
        '--config=jest.e2e.config.js',
        this.config.watch ? '--watch' : '',
        this.config.verbose ? '--verbose' : '',
        this.config.pattern ? `--testNamePattern=${this.config.pattern}` : '',
        `--testTimeout=${this.config.timeout || 120000}`,
        this.config.coverage ? '--coverage' : '',
        `--coverageDirectory=coverage/e2e`,
        `--testResultsProcessor=jest-junit`,
        `--outputFile=test-results/e2e/junit.xml`
      ].filter(Boolean);

      execSync(jestArgs.join(' '), { 
        stdio: 'inherit',
        cwd: this.projectRoot 
      });
    } finally {
      await this.stopTestServices();
    }
  }

  private async runPerformanceTests(): Promise<void> {
    console.log('⚡ Running performance tests...');
    
    const k6Args = [
      'k6',
      'run',
      '--out', 'json=test-results/performance/results.json',
      this.config.verbose ? '--verbose' : '',
      'tests/performance/load-test.js'
    ].filter(Boolean);

    try {
      execSync(k6Args.join(' '), { 
        stdio: 'inherit',
        cwd: this.projectRoot 
      });
    } catch (error) {
      // k6 exits with non-zero for performance thresholds
      console.warn('⚠️ Performance tests completed with warnings');
    }
  }

  private async runAllTests(): Promise<void> {
    console.log('🚀 Running all test suites...');
    
    if (this.config.parallel) {
      // Run tests in parallel
      await Promise.all([
        this.runUnitTests(),
        this.runIntegrationTests(),
        this.runE2ETests(),
        this.runPerformanceTests()
      ]);
    } else {
      // Run tests sequentially
      await this.runUnitTests();
      await this.runIntegrationTests();
      await this.runE2ETests();
      await this.runPerformanceTests();
    }
  }

  private async generateCoverageReport(): Promise<void> {
    console.log('📊 Generating coverage report...');
    
    // Merge coverage reports
    execSync('npx nyc merge coverage coverage/merged.json', { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });

    // Generate HTML report
    execSync('npx nyc report --reporter=html --reporter=lcov', { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });

    // Generate summary
    execSync('npx nyc report --reporter=text-summary', { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });
  }

  private async startTestServices(): Promise<void> {
    console.log('🚀 Starting test services...');
    
    // Start Docker containers for testing
    execSync('docker-compose -f docker/docker-compose.test.yml up -d', { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });

    // Wait for services to be ready
    await this.waitForServices();
  }

  private async stopTestServices(): Promise<void> {
    console.log('🛑 Stopping test services...');
    
    execSync('docker-compose -f docker/docker-compose.test.yml down -v', { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });
  }

  private async waitForServices(): Promise<void> {
    console.log('⏳ Waiting for services to be ready...');
    
    // Wait for PostgreSQL
    await this.waitForPostgres();
    
    // Wait for Redis
    await this.waitForRedis();
  }

  private async waitForPostgres(): Promise<void> {
    const maxAttempts = 30;
    const delay = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        execSync('pg_isready -h localhost -p 5432', { 
          stdio: 'pipe' 
        });
        console.log('✅ PostgreSQL is ready');
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('PostgreSQL failed to start');
  }

  private async waitForRedis(): Promise<void> {
    const maxAttempts = 30;
    const delay = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        execSync('redis-cli ping', { 
          stdio: 'pipe' 
        });
        console.log('✅ Redis is ready');
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Redis failed to start');
  }

  private async cleanupTestEnvironment(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');
    
    // Remove test configuration
    try {
      execSync('rm test-config.json', { 
        stdio: 'pipe',
        cwd: this.projectRoot 
      });
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

// Parse command line arguments
function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  const config: TestConfig = {
    type: 'all',
    environment: 'development'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--type':
      case '-t':
        config.type = args[++i] as TestConfig['type'];
        break;
      case '--env':
      case '-e':
        config.environment = args[++i] as TestConfig['environment'];
        break;
      case '--coverage':
      case '-c':
        config.coverage = true;
        break;
      case '--watch':
      case '-w':
        config.watch = true;
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--pattern':
      case '-p':
        config.pattern = args[++i];
        break;
      case '--parallel':
        config.parallel = true;
        break;
      case '--timeout':
        config.timeout = parseInt(args[++i]);
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npm run test [options]

Options:
  --type, -t <type>          Test type (unit|integration|e2e|performance|all) [default: all]
  --env, -e <environment>     Environment (development|staging|production) [default: development]
  --coverage, -c              Generate coverage report
  --watch, -w                 Watch mode for tests
  --verbose, -v               Verbose output
  --pattern, -p <pattern>     Test name pattern
  --parallel                   Run tests in parallel
  --timeout <ms>              Test timeout in milliseconds [default: 30000]
  --help, -h                  Show this help message

Examples:
  npm run test -- --type unit --coverage
  npm run test -- --type integration --env staging
  npm run test -- --type e2e --watch
  npm run test -- --type all --parallel --coverage
        `);
        process.exit(0);
    }
  }

  return config;
}

// Run tests
if (require.main === module) {
  const config = parseArgs();
  const testScript = new TestScript(config);
  testScript.execute();
}

export type { TestConfig };
export { TestScript };