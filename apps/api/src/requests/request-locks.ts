import { HttpStatus } from '@nestjs/common';
import { REQUEST_ERROR_CODES } from '@founderchatters/contracts';
import { Prisma } from '../../../../generated/prisma/client.js';

import type { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';

export const REQUEST_ROW_RETRY_ATTEMPTS = 8;

export async function lockUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
}

export async function lockRequest(
  tx: Prisma.TransactionClient,
  requestId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "Request" WHERE id = ${requestId} FOR UPDATE
  `;
}

export async function lockIntroductionOffer(
  tx: Prisma.TransactionClient,
  introductionId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "IntroductionOffer" WHERE id = ${introductionId} FOR UPDATE
  `;
}

export async function withRequestRowRetry<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= REQUEST_ROW_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const conflict = isTransactionConflict(error);
      if (conflict && attempt < REQUEST_ROW_RETRY_ATTEMPTS) {
        continue;
      }
      if (conflict) {
        throw new ApiError(
          REQUEST_ERROR_CODES.publishFailed,
          'We could not complete that request. Please try again.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }
  throw new ApiError(
    REQUEST_ERROR_CODES.publishFailed,
    'We could not complete that request. Please try again.',
    HttpStatus.CONFLICT,
  );
}

export function isTransactionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  ) {
    return true;
  }
  if ('code' in error && error.code === 'P2034') return true;
  const message = 'message' in error ? String(error.message) : '';
  return /could not serialize|write conflict|deadlock/i.test(message);
}
