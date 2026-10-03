import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { NotificationWriterService } from '../notifications/notification-writer.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { MessagingRateLimiter } from './messaging-rate-limiter.js';

@Module({
  imports: [AuthModule],
  controllers: [ConversationsController],
  providers: [
    OriginGuard,
    NotificationWriterService,
    ConversationsService,
    MessagingRateLimiter,
  ],
})
export class ConversationsModule {}
