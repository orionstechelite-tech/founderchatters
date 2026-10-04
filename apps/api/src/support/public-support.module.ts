import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { PublicSupportController } from './public-support.controller.js';
import { PublicSupportRateLimiter } from './public-support-rate-limiter.js';
import { PublicSupportService } from './public-support.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PublicSupportController],
  providers: [OriginGuard, PublicSupportRateLimiter, PublicSupportService],
})
export class PublicSupportModule {}
