#!/usr/bin/env node

/**
 * Database migration script for Discord bot
 * Supports up, down, and status operations
 */

import { Pool } from 'pg';
import { createClient } from 'redis';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

interface MigrationConfig {
  environment: 'development' | 'staging' | 'production';
  direction: 'up' | 'down' | 'status';
  version?: string;
  force?: boolean;
}

interface Migration {
  version: string;
  name: string;
  sqlUp: string;
  sqlDown: string;
  timestamp: Date;
}

class MigrationScript {
  private config: MigrationConfig;
  private pool: Pool;
  private redis: any;

  constructor(config: MigrationConfig) {
    this.config = config;
    
    // Initialize database connection
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'botuser',
      password: process.env.DB_PASSWORD || 'botpass',
      database: process.env.DB_NAME || 'discord_bot',
      ssl: this.config.environment === 'production'
    });

    // Initialize Redis connection
    this.redis = createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });
  }

  async execute(): Promise<void> {
    console.log(`🚀 Starting migration ${this.config.direction} for ${this.config.environment}...`);

    try {
      // Connect to databases
      await this.pool.connect();
      await this.redis.connect();

      // Ensure migrations table exists
      await this.ensureMigrationsTable();

      // Load migrations
      const migrations = await this.loadMigrations();

      switch (this.config.direction) {
        case 'up':
          await this.migrateUp(migrations);
          break;
        case 'down':
          await this.migrateDown(migrations);
          break;
        case 'status':
          await this.showStatus(migrations);
          break;
      }

      console.log(`✅ Migration ${this.config.direction} completed successfully!`);
    } catch (error) {
      console.error(`❌ Migration failed:`, error);
      process.exit(1);
    } finally {
      await this.pool.end();
      await this.redis.quit();
    }
  }

  private async ensureMigrationsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS migrations (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64)
      );
    `;
    
    await this.pool.query(sql);
    console.log('✅ Migrations table ensured');
  }

  private async loadMigrations(): Promise<Migration[]> {
    const migrationsDir = join(process.cwd(), 'migrations');
    
    if (!existsSync(migrationsDir)) {
      console.warn('⚠️ No migrations directory found');
      return [];
    }

    const files = readdirSync(migrationsDir)
      .filter(file => extname(file) === '.sql')
      .sort();

    const migrations: Migration[] = [];

    for (const file of files) {
      const filePath = join(migrationsDir, file);
      const content = readFileSync(filePath, 'utf8');
      
      // Parse migration file
      const parts = content.split('-- DOWN');
      const upSql = parts[0].replace('-- UP', '').trim();
      const downSql = parts[1] ? parts[1].trim() : '';
      
      // Extract version from filename (format: V1.0.0__migration_name.sql)
      const versionMatch = file.match(/^V(.+?)__/);
      const version = versionMatch ? versionMatch[1] : file;
      const name = file.replace(/^V.+?__/, '').replace('.sql', '');

      migrations.push({
        version,
        name,
        sqlUp: upSql,
        sqlDown: downSql,
        timestamp: new Date()
      });
    }

    return migrations;
  }

  private async migrateUp(migrations: Migration[]): Promise<void> {
    console.log('📈 Running up migrations...');
    
    // Get executed migrations
    const executedResult = await this.pool.query(
      'SELECT version FROM migrations ORDER BY version'
    );
    const executedVersions = new Set(executedResult.rows.map((row: any) => row.version));

    // Filter migrations that haven't been executed
    const pendingMigrations = migrations.filter(m => !executedVersions.has(m.version));

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    // Execute pending migrations
    for (const migration of pendingMigrations) {
      if (this.config.version && migration.version !== this.config.version) {
        continue;
      }

      console.log(`🔄 Executing migration ${migration.version}: ${migration.name}`);
      
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        
        // Execute migration
        await client.query(migration.sqlUp);
        
        // Record migration
        await client.query(
          'INSERT INTO migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.name, this.calculateChecksum(migration.sqlUp)]
        );
        
        await client.query('COMMIT');
        
        // Clear Redis cache
        await this.redis.flushdb();
        
        console.log(`✅ Migration ${migration.version} completed`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  }

  private async migrateDown(migrations: Migration[]): Promise<void> {
    console.log('📉 Running down migrations...');
    
    if (!this.config.version && !this.config.force) {
      console.error('❌ Version is required for down migration (use --force for all)');
      process.exit(1);
    }

    // Get executed migrations
    const executedResult = await this.pool.query(
      'SELECT version FROM migrations ORDER BY version DESC'
    );
    const executedVersions = executedResult.rows.map((row: any) => row.version);

    if (executedVersions.length === 0) {
      console.log('✅ No migrations to rollback');
      return;
    }

    // Determine which migrations to rollback
    let migrationsToRollback: string[];
    if (this.config.version) {
      const versionIndex = executedVersions.indexOf(this.config.version);
      if (versionIndex === -1) {
        console.error(`❌ Migration ${this.config.version} not found`);
        process.exit(1);
      }
      migrationsToRollback = executedVersions.slice(0, versionIndex + 1);
    } else {
      migrationsToRollback = executedVersions;
    }

    // Execute rollbacks
    for (const version of migrationsToRollback) {
      const migration = migrations.find(m => m.version === version);
      if (!migration || !migration.sqlDown) {
        console.warn(`⚠️ No down migration found for ${version}`);
        continue;
      }

      console.log(`🔄 Rolling back migration ${version}: ${migration.name}`);
      
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        
        // Execute rollback
        await client.query(migration.sqlDown);
        
        // Remove migration record
        await client.query('DELETE FROM migrations WHERE version = $1', [version]);
        
        await client.query('COMMIT');
        
        // Clear Redis cache
        await this.redis.flushdb();
        
        console.log(`✅ Rollback ${version} completed`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  }

  private async showStatus(migrations: Migration[]): Promise<void> {
    console.log('📊 Migration status:');
    
    // Get executed migrations
    const executedResult = await this.pool.query(
      'SELECT version, name, executed_at FROM migrations ORDER BY version'
    );
    const executedMigrations = new Map(
      executedResult.rows.map((row: any) => [row.version, row])
    );

    console.log('\n📋 All migrations:');
    for (const migration of migrations) {
      const executed = executedMigrations.get(migration.version);
      const status = executed ? '✅ EXECUTED' : '⏳ PENDING';
      const timestamp = executed ? ` (${executed.executed_at})` : '';
      
      console.log(`  ${status} ${migration.version}: ${migration.name}${timestamp}`);
    }

    const pendingCount = migrations.length - executedMigrations.size;
    console.log(`\n📈 Summary: ${executedMigrations.size} executed, ${pendingCount} pending`);
  }

  private calculateChecksum(sql: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(sql).digest('hex');
  }
}

// Parse command line arguments
function parseArgs(): MigrationConfig {
  const args = process.argv.slice(2);
  const config: MigrationConfig = {
    environment: 'development',
    direction: 'up'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--env':
      case '-e':
        config.environment = args[++i] as MigrationConfig['environment'];
        break;
      case '--direction':
      case '-d':
        config.direction = args[++i] as MigrationConfig['direction'];
        break;
      case '--version':
      case '-v':
        config.version = args[++i];
        break;
      case '--force':
      case '-f':
        config.force = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npm run migrate [options]

Options:
  --env, -e <environment>    Environment (development|staging|production) [default: development]
  --direction, -d <dir>       Direction (up|down|status) [default: up]
  --version, -v <version>     Specific migration version
  --force, -f                 Force operation (for down migrations)
  --help, -h                  Show this help message

Examples:
  npm run migrate -- --env production --direction up
  npm run migrate -- --env development --direction down --version 1.0.0
  npm run migrate -- --direction status
        `);
        process.exit(0);
    }
  }

  return config;
}

// Run migration
if (require.main === module) {
  const config = parseArgs();
  const migrationScript = new MigrationScript(config);
  migrationScript.execute();
}

export type { MigrationConfig };
export { MigrationScript };