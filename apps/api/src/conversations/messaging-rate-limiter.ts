import { Inject, Injectable } from '@nestjs/common';
import { MESSAGING_LIMITS } from '@founderchatters/contracts';

import { SessionService } from '../auth/session.service.js';
import { ApiError } from '../http/api-error.js';
import { RedisService } from '../redis/redis.service.js';
import { messagingRateLimited } from './conversations-query.js';

export const MESSAGING_RATE_LIMIT_KEY_PREFIX = 'messaging-rate:v1:send:';

@Injectable()
export class MessagingRateLimiter {
  constructor(
    @Inject(RedisService)
    private readonly redis: RedisService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
  ) {}

  keyForSender(userId: string): string {
    const actorHash = this.sessions.hashRateLimitActor(userId);
    return `${MESSAGING_RATE_LIMIT_KEY_PREFIX}${actorHash}`;
  }

  async consumeNewMessage(userId: string): Promise<void> {
    const key = this.keyForSender(userId);
    try {
      const count = await this.redis.incrementFixedWindow(
        key,
        MESSAGING_LIMITS.sendWindowSeconds,
      );
      if (count > MESSAGING_LIMITS.sendPerWindow) {
        throw messagingRateLimited();
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw messagingRateLimited();
    }
  }
}
