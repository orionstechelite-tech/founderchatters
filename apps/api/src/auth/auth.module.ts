import { Module } from '@nestjs/common';

import { AppConfig } from '../config.js';
import { PrismaService } from '../database/prisma.service.js';
import { OriginGuard } from '../http/origin.guard.js';
import { RedisService } from '../redis/redis.service.js';
import { AuthController } from './auth.controller.js';
import { AuthRateLimiter } from './auth-rate-limiter.js';
import { AuthService } from './auth.service.js';
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
    OriginGuard,
  ],
  exports: [SessionService],
})
export class AuthModule {}
