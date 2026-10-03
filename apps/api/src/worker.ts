import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { NotificationDeliveryWorker } from './notifications/notification-delivery.service.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();

  const worker = app.get(NotificationDeliveryWorker);
  await worker.run();
}

void bootstrap();
