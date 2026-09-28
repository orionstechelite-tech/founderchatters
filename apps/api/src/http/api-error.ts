import { HttpException, type HttpStatus } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message, status);
  }
}
