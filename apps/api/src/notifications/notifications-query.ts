import { HttpStatus } from '@nestjs/common';
import {
  NOTIFICATION_ERROR_CODES,
  NOTIFICATION_LIMITS,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

const ID_MAX = 64;

export type NotificationsListQuery = {
  before: string | null;
  limit: number;
};

export function parseNotificationId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ID_MAX ||
    value.includes('\0')
  ) {
    throw notificationInvalidInput({
      notificationId: ['Choose a valid notification.'],
    });
  }
  return value;
}
export function parseNotificationsListQuery(
  query: Record<string, unknown>,
): NotificationsListQuery {
  rejectUnknown(query, ['before', 'limit']);
  return {
    before: parseBefore(query.before),
    limit: parseLimit(query.limit),
  };
}

function parseBefore(value: unknown): string | null {
  const scalar = scalarQuery(value, 'before');
  if (scalar === null) return null;
  if (scalar.length === 0 || scalar.length > ID_MAX || scalar.includes('\0')) {
    throw notificationInvalidInput({
      before: ['Choose a valid notification.'],
    });
  }
  return scalar;
}

function parseLimit(value: unknown): number {
  const scalar = scalarQuery(value, 'limit');
  if (scalar === null) return NOTIFICATION_LIMITS.pageSizeDefault;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw notificationInvalidInput({
      limit: ['Choose a valid limit.'],
    });
  }
  const limit = Number.parseInt(scalar, 10);
  if (limit > NOTIFICATION_LIMITS.pageSizeMax) {
    throw notificationInvalidInput({
      limit: [
        `Use ${String(NOTIFICATION_LIMITS.pageSizeMax)} or fewer notifications.`,
      ],
    });
  }
  return limit;
}

function scalarQuery(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value) || typeof value !== 'string') {
    throw notificationInvalidInput({
      [field]: [`Enter a valid ${field}.`],
    });
  }
  return value;
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
  if (Object.keys(fieldErrors).length > 0) {
    throw notificationInvalidInput(fieldErrors);
  }
}

export function notificationInvalidInput(
  fieldErrors: Record<string, string[]> = {},
  message = 'Review the notification request and try again.',
): ApiError {
  return new ApiError(
    NOTIFICATION_ERROR_CODES.invalidInput,
    message,
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}

export function notificationNotFound(): ApiError {
  return new ApiError(
    NOTIFICATION_ERROR_CODES.notFound,
    'Notification not found.',
    HttpStatus.NOT_FOUND,
  );
}
