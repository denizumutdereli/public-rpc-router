import axios from 'axios';
import { REDIS_KEYS } from '../config/constants';
import { environment } from '../config/environment';
import { RpcHealth } from '../types';
import { logger } from '../utils/logger';
import RedisManager from './redis';

export class HealthChecker {
  private static instance: HealthChecker;
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): HealthChecker {
    if (!HealthChecker.instance) {
      HealthChecker.instance = new HealthChecker();
    }
    return HealthChecker.instance;
  }

  public async checkHealth(url: string): Promise<RpcHealth> {
    const startTime = Date.now();
    try {
      const response = await axios.post(url, {
        jsonrpc: '2.0',
        method: 'net_version',
        params: [],
        id: 1,
      }, {
        timeout: 5000,
      });

      const isHealthy = response.status === 200 && response.data?.result !== undefined;

      const health: RpcHealth = {
        url,
        healthy: isHealthy,
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        failCount: 0  // Reset fail count when healthy
      };

      if (isHealthy) {
        logger.info(`RPC endpoint ${url} is healthy again`);
      }

      await this.updateHealthStatus(health);
      return health;
    } catch (error) {
      const health: RpcHealth = {
        url,
        healthy: false,
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        failCount: await this.incrementFailCount(url),
      };

      await this.updateHealthStatus(health);
      logger.error(`Health check failed for ${url}:`, error);
      return health;
    }
  }

  private async updateHealthStatus(health: RpcHealth): Promise<void> {
    const redis = RedisManager.getInstance().getClient();
    await redis.hSet(
      REDIS_KEYS.HEALTH_SET,
      health.url,
      JSON.stringify(health)
    );
  }

  private async incrementFailCount(url: string): Promise<number> {
    const redis = RedisManager.getInstance().getClient();
    const currentHealth = await redis.hGet(REDIS_KEYS.HEALTH_SET, url);
    
    if (currentHealth) {
      const health: RpcHealth = JSON.parse(currentHealth);
      const newFailCount = health.failCount + 1;
      
      if (newFailCount >= environment.rpc.maxFailCount) {
        logger.warn(`RPC endpoint ${url} has failed ${newFailCount} times consecutively`);
      }
      
      return newFailCount;
    }
    
    return 1;
  }

  public startHealthCheck(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(
      async () => {
        const redis = RedisManager.getInstance().getClient();
        const healthData = await redis.hGetAll(REDIS_KEYS.HEALTH_SET);
        
        for (const [url, healthJson] of Object.entries(healthData)) {
          const health: RpcHealth = JSON.parse(healthJson);
          await this.checkHealth(url);
        }
      },
      environment.rpc.healthCheckInterval
    );

    logger.info(`Health checker started with ${environment.rpc.healthCheckInterval}ms interval`);
  }

  public stopHealthCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Health checker stopped');
    }
  }
}