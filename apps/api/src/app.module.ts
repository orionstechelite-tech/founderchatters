import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AdminApplicationModule } from './admin/application-review.module.js';
import { AppController } from './app.controller.js';
import { ApplicationModule } from './application/application.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { RequestIdMiddleware } from './http/request-id.middleware.js';

@Module({
  imports: [AuthModule, ApplicationModule, AdminApplicationModule],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
