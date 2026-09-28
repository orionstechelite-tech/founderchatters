import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AUTH_ERROR_CODES } from '@founderchatters/contracts';
import type { Request } from 'express';

import { AppConfig } from '../config.js';
import { ApiError } from './api-error.js';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(AppConfig) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.header('origin');

    if (!origin || !this.config.allowedOrigins.has(origin)) {
      throw new ApiError(
        AUTH_ERROR_CODES.forbidden,
        'The request origin is not allowed.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
