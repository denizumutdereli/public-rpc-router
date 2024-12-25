import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const environment = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  useHttps: process.env.USE_HTTPS === 'true',
  certFile: process.env.CERT_FILE || path.join(__dirname, '../../cert/cert.pem'),
  keyFile: process.env.KEY_FILE || path.join(__dirname, '../../cert/key.pem'),

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
    configTtl: parseInt(process.env.REDIS_CONFIG_TTL || '86400', 10),
    healthTtl: parseInt(process.env.REDIS_HEALTH_TTL || '3600', 10),
    sessionTtl: parseInt(process.env.SESSION_TTL || '3600', 10),
  },

  rpc: {
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000', 10),
    configRefreshInterval: parseInt(process.env.CONFIG_REFRESH_INTERVAL || '300000', 10),
    maxFailCount: parseInt(process.env.MAX_FAIL_COUNT || '3', 10),
    sessionTtl: parseInt(process.env.SESSION_TTL || '3600', 10),
  },

  security: {
    allowedIps: (process.env.ALLOWED_IPS || '127.0.0.1')
      .split(',')
      .map(ip => ip.trim()),
    trustProxy: process.env.TRUST_PROXY === 'true',
    cloudflare: process.env.CLOUD_FLARE === 'true',
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15', 10) * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map(origin => origin.trim()),
    corsCredentials: process.env.CORS_CREDENTIALS === 'true',
  },

  logging: {
    enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
  },

  features: {
    enableProxyMode: process.env.ENABLE_PROXY_MODE === 'true',
  },
};