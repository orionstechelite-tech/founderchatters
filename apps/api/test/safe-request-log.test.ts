import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/http/api-error.js';
import {
  buildSafeRequestLog,
  requestLogLeaksSensitiveData,
} from '../src/observability/safe-request-log.js';

describe('safe request logs', () => {
  it('records only safe request fields and strips query strings', () => {
    const log = buildSafeRequestLog({
      environment: 'staging',
      requestId: 'req-123',
      method: 'post',
      path: '/v1/auth/signin?token=raw-reset-token',
      status: 401,
      latencyMs: 12.4,
      error: new ApiError(
        'AUTH_INVALID_CREDENTIALS',
        'Invalid credentials.',
        HttpStatus.UNAUTHORIZED,
      ),
      actorUserId: 'user_abc',
    });

    expect(log).toEqual({
      service: 'api',
      environment: 'staging',
      requestId: 'req-123',
      route: 'POST /v1/auth/signin',
      status: 401,
      latencyMs: 12,
      errorCode: 'AUTH_INVALID_CREDENTIALS',
      actorUserId: 'user_abc',
    });
    expect(requestLogLeaksSensitiveData(log)).toBe(false);
    expect(JSON.stringify(log)).not.toContain('raw-reset-token');
  });

  it('omits unsafe actor IDs and non-ApiError details', () => {
    const log = buildSafeRequestLog({
      environment: 'staging',
      requestId: 'req-456',
      method: 'GET',
      path: '/v1/health/ready',
      status: 503,
      latencyMs: 8,
      error: new Error('postgresql://user:super-secret@db/app'),
      actorUserId: 'user id with spaces',
    });

    expect(log.actorUserId).toBeUndefined();
    expect(log.errorCode).toBeUndefined();
    expect(JSON.stringify(log)).not.toContain('super-secret');
    expect(JSON.stringify(log)).not.toMatch(/postgresql:\/\//);
    expect(requestLogLeaksSensitiveData(log)).toBe(false);
  });

  it('detects sensitive keys that must never be logged', () => {
    expect(
      requestLogLeaksSensitiveData({
        authorization: 'Bearer abc',
        cookie: 'fc_session=abc',
      }),
    ).toBe(true);
    expect(
      requestLogLeaksSensitiveData({
        service: 'api',
        route: 'POST /v1/conversations',
      }),
    ).toBe(false);
    expect(
      requestLogLeaksSensitiveData({
        password: 'not-a-real-password',
      }),
    ).toBe(true);
  });
});
