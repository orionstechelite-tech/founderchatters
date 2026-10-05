import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { nestLoggerLevels, resolveLogLevel } from './config.js';
import { NotificationDeliveryWorker } from './notifications/notification-delivery.service.js';
import { WorkerModule } from './worker.module.js';

function runtimeLogLevel(): string {
  const value = process.env.NODE_ENV?.trim();
  const environment =
    value === 'test' ||
    value === 'staging' ||
    value === 'production' ||
    value === 'development'
      ? value
      : 'development';
  return resolveLogLevel(environment);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: nestLoggerLevels(runtimeLogLevel()),
  });
  app.enableShutdownHooks();

  const worker = app.get(NotificationDeliveryWorker);
  await worker.run();
}

void bootstrap();
