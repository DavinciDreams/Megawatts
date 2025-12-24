import { Client, GatewayIntentBits, Message } from 'discord.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { MessageRouter } from './core/processing/messageRouter.js';
import { DEFAULT_PIPELINE_CONFIG } from './core/processing/types.js';

// Load environment variables
dotenv.config();

// Simple logger class
class SimpleLogger {
  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
  }
  
  error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
  }
  
  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
  }
}

// Basic health check service
class SimpleHealthService {
  private checks: Map<string, () => Promise<any>> = new Map();
  private startTime: number = Date.now();

  addCheck(name: string, checkFn: () => Promise<any>): void {
    this.checks.set(name, checkFn);
  }

  async runAllChecks(): Promise<any> {
    const results: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      checks: {}
    };

    for (const [name, checkFn] of this.checks) {
      try {
        const result = await checkFn();
        results.checks[name] = { status: 'healthy', ...result };
      } catch (error) {
        results.checks[name] = { status: 'unhealthy', error: (error as Error).message };
        results.status = 'unhealthy';
      }
    }

    return results;
  }
}

// Simple HTTP server for health endpoints
class HealthServer {
  private app: express.Application;
  private server: any;
  private logger: SimpleLogger;
  private healthService: SimpleHealthService;
  private port: number;

  constructor(healthService: SimpleHealthService, port: number = 8080) {
    this.app = express();
    this.healthService = healthService;
    this.logger = new SimpleLogger();
    this.port = port;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json());
    
    this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    this.app.get('/', (req: express.Request, res: express.Response) => {
      res.json({
        name: 'Minimal Discord Bot',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/health', async (req: express.Request, res: express.Response) => {
      try {
        const health = await this.healthService.runAllChecks();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          error: (error as Error).message,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.use('*', (req: express.Request, res: express.Response) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, '0.0.0.0', () => {
          this.logger.info(`Health server started on port ${this.port}`);
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

// Minimal Discord Bot class
class MinimalDiscordBot {
  private client: Client;
  private logger: SimpleLogger;
  private healthService: SimpleHealthService;
  private healthServer: HealthServer;
  private token: string;
  private messageRouter: MessageRouter;

  constructor(token: string) {
    this.token = token;
    this.logger = new SimpleLogger();
    this.healthService = new SimpleHealthService();
    this.healthServer = new HealthServer(this.healthService);
    this.messageRouter = new MessageRouter(DEFAULT_PIPELINE_CONFIG);
    
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.setupEventHandlers();
    this.setupHealthChecks();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      this.logger.info(`Bot logged in as ${this.client.user?.tag}!`);
      this.logger.info(`Bot is in ${this.client.guilds.cache.size} guilds`);
    });

    this.client.on('messageCreate', async (message: Message) => {
      await this.handleMessage(message);
    });

    this.client.on('error', (error) => {
      this.logger.error('Discord client error:', error);
    });

    this.client.on('disconnect', () => {
      this.logger.warn('Discord client disconnected');
    });

    this.client.on('reconnecting', () => {
      this.logger.info('Discord client reconnecting');
    });
  }

  private setupHealthChecks(): void {
    this.healthService.addCheck('discord', async () => {
      return {
        connected: this.client.isReady(),
        guilds: this.client.guilds.cache.size,
        ping: this.client.ws.ping,
        user: this.client.user?.tag
      };
    });

    this.healthService.addCheck('memory', async () => {
      const memUsage = process.memoryUsage();
      return {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
      };
    });

    this.healthService.addCheck('uptime', async () => {
      return {
        uptime: `${Math.round(process.uptime())}s`
      };
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    // Build context, intent, and safety objects for routing
    const context = {
      userId: message.author.id,
      guildId: message.guild?.id,
      channelId: message.channel.id,
      messageId: message.id,
      timestamp: message.createdAt,
    };
    // Minimal intent and safety for channel filtering
    const intent = { type: 'help', confidence: 1, entities: [] };
    const safety = { isSafe: true, riskLevel: 'low', violations: [], confidence: 1, requiresAction: false };
    const routing = this.messageRouter.routeMessage
      ? await this.messageRouter.routeMessage(message, context, intent, safety)
      : { handler: 'ignore', shouldRespond: false };
    if (routing.handler === 'ignore' || !routing.shouldRespond) {
      return;
    }
    // ...existing code...
    this.logger.info(`Received message from ${message.author.username}: ${message.content}`);
    const content = message.content.toLowerCase().trim();
    try {
      if (content === '!help' || content === '!commands') {
        await this.handleHelp(message);
      } else if (content === '!ping') {
        await this.handlePing(message);
      } else if (content === '!status') {
        await this.handleStatus(message);
      } else if (content === '!health') {
        await this.handleHealth(message);
      } else if (content.startsWith('!')) {
        await this.handleUnknownCommand(message);
      }
    } catch (error) {
      this.logger.error('Error handling message:', error);
      await message.reply('❌ Sorry, I encountered an error while processing your command.');
    }
  }

  private async handleHelp(message: Message): Promise<void> {
    const response = `🤖 **Minimal Discord Bot Commands:**

• \`!help\` - Show this help message
• \`!ping\` - Check if the bot is responsive
• \`!status\` - Show bot status and information
• \`!health\` - Check bot health status

**Health Server:**
• Health endpoints available at http://localhost:8080/health
• Basic status at http://localhost:8080/

This is a minimal version of the self-editing Discord bot with basic functionality.`;

    await message.reply(response);
  }

  private async handlePing(message: Message): Promise<void> {
    const response = `🏓 Pong! Discord API latency: ${this.client.ws.ping}ms`;
    await message.reply(response);
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

    await message.reply(response);
  }

  private async handleHealth(message: Message): Promise<void> {
    try {
      const health = await this.healthService.runAllChecks();
      const status = health.status === 'healthy' ? '🟢' : '🔴';
      
      const response = `${status} **Health Check Results:**

**Overall Status:** ${health.status}
**Uptime:** ${Math.round(health.uptime / 1000)}s

**Detailed Checks:**
${Object.entries(health.checks).map(([name, check]: [string, any]) => {
  const checkStatus = check.status === 'healthy' ? '✅' : '❌';
  return `• ${checkStatus} ${name}: ${JSON.stringify(check).substring(0, 100)}...`;
}).join('\n')}

Health server available at: http://localhost:8080/health`;

      await message.reply(response);
    } catch (error) {
      await message.reply('❌ Failed to get health status');
    }
  }

  private async handleUnknownCommand(message: Message): Promise<void> {
    await message.reply('❓ Unknown command. Use `!help` to see available commands.');
  }

  async start(): Promise<void> {
    try {
      // Start health server first
      await this.healthServer.start();
      
      // Login to Discord
      await this.client.login(this.token);
      
      this.logger.info('Minimal Discord Bot started successfully');
    } catch (error) {
      this.logger.error('Failed to start bot:', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Shutting down bot...');
    
    try {
      await this.healthServer.stop();
      
      if (this.client.isReady()) {
        this.client.destroy();
      }
      
      this.logger.info('Bot shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown:', error as Error);
    }
  }
}

// Main function
async function main() {
  const token = process.env.DISCORD_TOKEN;
  
  if (!token) {
    console.error('ERROR: DISCORD_TOKEN environment variable is required');
    process.exit(1);
  }

  const bot = new MinimalDiscordBot(token);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  try {
    await bot.start();
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
main();

export { MinimalDiscordBot };