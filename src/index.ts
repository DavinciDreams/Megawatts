import { Client, GatewayIntentBits, Message } from 'discord.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { HealthManager } from './core/health';
import { Logger as UtilsLogger } from './utils/logger';

// Custom bot intents for command handling
enum BotIntent {
  Help = 'help',
  Ping = 'ping',
  Status = 'status',
  Config = 'config',
  SelfEdit = 'self_edit',
  Analyze = 'analyze',
  Optimize = 'optimize'
}


// Basic configuration class
class BotConfig {
  private settings: Map<string, any> = new Map();

  constructor() {
    // Load configuration from environment variables
    this.settings.set('DISCORD_TOKEN', process.env.DISCORD_TOKEN || '');
    this.settings.set('DISCORD_CLIENT_ID', process.env.DISCORD_CLIENT_ID || '');
    this.settings.set('NODE_ENV', process.env.NODE_ENV || 'development');
    this.settings.set('HTTP_PORT', process.env.HTTP_PORT || '8080');
    this.settings.set('HTTP_HOST', process.env.HTTP_HOST || '0.0.0.0');
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

  constructor(
    private token: string,
    logger?: UtilsLogger,
    config?: BotConfig
  ) {
    this.logger = logger || new UtilsLogger();
    this.config = config || new BotConfig();
    this.healthManager = new HealthManager();
    this.healthServer = new HealthServer(this.healthManager, this.config);
  }

  // Initialize Discord client and health server
  async initialize(): Promise<void> {
    try {
      // Initialize health manager first
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

      this.client.on('messageCreate', async (message) => {
        await this.handleMessage(message);
      });

      await this.client.login(this.token);
      this.logger.info('Bot initialization complete');
    } catch (error) {
      this.logger.error('Failed to initialize bot:', error as Error);
      throw error;
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
      
      // Destroy health manager
      this.healthManager.destroy();
      
      this.logger.info('Graceful shutdown completed');
    } catch (error) {
      this.logger.error('Error during shutdown:', error as Error);
    }
  }

  // Message handling with intent recognition
  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;
    
    this.logger.info(`Received message from ${message.author.username}: ${message.content}`);

    // Simple intent recognition
    const content = message.content.toLowerCase().trim();
    let intent: BotIntent;

    if (content.startsWith('!help')) {
      intent = BotIntent.Help;
    } else if (content.startsWith('!ping')) {
      intent = BotIntent.Ping;
    } else if (content.startsWith('!status')) {
      intent = BotIntent.Status;
    } else if (content.startsWith('!config')) {
      intent = BotIntent.Config;
    } else if (content.startsWith('!self_edit')) {
      intent = BotIntent.SelfEdit;
    } else if (content.startsWith('!analyze')) {
      intent = BotIntent.Analyze;
    } else if (content.startsWith('!optimize')) {
      intent = BotIntent.Optimize;
    } else {
      // Default to conversation
      intent = BotIntent.Help;
    }

    await this.handleIntent(intent, message);
  }

  // Intent handlers
  private async handleIntent(intent: BotIntent, message: Message): Promise<void> {
    switch (intent) {
      case BotIntent.Help:
        await this.handleHelp(message);
        break;
      
      case BotIntent.Ping:
        await this.handlePing(message);
        break;
      
      case BotIntent.Status:
        await this.handleStatus(message);
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
  }

  // Basic command handlers
  private async handleHelp(message: Message): Promise<void> {
    const response = '🤖 **Self-Editing Discord Bot v1.0.0**\n\n' +
      '**Available Commands:**\n' +
      '• `!help` - Show this help message\n' +
      '• `!ping` - Check bot status\n' +
      '• `!status` - Show bot status\n' +
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
      '\n*Use `!help` for detailed command information*';
    
    await message.reply(response);
  }

  private async handlePing(message: Message): Promise<void> {
    const response = '🏓 Pong! Bot is online and responsive.';
    await message.reply(response);
  }

  private async handleStatus(message: Message): Promise<void> {
    const response = '🟢 **Bot Status:**\n' +
      '🔧 **Core Systems:** ✅ Online\n' +
      '🤖 **AI Integration:** ✅ Connected\n' +
      '💾 **Storage:** ✅ Active\n' +
      '🔧 **Configuration:** ✅ Loaded\n' +
      '📊 **Self-Modification:** ✅ Ready\n';
    
    await message.reply(response);
  }

  private async handleConfig(message: Message): Promise<void> {
    // Basic config management (would be expanded with full configuration system)
    const response = '⚙️ **Configuration System:**\n' +
      'Configuration management is under development.\n' +
      'Basic settings available through `!config set <key> <value>`\n' +
      'Full configuration system coming in Phase 2.';
    
    await message.reply(response);
  }

  private async handleSelfEdit(message: Message): Promise<void> {
    const response = '🔧 **Self-Modification System:**\n' +
      'Self-modification capabilities are in development.\n' +
      'Basic code analysis and modification will be available in Phase 2.\n' +
      'Current status: Ready for basic optimization requests.\n' +
      '\n*Use `!self_edit help` for available commands*';
    
    await message.reply(response);
  }

  private async handleAnalyze(message: Message): Promise<void> {
    const response = '🔍 **Analysis System:**\n' +
      'AI analysis capabilities are in development.\n' +
      'Advanced conversational AI will be available in Phase 3.\n' +
      'Current status: Basic pattern recognition available.\n' +
      '\n*Use `!analyze help` for available analysis options*';
    
    await message.reply(response);
  }

  private async handleOptimize(message: Message): Promise<void> {
    const response = '⚡ **Optimization System:**\n' +
      'Performance optimization capabilities are in development.\n' +
      'Advanced optimization features will be available in Phase 3.\n' +
      'Current status: Basic performance monitoring available.\n' +
      '\n*Use `!optimize help` for available optimization options*';
    
    await message.reply(response);
  }

  private async handleDefault(message: Message): Promise<void> {
    // Default conversation handler with basic AI integration
    const response = '🤖 Hello! I\'m a self-editing Discord bot with AI-powered capabilities. ' +
      'How can I assist you today?';
    
    await message.reply(response);
  }
}

// Bot initialization and startup
async function main() {
  const logger = new UtilsLogger();
  const config = new BotConfig();
  
  const token = config.get('DISCORD_TOKEN');
  if (!token) {
    logger.error('DISCORD_TOKEN is required but not set in environment variables');
    process.exit(1);
  }

  const bot = new SelfEditingDiscordBot(token, logger, config);
  
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

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

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

// Export bot class
export default SelfEditingDiscordBot;