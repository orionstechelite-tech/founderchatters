import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RequestsController],
  providers: [OriginGuard, RequestsService],
})
export class RequestsModule {}
