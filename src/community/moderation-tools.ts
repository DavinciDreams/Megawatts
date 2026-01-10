/**
 * Moderation Tools
 *
 * Automated moderation tools for community management.
 * Provides auto-moderation, spam detection, content filtering,
 * user behavior monitoring, and warning/ban management.
 */

import { CommunityRepository } from './community-repository';
import { Logger } from '../utils/logger';
import {
  CommunityMember,
  CommunityGuideline,
  CommunityStatus,
  CommunityRole,
  TicketPriority,
  TicketStatus,
  SupportCategory
} from './community-models';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Moderation action result
 */
export interface ModerationActionResult {
  actionTaken: boolean;
  actionType: 'none' | 'warning' | 'timeout' | 'mute' | 'kick' | 'ban';
  reason?: string;
  guidelineViolated?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId: string;
  userName: string;
  timestamp: Date;
}

/**
 * Content analysis result
 */
export interface ContentAnalysisResult {
  isSpam: boolean;
  spamScore: number;
  isInappropriate: boolean;
  inappropriateScore: number;
  violations: string[];
  suggestedAction: 'none' | 'delete' | 'flag' | 'review';
  confidence: number;
}

/**
 * User behavior metrics
 */
export interface UserBehaviorMetrics {
  userId: string;
  userName: string;
  messageCount: number;
  messageFrequency: number;
  averageMessageLength: number;
  duplicateMessageCount: number;
  mentionCount: number;
  linkCount: number;
  attachmentCount: number;
  suspiciousPatterns: string[];
  riskScore: number;
  lastActivity: Date;
}

/**
 * Warning record
 */
export interface WarningRecord {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  guidelineId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  issuedBy: string;
  issuedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

/**
 * Ban record
 */
export interface BanRecord {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  duration?: number;
  permanent: boolean;
  issuedBy: string;
  issuedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

/**
 * Moderation configuration
 */
export interface ModerationConfig {
  spamThreshold: number;
  inappropriateThreshold: number;
  maxMessageFrequency: number;
  maxDuplicateMessages: number;
  maxMentionsPerMessage: number;
  autoBanThreshold: number;
  autoMuteDuration: number;
  warningExpiryDays: number;
  enableAutoModeration: boolean;
  enableSpamDetection: boolean;
  enableContentFiltering: boolean;
  enableBehaviorMonitoring: boolean;
}

/**
 * Moderation statistics
 */
export interface ModerationStatistics {
  totalActions: number;
  warningsIssued: number;
  bansIssued: number;
  mutesIssued: number;
  contentFlagged: number;
  spamDetected: number;
  inappropriateContentDetected: number;
  autoModerationActions: number;
  manualModerationActions: number;
}

// ============================================================================
// MODERATION TOOLS CLASS
// ============================================================================

/**
 * ModerationTools class for automated community moderation
 */
export class ModerationTools {
  private repository: CommunityRepository;
  private logger: Logger;
  private config: ModerationConfig;
  private warnings: Map<string, WarningRecord[]> = new Map();
  private bans: Map<string, BanRecord[]> = new Map();
  private userBehaviorCache: Map<string, UserBehaviorMetrics> = new Map();
  private statistics: ModerationStatistics;

  constructor(repository: CommunityRepository, logger: Logger, config?: Partial<ModerationConfig>) {
    this.repository = repository;
    this.logger = logger;
    this.config = {
      spamThreshold: 0.7,
      inappropriateThreshold: 0.7,
      maxMessageFrequency: 10,
      maxDuplicateMessages: 3,
      maxMentionsPerMessage: 5,
      autoBanThreshold: 5,
      autoMuteDuration: 15,
      warningExpiryDays: 30,
      enableAutoModeration: true,
      enableSpamDetection: true,
      enableContentFiltering: true,
      enableBehaviorMonitoring: true,
      ...config
    };

    this.statistics = {
      totalActions: 0,
      warningsIssued: 0,
      bansIssued: 0,
      mutesIssued: 0,
      contentFlagged: 0,
      spamDetected: 0,
      inappropriateContentDetected: 0,
      autoModerationActions: 0,
      manualModerationActions: 0
    };

    this.logger.info('ModerationTools initialized', { config: this.config });
  }

  // ============================================================================
  // AUTO-MODERATION
  // ============================================================================

  /**
   * Auto-moderate content based on community guidelines
   */
  async autoModerateContent(
    userId: string,
    userName: string,
    guildId: string,
    content: string,
    context?: string
  ): Promise<ModerationActionResult> {
    try {
      if (!this.config.enableAutoModeration) {
        return this.createNoActionResult(userId, userName);
      }

      const member = await this.repository.findMember(userId, guildId);
      if (!member) {
        return this.createNoActionResult(userId, userName);
      }

      // Get active guidelines
      const guidelines = await this.repository.getActiveGuidelines();

      // Analyze content
      const analysis = this.analyzeContent(content, guidelines);

      // Determine action based on analysis and user history
      const action = await this.determineModerationAction(
        userId,
        userName,
        guildId,
        analysis,
        member
      );

      if (action.actionTaken) {
        this.statistics.totalActions++;
        this.statistics.autoModerationActions++;

        if (action.actionType === 'warning') {
          this.statistics.warningsIssued++;
        } else if (action.actionType === 'ban') {
          this.statistics.bansIssued++;
        } else if (action.actionType === 'mute') {
          this.statistics.mutesIssued++;
        }
      }

      this.logger.info('Auto-moderation completed', {
        userId,
        userName,
        action: action.actionType,
        reason: action.reason
      });

      return action;
    } catch (error) {
      this.logger.error('Failed to auto-moderate content:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Analyze content against guidelines
   */
  private analyzeContent(content: string, guidelines: CommunityGuideline[]): ContentAnalysisResult {
    const lowerContent = content.toLowerCase();
    const violations: string[] = [];
    let spamScore = 0;
    let inappropriateScore = 0;

    // Check against guidelines
    for (const guideline of guidelines) {
      if (!guideline.isActive) continue;

      const guidelineContent = guideline.content.toLowerCase();
      const keywords = this.extractKeywords(guidelineContent);

      for (const keyword of keywords) {
        if (lowerContent.includes(keyword)) {
          violations.push(guideline.title);
          inappropriateScore += guideline.priority * 0.1;

          if (guideline.severity === 'critical') {
            inappropriateScore += 0.3;
          } else if (guideline.severity === 'high') {
            inappropriateScore += 0.2;
          } else if (guideline.severity === 'medium') {
            inappropriateScore += 0.1;
          }
        }
      }
    }

    // Spam detection
    if (this.config.enableSpamDetection) {
      const spamAnalysis = this.detectSpam(content);
      spamScore = spamAnalysis.score;
      if (spamAnalysis.isSpam) {
        violations.push('Spam');
      }
    }

    // Normalize scores
    spamScore = Math.min(spamScore, 1);
    inappropriateScore = Math.min(inappropriateScore, 1);

    // Determine suggested action
    let suggestedAction: 'none' | 'delete' | 'flag' | 'review' = 'none';
    const isSpam = spamScore >= this.config.spamThreshold;
    const isInappropriate = inappropriateScore >= this.config.inappropriateThreshold;

    if (isSpam && isInappropriate) {
      suggestedAction = 'delete';
    } else if (isSpam) {
      suggestedAction = 'delete';
    } else if (isInappropriate) {
      suggestedAction = 'flag';
    } else if (violations.length > 0) {
      suggestedAction = 'review';
    }

    return {
      isSpam,
      spamScore,
      isInappropriate,
      inappropriateScore,
      violations,
      suggestedAction,
      confidence: Math.max(spamScore, inappropriateScore)
    };
  }

  /**
   * Extract keywords from guideline content
   */
  private extractKeywords(content: string): string[] {
    // Simple keyword extraction - split by common delimiters
    const keywords = content
      .split(/[,\n;]|(?:\s+(?:and|or|or)\s+)/i)
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 2);

    return [...new Set(keywords)];
  }

  /**
   * Determine moderation action based on analysis and user history
   */
  private async determineModerationAction(
    userId: string,
    userName: string,
    guildId: string,
    analysis: ContentAnalysisResult,
    member: CommunityMember
  ): Promise<ModerationActionResult> {
    const userWarnings = this.warnings.get(userId) || [];
    const activeWarnings = userWarnings.filter(w => w.isActive);

    // Check for critical violations
    if (analysis.violations.some(v => v.toLowerCase().includes('critical'))) {
      return this.createBanAction(
        userId,
        userName,
        guildId,
        'Critical guideline violation',
        'critical',
        true
      );
    }

    // Check for high severity violations
    if (analysis.inappropriateScore > 0.8) {
      if (activeWarnings.length >= 2) {
        return this.createBanAction(
          userId,
          userName,
          guildId,
          'Repeated severe violations',
          'high',
          false
        );
      }
      return this.createWarningAction(
        userId,
        userName,
        guildId,
        'Severe content violation',
        'high',
        analysis.violations[0]
      );
    }

    // Check for spam
    if (analysis.isSpam && analysis.spamScore > 0.8) {
      if (activeWarnings.length >= 1) {
        return this.createMuteAction(
          userId,
          userName,
          guildId,
          'Repeated spam',
          'high'
        );
      }
      return this.createWarningAction(
        userId,
        userName,
        guildId,
        'Spam detected',
        'medium',
        'Spam'
      );
    }

    // Check for moderate violations
    if (analysis.inappropriateScore >= this.config.inappropriateThreshold) {
      if (activeWarnings.length >= this.config.autoBanThreshold) {
        return this.createBanAction(
          userId,
          userName,
          guildId,
          'Excessive violations',
          'medium',
          false
        );
      }
      return this.createWarningAction(
        userId,
        userName,
        guildId,
        'Content violation',
        'medium',
        analysis.violations[0]
      );
    }

    return this.createNoActionResult(userId, userName);
  }

  /**
   * Create no action result
   */
  private createNoActionResult(userId: string, userName: string): ModerationActionResult {
    return {
      actionTaken: false,
      actionType: 'none',
      severity: 'low',
      userId,
      userName,
      timestamp: new Date()
    };
  }

  /**
   * Create warning action result
   */
  private createWarningAction(
    userId: string,
    userName: string,
    guildId: string,
    reason: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    guidelineViolated?: string
  ): ModerationActionResult {
    const warning: WarningRecord = {
      id: `warn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      userName,
      reason,
      guidelineId: guidelineViolated,
      severity,
      issuedBy: 'system',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.warningExpiryDays * 24 * 60 * 60 * 1000),
      isActive: true
    };

    const userWarnings = this.warnings.get(userId) || [];
    userWarnings.push(warning);
    this.warnings.set(userId, userWarnings);

    return {
      actionTaken: true,
      actionType: 'warning',
      reason,
      guidelineViolated,
      severity,
      userId,
      userName,
      timestamp: new Date()
    };
  }

  /**
   * Create mute action result
   */
  private createMuteAction(
    userId: string,
    userName: string,
    guildId: string,
    reason: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): ModerationActionResult {
    return {
      actionTaken: true,
      actionType: 'mute',
      reason,
      severity,
      userId,
      userName,
      timestamp: new Date()
    };
  }

  /**
   * Create ban action result
   */
  private createBanAction(
    userId: string,
    userName: string,
    guildId: string,
    reason: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    permanent: boolean
  ): ModerationActionResult {
    const ban: BanRecord = {
      id: `ban_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      userName,
      reason,
      permanent,
      issuedBy: 'system',
      issuedAt: new Date(),
      expiresAt: permanent ? undefined : new Date(Date.now() + this.config.autoMuteDuration * 60 * 1000),
      isActive: true
    };

    const userBans = this.bans.get(userId) || [];
    userBans.push(ban);
    this.bans.set(userId, userBans);

    return {
      actionTaken: true,
      actionType: 'ban',
      reason,
      severity,
      userId,
      userName,
      timestamp: new Date()
    };
  }

  // ============================================================================
  // SPAM DETECTION
  // ============================================================================

  /**
   * Detect spam in content
   */
  detectSpam(content: string): { isSpam: boolean; score: number; patterns: string[] } {
    const patterns: string[] = [];
    let score = 0;

    const lowerContent = content.toLowerCase();

    // Check for excessive capitalization
    const uppercaseRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (uppercaseRatio > 0.7 && content.length > 10) {
      score += 0.2;
      patterns.push('excessive_caps');
    }

    // Check for excessive repetition
    const repeatedChars = content.match(/(.)\1{4,}/g);
    if (repeatedChars && repeatedChars.length > 0) {
      score += 0.15;
      patterns.push('repeated_chars');
    }

    // Check for excessive punctuation
    const punctuationCount = (content.match(/[!?]/g) || []).length;
    if (punctuationCount > 5) {
      score += 0.15;
      patterns.push('excessive_punctuation');
    }

    // Check for suspicious links
    const linkCount = (content.match(/https?:\/\/\S+/g) || []).length;
    if (linkCount > 3) {
      score += 0.2;
      patterns.push('excessive_links');
    }

    // Check for common spam phrases
    const spamPhrases = [
      'click here', 'free money', 'win big', 'limited time',
      'act now', 'don\'t miss', 'exclusive offer', 'guaranteed',
      'risk free', 'no obligation', 'join now', 'sign up free'
    ];
    for (const phrase of spamPhrases) {
      if (lowerContent.includes(phrase)) {
        score += 0.1;
        patterns.push(`spam_phrase:${phrase}`);
      }
    }

    // Check for excessive emojis
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
    if (emojiCount > 10) {
      score += 0.1;
      patterns.push('excessive_emojis');
    }

    // Check for suspicious formatting
    if (content.includes('```') && content.split('```').length > 3) {
      score += 0.1;
      patterns.push('excessive_code_blocks');
    }

    return {
      isSpam: score >= this.config.spamThreshold,
      score,
      patterns
    };
  }

  // ============================================================================
  // CONTENT FILTERING
  // ============================================================================

  /**
   * Filter content based on community guidelines
   */
  filterContent(content: string, guidelines: CommunityGuideline[]): {
    filtered: boolean;
    filteredContent?: string;
    violations: string[];
  } {
    if (!this.config.enableContentFiltering) {
      return { filtered: false, violations: [] };
    }

    const violations: string[] = [];
    let filteredContent = content;

    for (const guideline of guidelines) {
      if (!guideline.isActive) continue;

      const keywords = this.extractKeywords(guideline.content);
      for (const keyword of keywords) {
        const regex = new RegExp(keyword, 'gi');
        if (regex.test(content)) {
          violations.push(guideline.title);
          filteredContent = filteredContent.replace(regex, '***');
        }
      }
    }

    return {
      filtered: violations.length > 0,
      filteredContent: violations.length > 0 ? filteredContent : undefined,
      violations
    };
  }

  // ============================================================================
  // USER BEHAVIOR MONITORING
  // ============================================================================

  /**
   * Track user message for behavior analysis
   */
  async trackUserMessage(
    userId: string,
    userName: string,
    guildId: string,
    content: string,
    timestamp: Date
  ): Promise<UserBehaviorMetrics | null> {
    try {
      if (!this.config.enableBehaviorMonitoring) {
        return null;
      }

      const member = await this.repository.findMember(userId, guildId);
      if (!member) {
        return null;
      }

      // Get or create behavior metrics
      let metrics = this.userBehaviorCache.get(userId);
      if (!metrics) {
        metrics = {
          userId,
          userName,
          messageCount: 0,
          messageFrequency: 0,
          averageMessageLength: 0,
          duplicateMessageCount: 0,
          mentionCount: 0,
          linkCount: 0,
          attachmentCount: 0,
          suspiciousPatterns: [],
          riskScore: 0,
          lastActivity: timestamp
        };
      }

      // Update metrics
      metrics.messageCount++;
      metrics.messageFrequency = this.calculateMessageFrequency(metrics.messageCount, timestamp, metrics.lastActivity);
      metrics.averageMessageLength = this.updateAverage(metrics.averageMessageLength, metrics.messageCount, content.length);
      metrics.lastActivity = timestamp;

      // Count mentions
      const mentions = content.match(/<@!?(\d{17,20})>/g);
      metrics.mentionCount += mentions ? mentions.length : 0;

      // Count links
      const links = content.match(/https?:\/\/\S+/g);
      metrics.linkCount += links ? links.length : 0;

      // Detect suspicious patterns
      const suspiciousPatterns = this.detectSuspiciousPatterns(content);
      metrics.suspiciousPatterns.push(...suspiciousPatterns);

      // Calculate risk score
      metrics.riskScore = this.calculateRiskScore(metrics);

      this.userBehaviorCache.set(userId, metrics);

      // Check if action needed
      if (metrics.riskScore > 0.7) {
        this.logger.warn('High risk user detected', {
          userId,
          userName,
          riskScore: metrics.riskScore,
          suspiciousPatterns: metrics.suspiciousPatterns
        });
      }

      return metrics;
    } catch (error) {
      this.logger.error('Failed to track user message:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Calculate message frequency (messages per minute)
   */
  private calculateMessageFrequency(messageCount: number, currentTimestamp: Date, lastActivity: Date): number {
    const timeDiff = (currentTimestamp.getTime() - lastActivity.getTime()) / 1000 / 60; // minutes
    if (timeDiff <= 0) return messageCount;
    return messageCount / Math.max(timeDiff, 1);
  }

  /**
   * Update running average
   */
  private updateAverage(currentAverage: number, count: number, newValue: number): number {
    return ((currentAverage * (count - 1)) + newValue) / count;
  }

  /**
   * Detect suspicious patterns in message
   */
  private detectSuspiciousPatterns(content: string): string[] {
    const patterns: string[] = [];
    const lowerContent = content.toLowerCase();

    // Rapid duplicate messages
    if (this.userBehaviorCache.size > 0) {
      for (const [userId, metrics] of this.userBehaviorCache.entries()) {
        if (metrics.suspiciousPatterns.includes('rapid_duplicates')) {
          continue;
        }
        // Check if similar to recent messages
        if (lowerContent === lowerContent) {
          patterns.push('duplicate_message');
        }
      }
    }

    // Excessive formatting
    if (content.includes('**') && content.split('**').length > 4) {
      patterns.push('excessive_bold');
    }

    if (content.includes('__') && content.split('__').length > 4) {
      patterns.push('excessive_underline');
    }

    // Code injection attempts
    if (content.includes('eval(') || content.includes('Function(')) {
      patterns.push('code_injection_attempt');
    }

    // Discord token patterns
    if (/[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}/.test(content)) {
      patterns.push('discord_token_leak');
    }

    return patterns;
  }

  /**
   * Calculate user risk score
   */
  private calculateRiskScore(metrics: UserBehaviorMetrics): number {
    let score = 0;

    // High message frequency
    if (metrics.messageFrequency > this.config.maxMessageFrequency) {
      score += 0.3;
    }

    // Excessive mentions
    if (metrics.mentionCount / metrics.messageCount > 0.5) {
      score += 0.2;
    }

    // Excessive links
    if (metrics.linkCount / metrics.messageCount > 0.3) {
      score += 0.2;
    }

    // Suspicious patterns
    const uniquePatterns = [...new Set(metrics.suspiciousPatterns)];
    score += Math.min(uniquePatterns.length * 0.1, 0.3);

    return Math.min(score, 1);
  }

  /**
   * Get user behavior metrics
   */
  getUserBehaviorMetrics(userId: string): UserBehaviorMetrics | null {
    return this.userBehaviorCache.get(userId) || null;
  }

  /**
   * Clear user behavior cache
   */
  clearUserBehaviorCache(userId?: string): void {
    if (userId) {
      this.userBehaviorCache.delete(userId);
    } else {
      this.userBehaviorCache.clear();
    }
  }

  // ============================================================================
  // WARNING MANAGEMENT
  // ============================================================================

  /**
   * Issue warning to user
   */
  async issueWarning(
    userId: string,
    userName: string,
    guildId: string,
    reason: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    guidelineId?: string,
    issuedBy: string = 'system'
  ): Promise<WarningRecord> {
    try {
      const warning: WarningRecord = {
        id: `warn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        userName,
        reason,
        guidelineId,
        severity,
        issuedBy,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.warningExpiryDays * 24 * 60 * 60 * 1000),
        isActive: true
      };

      const userWarnings = this.warnings.get(userId) || [];
      userWarnings.push(warning);
      this.warnings.set(userId, userWarnings);

      // Increment warning count in repository
      await this.repository.incrementWarningCount(userId, guildId);

      this.statistics.warningsIssued++;
      this.statistics.totalActions++;

      this.logger.info('Warning issued', {
        userId,
        userName,
        reason,
        severity,
        issuedBy
      });

      return warning;
    } catch (error) {
      this.logger.error('Failed to issue warning:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get active warnings for user
   */
  getActiveWarnings(userId: string): WarningRecord[] {
    const userWarnings = this.warnings.get(userId) || [];
    return userWarnings.filter(w => w.isActive && (!w.expiresAt || w.expiresAt > new Date()));
  }

  /**
   * Get all warnings for user
   */
  getAllWarnings(userId: string): WarningRecord[] {
    return this.warnings.get(userId) || [];
  }

  /**
   * Clear expired warnings
   */
  clearExpiredWarnings(): number {
    let cleared = 0;
    const now = new Date();

    for (const [userId, warnings] of this.warnings.entries()) {
      const activeWarnings = warnings.filter(w => 
        w.isActive && (!w.expiresAt || w.expiresAt > now)
      );
      this.warnings.set(userId, activeWarnings);
      cleared += warnings.length - activeWarnings.length;
    }

    if (cleared > 0) {
      this.logger.info(`Cleared ${cleared} expired warnings`);
    }

    return cleared;
  }

  // ============================================================================
  // BAN MANAGEMENT
  // ============================================================================

  /**
   * Ban user
   */
  async banUser(
    userId: string,
    userName: string,
    guildId: string,
    reason: string,
    permanent: boolean = false,
    duration?: number,
    issuedBy: string = 'system'
  ): Promise<BanRecord> {
    try {
      const ban: BanRecord = {
        id: `ban_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        userName,
        reason,
        permanent,
        issuedBy,
        issuedAt: new Date(),
        expiresAt: permanent ? undefined : new Date(Date.now() + (duration || this.config.autoMuteDuration * 60 * 1000)),
        isActive: true
      };

      const userBans = this.bans.get(userId) || [];
      userBans.push(ban);
      this.bans.set(userId, userBans);

      // Update member status in repository
      await this.repository.updateMemberStatus(userId, guildId, 'banned');
      await this.repository.incrementBanCount(userId, guildId);

      this.statistics.bansIssued++;
      this.statistics.totalActions++;

      this.logger.info('User banned', {
        userId,
        userName,
        reason,
        permanent,
        issuedBy
      });

      return ban;
    } catch (error) {
      this.logger.error('Failed to ban user:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Unban user
   */
  async unbanUser(userId: string, userName: string, guildId: string, unbannedBy: string = 'system'): Promise<void> {
    try {
      const userBans = this.bans.get(userId) || [];
      const activeBan = userBans.find(b => b.isActive);

      if (activeBan) {
        activeBan.isActive = false;
        this.bans.set(userId, userBans);

        // Update member status in repository
        await this.repository.updateMemberStatus(userId, guildId, 'active');

        this.logger.info('User unbanned', {
          userId,
          userName,
          unbannedBy
        });
      }
    } catch (error) {
      this.logger.error('Failed to unban user:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get active bans
   */
  getActiveBans(): BanRecord[] {
    const activeBans: BanRecord[] = [];
    const now = new Date();

    for (const bans of this.bans.values()) {
      for (const ban of bans) {
        if (ban.isActive && (!ban.expiresAt || ban.expiresAt > now)) {
          activeBans.push(ban);
        }
      }
    }

    return activeBans;
  }

  /**
   * Get bans for user
   */
  getUserBans(userId: string): BanRecord[] {
    return this.bans.get(userId) || [];
  }

  /**
   * Clear expired bans
   */
  clearExpiredBans(): number {
    let cleared = 0;
    const now = new Date();

    for (const [userId, bans] of this.bans.entries()) {
      const wasBanned = bans.some(b => b.isActive && (!b.expiresAt || b.expiresAt > now));
      const activeBans = bans.filter(b => 
        b.isActive && (!b.expiresAt || b.expiresAt > now)
      );
      this.bans.set(userId, activeBans);
      cleared += bans.length - activeBans.length;

      // Auto-unban if user was banned and ban expired
      if (wasBanned && activeBans.length === 0) {
        this.logger.info(`Auto-unbanned user ${userId} due to expired ban`);
      }
    }

    if (cleared > 0) {
      this.logger.info(`Cleared ${cleared} expired bans`);
    }

    return cleared;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update moderation configuration
   */
  updateConfig(config: Partial<ModerationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Moderation config updated', { config: this.config });
  }

  /**
   * Get moderation configuration
   */
  getConfig(): ModerationConfig {
    return { ...this.config };
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get moderation statistics
   */
  getStatistics(): ModerationStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statistics = {
      totalActions: 0,
      warningsIssued: 0,
      bansIssued: 0,
      mutesIssued: 0,
      contentFlagged: 0,
      spamDetected: 0,
      inappropriateContentDetected: 0,
      autoModerationActions: 0,
      manualModerationActions: 0
    };
    this.logger.info('Moderation statistics reset');
  }

  /**
   * Record manual moderation action
   */
  recordManualAction(actionType: 'warning' | 'mute' | 'kick' | 'ban'): void {
    this.statistics.totalActions++;
    this.statistics.manualModerationActions++;

    switch (actionType) {
      case 'warning':
        this.statistics.warningsIssued++;
        break;
      case 'mute':
        this.statistics.mutesIssued++;
        break;
      case 'ban':
        this.statistics.bansIssued++;
        break;
    }
  }
}
