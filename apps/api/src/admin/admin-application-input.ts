import { HttpStatus } from '@nestjs/common';
import {
  ADMIN_APPLICATION_QUEUE_STATUSES,
  ADMIN_ERROR_CODES,
  APPLICATION_ERROR_CODES,
  type AdminApplicationQueueStatus,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

export const ADMIN_QUEUE_PAGE_SIZE = 5;
export const ADMIN_QUEUE_PAGE_MAX = 10_000;
export const ADMIN_DECISION_NOTE_MAX = 2000;
export const ADMIN_COUNTRY_FILTER_MAX = 100;
export const ADMIN_APPLICATION_ID_MAX = 64;

const QUEUE_STATUSES = new Set<string>(ADMIN_APPLICATION_QUEUE_STATUSES);

export function parseQueueStatus(value: unknown): AdminApplicationQueueStatus {
  const scalar = scalarQuery(
    value,
    'status',
    'Choose a valid application status.',
  );
  if (scalar === null) return 'SUBMITTED';
  if (QUEUE_STATUSES.has(scalar)) {
    return scalar as AdminApplicationQueueStatus;
  }
  throw new ApiError(
    ADMIN_ERROR_CODES.actionInvalidState,
    'Choose a valid application review tab.',
    HttpStatus.BAD_REQUEST,
    { status: ['Choose a valid application status.'] },
  );
}

export function parseQueuePage(value: unknown): number {
  const scalar = scalarQuery(value, 'page', 'Choose a valid page.');
  if (scalar === null) return 1;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw new ApiError(
      ADMIN_ERROR_CODES.actionInvalidState,
      'Choose a valid page.',
      HttpStatus.BAD_REQUEST,
      { page: ['Choose a valid page.'] },
    );
  }
  const page = Number.parseInt(scalar, 10);
  if (page > ADMIN_QUEUE_PAGE_MAX) {
    throw new ApiError(
      ADMIN_ERROR_CODES.actionInvalidState,
      'Choose a valid page.',
      HttpStatus.BAD_REQUEST,
      { page: ['Choose a valid page.'] },
    );
  }
  return page;
}

export function parseCountryFilter(value: unknown): string | null {
  const scalar = scalarQuery(value, 'country', 'Choose a valid country.');
  if (scalar === null) return null;
  const country = scalar.trim();
  if (!country) return null;
  if (country.length > ADMIN_COUNTRY_FILTER_MAX) {
    throw new ApiError(
      ADMIN_ERROR_CODES.actionInvalidState,
      'Choose a valid country filter.',
      HttpStatus.BAD_REQUEST,
      { country: ['Choose a valid country.'] },
    );
  }
  return country;
}

export function parseApplicationId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ADMIN_APPLICATION_ID_MAX ||
    value.includes('\0')
  ) {
    throw new ApiError(
      APPLICATION_ERROR_CODES.notFound,
      'No founder application was found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return value;
}

export function parseRequiredDecisionNote(
  body: unknown,
  field: 'note' | 'reason',
): string {
  const record = parseDecisionRecord(body, new Set([field]));
  const source = record[field];
  if (typeof source !== 'string') {
    throw validationError(field, `Enter a ${field}.`);
  }
  const note = source.replace(/\r\n?/g, '\n').trim();
  if (!note) {
    throw validationError(field, `Enter a ${field}.`);
  }
  if (note.length > ADMIN_DECISION_NOTE_MAX) {
    throw validationError(
      field,
      `Use ${String(ADMIN_DECISION_NOTE_MAX)} characters or fewer.`,
    );
  }
  return note;
}

export function parseApproveBody(body: unknown): void {
  parseDecisionRecord(body, new Set());
}

function parseDecisionRecord(
  body: unknown,
  allowed: Set<string>,
): Record<string, unknown> {
  if (body === undefined || body === null || body === '') {
    if (allowed.size === 0) return {};
    throw validationError([...allowed][0] ?? 'body', 'Enter a decision.');
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw validationError([...allowed][0] ?? 'body', 'Enter a valid decision.');
  }
  const record = body as Record<string, unknown>;
  const fieldErrors: Record<string, string[]> = {};
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fieldErrors[key] = ['This field cannot be changed.'];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiError(
      ADMIN_ERROR_CODES.actionInvalidState,
      'Review the decision details and try again.',
      HttpStatus.BAD_REQUEST,
      fieldErrors,
    );
  }
  return record;
}

function scalarQuery(
  value: unknown,
  field: string,
  message: string,
): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value) || typeof value !== 'string') {
    throw new ApiError(
      ADMIN_ERROR_CODES.actionInvalidState,
      message,
      HttpStatus.BAD_REQUEST,
      { [field]: [message] },
    );
  }
  return value;
}

function validationError(field: string, message: string): ApiError {
  return new ApiError(
    ADMIN_ERROR_CODES.actionInvalidState,
    'Review the decision details and try again.',
    HttpStatus.BAD_REQUEST,
    { [field]: [message] },
  );
}
