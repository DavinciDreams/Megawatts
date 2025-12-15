/**
 * Learning Engine
 * 
 * This module implements conversation pattern learning,
 * user preference adaptation, and self-improvement mechanisms.
 */

import { 
  LearningData,
  InteractionData,
  UserPattern,
  LearnedPreferences,
  PerformanceMetrics,
  AdaptationHistory,
  UserFeedback,
  InteractionMetrics,
  PatternPrediction,
  ConversationContext,
  UserPreferences,
  IntentAnalysis,
  SentimentAnalysis
} from '../../../types/ai';
import { Logger } from '../../../utils/logger';

// ============================================================================
// LEARNING ENGINE CLASS
// ============================================================================

export class LearningEngine {
  private logger: Logger;
  private config: LearningEngineConfig;
  private learningData: Map<string, LearningData> = new Map();
  private patternRecognizer: PatternRecognizer;
  private preferenceAdapter: PreferenceAdapter;
  private performanceOptimizer: PerformanceOptimizer;
  private selfImprovementEngine: SelfImprovementEngine;

  constructor(config: LearningEngineConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
    this.patternRecognizer = new PatternRecognizer(config.patterns, logger);
    this.preferenceAdapter = new PreferenceAdapter(config.preferences, logger);
    this.performanceOptimizer = new PerformanceOptimizer(config.performance, logger);
    this.selfImprovementEngine = new SelfImprovementEngine(config.selfImprovement, logger);
  }

  /**
   * Process an interaction for learning
   */
  async processInteraction(
    userId: string,
    interaction: Omit<InteractionData, 'id' | 'timestamp'>
  ): Promise<string> {
    try {
      const interactionId = this.generateInteractionId();
      const fullInteraction: InteractionData = {
        ...interaction,
        id: interactionId,
        timestamp: new Date()
      };

      // Get or create user learning data
      let learningData = this.learningData.get(userId);
      if (!learningData) {
        learningData = await this.initializeLearningData(userId);
        this.learningData.set(userId, learningData);
      }

      // Add interaction to history
      learningData.interactions.push(fullInteraction);

      // Update patterns
      await this.patternRecognizer.updatePatterns(learningData, fullInteraction);

      // Adapt preferences
      await this.preferenceAdapter.adaptPreferences(learningData, fullInteraction);

      // Update performance metrics
      await this.performanceOptimizer.updateMetrics(learningData, fullInteraction);

      // Trigger self-improvement if needed
      if (this.shouldTriggerSelfImprovement(learningData)) {
        await this.selfImprovementEngine.analyzeAndImprove(learningData);
      }

      // Clean up old data if needed
      await this.cleanupOldData(learningData);

      this.logger.info('Interaction processed for learning', {
        userId,
        interactionId,
        type: interaction.type,
        outcome: interaction.outcome
      });

      return interactionId;

    } catch (error) {
      this.logger.error('Failed to process interaction for learning', error as Error);
      throw error;
    }
  }

  /**
   * Get learning data for a user
   */
  getLearningData(userId: string): LearningData | undefined {
    return this.learningData.get(userId);
  }

  /**
   * Get user patterns
   */
  getUserPatterns(userId: string): UserPattern[] {
    const learningData = this.learningData.get(userId);
    return learningData?.patterns || [];
  }

  /**
   * Get learned preferences
   */
  getLearnedPreferences(userId: string): LearnedPreferences | undefined {
    const learningData = this.learningData.get(userId);
    return learningData?.preferences;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(userId: string): PerformanceMetrics | undefined {
    const learningData = this.learningData.get(userId);
    return learningData?.performance;
  }

  /**
   * Get adaptation history
   */
  getAdaptationHistory(userId: string): AdaptationHistory[] {
    const learningData = this.learningData.get(userId);
    return learningData?.adaptation || [];
  }

  /**
   * Predict user behavior
   */
  async predictUserBehavior(
    userId: string,
    context: ConversationContext,
    predictionType: 'intent' | 'response' | 'preference'
  ): Promise<PatternPrediction[]> {
    const learningData = this.learningData.get(userId);
    if (!learningData) {
      return [];
    }

    switch (predictionType) {
      case 'intent':
        return this.patternRecognizer.predictIntent(learningData, context);
      case 'response':
        return this.patternRecognizer.predictResponse(learningData, context);
      case 'preference':
        return this.preferenceAdapter.predictPreferences(learningData, context);
      default:
        return [];
    }
  }

  /**
   * Adapt response based on learning
   */
  async adaptResponse(
    userId: string,
    baseResponse: string,
    context: ConversationContext
  ): Promise<string> {
    const learningData = this.learningData.get(userId);
    if (!learningData) {
      return baseResponse;
    }

    // Apply learned adaptations
    let adaptedResponse = baseResponse;

    // Length adaptation
    adaptedResponse = await this.adaptResponseLength(adaptedResponse, learningData);

    // Tone adaptation
    adaptedResponse = await this.adaptResponseTone(adaptedResponse, learningData, context);

    // Format adaptation
    adaptedResponse = await this.adaptResponseFormat(adaptedResponse, learningData);

    // Content adaptation
    adaptedResponse = await this.adaptResponseContent(adaptedResponse, learningData, context);

    return adaptedResponse;
  }

  /**
   * Get learning statistics
   */
  getLearningStatistics(userId: string): LearningStats {
    const learningData = this.learningData.get(userId);
    if (!learningData) {
      return this.getEmptyStats();
    }

    const stats: LearningStats = {
      totalInteractions: learningData.interactions.length,
      successfulInteractions: learningData.interactions.filter(i => i.outcome === 'success').length,
      failedInteractions: learningData.interactions.filter(i => i.outcome === 'failure').length,
      averageResponseTime: this.calculateAverageResponseTime(learningData.interactions),
      mostCommonIntents: this.getMostCommonIntents(learningData.interactions),
      adaptationCount: learningData.adaptation.length,
      lastAdaptation: learningData.adaptation.length > 0 ? 
        learningData.adaptation[learningData.adaptation.length - 1].timestamp : null,
      patternCount: learningData.patterns.length,
      learningAccuracy: this.calculateLearningAccuracy(learningData)
    };

    return stats;
  }

  /**
   * Reset learning data for a user
   */
  resetLearningData(userId: string): boolean {
    const removed = this.learningData.delete(userId);
    if (removed) {
      this.logger.info('Learning data reset', { userId });
    }
    return removed;
  }

  /**
   * Export learning data
   */
  async exportLearningData(userId: string): Promise<LearningDataExport> {
    const learningData = this.learningData.get(userId);
    if (!learningData) {
      throw new Error(`No learning data found for user ${userId}`);
    }

    return {
      userId,
      exportTime: new Date(),
      version: '1.0.0',
      data: learningData,
      statistics: this.getLearningStatistics(userId)
    };
  }

  /**
   * Import learning data
   */
  async importLearningData(exportData: LearningDataExport): Promise<void> {
    try {
      // Validate import data
      this.validateImportData(exportData);

      // Store learning data
      this.learningData.set(exportData.userId, exportData.data);

      this.logger.info('Learning data imported', {
        userId: exportData.userId,
        version: exportData.version,
        interactionCount: exportData.data.interactions.length
      });

    } catch (error) {
      this.logger.error('Failed to import learning data', error as Error);
      throw error;
    }
  }

  /**
   * Initialize learning data for a new user
   */
  private async initializeLearningData(userId: string): Promise<LearningData> {
    const learningData: LearningData = {
      userId,
      interactions: [],
      patterns: [],
      preferences: await this.createDefaultPreferences(userId),
      performance: this.createDefaultMetrics(),
      adaptation: []
    };

    return learningData;
  }

  /**
   * Generate interaction ID
   */
  private generateInteractionId(): string {
    return `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if self-improvement should be triggered
   */
  private shouldTriggerSelfImprovement(learningData: LearningData): boolean {
    // Trigger after certain number of interactions
    if (learningData.interactions.length % this.config.selfImprovementTriggerInterval === 0) {
      return true;
    }

    // Trigger if performance is below threshold
    if (learningData.performance.accuracy < this.config.selfImprovementPerformanceThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Clean up old data
   */
  private async cleanupOldData(learningData: LearningData): Promise<void> {
    const cutoffTime = new Date(Date.now() - this.config.dataRetentionPeriod);
    
    // Clean up old interactions
    const originalInteractionCount = learningData.interactions.length;
    learningData.interactions = learningData.interactions.filter(
      interaction => interaction.timestamp > cutoffTime
    );

    // Clean up old adaptations
    learningData.adaptation = learningData.adaptation.filter(
      adaptation => adaptation.timestamp > cutoffTime
    );

    // Clean up old patterns (keep only recent ones)
    learningData.patterns = learningData.patterns.filter(
      pattern => pattern.lastObserved > cutoffTime
    );

    const cleanedInteractions = originalInteractionCount - learningData.interactions.length;
    if (cleanedInteractions > 0) {
      this.logger.info('Old learning data cleaned up', {
        cleanedInteractions,
        retentionPeriod: this.config.dataRetentionPeriod
      });
    }
  }

  /**
   * Adapt response length
   */
  private async adaptResponseLength(
    response: string, 
    learningData: LearningData
  ): Promise<string> {
    const avgLength = learningData.preferences.responses.length;
    const currentLength = response.length;

    // If response is significantly different from preferred length
    if (Math.abs(currentLength - avgLength) > avgLength * 0.3) {
      const targetLength = Math.round(avgLength);
      
      if (currentLength > targetLength) {
        // Shorten response
        return response.substring(0, targetLength) + (response.length > targetLength ? '...' : '');
      } else {
        // Expand response (would need content generation)
        return response; // Placeholder for now
      }
    }

    return response;
  }

  /**
   * Adapt response tone
   */
  private async adaptResponseTone(
    response: string,
    learningData: LearningData,
    context: ConversationContext
  ): Promise<string> {
    const preferredTone = learningData.preferences.communication.tone;
    const currentSentiment = context.sentiment?.overall;

    // Adapt tone based on sentiment and preference
    if (currentSentiment && currentSentiment.compound < -0.2) {
      // Negative sentiment - use more empathetic tone
      if (preferredTone === 'formal') {
        return this.addEmpathyToFormal(response);
      } else if (preferredTone === 'casual') {
        return this.addEmpathyToCasual(response);
      }
    }

    return response;
  }

  /**
   * Adapt response format
   */
  private async adaptResponseFormat(
    response: string,
    learningData: LearningData
  ): Promise<string> {
    const preferredFormat = learningData.preferences.responses.format;

    switch (preferredFormat) {
      case 'markdown':
        return this.convertToMarkdown(response);
      case 'html':
        return this.convertToHTML(response);
      case 'structured':
        return this.convertToStructured(response);
      default:
        return response;
    }
  }

  /**
   * Adapt response content
   */
  private async adaptResponseContent(
    response: string,
    learningData: LearningData,
    context: ConversationContext
  ): Promise<string> {
    // Add context-aware content based on learned patterns
    const patterns = learningData.patterns.filter(p => p.type === 'content');
    
    for (const pattern of patterns) {
      if (this.patternMatchesContext(pattern, context)) {
        return this.applyPatternToResponse(response, pattern);
      }
    }

    return response;
  }

  /**
   * Create default preferences
   */
  private async createDefaultPreferences(userId: string): Promise<LearnedPreferences> {
    return {
      communication: {
        tone: 'friendly',
        verbosity: 'balanced',
        emojiUsage: 'moderate',
        humor: 'light'
      },
      ai: {
        model: 'default',
        temperature: 0.7,
        maxTokens: 1000,
        responseStyle: 'balanced',
        toolUsage: 'balanced'
      },
      tools: {
        preferred: [],
        avoided: [],
        usage: {}
      },
      responses: {
        length: 'medium',
        style: 'friendly',
        detail: 'moderate',
        format: 'markdown'
      }
    };
  }

  /**
   * Create default metrics
   */
  private createDefaultMetrics(): PerformanceMetrics {
    return {
      accuracy: 0.5,
      speed: 1.0,
      userSatisfaction: 0.5,
      errorRate: 0.5,
      efficiency: 0.5
    };
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(interactions: InteractionData[]): number {
    const responseTimes = interactions
      .filter(i => i.metrics?.responseTime)
      .map(i => i.metrics!.responseTime);

    if (responseTimes.length === 0) {
      return 0;
    }

    return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  }

  /**
   * Get most common intents
   */
  private getMostCommonIntents(interactions: InteractionData[]): string[] {
    const intentCounts = new Map<string, number>();

    for (const interaction of interactions) {
      if (interaction.context?.intent?.type) {
        const intent = interaction.context.intent.type;
        intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
      }
    }

    return Array.from(intentCounts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([intent]) => intent);
  }

  /**
   * Calculate learning accuracy
   */
  private calculateLearningAccuracy(learningData: LearningData): number {
    if (learningData.interactions.length === 0) {
      return 0;
    }

    const successfulInteractions = learningData.interactions.filter(i => i.outcome === 'success').length;
    return successfulInteractions / learningData.interactions.length;
  }

  /**
   * Get empty statistics
   */
  private getEmptyStats(): LearningStats {
    return {
      totalInteractions: 0,
      successfulInteractions: 0,
      failedInteractions: 0,
      averageResponseTime: 0,
      mostCommonIntents: [],
      adaptationCount: 0,
      lastAdaptation: null,
      patternCount: 0,
      learningAccuracy: 0
    };
  }

  /**
   * Validate import data
   */
  private validateImportData(exportData: LearningDataExport): void {
    if (!exportData.userId) {
      throw new Error('Missing user ID in import data');
    }

    if (!exportData.data) {
      throw new Error('Missing learning data in import');
    }

    if (!exportData.version) {
      throw new Error('Missing version in import data');
    }

    // Validate data structure
    const requiredFields = ['interactions', 'patterns', 'preferences', 'performance', 'adaptation'];
    for (const field of requiredFields) {
      if (!(field in exportData.data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }

  /**
   * Helper methods for tone adaptation
   */
  private addEmpathyToFormal(response: string): string {
    const empathyPhrases = [
      'I understand this may be frustrating.',
      'I appreciate your patience.',
      'Let me help you with this concern.'
    ];
    
    const phrase = empathyPhrases[Math.floor(Math.random() * empathyPhrases.length)];
    return `${phrase} ${response}`;
  }

  private addEmpathyToCasual(response: string): string {
    const empathyPhrases = [
      'I get that this is tough.',
      'Thanks for hanging in there.',
      "Let's figure this out together."
    ];
    
    const phrase = empathyPhrases[Math.floor(Math.random() * empathyPhrases.length)];
    return `${phrase} ${response}`;
  }

  /**
   * Helper methods for format adaptation
   */
  private convertToMarkdown(response: string): string {
    // Simple markdown conversion
    return response.replace(/\n\n/g, '\n\n'); // Ensure proper paragraph breaks
  }

  private convertToHTML(response: string): string {
    // Simple HTML conversion
    return response
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
  }

  private convertToStructured(response: string): string {
    // Convert to structured format (JSON)
    return JSON.stringify({
      type: 'text',
      content: response,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check if pattern matches context
   */
  private patternMatchesContext(pattern: UserPattern, context: ConversationContext): boolean {
    // Simplified pattern matching
    return pattern.confidence > 0.7;
  }

  /**
   * Apply pattern to response
   */
  private applyPatternToResponse(response: string, pattern: UserPattern): string {
    // Apply pattern-based modifications
    return response; // Placeholder for now
  }
}

// ============================================================================
// SUPPORTING CLASSES
// ============================================================================

class PatternRecognizer {
  private config: any;
  private logger: Logger;

  constructor(config: any, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async updatePatterns(learningData: LearningData, interaction: InteractionData): Promise<void> {
    // Pattern recognition implementation
  }

  async predictIntent(learningData: LearningData, context: ConversationContext): Promise<PatternPrediction[]> {
    return [{
      likelihood: 0.5,
      confidence: 0.3,
      timeframe: 'immediate'
    }];
  }

  async predictResponse(learningData: LearningData, context: ConversationContext): Promise<PatternPrediction[]> {
    return [{
      likelihood: 0.4,
      confidence: 0.3,
      timeframe: 'immediate'
    }];
  }
}

class PreferenceAdapter {
  private config: any;
  private logger: Logger;

  constructor(config: any, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async adaptPreferences(learningData: LearningData, interaction: InteractionData): Promise<void> {
    // Preference adaptation implementation
  }

  async predictPreferences(learningData: LearningData, context: ConversationContext): Promise<PatternPrediction[]> {
    return [{
      likelihood: 0.6,
      confidence: 0.4,
      timeframe: 'immediate'
    }];
  }
}

class PerformanceOptimizer {
  private config: any;
  private logger: Logger;

  constructor(config: any, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async updateMetrics(learningData: LearningData, interaction: InteractionData): Promise<void> {
    // Performance metrics update implementation
  }
}

class SelfImprovementEngine {
  private config: any;
  private logger: Logger;

  constructor(config: any, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async analyzeAndImprove(learningData: LearningData): Promise<void> {
    // Self-improvement implementation
  }
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

export interface LearningEngineConfig {
  dataRetentionPeriod: number; // in milliseconds
  selfImprovementTriggerInterval: number;
  selfImprovementPerformanceThreshold: number;
  patterns: any;
  preferences: any;
  performance: any;
  selfImprovement: any;
}

export interface LearningStats {
  totalInteractions: number;
  successfulInteractions: number;
  failedInteractions: number;
  averageResponseTime: number;
  mostCommonIntents: string[];
  adaptationCount: number;
  lastAdaptation: Date | null;
  patternCount: number;
  learningAccuracy: number;
}

export interface LearningDataExport {
  userId: string;
  exportTime: Date;
  version: string;
  data: LearningData;
  statistics: LearningStats;
}