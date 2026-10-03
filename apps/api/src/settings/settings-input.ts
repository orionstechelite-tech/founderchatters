import { HttpStatus } from '@nestjs/common';
import {
  SETTINGS_ERROR_CODES,
  SETTINGS_LIMITS,
  type ChangePasswordRequest,
  type UpdateMemberProfileSettingsRequest,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

const PROFILE_FIELDS = new Set([
  'displayName',
  'companyName',
  'city',
  'country',
  'headline',
  'bio',
]);

const PASSWORD_FIELDS = new Set([
  'currentPassword',
  'newPassword',
  'confirmPassword',
]);

export function validateProfileSettingsUpdate(
  body: unknown,
): UpdateMemberProfileSettingsRequest {
  const value = objectBody(body, PROFILE_FIELDS);
  const fieldErrors: Record<string, string[]> = {};
  const result: UpdateMemberProfileSettingsRequest = {};

  if ('displayName' in value) {
    if (typeof value.displayName !== 'string') {
      fieldErrors.displayName = ['Enter your name.'];
    } else {
      const normalized = normalizeSingleLine(value.displayName);
      if (normalized.length < 2) {
        fieldErrors.displayName = ['Enter your name.'];
      } else if (normalized.length > SETTINGS_LIMITS.displayName) {
        fieldErrors.displayName = [
          `Use ${String(SETTINGS_LIMITS.displayName)} characters or fewer.`,
        ];
      } else {
        result.displayName = normalized;
      }
    }
  }

  if ('companyName' in value) {
    if (typeof value.companyName !== 'string') {
      fieldErrors.companyName = ['Enter a company name.'];
    } else {
      const normalized = normalizeSingleLine(value.companyName);
      if (normalized.length < 2) {
        fieldErrors.companyName = ['Enter a company name.'];
      } else if (normalized.length > SETTINGS_LIMITS.companyName) {
        fieldErrors.companyName = [
          `Use ${String(SETTINGS_LIMITS.companyName)} characters or fewer.`,
        ];
      } else {
        result.companyName = normalized;
      }
    }
  }

  assignOptionalSingleLine(
    value,
    result,
    'city',
    SETTINGS_LIMITS.city,
    fieldErrors,
  );

  assignOptionalSingleLine(
    value,
    result,
    'country',
    SETTINGS_LIMITS.country,
    fieldErrors,
  );

  assignOptionalSingleLine(
    value,
    result,
    'headline',
    SETTINGS_LIMITS.headline,
    fieldErrors,
  );

  if ('bio' in value) {
    const raw = value.bio;

    if (raw === null || raw === '') {
      result.bio = null;
    } else if (typeof raw !== 'string') {
      fieldErrors.bio = ['Enter a valid bio.'];
    } else {
      const normalized = raw.replace(/\r\n?/g, '\n').trim();

      if (normalized.length > SETTINGS_LIMITS.bio) {
        fieldErrors.bio = [
          `Use ${String(SETTINGS_LIMITS.bio)} characters or fewer.`,
        ];
      } else {
        result.bio = normalized || null;
      }
    }
  }

  if (
    Object.keys(result).length === 0 &&
    Object.keys(fieldErrors).length === 0
  ) {
    fieldErrors.settings = ['Add at least one profile change.'];
  }

  throwIfInvalid(fieldErrors);

  return result;
}

export function validateChangePassword(body: unknown): ChangePasswordRequest {
  const value = objectBody(body, PASSWORD_FIELDS);
  const fieldErrors: Record<string, string[]> = {};

  const currentPassword =
    typeof value.currentPassword === 'string' ? value.currentPassword : '';
  const newPassword =
    typeof value.newPassword === 'string' ? value.newPassword : '';
  const confirmPassword =
    typeof value.confirmPassword === 'string' ? value.confirmPassword : '';

  if (
    !currentPassword ||
    currentPassword.length > SETTINGS_LIMITS.passwordMax
  ) {
    fieldErrors.currentPassword = ['Enter your current password.'];
  }

  if (
    newPassword.length < SETTINGS_LIMITS.passwordMin ||
    newPassword.length > SETTINGS_LIMITS.passwordMax
  ) {
    fieldErrors.newPassword = [
      `Password must be ${String(SETTINGS_LIMITS.passwordMin)}–${String(
        SETTINGS_LIMITS.passwordMax,
      )} characters.`,
    ];
  }

  if (confirmPassword !== newPassword) {
    fieldErrors.confirmPassword = ['Passwords must match.'];
  }

  throwIfInvalid(fieldErrors);

  return {
    currentPassword,
    newPassword,
    confirmPassword,
  };
}

function objectBody(
  body: unknown,
  allowed: Set<string>,
): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validationError({
      settings: ['Enter valid settings details.'],
    });
  }

  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string[]> = {};

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fieldErrors[key] = ['This field cannot be changed.'];
    }
  }

  throwIfInvalid(fieldErrors);

  return value;
}

function assignOptionalSingleLine(
  value: Record<string, unknown>,
  result: UpdateMemberProfileSettingsRequest,
  field: 'city' | 'country' | 'headline',
  max: number,
  fieldErrors: Record<string, string[]>,
): void {
  if (!(field in value)) return;

  const raw = value[field];

  if (raw === null || raw === '') {
    result[field] = null;
    return;
  }

  if (typeof raw !== 'string') {
    fieldErrors[field] = ['Enter a valid value.'];
    return;
  }

  const normalized = normalizeSingleLine(raw);

  if (normalized.length > max) {
    fieldErrors[field] = [`Use ${String(max)} characters or fewer.`];
    return;
  }

  result[field] = normalized || null;
}

function normalizeSingleLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function throwIfInvalid(fieldErrors: Record<string, string[]>): void {
  if (Object.keys(fieldErrors).length > 0) {
    throw validationError(fieldErrors);
  }
}

function validationError(fieldErrors: Record<string, string[]>): ApiError {
  return new ApiError(
    SETTINGS_ERROR_CODES.invalidInput,
    'Review the settings and try again.',
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}
