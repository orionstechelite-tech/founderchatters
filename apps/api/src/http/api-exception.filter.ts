import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@founderchatters/contracts';
import type { Response } from 'express';

import { ApiError } from './api-error.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ApiErrorResponse = {
      error: {
        code:
          exception instanceof ApiError
            ? exception.code
            : status >= 500
              ? 'INTERNAL_ERROR'
              : 'AUTH_INVALID_CREDENTIALS',
        message:
          exception instanceof ApiError
            ? exception.message
            : status >= 500
              ? 'An unexpected error occurred.'
              : 'The request is invalid.',
        requestId: String(response.locals.requestId ?? 'unknown'),
        fieldErrors: exception instanceof ApiError ? exception.fieldErrors : {},
      },
    };

    response.status(status).json(body);
  }
}
