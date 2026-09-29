import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { HelpResponsesController } from './help-responses.controller.js';
import { HelpResponsesService } from './help-responses.service.js';
import { IntroductionsController } from './introductions.controller.js';
import { RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    HelpResponsesController,
    IntroductionsController,
    RequestsController,
  ],
  providers: [OriginGuard, RequestsService, HelpResponsesService],
})
export class RequestsModule {}
