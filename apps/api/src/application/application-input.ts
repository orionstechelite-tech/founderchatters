import { HttpStatus } from '@nestjs/common';
import {
  APPLICATION_ELIGIBILITY_ROLES,
  APPLICATION_ERROR_CODES,
  type ApplicationEligibilityRole,
  type UpdateFounderApplicationRequest,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

const ALLOWED_FIELDS = new Set([
  'eligibilityRole',
  'companyName',
  'roleTitle',
  'website',
  'city',
  'country',
  'buildingSummary',
]);
const ELIGIBILITY_ROLES = new Set<ApplicationEligibilityRole>(
  Object.values(APPLICATION_ELIGIBILITY_ROLES),
);

const LIMITS = {
  companyName: 120,
  roleTitle: 100,
  website: 2048,
  city: 100,
  country: 100,
  buildingSummary: 2000,
} as const;

export function validateApplicationUpdate(
  body: unknown,
): UpdateFounderApplicationRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validationError({ application: ['Enter application details.'] });
  }
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string[]> = {};
  for (const key of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(key)) {
      fieldErrors[key] = ['This field cannot be changed.'];
    }
  }

  const result: UpdateFounderApplicationRequest = {};
  if ('eligibilityRole' in value) {
    if (
      typeof value.eligibilityRole !== 'string' ||
      !ELIGIBILITY_ROLES.has(
        value.eligibilityRole as ApplicationEligibilityRole,
      )
    ) {
      fieldErrors.eligibilityRole = ['Choose one eligibility option.'];
    } else {
      result.eligibilityRole =
        value.eligibilityRole as ApplicationEligibilityRole;
    }
  }

  for (const field of [
    'companyName',
    'roleTitle',
    'city',
    'country',
  ] as const) {
    if (!(field in value)) continue;
    if (typeof value[field] !== 'string') {
      fieldErrors[field] = ['Enter a valid value.'];
      continue;
    }
    const normalized = normalizeShortText(value[field]);
    if (normalized.length > LIMITS[field]) {
      fieldErrors[field] = [
        `Use ${String(LIMITS[field])} characters or fewer.`,
      ];
    } else {
      result[field] = normalized;
    }
  }

  if ('buildingSummary' in value) {
    if (typeof value.buildingSummary !== 'string') {
      fieldErrors.buildingSummary = ['Enter a valid description.'];
    } else {
      const normalized = value.buildingSummary.replace(/\r\n?/g, '\n').trim();
      if (normalized.length > LIMITS.buildingSummary) {
        fieldErrors.buildingSummary = [
          `Use ${String(LIMITS.buildingSummary)} characters or fewer.`,
        ];
      } else {
        result.buildingSummary = normalized;
      }
    }
  }

  if ('website' in value) {
    if (value.website === null || value.website === '') {
      result.website = null;
    } else if (typeof value.website !== 'string') {
      fieldErrors.website = ['Enter a valid website URL.'];
    } else {
      const normalized = normalizeWebsite(value.website);
      if (!normalized || normalized.length > LIMITS.website) {
        fieldErrors.website = ['Enter a valid HTTP or HTTPS website URL.'];
      } else {
        result.website = normalized;
      }
    }
  }

  if (
    Object.keys(result).length === 0 &&
    Object.keys(fieldErrors).length === 0
  ) {
    fieldErrors.application = ['Add at least one application detail.'];
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw validationError(fieldErrors);
  }
  return result;
}

export function validateApplicationForSubmission(application: {
  eligibilityRole: string | null;
  companyName: string | null;
  roleTitle: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  buildingSummary: string | null;
}): void {
  const fieldErrors: Record<string, string[]> = {};
  if (!application.eligibilityRole) {
    fieldErrors.eligibilityRole = ['Choose one eligibility option.'];
  } else if (
    application.eligibilityRole === APPLICATION_ELIGIBILITY_ROLES.notBuilding
  ) {
    fieldErrors.eligibilityRole = [
      'FounderChatters currently requires an active company build.',
    ];
  }
  required(application.companyName, 'companyName', 2, fieldErrors);
  required(application.roleTitle, 'roleTitle', 2, fieldErrors);
  required(application.city, 'city', 1, fieldErrors);
  required(application.country, 'country', 2, fieldErrors);
  required(application.buildingSummary, 'buildingSummary', 20, fieldErrors);
  if (Object.keys(fieldErrors).length > 0) {
    throw validationError(fieldErrors);
  }
}

function normalizeShortText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeWebsite(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function required(
  value: string | null,
  field: string,
  minimumLength: number,
  fieldErrors: Record<string, string[]>,
): void {
  if (!value || value.trim().length < minimumLength) {
    fieldErrors[field] = ['Complete this field before submitting.'];
  }
}

function validationError(fieldErrors: Record<string, string[]>): ApiError {
  return new ApiError(
    APPLICATION_ERROR_CODES.invalidState,
    'Review the application details and try again.',
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}
