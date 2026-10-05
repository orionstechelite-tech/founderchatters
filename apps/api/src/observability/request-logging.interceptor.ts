import {
  Inject,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable } from 'rxjs';

import { AppConfig } from '../config.js';
import { buildSafeRequestLog } from './safe-request-log.js';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  constructor(@Inject(AppConfig) private readonly config: AppConfig) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    response.once('finish', () => {
      this.write(request, response, started);
    });

    return next.handle();
  }

  private write(request: Request, response: Response, started: number): void {
    const locals = response.locals as {
      requestId?: string;
      actorUserId?: unknown;
      safeErrorCode?: unknown;
    };
    this.logger.log(
      buildSafeRequestLog({
        environment: this.config.environment,
        requestId: String(locals.requestId ?? 'unknown'),
        method: request.method,
        path: request.path || request.originalUrl || '/',
        status: response.statusCode,
        latencyMs: Date.now() - started,
        ...(typeof locals.safeErrorCode === 'string'
          ? { errorCode: locals.safeErrorCode }
          : {}),
        actorUserId: locals.actorUserId,
      }),
    );
  }
}
