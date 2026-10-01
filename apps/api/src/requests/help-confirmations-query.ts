import { HttpStatus } from '@nestjs/common';
import {
  HELP_CONFIRMATION_ERROR_CODES,
  HELP_CONFIRMATION_LIMITS,
  HELP_OUTCOMES,
  type CreateHelpConfirmationBody,
  type CreateThankYouBody,
  type HelpOutcome,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

const ID_MAX = 64;
const ALLOWED_CONFIRMATION_FIELDS = new Set([
  'responseId',
  'outcome',
  'topicIds',
]);
const ALLOWED_THANK_YOU_FIELDS = new Set(['body']);
const OUTCOME_SET = new Set<string>(Object.values(HELP_OUTCOMES));

export function parseConfirmationId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ID_MAX ||
    value.includes('\0')
  ) {
    throw confirmationNotFound();
  }
  return value;
}

export function confirmationNotFound(): ApiError {
  return new ApiError(
    HELP_CONFIRMATION_ERROR_CODES.notFound,
    'That help confirmation is not available.',
    HttpStatus.NOT_FOUND,
  );
}

export function confirmationNotAllowed(): ApiError {
  return new ApiError(
    HELP_CONFIRMATION_ERROR_CODES.notAllowed,
    'You cannot confirm that help.',
    HttpStatus.FORBIDDEN,
  );
}

export function confirmationInvalidState(
  message = 'That help confirmation can no longer be changed.',
): ApiError {
  return new ApiError(
    HELP_CONFIRMATION_ERROR_CODES.invalidState,
    message,
    HttpStatus.CONFLICT,
  );
}

export function contributionNotEligible(): ApiError {
  return new ApiError(
    HELP_CONFIRMATION_ERROR_CODES.contributionNotEligible,
    'A thank-you can only be added after confirmed help.',
    HttpStatus.CONFLICT,
  );
}

export function thankYouAlreadyExists(): ApiError {
  return new ApiError(
    HELP_CONFIRMATION_ERROR_CODES.thankYouAlreadyExists,
    'A thank-you note already exists for this contribution.',
    HttpStatus.CONFLICT,
  );
}

export function parseHelpConfirmationBody(
  body: unknown,
): CreateHelpConfirmationBody {
  const value = requireObject(body, 'Enter help confirmation details.');
  rejectUnknown(value, ALLOWED_CONFIRMATION_FIELDS);
  const fieldErrors: Record<string, string[]> = {};

  if (
    typeof value.responseId !== 'string' ||
    value.responseId.length === 0 ||
    value.responseId.length > ID_MAX ||
    value.responseId.includes('\0')
  ) {
    fieldErrors.responseId = ['Choose a valid help response.'];
  }

  if (typeof value.outcome !== 'string' || !OUTCOME_SET.has(value.outcome)) {
    fieldErrors.outcome = ['Choose a valid outcome.'];
  }

  let topicIds: string[] | undefined;
  if ('topicIds' in value) {
    const parsed = parseTopicIds(value.topicIds);
    if (parsed.error) fieldErrors.topicIds = [parsed.error];
    else topicIds = parsed.value;
  }

  throwIfFields(fieldErrors, 'Review the help confirmation and try again.');
  const outcome = value.outcome as HelpOutcome;
  if (outcome !== HELP_OUTCOMES.helped && topicIds && topicIds.length > 0) {
    throw confirmationInvalidInput(
      {
        topicIds: ['Topics can only be recorded when help is confirmed.'],
      },
      'Review the help confirmation and try again.',
    );
  }
  const result: CreateHelpConfirmationBody = {
    responseId: value.responseId as string,
    outcome,
  };
  if (topicIds !== undefined) result.topicIds = topicIds;
  return result;
}

export function parseThankYouBody(body: unknown): CreateThankYouBody {
  const value = requireObject(body, 'Enter a thank-you note.');
  rejectUnknown(value, ALLOWED_THANK_YOU_FIELDS);
  if (!('body' in value)) {
    throw confirmationInvalidInput(
      { body: ['Enter a thank-you note.'] },
      'Review the thank-you note and try again.',
    );
  }
  const parsed = parseThankYouText(value.body);
  if (parsed.error) {
    throw confirmationInvalidInput(
      { body: [parsed.error] },
      'Review the thank-you note and try again.',
    );
  }
  return { body: parsed.value as string };
}

export function normalizeTopicIds(topicIds: string[] | undefined): string[] {
  return [...new Set(topicIds ?? [])];
}

export function sameTopicSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function parseTopicIds(value: unknown): { value?: string[]; error?: string } {
  if (!Array.isArray(value)) {
    return { error: 'Choose valid topics.' };
  }
  if (value.length > HELP_CONFIRMATION_LIMITS.topicIdsMax) {
    return {
      error: `Choose ${String(HELP_CONFIRMATION_LIMITS.topicIdsMax)} topics or fewer.`,
    };
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (
      typeof item !== 'string' ||
      item.length === 0 ||
      item.length > ID_MAX ||
      item.includes('\0')
    ) {
      return { error: 'Choose valid topics.' };
    }
    if (seen.has(item)) {
      return { error: 'Choose each topic only once.' };
    }
    seen.add(item);
    ids.push(item);
  }
  return { value: ids };
}

function parseThankYouText(value: unknown): { value?: string; error?: string } {
  if (typeof value !== 'string') {
    return { error: 'Enter a thank-you note.' };
  }
  const normalized = value.replace(/\r\n?/g, '\n');
  const trimmed = normalized.trim();
  if (!trimmed) {
    return { error: 'Enter a thank-you note.' };
  }
  if (trimmed.includes('\0')) {
    return { error: 'Enter a thank-you note.' };
  }
  if (trimmed.length < HELP_CONFIRMATION_LIMITS.thankYouMin) {
    return {
      error: `Use at least ${String(HELP_CONFIRMATION_LIMITS.thankYouMin)} character.`,
    };
  }
  if (trimmed.length > HELP_CONFIRMATION_LIMITS.thankYouMax) {
    return {
      error: `Use ${String(HELP_CONFIRMATION_LIMITS.thankYouMax)} characters or fewer.`,
    };
  }
  return { value: trimmed };
}

function requireObject(
  body: unknown,
  message: string,
): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw confirmationInvalidInput({ request: [message] }, message);
  }
  return body as Record<string, unknown>;
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: Set<string>,
): void {
  const fieldErrors: Record<string, string[]> = {};
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fieldErrors[key] = ['This field cannot be changed.'];
    }
  }
  throwIfFields(fieldErrors);
}

function throwIfFields(
  fieldErrors: Record<string, string[]>,
  message = 'Review the help confirmation and try again.',
): void {
  if (Object.keys(fieldErrors).length === 0) return;
  throw confirmationInvalidInput(fieldErrors, message);
}

export function confirmationInvalidInput(
  fieldErrors: Record<string, string[]>,
  message = 'Review the help confirmation and try again.',
): ApiError {
  return new ApiError(
    HELP_CONFIRMATION_ERROR_CODES.invalidInput,
    message,
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}
