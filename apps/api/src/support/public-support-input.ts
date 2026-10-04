import { HttpStatus } from '@nestjs/common';
import {
  PUBLIC_SUPPORT_CATEGORIES,
  PUBLIC_SUPPORT_ERROR_CODES,
  PUBLIC_SUPPORT_LIMITS,
  type PublicSupportCategory,
} from '@founderchatters/contracts';

import { normalizeEmail } from '../auth/auth-input.js';
import { ApiError } from '../http/api-error.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORIES = new Set<string>(PUBLIC_SUPPORT_CATEGORIES);
const ALLOWED_FIELDS = ['category', 'email', 'subject', 'message'] as const;

export type PublicSupportInput = {
  category: PublicSupportCategory;
  email: string;
  subject: string;
  message: string;
};

export function parsePublicSupportBody(body: unknown): PublicSupportInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('This request is not valid.');
  }
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string[]> = {};
  for (const key of Object.keys(value)) {
    if (!ALLOWED_FIELDS.includes(key as (typeof ALLOWED_FIELDS)[number])) {
      fieldErrors[key] = ['This field cannot be changed.'];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw invalid('This request includes unsupported fields.', fieldErrors);
  }

  const category = parseCategory(value.category, fieldErrors);
  const email = parseEmail(value.email, fieldErrors);
  const subject = parseText(
    value.subject,
    'subject',
    PUBLIC_SUPPORT_LIMITS.subjectMax,
    fieldErrors,
  );
  const message = parseText(
    value.message,
    'message',
    PUBLIC_SUPPORT_LIMITS.messageMax,
    fieldErrors,
  );
  if (Object.keys(fieldErrors).length > 0) {
    throw invalid('Check the highlighted fields and try again.', fieldErrors);
  }
  return { category, email, subject, message };
}

function parseCategory(
  value: unknown,
  fieldErrors: Record<string, string[]>,
): PublicSupportCategory {
  if (typeof value !== 'string' || !CATEGORIES.has(value)) {
    fieldErrors.category = ['Choose a valid support category.'];
    return 'other';
  }
  return value as PublicSupportCategory;
}

function parseEmail(
  value: unknown,
  fieldErrors: Record<string, string[]>,
): string {
  if (typeof value !== 'string') {
    fieldErrors.email = ['Enter a valid email address.'];
    return '';
  }
  const email = normalizeEmail(value);
  if (
    !email ||
    !EMAIL_PATTERN.test(email) ||
    email.length > PUBLIC_SUPPORT_LIMITS.emailMax
  ) {
    fieldErrors.email = ['Enter a valid email address.'];
    return email;
  }
  return email;
}

function parseText(
  value: unknown,
  field: 'subject' | 'message',
  max: number,
  fieldErrors: Record<string, string[]>,
): string {
  if (typeof value !== 'string') {
    fieldErrors[field] = [`Enter a ${field}.`];
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    fieldErrors[field] = [`Enter a ${field}.`];
    return '';
  }
  if (trimmed.length > max) {
    fieldErrors[field] = [`Use ${max} characters or fewer.`];
    return trimmed;
  }
  return trimmed;
}

function invalid(
  message: string,
  fieldErrors: Record<string, string[]> = {},
): ApiError {
  return new ApiError(
    PUBLIC_SUPPORT_ERROR_CODES.invalidInput,
    message,
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}
