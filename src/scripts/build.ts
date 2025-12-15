#!/usr/bin/env node

/**
 * Build script for the Discord bot
 * Supports development, staging, and production builds
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface BuildConfig {
  environment: 'development' | 'staging' | 'production';
  clean?: boolean;
  analyze?: boolean;
  sourcemap?: boolean;
}

class BuildScript {
  private config: BuildConfig;
  private projectRoot: string;

  constructor(config: BuildConfig) {
    this.config = config;
    this.projectRoot = process.cwd()!;
  }

  async build(): Promise<void> {
    console.log(`🚀 Starting ${this.config.environment} build...`);

    try {
      // Clean previous builds if requested
      if (this.config.clean) {
        await this.cleanBuild();
      }

      // Create necessary directories
      await this.createDirectories();

      // Run TypeScript compilation
      await this.compileTypeScript();

      // Copy static assets
      await this.copyAssets();

      // Generate bundle analysis if requested
      if (this.config.analyze) {
        await this.analyzeBundle();
      }

      // Generate build info
      await this.generateBuildInfo();

      console.log(`✅ ${this.config.environment} build completed successfully!`);
    } catch (error) {
      console.error(`❌ Build failed:`, error);
      process.exit(1);
    }
  }

  private async cleanBuild(): Promise<void> {
    console.log('🧹 Cleaning previous builds...');
    
    const dirsToClean = ['dist', 'build', '.nyc_output', 'coverage'];
    
    for (const dir of dirsToClean) {
      const dirPath = join(this.projectRoot, dir);
      if (existsSync(dirPath)) {
        execSync(`rm -rf ${dirPath}`, { stdio: 'inherit' });
      }
    }
  }

  private async createDirectories(): Promise<void> {
    console.log('📁 Creating build directories...');
    
    const dirsToCreate = [
      'dist',
      'dist/logs',
      'dist/temp',
      'dist/public',
      'dist/config'
    ];

    for (const dir of dirsToCreate) {
      const dirPath = join(this.projectRoot, dir);
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  private async compileTypeScript(): Promise<void> {
    console.log('🔨 Compiling TypeScript...');
    
    const tscFlags = [
      '--project', 'tsconfig.json',
      this.config.sourcemap ? '--sourceMap' : '--noSourceMap',
      '--outDir', 'dist'
    ].filter(Boolean);

    execSync(`npx tsc ${tscFlags.join(' ')}`, { 
      stdio: 'inherit',
      cwd: this.projectRoot 
    });
  }

  private async copyAssets(): Promise<void> {
    console.log('📦 Copying static assets...');
    
    const assetsToCopy = [
      { src: 'package.json', dest: 'dist/package.json' },
      { src: 'src/config', dest: 'dist/config' },
      { src: 'src/public', dest: 'dist/public' }
    ];

    for (const asset of assetsToCopy) {
      const srcPath = join(this.projectRoot, asset.src);
      const destPath = join(this.projectRoot, asset.dest);
      
      if (existsSync(srcPath)) {
        execSync(`cp -r ${srcPath} ${destPath}`, { stdio: 'inherit' });
      }
    }
  }

  private async analyzeBundle(): Promise<void> {
    console.log('📊 Analyzing bundle size...');
    
    try {
      execSync('npx webpack-bundle-analyzer dist/stats.json', { 
        stdio: 'inherit',
        cwd: this.projectRoot 
      });
    } catch (error) {
      console.warn('⚠️ Bundle analysis failed, continuing build...');
    }
  }

  private async generateBuildInfo(): Promise<void> {
    console.log('📋 Generating build information...');
    
    const buildInfo = {
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      version: process.env.npm_package_version || 'unknown',
      commit: this.getGitCommit(),
      branch: this.getGitBranch(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };

    writeFileSync(
      join(this.projectRoot, 'dist', 'build-info.json'),
      JSON.stringify(buildInfo, null, 2)
    );
  }

  private getGitCommit(): string {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  private getGitBranch(): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
}

// Parse command line arguments
function parseArgs(): BuildConfig {
  const args = process.argv.slice(2);
  const config: BuildConfig = {
    environment: 'development'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--env':
      case '-e':
        config.environment = args[++i] as BuildConfig['environment'];
        break;
      case '--clean':
      case '-c':
        config.clean = true;
        break;
      case '--analyze':
      case '-a':
        config.analyze = true;
        break;
      case '--sourcemap':
      case '-s':
        config.sourcemap = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npm run build [options]

Options:
  --env, -e <environment>    Build environment (development|staging|production) [default: development]
  --clean, -c               Clean previous builds before building
  --analyze, -a             Analyze bundle size after build
  --sourcemap, -s           Generate source maps
  --help, -h                Show this help message

Examples:
  npm run build -- --env production --clean
  npm run build -- --env staging --analyze --sourcemap
        `);
        process.exit(0);
    }
  }

  return config;
}

// Run the build
if (require.main === module) {
  const config = parseArgs();
  const buildScript = new BuildScript(config);
  buildScript.build();
}

export type { BuildConfig };
export { BuildScript };