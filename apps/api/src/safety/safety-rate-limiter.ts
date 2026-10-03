import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { SAFETY_ERROR_CODES, SAFETY_LIMITS } from '@founderchatters/contracts';

import { SessionService } from '../auth/session.service.js';
import { ApiError } from '../http/api-error.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class SafetyRateLimiter {
  constructor(
    @Inject(RedisService)
    private readonly redis: RedisService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
  ) {}

  async consumeReport(userId: string): Promise<void> {
    const actorHash = this.sessions.hashRateLimitActor(userId);
    const key = `safety-rate:v1:report:${actorHash}`;
    try {
      const count = await this.redis.incrementFixedWindow(
        key,
        SAFETY_LIMITS.reportWindowSeconds,
      );
      if (count > SAFETY_LIMITS.reportsPerWindow) {
        throw this.limited();
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw this.limited();
    }
  }

  private limited(): ApiError {
    return new ApiError(
      SAFETY_ERROR_CODES.rateLimited,
      'Too many reports. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
