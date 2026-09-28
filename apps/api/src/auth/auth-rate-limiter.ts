import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';
import { RedisService } from '../redis/redis.service.js';
import { SessionService } from './session.service.js';

export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
export const AUTH_RATE_LIMITS = {
  signup: 5,
  signin: 10,
} as const;

@Injectable()
export class AuthRateLimiter {
  constructor(
    @Inject(RedisService)
    private readonly redis: RedisService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
  ) {}

  async check(
    action: keyof typeof AUTH_RATE_LIMITS,
    ipAddress: string,
  ): Promise<void> {
    const clientHash = this.sessions.hashRateLimitClient(ipAddress);
    const key = `auth-rate:v1:${action}:${clientHash}`;

    try {
      const count = await this.redis.incrementFixedWindow(
        key,
        AUTH_RATE_LIMIT_WINDOW_SECONDS,
      );
      if (count > AUTH_RATE_LIMITS[action]) {
        throw this.rateLimitedError();
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      // Authentication controls fail closed when ephemeral infrastructure fails.
      throw this.rateLimitedError();
    }
  }

  private rateLimitedError(): ApiError {
    return new ApiError(
      AUTH_ERROR_CODES.rateLimited,
      'Too many authentication attempts. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
