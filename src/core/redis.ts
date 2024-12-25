import { createClient, RedisClientType } from 'redis';
import { environment } from '../config/environment';
import { logger } from '../utils/logger';

class RedisManager {
  private static instance: RedisManager;
  private client: RedisClientType;
  private isConnected: boolean = false;

  private constructor() {
    this.client = createClient({
      url: environment.redis.url,
      password: environment.redis.password,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      logger.info('Redis client disconnected');
      this.isConnected = false;
    });
  }

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  public async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  public getClient(): RedisClientType {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }

  public isReady(): boolean {
    return this.isConnected;
  }
}

export default RedisManager;