import { HttpStatus } from '@nestjs/common';
import {
  MESSAGING_ERROR_CODES,
  MESSAGING_LIMITS,
  type CreateConversationBody,
  type SendMessageBody,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

const ID_MAX = 64;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATE_FIELDS = new Set(['privateChatOfferResponseId']);
const SEND_FIELDS = new Set(['clientMessageId', 'body']);

export type ConversationsListQuery = {
  page: number;
  pageSize: number;
  q: string | null;
};

export type MessagesHistoryQuery = {
  before: string | null;
  limit: number;
};

export function parseConversationId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ID_MAX ||
    value.includes('\0')
  ) {
    throw conversationNotFound();
  }
  return value;
}

export function conversationNotFound(): ApiError {
  return new ApiError(
    MESSAGING_ERROR_CODES.conversationNotFound,
    'That conversation is not available.',
    HttpStatus.NOT_FOUND,
  );
}

export function messagingNotAllowed(): ApiError {
  return new ApiError(
    MESSAGING_ERROR_CODES.notAllowed,
    'Messaging is unavailable.',
    HttpStatus.FORBIDDEN,
  );
}

export function messagingInvalidState(): ApiError {
  return new ApiError(
    MESSAGING_ERROR_CODES.invalidState,
    'This conversation cannot accept new messages.',
    HttpStatus.CONFLICT,
  );
}

export function messagingIdempotencyConflict(): ApiError {
  return new ApiError(
    MESSAGING_ERROR_CODES.idempotencyConflict,
    'That message identifier was already used with different content.',
    HttpStatus.CONFLICT,
  );
}

export function messagingRateLimited(): ApiError {
  return new ApiError(
    MESSAGING_ERROR_CODES.rateLimited,
    'Too many messages. Try again shortly.',
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function parseCreateConversationBody(
  body: unknown,
): CreateConversationBody {
  const value = requireObject(body);
  rejectUnknown(value, CREATE_FIELDS);
  if (!('privateChatOfferResponseId' in value)) {
    throw messagingInvalidInput(
      {
        privateChatOfferResponseId: ['Choose a private chat offer.'],
      },
      'Review the conversation and try again.',
    );
  }
  if (
    typeof value.privateChatOfferResponseId !== 'string' ||
    value.privateChatOfferResponseId.length === 0 ||
    value.privateChatOfferResponseId.length > ID_MAX ||
    value.privateChatOfferResponseId.includes('\0')
  ) {
    throw conversationNotFound();
  }
  return { privateChatOfferResponseId: value.privateChatOfferResponseId };
}

export function parseSendMessageBody(body: unknown): SendMessageBody {
  const value = requireObject(body);
  rejectUnknown(value, SEND_FIELDS);
  const fieldErrors: Record<string, string[]> = {};

  if (!('clientMessageId' in value)) {
    fieldErrors.clientMessageId = ['A message identifier is required.'];
  } else if (
    typeof value.clientMessageId !== 'string' ||
    !UUID_V4.test(value.clientMessageId)
  ) {
    fieldErrors.clientMessageId = ['Use a valid message identifier.'];
  }

  if (!('body' in value)) {
    fieldErrors.body = ['Enter a message.'];
  } else {
    const parsed = parseMessageBody(value.body);
    if (parsed.error) fieldErrors.body = [parsed.error];
  }

  throwIfFields(fieldErrors, 'Review your message and try again.');
  return {
    clientMessageId: (value.clientMessageId as string).toLowerCase(),
    body: parseMessageBody(value.body).value as string,
  };
}

export function parseConversationsListQuery(
  query: Record<string, unknown>,
): ConversationsListQuery {
  rejectUnknown(query, ['page', 'pageSize', 'q']);
  return {
    page: parsePage(query.page),
    pageSize: parsePageSize(query.pageSize),
    q: parseSearch(query.q),
  };
}

export function parseMessagesHistoryQuery(
  query: Record<string, unknown>,
): MessagesHistoryQuery {
  rejectUnknown(query, ['before', 'limit']);
  return {
    before: parseBefore(query.before),
    limit: parseLimit(query.limit),
  };
}

export function parseMessageBody(value: unknown): {
  value?: string;
  error?: string;
} {
  if (typeof value !== 'string') {
    return { error: 'Enter a message.' };
  }
  const trimmed = value.replace(/\r\n?/g, '\n').trim();
  if (!trimmed) {
    return { error: 'Enter a message.' };
  }
  if (trimmed.includes('\0')) {
    return { error: 'Enter a message.' };
  }
  if (trimmed.length < MESSAGING_LIMITS.bodyMin) {
    return { error: 'Enter a message.' };
  }
  if (trimmed.length > MESSAGING_LIMITS.bodyMax) {
    return {
      error: `Use ${String(MESSAGING_LIMITS.bodyMax)} characters or fewer.`,
    };
  }
  return { value: trimmed };
}

function parseSearch(value: unknown): string | null {
  const scalar = scalarQuery(value, 'q');
  if (scalar === null) return null;
  const trimmed = scalar.replace(/\r\n?/g, '\n').trim();
  if (!trimmed) return null;
  if (trimmed.includes('\0') || trimmed.length > MESSAGING_LIMITS.searchMax) {
    throw queryError('q', 'Enter a shorter search.');
  }
  return trimmed;
}

function parseBefore(value: unknown): string | null {
  const scalar = scalarQuery(value, 'before');
  if (scalar === null) return null;
  if (scalar.length === 0 || scalar.length > ID_MAX || scalar.includes('\0')) {
    throw queryError('before', 'Choose a valid message.');
  }
  return scalar;
}

function parsePage(value: unknown): number {
  const scalar = scalarQuery(value, 'page');
  if (scalar === null) return 1;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('page', 'Choose a valid page.');
  }
  const page = Number.parseInt(scalar, 10);
  if (page > MESSAGING_LIMITS.pageMax) {
    throw queryError('page', 'Choose a valid page.');
  }
  return page;
}

function parsePageSize(value: unknown): number {
  const scalar = scalarQuery(value, 'pageSize');
  if (scalar === null) return MESSAGING_LIMITS.pageSizeDefault;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('pageSize', 'Choose a valid page size.');
  }
  const pageSize = Number.parseInt(scalar, 10);
  if (pageSize > MESSAGING_LIMITS.pageSizeMax) {
    throw queryError(
      'pageSize',
      `Use ${String(MESSAGING_LIMITS.pageSizeMax)} or fewer results per page.`,
    );
  }
  return pageSize;
}

function parseLimit(value: unknown): number {
  const scalar = scalarQuery(value, 'limit');
  if (scalar === null) return MESSAGING_LIMITS.historyLimitDefault;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('limit', 'Choose a valid limit.');
  }
  const limit = Number.parseInt(scalar, 10);
  if (limit > MESSAGING_LIMITS.historyLimitMax) {
    throw queryError(
      'limit',
      `Use ${String(MESSAGING_LIMITS.historyLimitMax)} or fewer messages.`,
    );
  }
  return limit;
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
    throw messagingInvalidInput(
      { request: ['Enter conversation details.'] },
      'Review the conversation and try again.',
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
  return messagingInvalidInput({ [field]: [message] });
}

function throwIfFields(
  fieldErrors: Record<string, string[]>,
  message = 'Review the conversation and try again.',
): void {
  if (Object.keys(fieldErrors).length === 0) return;
  throw messagingInvalidInput(fieldErrors, message);
}

export function messagingInvalidInput(
  fieldErrors: Record<string, string[]> = {},
  message = 'Review the conversation and try again.',
): ApiError {
  return new ApiError(
    MESSAGING_ERROR_CODES.invalidInput,
    message,
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}
