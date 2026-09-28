import { HttpStatus } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '@founderchatters/contracts';
import { ApiError } from '../http/api-error.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): void {
  if (!email || !EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
    throw new ApiError(
      AUTH_ERROR_CODES.invalidCredentials,
      'The supplied email is invalid.',
      HttpStatus.BAD_REQUEST,
      { email: ['Enter a valid email address.'] },
    );
  }
}

export function validatePassword(password: string): void {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new ApiError(
      AUTH_ERROR_CODES.invalidCredentials,
      'Password does not meet requirements',
      HttpStatus.BAD_REQUEST,
      {
        password: [
          `Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`,
        ],
      },
    );
  }
}
