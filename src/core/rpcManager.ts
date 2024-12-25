import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG_PATHS, ERROR_MESSAGES, REDIS_KEYS } from '../config/constants';
import { environment } from '../config/environment';
import { RpcConfig, RpcConfigFile, RpcHealth, RpcSession } from '../types';
import { logger } from '../utils/logger';
import { HealthChecker } from './healthChecker';
import RedisManager from './redis';

export class RpcManager {
    private static instance: RpcManager;
    private configRefreshInterval: NodeJS.Timeout | null = null;
    private configLastModified: Date | null = null;
    private unhealthyErrors: { timestamp: number }[] = [];
    private readonly ERROR_THRESHOLD = 3;
    private readonly ERROR_TIME_WINDOW = 10000; // 10 seconds

    private constructor() { }

    public static getInstance(): RpcManager {
        if (!RpcManager.instance) {
            RpcManager.instance = new RpcManager();
        }
        return RpcManager.instance;
    }

    private async hasConfigChanged(): Promise<boolean> {
        try {
            const configPath = path.join(process.cwd(), CONFIG_PATHS.RPC_CONFIG);
            const stats = await fs.stat(configPath);

            if (!this.configLastModified || stats.mtime > this.configLastModified) {
                this.configLastModified = stats.mtime;
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Failed to check config file status:', error);
            return false;
        }
    }

    private async checkForceReload(): Promise<void> {
        const now = Date.now();
        this.unhealthyErrors = this.unhealthyErrors.filter(
            error => now - error.timestamp <= this.ERROR_TIME_WINDOW
        );

        this.unhealthyErrors.push({ timestamp: now });

        if (this.unhealthyErrors.length >= this.ERROR_THRESHOLD) {
            logger.warn(`Detected ${this.ERROR_THRESHOLD} unhealthy RPC errors in ${this.ERROR_TIME_WINDOW}ms, forcing config reload`);
            this.unhealthyErrors = [];
            await this.loadRpcConfig();
        }
    }

    public startConfigRefresh(intervalMs: number = 60000): void {
        if (this.configRefreshInterval) {
            return;
        }

        logger.info(`Starting RPC config refresh with ${intervalMs}ms interval`);

        this.configRefreshInterval = setInterval(async () => {
            try {
                const hasChanged = await this.hasConfigChanged();
                if (hasChanged) {
                    logger.info('RPC configuration file changed, reloading...');
                    await this.loadRpcConfig();
                }
            } catch (error) {
                logger.error('Failed to refresh RPC configurations:', error);
            }
        }, intervalMs);
    }

    public stopConfigRefresh(): void {
        if (this.configRefreshInterval) {
            clearInterval(this.configRefreshInterval);
            this.configRefreshInterval = null;
            logger.info('RPC config refresh stopped');
        }
    }

    public async loadRpcConfig(): Promise<void> {
        try {
            const configPath = path.join(process.cwd(), CONFIG_PATHS.RPC_CONFIG);
            const content = await fs.readFile(configPath, 'utf-8');
            const configFile: RpcConfigFile = JSON.parse(content);

            if (!configFile.chains || !Array.isArray(configFile.chains)) {
                throw new Error(ERROR_MESSAGES.INVALID_CONFIG);
            }

            const redis = RedisManager.getInstance().getClient();
            const healthChecker = HealthChecker.getInstance();

            // Get all current URLs before update
            const currentHealthData = await redis.hGetAll(REDIS_KEYS.HEALTH_SET);
            const currentUrls = new Set(Object.keys(currentHealthData));

            // Get new URLs from config
            const newUrls = new Set<string>();
            configFile.chains.forEach(chain => {
                chain.urls.forEach(url => newUrls.add(url));
            });

            // finding URLs to remove (in current but not in new config)
            const urlsToRemove = Array.from(currentUrls).filter(url => !newUrls.has(url));

            // start redis transaction
            const multi = redis.multi();

            // clear existing configurations
            const existingKeys = await redis.keys(`${REDIS_KEYS.CHAIN_PREFIX}*`);
            if (existingKeys.length > 0) {
                multi.del(existingKeys);
            }

            // remove health data for removed URLs
            if (urlsToRemove.length > 0) {
                for (const url of urlsToRemove) {
                    multi.hDel(REDIS_KEYS.HEALTH_SET, url);
                }
                logger.info(`Removing health data for URLs:`, urlsToRemove);
            }

            // loading new configurations
            for (const config of configFile.chains) {
                logger.info(`Loading configuration for chain ${config.name} (${config.chainId})`);

                const chainKey = `${REDIS_KEYS.CHAIN_PREFIX}${config.chainId}`;
                multi.hSet(chainKey, 'config', JSON.stringify(config));
                multi.expire(chainKey, environment.redis.configTtl);

                // health checks are handled separately
                for (const url of config.urls) {
                    await healthChecker.checkHealth(url);
                }
            }

            // TTL for health data
            multi.expire(REDIS_KEYS.HEALTH_SET, environment.redis.healthTtl);

            // execute over redis transaction
            await multi.exec();

            logger.info('RPC configurations loaded successfully', {
                chainCount: configFile.chains.length,
                chains: configFile.chains.map(c => `${c.name} (${c.chainId})`),
                removedUrls: urlsToRemove.length,
            });
        } catch (error) {
            logger.error('Failed to load RPC configurations:', error);
            throw error;
        }
    }

    public async getChainConfig(chainId: number): Promise<RpcConfig | null> {
        try {
            const redis = RedisManager.getInstance().getClient();
            const configJson = await redis.hGet(
                `${REDIS_KEYS.CHAIN_PREFIX}${chainId}`,
                'config'
            );

            return configJson ? JSON.parse(configJson) : null;
        } catch (error) {
            logger.error(`Failed to get chain config for chainId ${chainId}:`, error);
            throw error;
        }
    }

    public async getHealthyRpcUrl(chainId: number): Promise<string> {
        try {
            const redis = RedisManager.getInstance().getClient();

            // getting chain configuration
            const config = await this.getChainConfig(chainId);
            if (!config) {
                throw new Error(ERROR_MESSAGES.CHAIN_NOT_FOUND);
            }

            const healthData = await redis.hGetAll(REDIS_KEYS.HEALTH_SET);

            // Filter healthy URLs for this chain
            const healthyUrls = config.urls.filter(url => {
                const health: RpcHealth = JSON.parse(healthData[url] || '{}');
                return health.healthy && health.failCount < environment.rpc.maxFailCount;
            });

            if (healthyUrls.length === 0) {
                await this.checkForceReload();
                throw new Error(ERROR_MESSAGES.NO_HEALTHY_RPC);
            }

            // with lowest response time
            const urlsByResponseTime = healthyUrls.sort((a, b) => {
                const healthA: RpcHealth = JSON.parse(healthData[a]);
                const healthB: RpcHealth = JSON.parse(healthData[b]);
                return healthA.responseTime - healthB.responseTime;
            });

            logger.debug(`Selected RPC URL for chain ${chainId}`, {
                url: urlsByResponseTime[0],
                availableUrls: healthyUrls.length
            });

            return urlsByResponseTime[0];
        } catch (error) {
            logger.error(`Failed to get healthy RPC URL for chainId ${chainId}:`, error);
            throw error;
        }
    }

    public async createSession(chainId: number): Promise<RpcSession> {
        try {
            const url = await this.getHealthyRpcUrl(chainId);
            const session: RpcSession = {
                id: uuidv4(),
                url,
                chainId,
                createdAt: new Date(),
                lastUsed: new Date(),
                requestCount: 0
            };

            const redis = RedisManager.getInstance().getClient();
            await redis.setEx(
                `${REDIS_KEYS.SESSION_PREFIX}${session.id}`,
                environment.redis.sessionTtl,
                JSON.stringify(session)
            );

            logger.debug(`Created new session`, {
                sessionId: session.id,
                chainId,
                url
            });

            return session;
        } catch (error) {
            logger.error(`Failed to create session for chainId ${chainId}:`, error);
            throw error;
        }
    }

    public async getSession(sessionId: string): Promise<RpcSession | null> {
        try {
            const redis = RedisManager.getInstance().getClient();
            const sessionJson = await redis.get(`${REDIS_KEYS.SESSION_PREFIX}${sessionId}`);

            if (!sessionJson) {
                return null;
            }

            return JSON.parse(sessionJson);
        } catch (error) {
            logger.error(`Failed to get session ${sessionId}:`, error);
            throw error;
        }
    }

    public async updateSession(session: RpcSession): Promise<void> {
        try {
            const redis = RedisManager.getInstance().getClient();
            session.lastUsed = new Date();
            session.requestCount++;

            await redis.setEx(
                `${REDIS_KEYS.SESSION_PREFIX}${session.id}`,
                environment.redis.sessionTtl,
                JSON.stringify(session)
            );

            logger.debug(`Updated session`, {
                sessionId: session.id,
                requestCount: session.requestCount,
                lastUsed: session.lastUsed
            });
        } catch (error) {
            logger.error(`Failed to update session ${session.id}:`, error);
            throw error;
        }
    }

    public async cleanupSessions(): Promise<void> {
        try {
            const redis = RedisManager.getInstance().getClient();
            const sessionKeys = await redis.keys(`${REDIS_KEYS.SESSION_PREFIX}*`);

            let cleanedCount = 0;
            for (const key of sessionKeys) {
                const sessionJson = await redis.get(key);
                if (!sessionJson) continue;

                const session: RpcSession = JSON.parse(sessionJson);
                const lastUsedTime = new Date(session.lastUsed).getTime();
                const currentTime = Date.now();

                if (currentTime - lastUsedTime > environment.redis.sessionTtl * 1000) {
                    await redis.del(key);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                logger.info(`Cleaned up ${cleanedCount} expired sessions`);
            }
        } catch (error) {
            logger.error('Failed to cleanup sessions:', error);
            throw error;
        }
    }

    public async deleteSession(sessionId: string): Promise<void> {
        try {
            const redis = RedisManager.getInstance().getClient();
            await redis.del(`${REDIS_KEYS.SESSION_PREFIX}${sessionId}`);

            logger.debug(`Deleted session ${sessionId}`);
        } catch (error) {
            logger.error(`Failed to delete session ${sessionId}:`, error);
            throw error;
        }
    }

    public async getChainStats(chainId: number): Promise<{
        totalSessions: number;
        activeUrls: number;
        healthyUrls: number;
        averageResponseTime: number;
    }> {
        try {
            const redis = RedisManager.getInstance().getClient();
            const config = await this.getChainConfig(chainId);

            if (!config) {
                throw new Error(ERROR_MESSAGES.CHAIN_NOT_FOUND);
            }

            const healthData = await redis.hGetAll(REDIS_KEYS.HEALTH_SET);
            const sessionKeys = await redis.keys(`${REDIS_KEYS.SESSION_PREFIX}*`);

            let chainSessions = 0;
            for (const key of sessionKeys) {
                const sessionJson = await redis.get(key);
                if (!sessionJson) continue;

                const session: RpcSession = JSON.parse(sessionJson);
                if (session.chainId === chainId) {
                    chainSessions++;
                }
            }

            const urlHealths = config.urls.map(url => {
                const health: RpcHealth = JSON.parse(healthData[url] || '{}');
                return health;
            }).filter(health => health.url);

            const healthyUrls = urlHealths.filter(health =>
                health.healthy && health.failCount < environment.rpc.maxFailCount
            ).length;

            const averageResponseTime = urlHealths.length > 0
                ? urlHealths.reduce((sum, health) => sum + health.responseTime, 0) / urlHealths.length
                : 0;

            return {
                totalSessions: chainSessions,
                activeUrls: urlHealths.length,
                healthyUrls,
                averageResponseTime
            };
        } catch (error) {
            logger.error(`Failed to get chain stats for chainId ${chainId}:`, error);
            throw error;
        }
    }


    public async getAllChainConfigs(): Promise<RpcConfig[]> {
        try {
            const redis = RedisManager.getInstance().getClient();
            const keys = await redis.keys(`${REDIS_KEYS.CHAIN_PREFIX}*`);
            const configs: RpcConfig[] = [];

            for (const key of keys) {
                const configJson = await redis.hGet(key, 'config');
                if (configJson) {
                    configs.push(JSON.parse(configJson));
                }
            }

            return configs.sort((a, b) => a.chainId - b.chainId);
        } catch (error) {
            logger.error('Failed to get all chain configs:', error);
            throw error;
        }
    }

    public async getUrlDetails(chainId: number): Promise<Array<{
        url: string;
        healthy: boolean;
        failCount: number;
        responseTime: number;
        lastCheck: Date;
    }>> {
        try {
            const redis = RedisManager.getInstance().getClient();
            const config = await this.getChainConfig(chainId);

            if (!config) {
                throw new Error('Chain not found');
            }

            const healthData = await redis.hGetAll(REDIS_KEYS.HEALTH_SET);

            return config.urls.map(url => {
                const health = JSON.parse(healthData[url] || '{}');
                return {
                    url,
                    healthy: health.healthy || false,
                    failCount: health.failCount || 0,
                    responseTime: health.responseTime || 0,
                    lastCheck: health.lastCheck ? new Date(health.lastCheck) : new Date()
                };
            });
        } catch (error) {
            logger.error(`Failed to get URL details for chain ${chainId}:`, error);
            throw error;
        }
    }
}