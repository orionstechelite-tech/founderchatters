import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  PUBLIC_SUPPORT_ERROR_CODES,
  PUBLIC_SUPPORT_LIMITS,
} from '@founderchatters/contracts';

import { SessionService } from '../auth/session.service.js';
import { ApiError } from '../http/api-error.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class PublicSupportRateLimiter {
  constructor(
    @Inject(RedisService)
    private readonly redis: RedisService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
  ) {}

  async checkClient(ipAddress: string): Promise<void> {
    const clientHash = this.sessions.hashRateLimitClient(ipAddress);
    await this.incrementOrReject(`support-rate:v1:create:${clientHash}`);
  }

  async checkEmail(normalizedEmail: string): Promise<void> {
    const recipientHash = this.sessions.hashRateLimitRecipient(
      'public-support',
      normalizedEmail,
    );
    await this.incrementOrReject(`support-rate:v1:email:${recipientHash}`);
  }

  private async incrementOrReject(key: string): Promise<void> {
    try {
      const count = await this.redis.incrementFixedWindow(
        key,
        PUBLIC_SUPPORT_LIMITS.windowSeconds,
      );
      if (count > PUBLIC_SUPPORT_LIMITS.submissionsPerWindow) {
        throw this.limited();
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw this.limited();
    }
  }

  private limited(): ApiError {
    return new ApiError(
      PUBLIC_SUPPORT_ERROR_CODES.rateLimited,
      'Too many support requests. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
