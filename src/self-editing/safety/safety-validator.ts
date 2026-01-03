/**
 * Safety Validator
 * 
 * Comprehensive safety validation for self-editing operations.
 * Implements multi-stage validation including pre-modification and post-modification checks.
 */

import { Logger } from '../../utils/logger';
import { SelfEditingError } from '../../utils/errors';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Validation stage
 */
export enum ValidationStage {
  PRE_MODIFICATION = 'pre_modification',
  POST_MODIFICATION = 'post_modification',
  RUNTIME_VALIDATION = 'runtime_validation'
}

/**
 * Validation result
 */
export enum ValidationResult {
  PASSED = 'passed',
  FAILED = 'failed',
  WARNING = 'warning',
  SKIPPED = 'skipped'
}

/**
 * Rule severity
 */
export enum RuleSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Validation rule
 */
export interface ValidationRule {
  name: string;
  description: string;
  stage: ValidationStage;
  severity: RuleSeverity;
  enabled: boolean;
  validate: (modification: ModificationContext) => Promise<RuleResult>;
}

/**
 * Rule result
 */
export interface RuleResult {
  passed: boolean;
  severity: RuleSeverity;
  message: string;
  details?: string;
  suggestions?: string[];
}

/**
 * Modification context
 */
export interface ModificationContext {
  id: string;
  code: string;
  filePath?: string;
  language?: string;
  originalCode?: string;
  dependencies?: Array<{ name: string; version: string }>;
  metadata?: Record<string, any>;
  timestamp: Date;
}

/**
 * Pre-modification validation result
 */
export interface PreModificationValidationResult {
  stage: ValidationStage.PRE_MODIFICATION;
  passed: boolean;
  rules: Array<{
    ruleName: string;
    result: RuleResult;
  }>;
  violations: Array<{
    rule: string;
    severity: RuleSeverity;
    reason: string;
    details?: string;
    suggestions?: string[];
  }>;
  warnings: Array<{
    rule: string;
    reason: string;
  }>;
  codeQuality?: CodeQualityReport;
  securityAnalysis?: SecurityAnalysisReport;
  dependencyValidation?: DependencyValidationReport;
  performanceImpact?: PerformanceImpactReport;
}

/**
 * Post-modification validation result
 */
export interface PostModificationValidationResult {
  stage: ValidationStage.POST_MODIFICATION;
  passed: boolean;
  rules: Array<{
    ruleName: string;
    result: RuleResult;
  }>;
  violations: Array<{
    rule: string;
    severity: RuleSeverity;
    reason: string;
    details?: string;
  }>;
  warnings: Array<{
    rule: string;
    reason: string;
  }>;
  runtimeChecks?: RuntimeValidationReport;
  rollbackTriggered: boolean;
  rollbackReason?: string;
}

/**
 * Code quality report
 */
export interface CodeQualityReport {
  overallScore: number;
  metrics: {
    cyclomaticComplexity: number;
    maintainabilityIndex: number;
    linesOfCode: number;
    commentRatio: number;
    functionCount: number;
    averageFunctionLength: number;
    duplicateLines: number;
    technicalDebtRatio: number;
  };
  passed: boolean;
  issues: Array<{
    type: string;
    severity: RuleSeverity;
    message: string;
    location?: string;
  }>;
}

/**
 * Security analysis report
 */
export interface SecurityAnalysisReport {
  overallScore: number;
  vulnerabilities: Array<{
    type: string;
    severity: RuleSeverity;
    description: string;
    recommendation: string;
    confidence: number;
  }>;
  passed: boolean;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

/**
 * Dependency validation report
 */
export interface DependencyValidationReport {
  passed: boolean;
  dependencies: Array<{
    name: string;
    version: string;
    hasVulnerabilities: boolean;
    vulnerabilities: number;
    deprecated: boolean;
    license: string;
  }>;
  breakingChanges: Array<{
    package: string;
    fromVersion: string;
    toVersion: string;
    description: string;
  }>;
  compatibilityIssues: number;
}

/**
 * Performance impact report
 */
export interface PerformanceImpactReport {
  estimatedImpact: 'low' | 'medium' | 'high' | 'critical';
  metrics: {
    cpuImpact: number;
    memoryImpact: number;
    latencyImpact: number;
    throughputImpact: number;
  };
  passed: boolean;
  concerns: Array<{
    type: string;
    severity: RuleSeverity;
    description: string;
    mitigation?: string;
  }>;
}

/**
 * Runtime validation report
 */
export interface RuntimeValidationReport {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message?: string;
  }>;
  errors: Array<{
    type: string;
    message: string;
    stack?: string;
  }>;
  resourceUsage: {
    cpu: number;
    memory: number;
    duration: number;
  };
}

/**
 * Safety validator configuration
 */
export interface SafetyValidatorConfig {
  // Validation thresholds
  maxCyclomaticComplexity: number;
  minMaintainabilityIndex: number;
  minCommentRatio: number;
  maxTechnicalDebtRatio: number;
  
  // Security thresholds
  allowCriticalVulnerabilities: boolean;
  allowHighVulnerabilities: boolean;
  maxHighVulnerabilities: number;
  
  // Performance thresholds
  maxCpuImpact: number;
  maxMemoryImpact: number;
  maxLatencyImpact: number;
  
  // Dependency thresholds
  allowDeprecatedDependencies: boolean;
  allowBreakingChanges: boolean;
  
  // Runtime validation
  enableRuntimeValidation: boolean;
  validationTimeout: number;
  
  // General settings
  strictMode: boolean;
  autoApproveSafeChanges: boolean;
  requireHumanReviewForCritical: boolean;
}

/**
 * Combined validation result
 */
export interface CombinedValidationResult {
  preModification: PreModificationValidationResult;
  postModification?: PostModificationValidationResult;
  overallPassed: boolean;
  canProceed: boolean;
  requiresHumanReview: boolean;
  recommendedAction: 'approve' | 'reject' | 'review' | 'modify';
  summary: string;
}

// ============================================================================
// SAFETY VALIDATOR CLASS
// ============================================================================

export class SafetyValidator {
  private logger: Logger;
  private config: SafetyValidatorConfig;
  private safetyRules: Map<ValidationStage, ValidationRule[]> = new Map();
  private validationHistory: Map<string, CombinedValidationResult[]> = new Map();

  constructor(config: SafetyValidatorConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
    this.initializeSafetyRules();
  }

  /**
   * Run pre-modification validation
   */
  public async validatePreModification(
    modification: ModificationContext
  ): Promise<PreModificationValidationResult> {
    try {
      this.logger.info('Starting pre-modification validation', {
        modificationId: modification.id,
        filePath: modification.filePath
      });

      const startTime = Date.now();

      const result: PreModificationValidationResult = {
        stage: ValidationStage.PRE_MODIFICATION,
        passed: false,
        rules: [],
        violations: [],
        warnings: []
      };

      // Get rules for pre-modification stage
      const rules = this.safetyRules.get(ValidationStage.PRE_MODIFICATION) || [];

      // Run all validation rules
      for (const rule of rules) {
        if (!rule.enabled) {
          continue;
        }

        try {
          const ruleResult = await rule.validate(modification);
          result.rules.push({
            ruleName: rule.name,
            result: ruleResult
          });

          if (!ruleResult.passed) {
            if (rule.severity === RuleSeverity.CRITICAL || rule.severity === RuleSeverity.HIGH) {
              result.violations.push({
                rule: rule.name,
                severity: rule.severity,
                reason: ruleResult.message,
                details: ruleResult.details,
                suggestions: ruleResult.suggestions
              });
            } else {
              result.warnings.push({
                rule: rule.name,
                reason: ruleResult.message
              });
            }
          }
        } catch (error) {
          this.logger.error(`Validation rule ${rule.name} failed:`, error as Error);
          result.violations.push({
            rule: rule.name,
            severity: RuleSeverity.HIGH,
            reason: `Rule execution failed: ${error}`,
            details: (error as Error).message
          });
        }
      }

      // Determine if validation passed
      result.passed = result.violations.length === 0;

      // Log results
      this.logger.info('Pre-modification validation completed', {
        modificationId: modification.id,
        passed: result.passed,
        violations: result.violations.length,
        warnings: result.warnings.length,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Pre-modification validation failed:', error as Error);
      throw new SelfEditingError(
        `Pre-modification validation failed: ${error}`,
        'high',
        'SafetyValidator',
        'validatePreModification',
        modification.id
      );
    }
  }

  /**
   * Run post-modification validation
   */
  public async validatePostModification(
    modification: ModificationContext
  ): Promise<PostModificationValidationResult> {
    try {
      this.logger.info('Starting post-modification validation', {
        modificationId: modification.id,
        filePath: modification.filePath
      });

      const startTime = Date.now();

      const result: PostModificationValidationResult = {
        stage: ValidationStage.POST_MODIFICATION,
        passed: false,
        rules: [],
        violations: [],
        warnings: [],
        rollbackTriggered: false
      };

      // Get rules for post-modification stage
      const rules = this.safetyRules.get(ValidationStage.POST_MODIFICATION) || [];

      // Run all validation rules
      for (const rule of rules) {
        if (!rule.enabled) {
          continue;
        }

        try {
          const ruleResult = await rule.validate(modification);
          result.rules.push({
            ruleName: rule.name,
            result: ruleResult
          });

          if (!ruleResult.passed) {
            if (rule.severity === RuleSeverity.CRITICAL || rule.severity === RuleSeverity.HIGH) {
              result.violations.push({
                rule: rule.name,
                severity: rule.severity,
                reason: ruleResult.message,
                details: ruleResult.details
              });

              // Trigger rollback for critical violations
              if (rule.severity === RuleSeverity.CRITICAL) {
                result.rollbackTriggered = true;
                result.rollbackReason = ruleResult.message;
              }
            } else {
              result.warnings.push({
                rule: rule.name,
                reason: ruleResult.message
              });
            }
          }
        } catch (error) {
          this.logger.error(`Validation rule ${rule.name} failed:`, error as Error);
          result.violations.push({
            rule: rule.name,
            severity: RuleSeverity.HIGH,
            reason: `Rule execution failed: ${error}`,
            details: (error as Error).message
          });
        }
      }

      // Determine if validation passed
      result.passed = result.violations.length === 0;

      // Log results
      this.logger.info('Post-modification validation completed', {
        modificationId: modification.id,
        passed: result.passed,
        violations: result.violations.length,
        warnings: result.warnings.length,
        rollbackTriggered: result.rollbackTriggered,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Post-modification validation failed:', error as Error);
      throw new SelfEditingError(
        `Post-modification validation failed: ${error}`,
        'high',
        'SafetyValidator',
        'validatePostModification',
        modification.id
      );
    }
  }

  /**
   * Run full validation pipeline
   */
  public async validateModification(
    modification: ModificationContext
  ): Promise<CombinedValidationResult> {
    try {
      // Run pre-modification validation
      const preModificationResult = await this.validatePreModification(modification);

      const result: CombinedValidationResult = {
        preModification: preModificationResult,
        overallPassed: false,
        canProceed: false,
        requiresHumanReview: false,
        recommendedAction: 'reject',
        summary: ''
      };

      // Check if pre-modification passed
      if (!preModificationResult.passed) {
        result.overallPassed = false;
        result.canProceed = false;
        result.recommendedAction = 'reject';
        result.summary = `Pre-modification validation failed with ${preModificationResult.violations.length} violations`;
        result.requiresHumanReview = true;
        return result;
      }

      // Auto-approve safe changes if configured
      if (this.config.autoApproveSafeChanges && preModificationResult.warnings.length === 0) {
        result.overallPassed = true;
        result.canProceed = true;
        result.recommendedAction = 'approve';
        result.summary = 'All pre-modification checks passed, auto-approved';
        return result;
      }

      // Require human review for critical changes
      if (this.config.requireHumanReviewForCritical) {
        const hasCriticalIssues = preModificationResult.violations.some(
          v => v.severity === RuleSeverity.CRITICAL
        );
        if (hasCriticalIssues) {
          result.overallPassed = false;
          result.canProceed = false;
          result.recommendedAction = 'review';
          result.summary = 'Critical issues detected, requires human review';
          result.requiresHumanReview = true;
          return result;
        }
      }

      // Safe to proceed
      result.overallPassed = true;
      result.canProceed = true;
      result.recommendedAction = 'approve';
      result.summary = `Pre-modification validation passed with ${preModificationResult.warnings.length} warnings`;

      return result;

    } catch (error) {
      this.logger.error('Validation pipeline failed:', error as Error);
      throw new SelfEditingError(
        `Validation pipeline failed: ${error}`,
        'critical',
        'SafetyValidator',
        'validateModification',
        modification.id
      );
    }
  }

  /**
   * Add custom validation rule
   */
  public addValidationRule(rule: ValidationRule): void {
    if (!this.safetyRules.has(rule.stage)) {
      this.safetyRules.set(rule.stage, []);
    }
    
    this.safetyRules.get(rule.stage)!.push(rule);
    
    this.logger.info('Validation rule added', {
      name: rule.name,
      stage: rule.stage,
      severity: rule.severity
    });
  }

  /**
   * Remove validation rule
   */
  public removeValidationRule(stage: ValidationStage, ruleName: string): boolean {
    const rules = this.safetyRules.get(stage);
    if (!rules) {
      return false;
    }

    const initialLength = rules.length;
    this.safetyRules.set(
      stage,
      rules.filter(rule => rule.name !== ruleName)
    );
    
    const removed = this.safetyRules.get(stage)!.length < initialLength;
    
    if (removed) {
      this.logger.info('Validation rule removed', {
        name: ruleName,
        stage
      });
    }
    
    return removed;
  }

  /**
   * Get all validation rules
   */
  public getValidationRules(): Array<{
    name: string;
    description: string;
    stage: ValidationStage;
    severity: RuleSeverity;
    enabled: boolean;
  }> {
    const allRules: Array<{
      name: string;
      description: string;
      stage: ValidationStage;
      severity: RuleSeverity;
      enabled: boolean;
    }> = [];

    for (const [stage, rules] of this.safetyRules.entries()) {
      for (const rule of rules) {
        allRules.push({
          name: rule.name,
          description: rule.description,
          stage: rule.stage,
          severity: rule.severity,
          enabled: rule.enabled
        });
      }
    }

    return allRules;
  }

  /**
   * Enable/disable validation rule
   */
  public setRuleEnabled(stage: ValidationStage, ruleName: string, enabled: boolean): boolean {
    const rules = this.safetyRules.get(stage);
    if (!rules) {
      return false;
    }

    const rule = rules.find(r => r.name === ruleName);
    if (!rule) {
      return false;
    }

    rule.enabled = enabled;
    
    this.logger.info('Validation rule enabled/disabled', {
      name: ruleName,
      enabled
    });
    
    return true;
  }

  /**
   * Get validation history
   */
  public getValidationHistory(modificationId: string): CombinedValidationResult[] {
    return this.validationHistory.get(modificationId) || [];
  }

  /**
   * Clear validation history
   */
  public clearValidationHistory(modificationId?: string): void {
    if (modificationId) {
      this.validationHistory.delete(modificationId);
      this.logger.debug('Validation history cleared for modification', { modificationId });
    } else {
      this.validationHistory.clear();
      this.logger.debug('All validation history cleared');
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<SafetyValidatorConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Safety validator configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfig(): SafetyValidatorConfig {
    return { ...this.config };
  }

  /**
   * Initialize safety rules
   */
  private initializeSafetyRules(): void {
    // Pre-modification rules
    this.safetyRules.set(ValidationStage.PRE_MODIFICATION, [
      this.createNoSystemCallsRule(),
      this.createNoNetworkAccessRule(),
      this.createNoFileSystemAccessRule(),
      this.createNoEvalRule(),
      this.createNoInfiniteLoopsRule(),
      this.createMemoryUsageRule(),
      this.createCodeSizeLimitRule(),
      this.createCodeQualityRule(),
      this.createSecurityScanRule(),
      this.createDependencyValidationRule(),
      this.createPerformanceImpactRule(),
      this.createInputSanitizationRule(),
      this.createOutputEncodingRule()
    ]);

    // Post-modification rules
    this.safetyRules.set(ValidationStage.POST_MODIFICATION, [
      this.createRuntimeBehaviorRule(),
      this.createResourceUsageRule(),
      this.createErrorRateRule(),
      this.createPerformanceRegressionRule(),
      this.createBehavioralConsistencyRule()
    ]);
  }

  // ============================================================================
  // PRE-MODIFICATION RULES
  // ============================================================================

  private createNoSystemCallsRule(): ValidationRule {
    return {
      name: 'no-system-calls',
      description: 'Prevent direct system calls',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.CRITICAL,
      enabled: true,
      validate: async (modification) => {
        const dangerousPatterns = [
          'require(\'child_process\')',
          'require(\'fs\')',
          'process.exit',
          'process.kill',
          'execSync',
          'spawnSync'
        ];
        
        const code = modification.code || '';
        const hasDangerousPattern = dangerousPatterns.some(pattern => 
          code.includes(pattern)
        );
        
        return {
          passed: !hasDangerousPattern,
          severity: RuleSeverity.CRITICAL,
          message: hasDangerousPattern ? 'Contains dangerous system calls' : 'No dangerous system calls detected',
          details: hasDangerousPattern ? 'Direct system calls can compromise system security and stability' : undefined,
          suggestions: hasDangerousPattern ? ['Use sandboxed APIs instead of direct system calls', 'Implement proper permission checks'] : undefined
        };
      }
    };
  }

  private createNoNetworkAccessRule(): ValidationRule {
    return {
      name: 'no-network-access',
      description: 'Prevent unauthorized network access',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.HIGH,
      enabled: true,
      validate: async (modification) => {
        const networkPatterns = [
          'fetch(',
          'http.request',
          'https.request',
          'socket.connect',
          'net.connect'
        ];
        
        const code = modification.code || '';
        const hasNetworkPattern = networkPatterns.some(pattern => 
          code.includes(pattern)
        );
        
        return {
          passed: !hasNetworkPattern,
          severity: RuleSeverity.HIGH,
          message: hasNetworkPattern ? 'Contains unauthorized network access' : 'No unauthorized network access detected',
          details: hasNetworkPattern ? 'Network access should be explicitly authorized and validated' : undefined,
          suggestions: hasNetworkPattern ? ['Use whitelisted endpoints only', 'Implement rate limiting', 'Add authentication'] : undefined
        };
      }
    };
  }

  private createNoFileSystemAccessRule(): ValidationRule {
    return {
      name: 'no-file-system-access',
      description: 'Prevent file system access',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.HIGH,
      enabled: true,
      validate: async (modification) => {
        const fsPatterns = [
          'fs.',
          'require(\'fs\')',
          'readFileSync',
          'writeFileSync',
          'unlinkSync',
          'readdirSync'
        ];
        
        const code = modification.code || '';
        const hasFsPattern = fsPatterns.some(pattern => 
          code.includes(pattern)
        );
        
        return {
          passed: !hasFsPattern,
          severity: RuleSeverity.HIGH,
          message: hasFsPattern ? 'Contains file system access' : 'No file system access detected',
          details: hasFsPattern ? 'File system access should be restricted to authorized paths' : undefined,
          suggestions: hasFsPattern ? ['Use sandboxed file access', 'Implement path validation', 'Add permission checks'] : undefined
        };
      }
    };
  }

  private createNoEvalRule(): ValidationRule {
    return {
      name: 'no-eval-or-function-constructor',
      description: 'Prevent dynamic code execution',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.CRITICAL,
      enabled: true,
      validate: async (modification) => {
        const dangerousPatterns = ['eval(', 'Function(', 'new Function'];
        
        const code = modification.code || '';
        const hasDangerousPattern = dangerousPatterns.some(pattern => 
          code.includes(pattern)
        );
        
        return {
          passed: !hasDangerousPattern,
          severity: RuleSeverity.CRITICAL,
          message: hasDangerousPattern ? 'Contains dynamic code execution' : 'No dynamic code execution detected',
          details: hasDangerousPattern ? 'Dynamic code execution is a major security risk' : undefined,
          suggestions: hasDangerousPattern ? ['Use safer alternatives like object property access', 'Implement proper input validation', 'Use template literals instead'] : undefined
        };
      }
    };
  }

  private createNoInfiniteLoopsRule(): ValidationRule {
    return {
      name: 'no-infinite-loops',
      description: 'Prevent potential infinite loops',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.MEDIUM,
      enabled: true,
      validate: async (modification) => {
        const loopPatterns = ['while(true)', 'for(;;)', 'while(1)'];
        
        const code = modification.code || '';
        const hasLoopPattern = loopPatterns.some(pattern => 
          code.includes(pattern)
        );
        
        return {
          passed: !hasLoopPattern,
          severity: RuleSeverity.MEDIUM,
          message: hasLoopPattern ? 'Contains potential infinite loop' : 'No infinite loops detected',
          details: hasLoopPattern ? 'Infinite loops can cause system hang and resource exhaustion' : undefined,
          suggestions: hasLoopPattern ? ['Add loop termination conditions', 'Implement timeout mechanisms', 'Use bounded iteration'] : undefined
        };
      }
    };
  }

  private createMemoryUsageRule(): ValidationRule {
    return {
      name: 'memory-usage-check',
      description: 'Check for memory-intensive operations',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.MEDIUM,
      enabled: true,
      validate: async (modification) => {
        const code = modification.code || '';
        const memoryIntensivePatterns = [
          'new Array(',
          'new Buffer(',
          'Array(',
          'fill(',
          'repeat('
        ];
        
        const hasMemoryIntensive = memoryIntensivePatterns.some(pattern => 
          code.includes(pattern)
        );
        
        // Check for large array allocations
        const largeArrayPattern = /new\s+Array\s*\(\s*\d{4,}\s*\)/g;
        const hasLargeArray = largeArrayPattern.test(code);
        
        return {
          passed: !hasLargeArray,
          severity: RuleSeverity.MEDIUM,
          message: hasLargeArray ? 'Contains memory-intensive operations' : 'Memory usage is within acceptable limits',
          details: hasLargeArray ? 'Large memory allocations can cause performance issues' : undefined,
          suggestions: hasLargeArray ? ['Use streaming or pagination', 'Implement memory pooling', 'Add memory limits'] : undefined
        };
      }
    };
  }

  private createCodeSizeLimitRule(): ValidationRule {
    return {
      name: 'code-size-limit',
      description: 'Limit code size to prevent bloat',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.LOW,
      enabled: true,
      validate: async (modification) => {
        const code = modification.code || '';
        const maxSize = 10000; // 10KB limit
        
        const codeSize = code.length;
        const exceedsLimit = codeSize > maxSize;
        
        return {
          passed: !exceedsLimit,
          severity: RuleSeverity.LOW,
          message: exceedsLimit ? `Code size ${codeSize} exceeds limit ${maxSize}` : 'Code size is within limits',
          details: exceedsLimit ? 'Large code changes increase review burden and risk' : undefined,
          suggestions: exceedsLimit ? ['Break down into smaller changes', 'Remove unused code', 'Consider refactoring'] : undefined
        };
      }
    };
  }

  private createCodeQualityRule(): ValidationRule {
    return {
      name: 'code-quality-check',
      description: 'Check code quality metrics',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.MEDIUM,
      enabled: true,
      validate: async (modification) => {
        const code = modification.code || '';
        
        // Calculate basic metrics
        const lines = code.split('\n').length;
        const complexity = this.calculateComplexity(code);
        
        const exceedsComplexity = complexity > this.config.maxCyclomaticComplexity;
        const exceedsSize = lines > 500;
        
        return {
          passed: !exceedsComplexity && !exceedsSize,
          severity: RuleSeverity.MEDIUM,
          message: exceedsComplexity || exceedsSize 
            ? 'Code quality concerns detected' 
            : 'Code quality is acceptable',
          details: exceedsComplexity || exceedsSize
            ? `Complexity: ${complexity}, Lines: ${lines}`
            : undefined,
          suggestions: exceedsComplexity || exceedsSize
            ? ['Reduce cyclomatic complexity', 'Break down large functions', 'Improve code readability']
            : undefined
        };
      }
    };
  }

  private createSecurityScanRule(): ValidationRule {
    return {
      name: 'security-scan',
      description: 'Scan for security vulnerabilities',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.HIGH,
      enabled: true,
      validate: async (modification) => {
        const code = modification.code || '';
        
        // Check for common security issues
        const securityPatterns = [
          /eval\s*\(/gi,
          /innerHTML\s*=/gi,
          /document\.write\s*\(/gi,
          /sql\s*=\s*['"][^'"]*\+/gi,
          /exec\s*\(/gi,
          /system\s*\(/gi
        ];
        
        const issues: string[] = [];
        for (const pattern of securityPatterns) {
          const matches = code.match(pattern);
          if (matches) {
            issues.push(matches[0]);
          }
        }
        
        return {
          passed: issues.length === 0,
          severity: RuleSeverity.HIGH,
          message: issues.length > 0 
            ? `Found ${issues.length} potential security issues` 
            : 'No security issues detected',
          details: issues.length > 0 ? issues.join(', ') : undefined,
          suggestions: issues.length > 0
            ? ['Use parameterized queries', 'Sanitize user input', 'Implement proper authentication']
            : undefined
        };
      }
    };
  }

  private createDependencyValidationRule(): ValidationRule {
    return {
      name: 'dependency-validation',
      description: 'Validate dependencies for vulnerabilities',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.HIGH,
      enabled: true,
      validate: async (modification) => {
        const dependencies = modification.dependencies || [];
        
        let issues = 0;
        const deprecatedDeps: string[] = [];
        
        for (const dep of dependencies) {
          // Check for deprecated packages (simplified)
          if (dep.name.startsWith('old-') || dep.name.startsWith('deprecated-')) {
            deprecatedDeps.push(dep.name);
            issues++;
          }
        }
        
        return {
          passed: issues === 0 || this.config.allowDeprecatedDependencies,
          severity: RuleSeverity.HIGH,
          message: issues > 0 
            ? `Found ${issues} dependency issues` 
            : 'All dependencies are valid',
          details: deprecatedDeps.length > 0 
            ? `Deprecated: ${deprecatedDeps.join(', ')}`
            : undefined,
          suggestions: deprecatedDeps.length > 0
            ? ['Update deprecated dependencies', 'Check for known vulnerabilities', 'Review license compatibility']
            : undefined
        };
      }
    };
  }

  private createPerformanceImpactRule(): ValidationRule {
    return {
      name: 'performance-impact',
      description: 'Assess performance impact of changes',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.MEDIUM,
      enabled: true,
      validate: async (modification) => {
        const code = modification.code || '';
        
        // Check for performance anti-patterns
        const performancePatterns = [
          /for\s*\(\s*\w+\s+in\s+.*\.length\s*\)/gi,  // inefficient loops
          /\.forEach\s*\(\s*\w+\s*=>\s*\{[^}]*\w+\.\w+\([^)]*\)\s*\}\s*\)/gi,  // nested operations
          /new\s+Array\s*\(\s*\d{4,}\s*\)/g,  // large arrays
          /JSON\.stringify\s*\([^)]{100,}\)/gi  // large objects
        ];
        
        let issues = 0;
        for (const pattern of performancePatterns) {
          const matches = code.match(pattern);
          if (matches) {
            issues += matches.length;
          }
        }
        
        return {
          passed: issues < 3,
          severity: RuleSeverity.MEDIUM,
          message: issues > 0 
            ? `Found ${issues} potential performance issues` 
            : 'No performance issues detected',
          details: issues > 0 ? `${issues} performance anti-patterns found` : undefined,
          suggestions: issues > 0
            ? ['Use efficient data structures', 'Implement caching', 'Optimize loops and iterations']
            : undefined
        };
      }
    };
  }

  private createInputSanitizationRule(): ValidationRule {
    return {
      name: 'input-sanitization',
      description: 'Ensure input sanitization is present',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.HIGH,
      enabled: true,
      validate: async (modification) => {
        const code = modification.code || '';
        
        // Check for input handling without sanitization
        const inputPatterns = [
          /req\.body\.\w+/gi,
          /req\.query\.\w+/gi,
          /req\.params\.\w+/gi,
          /request\.\w+/gi
        ];
        
        const sanitizePatterns = [
          /sanitize/gi,
          /escape/gi,
          /validate/gi,
          /trim\s*\(/gi
        ];
        
        let hasInput = false;
        for (const pattern of inputPatterns) {
          if (pattern.test(code)) {
            hasInput = true;
            break;
          }
        }
        
        let hasSanitization = false;
        for (const pattern of sanitizePatterns) {
          if (pattern.test(code)) {
            hasSanitization = true;
            break;
          }
        }
        
        return {
          passed: !hasInput || hasSanitization,
          severity: RuleSeverity.HIGH,
          message: hasInput && !hasSanitization 
            ? 'Input handling without sanitization detected' 
            : 'Input sanitization is adequate',
          details: hasInput && !hasSanitization 
            ? 'User input should always be sanitized'
            : undefined,
          suggestions: hasInput && !hasSanitization
            ? ['Implement input validation', 'Use sanitization libraries', 'Add output encoding']
            : undefined
        };
      }
    };
  }

  private createOutputEncodingRule(): ValidationRule {
    return {
      name: 'output-encoding',
      description: 'Ensure output encoding is present',
      stage: ValidationStage.PRE_MODIFICATION,
      severity: RuleSeverity.HIGH,
      enabled: true,
      validate: async (modification) => {
        const code = modification.code || '';
        
        // Check for output operations
        const outputPatterns = [
          /res\.send/gi,
          /res\.json/gi,
          /res\.render/gi,
          /response\.write/gi,
          /innerHTML\s*=/gi
        ];
        
        const encodingPatterns = [
          /escape/gi,
          /encode/gi,
          /sanitize/gi
        ];
        
        let hasOutput = false;
        for (const pattern of outputPatterns) {
          if (pattern.test(code)) {
            hasOutput = true;
            break;
          }
        }
        
        let hasEncoding = false;
        for (const pattern of encodingPatterns) {
          if (pattern.test(code)) {
            hasEncoding = true;
            break;
          }
        }
        
        return {
          passed: !hasOutput || hasEncoding,
          severity: RuleSeverity.HIGH,
          message: hasOutput && !hasEncoding 
            ? 'Output without encoding detected' 
            : 'Output encoding is adequate',
          details: hasOutput && !hasEncoding 
            ? 'Output should be encoded to prevent XSS'
            : undefined,
          suggestions: hasOutput && !hasEncoding
            ? ['Use template engines with auto-escaping', 'Implement output encoding', 'Sanitize before rendering']
            : undefined
        };
      }
    };
  }

  // ============================================================================
  // POST-MODIFICATION RULES
  // ============================================================================

  private createRuntimeBehaviorRule(): ValidationRule {
    return {
      name: 'runtime-behavior',
      description: 'Validate runtime behavior',
      stage: ValidationStage.POST_MODIFICATION,
      severity: RuleSeverity.HIGH,
      enabled: true,
      validate: async (modification) => {
        // In a real implementation, this would run the code in a sandbox
        // and monitor its behavior
        return {
          passed: true,
          severity: RuleSeverity.HIGH,
          message: 'Runtime behavior is normal',
          details: 'No anomalies detected during execution'
        };
      }
    };
  }

  private createResourceUsageRule(): ValidationRule {
    return {
      name: 'resource-usage',
      description: 'Monitor resource usage',
      stage: ValidationStage.POST_MODIFICATION,
      severity: RuleSeverity.MEDIUM,
      enabled: true,
      validate: async (modification) => {
        // In a real implementation, this would measure actual resource usage
        return {
          passed: true,
          severity: RuleSeverity.MEDIUM,
          message: 'Resource usage is within limits',
          details: 'CPU and memory usage are acceptable'
        };
      }
    };
  }

  private createErrorRateRule(): ValidationRule {
    return {
      name: 'error-rate',
      description: 'Monitor error rate',
      stage: ValidationStage.POST_MODIFICATION,
      severity: RuleSeverity.HIGH,
      enabled: true,
      validate: async (modification) => {
        // In a real implementation, this would measure actual error rate
        return {
          passed: true,
          severity: RuleSeverity.HIGH,
          message: 'Error rate is within acceptable limits',
          details: 'No increase in error rate detected'
        };
      }
    };
  }

  private createPerformanceRegressionRule(): ValidationRule {
    return {
      name: 'performance-regression',
      description: 'Check for performance regression',
      stage: ValidationStage.POST_MODIFICATION,
      severity: RuleSeverity.MEDIUM,
      enabled: true,
      validate: async (modification) => {
        // In a real implementation, this would compare before/after metrics
        return {
          passed: true,
          severity: RuleSeverity.MEDIUM,
          message: 'No performance regression detected',
          details: 'Performance metrics are stable'
        };
      }
    };
  }

  private createBehavioralConsistencyRule(): ValidationRule {
    return {
      name: 'behavioral-consistency',
      description: 'Ensure behavioral consistency',
      stage: ValidationStage.POST_MODIFICATION,
      severity: RuleSeverity.HIGH,
      enabled: true,
      validate: async (modification) => {
        // In a real implementation, this would compare expected vs actual behavior
        return {
          passed: true,
          severity: RuleSeverity.HIGH,
          message: 'Behavior is consistent with expectations',
          details: 'No unexpected behavior changes detected'
        };
      }
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Calculate code complexity
   */
  private calculateComplexity(code: string): number {
    const decisionPatterns = [
      /if\s*\(/gi,
      /else\s+if\s*\(/gi,
      /for\s*\(/gi,
      /while\s*\(/gi,
      /case\s+[^:]+:/gi,
      /\?/g,
      /&&|\|\|/g
    ];

    let complexity = 1;
    for (const pattern of decisionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }
}
