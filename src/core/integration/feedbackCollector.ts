import { 
  FeedbackCollector, 
  UserFeedback, 
  FeedbackAnalysis, 
  IntegrationEvent, 
  DiscordEvent 
} from './types';
import { Logger } from '../../utils/logger';

export class BotFeedbackCollector implements FeedbackCollector {
  private logger: Logger;
  private feedback: UserFeedback[] = [];
  private eventHandlers: Array<(event: IntegrationEvent) => void> = [];
  private enabledChannels = new Set<string>();
  private trackedReactions = new Set<string>();
  private minInteractions: number;
  private feedbackWeight: number;

  constructor(
    logger: Logger,
    config: {
      channels: string[];
      reactions: string[];
      minInteractions: number;
      feedbackWeight: number;
    }
  ) {
    this.logger = logger;
    this.enabledChannels = new Set(config.channels);
    this.trackedReactions = new Set(config.reactions);
    this.minInteractions = config.minInteractions;
    this.feedbackWeight = config.feedbackWeight;
  }

  public async collectFeedback(event: DiscordEvent): Promise<UserFeedback[]> {
    const collectedFeedback: UserFeedback[] = [];

    try {
      switch (event.type) {
        case 'messageCreate':
          const messageFeedback = await this.processMessageEvent(event);
          collectedFeedback.push(...messageFeedback);
          break;

        case 'messageReactionAdd':
          const reactionFeedback = await this.processReactionEvent(event);
          collectedFeedback.push(...reactionFeedback);
          break;

        case 'interactionCreate':
          const interactionFeedback = await this.processInteractionEvent(event);
          collectedFeedback.push(...interactionFeedback);
          break;

        default:
          this.logger.debug(`No feedback collection for event type: ${event.type}`);
      }

      // Store collected feedback
      this.feedback.push(...collectedFeedback);

      if (collectedFeedback.length > 0) {
        this.emitEvent('feedback_collected', {
          eventType: event.type,
          feedbackCount: collectedFeedback.length,
          feedback: collectedFeedback
        });
      }

      return collectedFeedback;
    } catch (error: any) {
      this.logger.error('Failed to collect feedback:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'feedback_collection',
        eventType: event.type
      });
      return [];
    }
  }

  public getFeedback(): UserFeedback[] {
    return [...this.feedback];
  }

  public async analyzeFeedback(): Promise<FeedbackAnalysis> {
    try {
      const totalInteractions = this.feedback.length;
      
      if (totalInteractions < this.minInteractions) {
        const insufficientAnalysis: FeedbackAnalysis = {
          timestamp: new Date(),
          totalInteractions,
          sentiment: { positive: 0, negative: 0, neutral: 1 },
          averageRating: 0,
          commonIssues: ['Insufficient feedback data'],
          improvementSuggestions: ['Increase user engagement to gather more feedback'],
          confidence: 0.1
        };

        this.emitEvent('feedback_analyzed', { analysis: insufficientAnalysis });
        return insufficientAnalysis;
      }

      const sentiment = this.calculateSentiment();
      const averageRating = this.calculateAverageRating();
      const commonIssues = this.identifyCommonIssues();
      const improvementSuggestions = this.generateImprovementSuggestions(sentiment, commonIssues);
      const confidence = this.calculateAnalysisConfidence(totalInteractions);

      const analysis: FeedbackAnalysis = {
        timestamp: new Date(),
        totalInteractions,
        sentiment,
        averageRating,
        commonIssues,
        improvementSuggestions,
        confidence
      };

      this.emitEvent('feedback_analyzed', { analysis });
      this.logger.debug('Feedback analysis completed', analysis);

      return analysis;
    } catch (error: any) {
      this.logger.error('Failed to analyze feedback:', error);
      this.emitEvent('error_occurred', {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: 'feedback_analysis'
      });

      // Return default analysis on error
      return {
        timestamp: new Date(),
        totalInteractions: this.feedback.length,
        sentiment: { positive: 0, negative: 0, neutral: 1 },
        averageRating: 0,
        commonIssues: ['Analysis failed'],
        improvementSuggestions: ['Retry analysis later'],
        confidence: 0
      };
    }
  }

  public clearFeedback(): void {
    this.feedback = [];
    this.logger.info('Feedback data cleared');
  }

  public onEvent(handler: (event: IntegrationEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  private async processMessageEvent(event: DiscordEvent): Promise<UserFeedback[]> {
    const feedback: UserFeedback[] = [];
    const message = event.data;

    // Check if message is in a tracked channel
    if (event.channelId && !this.enabledChannels.has(event.channelId)) {
      return feedback;
    }

    // Extract feedback from message content
    const contentFeedback = this.extractContentFeedback(message, event);
    if (contentFeedback) {
      feedback.push(contentFeedback);
    }

    return feedback;
  }

  private async processReactionEvent(event: DiscordEvent): Promise<UserFeedback[]> {
    const feedback: UserFeedback[] = [];
    const reaction = event.data;

    // Check if reaction is tracked
    if (!this.trackedReactions.has(reaction.emoji?.name || '')) {
      return feedback;
    }

    const feedbackItem: UserFeedback = {
      id: `${reaction.messageId}_${reaction.userId}_${reaction.emoji.name}`,
      type: 'reaction',
      value: reaction.emoji.name,
      userId: reaction.userId,
      guildId: reaction.guildId,
      channelId: reaction.channelId,
      messageId: reaction.messageId,
      timestamp: event.timestamp,
      context: {
        reactionType: reaction.emoji.name,
        messageId: reaction.messageId
      }
    };

    feedback.push(feedbackItem);
    return feedback;
  }

  private async processInteractionEvent(event: DiscordEvent): Promise<UserFeedback[]> {
    const feedback: UserFeedback[] = [];
    const interaction = event.data;

    // Check if interaction is in a tracked channel
    if (event.channelId && !this.enabledChannels.has(event.channelId)) {
      return feedback;
    }

    // Extract feedback from interaction
    if (interaction.type === 'MESSAGE_COMPONENT') {
      const componentFeedback = this.extractComponentFeedback(interaction, event);
      if (componentFeedback) {
        feedback.push(componentFeedback);
      }
    }

    return feedback;
  }

  private extractContentFeedback(message: any, event: DiscordEvent): UserFeedback | null {
    const content = message.content?.toLowerCase() || '';
    
    // Look for explicit feedback indicators
    const positiveIndicators = ['good bot', 'great', 'awesome', 'helpful', 'thanks', 'thank you', '👍', '👏'];
    const negativeIndicators = ['bad bot', 'useless', 'wrong', 'unhelpful', '👎', '😞'];
    const ratingPattern = /(\d+)\/\d+/; // e.g., "5/5" or "4/10"

    // Check for ratings
    const ratingMatch = content.match(ratingPattern);
    if (ratingMatch) {
      const rating = parseInt(ratingMatch[1]);
      const maxRating = parseInt(ratingMatch[2]);
      const normalizedRating = (rating / maxRating) * 5; // Normalize to 1-5 scale

      return {
        id: `${message.id}_rating`,
        type: 'rating',
        value: normalizedRating,
        userId: message.author?.id,
        guildId: event.guildId,
        channelId: event.channelId,
        messageId: message.id,
        timestamp: event.timestamp,
        context: {
          originalRating: ratingMatch[0],
          normalizedRating
        }
      };
    }

    // Check for sentiment indicators
    const hasPositive = positiveIndicators.some(indicator => content.includes(indicator));
    const hasNegative = negativeIndicators.some(indicator => content.includes(indicator));

    if (hasPositive || hasNegative) {
      return {
        id: `${message.id}_sentiment`,
        type: 'comment',
        value: hasPositive ? 'positive' : 'negative',
        userId: message.author?.id,
        guildId: event.guildId,
        channelId: event.channelId,
        messageId: message.id,
        timestamp: event.timestamp,
        context: {
          content: message.content,
          sentiment: hasPositive ? 'positive' : 'negative',
          indicators: hasPositive ? positiveIndicators.filter(i => content.includes(i)) : negativeIndicators.filter(i => content.includes(i))
        }
      };
    }

    return null;
  }

  private extractComponentFeedback(interaction: any, event: DiscordEvent): UserFeedback | null {
    const customId = interaction.customId || '';
    
    // Look for feedback-related component IDs
    if (customId.includes('feedback') || customId.includes('rating')) {
      const value = this.extractComponentValue(interaction);
      
      return {
        id: `${interaction.id}_component`,
        type: 'interaction',
        value: value,
        userId: interaction.user?.id,
        guildId: event.guildId,
        channelId: event.channelId,
        timestamp: event.timestamp,
        context: {
          componentType: interaction.componentType,
          customId: interaction.customId,
          values: interaction.values
        }
      };
    }

    return null;
  }

  private extractComponentValue(interaction: any): string {
    if (interaction.values && interaction.values.length > 0) {
      return interaction.values[0];
    }
    
    if (interaction.customId) {
      // Extract value from custom ID if it's encoded
      const parts = interaction.customId.split('_');
      return parts[parts.length - 1] || interaction.customId;
    }
    
    return 'unknown';
  }

  private calculateSentiment(): { positive: number; negative: number; neutral: number } {
    let positive = 0, negative = 0, neutral = 0;

    this.feedback.forEach(item => {
      switch (item.type) {
        case 'reaction':
          const isPositive = ['👍', '👏', '😊', '🎉', '👌'].includes(item.value as string);
          const isNegative = ['👎', '😞', '👎', '❌'].includes(item.value as string);
          
          if (isPositive) positive++;
          else if (isNegative) negative++;
          else neutral++;
          break;

        case 'rating':
          const rating = item.value as number;
          if (rating >= 4) positive++;
          else if (rating <= 2) negative++;
          else neutral++;
          break;

        case 'comment':
        case 'interaction':
          const commentValue = item.value as string;
          if (commentValue === 'positive') positive++;
          else if (commentValue === 'negative') negative++;
          else neutral++;
          break;
      }
    });

    const total = positive + negative + neutral;
    return total > 0 ? {
      positive: positive / total,
      negative: negative / total,
      neutral: neutral / total
    } : { positive: 0, negative: 0, neutral: 1 };
  }

  private calculateAverageRating(): number {
    const ratings = this.feedback
      .filter(item => item.type === 'rating')
      .map(item => item.value as number);

    if (ratings.length === 0) return 0;

    const sum = ratings.reduce((acc, rating) => acc + rating, 0);
    return sum / ratings.length;
  }

  private identifyCommonIssues(): string[] {
    const issues = new Map<string, number>();

    this.feedback.forEach(item => {
      if (item.type === 'comment' && item.value === 'negative') {
        const context = item.context;
        if (context?.content) {
          const content = context.content.toLowerCase();
          
          // Look for common issue patterns
          if (content.includes('slow') || content.includes('lag')) {
            issues.set('performance', (issues.get('performance') || 0) + 1);
          }
          if (content.includes('wrong') || content.includes('incorrect')) {
            issues.set('accuracy', (issues.get('accuracy') || 0) + 1);
          }
          if (content.includes('confusing') || content.includes('unclear')) {
            issues.set('clarity', (issues.get('clarity') || 0) + 1);
          }
          if (content.includes('unhelpful') || content.includes('useless')) {
            issues.set('relevance', (issues.get('relevance') || 0) + 1);
          }
        }
      }
    });

    // Return issues sorted by frequency
    return Array.from(issues.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([issue]) => issue);
  }

  private generateImprovementSuggestions(
    sentiment: { positive: number; negative: number; neutral: number },
    commonIssues: string[]
  ): string[] {
    const suggestions: string[] = [];

    // Sentiment-based suggestions
    if (sentiment.negative > 0.3) {
      suggestions.push('Improve response quality and accuracy');
      suggestions.push('Focus on user satisfaction');
    }

    if (sentiment.neutral > 0.6) {
      suggestions.push('Increase engagement and interactivity');
    }

    // Issue-based suggestions
    commonIssues.forEach(issue => {
      switch (issue) {
        case 'performance':
          suggestions.push('Optimize response times and reduce latency');
          break;
        case 'accuracy':
          suggestions.push('Improve fact-checking and information verification');
          break;
        case 'clarity':
          suggestions.push('Enhance communication clarity and structure');
          break;
        case 'relevance':
          suggestions.push('Better understand user intent and context');
          break;
      }
    });

    // Remove duplicates and return
    return Array.from(new Set(suggestions));
  }

  private calculateAnalysisConfidence(totalInteractions: number): number {
    // Confidence based on sample size and data quality
    const sampleSizeConfidence = Math.min(totalInteractions / this.minInteractions, 1);
    const dataQualityScore = 0.8; // Mock data quality assessment
    
    return (sampleSizeConfidence * 0.7 + dataQualityScore * 0.3) * 0.9; // Scale to 90%
  }

  private emitEvent(type: string, data: Record<string, any>): void {
    const event: IntegrationEvent = {
      type: type as any,
      timestamp: new Date(),
      data,
      source: 'feedback_collector'
    };

    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error: any) {
        this.logger.error('Error in feedback event handler:', error);
      }
    });
  }
}