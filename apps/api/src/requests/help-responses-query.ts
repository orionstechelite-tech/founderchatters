import { HttpStatus } from '@nestjs/common';
import {
  HELP_RESPONSE_ERROR_CODES,
  HELP_RESPONSE_LIMITS,
  type CreateAdviceBody,
  type CreateIntroductionBody,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

const INTRODUCTION_ID_MAX = 64;
const ALLOWED_ADVICE_FIELDS = new Set(['body']);
const ALLOWED_INTRODUCTION_FIELDS = new Set([
  'personName',
  'reason',
  'permissionConfirmed',
]);

export type HelpResponsesQuery = {
  page: number;
  pageSize: number;
};

export function parseIntroductionId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > INTRODUCTION_ID_MAX ||
    value.includes('\0')
  ) {
    throw introductionNotFound();
  }
  return value;
}

export function introductionNotFound(): ApiError {
  return new ApiError(
    HELP_RESPONSE_ERROR_CODES.introductionNotFound,
    'That introduction is not available.',
    HttpStatus.NOT_FOUND,
  );
}

export function helpNotAllowed(): ApiError {
  return new ApiError(
    HELP_RESPONSE_ERROR_CODES.notAllowed,
    'You cannot add this help response.',
    HttpStatus.FORBIDDEN,
  );
}

export function introductionInvalidState(): ApiError {
  return new ApiError(
    HELP_RESPONSE_ERROR_CODES.introductionInvalidState,
    'That introduction can no longer be updated.',
    HttpStatus.CONFLICT,
  );
}

export function parseAdviceBody(body: unknown): CreateAdviceBody {
  const value = requireObject(body);
  rejectUnknown(value, ALLOWED_ADVICE_FIELDS);
  if (!('body' in value)) {
    throw helpInvalidInput(
      { body: ['Enter your advice.'] },
      'Review your advice and try again.',
    );
  }
  const parsed = parseRequiredText(
    value.body,
    'body',
    HELP_RESPONSE_LIMITS.adviceMin,
    HELP_RESPONSE_LIMITS.adviceMax,
  );
  if (parsed.error) {
    throw helpInvalidInput(
      { body: [parsed.error] },
      'Review your advice and try again.',
    );
  }
  return { body: parsed.value as string };
}

export function parseIntroductionBody(body: unknown): CreateIntroductionBody {
  const value = requireObject(body);
  rejectUnknown(value, ALLOWED_INTRODUCTION_FIELDS);
  const fieldErrors: Record<string, string[]> = {};

  if (!('personName' in value)) {
    fieldErrors.personName = ['Enter a name, role or company.'];
  } else {
    const parsed = parseRequiredText(
      value.personName,
      'personName',
      HELP_RESPONSE_LIMITS.personNameMin,
      HELP_RESPONSE_LIMITS.personNameMax,
    );
    if (parsed.error) fieldErrors.personName = [parsed.error];
  }

  let reason: string | null = null;
  if ('reason' in value) {
    const parsed = parseOptionalText(
      value.reason,
      'reason',
      HELP_RESPONSE_LIMITS.reasonMax,
    );
    if (parsed.error) fieldErrors.reason = [parsed.error];
    else reason = parsed.value ?? null;
  }

  if (value.permissionConfirmed !== true) {
    fieldErrors.permissionConfirmed = [
      'Confirm you have permission to offer this introduction.',
    ];
  }

  throwIfFields(fieldErrors, 'Review the introduction and try again.');
  return {
    personName: parseRequiredText(
      value.personName,
      'personName',
      HELP_RESPONSE_LIMITS.personNameMin,
      HELP_RESPONSE_LIMITS.personNameMax,
    ).value as string,
    reason,
    permissionConfirmed: true,
  };
}

export function parsePrivateChatBody(body: unknown): void {
  if (body === undefined || body === null || body === '') return;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw helpInvalidInput(
      { body: ['This request cannot include a body.'] },
      'This request cannot include a body.',
    );
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length === 0) return;
  const fieldErrors: Record<string, string[]> = {};
  for (const key of keys) {
    fieldErrors[key] = ['This field cannot be changed.'];
  }
  throw helpInvalidInput(fieldErrors, 'This request cannot include a body.');
}

export function parseHelpResponsesQuery(
  query: Record<string, unknown>,
): HelpResponsesQuery {
  rejectUnknown(query, ['page', 'pageSize']);
  return {
    page: parsePage(query.page),
    pageSize: parsePageSize(query.pageSize),
  };
}

function parseRequiredText(
  value: unknown,
  field: string,
  min: number,
  max: number,
): { value?: string; error?: string } {
  if (typeof value !== 'string') {
    return { error: `Enter a valid ${field}.` };
  }
  const trimmed = value.replace(/\r\n?/g, '\n').trim();
  if (!trimmed) {
    return { error: `Enter a valid ${field}.` };
  }
  if (trimmed.includes('\0')) {
    return { error: `Enter a valid ${field}.` };
  }
  if (trimmed.length < min) {
    return { error: `Use at least ${String(min)} characters.` };
  }
  if (trimmed.length > max) {
    return { error: `Use ${String(max)} characters or fewer.` };
  }
  return { value: trimmed };
}

function parseOptionalText(
  value: unknown,
  field: string,
  max: number,
): { value?: string | null; error?: string } {
  if (value === null || value === '') return { value: null };
  if (typeof value !== 'string') {
    return { error: `Enter a valid ${field}.` };
  }
  const trimmed = value.replace(/\r\n?/g, '\n').trim();
  if (!trimmed) return { value: null };
  if (trimmed.includes('\0')) {
    return { error: `Enter a valid ${field}.` };
  }
  if (trimmed.length > max) {
    return { error: `Use ${String(max)} characters or fewer.` };
  }
  return { value: trimmed };
}

function parsePage(value: unknown): number {
  const scalar = scalarQuery(value, 'page');
  if (scalar === null) return 1;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('page', 'Choose a valid page.');
  }
  const page = Number.parseInt(scalar, 10);
  if (page > HELP_RESPONSE_LIMITS.pageMax) {
    throw queryError('page', 'Choose a valid page.');
  }
  return page;
}

function parsePageSize(value: unknown): number {
  const scalar = scalarQuery(value, 'pageSize');
  if (scalar === null) return HELP_RESPONSE_LIMITS.pageSizeDefault;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('pageSize', 'Choose a valid page size.');
  }
  const pageSize = Number.parseInt(scalar, 10);
  if (pageSize > HELP_RESPONSE_LIMITS.pageSizeMax) {
    throw queryError(
      'pageSize',
      `Use ${String(HELP_RESPONSE_LIMITS.pageSizeMax)} or fewer results per page.`,
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

function requireObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw helpInvalidInput(
      { request: ['Enter help response details.'] },
      'Review the help response and try again.',
    );
  }
  return body as Record<string, unknown>;
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: Set<string> | string[],
): void {
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
  const fieldErrors: Record<string, string[]> = {};
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      fieldErrors[key] = ['This field cannot be changed.'];
    }
  }
  throwIfFields(fieldErrors);
}

function queryError(field: string, message: string): ApiError {
  return helpInvalidInput({ [field]: [message] });
}

function throwIfFields(
  fieldErrors: Record<string, string[]>,
  message = 'Review the help response and try again.',
): void {
  if (Object.keys(fieldErrors).length === 0) return;
  throw helpInvalidInput(fieldErrors, message);
}

export function helpInvalidInput(
  fieldErrors: Record<string, string[]>,
  message = 'Review the help response and try again.',
): ApiError {
  return new ApiError(
    HELP_RESPONSE_ERROR_CODES.invalidInput,
    message,
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}
