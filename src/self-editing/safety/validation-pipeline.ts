/**
 * Validation Pipeline
 * 
 * Orchestrates all safety checks for self-editing operations.
 * Coordinates between analyzer, validator, and impact analyzer.
 */

import { Logger } from '../../utils/logger';
import { SelfEditingError } from '../../utils/errors';
import { SafetyAnalyzer, CodeAnalysisInput, StaticAnalysisResult, SafetyAnalyzerConfig } from '../../ai/safety/safety-analyzer';
import { SafetyValidator, ModificationContext, PreModificationValidationResult, PostModificationValidationResult, CombinedValidationResult, SafetyValidatorConfig } from './safety-validator';
import { ImpactAnalyzer, PreModificationImpactResult, PostModificationImpactResult, ImpactAnalyzerConfig } from './impact-analyzer';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Validation pipeline stage
 */
export enum PipelineStage {
  STATIC_ANALYSIS = 'static_analysis',
  SECURITY_SCANNING = 'security_scanning',
  CODE_QUALITY = 'code_quality',
  DEPENDENCY_VALIDATION = 'dependency_validation',
  DYNAMIC_ANALYSIS = 'dynamic_analysis',
  PERFORMANCE_IMPACT = 'performance_impact',
  BEHAVIORAL_CONSISTENCY = 'behavioral_consistency',
  HUMAN_REVIEW = 'human_review'
}

/**
 * Validation pipeline result
 */
export interface PipelineResult {
  pipelineId: string;
  modificationId: string;
  stage: PipelineStage;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

/**
 * Complete validation report
 */
export interface ValidationReport {
  pipelineId: string;
  modificationId: string;
  timestamp: Date;
  
  // Pre-modification results
  staticAnalysis?: StaticAnalysisResult;
  safetyValidation?: PreModificationValidationResult;
  impactAnalysis?: PreModificationImpactResult;
  
  // Post-modification results
  postModificationSafety?: PostModificationValidationResult;
  postModificationImpact?: PostModificationImpactResult;
  
  // Overall results
  overallPassed: boolean;
  canProceed: boolean;
  requiresHumanReview: boolean;
  recommendedAction: 'approve' | 'reject' | 'review' | 'modify';
  
  // Summary
  summary: string;
  violations: Array<{
    stage: string;
    rule: string;
    severity: string;
    reason: string;
  }>;
  warnings: Array<{
    stage: string;
    rule: string;
    reason: string;
  }>;
  recommendations: string[];
  
  // Performance metrics
  processingTime: number;
  totalStages: number;
  completedStages: number;
}

/**
 * Validation pipeline configuration
 */
export interface ValidationPipelineConfig {
  // Safety analyzer configuration
  safetyAnalyzer: SafetyAnalyzerConfig;
  
  // Safety validator configuration
  safetyValidator: SafetyValidatorConfig;
  
  // Impact analyzer configuration
  impactAnalyzer: ImpactAnalyzerConfig;
  
  // Pipeline settings
  enableParallelExecution: boolean;
  maxConcurrentValidations: number;
  timeoutPerStage: number;
  autoApproveSafeChanges: boolean;
  requireHumanReviewForCritical: boolean;
  
  // Approval workflow
  approvalWorkflow: 'automatic' | 'semi-automatic' | 'manual';
  approvalThresholds: {
    maxViolations: number;
    maxWarnings: number;
    maxCriticalIssues: number;
  };
}

/**
 * Stage result
 */
interface StageResult {
  stage: PipelineStage;
  status: 'completed' | 'failed';
  result: any;
  duration: number;
  error?: unknown;
}

// ============================================================================
// VALIDATION PIPELINE CLASS
// ============================================================================

export class ValidationPipeline {
  private logger: Logger;
  private config: ValidationPipelineConfig;
  private safetyAnalyzer: SafetyAnalyzer;
  private safetyValidator: SafetyValidator;
  private impactAnalyzer: ImpactAnalyzer;
  
  private pipelineHistory: Map<string, ValidationReport[]> = new Map();
  private activePipelines: Map<string, PipelineResult[]> = new Map();

  constructor(
    safetyAnalyzer: SafetyAnalyzer,
    safetyValidator: SafetyValidator,
    impactAnalyzer: ImpactAnalyzer,
    config: ValidationPipelineConfig,
    logger: Logger
  ) {
    this.logger = logger;
    this.config = config;
    
    // Initialize sub-components
    this.safetyAnalyzer = new SafetyAnalyzer(config.safetyAnalyzer, logger);
    this.safetyValidator = new SafetyValidator(config.safetyValidator, logger);
    this.impactAnalyzer = new ImpactAnalyzer(config.impactAnalyzer, logger);
  }

  /**
   * Run complete validation pipeline
   */
  public async validateModification(
    modification: ModificationContext
  ): Promise<ValidationReport> {
    const pipelineId = `pipeline_${modification.id}_${Date.now()}`;
    
    try {
      this.logger.info('Starting validation pipeline', {
        pipelineId,
        modificationId: modification.id,
        filePath: modification.filePath
      });

      const startTime = Date.now();
      
      // Initialize pipeline result
      const report: ValidationReport = {
        pipelineId,
        modificationId: modification.id,
        timestamp: new Date(),
        overallPassed: false,
        canProceed: false,
        requiresHumanReview: false,
        recommendedAction: 'reject',
        summary: '',
        violations: [],
        warnings: [],
        recommendations: [],
        processingTime: 0,
        totalStages: 0,
        completedStages: 0
      };

      // Execute validation stages
      const stages: StageResult[] = [];
      
      // Stage 1: Static Analysis
      if (this.config.safetyAnalyzer.enableCodeSecurityAnalysis) {
        const staticAnalysisResult = await this.executeStage(
          PipelineStage.STATIC_ANALYSIS,
          () => this.runStaticAnalysis(modification)
        );
        stages.push(staticAnalysisResult);
        
        if (staticAnalysisResult.status === 'completed') {
          report.staticAnalysis = staticAnalysisResult.result;
        }
      }
      
      // Stage 2: Safety Validation
      const safetyValidationResult = await this.executeStage(
        PipelineStage.SECURITY_SCANNING,
        () => this.runSafetyValidation(modification)
      );
      stages.push(safetyValidationResult);
      
      if (safetyValidationResult.status === 'completed') {
        report.safetyValidation = safetyValidationResult.result;
      }
      
      // Stage 3: Impact Analysis
      const impactAnalysisResult = await this.executeStage(
        PipelineStage.PERFORMANCE_IMPACT,
        () => this.runImpactAnalysis(modification)
      );
      stages.push(impactAnalysisResult);
      
      if (impactAnalysisResult.status === 'completed') {
        report.impactAnalysis = impactAnalysisResult.result;
      }
      
      // Calculate overall results
      this.calculateOverallResults(report);
      
      // Calculate processing time
      report.processingTime = Date.now() - startTime;
      report.totalStages = stages.length;
      report.completedStages = stages.filter(s => s.status === 'completed').length;
      
      // Log completion
      this.logger.info('Validation pipeline completed', {
        pipelineId,
        modificationId: modification.id,
        overallPassed: report.overallPassed,
        canProceed: report.canProceed,
        requiresHumanReview: report.requiresHumanReview,
        processingTime: report.processingTime,
        completedStages: report.completedStages,
        totalStages: report.totalStages
      });
      
      // Store in history
      this.storeReportInHistory(modification.id, report);
      
      return report;

    } catch (error) {
      this.logger.error('Validation pipeline failed:', error as Error);
      
      throw new SelfEditingError(
        `Validation pipeline failed: ${error}`,
        'critical',
        'ValidationPipeline',
        'validateModification',
        modification.id
      );
    }
  }

  /**
   * Run post-modification validation
   */
  public async validatePostModification(
    modification: ModificationContext
  ): Promise<ValidationReport> {
    const pipelineId = `pipeline_post_${modification.id}_${Date.now()}`;
    
    try {
      this.logger.info('Starting post-modification validation', {
        pipelineId,
        modificationId: modification.id,
        filePath: modification.filePath
      });

      const startTime = Date.now();
      
      // Initialize pipeline result
      const report: ValidationReport = {
        pipelineId,
        modificationId: modification.id,
        timestamp: new Date(),
        overallPassed: false,
        canProceed: false,
        requiresHumanReview: false,
        recommendedAction: 'reject',
        summary: '',
        violations: [],
        warnings: [],
        recommendations: [],
        processingTime: 0,
        totalStages: 0,
        completedStages: 0
      };

      // Execute post-modification validation stages
      const stages: StageResult[] = [];
      
      // Stage 1: Post-modification safety validation
      const postSafetyResult = await this.executeStage(
        PipelineStage.DYNAMIC_ANALYSIS,
        () => this.runPostSafetyValidation(modification)
      );
      stages.push(postSafetyResult);
      
      if (postSafetyResult.status === 'completed') {
        report.postModificationSafety = postSafetyResult.result;
      }
      
      // Stage 2: Post-modification impact monitoring
      const postImpactResult = await this.executeStage(
        PipelineStage.BEHAVIORAL_CONSISTENCY,
        () => this.runPostImpactMonitoring(modification)
      );
      stages.push(postImpactResult);
      
      if (postImpactResult.status === 'completed') {
        report.postModificationImpact = postImpactResult.result;
      }
      
      // Calculate overall results
      this.calculateOverallResults(report);
      
      // Calculate processing time
      report.processingTime = Date.now() - startTime;
      report.totalStages = stages.length;
      report.completedStages = stages.filter(s => s.status === 'completed').length;
      
      // Log completion
      this.logger.info('Post-modification validation completed', {
        pipelineId,
        modificationId: modification.id,
        overallPassed: report.overallPassed,
        canProceed: report.canProceed,
        requiresHumanReview: report.requiresHumanReview,
        processingTime: report.processingTime,
        completedStages: report.completedStages,
        totalStages: report.totalStages
      });
      
      // Store in history
      this.storeReportInHistory(modification.id, report);
      
      return report;

    } catch (error) {
      this.logger.error('Post-modification validation failed:', error as Error);
      
      throw new SelfEditingError(
        `Post-modification validation failed: ${error}`,
        'critical',
        'ValidationPipeline',
        'validatePostModification',
        modification.id
      );
    }
  }

  /**
   * Run validation pipeline with custom stages
   */
  public async validateWithCustomStages(
    modification: ModificationContext,
    stages: PipelineStage[]
  ): Promise<ValidationReport> {
    const pipelineId = `pipeline_custom_${modification.id}_${Date.now()}`;
    
    try {
      this.logger.info('Starting custom validation pipeline', {
        pipelineId,
        modificationId: modification.id,
        stages: stages.join(', ')
      });

      const startTime = Date.now();
      
      // Initialize pipeline result
      const report: ValidationReport = {
        pipelineId,
        modificationId: modification.id,
        timestamp: new Date(),
        overallPassed: false,
        canProceed: false,
        requiresHumanReview: false,
        recommendedAction: 'reject',
        summary: '',
        violations: [],
        warnings: [],
        recommendations: [],
        processingTime: 0,
        totalStages: 0,
        completedStages: 0
      };

      // Execute custom stages
      const stageResults: StageResult[] = [];
      
      for (const stage of stages) {
        let stageResult: StageResult;
        
        switch (stage) {
          case PipelineStage.STATIC_ANALYSIS:
            stageResult = await this.executeStage(
              stage,
              () => this.runStaticAnalysis(modification)
            );
            if (stageResult.status === 'completed') {
              report.staticAnalysis = stageResult.result;
            }
            break;
            
          case PipelineStage.SECURITY_SCANNING:
            stageResult = await this.executeStage(
              stage,
              () => this.runSafetyValidation(modification)
            );
            if (stageResult.status === 'completed') {
              report.safetyValidation = stageResult.result;
            }
            break;
            
          case PipelineStage.PERFORMANCE_IMPACT:
            stageResult = await this.executeStage(
              stage,
              () => this.runImpactAnalysis(modification)
            );
            if (stageResult.status === 'completed') {
              report.impactAnalysis = stageResult.result;
            }
            break;
            
          case PipelineStage.DYNAMIC_ANALYSIS:
            stageResult = await this.executeStage(
              stage,
              () => this.runPostSafetyValidation(modification)
            );
            if (stageResult.status === 'completed') {
              report.postModificationSafety = stageResult.result;
            }
            break;
            
          case PipelineStage.BEHAVIORAL_CONSISTENCY:
            stageResult = await this.executeStage(
              stage,
              () => this.runPostImpactMonitoring(modification)
            );
            if (stageResult.status === 'completed') {
              report.postModificationImpact = stageResult.result;
            }
            break;
            
          default:
            this.logger.warn('Unknown validation stage', { stage });
            stageResult = {
              stage,
              status: 'failed',
              result: null,
              duration: 0,
              error: new Error(`Unknown stage: ${stage}`)
            };
        }
        
        stageResults.push(stageResult);
      }
      
      // Calculate overall results
      this.calculateOverallResults(report);
      
      // Calculate processing time
      report.processingTime = Date.now() - startTime;
      report.totalStages = stageResults.length;
      report.completedStages = stageResults.filter(s => s.status === 'completed').length;
      
      // Log completion
      this.logger.info('Custom validation pipeline completed', {
        pipelineId,
        modificationId: modification.id,
        overallPassed: report.overallPassed,
        canProceed: report.canProceed,
        requiresHumanReview: report.requiresHumanReview,
        processingTime: report.processingTime,
        completedStages: report.completedStages,
        totalStages: report.totalStages
      });
      
      // Store in history
      this.storeReportInHistory(modification.id, report);
      
      return report;

    } catch (error) {
      this.logger.error('Custom validation pipeline failed:', error as Error);
      
      throw new SelfEditingError(
        `Custom validation pipeline failed: ${error}`,
        'critical',
        'ValidationPipeline',
        'validateWithCustomStages',
        modification.id
      );
    }
  }

  /**
   * Get validation history
   */
  public getValidationHistory(modificationId: string): ValidationReport[] {
    return this.pipelineHistory.get(modificationId) || [];
  }

  /**
   * Get all validation history
   */
  public getAllValidationHistory(): Map<string, ValidationReport[]> {
    return new Map(this.pipelineHistory);
  }

  /**
   * Clear validation history
   */
  public clearValidationHistory(modificationId?: string): void {
    if (modificationId) {
      this.pipelineHistory.delete(modificationId);
      this.logger.debug('Validation history cleared for modification', { modificationId });
    } else {
      this.pipelineHistory.clear();
      this.logger.debug('All validation history cleared');
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ValidationPipelineConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update sub-configurations
    this.safetyValidator.updateConfig(this.config.safetyValidator);
    this.impactAnalyzer.updateConfig(this.config.impactAnalyzer);
    
    this.logger.info('Validation pipeline configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfig(): ValidationPipelineConfig {
    return { ...this.config };
  }

  // ============================================================================
  // STAGE EXECUTION METHODS
  // ============================================================================

  /**
   * Execute a validation stage
   */
  private async executeStage<T>(
    stage: PipelineStage,
    stageFn: () => Promise<T>
  ): Promise<StageResult> {
    const stageStartTime = Date.now();
    
    try {
      this.logger.debug(`Executing stage: ${stage}`, {
        modificationId: stage.toString()
      });
      
      // Execute stage with timeout
      const result = await Promise.race([
        stageFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Stage timeout: ${stage}`)), this.config.timeoutPerStage)
        )
      ]);
      
      const duration = Date.now() - stageStartTime;
      
      this.logger.debug(`Stage completed: ${stage}`, {
        duration
      });
      
      return {
        stage,
        status: 'completed',
        result,
        duration
      };
      
    } catch (error) {
      const duration = Date.now() - stageStartTime;
      
      this.logger.error(`Stage failed: ${stage} (${(error as Error).message})`, error as Error);
      this.logger.debug(`Stage duration for failed stage: ${stage}`, { duration });
      
      return {
        stage,
        status: 'failed',
        result: null,
        duration,
        error
      };
    }
  }

  /**
   * Run static analysis
   */
  private async runStaticAnalysis(
    modification: ModificationContext
  ): Promise<StaticAnalysisResult> {
    const input: CodeAnalysisInput = {
      code: modification.code,
      filePath: modification.filePath,
      language: modification.language,
      dependencies: modification.dependencies
    };
    
    return this.safetyAnalyzer.analyzeCodeSecurity(input);
  }

  /**
   * Run safety validation
   */
  private async runSafetyValidation(
    modification: ModificationContext
  ): Promise<PreModificationValidationResult> {
    return this.safetyValidator.validatePreModification(modification);
  }

  /**
   * Run impact analysis
   */
  private async runImpactAnalysis(
    modification: ModificationContext
  ): Promise<PreModificationImpactResult> {
    return this.impactAnalyzer.analyzePreModificationImpact(modification);
  }

  /**
   * Run post-modification safety validation
   */
  private async runPostSafetyValidation(
    modification: ModificationContext
  ): Promise<PostModificationValidationResult> {
    return this.safetyValidator.validatePostModification(modification);
  }

  /**
   * Run post-modification impact monitoring
   */
  private async runPostImpactMonitoring(
    modification: ModificationContext
  ): Promise<PostModificationImpactResult> {
    return this.impactAnalyzer.monitorPostModificationImpact(modification);
  }

  // ============================================================================
  // RESULT CALCULATION METHODS
  // ============================================================================

  /**
   * Calculate overall results
   */
  private calculateOverallResults(report: ValidationReport): void {
    const violations: Array<{
      stage: string;
      rule: string;
      severity: string;
      reason: string;
    }> = [];
    
    const warnings: Array<{
      stage: string;
      rule: string;
      reason: string;
    }> = [];
    
    const recommendations: string[] = [];
    
    // Collect violations from all stages
    if (report.staticAnalysis) {
      for (const finding of report.staticAnalysis.securityFindings) {
        violations.push({
          stage: 'static_analysis',
          rule: finding.type,
          severity: finding.severity,
          reason: finding.description
        });
      }
    }
    
    if (report.safetyValidation) {
      for (const violation of report.safetyValidation.violations) {
        violations.push({
          stage: 'safety_validation',
          rule: violation.rule,
          severity: violation.severity,
          reason: violation.reason
        });
      }
      
      for (const warning of report.safetyValidation.warnings) {
        warnings.push({
          stage: 'safety_validation',
          rule: warning.rule,
          reason: warning.reason
        });
      }
    }
    
    if (report.impactAnalysis) {
      for (const risk of report.impactAnalysis.risks) {
        violations.push({
          stage: 'impact_analysis',
          rule: risk.type,
          severity: risk.severity,
          reason: risk.description
        });
      }
      
      for (const recommendation of report.impactAnalysis.recommendations) {
        if (!recommendations.includes(recommendation)) {
          recommendations.push(recommendation);
        }
      }
    }
    
    if (report.postModificationSafety) {
      for (const violation of report.postModificationSafety.violations) {
        violations.push({
          stage: 'post_safety_validation',
          rule: violation.rule,
          severity: violation.severity,
          reason: violation.reason
        });
      }
      
      for (const warning of report.postModificationSafety.warnings) {
        warnings.push({
          stage: 'post_safety_validation',
          rule: warning.rule,
          reason: warning.reason
        });
      }
    }
    
    if (report.postModificationImpact) {
      for (const deviation of report.postModificationImpact.deviations) {
        if (deviation.severity === 'high' || deviation.severity === 'critical') {
          violations.push({
            stage: 'post_impact_monitoring',
            rule: deviation.category,
            severity: deviation.severity,
            reason: `Significant deviation: ${deviation.actual}%`
          });
        } else {
          warnings.push({
            stage: 'post_impact_monitoring',
            rule: deviation.category,
            reason: `Deviation: ${deviation.actual}%`
          });
        }
      }
      
      if (report.postModificationImpact.rollbackTriggered) {
        violations.push({
          stage: 'post_impact_monitoring',
          rule: 'rollback',
          severity: 'critical',
          reason: report.postModificationImpact.rollbackReason || 'Rollback triggered'
        });
      }
    }
    
    // Determine overall status
    const hasCriticalViolations = violations.some(v => v.severity === 'critical');
    const hasHighViolations = violations.some(v => v.severity === 'high');
    const totalViolations = violations.length;
    
    // Apply approval workflow
    if (this.config.approvalWorkflow === 'automatic') {
      report.overallPassed = totalViolations === 0;
      report.canProceed = totalViolations === 0;
      report.requiresHumanReview = false;
      report.recommendedAction = totalViolations === 0 ? 'approve' : 'reject';
    } else if (this.config.approvalWorkflow === 'semi-automatic') {
      report.overallPassed = !hasCriticalViolations;
      report.canProceed = !hasCriticalViolations;
      report.requiresHumanReview = hasCriticalViolations || hasHighViolations;
      report.recommendedAction = hasCriticalViolations ? 'review' : (totalViolations === 0 ? 'approve' : 'modify');
    } else {
      report.overallPassed = false;
      report.canProceed = false;
      report.requiresHumanReview = true;
      report.recommendedAction = 'review';
    }
    
    // Apply thresholds
    if (totalViolations > this.config.approvalThresholds.maxViolations) {
      report.overallPassed = false;
      report.canProceed = false;
      report.requiresHumanReview = true;
      report.recommendedAction = 'reject';
    }
    
    if (warnings.length > this.config.approvalThresholds.maxWarnings) {
      report.requiresHumanReview = true;
      if (report.recommendedAction === 'approve') {
        report.recommendedAction = 'review';
      }
    }
    
    // Generate summary
    report.summary = this.generateSummary(report, violations, warnings, recommendations);
    
    report.violations = violations;
    report.warnings = warnings;
    report.recommendations = recommendations;
  }

  /**
   * Generate summary
   */
  private generateSummary(
    report: ValidationReport,
    violations: Array<{
      stage: string;
      rule: string;
      severity: string;
      reason: string;
    }>,
    warnings: Array<{
      stage: string;
      rule: string;
      reason: string;
    }>,
    recommendations: string[]
  ): string {
    const parts: string[] = [];
    
    if (violations.length > 0) {
      const criticalCount = violations.filter(v => v.severity === 'critical').length;
      const highCount = violations.filter(v => v.severity === 'high').length;
      const mediumCount = violations.filter(v => v.severity === 'medium').length;
      const lowCount = violations.filter(v => v.severity === 'low').length;
      
      parts.push(
        `Found ${violations.length} violations: ` +
        `${criticalCount} critical, ${highCount} high, ${mediumCount} medium, ${lowCount} low.`
      );
    }
    
    if (warnings.length > 0) {
      parts.push(`${warnings.length} warnings detected.`);
    }
    
    if (recommendations.length > 0) {
      parts.push(`${recommendations.length} recommendations generated.`);
    }
    
    if (report.overallPassed) {
      parts.push('Validation passed. Modification can proceed.');
    } else {
      parts.push('Validation failed. Modification requires review.');
    }
    
    return parts.join(' ');
  }

  /**
   * Store report in history
   */
  private storeReportInHistory(modificationId: string, report: ValidationReport): void {
    if (!this.pipelineHistory.has(modificationId)) {
      this.pipelineHistory.set(modificationId, []);
    }
    
    const history = this.pipelineHistory.get(modificationId)!;
    history.push(report);
    
    // Keep only last 100 reports per modification
    if (history.length > 100) {
      this.pipelineHistory.set(modificationId, history.slice(-100));
    }
  }
}
