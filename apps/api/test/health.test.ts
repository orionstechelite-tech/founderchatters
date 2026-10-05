import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { HealthController } from '../src/health/health.controller.js';
import { HealthService } from '../src/health/health.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { RedisService } from '../src/redis/redis.service.js';

function createHealthService(options?: {
  postgres?: () => Promise<void>;
  redis?: () => Promise<void>;
}): HealthService {
  return new HealthService(
    {
      checkConnectivity: options?.postgres ?? (async () => undefined),
    } as PrismaService,
    {
      checkConnectivity: options?.redis ?? (async () => undefined),
    } as RedisService,
  );
}

describe('HealthService', () => {
  it('reports process liveness without dependency checks', () => {
    const health = createHealthService({
      postgres: async () => {
        throw new Error('postgresql://secret-user:secret-pass@db/app');
      },
    });

    expect(health.live()).toEqual({
      status: 'live',
      service: 'api',
    });
  });

  it('reports ready when PostgreSQL and Redis respond', async () => {
    const health = createHealthService();
    await expect(health.ready()).resolves.toEqual({
      status: 'ready',
      service: 'api',
      checks: {
        postgres: 'up',
        redis: 'up',
      },
    });
  });

  it('reports not_ready when PostgreSQL is down and does not leak the failure', async () => {
    const health = createHealthService({
      postgres: async () => {
        throw new Error(
          'connect ECONNREFUSED postgresql://founderchatters:super-secret@localhost:5432/founderchatters',
        );
      },
    });

    const body = await health.ready();
    expect(body).toEqual({
      status: 'not_ready',
      service: 'api',
      checks: {
        postgres: 'down',
        redis: 'up',
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/postgresql:\/\//);
    expect(JSON.stringify(body)).not.toContain('super-secret');
    expect(JSON.stringify(body)).not.toContain('founderchatters');
  });

  it('reports not_ready when Redis is down and does not leak the failure', async () => {
    const health = createHealthService({
      redis: async () => {
        throw new Error('Redis AUTH failed redis://:redis-password@redis:6379');
      },
    });

    const body = await health.ready();
    expect(body).toEqual({
      status: 'not_ready',
      service: 'api',
      checks: {
        postgres: 'up',
        redis: 'down',
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/redis:\/\//);
    expect(JSON.stringify(body)).not.toContain('redis-password');
  });
});

describe('HealthController', () => {
  it('returns live status', () => {
    const controller = new HealthController(createHealthService());
    expect(controller.getLive()).toEqual({
      status: 'live',
      service: 'api',
    });
  });

  it('returns 200 for ready dependencies', async () => {
    const controller = new HealthController(createHealthService());
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await controller.getReady(response as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(response.json).toHaveBeenCalledWith({
      status: 'ready',
      service: 'api',
      checks: {
        postgres: 'up',
        redis: 'up',
      },
    });
  });

  it('returns 503 for unreadiness without leaking internals', async () => {
    const controller = new HealthController(
      createHealthService({
        postgres: async () => {
          throw new Error('DATABASE_URL=postgresql://leak:leak@db/app');
        },
        redis: async () => {
          throw new Error('REDIS_URL=redis://leak@redis');
        },
      }),
    );
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await controller.getReady(response as never);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    const body = response.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toEqual({
      status: 'not_ready',
      service: 'api',
      checks: {
        postgres: 'down',
        redis: 'down',
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /DATABASE_URL|REDIS_URL|postgresql:\/\/|redis:\/\//,
    );
  });
});
