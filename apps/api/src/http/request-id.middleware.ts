import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.header('x-request-id');
    const requestId =
      supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();

    response.locals.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
