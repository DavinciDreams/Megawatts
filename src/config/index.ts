// Legacy configuration interface for backward compatibility
export interface BotConfig {
  discordToken: string;
  clientId: string;
  logLevel: 'info' | 'debug' | 'error' | 'warn';
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
    maxConnections: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
  };
  ai: {
    provider: 'openai' | 'anthropic' | 'local';
    openai: {
      apiKey: string;
      model: string;
      maxTokens: number;
      temperature: number;
    };
    anthropic: {
      apiKey: string;
      model: string;
      maxTokens: number;
    };
    local: {
      models: {
        [modelName: string]: {
          path: string;
          type: string;
        }
      };
    };
  };
  storage: {
    vectorDatabase: {
      provider: string;
      apiKey: string;
      environment: string;
      indexName: string;
      dimension: number;
    };
    fileStorage: {
      provider: 's3' | 'local';
      s3: {
        bucket: string;
        region: string;
        accessKeyId: string;
        secretAccessKey: string;
      };
      local: {
        basePath: string;
      };
    };
  };
  security: {
    encryptionKey: string;
    allowedAdmins: string[];
    rateLimiting: {
      requestsPerMinute: number;
      messagesPerMinute: number;
    };
  };
  logging: {
    level: string;
    format: string;
    outputs: string[];
  };
  features: {
    selfEditing: {
      enabled: boolean;
      validationRequired: boolean;
      modificationQuota: {
        perHour: number;
        perDay: number;
      };
    };
  };
}

// Legacy configuration manager for backward compatibility
export class ConfigManager {
  private config: BotConfig;
  private logger: any;

  constructor(logger: any) {
    this.config = new BotConfig();
    this.logger = logger;
  }

  get(key: string): any {
    return this.config[key as keyof BotConfig];
  }

  set(key: string, value: any): void {
    (this.config as any)[key as keyof BotConfig] = value;
    this.logger.info(`Configuration updated: ${key} = ${value}`);
  }

  validate(): boolean {
    // Validate required configuration
    const required = ['discordToken', 'clientId'];
    for (const key of required) {
      if (!this.config[key]) {
        this.logger.error(`Missing required configuration: ${key}`);
        return false;
      }
    }
    
    // Validate configuration values
    if (this.config.discordToken && this.config.discordToken.length < 50) {
      this.logger.error('Discord token must be at least 50 characters');
      return false;
    }
    
    return true;
  }
}

// Basic logger implementation
export class Logger {
  private context: string = 'BOT';

  info(message: string): void {
    console.log(`[${this.context}] INFO: ${message}`);
  }

  error(message: string, error?: Error): void {
    console.error(`[${this.context}] ERROR: ${message}`);
    if (error) {
      console.error(error.stack);
    }
  }

  warn(message: string): void {
    console.warn(`[${this.context}] WARN: ${message}`);
  }
}

// Type definitions
export interface Message {
  id: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
  };
  content: string;
  timestamp: Date;
  embeds?: any[];
}

export enum GatewayIntent {
  Help = 'help',
  Ping = 'ping',
  Status = 'status',
  Config = 'config',
  SelfEdit = 'self_edit',
  Analyze = 'analyze',
  Optimize = 'optimize'
}

export default SelfEditingDiscordBot;