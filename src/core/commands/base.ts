import { Logger } from '../../utils/logger';
import { DiscordEvent } from '../../types';

export interface CommandContext {
  message: any;
  guild: any;
  channel: any;
  user: any;
  member: any;
  interaction?: any;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

export abstract class BaseCommand {
  protected logger: Logger;
  protected name: string;
  protected description: string;
  protected category: string;
  protected permissions: string[];
  protected cooldown: number;
  protected enabled: boolean = true;

  constructor(
    logger: Logger,
    name: string,
    description: string,
    category: string = 'general',
    permissions: string[] = [],
    cooldown: number = 0
  ) {
    this.logger = logger;
    this.name = name;
    this.description = description;
    this.category = category;
    this.permissions = permissions;
    this.cooldown = cooldown;
  }

  abstract execute(context: CommandContext): Promise<CommandResult>;

  public getName(): string {
    return this.name;
  }

  public getDescription(): string {
    return this.description;
  }

  public getCategory(): string {
    return this.category;
  }

  public getPermissions(): string[] {
    return this.permissions;
  }

  public getCooldown(): number {
    return this.cooldown;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public hasPermission(permission: string): boolean {
    return this.permissions.includes(permission);
  }

  protected createResult(success: boolean, message?: string, data?: any): CommandResult {
    return {
      success,
      message,
      data,
    };
  }

  protected createError(message: string): CommandResult {
    return {
      success: false,
      error: message,
    };
  }

  protected async checkCooldown(userId: string): Promise<boolean> {
    if (this.cooldown <= 0) return true;
    
    // In a real implementation, this would check a database/cache
    // For now, just return true
    return true;
  }

  protected async checkPermissions(context: CommandContext): Promise<boolean> {
    if (this.permissions.length === 0) return true;
    
    // Check if user has required permissions
    const memberPermissions = context.member?.permissions?.toArray() || [];
    const hasPermission = this.permissions.some(permission => 
      memberPermissions.includes(permission)
    );

    if (!hasPermission) {
      this.logger.warn(`User ${context.user?.tag} lacks required permissions for ${this.name}`);
      return false;
    }

    return true;
  }
}