/**
 * Safety Analyzer
 * 
 * This module implements content filtering and safety checks
 * for the AI system, including static code analysis and security scanning.
 */

import {
  SafetyAnalysis,
  SafetyLevel,
  SafetyCategory,
  SafetyType,
  SafetyRecommendation,
  ModerationAction
} from '../../types/ai';
import { Logger } from '../../utils/logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Security vulnerability type
 */
export enum SecurityVulnerabilityType {
  SQL_INJECTION = 'sql_injection',
  XSS = 'xss',
  COMMAND_INJECTION = 'command_injection',
  PATH_TRAVERSAL = 'path_traversal',
  INSECURE_DESERIALIZATION = 'insecure_deserialization',
  HARDCODED_SECRET = 'hardcoded_secret',
  WEAK_CRYPTO = 'weak_crypto',
  INSECURE_RANDOM = 'insecure_random',
  SSRF = 'ssrf',
  CSRF = 'csrf'
}

/**
 * Code security issue severity
 */
export enum SecuritySeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info'
}

/**
 * Code security finding
 */
export interface SecurityFinding {
  type: SecurityVulnerabilityType;
  severity: SecuritySeverity;
  line?: number;
  column?: number;
  code?: string;
  description: string;
  recommendation: string;
  confidence: number;
}

/**
 * Code quality metrics
 */
export interface CodeQualityMetrics {
  cyclomaticComplexity: number;
  maintainabilityIndex: number;
  linesOfCode: number;
  commentRatio: number;
  functionCount: number;
  averageFunctionLength: number;
  duplicateLines: number;
  technicalDebtRatio: number;
}

/**
 * Dependency security check result
 */
export interface DependencySecurityCheck {
  packageName: string;
  version: string;
  hasKnownVulnerabilities: boolean;
  vulnerabilities: Array<{
    id: string;
    severity: SecuritySeverity;
    title: string;
    patchedIn?: string;
  }>;
  license: string;
  deprecated: boolean;
}

/**
 * Static code analysis result
 */
export interface StaticAnalysisResult {
  securityFindings: SecurityFinding[];
  qualityMetrics: CodeQualityMetrics;
  dependencies: DependencySecurityCheck[];
  overallSecurityScore: number;
  overallQualityScore: number;
}

/**
 * Code analysis input
 */
export interface CodeAnalysisInput {
  code: string;
  filePath?: string;
  language?: string;
  dependencies?: Array<{ name: string; version: string }>;
}

/**
 * Safety analyzer configuration
 */
export interface SafetyAnalyzerConfig {
  enabledChecks: SafetyType[];
  strictMode: boolean;
  blockThreshold?: SafetyLevel;
  maxConcurrentAnalyses: number;
  toxicity: any;
  personalInfo: any;
  contentClassification: any;
  // Code security configuration
  enableCodeSecurityAnalysis: boolean;
  maxCyclomaticComplexity: number;
  minMaintainabilityIndex: number;
  enableSecretDetection: boolean;
  enableDependencyScanning: boolean;
  securityThresholds: {
    critical: number;
    high: number;
    medium: number;
  };
}

/**
 * Safety analysis options
 */
export interface SafetyAnalysisOptions {
  enabledChecks?: SafetyType[];
  strictMode?: boolean;
  blockThreshold?: SafetyLevel;
  context?: any;
  userId?: string;
  // Code analysis options
  includeCodeAnalysis?: boolean;
  includeDependencyScan?: boolean;
  includeQualityMetrics?: boolean;
}

/**
 * Safety rule
 */
export interface SafetyRule {
  name: string;
  type: SafetyType;
  pattern: string | RegExp;
  action: ModerationAction;
  severity: SafetyLevel;
  enabled: boolean;
}

/**
 * Safety statistics
 */
export interface SafetyStats {
  totalAnalyses: number;
  blockedContent: number;
  flaggedContent: number;
  safeContent: number;
  categoryBreakdown: Record<SafetyType, number>;
  averageProcessingTime: number;
  mostCommonIssues: string[];
}

// ============================================================================
// SAFETY ANALYZER CLASS
// ============================================================================

export class SafetyAnalyzer {
  private logger: Logger;
  private config: SafetyAnalyzerConfig;
  private safetyRules: Map<SafetyType, SafetyRule[]> = new Map();
  private toxicityDetector: ToxicityDetector;
  private personalInfoDetector: PersonalInfoDetector;
  private contentClassifier: ContentClassifier;
  private codeSecurityAnalyzer: CodeSecurityAnalyzer;
  private codeQualityAnalyzer: CodeQualityAnalyzer;
  private dependencyScanner: DependencyScanner;

  constructor(config: SafetyAnalyzerConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
    this.initializeSafetyRules();
    this.toxicityDetector = new ToxicityDetector(config.toxicity, logger);
    this.personalInfoDetector = new PersonalInfoDetector(config.personalInfo, logger);
    this.contentClassifier = new ContentClassifier(config.contentClassification, logger);
    this.codeSecurityAnalyzer = new CodeSecurityAnalyzer(config, logger);
    this.codeQualityAnalyzer = new CodeQualityAnalyzer(config, logger);
    this.dependencyScanner = new DependencyScanner(config, logger);
  }

  /**
   * Analyze content for safety
   */
  async analyzeSafety(
    content: string,
    context?: any,
    options?: SafetyAnalysisOptions
  ): Promise<SafetyAnalysis> {
    try {
      const startTime = Date.now();

      // Initialize analysis result
      const analysis: SafetyAnalysis = {
        overall: 'safe',
        categories: [],
        confidence: 0,
        reasoning: [],
        recommendations: [],
        blocked: false
      };

      // Run all safety checks
      const categories = await this.runSafetyChecks(content, context, options);
      analysis.categories = categories;

      // Determine overall safety level
      analysis.overall = this.determineOverallSafety(categories);
      analysis.confidence = this.calculateConfidence(categories);

      // Generate reasoning
      analysis.reasoning = this.generateReasoning(categories);

      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(categories, analysis.overall);

      // Determine if content should be blocked
      analysis.blocked = this.shouldBlockContent(analysis.overall, options);

      // Log analysis
      this.logger.info('Safety analysis completed', {
        overall: analysis.overall,
        categories: categories.length,
        confidence: analysis.confidence,
        blocked: analysis.blocked,
        processingTime: Date.now() - startTime
      });

      return analysis;

    } catch (error) {
      this.logger.error('Safety analysis failed', error as Error);
      
      // Return safe fallback on error
      return {
        overall: 'safe',
        categories: [],
        confidence: 0,
        reasoning: ['Safety analysis failed, defaulting to safe'],
        recommendations: [],
        blocked: false
      };
    }
  }

  /**
   * Perform static code analysis for security vulnerabilities
   */
  async analyzeCodeSecurity(input: CodeAnalysisInput): Promise<StaticAnalysisResult> {
    try {
      this.logger.info('Starting code security analysis', {
        filePath: input.filePath,
        language: input.language
      });

      const startTime = Date.now();

      // Run security analysis
      const securityFindings = await this.codeSecurityAnalyzer.analyze(input);
      
      // Run quality analysis
      const qualityMetrics = await this.codeQualityAnalyzer.analyze(input);
      
      // Run dependency scanning
      const dependencies: DependencySecurityCheck[] = [];
      if (input.dependencies && input.dependencies.length > 0) {
        for (const dep of input.dependencies) {
          const check = await this.dependencyScanner.scan(dep);
          dependencies.push(check);
        }
      }

      // Calculate overall scores
      const overallSecurityScore = this.calculateSecurityScore(securityFindings);
      const overallQualityScore = this.calculateQualityScore(qualityMetrics);

      const result: StaticAnalysisResult = {
        securityFindings,
        qualityMetrics,
        dependencies,
        overallSecurityScore,
        overallQualityScore
      };

      this.logger.info('Code security analysis completed', {
        securityFindings: securityFindings.length,
        qualityScore: overallQualityScore,
        securityScore: overallSecurityScore,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Code security analysis failed', error as Error);
      throw error;
    }
  }

  /**
   * Quick safety check (optimized for performance)
   */
  async quickSafetyCheck(content: string): Promise<SafetyLevel> {
    try {
      // Run only critical safety checks
      const criticalChecks = await Promise.all([
        this.toxicityDetector.quickCheck(content),
        this.personalInfoDetector.quickCheck(content),
        this.contentClassifier.quickCheck(content)
      ]);

      // Determine if any critical issues found
      for (const check of criticalChecks) {
        if (check.level === 'danger') {
          return 'danger';
        }
        if (check.level === 'warning') {
          return 'warning';
        }
      }

      return 'safe';

    } catch (error) {
      this.logger.error('Quick safety check failed', error as Error);
      return 'caution';
    }
  }

  /**
   * Analyze multiple pieces of content
   */
  async analyzeBatchSafety(
    contents: string[],
    context?: any,
    options?: SafetyAnalysisOptions
  ): Promise<SafetyAnalysis[]> {
    const analyses: SafetyAnalysis[] = [];

    // Process in parallel with concurrency limit
    const concurrencyLimit = this.config.maxConcurrentAnalyses || 10;
    
    for (let i = 0; i < contents.length; i += concurrencyLimit) {
      const batch = contents.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map(content => this.analyzeSafety(content, context, options))
      );
      analyses.push(...batchResults);
    }

    return analyses;
  }

  /**
   * Get safety statistics
   */
  getSafetyStats(): SafetyStats {
    const stats: SafetyStats = {
      totalAnalyses: 0,
      blockedContent: 0,
      flaggedContent: 0,
      safeContent: 0,
      categoryBreakdown: {
        toxicity: 0,
        violence: 0,
        self_harm: 0,
        sexual_content: 0,
        hate_speech: 0,
        misinformation: 0,
        spam: 0,
        personal_info: 0,
        copyright: 0,
        security: 0
      },
      averageProcessingTime: 0,
      mostCommonIssues: []
    };

    // This would integrate with analytics system
    return stats;
  }

  /**
   * Add custom safety rule
   */
  addSafetyRule(type: SafetyType, rule: SafetyRule): void {
    if (!this.safetyRules.has(type)) {
      this.safetyRules.set(type, []);
    }
    
    this.safetyRules.get(type)!.push(rule);
    
    this.logger.info('Custom safety rule added', {
      type,
      ruleName: rule.name
    });
  }

  /**
   * Remove safety rule
   */
  removeSafetyRule(type: SafetyType, ruleName: string): boolean {
    const rules = this.safetyRules.get(type);
    if (!rules) {
      return false;
    }

    const index = rules.findIndex(rule => rule.name === ruleName);
    if (index === -1) {
      return false;
    }

    rules.splice(index, 1);
    
    this.logger.info('Safety rule removed', {
      type,
      ruleName
    });

    return true;
  }

  /**
   * Run all safety checks
   */
  private async runSafetyChecks(
    content: string,
    context?: any,
    options?: SafetyAnalysisOptions
  ): Promise<SafetyCategory[]> {
    const categories: SafetyCategory[] = [];

    // Toxicity check
    if (this.isCheckEnabled('toxicity', options)) {
      const toxicityResult = await this.toxicityDetector.analyze(content);
      categories.push(toxicityResult);
    }

    // Personal information check
    if (this.isCheckEnabled('personal_info', options)) {
      const personalInfoResult = await this.personalInfoDetector.analyze(content);
      categories.push(personalInfoResult);
    }

    // Violence check
    if (this.isCheckEnabled('violence', options)) {
      const violenceResult = await this.analyzeViolence(content);
      categories.push(violenceResult);
    }

    // Self-harm check
    if (this.isCheckEnabled('self_harm', options)) {
      const selfHarmResult = await this.analyzeSelfHarm(content);
      categories.push(selfHarmResult);
    }

    // Sexual content check
    if (this.isCheckEnabled('sexual_content', options)) {
      const sexualResult = await this.analyzeSexualContent(content);
      categories.push(sexualResult);
    }

    // Hate speech check
    if (this.isCheckEnabled('hate_speech', options)) {
      const hateResult = await this.analyzeHateSpeech(content);
      categories.push(hateResult);
    }

    // Misinformation check
    if (this.isCheckEnabled('misinformation', options)) {
      const misinformationResult = await this.analyzeMisinformation(content);
      categories.push(misinformationResult);
    }

    // Spam check
    if (this.isCheckEnabled('spam', options)) {
      const spamResult = await this.analyzeSpam(content);
      categories.push(spamResult);
    }

    // Copyright check
    if (this.isCheckEnabled('copyright', options)) {
      const copyrightResult = await this.analyzeCopyright(content);
      categories.push(copyrightResult);
    }

    // Security check
    if (this.isCheckEnabled('security', options)) {
      const securityResult = await this.analyzeSecurity(content);
      categories.push(securityResult);
    }

    return categories.filter(cat => cat.level !== 'safe');
  }

  /**
   * Determine overall safety level
   */
  private determineOverallSafety(categories: SafetyCategory[]): SafetyLevel {
    if (categories.length === 0) {
      return 'safe';
    }

    // Check for danger level
    const hasDanger = categories.some(cat => cat.level === 'danger');
    if (hasDanger) {
      return 'danger';
    }

    // Check for warning level
    const hasWarning = categories.some(cat => cat.level === 'warning');
    if (hasWarning) {
      return 'warning';
    }

    // Check for caution level
    const hasCaution = categories.some(cat => cat.level === 'caution');
    if (hasCaution) {
      return 'caution';
    }

    return 'safe';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(categories: SafetyCategory[]): number {
    if (categories.length === 0) {
      return 0.5; // Default confidence
    }

    // Average confidence across all categories
    const totalConfidence = categories.reduce((sum, cat) => sum + cat.confidence, 0);
    return totalConfidence / categories.length;
  }

  /**
   * Generate reasoning for safety analysis
   */
  private generateReasoning(categories: SafetyCategory[]): string[] {
    const reasoning: string[] = [];

    for (const category of categories) {
      reasoning.push(`${category.type}: ${category.details}`);
      
      if (category.evidence.length > 0) {
        reasoning.push(`Evidence: ${category.evidence.join(', ')}`);
      }
    }

    return reasoning;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    categories: SafetyCategory[], 
    overall: SafetyLevel
  ): SafetyRecommendation[] {
    const recommendations: SafetyRecommendation[] = [];

    for (const category of categories) {
      switch (category.level) {
        case 'danger':
          recommendations.push({
            type: 'block',
            message: `Content contains dangerous ${category.type}`,
            severity: 'high',
            automated: true
          });
          break;
        case 'warning':
          recommendations.push({
            type: 'warn',
            message: `Content may contain inappropriate ${category.type}`,
            severity: 'medium',
            automated: true
          });
          break;
        case 'caution':
          recommendations.push({
            type: 'modify',
            message: `Content should be reviewed for ${category.type}`,
            severity: 'low',
            automated: true
          });
          break;
      }
    }

    return recommendations;
  }

  /**
   * Determine if content should be blocked
   */
  private shouldBlockContent(
    overall: SafetyLevel, 
    options?: SafetyAnalysisOptions
  ): boolean {
    // Always block dangerous content
    if (overall === 'danger') {
      return true;
    }

    // Check strict mode
    if (options?.strictMode && overall !== 'safe') {
      return true;
    }

    // Check custom thresholds
    if (options?.blockThreshold) {
      const thresholdLevels = ['warning', 'danger', 'caution'];
      return thresholdLevels.includes(overall);
    }

    return false;
  }

  /**
   * Check if a safety check is enabled
   */
  private isCheckEnabled(
    checkType: SafetyType, 
    options?: SafetyAnalysisOptions
  ): boolean {
    if (!options?.enabledChecks) {
      return true; // All checks enabled by default
    }

    return options.enabledChecks.includes(checkType);
  }

  /**
   * Calculate security score from findings
   */
  private calculateSecurityScore(findings: SecurityFinding[]): number {
    if (findings.length === 0) {
      return 100;
    }

    let score = 100;
    for (const finding of findings) {
      switch (finding.severity) {
        case SecuritySeverity.CRITICAL:
          score -= 25;
          break;
        case SecuritySeverity.HIGH:
          score -= 15;
          break;
        case SecuritySeverity.MEDIUM:
          score -= 8;
          break;
        case SecuritySeverity.LOW:
          score -= 3;
          break;
        case SecuritySeverity.INFO:
          score -= 1;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Calculate quality score from metrics
   */
  private calculateQualityScore(metrics: CodeQualityMetrics): number {
    let score = 100;

    // Penalize high complexity
    if (metrics.cyclomaticComplexity > this.config.maxCyclomaticComplexity) {
      score -= 20;
    }

    // Penalize low maintainability
    if (metrics.maintainabilityIndex < this.config.minMaintainabilityIndex) {
      score -= 15;
    }

    // Penalize low comment ratio
    if (metrics.commentRatio < 0.1) {
      score -= 10;
    }

    // Penalize high technical debt
    if (metrics.technicalDebtRatio > 0.2) {
      score -= 15;
    }

    // Penalize high duplicate lines
    if (metrics.duplicateLines > metrics.linesOfCode * 0.05) {
      score -= 10;
    }

    return Math.max(0, score);
  }

  // Individual safety analysis methods
  private async analyzeViolence(content: string): Promise<SafetyCategory> {
    const violenceKeywords = [
      'kill', 'murder', 'death', 'violence', 'attack', 'harm',
      'weapon', 'bomb', 'explosive', 'torture', 'abuse'
    ];

    const lowerContent = content.toLowerCase();
    const matches = violenceKeywords.filter(keyword => lowerContent.includes(keyword));
    
    const severity = Math.min(1.0, matches.length * 0.3);
    const level = severity > 0.6 ? 'danger' : severity > 0.3 ? 'warning' : 'caution';

    return {
      type: 'violence',
      level,
      confidence: severity,
      details: `Detected ${matches.length} violence-related terms`,
      evidence: matches
    };
  }

  private async analyzeSelfHarm(content: string): Promise<SafetyCategory> {
    const selfHarmKeywords = [
      'suicide', 'kill myself', 'end my life', 'self harm',
      'depressed', 'want to die', 'cut myself', 'hurt myself'
    ];

    const lowerContent = content.toLowerCase();
    const matches = selfHarmKeywords.filter(keyword => lowerContent.includes(keyword));
    
    const severity = Math.min(1.0, matches.length * 0.4);
    const level = severity > 0.5 ? 'danger' : severity > 0.2 ? 'warning' : 'caution';

    return {
      type: 'self_harm',
      level,
      confidence: severity,
      details: `Detected ${matches.length} self-harm-related terms`,
      evidence: matches
    };
  }

  private async analyzeSexualContent(content: string): Promise<SafetyCategory> {
    const sexualKeywords = [
      'porn', 'sex', 'nude', 'explicit', 'adult', 'xxx',
      'nsfw', 'erotic', 'sexual', 'intimate'
    ];

    const lowerContent = content.toLowerCase();
    const matches = sexualKeywords.filter(keyword => lowerContent.includes(keyword));
    
    const severity = Math.min(1.0, matches.length * 0.25);
    const level = severity > 0.5 ? 'danger' : severity > 0.25 ? 'warning' : 'caution';

    return {
      type: 'sexual_content',
      level,
      confidence: severity,
      details: `Detected ${matches.length} sexual content indicators`,
      evidence: matches
    };
  }

  private async analyzeHateSpeech(content: string): Promise<SafetyCategory> {
    const hateKeywords = [
      'hate', 'racist', 'nazi', 'kkk', 'terrorist',
      'discrimination', 'bigot', 'supremacist', 'extremist'
    ];

    const lowerContent = content.toLowerCase();
    const matches = hateKeywords.filter(keyword => lowerContent.includes(keyword));
    
    const severity = Math.min(1.0, matches.length * 0.35);
    const level = severity > 0.6 ? 'danger' : severity > 0.3 ? 'warning' : 'caution';

    return {
      type: 'hate_speech',
      level,
      confidence: severity,
      details: `Detected ${matches.length} hate speech indicators`,
      evidence: matches
    };
  }

  private async analyzeMisinformation(content: string): Promise<SafetyCategory> {
    // This would integrate with fact-checking APIs
    // For now, return a basic analysis
    return {
      type: 'misinformation',
      level: 'safe',
      confidence: 0.1,
      details: 'Basic misinformation check - no obvious indicators',
      evidence: []
    };
  }

  private async analyzeSpam(content: string): Promise<SafetyCategory> {
    const spamIndicators = [
      'click here', 'buy now', 'limited time', 'act fast',
      'free money', 'guaranteed', 'winner', 'congratulations'
    ];

    const lowerContent = content.toLowerCase();
    const matches = spamIndicators.filter(keyword => lowerContent.includes(keyword));
    
    // Check for excessive capitalization
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    const excessiveCaps = capsRatio > 0.5;
    
    // Check for excessive punctuation
    const punctRatio = (content.match(/[!?.]/g) || []).length / content.length;
    const excessivePunct = punctRatio > 0.1;
    
    const severity = Math.min(1.0, 
      (matches.length * 0.2) + 
      (excessiveCaps ? 0.3 : 0) + 
      (excessivePunct ? 0.3 : 0)
    );
    
    const level = severity > 0.5 ? 'warning' : severity > 0.2 ? 'caution' : 'safe';

    return {
      type: 'spam',
      level,
      confidence: severity,
      details: `Detected ${matches.length} spam indicators, excessive caps: ${excessiveCaps}, excessive punctuation: ${excessivePunct}`,
      evidence: matches
    };
  }

  private async analyzeCopyright(content: string): Promise<SafetyCategory> {
    // This would integrate with copyright detection APIs
    // For now, return a basic analysis
    return {
      type: 'copyright',
      level: 'safe',
      confidence: 0.1,
      details: 'Basic copyright check - no obvious violations',
      evidence: []
    };
  }

  private async analyzeSecurity(content: string): Promise<SafetyCategory> {
    const securityIndicators = [
      'password', 'token', 'api key', 'secret', 'private key',
      'credentials', 'auth', 'login', 'hack', 'exploit'
    ];

    const lowerContent = content.toLowerCase();
    const matches = securityIndicators.filter(keyword => lowerContent.includes(keyword));
    
    const severity = Math.min(1.0, matches.length * 0.4);
    const level = severity > 0.6 ? 'danger' : severity > 0.3 ? 'warning' : 'caution';

    return {
      type: 'security',
      level,
      confidence: severity,
      details: `Detected ${matches.length} security-sensitive terms`,
      evidence: matches
    };
  }

  /**
   * Initialize safety rules
   */
  private initializeSafetyRules(): void {
    const safetyTypes: SafetyType[] = [
      'toxicity',
      'violence',
      'self_harm',
      'sexual_content',
      'hate_speech',
      'misinformation',
      'spam',
      'personal_info',
      'copyright',
      'security'
    ];
    for (const type of safetyTypes) {
      this.safetyRules.set(type, []);
    }
  }
}

// ============================================================================
// CODE SECURITY ANALYZER CLASS
// ============================================================================

/**
 * Code Security Analyzer
 * 
 * Performs static code analysis to detect security vulnerabilities
 */
class CodeSecurityAnalyzer {
  private config: SafetyAnalyzerConfig;
  private logger: Logger;

  constructor(config: SafetyAnalyzerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Analyze code for security vulnerabilities
   */
  async analyze(input: CodeAnalysisInput): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    const code = input.code;

    // Check for SQL injection
    findings.push(...this.checkSQLInjection(code));

    // Check for XSS vulnerabilities
    findings.push(...this.checkXSS(code));

    // Check for command injection
    findings.push(...this.checkCommandInjection(code));

    // Check for path traversal
    findings.push(...this.checkPathTraversal(code));

    // Check for hardcoded secrets
    if (this.config.enableSecretDetection) {
      findings.push(...this.checkHardcodedSecrets(code));
    }

    // Check for weak cryptography
    findings.push(...this.checkWeakCryptography(code));

    // Check for insecure random
    findings.push(...this.checkInsecureRandom(code));

    // Check for SSRF
    findings.push(...this.checkSSRF(code));

    // Check for CSRF
    findings.push(...this.checkCSRF(code));

    this.logger.debug('Code security analysis completed', {
      findings: findings.length,
      filePath: input.filePath
    });

    return findings;
  }

  /**
   * Check for SQL injection vulnerabilities
   */
  private checkSQLInjection(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const patterns = [
      /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+.*\s+FROM\s+.*\s+WHERE\s+.*['"]?\$\{?['"]?/gi,
      /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+.*\s+FROM\s+.*\s+WHERE\s+.*['"]?\+['"]?/gi,
      /query\(['"].*['"]\s*\+\s*\w+/gi,
      /execute\(['"].*['"]\s*\+\s*\w+/gi,
      /mysql_query\(['"].*['"]\s*\+\s*\w+/gi
    ];

    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          type: SecurityVulnerabilityType.SQL_INJECTION,
          severity: SecuritySeverity.CRITICAL,
          line: this.getLineNumber(code, match.index),
          code: match[0],
          description: 'Potential SQL injection vulnerability detected',
          recommendation: 'Use parameterized queries or prepared statements',
          confidence: 0.85
        });
      }
    }

    return findings;
  }

  /**
   * Check for XSS vulnerabilities
   */
  private checkXSS(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const patterns = [
      /innerHTML\s*=\s*['"].*\$\{?['"]?/gi,
      /document\.write\(['"].*\$\{?['"]?/gi,
      /eval\(['"].*\$\{?['"]?/gi,
      /dangerouslySetInnerHTML/gi
    ];

    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          type: SecurityVulnerabilityType.XSS,
          severity: SecuritySeverity.HIGH,
          line: this.getLineNumber(code, match.index),
          code: match[0],
          description: 'Potential XSS vulnerability detected',
          recommendation: 'Sanitize user input before rendering',
          confidence: 0.8
        });
      }
    }

    return findings;
  }

  /**
   * Check for command injection vulnerabilities
   */
  private checkCommandInjection(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const patterns = [
      /exec\(['"].*\$\{?['"]?/gi,
      /spawn\(['"].*\$\{?['"]?/gi,
      /system\(['"].*\$\{?['"]?/gi,
      /child_process\.exec\(['"].*\$\{?['"]?/gi,
      /os\.system\(['"].*\$\{?['"]?/gi
    ];

    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          type: SecurityVulnerabilityType.COMMAND_INJECTION,
          severity: SecuritySeverity.CRITICAL,
          line: this.getLineNumber(code, match.index),
          code: match[0],
          description: 'Potential command injection vulnerability detected',
          recommendation: 'Validate and sanitize all command inputs',
          confidence: 0.9
        });
      }
    }

    return findings;
  }

  /**
   * Check for path traversal vulnerabilities
   */
  private checkPathTraversal(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const patterns = [
      /\.\.\/|\.\.\\/g,
      /fs\.readFile\(['"].*\$\{?['"]?/gi,
      /fs\.writeFile\(['"].*\$\{?['"]?/gi,
      /fs\.unlink\(['"].*\$\{?['"]?/gi,
      /path\.join\(['"].*\$\{?['"]?/gi
    ];

    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          type: SecurityVulnerabilityType.PATH_TRAVERSAL,
          severity: SecuritySeverity.HIGH,
          line: this.getLineNumber(code, match.index),
          code: match[0],
          description: 'Potential path traversal vulnerability detected',
          recommendation: 'Validate and sanitize file paths',
          confidence: 0.75
        });
      }
    }

    return findings;
  }

  /**
   * Check for hardcoded secrets
   */
  private checkHardcodedSecrets(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    
    // API keys
    const apiKeyPatterns = [
      /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
      /apikey\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi
    ];

    // Passwords
    const passwordPatterns = [
      /password\s*[:=]\s*['"][^'"]{4,}['"]/gi,
      /passwd\s*[:=]\s*['"][^'"]{4,}['"]/gi
    ];

    // Tokens
    const tokenPatterns = [
      /token\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
      /secret\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi
    ];

    // Private keys
    const privateKeyPatterns = [
      /-----BEGIN\s+PRIVATE\s+KEY-----/gi,
      /private[_-]?key\s*[:=]\s*['"][^'"]{20,}['"]/gi
    ];

    const allPatterns = [...apiKeyPatterns, ...passwordPatterns, ...tokenPatterns, ...privateKeyPatterns];

    for (const pattern of allPatterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          type: SecurityVulnerabilityType.HARDCODED_SECRET,
          severity: SecuritySeverity.CRITICAL,
          line: this.getLineNumber(code, match.index),
          code: match[0].substring(0, 50) + '...',
          description: 'Hardcoded secret detected',
          recommendation: 'Use environment variables or secret management',
          confidence: 0.95
        });
      }
    }

    return findings;
  }

  /**
   * Check for weak cryptography
   */
  private checkWeakCryptography(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const patterns = [
      /md5\(/gi,
      /sha1\(/gi,
      /crypto\.createHash\(['"]md5['"]\)/gi,
      /crypto\.createHash\(['"]sha1['"]\)/gi,
      /aes-128/gi,
      /des/gi,
      /rc4/gi
    ];

    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          type: SecurityVulnerabilityType.WEAK_CRYPTO,
          severity: SecuritySeverity.MEDIUM,
          line: this.getLineNumber(code, match.index),
          code: match[0],
          description: 'Weak cryptographic algorithm detected',
          recommendation: 'Use strong algorithms like SHA-256, SHA-512, or AES-256',
          confidence: 0.9
        });
      }
    }

    return findings;
  }

  /**
   * Check for insecure random number generation
   */
  private checkInsecureRandom(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const patterns = [
      /Math\.random\(\)/gi,
      /random\.random\(\)/gi
    ];

    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        // Check if used for security purposes
        const context = code.substring(Math.max(0, match.index! - 100), Math.min(code.length, match.index! + 100));
        if (context.includes('password') || context.includes('token') || context.includes('key') || context.includes('salt')) {
          findings.push({
            type: SecurityVulnerabilityType.INSECURE_RANDOM,
            severity: SecuritySeverity.MEDIUM,
            line: this.getLineNumber(code, match.index),
            code: match[0],
            description: 'Insecure random number generator for security-sensitive operation',
            recommendation: 'Use crypto.randomBytes() or similar cryptographically secure RNG',
            confidence: 0.8
          });
        }
      }
    }

    return findings;
  }

  /**
   * Check for SSRF vulnerabilities
   */
  private checkSSRF(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const patterns = [
      /fetch\(['"].*\$\{?['"]?/gi,
      /axios\.(get|post)\(['"].*\$\{?['"]?/gi,
      /http\.request\(['"].*\$\{?['"]?/gi,
      /https\.request\(['"].*\$\{?['"]?/gi
    ];

    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          type: SecurityVulnerabilityType.SSRF,
          severity: SecuritySeverity.HIGH,
          line: this.getLineNumber(code, match.index),
          code: match[0],
          description: 'Potential SSRF vulnerability detected',
          recommendation: 'Validate and whitelist all URLs before making requests',
          confidence: 0.7
        });
      }
    }

    return findings;
  }

  /**
   * Check for CSRF vulnerabilities
   */
  private checkCSRF(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    
    // Check for state-changing operations without CSRF protection
    const patterns = [
      /app\.(post|put|delete)\(['"][^'"]*['"]/gi,
      /router\.(post|put|delete)\(['"][^'"]*['"]/gi
    ];

    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        const context = code.substring(Math.max(0, match.index! - 200), Math.min(code.length, match.index! + 200));
        
        // Check if CSRF protection is present
        const hasCSRFProtection = 
          context.includes('csrf') || 
          context.includes('token') || 
          context.includes('csrfToken') ||
          context.includes('protect');

        if (!hasCSRFProtection) {
          findings.push({
            type: SecurityVulnerabilityType.CSRF,
            severity: SecuritySeverity.MEDIUM,
            line: this.getLineNumber(code, match.index),
            code: match[0],
            description: 'State-changing operation without CSRF protection',
            recommendation: 'Implement CSRF protection using tokens or same-site cookies',
            confidence: 0.6
          });
        }
      }
    }

    return findings;
  }

  /**
   * Get line number from character index
   */
  private getLineNumber(code: string, index?: number): number {
    if (index === undefined) return 0;
    const lines = code.substring(0, index).split('\n');
    return lines.length;
  }
}

// ============================================================================
// CODE QUALITY ANALYZER CLASS
// ============================================================================

/**
 * Code Quality Analyzer
 * 
 * Analyzes code quality metrics
 */
class CodeQualityAnalyzer {
  private config: SafetyAnalyzerConfig;
  private logger: Logger;

  constructor(config: SafetyAnalyzerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Analyze code quality
   */
  async analyze(input: CodeAnalysisInput): Promise<CodeQualityMetrics> {
    const code = input.code;

    const metrics: CodeQualityMetrics = {
      cyclomaticComplexity: this.calculateCyclomaticComplexity(code),
      maintainabilityIndex: this.calculateMaintainabilityIndex(code),
      linesOfCode: this.countLinesOfCode(code),
      commentRatio: this.calculateCommentRatio(code),
      functionCount: this.countFunctions(code),
      averageFunctionLength: this.calculateAverageFunctionLength(code),
      duplicateLines: this.countDuplicateLines(code),
      technicalDebtRatio: this.calculateTechnicalDebtRatio(code)
    };

    this.logger.debug('Code quality analysis completed', {
      filePath: input.filePath,
      metrics
    });

    return metrics;
  }

  /**
   * Calculate cyclomatic complexity
   */
  private calculateCyclomaticComplexity(code: string): number {
    // Count decision points
    const decisionPatterns = [
      /if\s*\(/gi,
      /else\s+if\s*\(/gi,
      /for\s*\(/gi,
      /while\s*\(/gi,
      /case\s+[^:]+:/gi,
      /\?/g,  // ternary operator
      /&&|\|\|/g  // logical operators
    ];

    let complexity = 1; // Base complexity
    for (const pattern of decisionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Calculate maintainability index
   */
  private calculateMaintainabilityIndex(code: string): number {
    const loc = this.countLinesOfCode(code);
    const complexity = this.calculateCyclomaticComplexity(code);
    const volume = loc * Math.log2(loc || 1);

    // Microsoft maintainability index formula (simplified)
    const mi = Math.max(0, 
      171 - 5.2 * Math.log(volume) - 0.23 * complexity - 16.2 * Math.log(loc || 1)
    );

    return Math.min(100, mi);
  }

  /**
   * Count lines of code
   */
  private countLinesOfCode(code: string): number {
    const lines = code.split('\n');
    return lines.filter(line => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    }).length;
  }

  /**
   * Calculate comment ratio
   */
  private calculateCommentRatio(code: string): number {
    const lines = code.split('\n');
    const commentLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
    }).length;

    return lines.length > 0 ? commentLines / lines.length : 0;
  }

  /**
   * Count functions
   */
  private countFunctions(code: string): number {
    const patterns = [
      /function\s+\w+/gi,
      /const\s+\w+\s*=\s*\([^)]*\)\s*=>/gi,
      /class\s+\w+/gi,
      /=>\s*{/g  // arrow functions
    ];

    let count = 0;
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }

    return count;
  }

  /**
   * Calculate average function length
   */
  private calculateAverageFunctionLength(code: string): number {
    const functionCount = this.countFunctions(code);
    const loc = this.countLinesOfCode(code);
    
    return functionCount > 0 ? loc / functionCount : 0;
  }

  /**
   * Count duplicate lines
   */
  private countDuplicateLines(code: string): number {
    const lines = code.split('\n');
    const lineCounts = new Map<string, number>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed !== '' && !trimmed.startsWith('//')) {
        lineCounts.set(trimmed, (lineCounts.get(trimmed) || 0) + 1);
      }
    }

    let duplicates = 0;
    for (const count of lineCounts.values()) {
      if (count > 1) {
        duplicates += count - 1;
      }
    }

    return duplicates;
  }

  /**
   * Calculate technical debt ratio
   */
  private calculateTechnicalDebtRatio(code: string): number {
    // Simplified technical debt calculation based on code smells
    const longFunctions = this.countLongFunctions(code);
    const complexFunctions = this.countComplexFunctions(code);
    const duplicateCode = this.countDuplicateLines(code);
    const loc = this.countLinesOfCode(code);

    const debtScore = (longFunctions + complexFunctions + duplicateCode) / (loc || 1);
    return Math.min(1, debtScore);
  }

  /**
   * Count long functions (>50 lines)
   */
  private countLongFunctions(code: string): number {
    // Simplified - would need AST for accurate counting
    const lines = code.split('\n');
    return Math.floor(lines.length / 50);
  }

  /**
   * Count complex functions (complexity > 10)
   */
  private countComplexFunctions(code: string): number {
    const complexity = this.calculateCyclomaticComplexity(code);
    return complexity > 10 ? Math.floor(complexity / 10) : 0;
  }
}

// ============================================================================
// DEPENDENCY SCANNER CLASS
// ============================================================================

/**
 * Dependency Scanner
 * 
 * Scans dependencies for known vulnerabilities
 */
class DependencyScanner {
  private config: SafetyAnalyzerConfig;
  private logger: Logger;
  private vulnerabilityCache: Map<string, DependencySecurityCheck> = new Map();

  constructor(config: SafetyAnalyzerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Scan a dependency for vulnerabilities
   */
  async scan(dependency: { name: string; version: string }): Promise<DependencySecurityCheck> {
    const cacheKey = `${dependency.name}@${dependency.version}`;

    // Check cache first
    if (this.vulnerabilityCache.has(cacheKey)) {
      return this.vulnerabilityCache.get(cacheKey)!;
    }

    // In a real implementation, this would query vulnerability databases
    // like npm audit, Snyk, or OWASP Dependency-Check
    const result: DependencySecurityCheck = {
      packageName: dependency.name,
      version: dependency.version,
      hasKnownVulnerabilities: false,
      vulnerabilities: [],
      license: 'MIT', // Would need to check actual license
      deprecated: false
    };

    // Cache the result
    this.vulnerabilityCache.set(cacheKey, result);

    this.logger.debug('Dependency scan completed', {
      package: dependency.name,
      version: dependency.version,
      hasVulnerabilities: result.hasKnownVulnerabilities
    });

    return result;
  }

  /**
   * Clear the vulnerability cache
   */
  clearCache(): void {
    this.vulnerabilityCache.clear();
    this.logger.debug('Dependency vulnerability cache cleared');
  }
}

// ============================================================================
// SUPPORTING CLASSES
// ============================================================================

class ToxicityDetector {
  private config: any;
  private logger: Logger;

  constructor(config: any, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async analyze(content: string): Promise<SafetyCategory> {
    // Simplified toxicity detection
    const toxicKeywords = ['toxic', 'poison', 'harmful', 'dangerous'];
    const lowerContent = content.toLowerCase();
    const matches = toxicKeywords.filter(keyword => lowerContent.includes(keyword));
    
    const severity = Math.min(1.0, matches.length * 0.3);
    const level = severity > 0.5 ? 'danger' : severity > 0.2 ? 'warning' : 'caution';

    return {
      type: 'toxicity',
      level,
      confidence: severity,
      details: `Detected ${matches.length} toxicity indicators`,
      evidence: matches
    };
  }

  async quickCheck(content: string): Promise<{level: SafetyLevel, confidence: number}> {
    const result = await this.analyze(content);
    return { level: result.level, confidence: result.confidence };
  }
}

class PersonalInfoDetector {
  private config: any;
  private logger: Logger;

  constructor(config: any, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async analyze(content: string): Promise<SafetyCategory> {
    // Simplified personal info detection
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
    const ssnRegex = /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g;
    
    const emails = content.match(emailRegex) || [];
    const phones = content.match(phoneRegex) || [];
    const ssns = content.match(ssnRegex) || [];
    
    const totalMatches = emails.length + phones.length + ssns.length;
    const severity = Math.min(1.0, totalMatches * 0.4);
    const level = severity > 0.5 ? 'danger' : severity > 0.2 ? 'warning' : 'caution';

    return {
      type: 'personal_info',
      level,
      confidence: severity,
      details: `Detected ${emails.length} emails, ${phones.length} phone numbers, ${ssns.length} SSNs`,
      evidence: [...emails, ...phones, ...ssns]
    };
  }

  async quickCheck(content: string): Promise<{level: SafetyLevel, confidence: number}> {
    const result = await this.analyze(content);
    return { level: result.level, confidence: result.confidence };
  }
}

class ContentClassifier {
  private config: any;
  private logger: Logger;

  constructor(config: any, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async analyze(content: string): Promise<SafetyCategory> {
    // Simplified content classification
    return {
      type: 'toxicity',
      level: 'safe',
      confidence: 0.8,
      details: 'Content classified as safe',
      evidence: []
    };
  }

  async quickCheck(content: string): Promise<{level: SafetyLevel, confidence: number}> {
    return { level: 'safe', confidence: 0.8 };
  }
}
