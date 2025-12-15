import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { BotConfig, BotError } from '../types';
import { Logger } from '../utils/logger';

export class DiscordBot {
  private client: Client;
  private config: BotConfig;
  private logger: Logger;
  private isReady = false;

  constructor(config: BotConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    this.client = new Client({
      intents: this.getIntents(),
      partials: {
        user: true,
        guild: true,
        channel: true,
        message: true,
        reaction: true,
        guildMember: true,
        guildScheduledEvent: true,
        guildScheduledEventUser: true,
      },
    });

    this.setupEventHandlers();
  }

  private getIntents(): GatewayIntentBits[] {
    const intentMap: Record<string, GatewayIntentBits> = {
      'Guilds': GatewayIntentBits.Guilds,
      'GuildMembers': GatewayIntentBits.GuildMembers,
      'GuildBans': GatewayIntentBits.GuildBans,
      'GuildEmojis': GatewayIntentBits.GuildEmojis,
      'GuildIntegrations': GatewayIntentBits.GuildIntegrations,
      'GuildWebhooks': GatewayIntentBits.GuildWebhooks,
      'GuildInvites': GatewayIntentBits.GuildInvites,
      'GuildVoiceStates': GatewayIntentBits.GuildVoiceStates,
      'GuildPresences': GatewayIntentBits.GuildPresences,
      'GuildMessages': GatewayIntentBits.GuildMessages,
      'GuildMessageReactions': GatewayIntentBits.GuildMessageReactions,
      'GuildMessageTyping': GatewayIntentBits.GuildMessageTyping,
      'DirectMessages': GatewayIntentBits.DirectMessages,
      'DirectMessageReactions': GatewayIntentBits.DirectMessageReactions,
      'DirectMessageTyping': GatewayIntentBits.DirectMessageTyping,
      'MessageContent': GatewayIntentBits.MessageContent,
    };

    return this.config.intents
      .filter(intent => intentMap[intent])
      .reduce((acc, intent) => acc | intent, 0 as GatewayIntentBits);
  }

  private setupEventHandlers(): void {
    this.client.once('ready', this.handleReady.bind(this));
    this.client.on('messageCreate', this.handleMessage.bind(this));
    this.client.on('error', this.handleError.bind(this));
  }

  private async handleReady(): Promise<void> {
    this.isReady = true;
    this.logger.info(`Bot logged in as ${this.client.user?.tag}`);
    
    // Set bot presence
    if (this.config.presence) {
      await this.client.user?.setPresence(this.config.presence);
    }
  }

  private async handleMessage(message: any): Promise<void> {
    try {
      // Ignore bot messages
      if (message.author.bot) return;

      // Check if message is for this bot
      if (!message.content.startsWith(this.config.prefix)) return;

      this.logger.debug(`Received message from ${message.author.tag}: ${message.content}`);
      
      // Handle commands and self-editing logic will be implemented in separate modules
      // This is just basic message routing
    } catch (error) {
      this.handleError(error as BotError);
    }
  }

  private handleError(error: Error | BotError): void {
    this.logger.error('Bot error occurred:', error);
    
    if (error instanceof BotError) {
      this.logger.error(`Bot Error [${error.code}]: ${error.message}`, {
        context: error.context,
        severity: error.severity,
      });
    } else {
      this.logger.error('Unexpected error:', error);
    }
  }

  public async start(): Promise<void> {
    try {
      this.logger.info('Starting Discord bot...');
      await this.client.login(this.config.token);
    } catch (error) {
      this.handleError(error as BotError);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping Discord bot...');
    this.client.destroy();
    this.isReady = false;
  }

  public getClient(): Client {
    return this.client;
  }

  public isBotReady(): boolean {
    return this.isReady;
  }

  public getConfig(): BotConfig {
    return this.config;
  }
}