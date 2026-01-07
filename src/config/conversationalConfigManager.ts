import { Logger } from '../utils/logger';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';
import chokidar from 'chokidar';
import { ConversationalDiscordConfig } from './advancedConfig';

/**
 * Conversational Discord Configuration Manager
 * Manages loading, validation, and hot-reloading of conversational Discord settings
 */
export class ConversationalConfigManager {
  private config: ConversationalDiscordConfig;
  private logger: Logger;
  private configPath: string;
  private watchers: Map<string, (() => void)[]> = new Map();

  constructor(configPath?: string) {
    this.logger = new Logger('ConversationalConfigManager');
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.loadConfiguration();
    this.setupFileWatching();
  }

  private getDefaultConfigPath(): string {
    const basePath = process.env.CONFIG_PATH || process.cwd();
    return resolve(basePath, 'conversational-discord.config.json');
  }

  /**
   * Load configuration from file and environment variables
   */
  private loadConfiguration(): ConversationalDiscordConfig {
    const baseConfig: ConversationalDiscordConfig = this.getDefaultConfig();
    
    // Load from file if exists
    const fileConfig = this.loadFromFile();
    if (fileConfig) {
      Object.assign(baseConfig, fileConfig);
    }
    
    // Override with environment variables
    const envOverrides = this.loadFromEnvironment();
    Object.assign(baseConfig, envOverrides);
    
    // Validate configuration
    this.validateConfiguration(baseConfig);
    
    return baseConfig;
  }

  /**
   * Load configuration from file
   */
  private loadFromFile(): Partial<ConversationalDiscordConfig> | null {
    if (existsSync(this.configPath)) {
      try {
        const fileContent = readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(fileContent);
        this.logger.info(`Conversational Discord configuration loaded from file: ${this.configPath}`);
        return config;
      } catch (error) {
        this.logger.error(`Failed to load conversational Discord configuration from file: ${this.configPath}`, error);
        return null;
      }
    }
    return null;
  }

  /**
   * Load configuration overrides from environment variables
   */
  private loadFromEnvironment(): Partial<ConversationalDiscordConfig> {
    const overrides: Partial<ConversationalDiscordConfig> = {};

    if (process.env.DISCORD_CONVERSATIONAL_ENABLED !== undefined) {
      overrides.enabled = process.env.DISCORD_CONVERSATIONAL_ENABLED === 'true';
    }
    if (process.env.DISCORD_CONVERSATIONAL_MODE) {
      overrides.mode = process.env.DISCORD_CONVERSATIONAL_MODE as any;
    }
    if (process.env.DISCORD_CONVERSATIONAL_RESPONSE_CHANNEL) {
      overrides.responseChannel = process.env.DISCORD_CONVERSATIONAL_RESPONSE_CHANNEL;
    }
    if (process.env.DISCORD_CONVERSATIONAL_RESPONSE_CHANNEL_TYPE) {
      overrides.responseChannelType = process.env.DISCORD_CONVERSATIONAL_RESPONSE_CHANNEL_TYPE as any;
    }
    if (process.env.DISCORD_CONVERSATIONAL_CONTEXT_WINDOW) {
      overrides.contextWindow = parseInt(process.env.DISCORD_CONVERSATIONAL_CONTEXT_WINDOW);
    }
    if (process.env.DISCORD_CONVERSATIONAL_MAX_TOKENS) {
      overrides.maxTokens = parseInt(process.env.DISCORD_CONVERSATIONAL_MAX_TOKENS);
    }
    if (process.env.DISCORD_CONVERSATIONAL_TEMPERATURE) {
      overrides.temperature = parseFloat(process.env.DISCORD_CONVERSATIONAL_TEMPERATURE);
    }
    if (process.env.DISCORD_CONVERSATIONAL_TONE) {
      overrides.tone = process.env.DISCORD_CONVERSATIONAL_TONE as any;
    }
    if (process.env.DISCORD_CONVERSATIONAL_FORMALITY) {
      overrides.formality = process.env.DISCORD_CONVERSATIONAL_FORMALITY as any;
    }
    if (process.env.DISCORD_CONVERSATIONAL_VERBOSITY) {
      overrides.verbosity = process.env.DISCORD_CONVERSATIONAL_VERBOSITY as any;
    }
    if (process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE !== undefined) {
      overrides.emotionalIntelligence = {
        ...overrides.emotionalIntelligence,
        enabled: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true',
        sentimentAnalysis: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true',
        emotionDetection: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true',
        empatheticResponses: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true',
        conflictDeescalation: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true',
        moodAdaptation: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true',
      };
    }
    if (process.env.DISCORD_CONVERSATIONAL_EMOTION_INFLUENCE) {
      overrides.emotionalIntelligence = {
        ...overrides.emotionalIntelligence,
        emotionInfluence: parseFloat(process.env.DISCORD_CONVERSATIONAL_EMOTION_INFLUENCE),
      };
    }
    if (process.env.DISCORD_CONVERSATIONAL_MEMORY_RETENTION_DAYS) {
      overrides.memory = {
        ...overrides.memory,
        mediumTermRetentionDays: parseInt(process.env.DISCORD_CONVERSATIONAL_MEMORY_RETENTION_DAYS),
      };
    }
    if (process.env.DISCORD_CONVERSATIONAL_MULTILINGUAL_ENABLED !== undefined) {
      overrides.multilingual = {
        ...overrides.multilingual,
        enabled: process.env.DISCORD_CONVERSATIONAL_MULTILINGUAL_ENABLED === 'true',
      };
    }
    if (process.env.DISCORD_CONVERSATIONAL_DEFAULT_LANGUAGE) {
      overrides.multilingual = {
        ...overrides.multilingual,
        defaultLanguage: process.env.DISCORD_CONVERSATIONAL_DEFAULT_LANGUAGE,
      };
    }
    if (process.env.DISCORD_CONVERSATIONAL_CONTENT_FILTERING !== undefined) {
      overrides.safety = {
        ...overrides.safety,
        contentFiltering: process.env.DISCORD_CONVERSATIONAL_CONTENT_FILTERING === 'true',
      };
    }
    if (process.env.DISCORD_CONVERSATIONAL_MODERATION_LEVEL) {
      overrides.safety = {
        ...overrides.safety,
        moderationLevel: process.env.DISCORD_CONVERSATIONAL_MODERATION_LEVEL as any,
      };
    }
    // Handle emergency stop configuration
    if (process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED !== undefined) {
      overrides.safety = {
        ...overrides.safety,
        emergencyStop: process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED === 'true',
      };
    }
    if (process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_PHRASES) {
      overrides.safety = {
        ...overrides.safety,
        emergencyStopPhrases: process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_PHRASES.split(','),
      };
    }
    // Ensure default emergency stop phrases are included when emergency stop is enabled
    if (overrides.safety?.emergencyStop && !overrides.safety.emergencyStopPhrases) {
      overrides.safety.emergencyStopPhrases = ['stop', 'emergency stop', 'halt', 'abort'];
    }

    return overrides;
  }

  /**
   * Load system prompt from file
   * Reads the content from docs/system-prompt.md and returns it as a string.
   * Falls back to the default hardcoded prompt if the file doesn't exist or can't be read.
   */
  private loadSystemPrompt(): string {
    const defaultPrompt = 'You are Megawatts, a helpful and intelligent Discord assistant. You are friendly, professional, and always aim to provide accurate and useful information.';
    
    try {
      const systemPromptPath = resolve(process.cwd(), 'docs', 'system-prompt.md');
      
      if (!existsSync(systemPromptPath)) {
        this.logger.warn(`System prompt file not found at ${systemPromptPath}, using default prompt`);
        return defaultPrompt;
      }
      
      const content = readFileSync(systemPromptPath, 'utf8');
      return content;
    } catch (error) {
      this.logger.error('Failed to load system prompt from file, using default prompt', error);
      return defaultPrompt;
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): ConversationalDiscordConfig {
    return {
      enabled: false,
      mode: 'conversational',
      responseChannel: 'bot-responses',
      responseChannelType: 'same',
      contextWindow: 50,
      maxTokens: 2000,
      temperature: 0.7,
      personality: {
        id: 'megawatts-default',
        name: 'Megawatts',
        description: 'A helpful and intelligent Discord assistant',
        systemPrompt: this.loadSystemPrompt(),
        defaultTone: 'friendly',
        defaultFormality: 'casual',
        defaultVerbosity: 'balanced',
      },
      tone: 'friendly',
      formality: 'casual',
      verbosity: 'balanced',
      memory: {
        shortTermEnabled: true,
        shortTermTTL: 3600,
        mediumTermEnabled: true,
        mediumTermRetentionDays: 7,
        longTermEnabled: false,
        longTermRetentionDays: 30,
        vectorSearchEnabled: false,
        vectorSimilarityThreshold: 0.7,
      },
      emotionalIntelligence: {
        enabled: true,
        sentimentAnalysis: true,
        emotionDetection: true,
        empatheticResponses: true,
        conflictDeescalation: true,
        moodAdaptation: true,
        emotionInfluence: 0.7,
      },
      multilingual: {
        enabled: false,
        defaultLanguage: 'en',
        autoDetectLanguage: false,
        supportedLanguages: ['en'],
      },
      safety: {
        enabled: true,
        contentFiltering: true,
        moderationLevel: 'moderate',
        blockHarmfulContent: true,
        blockPersonalInfo: true,
        emergencyStop: true,
        emergencyStopPhrases: ['stop', 'emergency stop', 'halt', 'abort'],
        maxResponseLength: 2000,
      },
      rateLimiting: {
        enabled: true,
        messagesPerMinute: 10,
        messagesPerHour: 100,
        messagesPerDay: 500,
        perUserLimit: true,
        perChannelLimit: true,
        cooldownPeriod: 5,
      },
      features: {
        crossChannelAwareness: true,
        temporalContext: true,
        userLearning: false,
        adaptiveResponses: true,
        toolCalling: true,
        codeExecution: false,
        selfEditing: false,
      },
    };
  }

  /**
   * Validate configuration values
   */
  private validateConfiguration(config: ConversationalDiscordConfig): void {
    // Validate mode
    const validModes = ['conversational', 'command', 'hybrid'];
    if (!validModes.includes(config.mode)) {
      throw new Error(`Invalid mode: ${config.mode}. Must be one of: ${validModes.join(', ')}`);
    }

    // Validate context window
    if (config.contextWindow < 1 || config.contextWindow > 100) {
      throw new Error('Context window must be between 1 and 100');
    }

    // Validate max tokens
    if (config.maxTokens < 100 || config.maxTokens > 10000) {
      throw new Error('Max tokens must be between 100 and 10000');
    }

    // Validate temperature
    if (config.temperature < 0 || config.temperature > 2) {
      throw new Error('Temperature must be between 0 and 2');
    }

    // Validate tone
    const validTones = ['friendly', 'professional', 'casual', 'playful'];
    if (!validTones.includes(config.tone)) {
      throw new Error(`Invalid tone: ${config.tone}. Must be one of: ${validTones.join(', ')}`);
    }

    // Validate formality
    const validFormalities = ['formal', 'casual', 'playful', 'adaptive'];
    if (!validFormalities.includes(config.formality)) {
      throw new Error(`Invalid formality: ${config.formality}. Must be one of: ${validFormalities.join(', ')}`);
    }

    // Validate verbosity
    const validVerbosities = ['concise', 'normal', 'detailed', 'balanced', 'adaptive'];
    if (!validVerbosities.includes(config.verbosity)) {
      throw new Error(`Invalid verbosity: ${config.verbosity}. Must be one of: ${validVerbosities.join(', ')}`);
    }

    // Validate emotion influence
    if (config.emotionalIntelligence.emotionInfluence < 0 || config.emotionalIntelligence.emotionInfluence > 1) {
      throw new Error('Emotion influence must be between 0 and 1');
    }

    // Validate retention days
    if (config.memory.mediumTermRetentionDays < 1 || config.memory.mediumTermRetentionDays > 365) {
      throw new Error('Medium term retention days must be between 1 and 365');
    }

    // Validate rate limiting
    if (config.rateLimiting.messagesPerMinute < 1 || config.rateLimiting.messagesPerMinute > 100) {
      throw new Error('Messages per minute must be between 1 and 100');
    }
    if (config.rateLimiting.messagesPerHour < 1 || config.rateLimiting.messagesPerHour > 1000) {
      throw new Error('Messages per hour must be between 1 and 1000');
    }
    if (config.rateLimiting.messagesPerDay < 10 || config.rateLimiting.messagesPerDay > 10000) {
      throw new Error('Messages per day must be between 10 and 10000');
    }
    if (config.rateLimiting.cooldownPeriod < 1 || config.rateLimiting.cooldownPeriod > 60) {
      throw new Error('Cooldown period must be between 1 and 60 seconds');
    }

    // Validate moderation level
    const validModerationLevels = ['strict', 'moderate', 'relaxed'];
    if (!validModerationLevels.includes(config.safety.moderationLevel)) {
      throw new Error(`Invalid moderation level: ${config.safety.moderationLevel}. Must be one of: ${validModerationLevels.join(', ')}`);
    }

    // Validate language code
    if (config.multilingual.defaultLanguage.length !== 2) {
      throw new Error('Default language must be a 2-letter ISO 639-1 code');
    }

    // Validate max response length
    if (config.safety.maxResponseLength < 100 || config.safety.maxResponseLength > 10000) {
      throw new Error('Max response length must be between 100 and 10000');
    }

    // Validate personality system prompt
    if (!config.personality.systemPrompt || config.personality.systemPrompt.trim().length === 0) {
      throw new Error('Personality system prompt is required and cannot be empty');
    }

    // Validate emergency stop phrases
    if (!config.safety.emergencyStopPhrases || config.safety.emergencyStopPhrases.length === 0) {
      throw new Error('At least one emergency stop phrase must be configured');
    }
  }

  /**
   * Get configuration value by path
   */
  get<T = any>(path: string): T {
    const keys = path.split('.');
    let value: any = this.config;
    for (const key of keys) {
      value = value?.[key];
    }
    return value;
  }

  /**
   * Set configuration value by path
   */
  set(path: string, value: any): void {
    const keys = path.split('.');
    let current: any = this.config;
    for (const key of keys) {
      if (!current) current = {};
      current[key] = value;
    }
    this.config = current;
    this.saveConfiguration();
    this.notifyWatchers(path);
  }

  /**
   * Get full configuration
   */
  getConfiguration(): ConversationalDiscordConfig {
    return { ...this.config };
  }

  /**
   * Update configuration with partial values
   */
  updateConfiguration(updates: Partial<ConversationalDiscordConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfiguration(this.config);
    this.saveConfiguration();
    this.notifyWatchers('config');
  }

  /**
   * Reload configuration from file and environment
   */
  reload(): void {
    this.config = this.loadConfiguration();
    this.notifyWatchers();
  }

  /**
   * Save configuration to file
   */
  saveConfiguration(): void {
    try {
      const configData = JSON.stringify(this.config, null, 2);
      writeFileSync(this.configPath, configData, 'utf8');
      this.logger.info(`Conversational Discord configuration saved to: ${this.configPath}`);
    } catch (error) {
      this.logger.error('Failed to save conversational Discord configuration:', error);
    }
  }

  /**
   * Watch configuration changes
   */
  watch(path: string, callback: () => void): () => void {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, []);
    }
    this.watchers.get(path)!.push(callback);
    
    return () => {
      const callbacks = this.watchers.get(path);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
        if (callbacks.length === 0) {
          this.watchers.delete(path);
        }
      }
    };
  }

  /**
   * Setup file watching for hot-reloading
   */
  private setupFileWatching(): void {
    try {
      // Check if chokidar is available
      if (typeof chokidar === 'undefined' || chokidar === null) {
        this.logger.warn('chokidar is not available, file watching disabled');
        return;
      }

      const watcher = chokidar.watch(this.configPath);
      
      watcher.on('change', () => {
        this.logger.info('Conversational Discord configuration file changed, reloading...');
        this.reload();
      });
      
      watcher.on('error', (error: any) => {
        this.logger.error('Conversational Discord configuration file watcher error:', error);
      });
    } catch (error) {
      this.logger.error('Failed to setup file watching for conversational Discord configuration:', error as Error);
      // Continue without file watching - config will still work, just won't auto-reload
    }
  }

  /**
   * Notify all watchers of configuration changes
   */
  private notifyWatchers(path?: string): void {
    const pathsToNotify = path ? [path] : Array.from(this.watchers.keys());
    
    for (const watchPath of pathsToNotify) {
      const callbacks = this.watchers.get(watchPath);
      if (callbacks) {
        for (const callback of callbacks) {
          try {
            callback();
          } catch (error) {
            this.logger.error(`Conversational Discord configuration watcher callback error for ${watchPath}:`, error);
          }
        }
      }
    }
  }

  /**
   * Check if conversational Discord mode is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get response channel
   */
  getResponseChannel(): string | null {
    return this.config.responseChannel;
  }

  /**
   * Get context window size
   */
  getContextWindow(): number {
    return this.config.contextWindow;
  }

  /**
   * Get max response length
   */
  getMaxResponseLength(): number {
    return this.config.safety.maxResponseLength;
  }

  /**
   * Get configured tone
   */
  getTone(): 'professional' | 'casual' | 'friendly' | 'playful' | 'adaptive' {
    return this.config.tone;
  }

  /**
   * Get personality configuration
   */
  getPersonality() {
    return this.config.personality;
  }

  /**
   * Get memory configuration
   */
  getMemoryConfig() {
    return this.config.memory;
  }

  /**
   * Get emotional intelligence configuration
   */
  getEmotionalIntelligenceConfig() {
    return this.config.emotionalIntelligence;
  }

  /**
   * Get multilingual configuration
   */
  getMultilingualConfig() {
    return this.config.multilingual;
  }

  /**
   * Get safety configuration
   */
  getSafetyConfig() {
    return this.config.safety;
  }

  /**
   * Get rate limiting configuration
   */
  getRateLimitingConfig() {
    return this.config.rateLimiting;
  }
}

// Singleton instance
export const conversationalConfigManager = new ConversationalConfigManager();
