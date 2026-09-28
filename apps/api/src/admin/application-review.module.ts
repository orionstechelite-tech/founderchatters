import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import { ApplicationReviewController } from './application-review.controller.js';
import { ApplicationReviewService } from './application-review.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationReviewController],
  providers: [OriginGuard, AdminAuthService, ApplicationReviewService],
})
export class AdminApplicationModule {}
