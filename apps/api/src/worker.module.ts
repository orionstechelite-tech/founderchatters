import { Module } from '@nestjs/common';

import { AppConfig } from './config.js';
import { PrismaService } from './database/prisma.service.js';
import {
  InMemoryNotificationEmailDelivery,
  NOTIFICATION_EMAIL_DELIVERY,
  NotificationEmailService,
} from './notifications/notification-email.service.js';
import {
  NotificationDeliveryService,
  NotificationDeliveryWorker,
} from './notifications/notification-delivery.service.js';

@Module({
  providers: [
    AppConfig,
    PrismaService,
    NotificationEmailService,
    NotificationDeliveryService,
    NotificationDeliveryWorker,
    InMemoryNotificationEmailDelivery,
    {
      provide: NOTIFICATION_EMAIL_DELIVERY,
      inject: [AppConfig, InMemoryNotificationEmailDelivery],
      useFactory: (
        config: AppConfig,
        memory: InMemoryNotificationEmailDelivery,
      ) => {
        if (config.emailProvider !== 'memory') {
          throw new Error(
            'Configured notification email provider adapter is unavailable',
          );
        }
        return memory;
      },
    },
  ],
})
export class WorkerModule {}
