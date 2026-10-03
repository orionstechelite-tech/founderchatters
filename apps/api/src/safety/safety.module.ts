import { Module } from '@nestjs/common';

import { AdminAuthService } from '../admin/admin-auth.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { ReportModerationController } from './report-moderation.controller.js';
import { ReportModerationService } from './report-moderation.service.js';
import { SafetyController } from './safety.controller.js';
import { SafetyRateLimiter } from './safety-rate-limiter.js';
import { SafetyService } from './safety.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SafetyController, ReportModerationController],
  providers: [
    OriginGuard,
    AdminAuthService,
    SafetyRateLimiter,
    SafetyService,
    ReportModerationService,
  ],
})
export class SafetyModule {}
