/**
 * Entity Extractor
 * 
 * This module implements entity extraction from text using multiple approaches
 * including pattern matching, NER models, and context-aware extraction.
 */

import { 
  Entity, 
  EntityType,
  EntityMetadata,
  ConversationContext,
  UserPreferences
} from '../../types/ai';
import { Logger } from '../../utils/logger';

// ============================================================================
// ENTITY EXTRACTOR CLASS
// ============================================================================

export class EntityExtractor {
  private logger: Logger;
  private patterns: Map<EntityType, EntityPattern[]> = new Map();
  private nerModels: Map<string, NERModel> = new Map();
  private contextAnalyzer: ContextAnalyzer;
  private config: EntityExtractorConfig;

  constructor(config: EntityExtractorConfig, logger: Logger) {
    this.logger = logger;
    this.contextAnalyzer = new ContextAnalyzer(logger);
    this.config = config;
    this.initializePatterns();
    this.loadNERModels(config.nerModels);
  }

  /**
   * Extract entities from text
   */
  async extractEntities(
    text: string, 
    context?: ConversationContext
  ): Promise<Entity[]> {
    try {
      const startTime = Date.now();

      // Preprocess text
      const preprocessedText = this.preprocessText(text);
      
      // Extract using multiple approaches
      const patternEntities = await this.extractByPatterns(preprocessedText, context);
      const nerEntities = await this.extractByNER(preprocessedText, context);
      const contextualEntities = await this.extractContextual(preprocessedText, context);
      
      // Merge and deduplicate entities
      const allEntities = [...patternEntities, ...nerEntities, ...contextualEntities];
      const deduplicatedEntities = this.deduplicateEntities(allEntities);
      
      // Enhance entities with metadata
      const enhancedEntities = await this.enhanceEntities(deduplicatedEntities, context);
      
      this.logger.info('Entity extraction completed', {
        textLength: text.length,
        entityCount: enhancedEntities.length,
        processingTime: Date.now() - startTime
      });

      return enhancedEntities;

    } catch (error) {
      this.logger.error('Entity extraction failed', error as Error);
      throw error;
    }
  }

  /**
   * Extract entities using pattern matching
   */
  private async extractByPatterns(
    text: string, 
    context?: ConversationContext
  ): Promise<Entity[]> {
    const entities: Entity[] = [];
    
    for (const [entityType, patterns] of this.patterns) {
      for (const pattern of patterns) {
        const matches = this.extractWithPattern(text, pattern);
        for (const match of matches) {
          entities.push({
            id: this.generateEntityId(entityType, match.value),
            type: entityType,
            value: match.value,
            confidence: this.calculatePatternConfidence(match, pattern),
            startIndex: match.startIndex,
            endIndex: match.endIndex,
            metadata: {
              canonical: this.canonicalizeEntity(match.value, entityType),
              attributes: {
                source: 'pattern_match',
                pattern_name: pattern.name,
                pattern_type: pattern.type
              },
              relationships: this.extractRelationships(match, text, entities)
            }
          });
        }
      }
    }
    
    return entities;
  }

  /**
   * Extract entities using NER models
   */
  private async extractByNER(
    text: string, 
    context?: ConversationContext
  ): Promise<Entity[]> {
    const entities: Entity[] = [];
    
    // In a real implementation, this would use trained NER models
    // For now, use rule-based NER
    const nerEntities = this.extractWithRuleBasedNER(text);
    
    for (const entity of nerEntities) {
      entities.push({
        id: this.generateEntityId(entity.type, entity.value),
        type: entity.type,
        value: entity.value,
        confidence: entity.confidence,
        startIndex: entity.startIndex,
        endIndex: entity.endIndex,
        metadata: {
          canonical: this.canonicalizeEntity(entity.value, entity.type),
          attributes: {
            source: 'ner_model',
            model: 'rule_based'
          },
          relationships: []
        }
      });
    }
    
    return entities;
  }

  /**
   * Extract contextual entities
   */
  private async extractContextual(
    text: string, 
    context?: ConversationContext
  ): Promise<Entity[]> {
    const entities: Entity[] = [];
    
    // Extract entities based on conversation context
    if (context?.entities) {
      for (const existingEntity of context.entities) {
        // Look for mentions of existing entities
        const mentions = this.findEntityMentions(text, existingEntity.value);
        for (const mention of mentions) {
          entities.push({
            id: this.generateEntityId(existingEntity.type, mention.value),
            type: existingEntity.type,
            value: mention.value,
            confidence: this.calculateContextualConfidence(mention, existingEntity),
            startIndex: mention.startIndex,
            endIndex: mention.endIndex,
            metadata: {
              canonical: existingEntity.metadata.canonical,
              attributes: {
                source: 'contextual_reference',
                referenced_entity_id: existingEntity.id,
                confidence_boost: 0.2
              },
              relationships: [{
                type: 'refers_to',
                target_entity_id: existingEntity.id
              }]
            }
          });
        }
      }
    }
    
    return entities;
  }

  /**
   * Extract entities using a specific pattern
   */
  private extractWithPattern(text: string, pattern: EntityPattern): EntityMatch[] {
    const matches: EntityMatch[] = [];
    
    switch (pattern.type) {
      case 'regex':
        const regex = new RegExp(pattern.pattern, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          matches.push({
            value: match[0],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            confidence: 0.9
          });
        }
        break;
        
      case 'keywords':
        for (const keyword of pattern.keywords) {
          const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
          let match;
          while ((match = regex.exec(text)) !== null) {
            matches.push({
              value: keyword,
              startIndex: match.index,
              endIndex: match.index + keyword.length,
              confidence: 0.8
            });
          }
        }
        break;
        
      case 'fuzzy':
        // Fuzzy matching implementation would go here
        break;
        
      default:
        // No matching
        break;
    }
    
    return matches;
  }

  /**
   * Rule-based NER extraction
   */
  private extractWithRuleBasedNER(text: string): RuleBasedEntity[] {
    const entities: RuleBasedEntity[] = [];
    const lowerText = text.toLowerCase();
    
    // Person names (simplified)
    const personNames = ['john', 'jane', 'michael', 'sarah', 'david', 'lisa'];
    for (const name of personNames) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      let match;
      while ((match = regex.exec(lowerText)) !== null) {
        entities.push({
          type: 'person',
          value: name,
          startIndex: match.index,
          endIndex: match.index + name.length,
          confidence: 0.7
        });
      }
    }
    
    // Organizations
    const organizations = ['google', 'microsoft', 'apple', 'amazon', 'facebook', 'twitter'];
    for (const org of organizations) {
      const regex = new RegExp(`\\b${org}\\b`, 'gi');
      let match;
      while ((match = regex.exec(lowerText)) !== null) {
        entities.push({
          type: 'organization',
          value: org,
          startIndex: match.index,
          endIndex: match.index + org.length,
          confidence: 0.8
        });
      }
    }
    
    // Locations
    const locations = ['new york', 'london', 'paris', 'tokyo', 'sydney', 'berlin'];
    for (const location of locations) {
      const regex = new RegExp(`\\b${location}\\b`, 'gi');
      let match;
      while ((match = regex.exec(lowerText)) !== null) {
        entities.push({
          type: 'place',
          value: location,
          startIndex: match.index,
          endIndex: match.index + location.length,
          confidence: 0.7
        });
      }
    }
    
    // Dates and times
    const dateRegex = /\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/g;
    let match;
    while ((match = dateRegex.exec(text)) !== null) {
      entities.push({
        type: 'date',
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 0.9
      });
    }
    
    // URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      entities.push({
        type: 'url',
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 0.9
      });
    }
    
    return entities;
  }

  /**
   * Find mentions of entities in text
   */
  private findEntityMentions(text: string, entityValue: string): EntityMention[] {
    const mentions: EntityMention[] = [];
    const lowerText = text.toLowerCase();
    const lowerEntity = entityValue.toLowerCase();
    
    // Find exact matches
    let startIndex = 0;
    while (true) {
      const index = lowerText.indexOf(lowerEntity, startIndex);
      if (index === -1) break;
      
      // Check if it's a word boundary
      const endIndex = index + entityValue.length;
      const prevChar = index > 0 ? lowerText[index - 1] : ' ';
      const nextChar = endIndex < lowerText.length ? lowerText[endIndex] : ' ';
      
      if (/\W/.test(prevChar) && /\W/.test(nextChar)) {
        mentions.push({
          value: entityValue,
          startIndex: index,
          endIndex: endIndex,
          confidence: 0.9
        });
        
        startIndex = endIndex + 1;
      }
    }
    
    return mentions;
  }

  /**
   * Enhance entities with additional metadata
   */
  private async enhanceEntities(
    entities: Entity[], 
    context?: ConversationContext
  ): Promise<Entity[]> {
    for (const entity of entities) {
      // Add confidence based on context
      if (context?.entities) {
        const contextualSimilarity = this.calculateContextualSimilarity(entity, context.entities);
        entity.confidence = Math.min(1.0, entity.confidence + contextualSimilarity * 0.2);
      }
      
      // Add canonical form if not present
      if (!entity.metadata.canonical) {
        entity.metadata.canonical = this.canonicalizeEntity(entity.value, entity.type);
      }
      
      // Add additional attributes
      entity.metadata.attributes = {
        ...entity.metadata.attributes,
        extracted_at: new Date(),
        context_relevant: context ? true : false
      };
    }
    
    return entities;
  }

  /**
   * Deduplicate entities
   */
  private deduplicateEntities(entities: Entity[]): Entity[] {
    const seen = new Map<string, Entity>();
    const deduplicated: Entity[] = [];
    
    for (const entity of entities) {
      const key = `${entity.type}:${entity.value.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, entity);
        deduplicated.push(entity);
      }
    }
    
    return deduplicated;
  }

  /**
   * Calculate pattern matching confidence
   */
  private calculatePatternConfidence(match: EntityMatch, pattern: EntityPattern): number {
    let confidence = pattern.confidence || 0.7;
    
    // Boost confidence based on match quality
    if (match.value.length > pattern.keywords[0].length) {
      confidence += 0.1; // Exact match bonus
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Calculate contextual confidence
   */
  private calculateContextualSimilarity(entity: Entity, contextEntities: Entity[]): number {
    const sameTypeEntities = contextEntities.filter(e => e.type === entity.type);
    
    if (sameTypeEntities.length === 0) return 0;
    
    // Calculate similarity based on value overlap and context
    let maxSimilarity = 0;
    for (const contextEntity of sameTypeEntities) {
      const similarity = this.calculateEntitySimilarity(entity, contextEntity);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
    
    return maxSimilarity;
  }

  /**
   * Calculate entity similarity
   */
  private calculateEntitySimilarity(entity1: Entity, entity2: Entity): number {
    const value1 = entity1.value.toLowerCase();
    const value2 = entity2.value.toLowerCase();
    
    // Exact match
    if (value1 === value2) return 1.0;
    
    // Partial match
    const longer = Math.max(value1.length, value2.length);
    const shorter = Math.min(value1.length, value2.length);
    const commonPrefix = this.getLongestCommonPrefix(value1, value2);
    const commonSuffix = this.getLongestCommonSuffix(value1, value2);
    
    const similarity = (commonPrefix.length + commonSuffix.length) / longer;
    return similarity;
  }

  /**
   * Get longest common prefix
   */
  private getLongestCommonPrefix(str1: string, str2: string): number {
    let length = 0;
    const minLength = Math.min(str1.length, str2.length);
    
    while (length < minLength && str1[length] === str2[length]) {
      length++;
    }
    
    return length;
  }

  /**
   * Get longest common suffix
   */
  private getLongestCommonSuffix(str1: string, str2: string): number {
    let length = 0;
    const minLength = Math.min(str1.length, str2.length);
    
    while (length < minLength && 
           str1[str1.length - 1 - length] === str2[str2.length - 1 - length]) {
      length++;
    }
    
    return length;
  }

  /**
   * Canonicalize entity value
   */
  private canonicalizeEntity(value: string, type: EntityType): string {
    switch (type) {
      case 'person':
        return value.toLowerCase().replace(/\s+/g, ' ').trim();
      case 'organization':
        return value.toLowerCase().replace(/\s+/g, ' ').trim();
      case 'place':
        return value.toLowerCase().replace(/\s+/g, ' ').trim();
      case 'url':
        return value.toLowerCase().trim();
      case 'date':
        return value.toLowerCase().trim();
      default:
        return value.toLowerCase().trim();
    }
  }

  /**
   * Extract relationships between entities
   */
  private extractRelationships(
    match: EntityMatch, 
    text: string, 
    entities: Entity[]
  ): EntityRelationship[] {
    const relationships: EntityRelationship[] = [];
    
    // Simple relationship extraction based on proximity
    for (const entity of entities) {
      if (entity.id !== match.value && this.areEntitiesNear(match, entity, text)) {
        relationships.push({
          type: 'near',
          target_entity_id: entity.id,
          confidence: 0.5
        });
      }
    }
    
    return relationships;
  }

  /**
   * Check if entities are near each other in text
   */
  private areEntitiesNear(match1: EntityMatch, entity2: Entity, text: string): boolean {
    const distance = Math.abs(match1.endIndex - entity2.startIndex);
    return distance < 50; // Within 50 characters
  }

  /**
   * Generate unique entity ID
   */
  private generateEntityId(type: EntityType, value: string): string {
    return `${type}_${value.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`;
  }

  /**
   * Preprocess text for extraction
   */
  private preprocessText(text: string): string {
    return text
      .normalize()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Initialize entity patterns
   */
  private initializePatterns(): void {
    // Person patterns
    this.patterns.set('person', [
      {
        name: 'person_names',
        type: 'keywords',
        keywords: ['john', 'jane', 'michael', 'sarah', 'david', 'lisa'],
        confidence: 0.8
      },
      {
        name: 'person_titles',
        type: 'keywords',
        keywords: ['mr', 'mrs', 'dr', 'prof', 'sir'],
        confidence: 0.7
      },
      {
        name: 'person_pronouns',
        type: 'keywords',
        keywords: ['he', 'she', 'they', 'them'],
        confidence: 0.6
      }
    ]);

    // Organization patterns
    this.patterns.set('organization', [
      {
        name: 'tech_companies',
        type: 'keywords',
        keywords: ['google', 'microsoft', 'apple', 'amazon', 'facebook', 'twitter'],
        confidence: 0.8
      },
      {
        name: 'generic_orgs',
        type: 'regex',
        pattern: '\\b[A-Z][a-z]+\\s+(?:inc|llc|corp|company)\\b',
        confidence: 0.9
      }
    ]);

    // Location patterns
    this.patterns.set('place', [
      {
        name: 'cities',
        type: 'keywords',
        keywords: ['new york', 'london', 'paris', 'tokyo', 'sydney'],
        confidence: 0.8
      },
      {
        name: 'countries',
        type: 'keywords',
        keywords: ['usa', 'uk', 'canada', 'australia', 'france', 'germany'],
        confidence: 0.8
      }
    ]);

    // Date patterns
    this.patterns.set('date', [
      {
        name: 'absolute_dates',
        type: 'regex',
        pattern: '\\b\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}\\b',
        confidence: 0.9
      },
      {
        name: 'relative_dates',
        type: 'keywords',
        keywords: ['yesterday', 'today', 'tomorrow', 'next week', 'last month'],
        confidence: 0.7
      }
    ]);

    // URL patterns
    this.patterns.set('url', [
      {
        name: 'web_urls',
        type: 'regex',
        pattern: 'https?:\\/\\/[^\s]+',
        confidence: 0.9
      }
    ]);
  }

  /**
   * Load NER models
   */
  private loadNERModels(nerModelConfigs: any[]): void {
    for (const config of nerModelConfigs) {
      this.nerModels.set(config.name, {
        name: config.name,
        type: config.type || 'rule_based',
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

export interface EntityExtractorConfig {
  patterns: EntityPatternConfig[];
  nerModels: any[];
  confidenceThreshold: number;
  contextualExtraction: boolean;
}

export interface EntityPattern {
  name: string;
  type: 'regex' | 'keywords' | 'fuzzy';
  pattern: string;
  keywords?: string[];
  regex?: string;
  confidence: number;
  subIntents?: any[];
  timeRestrictions?: TimeRestriction[];
}

export interface EntityPatternConfig {
  entityType: EntityType;
  patterns: EntityPattern[];
}

export interface EntityMatch {
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface RuleBasedEntity {
  type: EntityType;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface NERModel {
  name: string;
  type: 'neural' | 'rule_based' | 'hybrid';
  version: string;
  loaded: boolean;
  accuracy: number;
}

export interface EntityMention {
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface TimeRestriction {
  start: number;
  end: number;
}

// ============================================================================
// CONTEXT ANALYZER CLASS
// ============================================================================

class ContextAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  enhanceWithContext(intent: IntentType, context: IntentContext): IntentType {
    // Simple context enhancement logic
    if (context.conversationFlow.stage === 'resolution') {
      // In resolution stage, prefer action-oriented intents
      switch (intent) {
        case 'question':
          return 'clarification';
        case 'command':
          return 'action_command';
        default:
          return intent;
      }
    }
    
    return intent;
  }

  getContextualSuggestions(context: IntentContext): string[] {
    const suggestions: string[] = [];
    
    // Based on conversation flow
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
    
    return suggestions;
  }
}