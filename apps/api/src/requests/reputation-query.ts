import { HttpStatus } from '@nestjs/common';
import {
  REPUTATION_ERROR_CODES,
  REPUTATION_LIMITS,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

export type ReputationQuery = {
  page: number;
  pageSize: number;
};

export function parseReputationQuery(
  query: Record<string, unknown>,
): ReputationQuery {
  rejectUnknown(query, ['page', 'pageSize']);
  return {
    page: parsePage(query.page),
    pageSize: parsePageSize(query.pageSize),
  };
}

function parsePage(value: unknown): number {
  const scalar = scalarQuery(value, 'page');
  if (scalar === null) return 1;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('page', 'Choose a valid page.');
  }
  const page = Number.parseInt(scalar, 10);
  if (page > REPUTATION_LIMITS.pageMax) {
    throw queryError('page', 'Choose a valid page.');
  }
  return page;
}

function parsePageSize(value: unknown): number {
  const scalar = scalarQuery(value, 'pageSize');
  if (scalar === null) return REPUTATION_LIMITS.pageSizeDefault;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('pageSize', 'Choose a valid page size.');
  }
  const pageSize = Number.parseInt(scalar, 10);
  if (pageSize > REPUTATION_LIMITS.pageSizeMax) {
    throw queryError(
      'pageSize',
      `Use ${String(REPUTATION_LIMITS.pageSizeMax)} or fewer results per page.`,
    );
  }
  return pageSize;
}

function scalarQuery(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value) || typeof value !== 'string') {
    throw queryError(field, `Enter a valid ${field}.`);
  }
  return value;
}

function rejectUnknown(
  query: Record<string, unknown>,
  allowed: string[],
): void {
  const allowedSet = new Set(allowed);
  const fieldErrors: Record<string, string[]> = {};
  for (const key of Object.keys(query)) {
    if (!allowedSet.has(key)) {
      fieldErrors[key] = ['This field cannot be changed.'];
    }
  }
  if (Object.keys(fieldErrors).length === 0) return;
  throw new ApiError(
    REPUTATION_ERROR_CODES.invalidInput,
    'Review the reputation query and try again.',
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}

function queryError(field: string, message: string): ApiError {
  return new ApiError(
    REPUTATION_ERROR_CODES.invalidInput,
    'Review the reputation query and try again.',
    HttpStatus.BAD_REQUEST,
    { [field]: [message] },
  );
}
