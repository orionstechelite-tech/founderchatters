import { Module } from '@nestjs/common';

import { AppConfig } from '../config.js';
import { PrismaService } from '../database/prisma.service.js';
import { OriginGuard } from '../http/origin.guard.js';
import { RedisService } from '../redis/redis.service.js';
import { AuthController } from './auth.controller.js';
import { AuthRateLimiter } from './auth-rate-limiter.js';
import { AuthService } from './auth.service.js';
import { AccountRecoveryService } from './account-recovery.service.js';
import { AuthTokenService } from './auth-token.service.js';
import {
  AuthEmailFailureReporter,
  AuthEmailService,
  EMAIL_DELIVERY,
  InMemoryEmailDelivery,
} from './email-delivery.service.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AppConfig,
    PrismaService,
    RedisService,
    PasswordHasher,
    SessionService,
    AuthRateLimiter,
    AuthService,
    AuthTokenService,
    AuthEmailService,
    AuthEmailFailureReporter,
    AccountRecoveryService,
    InMemoryEmailDelivery,
    {
      provide: EMAIL_DELIVERY,
      inject: [AppConfig, InMemoryEmailDelivery],
      useFactory: (config: AppConfig, memory: InMemoryEmailDelivery) => {
        if (config.emailProvider !== 'memory') {
          throw new Error('Configured email provider adapter is unavailable');
        }
        return memory;
      },
    },
    OriginGuard,
  ],
  exports: [SessionService],
})
export class AuthModule {}
