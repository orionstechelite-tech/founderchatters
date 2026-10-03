import { HttpStatus } from '@nestjs/common';
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_ERROR_CODES,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

export function parseDeleteAccountBody(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw confirmationRequired();
  }
  const value = body as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (key !== 'confirmation') {
      throw new ApiError(
        ACCOUNT_DELETION_ERROR_CODES.confirmationRequired,
        'This request includes unsupported fields.',
        HttpStatus.BAD_REQUEST,
        { [key]: ['This field cannot be changed.'] },
      );
    }
  }
  if (typeof value.confirmation !== 'string') {
    throw confirmationRequired();
  }
  if (value.confirmation.trim() !== ACCOUNT_DELETION_CONFIRMATION) {
    throw confirmationRequired();
  }
}

function confirmationRequired(): ApiError {
  return new ApiError(
    ACCOUNT_DELETION_ERROR_CODES.confirmationRequired,
    'Type DELETE to confirm account deletion.',
    HttpStatus.BAD_REQUEST,
    {
      confirmation: ['Type DELETE to confirm.'],
    },
  );
}
