/**
 * Feedback Collector
 * 
 * Main module for collecting user feedback including ratings,
 * feature requests, and bug reports.
 */

import { FeedbackRepository } from './feedback-repository';
import { Feedback, FeedbackType, FeedbackCollectionRequest, FeedbackMetadata } from './feedback-model';
import { Logger } from '../utils/logger';

// ============================================================================
// FEEDBACK COLLECTOR CONFIGURATION
// ============================================================================

/**
 * Configuration for feedback collector
 */
export interface FeedbackCollectorConfig {
  enableAutoPrompts: boolean;
  promptAfterCommands: boolean;
  promptAfterResponses: boolean;
  minRatingPromptInterval: number; // in minutes
  maxFeedbackPerUserPerDay: number;
  requireAuthentication: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FeedbackCollectorConfig = {
  enableAutoPrompts: true,
  promptAfterCommands: false,
  promptAfterResponses: true,
  minRatingPromptInterval: 60, // 1 hour
  maxFeedbackPerUserPerDay: 10,
  requireAuthentication: false,
};

// ============================================================================
// FEEDBACK COLLECTOR CLASS
// ============================================================================

/**
 * Main feedback collection class
 */
export class FeedbackCollector {
  private repository: FeedbackRepository;
  private logger: Logger;
  private config: FeedbackCollectorConfig;
  private userFeedbackCache: Map<string, Date[]> = new Map();
  private lastPromptCache: Map<string, Date> = new Map();

  constructor(repository: FeedbackRepository, config?: Partial<FeedbackCollectorConfig>) {
    this.repository = repository;
    this.logger = new Logger('FeedbackCollector');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Collect a satisfaction rating from user
   * 
   * @param request - Rating collection request
   * @returns The created feedback entry
   */
  async collectRating(request: {
    userId: string;
    serverId?: string;
    channelId?: string;
    rating: number; // 1-5 stars
    metadata?: Partial<FeedbackMetadata>;
  }): Promise<Feedback> {
    // Validate rating
    if (request.rating < 1 || request.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Check rate limit
    if (!await this.checkRateLimit(request.userId)) {
      throw new Error('Maximum feedback submissions per day exceeded');
    }

    const feedbackRequest: FeedbackCollectionRequest = {
      userId: request.userId,
      serverId: request.serverId,
      channelId: request.channelId,
      type: 'rating',
      content: `Rating: ${request.rating}/5`,
      rating: request.rating,
      metadata: request.metadata,
    };

    const feedback = await this.repository.createFeedback(feedbackRequest);
    this.recordSubmission(request.userId);
    this.logger.info(`Collected rating from user ${request.userId}: ${request.rating}/5`);

    return feedback;
  }

  /**
   * Collect a feature request from user
   * 
   * @param request - Feature request collection request
   * @returns The created feedback entry
   */
  async collectFeatureRequest(request: {
    userId: string;
    serverId?: string;
    channelId?: string;
    title: string;
    description: string;
    category?: string;
    metadata?: Partial<FeedbackMetadata>;
  }): Promise<Feedback> {
    // Validate input
    if (!request.title || request.title.trim().length === 0) {
      throw new Error('Feature request title is required');
    }

    if (!request.description || request.description.trim().length === 0) {
      throw new Error('Feature request description is required');
    }

    // Check rate limit
    if (!await this.checkRateLimit(request.userId)) {
      throw new Error('Maximum feedback submissions per day exceeded');
    }

    const content = `Feature Request: ${request.title}\n\n${request.description}`;
    const metadata: FeedbackMetadata = {
      ...request.metadata,
      additionalContext: {
        title: request.title,
        category: request.category,
      },
    };

    const feedbackRequest: FeedbackCollectionRequest = {
      userId: request.userId,
      serverId: request.serverId,
      channelId: request.channelId,
      type: 'feature_request',
      content,
      metadata,
    };

    const feedback = await this.repository.createFeedback(feedbackRequest);
    this.recordSubmission(request.userId);
    this.logger.info(`Collected feature request from user ${request.userId}: ${request.title}`);

    return feedback;
  }

  /**
   * Collect a bug report from user
   * 
   * @param request - Bug report collection request
   * @returns The created feedback entry
   */
  async collectBugReport(request: {
    userId: string;
    serverId?: string;
    channelId?: string;
    title: string;
    description: string;
    steps?: string[];
    expectedBehavior?: string;
    actualBehavior?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Partial<FeedbackMetadata>;
  }): Promise<Feedback> {
    // Validate input
    if (!request.title || request.title.trim().length === 0) {
      throw new Error('Bug report title is required');
    }

    if (!request.description || request.description.trim().length === 0) {
      throw new Error('Bug report description is required');
    }

    // Check rate limit
    if (!await this.checkRateLimit(request.userId)) {
      throw new Error('Maximum feedback submissions per day exceeded');
    }

    let content = `Bug Report: ${request.title}\n\n`;
    content += `Description: ${request.description}\n`;

    if (request.steps && request.steps.length > 0) {
      content += `\nSteps to reproduce:\n${request.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`;
    }

    if (request.expectedBehavior) {
      content += `\nExpected behavior: ${request.expectedBehavior}\n`;
    }

    if (request.actualBehavior) {
      content += `\nActual behavior: ${request.actualBehavior}\n`;
    }

    const metadata: FeedbackMetadata = {
      ...request.metadata,
      additionalContext: {
        title: request.title,
        severity: request.severity || 'medium',
        steps: request.steps,
        expectedBehavior: request.expectedBehavior,
        actualBehavior: request.actualBehavior,
      },
    };

    const feedbackRequest: FeedbackCollectionRequest = {
      userId: request.userId,
      serverId: request.serverId,
      channelId: request.channelId,
      type: 'bug_report',
      content,
      metadata,
    };

    const feedback = await this.repository.createFeedback(feedbackRequest);
    this.recordSubmission(request.userId);
    this.logger.info(`Collected bug report from user ${request.userId}: ${request.title}`);

    return feedback;
  }

  /**
   * Collect general feedback from user
   * 
   * @param request - General feedback collection request
   * @returns The created feedback entry
   */
  async collectGeneralFeedback(request: {
    userId: string;
    serverId?: string;
    channelId?: string;
    content: string;
    category?: string;
    metadata?: Partial<FeedbackMetadata>;
  }): Promise<Feedback> {
    // Validate input
    if (!request.content || request.content.trim().length === 0) {
      throw new Error('Feedback content is required');
    }

    // Check rate limit
    if (!await this.checkRateLimit(request.userId)) {
      throw new Error('Maximum feedback submissions per day exceeded');
    }

    const metadata: FeedbackMetadata = {
      ...request.metadata,
      additionalContext: {
        category: request.category,
      },
    };

    const feedbackRequest: FeedbackCollectionRequest = {
      userId: request.userId,
      serverId: request.serverId,
      channelId: request.channelId,
      type: 'general',
      content: request.content,
      metadata,
    };

    const feedback = await this.repository.createFeedback(feedbackRequest);
    this.recordSubmission(request.userId);
    this.logger.info(`Collected general feedback from user ${request.userId}`);

    return feedback;
  }

  /**
   * Check if we should prompt user for feedback
   * 
   * @param userId - User ID
   * @param interactionType - Type of interaction
   * @returns Whether to prompt for feedback
   */
  shouldPromptForFeedback(userId: string, interactionType: 'command' | 'response'): boolean {
    if (!this.config.enableAutoPrompts) {
      return false;
    }

    if (interactionType === 'command' && !this.config.promptAfterCommands) {
      return false;
    }

    if (interactionType === 'response' && !this.config.promptAfterResponses) {
      return false;
    }

    // Check if we've prompted recently
    const lastPrompt = this.lastPromptCache.get(userId);
    if (lastPrompt) {
      const elapsed = Date.now() - lastPrompt.getTime();
      const minInterval = this.config.minRatingPromptInterval * 60 * 1000;
      if (elapsed < minInterval) {
        return false;
      }
    }

    return true;
  }

  /**
   * Record that we prompted a user for feedback
   * 
   * @param userId - User ID
   */
  recordFeedbackPrompt(userId: string): void {
    this.lastPromptCache.set(userId, new Date());
  }

  /**
   * Generate a feedback prompt message
   * 
   * @param interactionType - Type of interaction
   * @returns Formatted prompt message
   */
  generateFeedbackPrompt(interactionType: 'command' | 'response'): string {
    const prompts = {
      command: [
        'How was your experience with this command? Rate it 1-5 stars or leave a comment!',
        'Did this command help you? Let us know your feedback!',
        'Rate this command (1-5 stars) or share your thoughts!',
      ],
      response: [
        'How helpful was this response? Rate it 1-5 stars!',
        'Was this response helpful? Please share your feedback!',
        'Rate this response (1-5 stars) to help us improve!',
      ],
    };

    const typePrompts = prompts[interactionType];
    return typePrompts[Math.floor(Math.random() * typePrompts.length)];
  }

  /**
   * Generate feedback collection buttons for Discord
   * 
   * @param feedbackId - Feedback ID for tracking
   * @returns Button configuration
   */
  generateFeedbackButtons(feedbackId: string): {
    label: string;
    value: string;
    emoji?: string;
  }[] {
    return [
      { label: '⭐ 1 Star', value: `${feedbackId}:1` },
      { label: '⭐⭐ 2 Stars', value: `${feedbackId}:2` },
      { label: '⭐⭐⭐ 3 Stars', value: `${feedbackId}:3` },
      { label: '⭐⭐⭐⭐ 4 Stars', value: `${feedbackId}:4` },
      { label: '⭐⭐⭐⭐⭐ 5 Stars', value: `${feedbackId}:5` },
      { label: '💬 Comment', value: `${feedbackId}:comment` },
    ];
  }

  /**
   * Process rating button click
   * 
   * @param userId - User ID
   * @param value - Button value
   * @returns The created feedback entry
   */
  async processRatingButton(userId: string, value: string, serverId?: string, channelId?: string): Promise<Feedback> {
    const [feedbackId, rating] = value.split(':');

    if (rating === 'comment') {
      // User wants to add a comment, return feedback ID for reference
      const feedback = await this.repository.findById(feedbackId);
      if (!feedback) {
        throw new Error('Feedback not found');
      }
      return feedback;
    }

    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      throw new Error('Invalid rating');
    }

    return this.collectRating({
      userId,
      serverId,
      channelId,
      rating: ratingNum,
      metadata: {
        messageId: feedbackId,
        interactionType: 'reaction',
      },
    });
  }

  /**
   * Get feedback statistics for a user
   * 
   * @param userId - User ID
   * @returns User feedback statistics
   */
  async getUserFeedbackStats(userId: string): Promise<{
    total: number;
    byType: Record<FeedbackType, number>;
    averageRating: number;
    lastSubmitted?: Date;
  }> {
    const feedback = await this.repository.getRecentByUser(userId, 100);
    const byType: Record<FeedbackType, number> = {
      rating: 0,
      feature_request: 0,
      bug_report: 0,
      general: 0,
    };

    let ratingSum = 0;
    let ratingCount = 0;

    for (const f of feedback) {
      byType[f.type]++;
      if (f.rating) {
        ratingSum += f.rating;
        ratingCount++;
      }
    }

    return {
      total: feedback.length,
      byType,
      averageRating: ratingCount > 0 ? ratingSum / ratingCount : 0,
      lastSubmitted: feedback.length > 0 ? feedback[0].createdAt : undefined,
    };
  }

  /**
   * Check if user has exceeded rate limit
   * 
   * @param userId - User ID
   * @returns Whether user can submit feedback
   */
  private async checkRateLimit(userId: string): Promise<boolean> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const submissions = this.userFeedbackCache.get(userId) || [];
    const todaySubmissions = submissions.filter((date) => date >= startOfDay);

    return todaySubmissions.length < this.config.maxFeedbackPerUserPerDay;
  }

  /**
   * Record a feedback submission for rate limiting
   * 
   * @param userId - User ID
   */
  private recordSubmission(userId: string): void {
    const submissions = this.userFeedbackCache.get(userId) || [];
    submissions.push(new Date());

    // Clean up old submissions (older than 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const filtered = submissions.filter((date) => date > cutoff);

    this.userFeedbackCache.set(userId, filtered);
  }

  /**
   * Clear rate limit cache for a user (for testing)
   * 
   * @param userId - User ID
   */
  clearRateLimit(userId: string): void {
    this.userFeedbackCache.delete(userId);
  }

  /**
   * Update collector configuration
   * 
   * @param config - New configuration
   */
  updateConfig(config: Partial<FeedbackCollectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Feedback collector configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   * 
   * @returns Current configuration
   */
  getConfig(): FeedbackCollectorConfig {
    return { ...this.config };
  }
}

// ============================================================================
// FEEDBACK COLLECTION INTERFACE
// ============================================================================

/**
 * Public interface for feedback collection operations
 */
export interface FeedbackCollectionInterface {
  collectRating(request: {
    userId: string;
    serverId?: string;
    channelId?: string;
    rating: number;
    metadata?: Partial<FeedbackMetadata>;
  }): Promise<Feedback>;

  collectFeatureRequest(request: {
    userId: string;
    serverId?: string;
    channelId?: string;
    title: string;
    description: string;
    category?: string;
    metadata?: Partial<FeedbackMetadata>;
  }): Promise<Feedback>;

  collectBugReport(request: {
    userId: string;
    serverId?: string;
    channelId?: string;
    title: string;
    description: string;
    steps?: string[];
    expectedBehavior?: string;
    actualBehavior?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Partial<FeedbackMetadata>;
  }): Promise<Feedback>;

  collectGeneralFeedback(request: {
    userId: string;
    serverId?: string;
    channelId?: string;
    content: string;
    category?: string;
    metadata?: Partial<FeedbackMetadata>;
  }): Promise<Feedback>;

  shouldPromptForFeedback(userId: string, interactionType: 'command' | 'response'): boolean;
  generateFeedbackPrompt(interactionType: 'command' | 'response'): string;
  generateFeedbackButtons(feedbackId: string): {
    label: string;
    value: string;
    emoji?: string;
  }[];
  processRatingButton(userId: string, value: string, serverId?: string, channelId?: string): Promise<Feedback>;
  getUserFeedbackStats(userId: string): Promise<{
    total: number;
    byType: Record<FeedbackType, number>;
    averageRating: number;
    lastSubmitted?: Date;
  }>;
}
