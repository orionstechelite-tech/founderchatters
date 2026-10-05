import type { AddressInfo } from 'node:net';

import {
  Controller,
  Get,
  Logger,
  Module,
  type INestApplication,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppConfig } from '../src/config.js';
import { ApiError } from '../src/http/api-error.js';
import { ApiExceptionFilter } from '../src/http/api-exception.filter.js';
import { RequestIdMiddleware } from '../src/http/request-id.middleware.js';
import { RequestLoggingInterceptor } from '../src/observability/request-logging.interceptor.js';
import { requestLogLeaksSensitiveData } from '../src/observability/safe-request-log.js';

@Controller()
class ProbeController {
  @Get('ok')
  getOk(): { ok: true } {
    return { ok: true };
  }

  @Get('denied')
  getDenied(): never {
    throw new ApiError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.', 401);
  }

  @Get('boom')
  getBoom(): never {
    throw new Error('postgresql://secret-user:super-secret@db/app');
  }
}

@Module({
  controllers: [ProbeController],
  providers: [
    {
      provide: AppConfig,
      useValue: { environment: 'test' },
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
class ProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}

describe('request logging HTTP status', () => {
  let app: INestApplication;
  let baseUrl: string;
  const logs: unknown[] = [];

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      logs.push(message);
    });
    app = await NestFactory.create(ProbeModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  async function recordedLog(path: string): Promise<Record<string, unknown>> {
    logs.length = 0;
    await fetch(`${baseUrl}${path}`);
    await new Promise((resolve) => setImmediate(resolve));
    const log = logs.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'route' in entry &&
        String((entry as { route: string }).route).includes(
          path.split('?')[0] ?? '',
        ),
    ) as Record<string, unknown> | undefined;
    expect(log).toBeDefined();
    return log ?? {};
  }

  it('logs 200 for a successful request without query strings or bodies', async () => {
    const log = await recordedLog('/ok?token=raw-reset-token');
    expect(log).toMatchObject({
      service: 'api',
      environment: 'test',
      route: 'GET /ok',
      status: 200,
    });
    expect(JSON.stringify(log)).not.toContain('raw-reset-token');
    expect(log).not.toHaveProperty('body');
    expect(requestLogLeaksSensitiveData(log)).toBe(false);
  });

  it('logs the finalized ApiError 401 instead of the default 200', async () => {
    const log = await recordedLog('/denied');
    expect(log.status).toBe(401);
    expect(log.errorCode).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('logs 500 for unexpected errors without leaking the exception', async () => {
    const log = await recordedLog('/boom');
    expect(log.status).toBe(500);
    expect(log.errorCode).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(log)).not.toMatch(/postgresql:\/\/|super-secret/);
  });
});
