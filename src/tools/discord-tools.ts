/**
 * Discord Tools
 *
 * This module implements comprehensive Discord-specific tools for role management,
 * channel operations, user management, message handling, server administration,
 * and webhook management.
 */

import {
  Tool,
  ToolParameter,
  ParameterType,
  ToolCategory,
  ToolSafety,
  ToolMetadata,
  ToolExample
} from '../types/ai';
import { Logger } from '../utils/logger';
import { BotError } from '../utils/errors';
import {
  Client,
  Guild,
  Role,
  Channel,
  User,
  GuildMember,
  Message,
  Webhook,
  PermissionFlagsBits,
  ChannelType,
  APIEmbed,
  APIEmbedField
} from 'discord.js';

// ============================================================================
// DISCORD ROLE MANAGEMENT TOOLS
// ============================================================================

/**
 * Create a new Discord role
 */
export const createRoleTool: Tool = {
  name: 'create_role',
  description: 'Create a new Discord role with specified permissions and settings',
  category: 'discord',
  permissions: ['manage_roles'],
  safety: {
    level: 'restricted',
    permissions: ['manage_roles'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 10,
      tokensPerMinute: 1000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild where the role will be created'
    },
    {
      name: 'name',
      type: 'string',
      required: true,
      description: 'The name of the role to create',
      validation: {
        minLength: 1,
        maxLength: 100
      }
    },
    {
      name: 'description',
      type: 'string',
      required: false,
      description: 'The description for the role',
      validation: {
        maxLength: 500
      }
    },
    {
      name: 'color',
      type: 'string',
      required: false,
      description: 'The color for the role (hex format, e.g., #FF0000)',
      validation: {
        pattern: '^#[0-9A-Fa-f]{6}$'
      }
    },
    {
      name: 'permissions',
      type: 'array',
      required: true,
      description: 'Array of permission strings for the role (e.g., SEND_MESSAGES, KICK_MEMBERS)',
      validation: {
        minLength: 1
      }
    },
    {
      name: 'hoist',
      type: 'boolean',
      required: false,
      description: 'Whether the role should be displayed separately from online members'
    },
    {
      name: 'mentionable',
      type: 'boolean',
      required: false,
      description: 'Whether the role can be mentioned by anyone'
    },
    {
      name: 'position',
      type: 'number',
      required: false,
      description: 'The position of the role in the role hierarchy',
      validation: {
        min: 0,
        max: 250
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'roles', 'moderation', 'management'],
    examples: [
      {
        description: 'Create a moderator role',
        parameters: {
          guild_id: '123456789012345678',
          name: 'Moderator',
          description: 'Server moderation team',
          color: '#00FF00',
          permissions: ['KICK_MEMBERS', 'BAN_MEMBERS', 'MANAGE_MESSAGES', 'MUTE_MEMBERS'],
          hoist: true,
          mentionable: true
        }
      }
    ]
  }
};

/**
 * Update an existing Discord role
 */
export const updateRoleTool: Tool = {
  name: 'update_role',
  description: 'Update an existing Discord role with new settings',
  category: 'discord',
  permissions: ['manage_roles'],
  safety: {
    level: 'restricted',
    permissions: ['manage_roles'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 15,
      tokensPerMinute: 1500
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'role_id',
      type: 'string',
      required: true,
      description: 'The ID of the role to update'
    },
    {
      name: 'name',
      type: 'string',
      required: false,
      description: 'The new name for the role',
      validation: {
        minLength: 1,
        maxLength: 100
      }
    },
    {
      name: 'description',
      type: 'string',
      required: false,
      description: 'The new description for the role',
      validation: {
        maxLength: 500
      }
    },
    {
      name: 'color',
      type: 'string',
      required: false,
      description: 'The new color for the role (hex format)',
      validation: {
        pattern: '^#[0-9A-Fa-f]{6}$'
      }
    },
    {
      name: 'permissions',
      type: 'array',
      required: false,
      description: 'Array of permission strings for the role'
    },
    {
      name: 'hoist',
      type: 'boolean',
      required: false,
      description: 'Whether the role should be displayed separately'
    },
    {
      name: 'mentionable',
      type: 'boolean',
      required: false,
      description: 'Whether the role can be mentioned'
    },
    {
      name: 'position',
      type: 'number',
      required: false,
      description: 'The new position of the role in the hierarchy',
      validation: {
        min: 0,
        max: 250
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'roles', 'moderation', 'management'],
    examples: [
      {
        description: 'Update role color and permissions',
        parameters: {
          guild_id: '123456789012345678',
          role_id: '987654321098765432',
          color: '#FF0000',
          permissions: ['SEND_MESSAGES', 'EMBED_LINKS']
        }
      }
    ]
  }
};

/**
 * Delete a Discord role
 */
export const deleteRoleTool: Tool = {
  name: 'delete_role',
  description: 'Delete a Discord role from a guild',
  category: 'discord',
  permissions: ['manage_roles'],
  safety: {
    level: 'dangerous',
    permissions: ['manage_roles'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 5,
      tokensPerMinute: 500
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'role_id',
      type: 'string',
      required: true,
      description: 'The ID of the role to delete'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for deleting the role',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'roles', 'moderation', 'dangerous'],
    examples: [
      {
        description: 'Delete a role',
        parameters: {
          guild_id: '123456789012345678',
          role_id: '987654321098765432',
          reason: 'Role no longer needed'
        }
      }
    ]
  }
};

/**
 * Assign a role to a user
 */
export const assignRoleTool: Tool = {
  name: 'assign_role',
  description: 'Assign a role to a user in a guild',
  category: 'discord',
  permissions: ['manage_roles'],
  safety: {
    level: 'restricted',
    permissions: ['manage_roles'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 20,
      tokensPerMinute: 2000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'user_id',
      type: 'string',
      required: true,
      description: 'The ID of the user to assign the role to'
    },
    {
      name: 'role_id',
      type: 'string',
      required: true,
      description: 'The ID of the role to assign'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for assigning the role',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'roles', 'user-management'],
    examples: [
      {
        description: 'Assign VIP role to a user',
        parameters: {
          guild_id: '123456789012345678',
          user_id: '987654321098765432',
          role_id: '111222333444555666',
          reason: 'User reached VIP status'
        }
      }
    ]
  }
};

/**
 * Remove a role from a user
 */
export const removeRoleTool: Tool = {
  name: 'remove_role',
  description: 'Remove a role from a user in a guild',
  category: 'discord',
  permissions: ['manage_roles'],
  safety: {
    level: 'restricted',
    permissions: ['manage_roles'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 20,
      tokensPerMinute: 2000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'user_id',
      type: 'string',
      required: true,
      description: 'The ID of the user to remove the role from'
    },
    {
      name: 'role_id',
      type: 'string',
      required: true,
      description: 'The ID of the role to remove'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for removing the role',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'roles', 'user-management'],
    examples: [
      {
        description: 'Remove muted role from a user',
        parameters: {
          guild_id: '123456789012345678',
          user_id: '987654321098765432',
          role_id: '111222333444555666',
          reason: 'Mute period ended'
        }
      }
    ]
  }
};

// ============================================================================
// DISCORD CHANNEL MANAGEMENT TOOLS
// ============================================================================

/**
 * Create a new Discord channel
 */
export const createChannelTool: Tool = {
  name: 'create_channel',
  description: 'Create a new Discord channel with specified settings',
  category: 'discord',
  permissions: ['manage_channels'],
  safety: {
    level: 'restricted',
    permissions: ['manage_channels'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 10,
      tokensPerMinute: 1000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild where the channel will be created'
    },
    {
      name: 'name',
      type: 'string',
      required: true,
      description: 'The name of the channel to create',
      validation: {
        minLength: 1,
        maxLength: 100
      }
    },
    {
      name: 'type',
      type: 'string',
      required: true,
      description: 'The type of channel to create',
      validation: {
        enum: ['text', 'voice', 'category', 'news', 'store', 'stage']
      }
    },
    {
      name: 'topic',
      type: 'string',
      required: false,
      description: 'The topic for the channel (text channels only)',
      validation: {
        maxLength: 1024
      }
    },
    {
      name: 'nsfw',
      type: 'boolean',
      required: false,
      description: 'Whether the channel should be marked as NSFW'
    },
    {
      name: 'parent_id',
      type: 'string',
      required: false,
      description: 'The parent category ID for organization'
    },
    {
      name: 'position',
      type: 'number',
      required: false,
      description: 'The position of the channel in the list',
      validation: {
        min: 0,
        max: 50
      }
    },
    {
      name: 'permission_overwrites',
      type: 'array',
      required: false,
      description: 'Array of permission overwrites for the channel'
    },
    {
      name: 'rate_limit_per_user',
      type: 'number',
      required: false,
      description: 'Rate limit per user (0-120)',
      validation: {
        min: 0,
        max: 120
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'channels', 'management'],
    examples: [
      {
        description: 'Create a general discussion channel',
        parameters: {
          guild_id: '123456789012345678',
          name: 'general-chat',
          type: 'text',
          topic: 'General discussion and chat',
          nsfw: false,
          rate_limit_per_user: 5
        }
      }
    ]
  }
};

/**
 * Update an existing Discord channel
 */
export const updateChannelTool: Tool = {
  name: 'update_channel',
  description: 'Update an existing Discord channel with new settings',
  category: 'discord',
  permissions: ['manage_channels'],
  safety: {
    level: 'restricted',
    permissions: ['manage_channels'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 15,
      tokensPerMinute: 1500
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel to update'
    },
    {
      name: 'name',
      type: 'string',
      required: false,
      description: 'The new name for the channel',
      validation: {
        minLength: 1,
        maxLength: 100
      }
    },
    {
      name: 'topic',
      type: 'string',
      required: false,
      description: 'The new topic for the channel',
      validation: {
        maxLength: 1024
      }
    },
    {
      name: 'nsfw',
      type: 'boolean',
      required: false,
      description: 'Whether the channel should be marked as NSFW'
    },
    {
      name: 'position',
      type: 'number',
      required: false,
      description: 'The new position of the channel',
      validation: {
        min: 0,
        max: 50
      }
    },
    {
      name: 'rate_limit_per_user',
      type: 'number',
      required: false,
      description: 'New rate limit per user (0-120)',
      validation: {
        min: 0,
        max: 120
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'channels', 'management'],
    examples: [
      {
        description: 'Update channel topic',
        parameters: {
          channel_id: '123456789012345678',
          topic: 'Updated channel topic description'
        }
      }
    ]
  }
};

/**
 * Delete a Discord channel
 */
export const deleteChannelTool: Tool = {
  name: 'delete_channel',
  description: 'Delete a Discord channel from a guild',
  category: 'discord',
  permissions: ['manage_channels'],
  safety: {
    level: 'dangerous',
    permissions: ['manage_channels'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 5,
      tokensPerMinute: 500
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel to delete'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for deleting the channel',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'channels', 'dangerous'],
    examples: [
      {
        description: 'Delete a channel',
        parameters: {
          channel_id: '123456789012345678',
          reason: 'Channel no longer needed'
        }
      }
    ]
  }
};

/**
 * Get information about a Discord channel
 */
export const getChannelInfoTool: Tool = {
  name: 'get_channel_info',
  description: 'Get detailed information about a Discord channel',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'safe',
    permissions: [],
    monitoring: false,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 6000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of channel to get info for'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'channels', 'information', 'safe'],
    examples: [
      {
        description: 'Get channel information',
        parameters: {
          channel_id: '123456789012345678'
        }
      }
    ]
  }
};

// ============================================================================
// DISCORD USER MANAGEMENT TOOLS
// ============================================================================

/**
 * Kick a user from a guild
 */
export const kickUserTool: Tool = {
  name: 'kick_user',
  description: 'Kick a user from a Discord guild',
  category: 'discord',
  permissions: ['kick_members'],
  safety: {
    level: 'dangerous',
    permissions: ['kick_members'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 5,
      tokensPerMinute: 500
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'user_id',
      type: 'string',
      required: true,
      description: 'The ID of the user to kick'
    },
    {
      name: 'reason',
      type: 'string',
      required: true,
      description: 'The reason for kicking the user',
      validation: {
        minLength: 1,
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'moderation', 'dangerous'],
    examples: [
      {
        description: 'Kick a user for spamming',
        parameters: {
          guild_id: '123456789012345678',
          user_id: '987654321098765432',
          reason: 'Repeated spamming in multiple channels'
        }
      }
    ]
  }
};

/**
 * Ban a user from a guild
 */
export const banUserTool: Tool = {
  name: 'ban_user',
  description: 'Ban a user from a Discord guild',
  category: 'discord',
  permissions: ['ban_members'],
  safety: {
    level: 'dangerous',
    permissions: ['ban_members'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 3,
      tokensPerMinute: 300
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'user_id',
      type: 'string',
      required: true,
      description: 'The ID of the user to ban'
    },
    {
      name: 'reason',
      type: 'string',
      required: true,
      description: 'The reason for banning the user',
      validation: {
        minLength: 1,
        maxLength: 500
      }
    },
    {
      name: 'delete_message_days',
      type: 'number',
      required: false,
      description: 'Number of days of messages to delete (0-7)',
      validation: {
        min: 0,
        max: 7
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'moderation', 'dangerous'],
    examples: [
      {
        description: 'Ban a user for harassment',
        parameters: {
          guild_id: '123456789012345678',
          user_id: '987654321098765432',
          reason: 'Harassment of other members',
          delete_message_days: 1
        }
      }
    ]
  }
};

/**
 * Timeout a user in a guild
 */
export const timeoutUserTool: Tool = {
  name: 'timeout_user',
  description: 'Timeout a user in a Discord guild for a specified duration',
  category: 'discord',
  permissions: ['moderate_members'],
  safety: {
    level: 'dangerous',
    permissions: ['moderate_members'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 10,
      tokensPerMinute: 1000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'user_id',
      type: 'string',
      required: true,
      description: 'The ID of the user to timeout'
    },
    {
      name: 'duration_minutes',
      type: 'number',
      required: true,
      description: 'Duration of timeout in minutes (1-40320, max 28 days)',
      validation: {
        min: 1,
        max: 40320
      }
    },
    {
      name: 'reason',
      type: 'string',
      required: true,
      description: 'The reason for the timeout',
      validation: {
        minLength: 1,
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'moderation', 'dangerous'],
    examples: [
      {
        description: 'Timeout a user for 1 hour',
        parameters: {
          guild_id: '123456789012345678',
          user_id: '987654321098765432',
          duration_minutes: 60,
          reason: 'Spamming in general chat'
        }
      }
    ]
  }
};

/**
 * Remove timeout from a user
 */
export const removeTimeoutTool: Tool = {
  name: 'remove_timeout',
  description: 'Remove timeout from a user in a Discord guild',
  category: 'discord',
  permissions: ['moderate_members'],
  safety: {
    level: 'restricted',
    permissions: ['moderate_members'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 20,
      tokensPerMinute: 2000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'user_id',
      type: 'string',
      required: true,
      description: 'The ID of the user to remove timeout from'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for removing the timeout',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'moderation'],
    examples: [
      {
        description: 'Remove timeout from user',
        parameters: {
          guild_id: '123456789012345678',
          user_id: '987654321098765432',
          reason: 'Timeout period ended'
        }
      }
    ]
  }
};

/**
 * Get information about a Discord user
 */
export const getUserInfoTool: Tool = {
  name: 'get_user_info',
  description: 'Get detailed information about a Discord user',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'safe',
    permissions: [],
    monitoring: false,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 6000
    }
  },
  parameters: [
    {
      name: 'user_id',
      type: 'string',
      required: true,
      description: 'The ID of user to get info for'
    },
    {
      name: 'guild_id',
      type: 'string',
      required: false,
      description: 'The ID of the guild (optional, for guild-specific info)'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'user', 'information', 'safe'],
    examples: [
      {
        description: 'Get user profile information',
        parameters: {
          user_id: '987654321098765432',
          guild_id: '123456789012345678'
        }
      }
    ]
  }
};

// ============================================================================
// DISCORD MESSAGE MANAGEMENT TOOLS
// ============================================================================

/**
 * Send a message to a Discord channel
 */
export const sendMessageTool: Tool = {
  name: 'send_message',
  description: 'Send a message to a Discord channel',
  category: 'discord',
  permissions: ['send_messages'],
  safety: {
    level: 'restricted',
    permissions: ['send_messages'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 50,
      tokensPerMinute: 5000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel to send the message to'
    },
    {
      name: 'content',
      type: 'string',
      required: true,
      description: 'The content of the message to send',
      validation: {
        minLength: 1,
        maxLength: 2000
      }
    },
    {
      name: 'embed',
      type: 'object',
      required: false,
      description: 'Embed object for rich content formatting'
    },
    {
      name: 'tts',
      type: 'boolean',
      required: false,
      description: 'Whether to use text-to-speech'
    },
    {
      name: 'reply_to',
      type: 'string',
      required: false,
      description: 'The message ID to reply to'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'messaging', 'communication'],
    examples: [
      {
        description: 'Send a welcome message',
        parameters: {
          channel_id: '123456789012345678',
          content: 'Welcome to the server! Please read our rules.',
          embed: {
            title: 'Welcome!',
            color: '#00FF00',
            description: 'Make sure to read our community guidelines.'
          }
        }
      }
    ]
  }
};

/**
 * Edit a previously sent message
 */
export const editMessageTool: Tool = {
  name: 'edit_message',
  description: 'Edit a previously sent Discord message',
  category: 'discord',
  permissions: ['manage_messages'],
  safety: {
    level: 'restricted',
    permissions: ['manage_messages'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 30,
      tokensPerMinute: 3000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel containing the message'
    },
    {
      name: 'message_id',
      type: 'string',
      required: true,
      description: 'The ID of the message to edit'
    },
    {
      name: 'content',
      type: 'string',
      required: true,
      description: 'The new content for the message',
      validation: {
        minLength: 1,
        maxLength: 2000
      }
    },
    {
      name: 'embed',
      type: 'object',
      required: false,
      description: 'New embed object for rich content'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'messaging', 'management'],
    examples: [
      {
        description: 'Edit a message',
        parameters: {
          channel_id: '123456789012345678',
          message_id: '987654321098765432',
          content: 'Updated message content'
        }
      }
    ]
  }
};

/**
 * Delete a Discord message
 */
export const deleteMessageTool: Tool = {
  name: 'delete_message',
  description: 'Delete a Discord message',
  category: 'discord',
  permissions: ['manage_messages'],
  safety: {
    level: 'dangerous',
    permissions: ['manage_messages'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 30,
      tokensPerMinute: 3000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel containing the message'
    },
    {
      name: 'message_id',
      type: 'string',
      required: true,
      description: 'The ID of the message to delete'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for deleting the message',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'messaging', 'dangerous'],
    examples: [
      {
        description: 'Delete a message',
        parameters: {
          channel_id: '123456789012345678',
          message_id: '987654321098765432',
          reason: 'Inappropriate content'
        }
      }
    ]
  }
};

/**
 * Get a Discord message
 */
export const getMessageTool: Tool = {
  name: 'get_message',
  description: 'Get a Discord message by ID',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'safe',
    permissions: [],
    monitoring: false,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 6000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel containing the message'
    },
    {
      name: 'message_id',
      type: 'string',
      required: true,
      description: 'The ID of the message to get'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'messaging', 'information', 'safe'],
    examples: [
      {
        description: 'Get a message',
        parameters: {
          channel_id: '123456789012345678',
          message_id: '987654321098765432'
        }
      }
    ]
  }
};

/**
 * Pin a message in a channel
 */
export const pinMessageTool: Tool = {
  name: 'pin_message',
  description: 'Pin a message in a Discord channel',
  category: 'discord',
  permissions: ['manage_messages'],
  safety: {
    level: 'restricted',
    permissions: ['manage_messages'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 20,
      tokensPerMinute: 2000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel'
    },
    {
      name: 'message_id',
      type: 'string',
      required: true,
      description: 'The ID of the message to pin'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'messaging', 'management'],
    examples: [
      {
        description: 'Pin an important announcement',
        parameters: {
          channel_id: '123456789012345678',
          message_id: '987654321098765432'
        }
      }
    ]
  }
};

/**
 * Unpin a message from a channel
 */
export const unpinMessageTool: Tool = {
  name: 'unpin_message',
  description: 'Unpin a message from a Discord channel',
  category: 'discord',
  permissions: ['manage_messages'],
  safety: {
    level: 'restricted',
    permissions: ['manage_messages'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 20,
      tokensPerMinute: 2000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel'
    },
    {
      name: 'message_id',
      type: 'string',
      required: true,
      description: 'The ID of the message to unpin'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'messaging', 'management'],
    examples: [
      {
        description: 'Unpin a message',
        parameters: {
          channel_id: '123456789012345678',
          message_id: '987654321098765432'
        }
      }
    ]
  }
};

// ============================================================================
// DISCORD SERVER MANAGEMENT TOOLS
// ============================================================================

/**
 * Get information about a Discord server (guild)
 */
export const getServerInfoTool: Tool = {
  name: 'get_server_info',
  description: 'Get detailed information about a Discord server',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'safe',
    permissions: [],
    monitoring: false,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 6000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild to get info for'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'server', 'information', 'safe'],
    examples: [
      {
        description: 'Get server information',
        parameters: {
          guild_id: '123456789012345678'
        }
      }
    ]
  }
};

/**
 * Get members of a Discord server
 */
export const getServerMembersTool: Tool = {
  name: 'get_server_members',
  description: 'Get list of members in a Discord server',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'safe',
    permissions: [],
    monitoring: false,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 30,
      tokensPerMinute: 3000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Maximum number of members to return',
      validation: {
        min: 1,
        max: 1000
      }
    },
    {
      name: 'after',
      type: 'string',
      required: false,
      description: 'Get members after this user ID (for pagination)'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'server', 'information', 'safe'],
    examples: [
      {
        description: 'Get server members',
        parameters: {
          guild_id: '123456789012345678',
          limit: 100
        }
      }
    ]
  }
};

/**
 * Get channels in a Discord server
 */
export const getServerChannelsTool: Tool = {
  name: 'get_server_channels',
  description: 'Get list of channels in a Discord server',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'safe',
    permissions: [],
    monitoring: false,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 30,
      tokensPerMinute: 3000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'type',
      type: 'string',
      required: false,
      description: 'Filter channels by type',
      validation: {
        enum: ['text', 'voice', 'category', 'news', 'store', 'stage']
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'server', 'information', 'safe'],
    examples: [
      {
        description: 'Get text channels',
        parameters: {
          guild_id: '123456789012345678',
          type: 'text'
        }
      }
    ]
  }
};

// ============================================================================
// DISCORD WEBHOOK MANAGEMENT TOOLS
// ============================================================================

/**
 * Create a webhook for a channel
 */
export const createWebhookTool: Tool = {
  name: 'create_webhook',
  description: 'Create a new webhook for a Discord channel',
  category: 'discord',
  permissions: ['manage_webhooks'],
  safety: {
    level: 'restricted',
    permissions: ['manage_webhooks'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 10,
      tokensPerMinute: 1000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel to create webhook for'
    },
    {
      name: 'name',
      type: 'string',
      required: true,
      description: 'The name of the webhook',
      validation: {
        minLength: 1,
        maxLength: 80
      }
    },
    {
      name: 'avatar',
      type: 'string',
      required: false,
      description: 'Avatar URL for the webhook'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for creating the webhook',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'webhooks', 'management'],
    examples: [
      {
        description: 'Create a webhook',
        parameters: {
          channel_id: '123456789012345678',
          name: 'Notifications Webhook'
        }
      }
    ]
  }
};

/**
 * Update an existing webhook
 */
export const updateWebhookTool: Tool = {
  name: 'update_webhook',
  description: 'Update an existing Discord webhook',
  category: 'discord',
  permissions: ['manage_webhooks'],
  safety: {
    level: 'restricted',
    permissions: ['manage_webhooks'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 15,
      tokensPerMinute: 1500
    }
  },
  parameters: [
    {
      name: 'webhook_id',
      type: 'string',
      required: true,
      description: 'The ID of the webhook to update'
    },
    {
      name: 'webhook_token',
      type: 'string',
      required: true,
      description: 'The token of the webhook to update'
    },
    {
      name: 'name',
      type: 'string',
      required: false,
      description: 'The new name for the webhook',
      validation: {
        minLength: 1,
        maxLength: 80
      }
    },
    {
      name: 'avatar',
      type: 'string',
      required: false,
      description: 'New avatar URL for the webhook'
    },
    {
      name: 'channel_id',
      type: 'string',
      required: false,
      description: 'New channel ID to move webhook to'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'webhooks', 'management'],
    examples: [
      {
        description: 'Update webhook name',
        parameters: {
          webhook_id: '123456789012345678',
          webhook_token: 'abc123def456',
          name: 'Updated Webhook Name'
        }
      }
    ]
  }
};

/**
 * Delete a webhook
 */
export const deleteWebhookTool: Tool = {
  name: 'delete_webhook',
  description: 'Delete a Discord webhook',
  category: 'discord',
  permissions: ['manage_webhooks'],
  safety: {
    level: 'dangerous',
    permissions: ['manage_webhooks'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 5,
      tokensPerMinute: 500
    }
  },
  parameters: [
    {
      name: 'webhook_id',
      type: 'string',
      required: true,
      description: 'The ID of the webhook to delete'
    },
    {
      name: 'webhook_token',
      type: 'string',
      required: true,
      description: 'The token of the webhook to delete'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for deleting the webhook',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'webhooks', 'dangerous'],
    examples: [
      {
        description: 'Delete a webhook',
        parameters: {
          webhook_id: '123456789012345678',
          webhook_token: 'abc123def456',
          reason: 'Webhook no longer needed'
        }
      }
    ]
  }
};

/**
 * Execute a webhook
 */
export const executeWebhookTool: Tool = {
  name: 'execute_webhook',
  description: 'Execute a Discord webhook to send a message',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'restricted',
    permissions: [],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 50,
      tokensPerMinute: 5000
    }
  },
  parameters: [
    {
      name: 'webhook_url',
      type: 'string',
      required: true,
      description: 'The full URL of the webhook to execute'
    },
    {
      name: 'content',
      type: 'string',
      required: false,
      description: 'The content of the message to send',
      validation: {
        maxLength: 2000
      }
    },
    {
      name: 'embeds',
      type: 'array',
      required: false,
      description: 'Array of embed objects for rich content'
    },
    {
      name: 'username',
      type: 'string',
      required: false,
      description: 'Override the default username of the webhook',
      validation: {
        maxLength: 80
      }
    },
    {
      name: 'avatar_url',
      type: 'string',
      required: false,
      description: 'Override the default avatar of the webhook'
    },
    {
      name: 'tts',
      type: 'boolean',
      required: false,
      description: 'Whether to use text-to-speech'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'webhooks', 'messaging'],
    examples: [
      {
        description: 'Execute webhook with embed',
        parameters: {
          webhook_url: 'https://discord.com/api/webhooks/123/abc',
          content: 'Notification message',
          username: 'Bot Notification',
          embeds: [
            {
              title: 'Alert',
              color: '#FF0000',
              description: 'Important notification'
            }
          ]
        }
      }
    ]
  }
};

/**
 * Unban a user from a guild
 */
export const unbanUserTool: Tool = {
  name: 'unban_user',
  description: 'Unban a user from a Discord guild',
  category: 'discord',
  permissions: ['ban_members'],
  safety: {
    level: 'restricted',
    permissions: ['ban_members'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 10,
      tokensPerMinute: 1000
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild'
    },
    {
      name: 'user_id',
      type: 'string',
      required: true,
      description: 'The ID of the user to unban'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for unbanning the user',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'moderation'],
    examples: [
      {
        description: 'Unban a user',
        parameters: {
          guild_id: '123456789012345678',
          user_id: '987654321098765432',
          reason: 'Ban period ended'
        }
      }
    ]
  }
};

/**
 * Set permissions for a channel
 */
export const setChannelPermissionsTool: Tool = {
  name: 'set_channel_permissions',
  description: 'Set permissions for a Discord channel',
  category: 'discord',
  permissions: ['manage_channels'],
  safety: {
    level: 'restricted',
    permissions: ['manage_channels'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 15,
      tokensPerMinute: 1500
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel'
    },
    {
      name: 'target',
      type: 'string',
      required: true,
      description: 'The target ID (user or role) to set permissions for'
    },
    {
      name: 'target_type',
      type: 'string',
      required: true,
      description: 'The type of target (user or role)',
      validation: {
        enum: ['user', 'role']
      }
    },
    {
      name: 'permissions',
      type: 'array',
      required: true,
      description: 'Array of permission strings to grant/deny'
    },
    {
      name: 'allow',
      type: 'boolean',
      required: false,
      description: 'Whether to allow (true) or deny (false) permissions',
      defaultValue: true
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for changing permissions',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'channels', 'permissions', 'management'],
    examples: [
      {
        description: 'Grant send messages permission to a role',
        parameters: {
          channel_id: '123456789012345678',
          target: '987654321098765432',
          target_type: 'role',
          permissions: ['SEND_MESSAGES', 'VIEW_CHANNEL'],
          allow: true,
          reason: 'Grant access to VIP role'
        }
      }
    ]
  }
};

/**
 * Add a reaction to a message
 */
export const addReactionTool: Tool = {
  name: 'add_reaction',
  description: 'Add a reaction emoji to a Discord message',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'safe',
    permissions: [],
    monitoring: false,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 6000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel containing the message'
    },
    {
      name: 'message_id',
      type: 'string',
      required: true,
      description: 'The ID of the message to react to'
    },
    {
      name: 'emoji',
      type: 'string',
      required: true,
      description: 'The emoji to add (custom emoji format: <name:id> or unicode emoji)'
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'reactions', 'safe'],
    examples: [
      {
        description: 'Add a thumbs up reaction',
        parameters: {
          channel_id: '123456789012345678',
          message_id: '987654321098765432',
          emoji: '👍'
        }
      }
    ]
  }
};

/**
 * Update server (guild) settings
 */
export const updateServerTool: Tool = {
  name: 'update_server',
  description: 'Update Discord server (guild) settings',
  category: 'discord',
  permissions: ['manage_guild'],
  safety: {
    level: 'dangerous',
    permissions: ['manage_guild'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 5,
      tokensPerMinute: 500
    }
  },
  parameters: [
    {
      name: 'guild_id',
      type: 'string',
      required: true,
      description: 'The ID of the guild to update'
    },
    {
      name: 'name',
      type: 'string',
      required: false,
      description: 'The new name for the server',
      validation: {
        minLength: 2,
        maxLength: 100
      }
    },
    {
      name: 'description',
      type: 'string',
      required: false,
      description: 'The new description for the server',
      validation: {
        maxLength: 500
      }
    },
    {
      name: 'verification_level',
      type: 'number',
      required: false,
      description: 'Verification level (0-4)',
      validation: {
        min: 0,
        max: 4
      }
    },
    {
      name: 'default_message_notifications',
      type: 'number',
      required: false,
      description: 'Default message notification level (0-1)',
      validation: {
        min: 0,
        max: 1
      }
    },
    {
      name: 'explicit_content_filter',
      type: 'number',
      required: false,
      description: 'Explicit content filter level (0-2)',
      validation: {
        min: 0,
        max: 2
      }
    },
    {
      name: 'afk_channel_id',
      type: 'string',
      required: false,
      description: 'The ID of the AFK channel'
    },
    {
      name: 'afk_timeout',
      type: 'number',
      required: false,
      description: 'AFK timeout in seconds (60, 300, 900, 1800, 3600)',
      validation: {
        enum: [60, 300, 900, 1800, 3600]
      }
    },
    {
      name: 'system_channel_id',
      type: 'string',
      required: false,
      description: 'The ID of the system channel'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for updating the server',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'server', 'management', 'dangerous'],
    examples: [
      {
        description: 'Update server name and description',
        parameters: {
          guild_id: '123456789012345678',
          name: 'New Server Name',
          description: 'Updated server description',
          reason: 'Server rebranding'
        }
      }
    ]
  }
};

/**
 * Create an invite for a channel
 */
export const createInviteTool: Tool = {
  name: 'create_invite',
  description: 'Create an invite link for a Discord channel',
  category: 'discord',
  permissions: ['create_instant_invite'],
  safety: {
    level: 'restricted',
    permissions: ['create_instant_invite'],
    monitoring: true,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 20,
      tokensPerMinute: 2000
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel to create the invite for'
    },
    {
      name: 'max_age',
      type: 'number',
      required: false,
      description: 'Duration of invite in seconds (0 for never)',
      validation: {
        min: 0,
        max: 604800
      }
    },
    {
      name: 'max_uses',
      type: 'number',
      required: false,
      description: 'Maximum number of uses (0 for unlimited)',
      validation: {
        min: 0,
        max: 100
      }
    },
    {
      name: 'temporary',
      type: 'boolean',
      required: false,
      description: 'Whether the invite grants temporary membership'
    },
    {
      name: 'unique',
      type: 'boolean',
      required: false,
      description: 'Whether the invite should be unique'
    },
    {
      name: 'reason',
      type: 'string',
      required: false,
      description: 'The reason for creating the invite',
      validation: {
        maxLength: 500
      }
    }
  ],
  metadata: {
    version: '1.0.0',
    author: 'AI System',
    tags: ['discord', 'invites', 'management'],
    examples: [
      {
        description: 'Create a temporary invite',
        parameters: {
          channel_id: '123456789012345678',
          max_age: 3600,
          max_uses: 10,
          temporary: true,
          reason: 'Temporary invite for event'
        }
      }
    ]
  }
};

// ============================================================================
// TOOL COLLECTION
// ============================================================================

export const discordTools: Tool[] = [
  // Role Management Tools
  createRoleTool,
  updateRoleTool,
  deleteRoleTool,
  assignRoleTool,
  removeRoleTool,

  // Channel Management Tools
  createChannelTool,
  updateChannelTool,
  deleteChannelTool,
  getChannelInfoTool,

  // User Management Tools
  kickUserTool,
  banUserTool,
  timeoutUserTool,
  removeTimeoutTool,
  getUserInfoTool,

  // Message Management Tools
  sendMessageTool,
  editMessageTool,
  deleteMessageTool,
  getMessageTool,
  pinMessageTool,
  unpinMessageTool,

  // Server Management Tools
  getServerInfoTool,
  getServerMembersTool,
  getServerChannelsTool,

  // Webhook Management Tools
  createWebhookTool,
  updateWebhookTool,
  deleteWebhookTool,
  executeWebhookTool,

  // Additional Tools
  unbanUserTool,
  setChannelPermissionsTool,
  addReactionTool,
  updateServerTool,
  createInviteTool
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert permission string array to Discord.js PermissionFlagsBits
 */
function parsePermissions(permissions: string[]): bigint {
  let permissionBits = 0n;
  for (const perm of permissions) {
    const flag = PermissionFlagsBits[perm as keyof typeof PermissionFlagsBits];
    if (flag !== undefined) {
      permissionBits |= BigInt(flag);
    }
  }
  return permissionBits;
}

/**
 * Convert channel type string to Discord.js ChannelType
 */
function parseChannelType(type: string): ChannelType {
  const typeMap: Record<string, ChannelType> = {
    'text': ChannelType.GuildText,
    'voice': ChannelType.GuildVoice,
    'category': ChannelType.GuildCategory,
    'news': ChannelType.GuildAnnouncement,
    'stage': ChannelType.GuildStageVoice
  };
  return typeMap[type] || ChannelType.GuildText;
}

/**
 * Parse hex color to integer
 */
function parseColor(color: string): number {
  return parseInt(color.replace('#', ''), 16);
}

// ============================================================================
// TOOL EXECUTOR CLASS
// ============================================================================

export class DiscordToolExecutor {
  private logger: Logger;
  private client: Client | null;

  constructor(logger: Logger, client?: Client) {
    this.logger = logger;
    this.client = client || null;
  }

  /**
   * Set Discord client
   */
  setClient(client: Client): void {
    this.client = client;
  }

  /**
   * Ensure client is available
   */
  private ensureClient(): Client {
    if (!this.client) {
      throw new BotError(
        'Discord client not initialized. Please set the client before executing tools.',
        'high',
        { operation: 'ensureClient' }
      );
    }
    return this.client;
  }

  /**
   * Get guild by ID
   */
  private async getGuild(guildId: string): Promise<Guild> {
    const client = this.ensureClient();
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      throw new BotError(
        `Guild not found: ${guildId}`,
        'medium',
        { guildId }
      );
    }
    return guild;
  }

  /**
   * Get channel by ID
   */
  private async getChannel(channelId: string): Promise<Channel> {
    const client = this.ensureClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      throw new BotError(
        `Channel not found: ${channelId}`,
        'medium',
        { channelId }
      );
    }
    return channel;
  }

  /**
   * Execute Discord tool
   */
  async execute(toolName: string, parameters: Record<string, any>): Promise<any> {
    try {
      this.logger.info(`Executing Discord tool: ${toolName}`, { parameters });

      switch (toolName) {
        // Role Management
        case 'create_role':
          return this.createRole(parameters);
        case 'update_role':
          return this.updateRole(parameters);
        case 'delete_role':
          return this.deleteRole(parameters);
        case 'assign_role':
          return this.assignRole(parameters);
        case 'remove_role':
          return this.removeRole(parameters);

        // Channel Management
        case 'create_channel':
          return this.createChannel(parameters);
        case 'update_channel':
          return this.updateChannel(parameters);
        case 'delete_channel':
          return this.deleteChannel(parameters);
        case 'get_channel_info':
          return this.getChannelInfo(parameters);

        // User Management
        case 'kick_user':
          return this.kickUser(parameters);
        case 'ban_user':
          return this.banUser(parameters);
        case 'timeout_user':
          return this.timeoutUser(parameters);
        case 'remove_timeout':
          return this.removeTimeout(parameters);
        case 'get_user_info':
          return this.getUserInfo(parameters);

        // Message Management
        case 'send_message':
          return this.sendMessage(parameters);
        case 'edit_message':
          return this.editMessage(parameters);
        case 'delete_message':
          return this.deleteMessage(parameters);
        case 'get_message':
          return this.getMessage(parameters);
        case 'pin_message':
          return this.pinMessage(parameters);
        case 'unpin_message':
          return this.unpinMessage(parameters);

        // Server Management
        case 'get_server_info':
          return this.getServerInfo(parameters);
        case 'get_server_members':
          return this.getServerMembers(parameters);
        case 'get_server_channels':
          return this.getServerChannels(parameters);

        // Webhook Management
        case 'create_webhook':
          return this.createWebhook(parameters);
        case 'update_webhook':
          return this.updateWebhook(parameters);
        case 'delete_webhook':
          return this.deleteWebhook(parameters);
        case 'execute_webhook':
          return this.executeWebhook(parameters);

        // Additional Tools
        case 'unban_user':
          return this.unbanUser(parameters);
        case 'set_channel_permissions':
          return this.setChannelPermissions(parameters);
        case 'add_reaction':
          return this.addReaction(parameters);
        case 'update_server':
          return this.updateServer(parameters);
        case 'create_invite':
          return this.createInvite(parameters);

        default:
          throw new BotError(
            `Unknown Discord tool: ${toolName}`,
            'medium',
            { toolName, parameters }
          );
      }
    } catch (error) {
      this.logger.error(`Failed to execute Discord tool: ${toolName}`, error as Error, {
        parameters
      });
      throw error;
    }
  }

  // ============================================================================
  // ROLE MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async createRole(parameters: any): Promise<any> {
    const { guild_id, name, color, permissions, hoist, mentionable, position } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      const role = await guild.roles.create({
        name,
        color: color ? parseColor(color) : undefined,
        permissions: permissions ? parsePermissions(permissions) : undefined,
        hoist,
        mentionable,
        position,
        reason: parameters.reason
      });

      this.logger.info(`Role created successfully: ${role.id}`);
      return {
        success: true,
        role_id: role.id,
        role: {
          id: role.id,
          name: role.name,
          color: role.hexColor,
          permissions: role.permissions.bitfield.toString(),
          hoist: role.hoist,
          mentionable: role.mentionable,
          position: role.position
        },
        message: 'Role created successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to create role', error);
      throw new BotError(
        `Failed to create role: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async updateRole(parameters: any): Promise<any> {
    const { guild_id, role_id, name, color, permissions, hoist, mentionable, position } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      const role = await guild.roles.fetch(role_id);
      
      if (!role) {
        throw new BotError(`Role not found: ${role_id}`, 'medium', { role_id });
      }

      await role.edit({
        name,
        color: color ? parseColor(color) : undefined,
        permissions: permissions ? parsePermissions(permissions) : undefined,
        hoist,
        mentionable,
        position,
        reason: parameters.reason
      });

      this.logger.info(`Role updated successfully: ${role.id}`);
      return {
        success: true,
        role_id: role.id,
        message: 'Role updated successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to update role', error);
      throw new BotError(
        `Failed to update role: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async deleteRole(parameters: any): Promise<any> {
    const { guild_id, role_id, reason } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      const role = await guild.roles.fetch(role_id);
      
      if (!role) {
        throw new BotError(`Role not found: ${role_id}`, 'medium', { role_id });
      }

      await role.delete(reason);

      this.logger.info(`Role deleted successfully: ${role_id}`);
      return {
        success: true,
        role_id,
        message: 'Role deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete role', error);
      throw new BotError(
        `Failed to delete role: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async assignRole(parameters: any): Promise<any> {
    const { guild_id, user_id, role_id, reason } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      const member = await guild.members.fetch(user_id);
      const role = await guild.roles.fetch(role_id);
      
      if (!member) {
        throw new BotError(`Member not found: ${user_id}`, 'medium', { user_id });
      }
      
      if (!role) {
        throw new BotError(`Role not found: ${role_id}`, 'medium', { role_id });
      }

      await member.roles.add(role, reason);

      this.logger.info(`Role assigned successfully: ${role_id} to ${user_id}`);
      return {
        success: true,
        user_id,
        role_id,
        message: 'Role assigned successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to assign role', error);
      throw new BotError(
        `Failed to assign role: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async removeRole(parameters: any): Promise<any> {
    const { guild_id, user_id, role_id, reason } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      const member = await guild.members.fetch(user_id);
      const role = await guild.roles.fetch(role_id);
      
      if (!member) {
        throw new BotError(`Member not found: ${user_id}`, 'medium', { user_id });
      }
      
      if (!role) {
        throw new BotError(`Role not found: ${role_id}`, 'medium', { role_id });
      }

      await member.roles.remove(role, reason);

      this.logger.info(`Role removed successfully: ${role_id} from ${user_id}`);
      return {
        success: true,
        user_id,
        role_id,
        message: 'Role removed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to remove role', error);
      throw new BotError(
        `Failed to remove role: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  // ============================================================================
  // CHANNEL MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async createChannel(parameters: any): Promise<any> {
    const { guild_id, name, type, topic, nsfw, parent_id, position, permission_overwrites, rate_limit_per_user } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      const channelType = parseChannelType(type);
      
      const channel = await guild.channels.create({
        name,
        type: channelType as any,
        topic,
        nsfw,
        parent: parent_id,
        position,
        permissionOverwrites: permission_overwrites,
        rateLimitPerUser: rate_limit_per_user,
        reason: parameters.reason
      });

      this.logger.info(`Channel created successfully: ${channel.id}`);
      return {
        success: true,
        channel_id: channel.id,
        channel: {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          topic: (channel as any).topic,
          nsfw: (channel as any).nsfw,
          position: channel.position
        },
        message: 'Channel created successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to create channel', error);
      throw new BotError(
        `Failed to create channel: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async updateChannel(parameters: any): Promise<any> {
    const { channel_id, name, topic, nsfw, position, rate_limit_per_user } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel) {
        throw new BotError(`Channel not found: ${channel_id}`, 'medium', { channel_id });
      }

      await channel.edit({
        name,
        topic,
        nsfw,
        position,
        rateLimitPerUser: rate_limit_per_user,
        reason: parameters.reason
      });

      this.logger.info(`Channel updated successfully: ${channel_id}`);
      return {
        success: true,
        channel_id,
        message: 'Channel updated successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to update channel', error);
      throw new BotError(
        `Failed to update channel: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async deleteChannel(parameters: any): Promise<any> {
    const { channel_id, reason } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id);
      
      if (!channel) {
        throw new BotError(`Channel not found: ${channel_id}`, 'medium', { channel_id });
      }

      await channel.delete(reason);

      this.logger.info(`Channel deleted successfully: ${channel_id}`);
      return {
        success: true,
        channel_id,
        message: 'Channel deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete channel', error);
      throw new BotError(
        `Failed to delete channel: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async getChannelInfo(parameters: any): Promise<any> {
    const { channel_id } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id);
      
      if (!channel) {
        throw new BotError(`Channel not found: ${channel_id}`, 'medium', { channel_id });
      }

      const channelData: any = {
        id: channel.id,
        name: (channel as any).name,
        type: channel.type,
        guild_id: (channel as any).guildId
      };

      if ('topic' in channel) {
        channelData.topic = (channel as any).topic;
      }
      if ('nsfw' in channel) {
        channelData.nsfw = (channel as any).nsfw;
      }
      if ('position' in channel) {
        channelData.position = (channel as any).position;
      }

      this.logger.info(`Channel info retrieved: ${channel_id}`);
      return {
        success: true,
        channel: channelData
      };
    } catch (error: any) {
      this.logger.error('Failed to get channel info', error);
      throw new BotError(
        `Failed to get channel info: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  // ============================================================================
  // USER MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async kickUser(parameters: any): Promise<any> {
    const { guild_id, user_id, reason } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      const member = await guild.members.fetch(user_id);
      
      if (!member) {
        throw new BotError(`Member not found: ${user_id}`, 'medium', { user_id });
      }

      await member.kick(reason);

      this.logger.info(`User kicked successfully: ${user_id}`);
      return {
        success: true,
        user_id,
        message: 'User kicked successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to kick user', error);
      throw new BotError(
        `Failed to kick user: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async banUser(parameters: any): Promise<any> {
    const { guild_id, user_id, reason, delete_message_days } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      
      await guild.bans.create(user_id, {
        reason,
        deleteMessageSeconds: delete_message_days ? delete_message_days * 86400 : undefined
      });

      this.logger.info(`User banned successfully: ${user_id}`);
      return {
        success: true,
        user_id,
        message: 'User banned successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to ban user', error);
      throw new BotError(
        `Failed to ban user: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async timeoutUser(parameters: any): Promise<any> {
    const { guild_id, user_id, duration_minutes, reason } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      const member = await guild.members.fetch(user_id);
      
      if (!member) {
        throw new BotError(`Member not found: ${user_id}`, 'medium', { user_id });
      }

      const timeoutDuration = duration_minutes * 60 * 1000; // Convert to milliseconds
      await member.timeout(timeoutDuration, reason);

      this.logger.info(`User timed out successfully: ${user_id} for ${duration_minutes} minutes`);
      return {
        success: true,
        user_id,
        duration_minutes,
        message: 'User timed out successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to timeout user', error);
      throw new BotError(
        `Failed to timeout user: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async removeTimeout(parameters: any): Promise<any> {
    const { guild_id, user_id, reason } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      const member = await guild.members.fetch(user_id);
      
      if (!member) {
        throw new BotError(`Member not found: ${user_id}`, 'medium', { user_id });
      }

      await member.timeout(null, reason);

      this.logger.info(`Timeout removed successfully from user: ${user_id}`);
      return {
        success: true,
        user_id,
        message: 'Timeout removed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to remove timeout', error);
      throw new BotError(
        `Failed to remove timeout: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async getUserInfo(parameters: any): Promise<any> {
    const { user_id, guild_id } = parameters;
    
    try {
      const client = this.ensureClient();
      let user: User | null = null;
      let member: GuildMember | null = null;

      if (guild_id) {
        const guild = await this.getGuild(guild_id);
        member = await guild.members.fetch(user_id).catch(() => null);
        user = member?.user || null;
      }

      if (!user) {
        user = await client.users.fetch(user_id).catch(() => null);
      }

      if (!user) {
        throw new BotError(`User not found: ${user_id}`, 'medium', { user_id });
      }

      const userData: any = {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatarURL(),
        bot: user.bot
      };

      if (member) {
        userData.joined_at = member.joinedAt?.toISOString();
        userData.roles = Array.from(member.roles.cache.keys());
        userData.nickname = member.nickname;
      }

      this.logger.info(`User info retrieved: ${user_id}`);
      return {
        success: true,
        user: userData
      };
    } catch (error: any) {
      this.logger.error('Failed to get user info', error);
      throw new BotError(
        `Failed to get user info: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  // ============================================================================
  // MESSAGE MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async sendMessage(parameters: any): Promise<any> {
    const { channel_id, content, embed, tts, reply_to } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel || !channel.send) {
        throw new BotError(`Cannot send messages to channel: ${channel_id}`, 'medium', { channel_id });
      }

      const messageOptions: any = {
        content,
        tts,
        embeds: embed ? [embed] : undefined
      };

      if (reply_to) {
        messageOptions.reply = { messageReference: reply_to };
      }

      const message = await channel.send(messageOptions);

      this.logger.info(`Message sent successfully to channel: ${channel_id}`);
      return {
        success: true,
        message_id: message.id,
        channel_id,
        message: 'Message sent successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to send message', error);
      throw new BotError(
        `Failed to send message: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async editMessage(parameters: any): Promise<any> {
    const { channel_id, message_id, content, embed } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel || !channel.messages) {
        throw new BotError(`Cannot edit messages in channel: ${channel_id}`, 'medium', { channel_id });
      }

      const message = await channel.messages.fetch(message_id);
      
      const messageOptions: any = {
        content,
        embeds: embed ? [embed] : undefined
      };

      await message.edit(messageOptions);

      this.logger.info(`Message edited successfully: ${message_id}`);
      return {
        success: true,
        message_id,
        message: 'Message edited successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to edit message', error);
      throw new BotError(
        `Failed to edit message: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async deleteMessage(parameters: any): Promise<any> {
    const { channel_id, message_id, reason } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel || !channel.messages) {
        throw new BotError(`Cannot delete messages from channel: ${channel_id}`, 'medium', { channel_id });
      }

      const message = await channel.messages.fetch(message_id);
      await message.delete(reason);

      this.logger.info(`Message deleted successfully: ${message_id}`);
      return {
        success: true,
        message_id,
        message: 'Message deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete message', error);
      throw new BotError(
        `Failed to delete message: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async getMessage(parameters: any): Promise<any> {
    const { channel_id, message_id } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel || !channel.messages) {
        throw new BotError(`Cannot fetch messages from channel: ${channel_id}`, 'medium', { channel_id });
      }

      const message = await channel.messages.fetch(message_id);

      const messageData = {
        id: message.id,
        channel_id: message.channelId,
        content: message.content,
        author: {
          id: message.author.id,
          username: message.author.username,
          discriminator: message.author.discriminator,
          avatar: message.author.avatarURL()
        },
        timestamp: message.createdAt.toISOString(),
        edited_timestamp: message.editedAt?.toISOString() || null
      };

      this.logger.info(`Message retrieved: ${message_id}`);
      return {
        success: true,
        message: messageData
      };
    } catch (error: any) {
      this.logger.error('Failed to get message', error);
      throw new BotError(
        `Failed to get message: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async pinMessage(parameters: any): Promise<any> {
    const { channel_id, message_id } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel || !channel.messages) {
        throw new BotError(`Cannot pin messages in channel: ${channel_id}`, 'medium', { channel_id });
      }

      const message = await channel.messages.fetch(message_id);
      await message.pin();

      this.logger.info(`Message pinned successfully: ${message_id}`);
      return {
        success: true,
        message_id,
        message: 'Message pinned successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to pin message', error);
      throw new BotError(
        `Failed to pin message: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async unpinMessage(parameters: any): Promise<any> {
    const { channel_id, message_id } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel || !channel.messages) {
        throw new BotError(`Cannot unpin messages in channel: ${channel_id}`, 'medium', { channel_id });
      }

      const message = await channel.messages.fetch(message_id);
      await message.unpin();

      this.logger.info(`Message unpinned successfully: ${message_id}`);
      return {
        success: true,
        message_id,
        message: 'Message unpinned successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to unpin message', error);
      throw new BotError(
        `Failed to unpin message: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  // ============================================================================
  // SERVER MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async getServerInfo(parameters: any): Promise<any> {
    const { guild_id } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);

      const serverData = {
        id: guild.id,
        name: guild.name,
        owner_id: guild.ownerId,
        member_count: guild.memberCount,
        channel_count: guild.channels.cache.size,
        role_count: guild.roles.cache.size,
        region: guild.preferredLocale,
        created_at: guild.createdAt.toISOString(),
        icon: guild.iconURL(),
        description: guild.description,
        features: guild.features
      };

      this.logger.info(`Server info retrieved: ${guild_id}`);
      return {
        success: true,
        server: serverData
      };
    } catch (error: any) {
      this.logger.error('Failed to get server info', error);
      throw new BotError(
        `Failed to get server info: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async getServerMembers(parameters: any): Promise<any> {
    const { guild_id, limit, after } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      
      const members = await guild.members.fetch({
        limit: limit || 100
      });

      const membersList = members.map(member => ({
        id: member.user.id,
        username: member.user.username,
        discriminator: member.user.discriminator,
        nickname: member.nickname,
        roles: Array.from(member.roles.cache.keys()),
        joined_at: member.joinedAt?.toISOString(),
        bot: member.user.bot
      }));

      this.logger.info(`Server members retrieved: ${guild_id} (${membersList.length} members)`);
      return {
        success: true,
        members: membersList,
        total: membersList.length
      };
    } catch (error: any) {
      this.logger.error('Failed to get server members', error);
      throw new BotError(
        `Failed to get server members: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async getServerChannels(parameters: any): Promise<any> {
    const { guild_id, type } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      
      let channels = guild.channels.cache;
      
      if (type) {
        const channelType = parseChannelType(type);
        channels = channels.filter(ch => ch.type === channelType);
      }

      const channelsList = channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        topic: (channel as any).topic,
        nsfw: (channel as any).nsfw,
        position: (channel as any).position,
        parent_id: (channel as any).parentId
      }));

      this.logger.info(`Server channels retrieved: ${guild_id} (${channelsList.length} channels)`);
      return {
        success: true,
        channels: channelsList,
        total: channelsList.length
      };
    } catch (error: any) {
      this.logger.error('Failed to get server channels', error);
      throw new BotError(
        `Failed to get server channels: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  // ============================================================================
  // WEBHOOK MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async createWebhook(parameters: any): Promise<any> {
    const { channel_id, name, avatar, reason } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel || !channel.createWebhook) {
        throw new BotError(`Cannot create webhooks in channel: ${channel_id}`, 'medium', { channel_id });
      }

      const webhook = await channel.createWebhook({
        name,
        avatar,
        reason
      });

      this.logger.info(`Webhook created successfully: ${webhook.id}`);
      return {
        success: true,
        webhook_id: webhook.id,
        webhook_token: webhook.token,
        url: webhook.url,
        message: 'Webhook created successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to create webhook', error);
      throw new BotError(
        `Failed to create webhook: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async updateWebhook(parameters: any): Promise<any> {
    const { webhook_id, webhook_token, name, avatar, channel_id } = parameters;
    
    try {
      const client = this.ensureClient();
      const webhook = await client.fetchWebhook(webhook_id, webhook_token);
      
      if (!webhook) {
        throw new BotError(`Webhook not found: ${webhook_id}`, 'medium', { webhook_id });
      }

      await webhook.edit({
        name,
        avatar,
        channel: channel_id
      });

      this.logger.info(`Webhook updated successfully: ${webhook_id}`);
      return {
        success: true,
        webhook_id,
        message: 'Webhook updated successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to update webhook', error);
      throw new BotError(
        `Failed to update webhook: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async deleteWebhook(parameters: any): Promise<any> {
    const { webhook_id, webhook_token, reason } = parameters;
    
    try {
      const client = this.ensureClient();
      const webhook = await client.fetchWebhook(webhook_id, webhook_token);
      
      if (!webhook) {
        throw new BotError(`Webhook not found: ${webhook_id}`, 'medium', { webhook_id });
      }

      await webhook.delete(reason);

      this.logger.info(`Webhook deleted successfully: ${webhook_id}`);
      return {
        success: true,
        webhook_id,
        message: 'Webhook deleted successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to delete webhook', error);
      throw new BotError(
        `Failed to delete webhook: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async executeWebhook(parameters: any): Promise<any> {
    const { webhook_url, content, embeds, username, avatar_url, tts } = parameters;
    
    try {
      const axios = await import('axios');
      const response = await axios.default.post(webhook_url, {
        content,
        embeds,
        username,
        avatar_url,
        tts
      });

      this.logger.info(`Webhook executed successfully: ${webhook_url}`);
      return {
        success: true,
        message_id: response.data.id,
        message: 'Webhook executed successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to execute webhook', error);
      throw new BotError(
        `Failed to execute webhook: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  // ============================================================================
  // ADDITIONAL TOOL IMPLEMENTATIONS
  // ============================================================================

  private async unbanUser(parameters: any): Promise<any> {
    const { guild_id, user_id, reason } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      
      await guild.bans.remove(user_id, reason);

      this.logger.info(`User unbanned successfully: ${user_id}`);
      return {
        success: true,
        user_id,
        message: 'User unbanned successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to unban user', error);
      throw new BotError(
        `Failed to unban user: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async setChannelPermissions(parameters: any): Promise<any> {
    const { channel_id, target, target_type, permissions, allow, reason } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel) {
        throw new BotError(`Channel not found: ${channel_id}`, 'medium', { channel_id });
      }

      const permissionBits = permissions ? parsePermissions(permissions) : undefined;
      const overwriteType = target_type === 'user' ? 1 : 0; // 1 = Member, 0 = Role

      await channel.permissionOverwrites.create({
        id: target,
        type: overwriteType,
        allow: allow ? permissionBits : undefined,
        deny: allow ? undefined : permissionBits,
        reason
      });

      this.logger.info(`Channel permissions set successfully: ${channel_id} for ${target_type} ${target}`);
      return {
        success: true,
        channel_id,
        target,
        target_type,
        message: 'Channel permissions set successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to set channel permissions', error);
      throw new BotError(
        `Failed to set channel permissions: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async addReaction(parameters: any): Promise<any> {
    const { channel_id, message_id, emoji } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel || !channel.messages) {
        throw new BotError(`Cannot add reactions in channel: ${channel_id}`, 'medium', { channel_id });
      }

      const message = await channel.messages.fetch(message_id);
      await message.react(emoji);

      this.logger.info(`Reaction added successfully: ${emoji} to message ${message_id}`);
      return {
        success: true,
        message_id,
        emoji,
        message: 'Reaction added successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to add reaction', error);
      throw new BotError(
        `Failed to add reaction: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async updateServer(parameters: any): Promise<any> {
    const { guild_id, name, description, verification_level, default_message_notifications, explicit_content_filter, afk_channel_id, afk_timeout, system_channel_id, reason } = parameters;
    
    try {
      const guild = await this.getGuild(guild_id);
      
      const updateOptions: any = {
        name,
        description,
        verificationLevel: verification_level,
        defaultMessageNotifications: default_message_notifications,
        explicitContentFilter: explicit_content_filter,
        afkChannel: afk_channel_id,
        afkTimeout: afk_timeout,
        systemChannel: system_channel_id,
        reason
      };

      await guild.edit(updateOptions);

      this.logger.info(`Server updated successfully: ${guild_id}`);
      return {
        success: true,
        guild_id,
        message: 'Server updated successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to update server', error);
      throw new BotError(
        `Failed to update server: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }

  private async createInvite(parameters: any): Promise<any> {
    const { channel_id, max_age, max_uses, temporary, unique, reason } = parameters;
    
    try {
      const channel = await this.getChannel(channel_id) as any;
      
      if (!channel || !channel.createInvite) {
        throw new BotError(`Cannot create invites in channel: ${channel_id}`, 'medium', { channel_id });
      }

      const invite = await channel.createInvite({
        maxAge: max_age,
        maxUses: max_uses,
        temporary,
        unique,
        reason
      });

      this.logger.info(`Invite created successfully: ${invite.code}`);
      return {
        success: true,
        invite_code: invite.code,
        invite_url: invite.url,
        message: 'Invite created successfully'
      };
    } catch (error: any) {
      this.logger.error('Failed to create invite', error);
      throw new BotError(
        `Failed to create invite: ${error.message}`,
        'high',
        { parameters, originalError: error.message }
      );
    }
  }
}
