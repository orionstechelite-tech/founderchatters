import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';

import { AppModule } from './app.module.js';
import { AppConfig } from './config.js';
import { configureTrustProxy } from './http/trust-proxy.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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
