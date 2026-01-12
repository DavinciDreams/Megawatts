/**
 * Pattern Recognizer - Layer 1 of Self-Learning System
 * 
 * Analyzes interactions for user behavior pattern detection,
 * identifies success metrics, performs failure analysis,
 * and maps context to responses.
 */

import { Logger } from '../utils/logger.js';
import { LearningRepository } from './learning-repository.js';
import { LearningConstraints } from './learning-models.js';
import {
  Pattern,
  PatternRecognitionResult,
  PatternType,
  ConfidenceLevel
} from './learning-models.js';

/**
 * Interaction data structure
 */
interface InteractionData {
  type: string;
  content: string;
  user_id?: string;
  guild_id?: string;
  channel_id?: string;
  timestamp: Date;
  context: Record<string, any>;
  outcome: 'success' | 'failure' | 'neutral';
  metrics?: Record<string, number>;
}

/**
 * Pattern definition
 */
interface PatternDefinition {
  id: string;
  type: PatternType;
  name: string;
  description: string;
  matcher: (interaction: InteractionData) => boolean;
  confidenceCalculator: (interactions: InteractionData[]) => number;
}

/**
 * Pattern Recognizer class
 * Handles pattern recognition from user interactions
 */
export class PatternRecognizer {
  private logger: Logger;
  private repository: LearningRepository;
  private constraints: LearningConstraints;
  private patternDefinitions: Map<string, PatternDefinition> = new Map();
  private activePatterns: Map<string, Pattern> = new Map();
  private interactionBuffer: InteractionData[] = [];

  constructor(
    repository: LearningRepository,
    constraints?: Partial<LearningConstraints>
  ) {
    this.repository = repository;
    this.logger = new Logger('PatternRecognizer');
    
    // Default constraints
    this.constraints = {
      max_patterns_per_type: 1000,
      max_behaviors_per_type: 500,
      max_knowledge_entries: 10000,
      min_confidence_threshold: 0.5,
      min_effectiveness_threshold: 0.6,
      require_approval_for: ['strategy', 'parameter'],
      forbidden_patterns: [],
      safety_boundaries: [
        'no_user_data_exposure',
        'no_unauthorized_modifications',
        'no_privilege_escalation'
      ],
      privacy_protection_enabled: true,
      bias_detection_enabled: true,
      explainability_enabled: true,
      ...constraints
    };

    this.initializePatternDefinitions();
    this.logger.info('Pattern Recognizer initialized');
  }

  /**
   * Initialize built-in pattern definitions
   */
  private initializePatternDefinitions(): void {
    // User behavior patterns
    this.patternDefinitions.set('frequent_command_usage', {
      id: 'frequent_command_usage',
      type: PatternType.USER_BEHAVIOR,
      name: 'Frequent Command Usage',
      description: 'Detects frequently used commands by users',
      matcher: (interaction) => interaction.type === 'command',
      confidenceCalculator: (interactions) => {
        const commands = interactions.filter(i => i.type === 'command');
        const uniqueCommands = new Set(commands.map(c => c.content.split(' ')[0]));
        return Math.min(uniqueCommands.size / 10, 1);
      }
    });

    this.patternDefinitions.set('peak_activity_hours', {
      id: 'peak_activity_hours',
      type: PatternType.USER_BEHAVIOR,
      name: 'Peak Activity Hours',
      description: 'Identifies peak usage hours',
      matcher: () => true,
      confidenceCalculator: (interactions) => {
        const hourCounts = new Map<number, number>();
        for (const interaction of interactions) {
          const hour = interaction.timestamp.getHours();
          hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        }
        const maxCount = Math.max(...hourCounts.values());
        return maxCount / interactions.length;
      }
    });

    // Interaction patterns
    this.patternDefinitions.set('question_response_pattern', {
      id: 'question_response_pattern',
      type: PatternType.INTERACTION,
      name: 'Question-Response Pattern',
      description: 'Detects question-response interaction patterns',
      matcher: (interaction) => interaction.content.includes('?'),
      confidenceCalculator: (interactions) => {
        const questions = interactions.filter(i => i.content.includes('?'));
        return Math.min(questions.length / interactions.length * 2, 1);
      }
    });

    this.patternDefinitions.set('multi_turn_conversation', {
      id: 'multi_turn_conversation',
      type: PatternType.INTERACTION,
      name: 'Multi-Turn Conversation',
      description: 'Identifies multi-turn conversation patterns',
      matcher: (interaction) => interaction.context.conversation_id !== undefined,
      confidenceCalculator: (interactions) => {
        const conversations = new Set(interactions.map(i => i.context.conversation_id).filter(Boolean));
        return Math.min(conversations.size / 5, 1);
      }
    });

    // Success metric patterns
    this.patternDefinitions.set('successful_response_time', {
      id: 'successful_response_time',
      type: PatternType.SUCCESS_METRIC,
      name: 'Successful Response Time',
      description: 'Tracks successful response time patterns',
      matcher: (interaction) => interaction.outcome === 'success' && interaction.metrics?.response_time !== undefined,
      confidenceCalculator: (interactions) => {
        const successful = interactions.filter(i => i.outcome === 'success' && i.metrics?.response_time);
        if (successful.length === 0) return 0;
        const avgTime = successful.reduce((sum, i) => sum + (i.metrics?.response_time || 0), 0) / successful.length;
        return Math.max(0, 1 - avgTime / 1000);
      }
    });

    // Failure analysis patterns
    this.patternDefinitions.set('error_prone_commands', {
      id: 'error_prone_commands',
      type: PatternType.FAILURE_ANALYSIS,
      name: 'Error-Prone Commands',
      description: 'Identifies commands that frequently fail',
      matcher: (interaction) => interaction.outcome === 'failure',
      confidenceCalculator: (interactions) => {
        const failures = interactions.filter(i => i.outcome === 'failure');
        if (failures.length === 0) return 0;
        const commandFailures = new Map<string, number>();
        for (const failure of failures) {
          const command = failure.content.split(' ')[0];
          commandFailures.set(command, (commandFailures.get(command) || 0) + 1);
        }
        const maxFailures = Math.max(...commandFailures.values());
        return Math.min(maxFailures / failures.length, 1);
      }
    });

    // Context mapping patterns
    this.patternDefinitions.set('context_sensitive_responses', {
      id: 'context_sensitive_responses',
      type: PatternType.CONTEXT_MAPPING,
      name: 'Context-Sensitive Responses',
      description: 'Identifies responses that adapt to context',
      matcher: (interaction) => Object.keys(interaction.context).length > 2,
      confidenceCalculator: (interactions) => {
        const contextual = interactions.filter(i => Object.keys(i.context).length > 2);
        return Math.min(contextual.length / interactions.length, 1);
      }
    });

    this.logger.debug(`Initialized ${this.patternDefinitions.size} pattern definitions`);
  }

  /**
   * Analyze interactions for patterns
   * @param interactions - Array of interaction data
   * @returns Pattern recognition result
   */
  async analyze(interactions: InteractionData[]): Promise<PatternRecognitionResult> {
    try {
      this.logger.info(`Analyzing ${interactions.length} interactions for patterns`);

      // Add to buffer
      this.interactionBuffer.push(...interactions);
      
      // Keep buffer size manageable
      if (this.interactionBuffer.length > 10000) {
        this.interactionBuffer = this.interactionBuffer.slice(-5000);
      }

      // Recognize patterns
      const patterns = await this.recognizePatterns(interactions);

      // Generate insights
      const insights = this.generateInsights(patterns, interactions);

      // Store discovered patterns
      await this.storePatterns(patterns);

      this.logger.info(`Pattern recognition completed: ${patterns.length} patterns found`);
      return {
        patterns,
        insights,
        analyzed_at: new Date()
      };
    } catch (error) {
      this.logger.error('Pattern recognition failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Recognize patterns from interactions
   * @param interactions - Array of interaction data
   * @returns Array of recognized patterns
   */
  private async recognizePatterns(interactions: InteractionData[]): Promise<Array<{
    id: string;
    type: PatternType;
    name: string;
    description: string;
    confidence: number;
    frequency: number;
    examples: any[];
  }>> {
    const recognizedPatterns: Array<{
      id: string;
      type: PatternType;
      name: string;
      description: string;
      confidence: number;
      frequency: number;
      examples: any[];
    }> = [];

    for (const [patternId, definition] of this.patternDefinitions.entries()) {
      // Find matching interactions
      const matchingInteractions = interactions.filter(definition.matcher);

      if (matchingInteractions.length === 0) {
        continue;
      }

      // Calculate confidence
      const confidence = definition.confidenceCalculator(interactions);

      // Skip if below threshold
      if (confidence < this.constraints.min_confidence_threshold) {
        continue;
      }

      // Get examples
      const examples = matchingInteractions.slice(0, 5).map(i => ({
        content: i.content,
        timestamp: i.timestamp,
        outcome: i.outcome
      }));

      recognizedPatterns.push({
        id: patternId,
        type: definition.type,
        name: definition.name,
        description: definition.description,
        confidence,
        frequency: matchingInteractions.length,
        examples
      });
    }

    // Sort by confidence
    recognizedPatterns.sort((a, b) => b.confidence - a.confidence);

    return recognizedPatterns;
  }

  /**
   * Generate insights from patterns
   * @param patterns - Recognized patterns
   * @param interactions - Original interactions
   * @returns Array of insights
   */
  private generateInsights(
    patterns: Array<{
      id: string;
      type: PatternType;
      name: string;
      description: string;
      confidence: number;
      frequency: number;
      examples: any[];
    }>,
    interactions: InteractionData[]
  ): Array<{
    type: string;
    description: string;
    action: string;
    priority: number;
  }> {
    const insights: Array<{
      type: string;
      description: string;
      action: string;
      priority: number;
    }> = [];

    // Analyze high-confidence patterns
    const highConfidencePatterns = patterns.filter(p => p.confidence > 0.8);
    for (const pattern of highConfidencePatterns) {
      insights.push({
        type: 'high_confidence_pattern',
        description: `High confidence pattern detected: ${pattern.name}`,
        action: `Consider creating behavior adaptation for ${pattern.name}`,
        priority: Math.round(pattern.confidence * 10)
      });
    }

    // Analyze failure patterns
    const failurePatterns = patterns.filter(p => p.type === PatternType.FAILURE_ANALYSIS);
    for (const pattern of failurePatterns) {
      insights.push({
        type: 'failure_analysis',
        description: `Failure pattern: ${pattern.name}`,
        action: 'Review and address error-prone areas',
        priority: Math.round(pattern.frequency / interactions.length * 100)
      });
    }

    // Analyze success patterns
    const successPatterns = patterns.filter(p => p.type === PatternType.SUCCESS_METRIC);
    for (const pattern of successPatterns) {
      insights.push({
        type: 'success_metric',
        description: `Success pattern: ${pattern.name}`,
        action: 'Reinforce successful strategies',
        priority: Math.round(pattern.confidence * 8)
      });
    }

    // Sort by priority
    insights.sort((a, b) => b.priority - a.priority);

    return insights.slice(0, 10);
  }

  /**
   * Store patterns in repository
   * @param patterns - Patterns to store
   */
  private async storePatterns(patterns: Array<{
    id: string;
    type: PatternType;
    name: string;
    description: string;
    confidence: number;
    frequency: number;
    examples: any[];
  }>): Promise<void> {
    for (const patternData of patterns) {
      try {
        // Check if pattern already exists
        const existing = await this.repository.patterns.findById(patternData.id);

        if (existing) {
          // Update existing pattern
          await this.repository.patterns.update(patternData.id, {
            confidence: patternData.confidence,
            frequency: patternData.frequency,
            last_observed: new Date(),
            examples: patternData.examples,
            updated_at: new Date()
          });
        } else {
          // Create new pattern
          const pattern: Pattern = {
            id: patternData.id,
            type: patternData.type,
            name: patternData.name,
            description: patternData.description,
            confidence: patternData.confidence,
            frequency: patternData.frequency,
            last_observed: new Date(),
            first_observed: new Date(),
            context: {},
            examples: patternData.examples.map(e => ({
              data: e,
              timestamp: e.timestamp,
              outcome: 'neutral'
            })),
            metadata: {},
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
          };

          await this.repository.patterns.create(pattern);
        }

        // Cache in active patterns
        this.activePatterns.set(patternData.id, {
          id: patternData.id,
          type: patternData.type,
          name: patternData.name,
          description: patternData.description,
          confidence: patternData.confidence,
          frequency: patternData.frequency,
          last_observed: new Date(),
          first_observed: new Date(),
          context: {},
          examples: patternData.examples.map(e => ({
            data: e,
            timestamp: e.timestamp,
            outcome: 'neutral'
          })),
          metadata: {},
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        });
      } catch (error) {
        this.logger.warn(`Failed to store pattern ${patternData.id}:`, error);
      }
    }
  }

  /**
   * Get active patterns
   * @returns Array of active patterns
   */
  getActivePatterns(): Pattern[] {
    return Array.from(this.activePatterns.values());
  }

  /**
   * Get patterns by type
   * @param type - Pattern type
   * @returns Array of patterns of the specified type
   */
  getPatternsByType(type: PatternType): Pattern[] {
    return this.getActivePatterns().filter(p => p.type === type);
  }

  /**
   * Get pattern confidence level
   * @param patternId - Pattern ID
   * @returns Confidence level
   */
  getPatternConfidence(patternId: string): ConfidenceLevel {
    const pattern = this.activePatterns.get(patternId);
    if (!pattern) {
      return ConfidenceLevel.LOW;
    }

    if (pattern.confidence >= 0.9) return ConfidenceLevel.VERY_HIGH;
    if (pattern.confidence >= 0.7) return ConfidenceLevel.HIGH;
    if (pattern.confidence >= 0.5) return ConfidenceLevel.MEDIUM;
    return ConfidenceLevel.LOW;
  }

  /**
   * Add custom pattern definition
   * @param definition - Pattern definition
   */
  addPatternDefinition(definition: PatternDefinition): void {
    this.patternDefinitions.set(definition.id, definition);
    this.logger.info(`Added custom pattern definition: ${definition.id}`);
  }

  /**
   * Remove pattern definition
   * @param patternId - Pattern ID to remove
   */
  removePatternDefinition(patternId: string): void {
    this.patternDefinitions.delete(patternId);
    this.logger.info(`Removed pattern definition: ${patternId}`);
  }

  /**
   * Clear interaction buffer
   */
  clearBuffer(): void {
    this.interactionBuffer = [];
    this.logger.debug('Interaction buffer cleared');
  }

  /**
   * Get buffer size
   * @returns Current buffer size
   */
  getBufferSize(): number {
    return this.interactionBuffer.length;
  }

  /**
   * Update constraints
   * @param constraints - New constraints
   */
  updateConstraints(constraints: Partial<LearningConstraints>): void {
    this.constraints = { ...this.constraints, ...constraints };
    this.logger.info('Pattern Recognizer constraints updated', constraints);
  }
}
