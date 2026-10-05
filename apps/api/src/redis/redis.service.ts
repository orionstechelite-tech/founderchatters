import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

import { AppConfig } from '../config.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client;
  private connecting: Promise<void> | null = null;

  constructor(@Inject(AppConfig) config: AppConfig) {
    this.client = createClient({
      url: config.redisUrl,
      socket: {
        connectTimeout: 1_000,
        reconnectStrategy: false,
      },
    });
    this.client.on('error', () => {
      // Connection errors are handled by callers. Do not log Redis payloads.
    });
  }

  async checkConnectivity(): Promise<void> {
    await this.connect();
    const result = await this.client.ping();
    if (result !== 'PONG') {
      throw new Error('Redis ping failed');
    }
  }

  async incrementFixedWindow(
    key: string,
    windowSeconds: number,
  ): Promise<number> {
    await this.connect();
    const results = await this.client
      .multi()
      .incr(key)
      .expire(key, windowSeconds, 'NX')
      .exec();
    const count = results[0];

    if (typeof count !== 'number') {
      throw new Error('Redis rate-limit increment failed');
    }
    return count;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private async connect(): Promise<void> {
    if (this.client.isReady) {
      return;
    }
    this.connecting ??= this.client.connect().then(() => undefined);
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }
}
