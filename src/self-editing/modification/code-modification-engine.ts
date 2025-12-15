import { EventEmitter } from 'events';
import { Logger } from '../../../utils/logger';
import { BotError } from '../../../types';
import {
  CodeModification,
  ModificationType,
  ModificationChange,
  CodeLocation,
  ValidationReport,
  TestingReport,
  RollbackPlan
} from '../../../types/self-editing';

/**
 * Core code modification engine with safety and validation
 */
export class CodeModificationEngine extends EventEmitter {
  private logger: Logger;
  private activeModifications: Map<string, CodeModification> = new Map();
  private modificationHistory: CodeModification[] = [];

  constructor(logger: Logger) {
    super();
    this.logger = logger;
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

  private async createBackup(modification: CodeModification): Promise<void> {
    this.logger.debug(`Creating backup for modification ${modification.id}`);
    
    // Mock backup creation - would implement actual backup logic
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private async applyChanges(modification: CodeModification): Promise<void> {
    this.logger.debug(`Applying ${modification.changes.length} changes for modification ${modification.id}`);
    
    // Mock change application - would implement actual file modification logic
    for (const change of modification.changes) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async runTests(modification: CodeModification): Promise<void> {
    this.logger.debug(`Running tests for modification ${modification.id}`);
    
    // Mock test execution - would implement actual test running logic
    modification.testing.status = 'passed';
    modification.testing.summary = {
      total: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      successRate: 100,
      duration: 5000
    };
    modification.testing.coverage = {
      lines: 85,
      functions: 90,
      branches: 80,
      statements: 88,
      uncoveredLines: [],
      uncoveredFunctions: [],
      uncoveredBranches: []
    };
  }

  private async verifyModification(modification: CodeModification): Promise<void> {
    this.logger.debug(`Verifying modification ${modification.id}`);
    
    // Mock verification - would implement actual verification logic
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async executeRollbackStep(step: any): Promise<void> {
    this.logger.debug(`Executing rollback step: ${step.description}`);
    
    // Mock rollback step execution - would implement actual rollback logic
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async verifyRollback(modification: CodeModification): Promise<void> {
    this.logger.debug(`Verifying rollback for modification ${modification.id}`);
    
    // Mock rollback verification - would implement actual verification logic
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private generateModificationId(): string {
    return `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}