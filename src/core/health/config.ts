import { HealthMonitorConfig, HealthEndpointConfig } from './types';

declare const process: {
  env: {
    HEALTH_AUTH_TOKEN?: string;
    [key: string]: string | undefined;
  };
};

export const defaultHealthConfig: HealthMonitorConfig = {
  enabled: true,
  checkInterval: 30000, // 30 seconds
  alertThreshold: 3, // Alert after 3 consecutive failures
  metricsRetention: 86400000, // 24 hours in milliseconds
  endpoints: {
    basic: {
      enabled: true,
      path: '/health',
      method: 'GET',
      authentication: {
        enabled: false
      },
      rateLimit: {
        enabled: true,
        maxRequests: 10,
        windowMs: 60000 // 1 minute
      }
    },
    detailed: {
      enabled: true,
      path: '/health/detailed',
      method: 'GET',
      authentication: {
        enabled: true,
        header: 'X-Health-Token',
        ...(process.env.HEALTH_AUTH_TOKEN && { token: process.env.HEALTH_AUTH_TOKEN })
      },
      rateLimit: {
        enabled: true,
        maxRequests: 5,
        windowMs: 60000 // 1 minute
      }
    },
    readiness: {
      enabled: true,
      path: '/ready',
      method: 'GET',
      authentication: {
        enabled: false
      },
      rateLimit: {
        enabled: true,
        maxRequests: 20,
        windowMs: 60000 // 1 minute
      }
    },
    liveness: {
      enabled: true,
      path: '/live',
      method: 'GET',
      authentication: {
        enabled: false
      },
      rateLimit: {
        enabled: true,
        maxRequests: 20,
        windowMs: 60000 // 1 minute
      }
    }
  }
};

export const healthCheckThresholds = {
  memory: {
    warning: 0.8, // 80% memory usage
    critical: 0.95 // 95% memory usage
  },
  cpu: {
    warning: 0.8, // 80% CPU usage
    critical: 0.95 // 95% CPU usage
  },
  disk: {
    warning: 0.8, // 80% disk usage
    critical: 0.95 // 95% disk usage
  },
  responseTime: {
    warning: 1000, // 1 second
    critical: 5000 // 5 seconds
  },
  discord: {
    pingWarning: 500, // 500ms ping
    pingCritical: 2000 // 2 seconds ping
  }
};

export const healthCheckTimeouts = {
  database: 5000, // 5 seconds
  discordApi: 3000, // 3 seconds
  externalApi: 10000, // 10 seconds
  system: 2000 // 2 seconds
};