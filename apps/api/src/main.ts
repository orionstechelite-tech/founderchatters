import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';

import { AppModule } from './app.module.js';
import { AppConfig, nestLoggerLevels, resolveLogLevel } from './config.js';
import { configureTrustProxy } from './http/trust-proxy.js';

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
  const app = await NestFactory.create(AppModule, {
    logger: nestLoggerLevels(runtimeLogLevel()),
  });
  const config = app.get(AppConfig);
  const port = process.env.PORT ?? 4000;

  configureTrustProxy(app.getHttpAdapter().getInstance() as Express, config);
  app.setGlobalPrefix('v1');
  app.enableCors({
    credentials: true,
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      callback(null, !origin || config.allowedOrigins.has(origin));
    },
  });
  app.enableShutdownHooks();
  await app.listen(port);
}

void bootstrap();
