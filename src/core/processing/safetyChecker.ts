import { Message } from 'discord.js';
import { Logger } from '../../utils/logger';
import { 
  MessageContext, 
  SafetyCheckResult, 
  RiskLevel, 
  SafetyViolation, 
  ViolationType, 
  PipelineConfig 
} from './types';

/**
 * Performs safety checks on messages to detect harmful content
 */
export class SafetyChecker {
  private config: PipelineConfig;
  private logger: Logger;
  private profanityList: Set<string> = new Set();
  private maliciousDomains: Set<string> = new Set();
  private personalInfoPatterns: RegExp[] = [];
  private hateSpeechPatterns: RegExp[] = [];
  private selfHarmPatterns: RegExp[] = [];
  private violencePatterns: RegExp[] = [];

  constructor(config: PipelineConfig) {
    this.config = config;
    this.logger = new Logger('SafetyChecker');
    this.initializeSafetyPatterns();
  }

  /**
   * Perform comprehensive safety checks on a message
   */
  async checkSafety(
    message: Message, 
    context: MessageContext, 
    intent: any
  ): Promise<SafetyCheckResult> {
    try {
      const content = (message.content || '').toLowerCase();
      const violations: SafetyViolation[] = [];

      // Skip safety checks for trusted users/admins
      if (this.isTrustedUser(context)) {
        return this.createSafeResult();
      }

      // Perform various safety checks
      violations.push(...this.checkProfanity(content));
      violations.push(...this.checkHarassment(content, context));
      violations.push(...this.checkSpam(content, context));
      violations.push(...this.checkMaliciousLinks(content));
      violations.push(...this.checkPersonalInfo(content));
      violations.push(...this.checkHateSpeech(content));
      violations.push(...this.checkSelfHarm(content));
      violations.push(...this.checkViolence(content));

      // Determine overall safety
      const isSafe = violations.length === 0;
      const riskLevel = this.calculateRiskLevel(violations);
      const requiresAction = riskLevel !== RiskLevel.LOW;
      const confidence = this.calculateSafetyConfidence(violations, content);

      const result: SafetyCheckResult = {
        isSafe,
        riskLevel,
        violations,
        confidence,
        requiresAction
      };

      if (!isSafe) {
        this.logger.warn(`Safety violations detected in message ${message.id}:`, violations);
      }

      return result;

    } catch (error) {
      this.logger.error('Error during safety check:', error);
      return this.createSafeResult(); // Fail safe
    }
  }

  /**
   * Initialize safety patterns and word lists
   */
  private initializeSafetyPatterns(): void {
    // Initialize profanity list (would typically load from external source)
    this.profanityList = new Set([
      'damn', 'hell', 'shit', 'fuck', 'bitch', 'bastard',
      'asshole', 'dick', 'pussy', 'cock', 'cunt'
    ]);

    // Initialize malicious domains
    this.maliciousDomains = new Set([
      'malicious-site.com', 'phishing.net', 'scam.org'
    ]);

    // Initialize personal info patterns
    this.personalInfoPatterns = [
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone numbers
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
      /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, // Credit card numbers
      /\b\d{3}-\d{2}-\d{4}\b/g // SSN pattern
    ];

    // Initialize hate speech patterns
    this.hateSpeechPatterns = [
      /\b(hate|kill|destroy|eliminate)\s+\w+\s+(group|people|race|religion)\b/gi,
      /\b(all\s+\w+|white\s+power|black\s+lives)\s+(should|must|need)\s+(die|go|leave)\b/gi
    ];

    // Initialize self-harm patterns
    this.selfHarmPatterns = [
      /\b(kill\s+myself|suicide|end\s+my\s+life|want\s+to\s+die)\b/gi,
      /\b(self\s+harm|hurt\s+myself|cut\s+myself)\b/gi
    ];

    // Initialize violence patterns
    this.violencePatterns = [
      /\b(kill|murder|attack|beat|fight|harm)\s+\w+\b/gi,
      /\b(shoot|stab|bomb|weapon|threat)\b/gi
    ];
  }

  /**
   * Check for profanity
   */
  private checkProfanity(content: string): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    const words = content.split(/\s+/);

    for (const word of words) {
      if (this.profanityList.has(word)) {
        violations.push({
          type: ViolationType.PROFANITY,
          severity: RiskLevel.MEDIUM,
          description: `Profanity detected: ${word}`,
          detectedContent: word,
          suggestedAction: 'Warn user and consider moderation'
        });
      }
    }

    return violations;
  }

  /**
   * Check for harassment
   */
  private checkHarassment(content: string, context: MessageContext): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    
    // Check for repeated mentions (potential harassment)
    const mentionCount = (content.match(/@/g) || []).length;
    if (mentionCount > 5) {
      violations.push({
        type: ViolationType.HARASSMENT,
        severity: RiskLevel.HIGH,
        description: 'Excessive user mentions detected',
        detectedContent: content,
        suggestedAction: 'Review for potential harassment'
      });
    }

    // Check for targeted harassment patterns
    const harassmentPatterns = [
      /\b(stupid|idiot|dumb|retard)\s+@\w+/gi,
      /\b(stop\s+spamming|leave\s+me\s+alone|get\s+lost)\b/gi
    ];

    for (const pattern of harassmentPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: ViolationType.HARASSMENT,
          severity: RiskLevel.HIGH,
          description: 'Harassment pattern detected',
          detectedContent: content,
          suggestedAction: 'Immediate moderation review'
        });
        break;
      }
    }

    return violations;
  }

  /**
   * Check for spam
   */
  private checkSpam(content: string, context: MessageContext): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    const spamScore = context.userHistory?.spamScore || 0;

    if (spamScore > this.config.safetyThreshold) {
      violations.push({
        type: ViolationType.SPAM,
        severity: RiskLevel.MEDIUM,
        description: `High spam score: ${spamScore.toFixed(2)}`,
        detectedContent: content,
        suggestedAction: 'Temporarily mute user'
      });
    }

    // Check for repetitive content
    const repeatedChars = /(.)\1{4,}/g;
    if (repeatedChars.test(content)) {
      violations.push({
        type: ViolationType.SPAM,
        severity: RiskLevel.LOW,
        description: 'Repetitive character patterns detected',
        detectedContent: content,
        suggestedAction: 'Monitor for spam'
      });
    }

    // Check for excessive caps
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.7 && content.length > 10) {
      violations.push({
        type: ViolationType.SPAM,
        severity: RiskLevel.LOW,
        description: 'Excessive capitalization',
        detectedContent: content,
        suggestedAction: 'Convert to lowercase and process'
      });
    }

    return violations;
  }

  /**
   * Check for malicious links
   */
  private checkMaliciousLinks(content: string): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const urls = content.match(urlPattern) || [];

    for (const url of urls) {
      try {
        const domain = new URL(url).hostname.toLowerCase();
        
        if (this.maliciousDomains.has(domain)) {
          violations.push({
            type: ViolationType.MALICIOUS_LINKS,
            severity: RiskLevel.CRITICAL,
            description: `Malicious domain detected: ${domain}`,
            detectedContent: url,
            suggestedAction: 'Remove message and ban user'
          });
        }

        // Check for suspicious URL patterns
        if (url.includes('bit.ly') || url.includes('tinyurl') || url.includes('short.link')) {
          violations.push({
            type: ViolationType.MALICIOUS_LINKS,
            severity: RiskLevel.MEDIUM,
            description: 'Shortened URL detected',
            detectedContent: url,
            suggestedAction: 'Review URL content'
          });
        }

      } catch (error) {
        // Invalid URL, skip
      }
    }

    return violations;
  }

  /**
   * Check for personal information
   */
  private checkPersonalInfo(content: string): SafetyViolation[] {
    const violations: SafetyViolation[] = [];

    for (const pattern of this.personalInfoPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        violations.push({
          type: ViolationType.PERSONAL_INFO,
          severity: RiskLevel.HIGH,
          description: 'Personal information detected',
          detectedContent: matches.join(', '),
          suggestedAction: 'Remove message and warn user'
        });
        break; // One violation is enough
      }
    }

    return violations;
  }

  /**
   * Check for hate speech
   */
  private checkHateSpeech(content: string): SafetyViolation[] {
    const violations: SafetyViolation[] = [];

    for (const pattern of this.hateSpeechPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: ViolationType.HATE_SPEECH,
          severity: RiskLevel.CRITICAL,
          description: 'Hate speech detected',
          detectedContent: content,
          suggestedAction: 'Remove message and moderate user'
        });
        break;
      }
    }

    return violations;
  }

  /**
   * Check for self-harm content
   */
  private checkSelfHarm(content: string): SafetyViolation[] {
    const violations: SafetyViolation[] = [];

    for (const pattern of this.selfHarmPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: ViolationType.SELF_HARM,
          severity: RiskLevel.CRITICAL,
          description: 'Self-harm content detected',
          detectedContent: content,
          suggestedAction: 'Provide help resources and notify moderators'
        });
        break;
      }
    }

    return violations;
  }

  /**
   * Check for violence content
   */
  private checkViolence(content: string): SafetyViolation[] {
    const violations: SafetyViolation[] = [];

    for (const pattern of this.violencePatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: ViolationType.VIOLENCE,
          severity: RiskLevel.HIGH,
          description: 'Violence content detected',
          detectedContent: content,
          suggestedAction: 'Review for moderation'
        });
        break;
      }
    }

    return violations;
  }

  /**
   * Check if user is trusted (admin/moderator)
   */
  private isTrustedUser(context: MessageContext): boolean {
    return context.guildContext?.userRoles.some(role =>
      role.toLowerCase().includes('admin') || 
      role.toLowerCase().includes('moderator') ||
      role.toLowerCase().includes('owner')
    ) || false;
  }

  /**
   * Calculate overall risk level from violations
   */
  private calculateRiskLevel(violations: SafetyViolation[]): RiskLevel {
    if (violations.length === 0) {
      return RiskLevel.LOW;
    }

    const hasCritical = violations.some(v => v.severity === RiskLevel.CRITICAL);
    if (hasCritical) {
      return RiskLevel.CRITICAL;
    }

    const hasHigh = violations.some(v => v.severity === RiskLevel.HIGH);
    if (hasHigh) {
      return RiskLevel.HIGH;
    }

    const hasMedium = violations.some(v => v.severity === RiskLevel.MEDIUM);
    if (hasMedium) {
      return RiskLevel.MEDIUM;
    }

    return RiskLevel.LOW;
  }

  /**
   * Calculate safety confidence score
   */
  private calculateSafetyConfidence(violations: SafetyViolation[], content: string): number {
    if (violations.length === 0) {
      return 1.0;
    }

    // Base confidence on number and severity of violations
    const severityWeights = {
      [RiskLevel.LOW]: 0.1,
      [RiskLevel.MEDIUM]: 0.3,
      [RiskLevel.HIGH]: 0.6,
      [RiskLevel.CRITICAL]: 0.9
    };

    const totalWeight = violations.reduce((sum, violation) => 
      sum + severityWeights[violation.severity], 0
    );

    // Adjust for content length (longer content might have more false positives)
    const lengthFactor = Math.min(1, 50 / Math.max(content.length, 50));

    return Math.max(0, 1 - totalWeight) * lengthFactor;
  }

  /**
   * Create safe result (no violations)
   */
  private createSafeResult(): SafetyCheckResult {
    return {
      isSafe: true,
      riskLevel: RiskLevel.LOW,
      violations: [],
      confidence: 1.0,
      requiresAction: false
    };
  }

  /**
   * Update checker configuration
   */
  updateConfig(config: PipelineConfig): void {
    this.config = config;
    this.logger.debug('Safety checker configuration updated');
  }

  /**
   * Add custom profanity words
   */
  addProfanityWords(words: string[]): void {
    words.forEach(word => this.profanityList.add(word.toLowerCase()));
    this.logger.debug(`Added ${words.length} profanity words`);
  }

  /**
   * Add malicious domains
   */
  addMaliciousDomains(domains: string[]): void {
    domains.forEach(domain => this.maliciousDomains.add(domain.toLowerCase()));
    this.logger.debug(`Added ${domains.length} malicious domains`);
  }
}