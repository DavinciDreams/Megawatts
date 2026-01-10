import { Logger } from '../utils/logger';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';
import chokidar from 'chokidar';

// Environment-specific configuration types
export type Environment = 'development' | 'staging' | 'production' | 'test';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  pool: {
    min: number;
    max: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
  };
  migrations: {
    directory: string;
    tableName: string;
  };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  offlineQueue: boolean;
  connectTimeout: number;
  commandTimeout: number;
  maxMemoryPolicy: 'volatile-lru' | 'allkeys-lru' | 'volatile-random' | 'allkeys-random' | 'noeviction';
}

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'local' | 'custom';
  openai?: {
    apiKey?: string;
    organizationId?: string;
    model: string;
    maxTokens: number;
    temperature: number;
    baseUrl?: string;
    timeout: number;
    retryAttempts: number;
  };
  anthropic?: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
    retryAttempts: number;
  };
  local?: {
    models: {
      [modelName: string]: {
        path: string;
        type: 'huggingface' | 'ollama' | 'custom';
        endpoint?: string;
        parameters?: Record<string, any>;
      };
    };
    defaultModel: string;
    timeout: number;
  };
  custom?: {
    endpoint: string;
    apiKey?: string;
    headers?: Record<string, string>;
    timeout: number;
    retryAttempts: number;
  };
}

export interface StorageConfig {
  vectorDatabase?: {
    provider: 'pinecone' | 'weaviate' | 'chroma' | 'qdrant' | 'milvus';
    apiKey?: string;
    environment?: string;
    indexName?: string;
    dimension?: number;
    metric?: 'cosine' | 'euclidean' | 'dotproduct';
    cloud?: {
      region?: string;
      endpoint?: string;
    };
  };
  fileStorage?: {
    provider: 's3' | 'gcs' | 'azure' | 'local';
    s3?: {
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      endpoint?: string;
    };
    gcs?: {
      bucket: string;
      keyFilename: string;
    };
    azure?: {
      account: string;
      container: string;
      sasToken?: string;
    };
    local?: {
      basePath: string;
      maxFileSize?: number;
      allowedExtensions?: string[];
    };
  };
  cache?: {
    provider: 'redis' | 'memory' | 'custom';
    defaultTtl: number;
    maxSize?: number;
    evictionPolicy?: 'lru' | 'fifo' | 'custom';
  };
}

export interface SecurityConfig {
  encryption: {
    algorithm: 'aes-256-gcm' | 'aes-256-cbc' | 'chacha20-poly1305';
    keyRotationInterval: number; // hours
    masterKeyEnvVar: string;
  };
  authentication: {
    jwtSecret: string;
    jwtExpiration: number; // seconds
    refreshExpiration: number; // seconds
    bcryptRounds: number;
  };
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
  };
  cors: {
    enabled: boolean;
    origins: string[];
    credentials: boolean;
  };
}

export interface FeatureFlags {
  [featureName: string]: {
    enabled: boolean;
    description: string;
    rolloutPercentage?: number;
    conditions?: Record<string, any>;
    metadata?: Record<string, any>;
  };
}

export interface ConversationalDiscordConfig {
  enabled: boolean;
  mode: 'conversational' | 'command' | 'hybrid';
  responseChannel: string | null;
  responseChannelType: 'same' | 'dm' | 'custom';
  contextWindow: number;
  maxTokens: number;
  temperature: number;
  personality: {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    defaultTone: 'friendly' | 'professional' | 'casual' | 'playful';
    defaultFormality: 'formal' | 'casual' | 'adaptive';
    defaultVerbosity: 'concise' | 'detailed' | 'balanced' | 'adaptive';
  };
  tone: 'friendly' | 'professional' | 'casual' | 'playful';
  formality: 'formal' | 'casual' | 'adaptive';
  verbosity: 'concise' | 'detailed' | 'balanced' | 'adaptive';
  memory: {
    shortTermEnabled: boolean;
    shortTermTTL: number;
    mediumTermEnabled: boolean;
    mediumTermRetentionDays: number;
    longTermEnabled: boolean;
    longTermRetentionDays: number;
    vectorSearchEnabled: boolean;
    vectorSimilarityThreshold: number;
  };
  emotionalIntelligence: {
    enabled: boolean;
    sentimentAnalysis: boolean;
    emotionDetection: boolean;
    empatheticResponses: boolean;
    conflictDeescalation: boolean;
    moodAdaptation: boolean;
    emotionInfluence: number;
  };
  multilingual: {
    enabled: boolean;
    defaultLanguage: string;
    autoDetectLanguage: boolean;
    supportedLanguages: string[];
  };
  safety: {
    enabled: boolean;
    contentFiltering: boolean;
    moderationLevel: 'strict' | 'moderate' | 'relaxed';
    blockHarmfulContent: boolean;
    blockPersonalInfo: boolean;
    emergencyStop: boolean;
    emergencyStopPhrases: string[];
    maxResponseLength: number;
  };
  rateLimiting: {
    enabled: boolean;
    messagesPerMinute: number;
    messagesPerHour: number;
    messagesPerDay: number;
    perUserLimit: boolean;
    perChannelLimit: boolean;
    cooldownPeriod: number;
  };
  features: {
    crossChannelAwareness: boolean;
    temporalContext: boolean;
    userLearning: boolean;
    adaptiveResponses: boolean;
    toolCalling: boolean;
    codeExecution: boolean;
    selfEditing: boolean;
  };
}

export interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    interval: number; // seconds
    retention: number; // days
    aggregation: boolean;
  };
  health: {
    enabled: boolean;
    interval: number; // seconds
    endpoints: {
      liveness: string;
      readiness: string;
      startup: string;
    };
  };
  alerts: {
    enabled: boolean;
    channels: 'email' | 'slack' | 'webhook' | 'discord' | 'console';
    thresholds: {
      errorRate: number;
      responseTime: number;
      memoryUsage: number;
      cpuUsage: number;
    };
  };
  tracing: {
    enabled: boolean;
    samplingRate: number;
    exportFormat: 'jaeger' | 'zipkin' | 'otlp';
    endpoint?: string;
  };
}

export interface AdvancedBotConfig {
  environment: Environment;
  debug: boolean;
  database: DatabaseConfig;
  redis: RedisConfig;
  ai: AIConfig;
  storage: StorageConfig;
  security: SecurityConfig;
  features: FeatureFlags;
  monitoring: MonitoringConfig;
  conversationalDiscord: ConversationalDiscordConfig;
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    format: 'json' | 'text' | 'combined';
    outputs: ('console' | 'file' | 'http' | 'database')[];
    file?: {
      path: string;
      maxSize?: string;
      maxFiles?: number;
      rotation?: 'daily' | 'weekly' | 'monthly';
    };
    http?: {
      endpoint: string;
      headers?: Record<string, string>;
      timeout: number;
    };
  };
  performance: {
    maxConcurrentRequests: number;
    requestTimeout: number;
    responseTimeout: number;
    keepAliveTimeout: number;
    compression: boolean;
    caching: {
      enabled: boolean;
      strategies: string[];
    };
  };
}

export class AdvancedConfigManager {
  private config: AdvancedBotConfig;
  private logger: Logger;
  private environment: Environment;
  private configPath: string;
  private watchers: Map<string, (() => void)[]> = new Map();

  constructor(configPath?: string) {
    this.logger = new Logger('AdvancedConfigManager');
    this.environment = this.detectEnvironment();
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.loadConfiguration();
    this.setupFileWatching();
  }

  private detectEnvironment(): Environment {
    const env = process.env.NODE_ENV || process.env.ENV || 'development';
    
    switch (env.toLowerCase()) {
      case 'production':
      case 'prod':
        return 'production';
      case 'staging':
      case 'stage':
        return 'staging';
      case 'test':
        return 'test';
      default:
        return 'development';
    }
  }

  private getDefaultConfigPath(): string {
    const basePath = process.env.CONFIG_PATH || process.cwd();
    
    switch (this.environment) {
      case 'production':
        return resolve(basePath, 'config.production.json');
      case 'staging':
        return resolve(basePath, 'config.staging.json');
      case 'test':
        return resolve(basePath, 'config.test.json');
      default:
        return resolve(basePath, 'config.development.json');
    }
  }

  private loadConfiguration(): AdvancedBotConfig {
    // Load base configuration
    let config: Partial<AdvancedBotConfig> = {};

    // Try to load from file
    if (existsSync(this.configPath)) {
      try {
        const fileContent = readFileSync(this.configPath, 'utf8');
        config = JSON.parse(fileContent);
        this.logger.info(`Configuration loaded from file: ${this.configPath}`);
      } catch (error) {
        this.logger.error(`Failed to load configuration from file: ${this.configPath}`, error);
      }
    } else {
      this.logger.warn(`Configuration file not found: ${this.configPath}, using defaults`);
    }

    // Override with environment variables
    config = this.overrideWithEnvironmentVariables(config);

    // Apply defaults and validation
    return this.validateAndApplyDefaults(config);
  }

  private overrideWithEnvironmentVariables(config: Partial<AdvancedBotConfig>): Partial<AdvancedBotConfig> {
    const envOverrides: Partial<AdvancedBotConfig> = {};
    
    // Initialize features to avoid undefined errors
    envOverrides.features = config.features || {};
    
    // Database overrides
    if (process.env.DB_HOST) envOverrides.database = { ...config.database, host: process.env.DB_HOST };
    if (process.env.DB_PORT) envOverrides.database = { ...envOverrides.database, port: parseInt(process.env.DB_PORT) };
    if (process.env.DB_NAME) envOverrides.database = { ...envOverrides.database, database: process.env.DB_NAME };
    if (process.env.DB_USER) envOverrides.database = { ...envOverrides.database, user: process.env.DB_USER };
    if (process.env.DB_PASSWORD) envOverrides.database = { ...envOverrides.database, password: process.env.DB_PASSWORD };

    // Redis overrides
    if (process.env.REDIS_HOST) envOverrides.redis = { ...config.redis, host: process.env.REDIS_HOST };
    if (process.env.REDIS_PORT) envOverrides.redis = { ...envOverrides.redis, port: parseInt(process.env.REDIS_PORT) };
    if (process.env.REDIS_PASSWORD) envOverrides.redis = { ...envOverrides.redis, password: process.env.REDIS_PASSWORD };

    // AI overrides
    if (process.env.AI_PROVIDER) envOverrides.ai = { ...config.ai, provider: process.env.AI_PROVIDER as any };
    if (process.env.OPENAI_API_KEY) envOverrides.ai = { ...envOverrides.ai, openai: { ...envOverrides.ai?.openai, apiKey: process.env.OPENAI_API_KEY } };
    if (process.env.ANTHROPIC_API_KEY) envOverrides.ai = { ...envOverrides.ai, anthropic: { ...envOverrides.ai?.anthropic, apiKey: process.env.ANTHROPIC_API_KEY } };

    // Feature flags
    if (process.env.FEATURE_FLAGS) {
      try {
        const flags = JSON.parse(process.env.FEATURE_FLAGS);
        envOverrides.features = { ...config.features, ...flags };
      } catch (error) {
        this.logger.warn('Invalid FEATURE_FLAGS environment variable:', error);
      }
    }

    // Conversational Discord overrides
    const convDiscordBase = config.conversationalDiscord || envOverrides.conversationalDiscord;
    
    if (process.env.DISCORD_CONVERSATIONAL_ENABLED !== undefined ||
        process.env.DISCORD_CONVERSATIONAL_RESPONSE_CHANNEL ||
        process.env.DISCORD_CONVERSATIONAL_CONTEXT_WINDOW ||
        process.env.DISCORD_CONVERSATIONAL_MAX_TOKENS ||
        process.env.DISCORD_CONVERSATIONAL_TEMPERATURE ||
        process.env.DISCORD_CONVERSATIONAL_TONE ||
        process.env.DISCORD_CONVERSATIONAL_FORMALITY ||
        process.env.DISCORD_CONVERSATIONAL_VERBOSITY ||
        process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE ||
        process.env.DISCORD_CONVERSATIONAL_EMOTION_INFLUENCE ||
        process.env.DISCORD_CONVERSATIONAL_MEMORY_RETENTION_DAYS ||
        process.env.DISCORD_CONVERSATIONAL_MULTILINGUAL_ENABLED ||
        process.env.DISCORD_CONVERSATIONAL_DEFAULT_LANGUAGE ||
        process.env.DISCORD_CONVERSATIONAL_CONTENT_FILTERING ||
        process.env.DISCORD_CONVERSATIONAL_MODERATION_LEVEL ||
        process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED ||
        process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_PHRASES) {
      
      const currentConvDiscord = envOverrides.conversationalDiscord || convDiscordBase;
      
      envOverrides.conversationalDiscord = {
        enabled: process.env.DISCORD_CONVERSATIONAL_ENABLED !== undefined
          ? process.env.DISCORD_CONVERSATIONAL_ENABLED === 'true'
          : currentConvDiscord?.enabled ?? false,
        mode: (process.env.DISCORD_CONVERSATIONAL_MODE as any)
          ?? currentConvDiscord?.mode
          ?? 'conversational',
        responseChannel: process.env.DISCORD_CONVERSATIONAL_RESPONSE_CHANNEL
          ?? currentConvDiscord?.responseChannel
          ?? 'bot-responses',
        responseChannelType: (process.env.DISCORD_CONVERSATIONAL_RESPONSE_CHANNEL_TYPE as any)
          ?? currentConvDiscord?.responseChannelType
          ?? 'same',
        contextWindow: process.env.DISCORD_CONVERSATIONAL_CONTEXT_WINDOW
          ? parseInt(process.env.DISCORD_CONVERSATIONAL_CONTEXT_WINDOW)
          : currentConvDiscord?.contextWindow
          ?? 50,
        maxTokens: process.env.DISCORD_CONVERSATIONAL_MAX_TOKENS
          ? parseInt(process.env.DISCORD_CONVERSATIONAL_MAX_TOKENS)
          : currentConvDiscord?.maxTokens
          ?? 2000,
        temperature: process.env.DISCORD_CONVERSATIONAL_TEMPERATURE
          ? parseFloat(process.env.DISCORD_CONVERSATIONAL_TEMPERATURE)
          : currentConvDiscord?.temperature
          ?? 0.7,
        tone: (process.env.DISCORD_CONVERSATIONAL_TONE as any)
          ?? currentConvDiscord?.tone
          ?? 'friendly',
        formality: (process.env.DISCORD_CONVERSATIONAL_FORMALITY as any)
          ?? currentConvDiscord?.formality
          ?? 'casual',
        verbosity: (process.env.DISCORD_CONVERSATIONAL_VERBOSITY as any)
          ?? currentConvDiscord?.verbosity
          ?? 'balanced',
        personality: currentConvDiscord?.personality ?? {
          id: 'megawatts-default',
          name: 'Megawatts',
          description: 'A helpful and intelligent Discord assistant',
          systemPrompt: 'You are Megawatts, a helpful and intelligent Discord assistant. You are friendly, professional, and always aim to provide accurate and useful information.',
          defaultTone: 'friendly',
          defaultFormality: 'casual',
          defaultVerbosity: 'balanced',
        },
        memory: {
          shortTermEnabled: currentConvDiscord?.memory?.shortTermEnabled ?? true,
          shortTermTTL: currentConvDiscord?.memory?.shortTermTTL ?? 3600,
          mediumTermEnabled: currentConvDiscord?.memory?.mediumTermEnabled ?? true,
          mediumTermRetentionDays: process.env.DISCORD_CONVERSATIONAL_MEMORY_RETENTION_DAYS
            ? parseInt(process.env.DISCORD_CONVERSATIONAL_MEMORY_RETENTION_DAYS)
            : currentConvDiscord?.memory?.mediumTermRetentionDays
            ?? 7,
          longTermEnabled: currentConvDiscord?.memory?.longTermEnabled ?? false,
          longTermRetentionDays: currentConvDiscord?.memory?.longTermRetentionDays ?? 30,
          vectorSearchEnabled: currentConvDiscord?.memory?.vectorSearchEnabled ?? false,
          vectorSimilarityThreshold: currentConvDiscord?.memory?.vectorSimilarityThreshold ?? 0.7,
        },
        emotionalIntelligence: {
          enabled: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true'
            : currentConvDiscord?.emotionalIntelligence?.enabled
            ?? true,
          sentimentAnalysis: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true'
            : currentConvDiscord?.emotionalIntelligence?.sentimentAnalysis
            ?? true,
          emotionDetection: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true'
            : currentConvDiscord?.emotionalIntelligence?.emotionDetection
            ?? true,
          empatheticResponses: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true'
            : currentConvDiscord?.emotionalIntelligence?.empatheticResponses
            ?? true,
          conflictDeescalation: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true'
            : currentConvDiscord?.emotionalIntelligence?.conflictDeescalation
            ?? true,
          moodAdaptation: process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_EMOTIONAL_INTELLIGENCE === 'true'
            : currentConvDiscord?.emotionalIntelligence?.moodAdaptation
            ?? true,
          emotionInfluence: process.env.DISCORD_CONVERSATIONAL_EMOTION_INFLUENCE
            ? parseFloat(process.env.DISCORD_CONVERSATIONAL_EMOTION_INFLUENCE)
            : currentConvDiscord?.emotionalIntelligence?.emotionInfluence
            ?? 0.7,
        },
        multilingual: {
          enabled: process.env.DISCORD_CONVERSATIONAL_MULTILINGUAL_ENABLED !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_MULTILINGUAL_ENABLED === 'true'
            : currentConvDiscord?.multilingual?.enabled
            ?? false,
          defaultLanguage: process.env.DISCORD_CONVERSATIONAL_DEFAULT_LANGUAGE
            ?? currentConvDiscord?.multilingual?.defaultLanguage
            ?? 'en',
          autoDetectLanguage: process.env.DISCORD_CONVERSATIONAL_MULTILINGUAL_ENABLED !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_MULTILINGUAL_ENABLED === 'true'
            : currentConvDiscord?.multilingual?.autoDetectLanguage
            ?? false,
          supportedLanguages: currentConvDiscord?.multilingual?.supportedLanguages ?? ['en'],
        },
        safety: {
          enabled: process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED === 'true'
            : currentConvDiscord?.safety?.enabled
            ?? true,
          contentFiltering: process.env.DISCORD_CONVERSATIONAL_CONTENT_FILTERING !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_CONTENT_FILTERING === 'true'
            : currentConvDiscord?.safety?.contentFiltering
            ?? true,
          moderationLevel: (process.env.DISCORD_CONVERSATIONAL_MODERATION_LEVEL as any)
            ?? currentConvDiscord?.safety?.moderationLevel
            ?? 'moderate',
          blockHarmfulContent: currentConvDiscord?.safety?.blockHarmfulContent ?? true,
          blockPersonalInfo: currentConvDiscord?.safety?.blockPersonalInfo ?? true,
          emergencyStop: process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED !== undefined
            ? process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_ENABLED === 'true'
            : currentConvDiscord?.safety?.emergencyStop
            ?? true,
          emergencyStopPhrases: process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_PHRASES
            ? process.env.DISCORD_CONVERSATIONAL_EMERGENCY_STOP_PHRASES.split(',')
            : currentConvDiscord?.safety?.emergencyStopPhrases
            ?? ['stop', 'emergency stop', 'halt', 'abort'],
          maxResponseLength: process.env.DISCORD_CONVERSATIONAL_MAX_RESPONSE_LENGTH
            ? parseInt(process.env.DISCORD_CONVERSATIONAL_MAX_RESPONSE_LENGTH)
            : currentConvDiscord?.safety?.maxResponseLength
            ?? 2000,
        },
        rateLimiting: currentConvDiscord?.rateLimiting ?? {
          enabled: true,
          messagesPerMinute: 10,
          messagesPerHour: 100,
          messagesPerDay: 500,
          perUserLimit: true,
          perChannelLimit: true,
          cooldownPeriod: 5,
        },
        features: currentConvDiscord?.features ?? {
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

    return envOverrides;
  }

  private validateAndApplyDefaults(config: Partial<AdvancedBotConfig>): AdvancedBotConfig {
    const defaults: AdvancedBotConfig = {
      environment: this.environment,
      debug: this.environment === 'development',
      database: {
        host: 'localhost',
        port: 5432,
        database: 'megawatts_bot',
        user: 'postgres',
        password: '',
        ssl: false,
        pool: {
          min: 2,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        },
        migrations: {
          directory: './migrations',
          tableName: 'schema_migrations',
        },
      },
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        keyPrefix: 'megawatts:',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        offlineQueue: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
        maxMemoryPolicy: 'allkeys-lru',
      },
      ai: {
        provider: 'openai',
        openai: {
          model: 'gpt-4',
          maxTokens: 4096,
          temperature: 0.7,
          timeout: 30000,
          retryAttempts: 3,
        },
      },
      storage: {
        cache: {
          provider: 'redis',
          defaultTtl: 3600,
        },
      },
      security: {
        encryption: {
          algorithm: 'aes-256-gcm',
          keyRotationInterval: 24,
          masterKeyEnvVar: 'ENCRYPTION_MASTER_KEY',
        },
        authentication: {
          jwtSecret: 'change-me-in-production',
          jwtExpiration: 86400, // 24 hours
          refreshExpiration: 604800, // 7 days
          bcryptRounds: 12,
        },
        rateLimiting: {
          windowMs: 60000, // 1 minute
          maxRequests: 100,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
        },
        cors: {
          enabled: true,
          origins: ['*'],
          credentials: false,
        },
      },
      features: {
        selfEditing: {
          enabled: true,
          description: 'Enable self-editing capabilities',
          rolloutPercentage: 100,
        },
        aiFeatures: {
          enabled: true,
          description: 'Enable AI-powered features',
          conditions: {
            requiresApiKey: true,
          },
        },
        analytics: {
          enabled: true,
          description: 'Enable analytics collection',
        },
        monitoring: {
          enabled: true,
          description: 'Enable system monitoring',
        },
        conversationalDiscord: {
          enabled: false,
          description: 'Enable conversational Discord mode for natural language interactions',
          rolloutPercentage: 0,
          conditions: {
            requiresApiKey: true,
            requiresAIProvider: true,
          },
        },
      },
      conversationalDiscord: {
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
          systemPrompt: 'You are Megawatts, a helpful and intelligent Discord assistant. You are friendly, professional, and always aim to provide accurate and useful information.',
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
      },
      monitoring: {
        metrics: {
          enabled: true,
          interval: 60,
          retention: 30,
          aggregation: true,
        },
        health: {
          enabled: true,
          interval: 30,
          endpoints: {
            liveness: '/health',
            readiness: '/ready',
            startup: '/startup',
          },
        },
        alerts: {
          enabled: true,
          channels: 'console',
          thresholds: {
            errorRate: 0.05, // 5%
            responseTime: 5000, // 5 seconds
            memoryUsage: 0.8, // 80%
            cpuUsage: 0.8, // 80%
          },
        },
        tracing: {
          enabled: false,
          samplingRate: 0.1, // 10%
          exportFormat: 'otlp',
        },
      },
      logging: {
        level: 'info',
        format: 'json',
        outputs: ['console'],
      },
      performance: {
        maxConcurrentRequests: 100,
        requestTimeout: 30000,
        responseTimeout: 30000,
        keepAliveTimeout: 60000,
        compression: true,
        caching: {
          enabled: true,
          strategies: ['redis', 'memory'],
        },
      },
    };

    return this.mergeConfig(defaults, config);
  }

  private mergeConfig(defaults: AdvancedBotConfig, overrides: Partial<AdvancedBotConfig>): AdvancedBotConfig {
    const merged = { ...defaults };
    
    for (const key in overrides) {
      if (overrides[key as keyof AdvancedBotConfig] !== undefined) {
        if (typeof defaults[key as keyof AdvancedBotConfig] === 'object' && typeof overrides[key as keyof AdvancedBotConfig] === 'object') {
          (merged as any)[key] = this.mergeConfig(
            defaults[key as keyof AdvancedBotConfig] as any,
            overrides[key as keyof AdvancedBotConfig] as any
          );
        } else {
          (merged as any)[key] = overrides[key as keyof AdvancedBotConfig];
        }
      }
    }
    
    return merged;
  }

  get<T = any>(path: string): T {
    const keys = path.split('.');
    let current: any = this.config;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  set(path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    let current: any = this.config;
    
    for (const key of keys) {
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[lastKey] = value;
    this.config = this.mergeConfig(this.config, { [path]: value });
    this.saveConfiguration();
  }

  isFeatureEnabled(featureName: string): boolean {
    const feature = this.get<FeatureFlags[string]>(`features.${featureName}`);
    if (!feature) {
      return false;
    }

    // Check rollout percentage
    if (feature.rolloutPercentage !== undefined && feature.rolloutPercentage < 100) {
      // Simple hash-based rollout for demonstration
      const hash = this.simpleHash(process.env.BOT_INSTANCE_ID || 'default');
      return (hash % 100) < feature.rolloutPercentage;
    }

    // Check conditions
    if (feature.conditions) {
      for (const [conditionKey, conditionValue] of Object.entries(feature.conditions)) {
        const configValue = this.get(conditionKey);
        if (configValue !== conditionValue) {
          return false;
        }
      }
    }

    return feature.enabled;
  }

  getEnvironment(): Environment {
    return this.environment;
  }

  isDevelopment(): boolean {
    return this.environment === 'development';
  }

  isProduction(): boolean {
    return this.environment === 'production';
  }

  reload(): void {
    this.config = this.loadConfiguration();
    this.notifyWatchers();
  }

  saveConfiguration(): void {
    try {
      const configData = JSON.stringify(this.config, null, 2);
      writeFileSync(this.configPath, configData, 'utf8');
      this.logger.info(`Configuration saved to: ${this.configPath}`);
    } catch (error) {
      this.logger.error('Failed to save configuration:', error);
    }
  }

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

  private setupFileWatching(): void {
    if (this.isDevelopment()) {
      const watcher = chokidar.watch(this.configPath);
      
      watcher.on('change', () => {
        this.logger.info('Configuration file changed, reloading...');
        this.reload();
      });
      
      watcher.on('error', (error: any) => {
        this.logger.error('Configuration file watcher error:', error);
      });
    }
  }

  private notifyWatchers(): void {
    for (const [path, callbacks] of this.watchers.entries()) {
      for (const callback of callbacks) {
        try {
          callback();
        } catch (error) {
          this.logger.error(`Configuration watcher callback error for ${path}:`, error);
        }
      }
    }
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }
}

// Singleton instance
export const configManager = new AdvancedConfigManager();