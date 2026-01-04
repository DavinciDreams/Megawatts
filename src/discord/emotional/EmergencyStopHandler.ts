/**
 * Emergency Stop Handler
 * 
 * Provides immediate stop functionality for conversational mode.
 * Detects emergency stop phrases and triggers conversation termination.
 */

import type {
  ConversationalDiscordConfig,
  SafetyConfig,
} from '../../types/conversational';
import type { Logger } from '../../types/logger';

/**
 * Default emergency stop phrases
 */
const DEFAULT_EMERGENCY_PHRASES = [
  'stop',
  'emergency',
  'help admin',
  'admin help',
  'shut down',
  'terminate',
  'abort',
  'emergency stop',
  'stop bot',
  'bot stop',
  'disable bot',
  'bot disable',
];

/**
 * Emergency Stop Handler
 * 
 * Detects emergency stop phrases and triggers immediate conversation termination.
 */
export class EmergencyStopHandler {
  private config: SafetyConfig;
  private logger: Logger;
  private emergencyPhrases: Set<string>;
  private activeConversations: Map<string, Date> = new Map();

  constructor(config: ConversationalDiscordConfig, logger: Logger) {
    this.config = config.safety;
    this.logger = logger;
    this.emergencyPhrases = new Set();

    this.initializeEmergencyPhrases();

    this.logger.info('EmergencyStopHandler initialized', {
      enabled: this.config.emergencyStop,
      phraseCount: this.emergencyPhrases.size,
    });
  }

  /**
   * Initialize emergency stop phrases from config
   */
  private initializeEmergencyPhrases(): void {
    const phrases = this.config.emergencyStopPhrases || DEFAULT_EMERGENCY_PHRASES;
    
    for (const phrase of phrases) {
      this.emergencyPhrases.add(phrase.toLowerCase().trim());
    }

    this.logger.debug('Emergency phrases initialized', {
      phrases: Array.from(this.emergencyPhrases),
    });
  }

  /**
   * Check if text contains an emergency stop phrase
   */
  checkEmergencyStop(text: string): boolean {
    if (!this.config.emergencyStop) {
      return false;
    }

    const normalizedText = text.toLowerCase().trim();

    for (const phrase of this.emergencyPhrases) {
      if (normalizedText.includes(phrase)) {
        this.logger.warn('Emergency stop phrase detected', {
          phrase,
          text: text.substring(0, 100),
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Trigger emergency stop for a conversation
   */
  async triggerEmergencyStop(conversationId: string): Promise<void> {
    this.logger.warn('Emergency stop triggered', {
      conversationId,
      timestamp: new Date().toISOString(),
    });

    // Mark conversation as stopped
    this.activeConversations.set(conversationId, new Date());

    // Additional cleanup or notification could be added here
    // For example: notify admins, log to database, etc.

    this.logger.info('Emergency stop completed', {
      conversationId,
      activeConversations: this.activeConversations.size,
    });
  }

  /**
   * Add a new emergency stop phrase
   */
  addEmergencyPhrase(phrase: string): void {
    const normalizedPhrase = phrase.toLowerCase().trim();

    if (normalizedPhrase.length === 0) {
      this.logger.warn('Attempted to add empty emergency phrase');
      return;
    }

    if (this.emergencyPhrases.has(normalizedPhrase)) {
      this.logger.debug('Emergency phrase already exists', { phrase: normalizedPhrase });
      return;
    }

    this.emergencyPhrases.add(normalizedPhrase);
    this.logger.info('Emergency phrase added', { phrase: normalizedPhrase });
  }

  /**
   * Remove an emergency stop phrase
   */
  removeEmergencyPhrase(phrase: string): void {
    const normalizedPhrase = phrase.toLowerCase().trim();

    if (!this.emergencyPhrases.has(normalizedPhrase)) {
      this.logger.debug('Emergency phrase not found', { phrase: normalizedPhrase });
      return;
    }

    // Prevent removing all default phrases if that would leave none
    if (this.emergencyPhrases.size === 1) {
      this.logger.warn('Cannot remove last emergency phrase');
      return;
    }

    this.emergencyPhrases.delete(normalizedPhrase);
    this.logger.info('Emergency phrase removed', { phrase: normalizedPhrase });
  }

  /**
   * Get all emergency stop phrases
   */
  getEmergencyPhrases(): string[] {
    return Array.from(this.emergencyPhrases);
  }

  /**
   * Check if a conversation has been emergency stopped
   */
  isConversationStopped(conversationId: string): boolean {
    return this.activeConversations.has(conversationId);
  }

  /**
   * Get the time when a conversation was emergency stopped
   */
  getConversationStopTime(conversationId: string): Date | undefined {
    return this.activeConversations.get(conversationId);
  }

  /**
   * Clear a conversation from the stopped list
   * (Useful for allowing conversation to restart)
   */
  clearConversationStop(conversationId: string): void {
    this.activeConversations.delete(conversationId);
    this.logger.debug('Conversation stop cleared', { conversationId });
  }

  /**
   * Get count of currently stopped conversations
   */
  getStoppedConversationCount(): number {
    return this.activeConversations.size;
  }

  /**
   * Reset all emergency stop phrases to defaults
   */
  resetEmergencyPhrases(): void {
    this.emergencyPhrases.clear();
    this.initializeEmergencyPhrases();
    this.logger.info('Emergency phrases reset to defaults');
  }

  /**
   * Check if emergency stop is enabled
   */
  isEnabled(): boolean {
    return this.config.emergencyStop;
  }

  /**
   * Enable or disable emergency stop
   */
  setEnabled(enabled: boolean): void {
    this.config.emergencyStop = enabled;
    this.logger.info('Emergency stop ' + (enabled ? 'enabled' : 'disabled'));
  }
}
