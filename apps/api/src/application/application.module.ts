import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { ApplicationController } from './application.controller.js';
import { ApplicationService } from './application.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationController],
  providers: [OriginGuard, ApplicationService],
})
export class ApplicationModule {}
