import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';
import { RedisService } from '../redis/redis.service.js';
import { SessionService } from './session.service.js';

export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
export const AUTH_RECIPIENT_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
export const AUTH_RATE_LIMITS = {
  signup: 5,
  signin: 10,
  resendVerification: 5,
  verifyEmail: 10,
  forgotPassword: 5,
  resetPassword: 10,
} as const;
export const AUTH_RECIPIENT_RATE_LIMITS = {
  resendVerification: 3,
  forgotPassword: 3,
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

    await this.incrementOrReject(
      key,
      AUTH_RATE_LIMIT_WINDOW_SECONDS,
      AUTH_RATE_LIMITS[action],
    );
  }

  async checkRecipient(
    action: keyof typeof AUTH_RECIPIENT_RATE_LIMITS,
    normalizedEmail: string,
  ): Promise<void> {
    const recipientHash = this.sessions.hashRateLimitRecipient(
      action,
      normalizedEmail,
    );
    const key = `auth-rate:v1:recipient:${action}:${recipientHash}`;
    await this.incrementOrReject(
      key,
      AUTH_RECIPIENT_RATE_LIMIT_WINDOW_SECONDS,
      AUTH_RECIPIENT_RATE_LIMITS[action],
    );
  }

  private async incrementOrReject(
    key: string,
    windowSeconds: number,
    limit: number,
  ): Promise<void> {
    try {
      const count = await this.redis.incrementFixedWindow(key, windowSeconds);
      if (count > limit) {
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
