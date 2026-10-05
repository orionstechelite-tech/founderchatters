import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

export type HealthCheckState = 'up' | 'down';

export type LiveHealth = {
  status: 'live';
  service: 'api';
};

export type ReadyHealth = {
  status: 'ready' | 'not_ready';
  service: 'api';
  checks: {
    postgres: HealthCheckState;
    redis: HealthCheckState;
  };
};

const DEPENDENCY_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(RedisService)
    private readonly redis: RedisService,
  ) {}

  live(): LiveHealth {
    return {
      status: 'live',
      service: 'api',
    };
  }

  async ready(): Promise<ReadyHealth> {
    const [postgres, redis] = await Promise.all([
      this.probe(() => this.prisma.checkConnectivity()),
      this.probe(() => this.redis.checkConnectivity()),
    ]);
    const ready = postgres === 'up' && redis === 'up';

    return {
      status: ready ? 'ready' : 'not_ready',
      service: 'api',
      checks: {
        postgres,
        redis,
      },
    };
  }

  private async probe(check: () => Promise<void>): Promise<HealthCheckState> {
    try {
      await withTimeout(check(), DEPENDENCY_TIMEOUT_MS);
      return 'up';
    } catch {
      return 'down';
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('health check timed out'));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
