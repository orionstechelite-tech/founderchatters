import { HttpStatus } from '@nestjs/common';
import {
  DISCOVER_LIMITS,
  FOUNDER_ERROR_CODES,
  ONBOARDING_LIMITS,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

export type DiscoverQuery = {
  page: number;
  pageSize: number;
  q: string | null;
  country: string | null;
  industry: string | null;
  stage: string | null;
  expertiseTopicId: string | null;
  saved: boolean | null;
};

const USER_ID_MAX = 64;

export function parseFounderId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > USER_ID_MAX ||
    value.includes('\0')
  ) {
    throw founderNotFound();
  }
  return value;
}

export function founderNotFound(): ApiError {
  return new ApiError(
    FOUNDER_ERROR_CODES.notFound,
    'That founder is not available.',
    HttpStatus.NOT_FOUND,
  );
}

export function parseSaveBody(body: unknown): void {
  if (body === undefined || body === null || body === '') return;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(
      FOUNDER_ERROR_CODES.invalidSave,
      'This request cannot include a body.',
      HttpStatus.BAD_REQUEST,
      { body: ['This request cannot include a body.'] },
    );
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length === 0) return;
  const fieldErrors: Record<string, string[]> = {};
  for (const key of keys) {
    fieldErrors[key] = ['This field cannot be changed.'];
  }
  throw new ApiError(
    FOUNDER_ERROR_CODES.invalidSave,
    'This request cannot include a body.',
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}

export function parseDiscoverQuery(
  query: Record<string, unknown>,
): DiscoverQuery {
  rejectUnknownQuery(query, [
    'page',
    'pageSize',
    'q',
    'country',
    'industry',
    'stage',
    'expertiseTopicId',
    'saved',
  ]);
  return {
    page: parsePage(query.page),
    pageSize: parsePageSize(query.pageSize),
    q: parseBoundedText(query.q, 'q', DISCOVER_LIMITS.queryMax),
    country: parseFilterText(
      query.country,
      'country',
      ONBOARDING_LIMITS.country,
    ),
    industry: parseFilterText(
      query.industry,
      'industry',
      ONBOARDING_LIMITS.industry,
    ),
    stage: parseFilterText(query.stage, 'stage', ONBOARDING_LIMITS.stage),
    expertiseTopicId: parseTopicId(query.expertiseTopicId),
    saved: parseSavedFlag(query.saved),
  };
}

export function parseSavedFoundersQuery(
  query: Record<string, unknown>,
): Pick<DiscoverQuery, 'page' | 'pageSize'> {
  rejectUnknownQuery(query, ['page', 'pageSize']);
  return {
    page: parsePage(query.page),
    pageSize: parsePageSize(query.pageSize),
  };
}

function rejectUnknownQuery(
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
  throwIfFields(fieldErrors);
}

function parsePage(value: unknown): number {
  const scalar = scalarQuery(value, 'page');
  if (scalar === null) return 1;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('page', 'Choose a valid page.');
  }
  const page = Number.parseInt(scalar, 10);
  if (page > DISCOVER_LIMITS.pageMax) {
    throw queryError('page', 'Choose a valid page.');
  }
  return page;
}

function parsePageSize(value: unknown): number {
  const scalar = scalarQuery(value, 'pageSize');
  if (scalar === null) return DISCOVER_LIMITS.pageSizeDefault;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('pageSize', 'Choose a valid page size.');
  }
  const pageSize = Number.parseInt(scalar, 10);
  if (pageSize > DISCOVER_LIMITS.pageSizeMax) {
    throw queryError(
      'pageSize',
      `Use ${String(DISCOVER_LIMITS.pageSizeMax)} or fewer results per page.`,
    );
  }
  return pageSize;
}

function parseBoundedText(
  value: unknown,
  field: string,
  max: number,
): string | null {
  const scalar = scalarQuery(value, field);
  if (scalar === null) return null;
  const trimmed = scalar.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw queryError(field, `Use ${String(max)} characters or fewer.`);
  }
  return trimmed;
}

function parseFilterText(
  value: unknown,
  field: string,
  max: number,
): string | null {
  if (value === '') {
    throw queryError(field, `Enter a valid ${field}.`);
  }
  const scalar = scalarQuery(value, field);
  if (scalar === null) return null;
  if (!scalar.trim()) {
    throw queryError(field, `Enter a valid ${field}.`);
  }
  const parsed = parseBoundedText(scalar, field, max);
  if (parsed && /[\0]/.test(parsed)) {
    throw queryError(field, `Enter a valid ${field}.`);
  }
  return parsed;
}

function parseTopicId(value: unknown): string | null {
  if (value === '') {
    throw queryError('expertiseTopicId', 'Choose a valid expertise topic.');
  }
  const scalar = scalarQuery(value, 'expertiseTopicId');
  if (scalar === null) return null;
  const topicId = scalar.trim();
  if (!topicId || topicId.length > USER_ID_MAX || topicId.includes('\0')) {
    throw queryError('expertiseTopicId', 'Choose a valid expertise topic.');
  }
  return topicId;
}

function parseSavedFlag(value: unknown): boolean | null {
  if (value === '') {
    throw queryError('saved', 'saved must be true or false.');
  }
  const scalar = scalarQuery(value, 'saved');
  if (scalar === null) return null;
  if (scalar === 'true') return true;
  if (scalar === 'false') return false;
  throw queryError('saved', 'saved must be true or false.');
}

function scalarQuery(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value) || typeof value !== 'string') {
    throw queryError(field, `Enter a valid ${field}.`);
  }
  return value;
}

function queryError(field: string, message: string): ApiError {
  return new ApiError(
    FOUNDER_ERROR_CODES.invalidQuery,
    'Review the search details and try again.',
    HttpStatus.BAD_REQUEST,
    { [field]: [message] },
  );
}

function throwIfFields(fieldErrors: Record<string, string[]>): void {
  if (Object.keys(fieldErrors).length === 0) return;
  throw new ApiError(
    FOUNDER_ERROR_CODES.invalidQuery,
    'Review the search details and try again.',
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}
