import { BaseEventHandler } from './base';
import { DiscordEvent } from '../../types';
import { Logger } from '../../utils/logger';

export class GuildCreateEventHandler extends BaseEventHandler {
  constructor(logger: Logger) {
    super(logger);
  }

  async handle(event: DiscordEvent): Promise<void> {
    try {
      const guild = event.data;
      
      this.emitMetrics('guild_create', {
        timestamp: event.timestamp,
        guildId: guild.id,
        guildName: guild.name,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
      });

      this.logger.info(`Joined new guild: ${guild.name} (${guild.id})`);
      
    } catch (error) {
      this.emitError(error as Error, {
        event: 'guildCreate',
        guildId: event.guildId,
      });
    }
  }
}

export class GuildDeleteEventHandler extends BaseEventHandler {
  constructor(logger: Logger) {
    super(logger);
  }

  async handle(event: DiscordEvent): Promise<void> {
    try {
      const guild = event.data;
      
      this.emitMetrics('guild_delete', {
        timestamp: event.timestamp,
        guildId: guild.id,
        guildName: guild.name,
      });

      this.logger.info(`Left guild: ${guild.name} (${guild.id})`);
      
    } catch (error) {
      this.emitError(error as Error, {
        event: 'guildDelete',
        guildId: event.guildId,
      });
    }
  }
}

export class GuildMemberUpdateEventHandler extends BaseEventHandler {
  constructor(logger: Logger) {
    super(logger);
  }

  async handle(event: DiscordEvent): Promise<void> {
    try {
      const member = event.data;
      
      this.emitMetrics('guild_member_update', {
        timestamp: event.timestamp,
        userId: member.user?.id,
        guildId: event.guildId,
        roles: member.roles?.map((role: any) => role.id) || [],
        nickname: member.nickname,
      });

      this.logger.debug(`Guild member updated: ${member.user?.username} in ${event.guildId}`);
      
    } catch (error) {
      this.emitError(error as Error, {
        event: 'guildMemberUpdate',
        userId: event.data?.user?.id,
        guildId: event.guildId,
      });
    }
  }
}