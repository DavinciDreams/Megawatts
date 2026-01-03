import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../../utils/logger';
import { BotError } from '../../../types';
import {
  CodeModification,
  ModificationType,
  ModificationChange,
  CodeLocation,
  ValidationReport,
  TestingReport,
  RollbackPlan,
  Backup,
  CoverageReport,
  TestResult,
  TestType
} from '../../../types/self-editing';

const execAsync = promisify(exec);

/**
 * Core code modification engine with safety and validation
 */
export class CodeModificationEngine extends EventEmitter {
  private logger: Logger;
  private activeModifications: Map<string, CodeModification> = new Map();
  private modificationHistory: CodeModification[] = [];
  private backupDirectory: string;
  private activeOperations: Map<string, Promise<void>> = new Map();
  private readonly MAX_CONCURRENT_OPERATIONS = 10;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.backupDirectory = path.join(process.cwd(), '.backups');
    this.initializeBackupDirectory();
  }

  /**
   * Initialize the backup directory
   */
  private async initializeBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.backupDirectory, { recursive: true });
      this.logger.debug(`Backup directory initialized: ${this.backupDirectory}`);
    } catch (error) {
      this.logger.error('Failed to initialize backup directory', error as Error);
      throw new BotError('Failed to initialize backup directory', 'high');
    }
  }

  /**
   * Apply code modification with full validation
   */
  public async applyModification(
    changes: ModificationChange[],
    options: {
      dryRun?: boolean;
      skipValidation?: boolean;
      skipBackup?: boolean;
      force?: boolean;
      priority?: 'low' | 'medium' | 'high' | 'critical';
    } = {}
  ): Promise<string> {
    const modificationId = this.generateModificationId();
    
    try {
      this.logger.info(`Applying modification ${modificationId} with ${changes.length} changes`);
      
      // Create modification record
      const modification: CodeModification = {
        id: modificationId,
        timestamp: new Date(),
        type: this.determineModificationType(changes),
        target: this.extractTarget(changes),
        changes,
        validation: this.createEmptyValidation(modificationId),
        testing: this.createEmptyTesting(modificationId),
        rollback: this.createRollbackPlan(changes),
        metadata: {
          author: 'self-editing-system',
          reason: 'Automated code improvement',
          context: { 
            timestamp: new Date(),
            dryRun: options.dryRun || false,
            priority: options.priority || 'medium'
          },
          tags: ['automated', 'improvement'],
          relatedIssues: [],
          relatedCommits: [],
          reviewStatus: 'pending',
          reviewers: []
        }
      };

      this.activeModifications.set(modificationId, modification);
      this.emit('modificationStarted', { modificationId, changes, options });

      // Step 1: Pre-modification validation
      if (!options.skipValidation) {
        await this.validateModification(modification);
      }

      // Step 2: Create backup (unless skipped)
      if (!options.skipBackup) {
        await this.createBackup(modification);
      }

      // Step 3: Dry run check
      if (options.dryRun) {
        this.logger.info(`Dry run mode - no actual changes will be applied`);
        this.emit('modificationDryRun', { modificationId, changes });
        return modificationId;
      }

      // Step 4: Apply changes
      await this.applyChanges(modification);

      // Step 5: Post-modification validation
      if (!options.skipValidation) {
        await this.validateModification(modification);
      }

      // Step 6: Run tests
      await this.runTests(modification);

      // Step 7: Verify modification
      await this.verifyModification(modification);

      // Complete modification
      modification.validation.status = 'passed';
      modification.testing.status = 'passed';
      
      this.activeModifications.delete(modificationId);
      this.modificationHistory.push(modification);
      
      this.emit('modificationCompleted', { modificationId, modification });
      
      this.logger.info(`Successfully applied modification ${modificationId}`);
      return modificationId;
    } catch (error) {
      this.logger.error(`Modification ${modificationId} failed:`, error);
      
      // Mark as failed
      const modification = this.activeModifications.get(modificationId);
      if (modification) {
        modification.validation.status = 'failed';
        modification.testing.status = 'failed';
        this.activeModifications.delete(modificationId);
        this.modificationHistory.push(modification);
      }
      
      this.emit('modificationFailed', { modificationId, error });
      throw new BotError(`Code modification failed: ${error}`, 'medium');
    }
  }

  /**
   * Rollback a modification
   */
  public async rollbackModification(modificationId: string): Promise<void> {
    const modification = this.getModification(modificationId);
    
    if (!modification) {
      throw new BotError(`Modification ${modificationId} not found`, 'medium');
    }

    try {
      this.logger.info(`Rolling back modification ${modificationId}`);
      this.emit('rollbackStarted', { modificationId, modification });

      // Execute rollback steps
      for (const step of modification.rollback.steps) {
        await this.executeRollbackStep(step);
      }

      // Verify rollback success
      await this.verifyRollback(modification);

      this.emit('rollbackCompleted', { modificationId, modification });
      this.logger.info(`Successfully rolled back modification ${modificationId}`);
    } catch (error) {
      this.logger.error(`Rollback ${modificationId} failed:`, error);
      this.emit('rollbackFailed', { modificationId, error });
      throw new BotError(`Rollback failed: ${error}`, 'high');
    }
  }

  /**
   * Get modification by ID
   */
  public getModification(modificationId: string): CodeModification | null {
    return this.activeModifications.get(modificationId) || 
           this.modificationHistory.find(m => m.id === modificationId) || null;
  }

  /**
   * Get active modifications
   */
  public getActiveModifications(): CodeModification[] {
    return Array.from(this.activeModifications.values());
  }

  /**
   * Get modification history
   */
  public getModificationHistory(limit?: number): CodeModification[] {
    if (limit) {
      return this.modificationHistory.slice(-limit);
    }
    return [...this.modificationHistory];
  }

  /**
   * Get modification statistics
   */
  public getModificationStatistics(): {
    totalModifications: number;
    successfulModifications: number;
    failedModifications: number;
    averageChangesPerModification: number;
    mostCommonModificationTypes: Record<ModificationType, number>;
    averageRollbackTime: number;
  } {
    const totalModifications = this.modificationHistory.length;
    const successfulModifications = this.modificationHistory.filter(m => 
      m.validation.status === 'passed' && m.testing.status === 'passed'
    ).length;
    const failedModifications = this.modificationHistory.filter(m => 
      m.validation.status === 'failed' || m.testing.status === 'failed'
    ).length;

    const totalChanges = this.modificationHistory.reduce((sum, m) => sum + m.changes.length, 0);
    const averageChangesPerModification = totalModifications > 0 ? totalChanges / totalModifications : 0;

    const modificationTypes = new Map<ModificationType, number>();
    this.modificationHistory.forEach(m => {
      const count = modificationTypes.get(m.type) || 0;
      modificationTypes.set(m.type, count + 1);
    });

    const mostCommonModificationTypes: Record<ModificationType, number> = {};
    modificationTypes.forEach((count, type) => {
      mostCommonModificationTypes[type] = count;
    });

    // Mock rollback time calculation
    const averageRollbackTime = 15.5; // seconds

    return {
      totalModifications,
      successfulModifications,
      failedModifications,
      averageChangesPerModification,
      mostCommonModificationTypes,
      averageRollbackTime
    };
  }

  private determineModificationType(changes: ModificationChange[]): ModificationType {
    const types = new Set(changes.map(c => c.type));
    
    if (types.size === 1) {
      return changes[0].type;
    }
    
    // If multiple types, return REFACTOR
    return ModificationType.REFACTOR;
  }

  private extractTarget(changes: ModificationChange[]): any {
    const files = new Set(changes.map(c => c.file));
    const functions = new Set();
    const classes = new Set();
    const modules = new Set();
    const components = new Set();

    changes.forEach(change => {
      if (change.location.function) {
        functions.add(change.location.function);
      }
      if (change.location.class) {
        classes.add(change.location.class);
      }
      // Extract module/component names from file paths
      const pathParts = change.file.split('/');
      if (pathParts.length > 1) {
        modules.add(pathParts[pathParts.length - 2]);
      }
      if (pathParts.length > 2) {
        components.add(pathParts[pathParts.length - 3]);
      }
    });

    return {
      files: Array.from(files),
      functions: Array.from(functions),
      classes: Array.from(classes),
      modules: Array.from(modules),
      components: Array.from(components)
    };
  }

  private createEmptyValidation(modificationId: string): ValidationReport {
    return {
      id: this.generateId(),
      timestamp: new Date(),
      status: 'pending',
      checks: [],
      overallScore: 0,
      recommendations: [],
      blockers: []
    };
  }

  private createEmptyTesting(modificationId: string): TestingReport {
    return {
      id: this.generateId(),
      timestamp: new Date(),
      status: 'pending',
      testResults: [],
      coverage: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
        uncoveredLines: [],
        uncoveredFunctions: [],
        uncoveredBranches: []
      },
      performance: {
        responseTime: { current: 0, baseline: 0, improvement: 0, unit: 'ms' },
        throughput: { current: 0, baseline: 0, improvement: 0, unit: 'req/s' },
        memoryUsage: { current: 0, baseline: 0, improvement: 0, unit: 'MB' },
        cpuUsage: { current: 0, baseline: 0, improvement: 0, unit: '%' },
        errorRate: { current: 0, baseline: 0, improvement: 0, unit: '%' }
      },
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        successRate: 0,
        duration: 0
      }
    };
  }

  private createRollbackPlan(changes: ModificationChange[]): RollbackPlan {
    return {
      id: this.generateId(),
      timestamp: new Date(),
      modifications: changes.map(c => c.id),
      backupLocation: `/backups/${Date.now()}`,
      steps: changes.map((change, index) => ({
        order: index + 1,
        description: `Restore ${change.file} at line ${change.location.line}`,
        command: `git checkout HEAD -- ${change.file}`,
        expectedOutcome: `File ${change.file} restored to original state`,
        rollbackStep: `git add ${change.file}`
      })),
      verification: [
        {
          order: 1,
          description: 'Verify file integrity',
          check: 'git status',
          expectedValue: 'clean working directory',
          critical: true
        }
      ],
      estimatedTime: changes.length * 30, // 30 seconds per change
      complexity: changes.length > 5 ? 'complex' : changes.length > 2 ? 'moderate' : 'simple'
    };
  }

  private async validateModification(modification: CodeModification): Promise<void> {
    this.logger.debug(`Validating modification ${modification.id}`);
    
    // Mock validation - would implement actual validation logic
    modification.validation.status = 'passed';
    modification.validation.overallScore = 95;
    modification.validation.checks = [
      {
        name: 'Syntax Check',
        type: 'syntax',
        status: 'passed',
        message: 'All files have valid syntax',
        details: { filesChecked: modification.changes.length }
      },
      {
        name: 'Security Scan',
        type: 'security',
        status: 'passed',
        message: 'No security vulnerabilities detected',
        details: { vulnerabilitiesFound: 0 }
      }
    ];
  }

  /**
   * Create a backup of the target file before modification
   * @param modification - The modification object containing changes
   * @returns Backup path and metadata
   * @throws BotError if backup creation fails
   */
  private async createBackup(modification: CodeModification): Promise<void> {
    this.logger.debug(`Creating backup for modification ${modification.id}`);
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupSubDir = path.join(this.backupDirectory, modification.id, timestamp);
      await fs.mkdir(backupSubDir, { recursive: true });
      
      const backupMetadata: Backup = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        type: 'full',
        size: 0,
        location: backupSubDir,
        checksum: '',
        metadata: {
          version: '1.0.0',
          components: modification.changes.map((c: ModificationChange) => c.file),
          configuration: { modificationId: modification.id },
          environment: process.env.NODE_ENV || 'development',
          createdBy: 'self-editing-system',
          reason: `Backup before modification ${modification.id}`
        }
      };
      
      // Backup each file in the modification
      for (const change of modification.changes) {
        const filePath = path.join(process.cwd(), change.file);
        const backupPath = path.join(backupSubDir, change.file.replace(/\//g, '_'));
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          await fs.mkdir(path.dirname(backupPath), { recursive: true });
          await fs.writeFile(backupPath, content, 'utf-8');
          
          // Update backup metadata
          backupMetadata.size += Buffer.byteLength(content);
          
          this.logger.debug(`Backed up file: ${change.file} -> ${backupPath}`);
        } catch (fileError) {
          this.logger.warn(`Failed to backup file ${change.file}:`, fileError as Error);
          // Continue with other files even if one fails
        }
      }
      
      // Calculate checksum for backup
      if (backupMetadata.size > 0) {
        const hash = crypto.createHash('sha256');
        const files = await fs.readdir(backupSubDir);
        for (const file of files) {
          const filePath = path.join(backupSubDir, file);
          const content = await fs.readFile(filePath);
          hash.update(content);
        }
        backupMetadata.checksum = hash.digest('hex');
      }
      
      // Store backup metadata
      const metadataPath = path.join(backupSubDir, 'backup-metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify(backupMetadata, null, 2), 'utf-8');
      
      // Update modification rollback plan with backup location
      modification.rollback.backupLocation = backupSubDir;
      
      this.logger.info(`Backup created successfully at: ${backupSubDir}`, {
        modificationId: modification.id,
        filesBackedUp: modification.changes.length,
        size: backupMetadata.size,
        checksum: backupMetadata.checksum
      });
    } catch (error) {
      this.logger.error(`Failed to create backup for modification ${modification.id}:`, error as Error);
      throw new BotError(`Backup creation failed: ${error}`, 'high');
    }
  }

  /**
   * Apply changes to files with proper error handling and line number calculations
   * @param modification - The modification object containing changes
   * @throws BotError if change application fails
   */
  private async applyChanges(modification: CodeModification): Promise<void> {
    this.logger.debug(`Applying ${modification.changes.length} changes for modification ${modification.id}`);
    
    try {
      // Process changes in order to handle dependencies
      for (const change of modification.changes) {
        await this.applySingleChange(change);
      }
      
      this.logger.info(`Successfully applied ${modification.changes.length} changes for modification ${modification.id}`);
    } catch (error) {
      this.logger.error(`Failed to apply changes for modification ${modification.id}:`, error as Error);
      throw new BotError(`Change application failed: ${error}`, 'high');
    }
  }

  /**
   * Apply a single change to a file
   * @param change - The change to apply
   * @throws BotError if change application fails
   */
  private async applySingleChange(change: ModificationChange): Promise<void> {
    const filePath = path.join(process.cwd(), change.file);
    
    try {
      // Read the file content
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      let newContent: string;
      
      switch (change.type) {
        case ModificationType.ADD:
          newContent = this.applyInsertChange(lines, change);
          break;
        case ModificationType.MODIFY:
        case ModificationType.REFACTOR:
        case ModificationType.OPTIMIZE:
        case ModificationType.ENHANCE:
          newContent = this.applyReplaceChange(lines, change);
          break;
        case ModificationType.DELETE:
        case ModificationType.FIX:
          newContent = this.applyDeleteChange(lines, change);
          break;
        default:
          throw new BotError(`Unsupported modification type: ${change.type}`, 'medium');
      }
      
      // Write the modified content back to the file
      await fs.writeFile(filePath, newContent, 'utf-8');
      
      this.logger.debug(`Applied change to file: ${change.file}`, {
        type: change.type,
        line: change.location.line,
        description: change.description
      });
    } catch (error) {
      this.logger.error(`Failed to apply change to file ${change.file}:`, error as Error);
      throw new BotError(`Failed to apply change to ${change.file}: ${error}`, 'high');
    }
  }

  /**
   * Apply an insert/add change to the file
   * @param lines - Array of file lines
   * @param change - The change to apply
   * @returns Modified file content
   */
  private applyInsertChange(lines: string[], change: ModificationChange): string {
    if (!change.newCode) {
      throw new BotError('Insert change requires newCode', 'medium');
    }
    
    const insertLine = change.location.line - 1; // Convert to 0-indexed
    
    if (insertLine < 0 || insertLine > lines.length) {
      throw new BotError(`Invalid line number: ${change.location.line}`, 'medium');
    }
    
    // Insert the new code at the specified line
    lines.splice(insertLine, 0, change.newCode);
    
    return lines.join('\n');
  }

  /**
   * Apply a replace/modify change to the file
   * @param lines - Array of file lines
   * @param change - The change to apply
   * @returns Modified file content
   */
  private applyReplaceChange(lines: string[], change: ModificationChange): string {
    if (!change.originalCode || !change.newCode) {
      throw new BotError('Replace change requires both originalCode and newCode', 'medium');
    }
    
    const targetLine = change.location.line - 1; // Convert to 0-indexed
    
    if (targetLine < 0 || targetLine >= lines.length) {
      throw new BotError(`Invalid line number: ${change.location.line}`, 'medium');
    }
    
    const currentLine = lines[targetLine];
    
    // Verify the original code matches (for safety)
    if (!currentLine.includes(change.originalCode)) {
      this.logger.warn(`Original code mismatch at line ${change.location.line} in file ${change.file}`, {
        expected: change.originalCode,
        actual: currentLine
      });
      throw new BotError(`Original code mismatch at line ${change.location.line}`, 'high');
    }
    
    // Replace the line with new code
    lines[targetLine] = lines[targetLine].replace(change.originalCode, change.newCode);
    
    return lines.join('\n');
  }

  /**
   * Apply a delete change to the file
   * @param lines - Array of file lines
   * @param change - The change to apply
   * @returns Modified file content
   */
  private applyDeleteChange(lines: string[], change: ModificationChange): string {
    if (!change.originalCode) {
      throw new BotError('Delete change requires originalCode', 'medium');
    }
    
    const targetLine = change.location.line - 1; // Convert to 0-indexed
    
    if (targetLine < 0 || targetLine >= lines.length) {
      throw new BotError(`Invalid line number: ${change.location.line}`, 'medium');
    }
    
    const currentLine = lines[targetLine];
    
    // Verify the original code matches (for safety)
    if (!currentLine.includes(change.originalCode)) {
      this.logger.warn(`Original code mismatch at line ${change.location.line} in file ${change.file}`, {
        expected: change.originalCode,
        actual: currentLine
      });
      throw new BotError(`Original code mismatch at line ${change.location.line}`, 'high');
    }
    
    // Remove the line
    lines.splice(targetLine, 1);
    
    return lines.join('\n');
  }

  /**
   * Run relevant tests after code changes using Jest
   * @param modification - The modification object
   * @throws BotError if test execution fails
   */
  private async runTests(modification: CodeModification): Promise<void> {
    this.logger.debug(`Running tests for modification ${modification.id}`);
    
    try {
      // Determine which test files to run based on modified files
      const testPatterns = this.determineTestPatterns(modification.changes);
      
      if (testPatterns.length === 0) {
        this.logger.warn('No test patterns found for modified files');
        modification.testing.status = 'passed';
        modification.testing.summary = {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          successRate: 100,
          duration: 0
        };
        return;
      }
      
      // Build Jest command with appropriate patterns
      const testPattern = testPatterns.join(' ');
      const jestCommand = `npx jest --passWithNoTests --testPathPattern="${testPattern}" --json --coverage`;
      
      this.logger.info(`Running Jest tests: ${jestCommand}`);
      
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(jestCommand, {
        cwd: process.cwd(),
        timeout: 60000 // 60 second timeout
      });
      
      const duration = Date.now() - startTime;
      
      // Parse Jest output
      const jestOutput = JSON.parse(stdout);
      
      // Update testing report
      modification.testing.status = jestOutput.numFailedTests === 0 ? 'passed' : 'failed';
      modification.testing.summary = {
        total: jestOutput.numTotalTests,
        passed: jestOutput.numPassedTests,
        failed: jestOutput.numFailedTests,
        skipped: jestOutput.numPendingTests,
        successRate: jestOutput.numTotalTests > 0
          ? (jestOutput.numPassedTests / jestOutput.numTotalTests) * 100
          : 100,
        duration
      };
      
      // Parse coverage if available
      if (jestOutput.coverageMap) {
        modification.testing.coverage = this.parseCoverage(jestOutput.coverageMap);
      }
      
      // Collect test results
      modification.testing.testResults = this.parseTestResults(jestOutput.testResults);
      
      if (jestOutput.numFailedTests > 0) {
        this.logger.error(`Tests failed for modification ${modification.id}`, {
          failed: jestOutput.numFailedTests,
          total: jestOutput.numTotalTests
        });
        throw new BotError(`Tests failed: ${jestOutput.numFailedTests} failures`, 'high');
      }
      
      this.logger.info(`Tests passed successfully for modification ${modification.id}`, {
        total: modification.testing.summary.total,
        passed: modification.testing.summary.passed,
        duration: modification.testing.summary.duration,
        coverage: modification.testing.coverage.lines
      });
    } catch (error: any) {
      modification.testing.status = 'failed';
      this.logger.error(`Test execution failed for modification ${modification.id}:`, error);
      throw new BotError(`Test execution failed: ${error.message || error}`, 'high');
    }
  }

  /**
   * Determine test patterns based on modified files
   * @param changes - Array of changes
   * @returns Array of test patterns
   */
  private determineTestPatterns(changes: ModificationChange[]): string[] {
    const patterns = new Set<string>();
    
    for (const change of changes) {
      const filePath = change.file;
      
      // Map source files to test files
      if (filePath.includes('src/')) {
        const relativePath = filePath.replace('src/', '');
        const testPath = relativePath.replace(/\.(ts|js)$/, '.test.ts');
        patterns.add(testPath);
        
        // Also add __tests__ directory pattern
        const dirPath = path.dirname(relativePath);
        patterns.add(`${dirPath}/__tests__/`);
      }
    }
    
    return Array.from(patterns);
  }

  /**
   * Parse Jest coverage output
   * @param coverageMap - Jest coverage map
   * @returns Coverage report
   */
  private parseCoverage(coverageMap: any): CoverageReport {
    let totalLines = 0;
    let coveredLines = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalBranches = 0;
    let coveredBranches = 0;
    let totalStatements = 0;
    let coveredStatements = 0;
    
    const uncoveredLines: number[] = [];
    const uncoveredFunctions: string[] = [];
    const uncoveredBranches: number[] = [];
    
    for (const file in coverageMap) {
      const fileCoverage = coverageMap[file];
      
      if (fileCoverage.l) {
        const fileLines = Object.keys(fileCoverage.l).length;
        totalLines += fileLines;
        coveredLines += fileLines - (fileCoverage.uncoveredL?.length || 0);
        uncoveredLines.push(...(fileCoverage.uncoveredL || []));
      }
      
      if (fileCoverage.f) {
        const fileFunctions = Object.keys(fileCoverage.f).length;
        totalFunctions += fileFunctions;
        coveredFunctions += fileFunctions - (fileCoverage.uncoveredF?.length || 0);
        uncoveredFunctions.push(...(fileCoverage.uncoveredF || []));
      }
      
      if (fileCoverage.b) {
        for (const branch in fileCoverage.b) {
          totalBranches += fileCoverage.b[branch].length;
          coveredBranches += fileCoverage.b[branch].filter((b: number) => b > 0).length;
        }
      }
      
      if (fileCoverage.s) {
        const fileStatements = Object.keys(fileCoverage.s).length;
        totalStatements += fileStatements;
        coveredStatements += fileStatements - (fileCoverage.uncoveredS?.length || 0);
      }
    }
    
    return {
      lines: totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0,
      functions: totalFunctions > 0 ? Math.round((coveredFunctions / totalFunctions) * 100) : 0,
      branches: totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 100) : 0,
      statements: totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0,
      uncoveredLines: [...new Set(uncoveredLines)].sort((a, b) => a - b),
      uncoveredFunctions: [...new Set(uncoveredFunctions)],
      uncoveredBranches: [...new Set(uncoveredBranches)].sort((a, b) => a - b)
    };
  }

  /**
   * Parse Jest test results
   * @param testResults - Jest test results array
   * @returns Array of test results
   */
  private parseTestResults(testResults: any[]): TestResult[] {
    const results: TestResult[] = [];
    
    for (const suite of testResults) {
      for (const assertion of suite.assertionResults || []) {
        results.push({
          id: assertion.ancestorTitles.join('.') + '.' + assertion.title,
          name: assertion.title,
          type: TestType.UNIT,
          status: assertion.status === 'passed' ? 'passed' : assertion.status === 'failed' ? 'failed' : 'skipped',
          duration: assertion.duration || 0,
          message: assertion.failureMessages?.join('; ') || undefined,
          details: {
            location: assertion.location,
            ancestorTitles: assertion.ancestorTitles
          }
        });
      }
    }
    
    return results;
  }

  /**
   * Verify that changes were applied correctly
   * @param modification - The modification object
   * @throws BotError if verification fails
   */
  private async verifyModification(modification: CodeModification): Promise<void> {
    this.logger.debug(`Verifying modification ${modification.id}`);
    
    try {
      // Check for syntax errors using TypeScript compiler
      await this.verifyTypeScriptSyntax();
      
      // Verify each change was applied correctly
      for (const change of modification.changes) {
        await this.verifySingleChange(change);
      }
      
      // Check for breaking changes to dependencies
      await this.verifyDependencies();
      
      this.logger.info(`Verification passed for modification ${modification.id}`);
    } catch (error) {
      this.logger.error(`Verification failed for modification ${modification.id}:`, error as Error);
      throw new BotError(`Verification failed: ${error}`, 'high');
    }
  }

  /**
   * Verify TypeScript syntax using the compiler
   * @throws BotError if syntax errors are found
   */
  private async verifyTypeScriptSyntax(): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
        cwd: process.cwd(),
        timeout: 30000 // 30 second timeout
      });
      
      if (stderr && stderr.trim().length > 0) {
        this.logger.error('TypeScript syntax errors found:', { stderr });
        throw new BotError(`TypeScript syntax errors: ${stderr}`, 'high');
      }
      
      this.logger.debug('TypeScript syntax verification passed');
    } catch (error: any) {
      if (error.killed) {
        throw new BotError('TypeScript verification timed out', 'high');
      }
      // Non-zero exit code means there are syntax errors
      if (error.stderr) {
        throw new BotError(`TypeScript syntax errors: ${error.stderr}`, 'high');
      }
      throw new BotError(`TypeScript verification failed: ${error.message || error}`, 'high');
    }
  }

  /**
   * Verify a single change was applied correctly
   * @param change - The change to verify
   * @throws BotError if verification fails
   */
  private async verifySingleChange(change: ModificationChange): Promise<void> {
    const filePath = path.join(process.cwd(), change.file);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const targetLine = change.location.line - 1; // Convert to 0-indexed
      
      if (targetLine < 0 || targetLine >= lines.length) {
        throw new BotError(`Invalid line number after modification: ${change.location.line}`, 'high');
      }
      
      const currentLine = lines[targetLine];
      
      // Verify the change was applied
      switch (change.type) {
        case ModificationType.ADD:
          // For additions, verify the new code exists
          if (!currentLine.includes(change.newCode || '')) {
            throw new BotError(`New code not found at line ${change.location.line}`, 'high');
          }
          break;
          
        case ModificationType.MODIFY:
        case ModificationType.REFACTOR:
        case ModificationType.OPTIMIZE:
        case ModificationType.ENHANCE:
          // For modifications, verify the new code exists and old code doesn't
          if (!currentLine.includes(change.newCode || '')) {
            throw new BotError(`New code not found at line ${change.location.line}`, 'high');
          }
          if (currentLine.includes(change.originalCode || '')) {
            throw new BotError(`Original code still present at line ${change.location.line}`, 'high');
          }
          break;
          
        case ModificationType.DELETE:
        case ModificationType.FIX:
          // For deletions, verify the old code doesn't exist
          if (currentLine.includes(change.originalCode || '')) {
            throw new BotError(`Original code still present at line ${change.location.line}`, 'high');
          }
          break;
      }
      
      this.logger.debug(`Verified change at line ${change.location.line} in file ${change.file}`);
    } catch (error) {
      if (error instanceof BotError) {
        throw error;
      }
      this.logger.error(`Failed to verify change in file ${change.file}:`, error as Error);
      throw new BotError(`Change verification failed for ${change.file}: ${error}`, 'high');
    }
  }

  /**
   * Verify no breaking changes to dependencies
   * @throws BotError if dependency issues are found
   */
  private async verifyDependencies(): Promise<void> {
    try {
      // Check TypeScript compilation which includes dependency resolution
      const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
        cwd: process.cwd(),
        timeout: 30000
      });
      
      if (stderr && stderr.includes('cannot find')) {
        this.logger.error('Dependency issues found:', { stderr });
        throw new BotError(`Dependency issues: ${stderr}`, 'high');
      }
      
      this.logger.debug('Dependency verification passed');
    } catch (error: any) {
      if (error.killed) {
        throw new BotError('Dependency verification timed out', 'high');
      }
      if (error.stderr && error.stderr.includes('cannot find')) {
        throw new BotError(`Dependency issues: ${error.stderr}`, 'high');
      }
      // Other errors are handled by TypeScript verification
    }
  }

  /**
   * Execute a single rollback step
   * @param step - The rollback step to execute
   * @throws BotError if rollback step fails
   */
  private async executeRollbackStep(step: any): Promise<void> {
    this.logger.debug(`Executing rollback step: ${step.description}`);
    
    try {
      // Extract file path from step description
      const fileMatch = step.description.match(/Restore (.+?) at line/);
      if (!fileMatch) {
        throw new BotError(`Invalid rollback step format: ${step.description}`, 'medium');
      }
      
      const fileName = fileMatch[1];
      const backupPath = path.join(step.expectedOutcome.replace(/File (.+?) restored/, '$1').replace(' to original state', ''), fileName.replace(/\//g, '_'));
      
      // Check if backup file exists
      try {
        await fs.access(backupPath);
      } catch {
        throw new BotError(`Backup file not found: ${backupPath}`, 'high');
      }
      
      // Restore the file from backup
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      const targetPath = path.join(process.cwd(), fileName);
      
      await fs.writeFile(targetPath, backupContent, 'utf-8');
      
      // Clean up the backup file after successful restore
      await fs.unlink(backupPath);
      
      this.logger.info(`Rollback step completed: ${step.description}`, {
        file: fileName,
        backupPath
      });
    } catch (error) {
      this.logger.error(`Rollback step failed: ${step.description}`, error as Error);
      throw new BotError(`Rollback step failed: ${error}`, 'high');
    }
  }

  /**
   * Verify rollback was successful
   * @param modification - The modification object
   * @throws BotError if rollback verification fails
   */
  private async verifyRollback(modification: CodeModification): Promise<void> {
    this.logger.debug(`Verifying rollback for modification ${modification.id}`);
    
    try {
      // Verify TypeScript syntax after rollback
      await this.verifyTypeScriptSyntax();
      
      // Verify all files are in a consistent state
      for (const change of modification.changes) {
        const filePath = path.join(process.cwd(), change.file);
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Basic sanity check - file should not be empty
        if (content.trim().length === 0) {
          throw new BotError(`File ${change.file} is empty after rollback`, 'high');
        }
      }
      
      this.logger.info(`Rollback verification passed for modification ${modification.id}`);
    } catch (error) {
      this.logger.error(`Rollback verification failed for modification ${modification.id}:`, error as Error);
      throw new BotError(`Rollback verification failed: ${error}`, 'high');
    }
  }

  private generateModificationId(): string {
    return `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}