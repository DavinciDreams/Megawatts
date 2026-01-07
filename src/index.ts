import { Client, GatewayIntentBits, Message } from 'discord.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { HealthManager } from './core/health/index';
import { Logger as UtilsLogger } from './utils/logger';
import { MessageRouter } from './core/processing/messageRouter';
import { DEFAULT_PIPELINE_CONFIG, IntentType, RiskLevel } from './core/processing/types';
import { RedisConnectionManager } from './storage/database/redis';
import { DistributedLock } from './utils/distributed-lock';
import { ConversationalDiscordConfig } from './types/conversational';
import { conversationalConfigManager } from './config/conversationalConfigManager';
import {
  createDiscordBotIntegration,
  DiscordBotIntegration,
  isCommandMessage,
  extractCommandName,
  extractCommandArgs,
} from './discord/integration/botIntegration';
import { ContextManager } from './ai/core/context-manager';
import { TieredStorageManager } from './storage/tiered/tieredStorage';
import { ToolRegistry, ToolRegistryConfig } from './ai/tools/tool-registry';
import { sendLongReply } from './utils/discord-message-helper';

// Load environment variables FIRST
dotenv.config();

// Reload conversational config manager after loading environment variables
// This is necessary because the singleton is created before dotenv.config() is called
conversationalConfigManager.reload();
console.log('[DEBUG] Reloaded conversational config after dotenv');

// Debug: Log environment loading
console.log('[DEBUG] Environment variables loaded:');
console.log('[DEBUG] DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
console.log('[DEBUG] DISCORD_TOKEN length:', process.env.DISCORD_TOKEN?.length || 0);
console.log('[DEBUG] DISCORD_CLIENT_ID exists:', !!process.env.DISCORD_CLIENT_ID);

// Custom bot intents for command handling
enum BotIntent {
  Help = 'help',
  Ping = 'ping',
  Status = 'status',
  Health = 'health',
  Config = 'config',
  SelfEdit = 'self_edit',
  Analyze = 'analyze',
  Optimize = 'optimize'
}


// Basic configuration class
class BotConfig {
  private settings: Map<string, any> = new Map();

  constructor() {
    // Debug: Log environment variable access
    console.log('[DEBUG] BotConfig constructor - Environment variables:');
    console.log('[DEBUG] process.env.DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? 'EXISTS' : 'MISSING');
    console.log('[DEBUG] process.env.DISCORD_CLIENT_ID:', process.env.DISCORD_CLIENT_ID ? 'EXISTS' : 'MISSING');
    console.log('[DEBUG] process.env.NODE_ENV:', process.env.NODE_ENV || 'development');
    console.log('[DEBUG] process.env.BOT_RESPONSE_CHANNEL:', process.env.BOT_RESPONSE_CHANNEL || 'megawatts (default)');
    
    // Load configuration from environment variables
    this.settings.set('DISCORD_TOKEN', process.env.DISCORD_TOKEN || '');
    this.settings.set('DISCORD_CLIENT_ID', process.env.DISCORD_CLIENT_ID || '');
    this.settings.set('NODE_ENV', process.env.NODE_ENV || 'development');
    this.settings.set('HTTP_PORT', process.env.HTTP_PORT || '8080');
    this.settings.set('HTTP_HOST', process.env.HTTP_HOST || '0.0.0.0');
    this.settings.set('BOT_RESPONSE_CHANNEL', process.env.BOT_RESPONSE_CHANNEL || 'megawatts');
    
    // Debug: Log what was actually stored
    console.log('[DEBUG] BotConfig stored values:');
    console.log('[DEBUG] DISCORD_TOKEN length:', this.settings.get('DISCORD_TOKEN')?.length || 0);
    console.log('[DEBUG] DISCORD_CLIENT_ID:', this.settings.get('DISCORD_CLIENT_ID'));
    console.log('[DEBUG] BOT_RESPONSE_CHANNEL:', this.settings.get('BOT_RESPONSE_CHANNEL'));
  }

  get(key: string): any {
    return this.settings.get(key);
  }

  set(key: string, value: any): void {
    this.settings.set(key, value);
  }
}

// HTTP Server class for health endpoints
class HealthServer {
  private app: express.Application;
  private server: any;
  private logger: UtilsLogger;
  private healthManager: HealthManager;
  private port: number;
  private host: string;

  constructor(healthManager: HealthManager, config: BotConfig) {
    this.app = express();
    this.healthManager = healthManager;
    this.logger = new UtilsLogger();
    this.port = parseInt(config.get('HTTP_PORT'));
    this.host = config.get('HTTP_HOST');
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());
    
    // Body parsing middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging middleware
    this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Setup health endpoints
    this.healthManager.setupEndpoints(this.app);
    
    // Root endpoint
    this.app.get('/', (req: express.Request, res: express.Response) => {
      res.json({
        name: 'Self-Editing Discord Bot',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use('*', (req: express.Request, res: express.Response) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    });

    // Error handler
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error in health server', err);
      res.status(500).json({
        error: 'Internal Server Error',
        timestamp: new Date().toISOString()
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          this.logger.info(`Health server started on http://${this.host}:${this.port}`);
          resolve();
        });

        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            this.logger.error(`Port ${this.port} is already in use`);
          } else {
            this.logger.error('Failed to start health server', error);
          }
          reject(error);
        });
      } catch (error) {
        this.logger.error('Failed to start health server', error as Error);
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Health server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Core bot class with self-editing capabilities
class SelfEditingDiscordBot {
  private client!: Client;
  private logger: UtilsLogger;
  private config: BotConfig;
  private healthManager: HealthManager;
  private healthServer: HealthServer;
  private isReady: boolean = false;
  private messageRouter: MessageRouter;
  private redis: RedisConnectionManager;
  private distributedLock: DistributedLock;
  // Discord bot integration for conversational mode
  private discordBotIntegration: DiscordBotIntegration | null = null;
  // Local deduplication set to prevent duplicate responses within single instance
  private processedMessages: Set<string> = new Set();
  private isProcessing: Map<string, boolean> = new Map();

  constructor(
    private token: string,
    logger?: UtilsLogger,
    config?: BotConfig,
    private conversationalDiscordConfig?: ConversationalDiscordConfig
  ) {
    this.logger = logger || new UtilsLogger();
    this.config = config || new BotConfig();
    this.healthManager = new HealthManager();
    this.healthServer = new HealthServer(this.healthManager, this.config);
    this.messageRouter = new MessageRouter(DEFAULT_PIPELINE_CONFIG);
    
    // Initialize Redis connection
    const redisConfig: any = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      database: 0,
      connectTimeout: 10000,
      keepAlive: 30000,
    };
    // Only include password if it's actually provided (non-empty string)
    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }
    this.redis = new RedisConnectionManager(redisConfig);

    // Initialize distributed lock
    this.distributedLock = new DistributedLock(this.redis, 'DistributedLock');
  }

  // Initialize Discord client and health server
  async initialize(): Promise<void> {
    try {
      console.log('[DEBUG-INIT] Starting bot initialization');
      console.log('[DEBUG-INIT] conversationalDiscordConfig in initialize():', this.conversationalDiscordConfig);
      console.log('[DEBUG-INIT] conversationalDiscordConfig?.enabled:', this.conversationalDiscordConfig?.enabled);
      
      // Initialize Redis connection first
      await this.redis.connect();
      this.logger.info('Redis connection established');

      // Initialize health manager
      await this.healthManager.initialize();
      this.logger.info('Health manager initialized');

      // Start health server
      await this.healthServer.start();
      this.logger.info('Health server started');

      // Initialize Discord client
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent
        ],
        presence: {
          status: 'online',
          activities: [{ name: 'listening', type: 2 }],
        },
      });

      this.client.on('clientReady', () => {
        this.logger.info('Bot client is ready and online!');
        this.isReady = true;
        // Update health manager with Discord client status
        this.updateDiscordHealthStatus(true);
      });

      // Backward compatibility for deprecated ready event
      this.client.on('ready', () => {
        this.logger.warn('Using deprecated ready event. Please migrate to clientReady event.');
        this.isReady = true;
        this.updateDiscordHealthStatus(true);
      });

      this.client.on('disconnect', () => {
        this.logger.warn('Discord client disconnected');
        this.isReady = false;
        this.updateDiscordHealthStatus(false);
      });

      this.client.on('reconnecting', () => {
        this.logger.info('Discord client reconnecting');
        this.updateDiscordHealthStatus(false);
      });

      // Register messageCreate event listener
      this.client.on('messageCreate', async (message) => {
        this.logger.info(`[EVENT] messageCreate event fired for message ${message.id} from ${message.author.tag} (author.bot: ${message.author.bot})`);
        await this.handleMessage(message);
      });
      
      // Log number of event listeners for debugging
      const listenerCount = this.client.listenerCount('messageCreate');
      this.logger.info(`[INIT] Registered messageCreate event listener. Total listeners: ${listenerCount}`);

      await this.client.login(this.token);
      
      // Initialize Discord bot integration for conversational mode
      await this.initializeDiscordIntegration(this.conversationalDiscordConfig);
      
      this.logger.info('Bot initialization complete');
    } catch (error) {
      this.logger.error('Failed to initialize bot:', error as Error);
      throw error;
    }
  }

  // Initialize Discord bot integration for conversational mode
  private async initializeDiscordIntegration(conversationalDiscordConfig?: ConversationalDiscordConfig): Promise<void> {
    // DEBUG: Log config parameter
    console.log('[DEBUG-INIT-DISCORD] initializeDiscordIntegration called');
    console.log('[DEBUG-INIT-DISCORD] conversationalDiscordConfig:', conversationalDiscordConfig);
    console.log('[DEBUG-INIT-DISCORD] conversationalDiscordConfig.enabled:', conversationalDiscordConfig?.enabled);
    console.log('[DEBUG-INIT-DISCORD] typeof conversationalDiscordConfig:', typeof conversationalDiscordConfig);
    console.log('[DEBUG-INIT-DISCORD] conversationalDiscordConfig keys:', conversationalDiscordConfig ? Object.keys(conversationalDiscordConfig) : 'N/A');
    
    if (!conversationalDiscordConfig) {
      console.log('[DEBUG-INIT-DISCORD] Early return: conversationalDiscordConfig is falsy');
      return;
    }
    
    if (!conversationalDiscordConfig.enabled) {
      console.log('[DEBUG-INIT-DISCORD] Early return: conversational mode is disabled');
      return;
    }
    
    console.log('[DEBUG-INIT-DISCORD] PASSED early checks, proceeding with integration creation');

    try {
      // Initialize ContextManager
      const contextManager = new ContextManager(
        {
          maxMessagesPerConversation: conversationalDiscordConfig.contextWindow,
          maxMessageAge: conversationalDiscordConfig.memory.mediumTermRetentionDays * 24 * 60 * 60 * 1000,
          memory: {
            maxMemories: 1000,
            retention: conversationalDiscordConfig.memory.mediumTermRetentionDays * 24 * 60 * 60 * 1000,
            indexing: true,
          },
          cleanup: {
            enabled: true,
            interval: 3600000, // 1 hour
            maxAge: conversationalDiscordConfig.memory.longTermRetentionDays * 24 * 60 * 60 * 1000,
          },
        },
        this.logger
      );

      // Initialize TieredStorageManager with existing Redis connection and null for postgres
      const tieredStorage = new TieredStorageManager(
        null as any, // PostgresConnectionManager - bot doesn't have one
        this.redis, // RedisConnectionManager
        {
          hot: {
            enabled: true,
            ttl: 3600, // 1 hour
            maxSize: 10000,
          },
          warm: {
            enabled: true,
            retentionDays: conversationalDiscordConfig.memory.mediumTermRetentionDays,
          },
          cold: {
            enabled: true,
            retentionDays: conversationalDiscordConfig.memory.longTermRetentionDays,
            compressionEnabled: true,
          },
          backup: {
            enabled: false,
            retentionDays: conversationalDiscordConfig.memory.longTermRetentionDays * 2,
            schedule: '0 2 * * *', // Daily at 2 AM
          },
          migration: {
            enabled: true,
            intervalMinutes: 60,
            batchSize: 100,
          },
        }
      );

      // Initialize TieredStorageManager
      await tieredStorage.initialize();
      this.logger.info('TieredStorageManager initialized');
      
      // Initialize ToolRegistry for tool calling support
      const toolRegistryConfig: ToolRegistryConfig = {
        autoRegisterBuiltinTools: true,
        enablePermissions: true,
        enableCategories: true,
        enableCaching: true,
        cacheTTL: 3600000, // 1 hour
        enableMonitoring: true,
        enableDependencyManagement: true,
        maxTools: 100,
        toolDiscoveryPaths: [
          './src/tools',
        ],
        enableRateLimiting: true,
      };
      const toolRegistry = new ToolRegistry(toolRegistryConfig, this.logger);
      
      // Discover tools from configured paths
      await toolRegistry.discoverTools();
      this.logger.info('ToolRegistry initialized and tools discovered');
      
      this.discordBotIntegration = await createDiscordBotIntegration({
        client: this.client,
        config: conversationalDiscordConfig,
        aiConfig: {
          providers: {
            openai: {
              enabled: true,
              apiKey: process.env.OPENAI_API_KEY || '',
              timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000'),
              retries: parseInt(process.env.OPENAI_RETRY_ATTEMPTS || '3'),
            },
            anthropic: {
              enabled: !!process.env.ANTHROPIC_API_KEY,
              apiKey: process.env.ANTHROPIC_API_KEY || '',
              timeout: parseInt(process.env.ANTHROPIC_TIMEOUT || '30000'),
              retries: parseInt(process.env.ANTHROPIC_RETRY_ATTEMPTS || '3'),
            },
            local: {
              enabled: false,
              endpoint: 'http://localhost:11434/api',
              modelPath: '',
            },
          },
          routing: {
            strategy: {
              name: 'round-robin',
              type: 'round_robin',
            },
            strategies: [],
            rules: [],
            loadBalancing: {
              enabled: true,
              strategy: 'round-robin',
            },
            healthCheck: {
              enabled: true,
              interval: 60000,
              timeout: 5000,
              retries: 3,
            },
          },
          safety: {
            enabled: true,
            level: 'medium',
          },
          personalization: {
            enabled: false,
          },
          formatting: {
            enabled: true,
          },
          enhancements: {
            enabled: false,
          },
          performance: {
            maxConcurrentRequests: 10,
            queueSize: 100,
            timeoutMs: 30000,
            retryAttempts: 3,
          },
          conversation: {
            maxMessagesPerConversation: 100,
            maxMessageAge: 86400000, // 24 hours
            cleanup: {
              enabled: true,
              interval: 3600000, // 1 hour
              maxAge: 604800000, // 7 days
            },
          },
          memory: {
            maxMemories: 1000,
            retention: 604800000, // 7 days
            indexing: true,
          },
        },
        logger: this.logger,
        contextManager,
        tieredStorage,
        toolRegistry,
      });

      this.logger.info('Discord bot integration initialized', {
        conversationalEnabled: conversationalDiscordConfig.enabled,
        mode: conversationalDiscordConfig.mode,
      });
      console.log('[DEBUG-INIT-DISCORD] Integration created successfully, this.discordBotIntegration:', !!this.discordBotIntegration);
    } catch (error) {
      console.log('[DEBUG-INIT-DISCORD] ERROR in initializeDiscordIntegration:', error);
      this.logger.error('Failed to initialize Discord bot integration', error as Error);
    }
  }

  // Update Discord health status
  private updateDiscordHealthStatus(connected: boolean): void {
    // Add custom Discord health check
    this.healthManager.addHealthCheck({
      name: 'discord_client',
      type: 'discord_api' as any,
      check: async () => ({
        status: connected ? 'healthy' as any : 'unhealthy' as any,
        checkType: 'discord_api' as any,
        name: 'discord_client',
        message: connected ? 'Discord client connected' : 'Discord client disconnected',
        timestamp: new Date(),
        details: {
          connected,
          ready: this.isReady,
          guilds: this.client?.guilds?.cache?.size || 0,
          ping: this.client?.ws?.ping || 0
        }
      }),
      options: {
        timeout: 5000,
        critical: true
      }
    });
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    this.logger.info('Starting graceful shutdown...');
    
    try {
      // Stop health server
      await this.healthServer.stop();
      
      // Destroy Discord client
      if (this.client && this.client.isReady()) {
        this.client.destroy();
      }
      
      // Disconnect Redis
      await this.redis.disconnect();
      this.logger.info('Redis connection closed');
      
      // Destroy health manager
      this.healthManager.destroy();
      
      this.logger.info('Graceful shutdown completed');
    } catch (error) {
      this.logger.error('Error during shutdown:', error as Error);
    }
  }

  // Message handling with intent recognition and distributed locking
  private async handleMessage(message: Message): Promise<void> {
    this.logger.info(`[HANDLE] Starting handleMessage for message ${message.id}`);
    
    // CRITICAL FIX: Check if message is already being processed (local deduplication)
    // This prevents duplicate processing within the same bot instance
    if (this.isProcessing.get(message.id)) {
      this.logger.warn(`[DEDUP-LOCAL] Message ${message.id} is already being processed, skipping`);
      return;
    }
    
    if (this.processedMessages.has(message.id)) {
      this.logger.warn(`[DEDUP-LOCAL] Message ${message.id} was already processed, skipping`);
      return;
    }
    
    // Mark message as being processed
    this.isProcessing.set(message.id, true);
    
    try {
      // Use distributed lock to ensure only one instance processes this message
      // Lock key: bot:lock:message:{messageId}
      // TTL: 30 seconds (enough for message processing, auto-releases if something fails)
      const lockKey = `message:${message.id}`;
      const lockAcquired = await this.distributedLock.withLock(
        lockKey,
        async () => {
          // Deduplication: Check if this message has already been processed (using Redis for cross-instance deduplication)
          const dedupKey = `processed:${message.id}`;
          const alreadyProcessed = await this.redis.get(dedupKey);
          
          if (alreadyProcessed) {
            this.logger.warn(`[DEDUP-REDIS] Skipping already processed message: ${message.id}`);
            return;
          }
          
          // Mark message as processed in Redis (with 5 minute TTL)
          await this.redis.set(dedupKey, '1', 300);
          this.logger.info(`[DEDUP-REDIS] Marked message ${message.id} as processed in Redis`);
          
          // Also mark in local set as processed
          this.processedMessages.add(message.id);
          
          // Only log and process if we have lock and message hasn't been processed
          this.logger.info(`[LOCKED] Processing message from ${message.author.username}: ${message.content}`);
          
          this.logger.info(`[CONV] Checking conversational mode (integration exists: ${!!this.discordBotIntegration})`);
          this.logger.info(`[DEBUG] Message content: "${message.content}"`);
          this.logger.info(`[DEBUG] Conversational mode enabled: ${this.discordBotIntegration?.isConversationalMode()}`);
          
          // Check if conversational mode should handle this message
          const shouldUseConv = this.discordBotIntegration && this.discordBotIntegration.shouldUseConversationalMode(message);
          this.logger.info(`[DEBUG] shouldUseConversationalMode result: ${shouldUseConv}`);
          
          // CRITICAL FIX: For commands, always use command handler, not conversational mode
          // This prevents duplicate responses when both modes could process same message
          const isCommand = message.content.startsWith('!');
          if (shouldUseConv && !isCommand) {
            this.logger.info(`[CONV] Using conversational mode for message ${message.id}`);
            // Handle through conversational integration
            this.logger.info(`[CONV] Calling processMessage for message ${message.id}`);
            const response = await this.discordBotIntegration.processMessage(message);
            
            this.logger.info(`[CONV] processMessage returned response: ${response ? 'YES' : 'NO'} (length: ${response?.content?.length || 0})`);
            
            if (response) {
              // Send conversational response with length handling
              const result = await sendLongReply(message, response.content, {
                strategy: 'split',
                addContinuationMarkers: true,
                maxMessages: 10,
                logger: this.logger,
              });
              this.logger.info(`[CONV] Conversational reply sent for message ${message.id} (${result.messageCount} message(s))`);
            }
            this.logger.info(`[CONV] Returning from conversational mode for message ${message.id}`);
            return;
          }
          
          // If it's a command, skip conversational mode entirely
          if (isCommand) {
            this.logger.info(`[CMD-SKIP-CONV] Command message detected, skipping conversational mode`);
          }
          
          // Early exit for non-command messages (backward compatibility)
          if (!message.content.startsWith('!')) {
            this.logger.info(`[CMD] Ignoring non-command message: ${message.content} (message ${message.id})`);
            return;
          }
          
          // Build context, intent, and safety objects for routing
          const context = {
            userId: message.author.id,
            guildId: message.guild?.id,
            channelId: message.channel.id,
            messageId: message.id,
            timestamp: message.createdAt,
          };
          // Minimal intent and safety for channel filtering
          // Use IntentType enum for type
          const intent = { type: IntentType.COMMAND, confidence: 1, entities: [] };
          const safety = { isSafe: true, riskLevel: RiskLevel.LOW, violations: [], confidence: 1, requiresAction: false };
          
          // Check routing decision BEFORE any processing
          const routing = this.messageRouter.routeMessage
            ? await this.messageRouter.routeMessage(message, context, intent, safety)
            : { handler: 'ignore', shouldRespond: false };
          
          // DEBUG: Log routing decision for help command
          this.logger.info(`[DEBUG-ROUTING] Routing decision for message ${message.id}: handler=${routing.handler}, shouldRespond=${routing.shouldRespond}`);
          
          // If routing says to ignore or not respond, exit early
          if (routing.handler === 'ignore' || !routing.shouldRespond) {
            this.logger.debug(`Ignoring message from ${message.author.username} - routing decision: ${routing.handler}`);
            return;
          }
          
          const content = message.content.toLowerCase().trim();
          let intentType: BotIntent;
          if (content.startsWith('!help')) {
            intentType = BotIntent.Help;
          } else if (content.startsWith('!ping')) {
            intentType = BotIntent.Ping;
          } else if (content.startsWith('!status')) {
            intentType = BotIntent.Status;
          } else if (content.startsWith('!health')) {
            intentType = BotIntent.Health;
          } else if (content.startsWith('!config')) {
            intentType = BotIntent.Config;
          } else if (content.startsWith('!self_edit')) {
            intentType = BotIntent.SelfEdit;
          } else if (content.startsWith('!analyze')) {
            intentType = BotIntent.Analyze;
          } else if (content.startsWith('!optimize')) {
            intentType = BotIntent.Optimize;
          } else {
            intentType = BotIntent.Help;
          }
          await this.handleIntent(intentType, message);
        },
        30 // 30 second TTL
      );

      // If lock was not acquired, another instance is handling this message
      if (lockAcquired === null) {
        this.logger.debug(`Skipping message ${message.id} - already being processed by another instance`);
      }
    } finally {
      // Always clear the processing flag, even if an error occurred
      this.isProcessing.delete(message.id);
    }
  }

  // Intent handlers
  private async handleIntent(intent: BotIntent, message: Message): Promise<void> {
    // DEBUG: Log when handleIntent is called
    this.logger.info(`[DEBUG-HANDLE] handleIntent called with intent=${intent} for message ${message.id}`);
    
    try {
      switch (intent) {
        case BotIntent.Help:
          // DEBUG: Log before calling handleHelp
          this.logger.info(`[DEBUG-HANDLE] About to call handleHelp for message ${message.id}`);
          await this.handleHelp(message);
          this.logger.info(`[DEBUG-HANDLE] handleHelp returned for message ${message.id}`);
          break;
        
        case BotIntent.Ping:
          await this.handlePing(message);
          break;
        
        case BotIntent.Status:
          await this.handleStatus(message);
          break;
        
        case BotIntent.Health:
          await this.handleHealth(message);
          break;
        
        case BotIntent.Config:
          await this.handleConfig(message);
          break;
        
        case BotIntent.SelfEdit:
          await this.handleSelfEdit(message);
          break;
        
        case BotIntent.Analyze:
          await this.handleAnalyze(message);
          break;
        
        case BotIntent.Optimize:
          await this.handleOptimize(message);
          break;
        
        default:
          await this.handleDefault(message);
          break;
      }
    } catch (error) {
      this.logger.error(`Error handling command ${intent}:`, error);
      await sendLongReply(message, '❌ An error occurred while processing your command.', { logger: this.logger });
    }
  }

  // Basic command handlers
  private async handleHelp(message: Message): Promise<void> {
    // DEBUG: Log when handleHelp is called
    this.logger.info(`[DEBUG-HELP] handleHelp called for message ${message.id}`);
    
    const response = '🤖 **Self-Editing Discord Bot v1.0.0**\n\n' +
      '**Available Commands:**\n' +
      '• `!help` - Show this help message\n' +
      '• `!ping` - Check bot status\n' +
      '• `!status` - Show bot status\n' +
      '• `!health` - Check bot health status\n' +
      '• `!config` - Configuration management\n' +
      '• `!self_edit` - Self-modification commands\n' +
      '• `!analyze` - Analysis commands\n' +
      '• `!optimize` - Optimization commands\n\n' +
      '\n**Features:**\n' +
      '🧠 Autonomous self-modification with safety constraints\n' +
      '🤖 Advanced conversational AI with context awareness\n' +
      '🔧 Extensible tool framework for custom capabilities\n' +
      '📊 Persistent storage with multi-tier architecture\n' +
      '🛡️ Comprehensive security and privacy protection\n\n' +
      '\n**🚀 Coming Soon:**\n' +
      'We\'re continuously expanding the bot\'s capabilities! Additional commands planned for future releases include:\n\n' +
      '• **Discord Management:** Role, channel, user, message, and webhook management\n' +
      '• **Self-Editing Operations:** Advanced code modification, refactoring, and deployment\n' +
      '• **Memory Management:** Context storage, retrieval, and memory optimization\n' +
      '• **Tool Discovery:** Browse and discover available AI tools and capabilities\n' +
      '• **Plugin Management:** Install, configure, and manage custom plugins\n' +
      '• **Analytics:** Usage statistics, performance metrics, and insights\n\n' +
      'Stay tuned for these and many more enhancements as we evolve the platform!\n\n' +
      '*Use `!help` for detailed command information*';
    
    // DEBUG: Log before sending reply
    this.logger.info(`[DEBUG-HELP] About to send reply for message ${message.id}`);
    const result = await sendLongReply(message, response, { logger: this.logger });
    // DEBUG: Log after sending reply
    this.logger.info(`[DEBUG-HELP] Reply sent for message ${message.id} (${result.messageCount} message(s))`);
  }

  private async handlePing(message: Message): Promise<void> {
    const response = '🏓 Pong! Bot is online and responsive.';
    await sendLongReply(message, response, { logger: this.logger });
  }

  private async handleStatus(message: Message): Promise<void> {
    const guilds = this.client.guilds.cache.size;
    const uptime = Math.round(process.uptime());
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const response = `🟢 **Bot Status:**

🔧 **Connection:** ✅ Online
🌐 **Guilds:** ${guilds}
⏱️ **Uptime:** ${uptime} seconds
💾 **Memory Usage:** ${memUsedMB}MB
🏓 **API Latency:** ${this.client.ws.ping}ms
👤 **Bot User:** ${this.client.user?.tag}`;

    await sendLongReply(message, response, { logger: this.logger });
  }

  private async handleHealth(message: Message): Promise<void> {
    try {
      const health = await this.healthManager.runHealthChecks();
      const status = health.status === 'healthy' ? '🟢' : health.status === 'degraded' ? '🟡' : '🔴';
      const response = `${status} **Health Check Results:**

**Overall Status:** ${health.status}
**Uptime:** ${Math.round(health.uptime / 1000)}s
**Version:** ${health.version}

**Summary:**
• Total Checks: ${health.summary.total}
• ✅ Healthy: ${health.summary.healthy}
• ⚠️ Degraded: ${health.summary.degraded}
• ❌ Unhealthy: ${health.summary.unhealthy}
• 🔴 Critical: ${health.summary.critical}

**Detailed Checks:**
${health.checks.map((check) => {
  const checkStatus = check.status === 'healthy' ? '✅' : check.status === 'degraded' ? '⚠️' : '❌';
  const details = check.details ? JSON.stringify(check.details).substring(0, 80) : '';
  return `• ${checkStatus} ${check.name}: ${check.message || check.status}${details ? ` - ${details}` : ''}`;
}).join('\n')}

Health server available at: http://${this.config.get('HTTP_HOST')}:${this.config.get('HTTP_PORT')}/health`;

      const result = await sendLongReply(message, response, { logger: this.logger });
      this.logger.info(`Health response sent (${result.messageCount} message(s))`);
    } catch (error) {
      this.logger.error('Failed to get health status:', error);
      await sendLongReply(message, '❌ Failed to get health status', { logger: this.logger });
    }
  }

  private async handleConfig(message: Message): Promise<void> {
    // Basic config management (would be expanded with full configuration system)
    const response = '⚙️ **Configuration System:**\n' +
      'Configuration management is under development.\n' +
      'Basic settings available through `!config set <key> <value>`\n' +
      'Full configuration system coming in Phase 2.';

    await sendLongReply(message, response, { logger: this.logger });
  }

  private async handleSelfEdit(message: Message): Promise<void> {
    const response = '🔧 **Self-Modification System:**\n' +
      'Self-modification capabilities are in development.\n' +
      'Basic code analysis and modification will be available in Phase 2.\n' +
      'Current status: Ready for basic optimization requests.\n' +
      '\n*Use `!self_edit help` for available commands*';

    await sendLongReply(message, response, { logger: this.logger });
  }

  private async handleAnalyze(message: Message): Promise<void> {
    const response = '🔍 **Analysis System:**\n' +
      'AI analysis capabilities are in development.\n' +
      'Advanced conversational AI will be available in Phase 3.\n' +
      'Current status: Basic pattern recognition available.\n' +
      '\n*Use `!analyze help` for available analysis options*';

    await sendLongReply(message, response, { logger: this.logger });
  }

  private async handleOptimize(message: Message): Promise<void> {
    const response = '⚡ **Optimization System:**\n' +
      'Performance optimization capabilities are in development.\n' +
      'Advanced optimization features will be available in Phase 3.\n' +
      'Current status: Basic performance monitoring available.\n' +
      '\n*Use `!optimize help` for available optimization options*';

    await sendLongReply(message, response, { logger: this.logger });
  }

  private async handleDefault(message: Message): Promise<void> {
    // Default conversation handler with basic AI integration
    const response = '🤖 Hello! I\'m a self-editing Discord bot with AI-powered capabilities. ' +
      'How can I assist you today?';

    await sendLongReply(message, response, { logger: this.logger });
  }
}

// Bot initialization and startup
async function main() {
  const logger = new UtilsLogger();
  const config = new BotConfig();
  
  const token = config.get('DISCORD_TOKEN');
  console.log('[DEBUG] Main function - Token validation:');
  console.log('[DEBUG] Token from config:', token ? 'EXISTS' : 'MISSING');
  console.log('[DEBUG] Token length:', token?.length || 0);
  
  if (!token) {
    logger.error('DISCORD_TOKEN is required but not set in environment variables');
    console.log('[DEBUG] Available environment variables:', Object.keys(process.env).filter(key => key.includes('DISCORD')));
    process.exit(1);
  }

  // Load conversational configuration
  const conversationalConfig = conversationalConfigManager.getConfiguration();
  console.log('[DEBUG] Conversational config loaded:', {
    enabled: conversationalConfig.enabled,
    mode: conversationalConfig.mode,
    responseChannel: conversationalConfig.responseChannel
  });
  console.log('[DEBUG] DISCORD_CONVERSATIONAL_ENABLED env var:', process.env.DISCORD_CONVERSATIONAL_ENABLED);
  console.log('[DEBUG] Full conversational config object:', JSON.stringify(conversationalConfig, null, 2));

  const bot = new SelfEditingDiscordBot(token, logger, config, conversationalConfig);
  
  try {
    await bot.initialize();
    logger.info('Bot started successfully');
  } catch (error) {
    logger.error('Failed to start bot:', error as Error);
    process.exit(1);
  }

  return bot;
}

// Handle graceful shutdown
let isShuttingDown = false;
let botInstance: SelfEditingDiscordBot | null = null;

async function handleShutdown(signal: string) {
  if (isShuttingDown) {
    console.log(`\nAlready shutting down, ignoring ${signal}...`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  if (botInstance) {
    try {
      await botInstance.shutdown();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }

  process.exit(0);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the bot
main().then(bot => {
  botInstance = bot;
}).catch(error => {
  console.error('Unhandled error during startup:', error);
  process.exit(1);
});
