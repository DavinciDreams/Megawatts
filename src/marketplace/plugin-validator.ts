/**
 * Plugin Validator
 * 
 * Plugin validation system for marketplace submissions.
 * Performs automated security, functionality, and performance validation.
 */

import { Logger } from '../utils/logger';
import { SafetyAnalyzer } from '../ai/safety/safety-analyzer';
import {
  ValidationStatus,
  ValidationCheckType,
  ValidationSeverity,
  ValidationCheck,
  PluginValidation,
  PluginDependency,
  PluginConfigSchema
} from './marketplace-models';

/**
 * Plugin validation configuration
 */
export interface PluginValidatorConfig {
  enableSecurityValidation: boolean;
  enableFunctionalityValidation: boolean;
  enablePerformanceValidation: boolean;
  enableDependencyValidation: boolean;
  enableCodeQualityValidation: boolean;
  strictMode: boolean;
  maxCyclomaticComplexity: number;
  minMaintainabilityIndex: number;
  maxLoadTime: number;
  maxMemoryUsage: number;
  maxCpuUsage: number;
}

/**
 * Default plugin validator configuration
 */
export const DEFAULT_PLUGIN_VALIDATOR_CONFIG: PluginValidatorConfig = {
  enableSecurityValidation: true,
  enableFunctionalityValidation: true,
  enablePerformanceValidation: true,
  enableDependencyValidation: true,
  enableCodeQualityValidation: true,
  strictMode: false,
  maxCyclomaticComplexity: 15,
  minMaintainabilityIndex: 60,
  maxLoadTime: 5000, // 5 seconds
  maxMemoryUsage: 512 * 1024 * 1024, // 512MB
  maxCpuUsage: 80 // 80%
};

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  status: ValidationStatus;
  checks: ValidationCheck[];
  overallScore: number;
  errors: string[];
  warnings: string[];
}

/**
 * Code analysis input
 */
export interface CodeAnalysisInput {
  code: string;
  filePath?: string;
  language?: string;
  dependencies?: PluginDependency[];
}

/**
 * Plugin validator for marketplace submissions
 */
export class PluginValidator {
  private logger: Logger;
  private config: PluginValidatorConfig;
  private safetyAnalyzer?: SafetyAnalyzer;

  constructor(config: PluginValidatorConfig, logger: Logger, safetyAnalyzer?: SafetyAnalyzer) {
    this.logger = logger;
    this.config = config;
    this.safetyAnalyzer = safetyAnalyzer;
  }

  /**
   * Validate plugin for marketplace submission
   * @param pluginCode Plugin source code
   * @param dependencies Plugin dependencies
   * @param configSchema Plugin configuration schema
   * @returns Validation result
   */
  async validatePlugin(
    pluginCode: string,
    dependencies: PluginDependency[],
    configSchema: PluginConfigSchema
  ): Promise<PluginValidationResult> {
    try {
      this.logger.info('Starting plugin validation');

      const checks: ValidationCheck[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];

      // Security validation
      if (this.config.enableSecurityValidation) {
        const securityChecks = await this.validateSecurity(pluginCode);
        checks.push(...securityChecks);
      }

      // Functionality validation
      if (this.config.enableFunctionalityValidation) {
        const functionalityChecks = await this.validateFunctionality(pluginCode, configSchema);
        checks.push(...functionalityChecks);
      }

      // Performance validation
      if (this.config.enablePerformanceValidation) {
        const performanceChecks = await this.validatePerformance(pluginCode);
        checks.push(...performanceChecks);
      }

      // Dependency validation
      if (this.config.enableDependencyValidation) {
        const dependencyChecks = await this.validateDependencies(dependencies);
        checks.push(...dependencyChecks);
      }

      // Code quality validation
      if (this.config.enableCodeQualityValidation) {
        const qualityChecks = await this.validateCodeQuality(pluginCode);
        checks.push(...qualityChecks);
      }

      // Calculate overall score
      const overallScore = this.calculateOverallScore(checks);

      // Determine status
      const status = this.determineValidationStatus(checks, overallScore);

      // Collect errors and warnings
      for (const check of checks) {
        if (check.status === 'failed') {
          if (check.severity === ValidationSeverity.CRITICAL || check.severity === ValidationSeverity.HIGH) {
            errors.push(check.message || `${check.name} failed`);
          } else {
            warnings.push(check.message || `${check.name} failed`);
          }
        } else if (check.status === 'warning') {
          warnings.push(check.message || `${check.name} has warnings`);
        }
      }

      this.logger.info('Plugin validation completed', {
        status,
        overallScore,
        checksPassed: checks.filter(c => c.status === 'passed').length,
        checksFailed: checks.filter(c => c.status === 'failed').length,
        checksWarning: checks.filter(c => c.status === 'warning').length
      });

      return {
        status,
        checks,
        overallScore,
        errors,
        warnings
      };
    } catch (error) {
      this.logger.error('Plugin validation failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Validate plugin security
   * @param pluginCode Plugin source code
   * @returns Security validation checks
   */
  private async validateSecurity(pluginCode: string): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];
    const checkedAt = new Date();

    this.logger.debug('Running security validation');

    try {
      // Use safety analyzer for security checks if available
      if (this.safetyAnalyzer) {
        const staticAnalysis = await this.safetyAnalyzer.analyzeCodeSecurity({
          code: pluginCode,
          language: 'typescript'
        });

        // Process security findings
        for (const finding of staticAnalysis.securityFindings) {
          checks.push({
            id: `security-${checks.length}`,
            type: ValidationCheckType.SECURITY,
            name: finding.type,
            description: finding.description,
            severity: this.mapSecuritySeverity(finding.severity),
            status: 'failed',
            message: finding.recommendation,
            details: {
              line: finding.line,
              column: finding.column,
              code: finding.code,
              confidence: finding.confidence
            },
            checkedAt
          });
        }

        // Check overall security score
        if (staticAnalysis.overallSecurityScore < 70) {
          checks.push({
            id: 'security-overall',
            type: ValidationCheckType.SECURITY,
            name: 'Overall Security Score',
            description: `Security score of ${staticAnalysis.overallSecurityScore} is below threshold`,
            severity: ValidationSeverity.HIGH,
            status: 'failed',
            message: 'Plugin has too many security vulnerabilities',
            details: { score: staticAnalysis.overallSecurityScore },
            checkedAt
          });
        }
      }

      // Additional security checks
      checks.push(...this.checkForHardcodedSecrets(pluginCode, checkedAt));
      checks.push(...this.checkForInsecureImports(pluginCode, checkedAt));
      checks.push(...this.checkForDangerousFunctions(pluginCode, checkedAt));

    } catch (error) {
      this.logger.error('Security validation failed:', error);
      checks.push({
        id: 'security-error',
        type: ValidationCheckType.SECURITY,
        name: 'Security Validation Error',
        description: 'Failed to complete security validation',
        severity: ValidationSeverity.HIGH,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Validate plugin functionality
   * @param pluginCode Plugin source code
   * @param configSchema Plugin configuration schema
   * @returns Functionality validation checks
   */
  private async validateFunctionality(
    pluginCode: string,
    configSchema: PluginConfigSchema
  ): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];
    const checkedAt = new Date();

    this.logger.debug('Running functionality validation');

    try {
      // Check for required exports
      checks.push(...this.checkRequiredExports(pluginCode, checkedAt));

      // Check configuration schema
      checks.push(...this.checkConfigSchema(configSchema, checkedAt));

      // Check for API compliance
      checks.push(...this.checkAPICompliance(pluginCode, checkedAt));

      // Check error handling
      checks.push(...this.checkErrorHandling(pluginCode, checkedAt));

      // Check for proper initialization
      checks.push(...this.checkInitialization(pluginCode, checkedAt));

    } catch (error) {
      this.logger.error('Functionality validation failed:', error);
      checks.push({
        id: 'functionality-error',
        type: ValidationCheckType.FUNCTIONALITY,
        name: 'Functionality Validation Error',
        description: 'Failed to complete functionality validation',
        severity: ValidationSeverity.HIGH,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Validate plugin performance
   * @param pluginCode Plugin source code
   * @returns Performance validation checks
   */
  private async validatePerformance(pluginCode: string): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];
    const checkedAt = new Date();

    this.logger.debug('Running performance validation');

    try {
      // Check for synchronous operations
      checks.push(...this.checkSynchronousOperations(pluginCode, checkedAt));

      // Check for inefficient patterns
      checks.push(...this.checkInefficientPatterns(pluginCode, checkedAt));

      // Check for proper async/await usage
      checks.push(...this.checkAsyncAwaitUsage(pluginCode, checkedAt));

      // Check for memory leaks
      checks.push(...this.checkMemoryLeaks(pluginCode, checkedAt));

      // Check for proper cleanup
      checks.push(...this.checkCleanup(pluginCode, checkedAt));

    } catch (error) {
      this.logger.error('Performance validation failed:', error);
      checks.push({
        id: 'performance-error',
        type: ValidationCheckType.PERFORMANCE,
        name: 'Performance Validation Error',
        description: 'Failed to complete performance validation',
        severity: ValidationSeverity.HIGH,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Validate plugin dependencies
   * @param dependencies Plugin dependencies
   * @returns Dependency validation checks
   */
  private async validateDependencies(dependencies: PluginDependency[]): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];
    const checkedAt = new Date();

    this.logger.debug('Running dependency validation');

    try {
      // Check for circular dependencies
      checks.push(...this.checkCircularDependencies(dependencies, checkedAt));

      // Check for outdated dependencies
      checks.push(...this.checkOutdatedDependencies(dependencies, checkedAt));

      // Check for vulnerable dependencies
      checks.push(...this.checkVulnerableDependencies(dependencies, checkedAt));

      // Check for conflicting dependencies
      checks.push(...this.checkConflictingDependencies(dependencies, checkedAt));

    } catch (error) {
      this.logger.error('Dependency validation failed:', error);
      checks.push({
        id: 'dependency-error',
        type: ValidationCheckType.DEPENDENCIES,
        name: 'Dependency Validation Error',
        description: 'Failed to complete dependency validation',
        severity: ValidationSeverity.HIGH,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Validate plugin code quality
   * @param pluginCode Plugin source code
   * @returns Code quality validation checks
   */
  private async validateCodeQuality(pluginCode: string): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];
    const checkedAt = new Date();

    this.logger.debug('Running code quality validation');

    try {
      // Check code complexity
      checks.push(...this.checkCodeComplexity(pluginCode, checkedAt));

      // Check for code duplication
      checks.push(...this.checkCodeDuplication(pluginCode, checkedAt));

      // Check for proper documentation
      checks.push(...this.checkDocumentation(pluginCode, checkedAt));

      // Check for naming conventions
      checks.push(...this.checkNamingConventions(pluginCode, checkedAt));

      // Check for proper formatting
      checks.push(...this.checkFormatting(pluginCode, checkedAt));

    } catch (error) {
      this.logger.error('Code quality validation failed:', error);
      checks.push({
        id: 'code-quality-error',
        type: ValidationCheckType.CODE_QUALITY,
        name: 'Code Quality Validation Error',
        description: 'Failed to complete code quality validation',
        severity: ValidationSeverity.HIGH,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for hardcoded secrets
   */
  private checkForHardcodedSecrets(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    const secretPatterns = [
      /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
      /apikey\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
      /password\s*[:=]\s*['"][^'"]{4,}['"]/gi,
      /passwd\s*[:=]\s*['"][^'"]{4,}['"]/gi,
      /token\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
      /secret\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
      /-----BEGIN\s+PRIVATE\s+KEY-----/gi
    ];

    for (const pattern of secretPatterns) {
      const matches = pluginCode.matchAll(pattern);
      for (const match of matches) {
        checks.push({
          id: `secret-${checks.length}`,
          type: ValidationCheckType.SECURITY,
          name: 'Hardcoded Secret',
          description: 'Potential hardcoded secret detected',
          severity: ValidationSeverity.CRITICAL,
          status: 'failed',
          message: 'Remove hardcoded secrets and use environment variables',
          details: { code: match[0].substring(0, 50) + '...' },
          checkedAt
        });
      }
    }

    return checks;
  }

  /**
   * Check for insecure imports
   */
  private checkForInsecureImports(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    const insecureImports = [
      'eval',
      'Function',
      'child_process.exec',
      'child_process.spawn',
      'vm.runInNewContext'
    ];

    for (const imp of insecureImports) {
      const regex = new RegExp(`\\b${imp.replace('.', '\\.')}\\b`, 'g');
      const matches = pluginCode.match(regex);
      if (matches) {
        checks.push({
          id: `insecure-import-${checks.length}`,
          type: ValidationCheckType.SECURITY,
          name: 'Insecure Import',
          description: `Use of insecure function: ${imp}`,
          severity: ValidationSeverity.HIGH,
          status: 'failed',
          message: 'Avoid using insecure functions that can execute arbitrary code',
          details: { import: imp },
          checkedAt
        });
      }
    }

    return checks;
  }

  /**
   * Check for dangerous functions
   */
  private checkForDangerousFunctions(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    const dangerousPatterns = [
      { pattern: /require\s*\(\s*['"]\.\.\/['"]\s*\)/g, name: 'Relative require' },
      { pattern: /fs\.(unlink|rmdir)\s*\(/g, name: 'File deletion' },
      { pattern: /fs\.(writeFile|appendFile)\s*\(/g, name: 'File writing' }
    ];

    for (const { pattern, name } of dangerousPatterns) {
      const matches = pluginCode.match(pattern);
      if (matches) {
        checks.push({
          id: `dangerous-${checks.length}`,
          type: ValidationCheckType.SECURITY,
          name: `Dangerous Function: ${name}`,
          description: `Use of potentially dangerous function: ${name}`,
          severity: ValidationSeverity.MEDIUM,
          status: 'warning',
          message: 'Ensure proper validation and sanitization of inputs',
          details: { count: matches.length },
          checkedAt
        });
      }
    }

    return checks;
  }

  /**
   * Check for required exports
   */
  private checkRequiredExports(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    const requiredExports = ['initialize', 'execute', 'cleanup'];
    const foundExports: string[] = [];

    for (const exp of requiredExports) {
      if (pluginCode.includes(`export.*${exp}`) || pluginCode.includes(`exports.${exp}`)) {
        foundExports.push(exp);
      }
    }

    const missingExports = requiredExports.filter(e => !foundExports.includes(e));
    if (missingExports.length > 0) {
      checks.push({
        id: 'missing-exports',
        type: ValidationCheckType.FUNCTIONALITY,
        name: 'Missing Required Exports',
        description: `Plugin is missing required exports: ${missingExports.join(', ')}`,
        severity: ValidationSeverity.CRITICAL,
        status: 'failed',
        message: 'Plugin must export initialize, execute, and cleanup functions',
        details: { missing: missingExports, found: foundExports },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check configuration schema
   */
  private checkConfigSchema(configSchema: PluginConfigSchema, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    if (!configSchema || !configSchema.properties) {
      checks.push({
        id: 'missing-config-schema',
        type: ValidationCheckType.FUNCTIONALITY,
        name: 'Missing Configuration Schema',
        description: 'Plugin does not define a configuration schema',
        severity: ValidationSeverity.MEDIUM,
        status: 'warning',
        message: 'Consider defining a configuration schema for better user experience',
        checkedAt
      });
      return checks;
    }

    // Check for required properties
    for (const propName of configSchema.required || []) {
      if (!configSchema.properties[propName]) {
        checks.push({
          id: `missing-required-prop-${propName}`,
          type: ValidationCheckType.FUNCTIONALITY,
          name: 'Missing Required Property',
          description: `Required property '${propName}' not found in schema`,
          severity: ValidationSeverity.MEDIUM,
          status: 'failed',
          message: `Add property '${propName}' to configuration schema`,
          checkedAt
        });
      }
    }

    return checks;
  }

  /**
   * Check API compliance
   */
  private checkAPICompliance(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check for proper error handling in async functions
    const asyncTryCatchPattern = /async\s+\w+\s*\([^)]*\)\s*{[^}]*}/g;
    const asyncFunctions = pluginCode.match(asyncTryCatchPattern) || [];

    for (const func of asyncFunctions) {
      if (!func.includes('try') || !func.includes('catch')) {
        checks.push({
          id: 'async-no-error-handling',
          type: ValidationCheckType.FUNCTIONALITY,
          name: 'Missing Error Handling',
          description: 'Async function without try-catch block',
          severity: ValidationSeverity.MEDIUM,
          status: 'warning',
          message: 'Add proper error handling to async functions',
          checkedAt
        });
      }
    }

    return checks;
  }

  /**
   * Check error handling
   */
  private checkErrorHandling(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check for empty catch blocks
    const emptyCatchPattern = /catch\s*\([^)]*\)\s*{\s*}/g;
    const emptyCatches = pluginCode.match(emptyCatchPattern) || [];

    if (emptyCatches.length > 0) {
      checks.push({
        id: 'empty-catch',
        type: ValidationCheckType.FUNCTIONALITY,
        name: 'Empty Catch Block',
        description: 'Empty catch block detected',
        severity: ValidationSeverity.MEDIUM,
        status: 'warning',
        message: 'Add proper error handling in catch blocks',
        details: { count: emptyCatches.length },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check initialization
   */
  private checkInitialization(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check if initialize function is exported
    if (!pluginCode.includes('export.*initialize') && !pluginCode.includes('exports.initialize')) {
      checks.push({
        id: 'no-initialize',
        type: ValidationCheckType.FUNCTIONALITY,
        name: 'Missing Initialize Function',
        description: 'Plugin does not export an initialize function',
        severity: ValidationSeverity.CRITICAL,
        status: 'failed',
        message: 'Plugin must export an initialize function',
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for synchronous operations
   */
  private checkSynchronousOperations(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    const syncPatterns = [
      /fs\.readFileSync\s*\(/g,
      /fs\.writeFileSync\s*\(/g,
      /fs\.existsSync\s*\(/g
    ];

    for (const pattern of syncPatterns) {
      const matches = pluginCode.match(pattern);
      if (matches) {
        checks.push({
          id: `sync-operation-${checks.length}`,
          type: ValidationCheckType.PERFORMANCE,
          name: 'Synchronous Operation',
          description: 'Use of synchronous file system operations',
          severity: ValidationSeverity.MEDIUM,
          status: 'warning',
          message: 'Use asynchronous operations for better performance',
          details: { count: matches.length },
          checkedAt
        });
      }
    }

    return checks;
  }

  /**
   * Check for inefficient patterns
   */
  private checkInefficientPatterns(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check for nested loops
    const nestedLoopPattern = /for\s*\([^)]*\)\s*{[\s\S]*for\s*\([^)]*\)/g;
    const nestedLoops = pluginCode.match(nestedLoopPattern) || [];

    if (nestedLoops.length > 0) {
      checks.push({
        id: 'nested-loops',
        type: ValidationCheckType.PERFORMANCE,
        name: 'Nested Loops',
        description: 'Nested loops detected which may cause performance issues',
        severity: ValidationSeverity.MEDIUM,
        status: 'warning',
        message: 'Consider refactoring to reduce nesting',
        details: { count: nestedLoops.length },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check async/await usage
   */
  private checkAsyncAwaitUsage(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check for missing await in async functions
    const asyncWithoutAwaitPattern = /async\s+\w+\s*\([^)]*\)\s*{[^}]*return\s+\w+\s*\([^)]*\)\s*;[^}]*}/g;
    const asyncWithoutAwait = pluginCode.match(asyncWithoutAwaitPattern) || [];

    if (asyncWithoutAwait.length > 0) {
      checks.push({
        id: 'async-no-await',
        type: ValidationCheckType.PERFORMANCE,
        name: 'Async Function Without Await',
        description: 'Async function without await on promise return',
        severity: ValidationSeverity.LOW,
        status: 'warning',
        message: 'Consider using await or removing async keyword',
        details: { count: asyncWithoutAwait.length },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for memory leaks
   */
  private checkMemoryLeaks(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check for event listeners without cleanup
    const addEventListenerPattern = /addEventListener\s*\(/g;
    const removeEventListenerPattern = /removeEventListener\s*\(/g;
    const addCount = (pluginCode.match(addEventListenerPattern) || []).length;
    const removeCount = (pluginCode.match(removeEventListenerPattern) || []).length;

    if (addCount > 0 && removeCount === 0) {
      checks.push({
        id: 'memory-leak-event-listeners',
        type: ValidationCheckType.PERFORMANCE,
        name: 'Potential Memory Leak',
        description: 'Event listeners added without cleanup',
        severity: ValidationSeverity.HIGH,
        status: 'warning',
        message: 'Ensure event listeners are properly removed in cleanup',
        details: { added: addCount, removed: removeCount },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for proper cleanup
   */
  private checkCleanup(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check if cleanup function is exported
    if (!pluginCode.includes('export.*cleanup') && !pluginCode.includes('exports.cleanup')) {
      checks.push({
        id: 'no-cleanup',
        type: ValidationCheckType.FUNCTIONALITY,
        name: 'Missing Cleanup Function',
        description: 'Plugin does not export a cleanup function',
        severity: ValidationSeverity.HIGH,
        status: 'failed',
        message: 'Plugin must export a cleanup function for proper resource management',
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for circular dependencies
   */
  private checkCircularDependencies(dependencies: PluginDependency[], checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Simple check for self-dependency
    const selfDependency = dependencies.find(d => d.name === 'self' || d.name === '.');
    if (selfDependency) {
      checks.push({
        id: 'self-dependency',
        type: ValidationCheckType.DEPENDENCIES,
        name: 'Self Dependency',
        description: 'Plugin depends on itself',
        severity: ValidationSeverity.CRITICAL,
        status: 'failed',
        message: 'Remove self dependency',
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for outdated dependencies
   */
  private checkOutdatedDependencies(dependencies: PluginDependency[], checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // In a real implementation, this would check against npm registry
    // For now, just warn about old versions
    const oldVersionPattern = /0\.[0-9]\.[0-9]/;
    for (const dep of dependencies) {
      if (oldVersionPattern.test(dep.version)) {
        checks.push({
          id: `outdated-dep-${dep.name}`,
          type: ValidationCheckType.DEPENDENCIES,
          name: 'Outdated Dependency',
          description: `Dependency ${dep.name} may be outdated`,
          severity: ValidationSeverity.LOW,
          status: 'warning',
          message: `Consider updating ${dep.name} to a newer version`,
          details: { name: dep.name, version: dep.version },
          checkedAt
        });
      }
    }

    return checks;
  }

  /**
   * Check for vulnerable dependencies
   */
  private checkVulnerableDependencies(dependencies: PluginDependency[], checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // In a real implementation, this would check vulnerability databases
    // For now, just check for known vulnerable packages
    const vulnerablePackages = ['lodash<4.17.21', 'axios<0.21.1'];
    for (const dep of dependencies) {
      for (const vuln of vulnerablePackages) {
        const [name, version] = vuln.split('<');
        if (dep.name === name && dep.version < version) {
          checks.push({
            id: `vulnerable-dep-${dep.name}`,
            type: ValidationCheckType.DEPENDENCIES,
            name: 'Vulnerable Dependency',
            description: `Dependency ${dep.name} has known vulnerabilities`,
            severity: ValidationSeverity.CRITICAL,
            status: 'failed',
            message: `Update ${dep.name} to at least version ${version}`,
            details: { name: dep.name, version: dep.version, requiredVersion: version },
            checkedAt
          });
        }
      }
    }

    return checks;
  }

  /**
   * Check for conflicting dependencies
   */
  private checkConflictingDependencies(dependencies: PluginDependency[], checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check for duplicate dependencies
    const depNames = dependencies.map(d => d.name);
    const duplicates = depNames.filter((name, index) => depNames.indexOf(name) !== index);

    for (const dup of duplicates) {
      checks.push({
        id: `duplicate-dep-${dup}`,
        type: ValidationCheckType.DEPENDENCIES,
        name: 'Duplicate Dependency',
        description: `Dependency ${dup} is listed multiple times`,
        severity: ValidationSeverity.MEDIUM,
        status: 'failed',
        message: `Remove duplicate dependency ${dup}`,
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check code complexity
   */
  private checkCodeComplexity(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Count decision points
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
      const matches = pluginCode.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    if (complexity > this.config.maxCyclomaticComplexity) {
      checks.push({
        id: 'high-complexity',
        type: ValidationCheckType.CODE_QUALITY,
        name: 'High Cyclomatic Complexity',
        description: `Code complexity of ${complexity} exceeds threshold of ${this.config.maxCyclomaticComplexity}`,
        severity: ValidationSeverity.MEDIUM,
        status: 'warning',
        message: 'Consider refactoring to reduce complexity',
        details: { complexity, threshold: this.config.maxCyclomaticComplexity },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for code duplication
   */
  private checkCodeDuplication(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    const lines = pluginCode.split('\n');
    const lineCounts = new Map<string, number>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 20 && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
        lineCounts.set(trimmed, (lineCounts.get(trimmed) || 0) + 1);
      }
    }

    let duplicates = 0;
    for (const count of lineCounts.values()) {
      if (count > 1) {
        duplicates += count - 1;
      }
    }

    const duplicationRatio = duplicates / lines.length;
    if (duplicationRatio > 0.05) {
      checks.push({
        id: 'code-duplication',
        type: ValidationCheckType.CODE_QUALITY,
        name: 'Code Duplication',
        description: `${(duplicationRatio * 100).toFixed(1)}% of code is duplicated`,
        severity: ValidationSeverity.MEDIUM,
        status: 'warning',
        message: 'Consider refactoring to reduce code duplication',
        details: { ratio: duplicationRatio, duplicates },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for proper documentation
   */
  private checkDocumentation(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    const lines = pluginCode.split('\n');
    const commentLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
    });

    const commentRatio = commentLines.length / lines.length;
    if (commentRatio < 0.1) {
      checks.push({
        id: 'low-documentation',
        type: ValidationCheckType.DOCUMENTATION,
        name: 'Low Documentation',
        description: `Only ${(commentRatio * 100).toFixed(1)}% of code is documented`,
        severity: ValidationSeverity.LOW,
        status: 'warning',
        message: 'Add more comments to improve code maintainability',
        details: { ratio: commentRatio },
        checkedAt
      });
    }

    // Check for JSDoc comments on exports
    const exportPattern = /export\s+(?:const|function|class)\s+(\w+)/g;
    const exports = pluginCode.match(exportPattern) || [];
    const jsdocPattern = new RegExp(`\\/\\*\\*[\\s\\S]*?\\*\\/\\s*(?:${exports.map(e => e[1]).join('|')})`, 'g');
    const jsdocs = pluginCode.match(jsdocPattern) || [];

    if (exports.length > 0 && jsdocs.length < exports.length) {
      checks.push({
        id: 'missing-jsdoc',
        type: ValidationCheckType.DOCUMENTATION,
        name: 'Missing JSDoc Comments',
        description: `${exports.length - jsdocs.length} exports are missing JSDoc comments`,
        severity: ValidationSeverity.LOW,
        status: 'warning',
        message: 'Add JSDoc comments to exported functions/classes',
        details: { exports: exports.length, jsdocs: jsdocs.length },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for naming conventions
   */
  private checkNamingConventions(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check for camelCase in variables/functions
    const nonCamelCasePattern = /(?:let|const|function)\s+([a-z][a-zA-Z0-9]*_[a-z])/g;
    const nonCamelCase = pluginCode.match(nonCamelCasePattern) || [];

    if (nonCamelCase.length > 0) {
      checks.push({
        id: 'naming-convention',
        type: ValidationCheckType.CODE_QUALITY,
        name: 'Naming Convention Violation',
        description: 'Variables/functions should use camelCase',
        severity: ValidationSeverity.LOW,
        status: 'warning',
        message: 'Use camelCase for variables and function names',
        details: { count: nonCamelCase.length },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Check for proper formatting
   */
  private checkFormatting(pluginCode: string, checkedAt: Date): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // Check for trailing whitespace
    const trailingWhitespacePattern = /[ \t]+$/gm;
    const trailingWhitespace = pluginCode.match(trailingWhitespacePattern) || [];

    if (trailingWhitespace.length > 10) {
      checks.push({
        id: 'trailing-whitespace',
        type: ValidationCheckType.CODE_QUALITY,
        name: 'Trailing Whitespace',
        description: `${trailingWhitespace.length} lines have trailing whitespace`,
        severity: ValidationSeverity.LOW,
        status: 'warning',
        message: 'Remove trailing whitespace for cleaner code',
        details: { count: trailingWhitespace.length },
        checkedAt
      });
    }

    return checks;
  }

  /**
   * Map security severity from safety analyzer
   */
  private mapSecuritySeverity(severity: string): ValidationSeverity {
    const severityMap: Record<string, ValidationSeverity> = {
      'critical': ValidationSeverity.CRITICAL,
      'high': ValidationSeverity.HIGH,
      'medium': ValidationSeverity.MEDIUM,
      'low': ValidationSeverity.LOW,
      'info': ValidationSeverity.INFO
    };
    return severityMap[severity] || ValidationSeverity.MEDIUM;
  }

  /**
   * Calculate overall validation score
   */
  private calculateOverallScore(checks: ValidationCheck[]): number {
    if (checks.length === 0) {
      return 100;
    }

    let score = 100;
    for (const check of checks) {
      const severityPenalty: Record<ValidationSeverity, number> = {
        [ValidationSeverity.CRITICAL]: 25,
        [ValidationSeverity.HIGH]: 15,
        [ValidationSeverity.MEDIUM]: 8,
        [ValidationSeverity.LOW]: 3,
        [ValidationSeverity.INFO]: 1
      };

      if (check.status === 'failed') {
        score -= severityPenalty[check.severity];
      } else if (check.status === 'warning') {
        score -= severityPenalty[check.severity] / 2;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Determine validation status
   */
  private determineValidationStatus(checks: ValidationCheck[], score: number): ValidationStatus {
    const failedCritical = checks.some(c => c.status === 'failed' && c.severity === ValidationSeverity.CRITICAL);
    const failedHigh = checks.some(c => c.status === 'failed' && c.severity === ValidationSeverity.HIGH);

    if (failedCritical) {
      return ValidationStatus.FAILED;
    }

    if (failedHigh && this.config.strictMode) {
      return ValidationStatus.FAILED;
    }

    if (failedHigh) {
      return ValidationStatus.WARNING;
    }

    if (score < 70) {
      return ValidationStatus.WARNING;
    }

    return ValidationStatus.PASSED;
  }

  /**
   * Create plugin validation object
   */
  createPluginValidation(result: PluginValidationResult): PluginValidation {
    return {
      status: result.status,
      checks: result.checks,
      overallScore: result.overallScore,
      lastRunAt: new Date(),
      nextReviewAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
  }
}
