import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { NotificationWriterService } from '../notifications/notification-writer.service.js';
import { HelpResponsesController } from './help-responses.controller.js';
import { HelpResponsesService } from './help-responses.service.js';
import { HelpConfirmationsController } from './help-confirmations.controller.js';
import { HelpConfirmationsService } from './help-confirmations.service.js';
import { IntroductionsController } from './introductions.controller.js';
import { ReputationController } from './reputation.controller.js';
import { ReputationService } from './reputation.service.js';
import { RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    HelpResponsesController,
    HelpConfirmationsController,
    IntroductionsController,
    RequestsController,
    ReputationController,
  ],
  providers: [
    OriginGuard,
    NotificationWriterService,
    RequestsService,
    HelpResponsesService,
    HelpConfirmationsService,
    ReputationService,
  ],
})
export class RequestsModule {}
