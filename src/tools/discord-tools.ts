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
      requestsPerMinute: 10
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
      requestsPerMinute: 15
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
      requestsPerMinute: 5
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
      requestsPerMinute: 20
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
      requestsPerMinute: 20
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
      requestsPerMinute: 10
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
      requestsPerMinute: 15
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
      requestsPerMinute: 5
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
      requestsPerMinute: 60
    }
  },
  parameters: [
    {
      name: 'channel_id',
      type: 'string',
      required: true,
      description: 'The ID of the channel to get info for'
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
      requestsPerMinute: 5
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
      requestsPerMinute: 3
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
      requestsPerMinute: 10
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
      requestsPerMinute: 20
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
      requestsPerMinute: 60
    }
  },
  parameters: [
    {
      name: 'user_id',
      type: 'string',
      required: true,
      description: 'The ID of the user to get info for'
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
      requestsPerMinute: 50
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
      requestsPerMinute: 30
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
      requestsPerMinute: 30
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
      requestsPerMinute: 60
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
      requestsPerMinute: 20
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
      requestsPerMinute: 20
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
      requestsPerMinute: 60
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
  description: 'Get the list of members in a Discord server',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'safe',
    permissions: [],
    monitoring: false,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 30
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
  description: 'Get the list of channels in a Discord server',
  category: 'discord',
  permissions: [],
  safety: {
    level: 'safe',
    permissions: [],
    monitoring: false,
    sandbox: false,
    rateLimit: {
      requestsPerMinute: 30
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
      requestsPerMinute: 10
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
      requestsPerMinute: 15
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
      requestsPerMinute: 5
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
      requestsPerMinute: 50
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
  executeWebhookTool
];

// ============================================================================
// TOOL EXECUTOR CLASS
// ============================================================================

export class DiscordToolExecutor {
  private logger: Logger;
  private client: any; // Discord.js client - to be injected

  constructor(logger: Logger, client?: any) {
    this.logger = logger;
    this.client = client;
  }

  /**
   * Set Discord client
   */
  setClient(client: any): void {
    this.client = client;
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
    this.logger.info('Creating Discord role', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      role_id: 'mock_role_id',
      message: 'Role created successfully'
    };
  }

  private async updateRole(parameters: any): Promise<any> {
    this.logger.info('Updating Discord role', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      role_id: parameters.role_id,
      message: 'Role updated successfully'
    };
  }

  private async deleteRole(parameters: any): Promise<any> {
    this.logger.info('Deleting Discord role', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      role_id: parameters.role_id,
      message: 'Role deleted successfully'
    };
  }

  private async assignRole(parameters: any): Promise<any> {
    this.logger.info('Assigning role to user', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      user_id: parameters.user_id,
      role_id: parameters.role_id,
      message: 'Role assigned successfully'
    };
  }

  private async removeRole(parameters: any): Promise<any> {
    this.logger.info('Removing role from user', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      user_id: parameters.user_id,
      role_id: parameters.role_id,
      message: 'Role removed successfully'
    };
  }

  // ============================================================================
  // CHANNEL MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async createChannel(parameters: any): Promise<any> {
    this.logger.info('Creating Discord channel', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      channel_id: 'mock_channel_id',
      message: 'Channel created successfully'
    };
  }

  private async updateChannel(parameters: any): Promise<any> {
    this.logger.info('Updating Discord channel', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      channel_id: parameters.channel_id,
      message: 'Channel updated successfully'
    };
  }

  private async deleteChannel(parameters: any): Promise<any> {
    this.logger.info('Deleting Discord channel', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      channel_id: parameters.channel_id,
      message: 'Channel deleted successfully'
    };
  }

  private async getChannelInfo(parameters: any): Promise<any> {
    this.logger.info('Getting Discord channel info', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      channel: {
        id: parameters.channel_id,
        name: 'Mock Channel',
        type: 'text',
        topic: 'Mock topic'
      }
    };
  }

  // ============================================================================
  // USER MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async kickUser(parameters: any): Promise<any> {
    this.logger.info('Kicking Discord user', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      user_id: parameters.user_id,
      message: 'User kicked successfully'
    };
  }

  private async banUser(parameters: any): Promise<any> {
    this.logger.info('Banning Discord user', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      user_id: parameters.user_id,
      message: 'User banned successfully'
    };
  }

  private async timeoutUser(parameters: any): Promise<any> {
    this.logger.info('Timing out Discord user', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      user_id: parameters.user_id,
      duration_minutes: parameters.duration_minutes,
      message: 'User timed out successfully'
    };
  }

  private async removeTimeout(parameters: any): Promise<any> {
    this.logger.info('Removing timeout from user', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      user_id: parameters.user_id,
      message: 'Timeout removed successfully'
    };
  }

  private async getUserInfo(parameters: any): Promise<any> {
    this.logger.info('Getting Discord user info', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      user: {
        id: parameters.user_id,
        username: 'MockUser',
        discriminator: '1234',
        avatar: 'https://example.com/avatar.png'
      }
    };
  }

  // ============================================================================
  // MESSAGE MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async sendMessage(parameters: any): Promise<any> {
    this.logger.info('Sending Discord message', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      message_id: 'mock_message_id',
      channel_id: parameters.channel_id,
      message: 'Message sent successfully'
    };
  }

  private async editMessage(parameters: any): Promise<any> {
    this.logger.info('Editing Discord message', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      message_id: parameters.message_id,
      message: 'Message edited successfully'
    };
  }

  private async deleteMessage(parameters: any): Promise<any> {
    this.logger.info('Deleting Discord message', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      message_id: parameters.message_id,
      message: 'Message deleted successfully'
    };
  }

  private async getMessage(parameters: any): Promise<any> {
    this.logger.info('Getting Discord message', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      message: {
        id: parameters.message_id,
        channel_id: parameters.channel_id,
        content: 'Mock message content',
        author: {
          id: '987654321098765432',
          username: 'MockUser'
        },
        timestamp: new Date().toISOString()
      }
    };
  }

  private async pinMessage(parameters: any): Promise<any> {
    this.logger.info('Pinning Discord message', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      message_id: parameters.message_id,
      message: 'Message pinned successfully'
    };
  }

  private async unpinMessage(parameters: any): Promise<any> {
    this.logger.info('Unpinning Discord message', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      message_id: parameters.message_id,
      message: 'Message unpinned successfully'
    };
  }

  // ============================================================================
  // SERVER MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async getServerInfo(parameters: any): Promise<any> {
    this.logger.info('Getting Discord server info', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      server: {
        id: parameters.guild_id,
        name: 'Mock Server',
        owner_id: '123456789012345678',
        member_count: 100,
        channel_count: 10,
        region: 'us-east'
      }
    };
  }

  private async getServerMembers(parameters: any): Promise<any> {
    this.logger.info('Getting Discord server members', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      members: [
        { id: '987654321098765432', username: 'User1' },
        { id: '123456789012345678', username: 'User2' }
      ].slice(0, parameters.limit || 50)
    };
  }

  private async getServerChannels(parameters: any): Promise<any> {
    this.logger.info('Getting Discord server channels', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      channels: [
        { id: '111222333444555666', name: 'general', type: 'text' },
        { id: '222333444555666777', name: 'voice', type: 'voice' }
      ]
    };
  }

  // ============================================================================
  // WEBHOOK MANAGEMENT IMPLEMENTATIONS
  // ============================================================================

  private async createWebhook(parameters: any): Promise<any> {
    this.logger.info('Creating Discord webhook', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      webhook_id: 'mock_webhook_id',
      webhook_token: 'mock_token',
      url: 'https://discord.com/api/webhooks/mock_id/mock_token',
      message: 'Webhook created successfully'
    };
  }

  private async updateWebhook(parameters: any): Promise<any> {
    this.logger.info('Updating Discord webhook', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      webhook_id: parameters.webhook_id,
      message: 'Webhook updated successfully'
    };
  }

  private async deleteWebhook(parameters: any): Promise<any> {
    this.logger.info('Deleting Discord webhook', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      webhook_id: parameters.webhook_id,
      message: 'Webhook deleted successfully'
    };
  }

  private async executeWebhook(parameters: any): Promise<any> {
    this.logger.info('Executing Discord webhook', parameters);
    // TODO: Implement actual Discord API call
    return {
      success: true,
      message_id: 'mock_message_id',
      message: 'Webhook executed successfully'
    };
  }
}
