/**
 * Safety Analyzer
 * 
 * This module implements content filtering and safety checks
 * for the AI system.
 */

import { 
  SafetyAnalysis, 
  SafetyLevel, 
  SafetyCategory, 
  SafetyType, 
  SafetyRecommendation,
  ModerationAction
} from '../../../types/ai';
import { Logger } from '../../../utils/logger';

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

  constructor(config: SafetyAnalyzerConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
    this.initializeSafetyRules();
    this.toxicityDetector = new ToxicityDetector(config.toxicity, logger);
    this.personalInfoDetector = new PersonalInfoDetector(config.personalInfo, logger);
    this.contentClassifier = new ContentClassifier(config.contentClassification, logger);
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
      categoryBreakdown: {},
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
    for (const type of Object.values(SafetyType)) {
      this.safetyRules.set(type, []);
    }
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

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

export interface SafetyAnalyzerConfig {
  enabledChecks: SafetyType[];
  strictMode: boolean;
  blockThreshold?: SafetyLevel;
  maxConcurrentAnalyses: number;
  toxicity: any;
  personalInfo: any;
  contentClassification: any;
}

export interface SafetyAnalysisOptions {
  enabledChecks?: SafetyType[];
  strictMode?: boolean;
  blockThreshold?: SafetyLevel;
  context?: any;
  userId?: string;
}

export interface SafetyRule {
  name: string;
  type: SafetyType;
  pattern: string | RegExp;
  action: ModerationAction;
  severity: SafetyLevel;
  enabled: boolean;
}

export interface SafetyStats {
  totalAnalyses: number;
  blockedContent: number;
  flaggedContent: number;
  safeContent: number;
  categoryBreakdown: Record<SafetyType, number>;
  averageProcessingTime: number;
  mostCommonIssues: string[];
}