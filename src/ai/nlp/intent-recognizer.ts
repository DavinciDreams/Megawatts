/**
 * Intent Recognizer
 * 
 * This module implements intent recognition using multiple approaches
 * including keyword matching, machine learning, and contextual analysis.
 */

import { 
  Intent, 
  IntentType, 
  SubIntent,
  IntentContext,
  UserIntentHistory,
  ConversationFlow,
  TemporalContext
} from '../../../types/ai';
import { Logger } from '../../../utils/logger';

// ============================================================================
// INTENT RECOGNIZER CLASS
// ============================================================================

export class IntentRecognizer {
  private logger: Logger;
  private intentPatterns: Map<IntentType, IntentPattern[]> = new Map();
  private mlModels: Map<string, MLModel> = new Map();
  private contextAnalyzer: ContextAnalyzer;
  private confidenceThreshold: number;

  constructor(config: IntentRecognizerConfig, logger: Logger) {
    this.logger = logger;
    this.confidenceThreshold = config.confidenceThreshold || 0.7;
    this.contextAnalyzer = new ContextAnalyzer(logger);
    this.initializeIntentPatterns();
    this.loadMLModels(config.mlModels);
  }

  /**
   * Recognize intent from text with context
   */
  async recognizeIntent(
    text: string, 
    context?: IntentContext
  ): Promise<Intent> {
    try {
      const startTime = Date.now();

      // Preprocess text
      const preprocessedText = this.preprocessText(text);
      
      // Try multiple recognition approaches
      const keywordResult = this.recognizeByKeywords(preprocessedText, context);
      const mlResult = this.recognizeByML(preprocessedText, context);
      const patternResult = this.recognizeByPatterns(preprocessedText, context);
      
      // Combine results with confidence scoring
      const combinedResult = this.combineResults([
        keywordResult,
        mlResult,
        patternResult
      ], context);

      this.logger.info('Intent recognition completed', {
        text: preprocessedText,
        intent: combinedResult.type,
        confidence: combinedResult.confidence,
        processingTime: Date.now() - startTime
      });

      return combinedResult;

    } catch (error) {
      this.logger.error('Intent recognition failed', error as Error);
      throw error;
    }
  }

  /**
   * Recognize intent using keyword matching
   */
  private recognizeByKeywords(
    text: string, 
    context?: IntentContext
  ): IntentRecognitionResult {
    const lowerText = text.toLowerCase();
    let bestMatch: IntentRecognitionResult = {
      type: 'unknown' as IntentType,
      confidence: 0,
      approach: 'keyword',
      reasoning: []
    };

    for (const [intentType, patterns] of this.intentPatterns) {
      for (const pattern of patterns) {
        if (this.matchesPattern(lowerText, pattern)) {
          const confidence = this.calculateKeywordConfidence(lowerText, pattern);
          
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              type: intentType,
              confidence,
              approach: 'keyword',
              reasoning: [`Matched keyword pattern: ${pattern.keywords.join(', ')}`],
              matchedPattern: pattern,
              subIntents: this.extractSubIntents(lowerText, pattern)
            };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Recognize intent using machine learning models
   */
  private recognizeByML(
    text: string, 
    context?: IntentContext
  ): IntentRecognitionResult {
    // In a real implementation, this would use trained ML models
    // For now, return a simple heuristic-based result
    const features = this.extractFeatures(text);
    const prediction = this.predictIntent(features, context);
    
    return {
      type: prediction.type,
      confidence: prediction.confidence,
      approach: 'ml',
      reasoning: [`ML prediction based on features: ${features.join(', ')}`],
      subIntents: prediction.subIntents || [],
      matchedPattern: null
    };
  }

  /**
   * Recognize intent using pattern matching
   */
  private recognizeByPatterns(
    text: string, 
    context?: IntentContext
  ): IntentRecognitionResult {
    const patterns = this.getRelevantPatterns(context);
    let bestMatch: IntentRecognitionResult = {
      type: 'unknown' as IntentType,
      confidence: 0,
      approach: 'pattern',
      reasoning: [],
      subIntents: [],
      matchedPattern: null
    };

    for (const pattern of patterns) {
      const match = this.matchPattern(text, pattern);
      if (match && match.confidence > bestMatch.confidence) {
        bestMatch = {
          type: pattern.intentType,
          confidence: match.confidence,
          approach: 'pattern',
          reasoning: [`Matched pattern: ${pattern.name}`],
          subIntents: match.subIntents,
          matchedPattern: pattern
        };
      }
    }

    return bestMatch;
  }

  /**
   * Combine multiple recognition results
   */
  private combineResults(
    results: IntentRecognitionResult[], 
    context?: IntentContext
  ): Intent {
    // Weight the results based on confidence and approach reliability
    const weightedResults = results.map(result => ({
      ...result,
      weight: this.calculateResultWeight(result, context)
    }));

    // Sort by weighted score
    weightedResults.sort((a, b) => b.weight - a.weight);

    const bestResult = weightedResults[0];
    
    // Enhance with context if available
    if (context && bestResult.confidence < this.confidenceThreshold) {
      bestResult.type = this.contextAnalyzer.enhanceWithContext(
        bestResult.type,
        context
      );
    }

    return {
      type: bestResult.type,
      confidence: bestResult.confidence,
      parameters: bestResult.parameters || {},
      subIntents: bestResult.subIntents || [],
      context: {
        previousIntents: context?.previousIntents || [],
        userHistory: context?.userHistory || {
          commonIntents: [],
          intentPatterns: [],
          successRate: {},
          lastUsed: {}
        },
        conversationFlow: context?.conversationFlow || {
          stage: 'opening',
          progress: 0,
          expectedNextIntents: [],
          blockers: []
        },
        temporalContext: context?.temporalContext || {
          timeOfDay: 'morning',
          dayOfWeek: 'monday',
          season: 'spring',
          recentEvents: []
        }
      }
    };
  }

  /**
   * Preprocess text for recognition
   */
  private preprocessText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove leading non-word chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s]/g, ''); // Remove trailing non-word chars
  }

  /**
   * Check if text matches a pattern
   */
  private matchesPattern(text: string, pattern: IntentPattern): boolean {
    for (const keyword of pattern.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        return true;
      }
    }
    
    // Check regex patterns
    if (pattern.regex && new RegExp(pattern.regex).test(text)) {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate confidence for keyword matching
   */
  private calculateKeywordConfidence(text: string, pattern: IntentPattern): number {
    const keywordCount = pattern.keywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    ).length;
    
    // Base confidence on keyword coverage
    let confidence = (keywordCount / pattern.keywords.length) * 0.8;
    
    // Boost confidence for exact matches
    if (keywordCount === pattern.keywords.length) {
      confidence = Math.min(1.0, confidence + 0.2);
    }
    
    return confidence;
  }

  /**
   * Extract features for ML prediction
   */
  private extractFeatures(text: string): string[] {
    const features: string[] = [];
    
    // Text length features
    features.push(`length_${text.length}`);
    features.push(`word_count_${text.split(/\s+/).length}`);
    
    // Question indicators
    if (text.includes('?')) features.push('has_question');
    if (text.includes('how') || text.includes('what') || text.includes('why')) {
      features.push('question_type');
    }
    
    // Command indicators
    if (text.includes('!') || text.includes('/')) features.push('command_like');
    
    // Greeting indicators
    const greetingWords = ['hello', 'hi', 'hey', 'greetings'];
    if (greetingWords.some(word => text.includes(word))) {
      features.push('greeting');
    }
    
    return features;
  }

  /**
   * Predict intent using features
   */
  private predictIntent(
    features: string[], 
    context?: IntentContext
  ): IntentRecognitionResult {
    // Simple heuristic-based prediction
    if (features.includes('greeting')) {
      return {
        type: 'greeting',
        confidence: 0.9,
        approach: 'ml',
        reasoning: ['Detected greeting keywords'],
        subIntents: [],
        matchedPattern: null
      };
    }
    
    if (features.includes('question_type')) {
      return {
        type: 'question',
        confidence: 0.8,
        approach: 'ml',
        reasoning: ['Detected question indicators'],
        subIntents: [],
        matchedPattern: null
      };
    }
    
    if (features.includes('command_like')) {
      return {
        type: 'command',
        confidence: 0.7,
        approach: 'ml',
        reasoning: ['Detected command indicators'],
        subIntents: [],
        matchedPattern: null
      };
    }
    
    return {
      type: 'unknown',
      confidence: 0.3,
      approach: 'ml',
      reasoning: ['No clear indicators detected'],
      subIntents: [],
      matchedPattern: null
    };
  }

  /**
   * Extract sub-intents
   */
  private extractSubIntents(text: string, pattern: IntentPattern): SubIntent[] {
    const subIntents: SubIntent[] = [];
    
    // Extract sub-intents based on pattern configuration
    if (pattern.subIntents) {
      for (const subIntentConfig of pattern.subIntents) {
        if (this.matchesSubIntent(text, subIntentConfig)) {
          subIntents.push({
            type: subIntentConfig.type,
            confidence: 0.8,
            parameters: this.extractSubIntentParameters(text, subIntentConfig)
          });
        }
      }
    }
    
    return subIntents;
  }

  /**
   * Match sub-intent
   */
  private matchesSubIntent(text: string, subIntentConfig: any): boolean {
    // Simple keyword matching for sub-intents
    return subIntentConfig.keywords && 
           subIntentConfig.keywords.some((keyword: string) => 
             text.toLowerCase().includes(keyword.toLowerCase())
           );
  }

  /**
   * Extract sub-intent parameters
   */
  private extractSubIntentParameters(text: string, subIntentConfig: any): Record<string, any> {
    const parameters: Record<string, any> = {};
    
    // Extract parameters based on sub-intent type
    if (subIntentConfig.parameterExtraction) {
      for (const [paramType, extraction] of Object.entries(subIntentConfig.parameterExtraction)) {
        const value = this.extractParameter(text, extraction);
        if (value !== null) {
          parameters[paramType] = value;
        }
      }
    }
    
    return parameters;
  }

  /**
   * Extract parameter using regex or keyword
   */
  private extractParameter(text: string, extraction: any): any {
    if (extraction.regex) {
      const match = text.match(new RegExp(extraction.regex));
      return match ? match[extraction.group || 1] : null;
    }
    
    if (extraction.keywords) {
      for (const keyword of extraction.keywords) {
        if (text.toLowerCase().includes(keyword.toLowerCase())) {
          return keyword;
        }
      }
    }
    
    return null;
  }

  /**
   * Get relevant patterns based on context
   */
  private getRelevantPatterns(context?: IntentContext): IntentPattern[] {
    const allPatterns = Array.from(this.intentPatterns.values()).flat();
    
    if (!context) {
      return allPatterns;
    }
    
    // Filter patterns based on conversation flow
    return allPatterns.filter(pattern => 
      this.isPatternRelevant(pattern, context)
    );
  }

  /**
   * Check if pattern is relevant to current context
   */
  private isPatternRelevant(pattern: IntentPattern, context: IntentContext): boolean {
    // Skip patterns not applicable to current conversation stage
    if (pattern.applicableStages && 
        !pattern.applicableStages.includes(context.conversationFlow.stage)) {
      return false;
    }
    
    // Check time-based patterns
    if (pattern.timeRestrictions) {
      const currentHour = new Date().getHours();
      for (const restriction of pattern.timeRestrictions) {
        if (currentHour >= restriction.start && currentHour <= restriction.end) {
          return false; // Pattern not applicable at this time
        }
      }
    }
    
    return true;
  }

  /**
   * Calculate result weight for combining multiple approaches
   */
  private calculateResultWeight(
    result: IntentRecognitionResult, 
    context?: IntentContext
  ): number {
    let weight = result.confidence;
    
    // Boost weight for higher confidence approaches
    if (result.approach === 'ml') {
      weight += 0.2; // ML approaches get bonus
    }
    
    // Boost weight for context-aware results
    if (context && this.isContextuallyRelevant(result, context)) {
      weight += 0.3;
    }
    
    // Boost weight for results with sub-intents
    if (result.subIntents && result.subIntents.length > 0) {
      weight += 0.1;
    }
    
    return weight;
  }

  /**
   * Check if result is contextually relevant
   */
  private isContextuallyRelevant(
    result: IntentRecognitionResult, 
    context: IntentContext
  ): boolean {
    // Check if intent matches expected next intents
    if (context.conversationFlow.expectedNextIntents.includes(result.type)) {
      return true;
    }
    
    // Check if intent aligns with recent history
    const recentIntents = context.userHistory.commonIntents.slice(-5);
    if (recentIntents.includes(result.type)) {
      return true;
    }
    
    return false;
  }

  /**
   * Initialize intent patterns
   */
  private initializeIntentPatterns(): void {
    // Greeting patterns
    this.intentPatterns.set('greeting', [
      {
        name: 'basic_greeting',
        keywords: ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good evening'],
        confidence: 0.8,
        applicableStages: ['opening'],
        subIntents: [
          {
            type: 'time_greeting',
            keywords: ['morning', 'evening', 'night'],
            parameterExtraction: {
              time_of_day: {
                regex: '\\b(morning|evening|night)\\b',
                keywords: ['morning', 'evening', 'night']
              }
            }
          }
        ]
      }
    ]);

    // Question patterns
    this.intentPatterns.set('question', [
      {
        name: 'information_question',
        keywords: ['what', 'how', 'why', 'when', 'where', 'explain', 'describe'],
        confidence: 0.7,
        applicableStages: ['development'],
        subIntents: [
          {
            type: 'clarification',
            keywords: ['what do you mean', 'can you explain', 'more details']
          }
        ]
      }
    ]);

    // Command patterns
    this.intentPatterns.set('command', [
      {
        name: 'bot_command',
        keywords: ['!', '/', 'help', 'status', 'config', 'list', 'set'],
        confidence: 0.9,
        applicableStages: ['development', 'resolution'],
        subIntents: [
          {
            type: 'parameter_command',
            keywords: ['set', 'configure', 'enable', 'disable'],
            parameterExtraction: {
              command_name: {
                regex: '\\b(set|configure|enable|disable)\\s+(\\w+)',
                keywords: ['set', 'configure', 'enable', 'disable']
              }
            }
          }
        ]
      }
    ]);

    // Moderation patterns
    this.intentPatterns.set('moderation', [
      {
        name: 'moderation_action',
        keywords: ['ban', 'kick', 'mute', 'warn', 'timeout', 'clear'],
        confidence: 0.9,
        applicableStages: ['resolution'],
        subIntents: [
          {
            type: 'target_user',
            keywords: ['user', 'member', 'person'],
            parameterExtraction: {
              user_mention: {
                regex: '@(\\w+)',
                keywords: ['user', 'member']
              }
            }
          },
          {
            type: 'duration',
            keywords: ['for', 'minutes', 'hours', 'days'],
            parameterExtraction: {
              duration: {
                regex: '\\b(for|\\d+)(?:\\s+(minutes?|hours?|days?))',
                keywords: ['for', 'minutes', 'hours', 'days']
              }
            }
          }
        ]
      }
    ]);

    // Self-edit patterns
    this.intentPatterns.set('self_edit', [
      {
        name: 'improvement_request',
        keywords: ['improve', 'optimize', 'learn', 'update', 'enhance', 'fix'],
        confidence: 0.8,
        applicableStages: ['development'],
        subIntents: [
          {
            type: 'target_component',
            keywords: ['code', 'function', 'class', 'module', 'system'],
            parameterExtraction: {
              component_name: {
                regex: '\\b(code|function|class|module|system)\\b\\w+\\b',
                keywords: ['code', 'function', 'class', 'module', 'system']
              }
            }
          }
        ]
      }
    ]);

    // File operation patterns
    this.intentPatterns.set('file_operation', [
      {
        name: 'file_action',
        keywords: ['read', 'write', 'create', 'delete', 'search', 'list', 'open', 'save'],
        confidence: 0.8,
        applicableStages: ['development'],
        subIntents: [
          {
            type: 'file_target',
            keywords: ['file', 'document', 'data', 'config', 'log'],
            parameterExtraction: {
              file_path: {
                regex: '[^\\s]*(/[^\\s]+)',
                keywords: ['file', 'path']
              }
            }
          }
        ]
      }
    ]);
  }

  /**
   * Load ML models
   */
  private loadMLModels(mlModelConfigs: any[]): void {
    for (const config of mlModelConfigs) {
      this.mlModels.set(config.name, {
        name: config.name,
        type: config.type || 'neural',
        version: config.version || '1.0.0',
        loaded: false,
        accuracy: config.accuracy || 0.8
      });
    }
  }
}

// ============================================================================
// SUPPORTING INTERFACES AND CLASSES
// ============================================================================

export interface IntentRecognizerConfig {
  confidenceThreshold: number;
  mlModels: any[];
  patterns: IntentPatternConfig[];
}

export interface IntentPattern {
  name: string;
  keywords: string[];
  regex?: string;
  confidence: number;
  applicableStages: string[];
  subIntents: SubIntentConfig[];
  timeRestrictions?: TimeRestriction[];
}

export interface SubIntentConfig {
  type: string;
  keywords: string[];
  parameterExtraction?: Record<string, any>;
}

export interface TimeRestriction {
  start: number;
  end: number;
}

export interface IntentRecognitionResult {
  type: IntentType;
  confidence: number;
  approach: 'keyword' | 'ml' | 'pattern' | 'hybrid';
  reasoning: string[];
  subIntents: SubIntent[];
  matchedPattern: IntentPattern | null;
}

export interface MLModel {
  name: string;
  type: 'neural' | 'tree' | 'ensemble';
  version: string;
  loaded: boolean;
  accuracy: number;
}

// ============================================================================
// CONTEXT ANALYZER CLASS
// ============================================================================

class ContextAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Enhance intent with context information
   */
  enhanceWithContext(intent: IntentType, context: IntentContext): IntentType {
    // Adjust intent based on conversation flow
    if (context.conversationFlow.stage === 'resolution') {
      // In resolution stage, prefer actions over questions
      switch (intent) {
        case 'question':
          return 'clarification' as IntentType;
        case 'command':
          return 'action_command' as IntentType;
        default:
          return intent;
      }
    }
    
    return intent;
  }

  /**
   * Get context-aware intent suggestions
   */
  getContextualSuggestions(context: IntentContext): string[] {
    const suggestions: string[] = [];
    
    // Based on conversation stage
    switch (context.conversationFlow.stage) {
      case 'opening':
        suggestions.push('greeting', 'introduction');
        break;
      case 'development':
        suggestions.push('clarification', 'follow_up');
        break;
      case 'resolution':
        suggestions.push('summary', 'confirmation', 'next_steps');
        break;
      case 'closing':
        suggestions.push('farewell', 'satisfaction_check');
        break;
    }
    
    // Based on time of day
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      suggestions.push('good_morning');
    } else if (hour >= 12 && hour < 18) {
      suggestions.push('good_afternoon');
    } else if (hour >= 18 || hour < 6) {
      suggestions.push('good_evening');
    }
    
    return suggestions;
  }
}