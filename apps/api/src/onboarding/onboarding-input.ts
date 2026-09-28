import { HttpStatus } from '@nestjs/common';
import {
  APPLICATION_ERROR_CODES,
  ONBOARDING_LIMITS,
  type UpdateOnboardingExpertiseRequest,
  type UpdateOnboardingNeedsRequest,
  type UpdateOnboardingProfileRequest,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

const PROFILE_FIELDS = new Set(['displayName', 'city', 'country', 'company']);
const COMPANY_FIELDS = new Set([
  'name',
  'website',
  'description',
  'stage',
  'industry',
  'city',
  'country',
]);
const EXPERTISE_FIELDS = new Set(['topicIds', 'customExpertise']);
const NEEDS_FIELDS = new Set(['topicIds', 'currentNeedText']);
const PROTECTED_FIELDS = [
  'userId',
  'profileId',
  'founderProfileId',
  'companyId',
  'applicationId',
  'onboardingCompletedAt',
  'createdAt',
  'updatedAt',
  'email',
  'emailVerifiedAt',
  'status',
  'adminRoles',
  'permissions',
] as const;

export function validateProfileUpdate(
  body: unknown,
): UpdateOnboardingProfileRequest {
  const value = objectBody(body, PROFILE_FIELDS);
  const fieldErrors: Record<string, string[]> = {};
  const result: UpdateOnboardingProfileRequest = {};

  if ('displayName' in value) {
    if (typeof value.displayName !== 'string') {
      fieldErrors.displayName = ['Enter your name.'];
    } else {
      const normalized = normalizeShortText(value.displayName);
      if (normalized.length < 2) {
        fieldErrors.displayName = ['Enter your name.'];
      } else if (normalized.length > ONBOARDING_LIMITS.displayName) {
        fieldErrors.displayName = [
          `Use ${String(ONBOARDING_LIMITS.displayName)} characters or fewer.`,
        ];
      } else {
        result.displayName = normalized;
      }
    }
  }

  assignOptionalText(
    value,
    result,
    'city',
    ONBOARDING_LIMITS.city,
    fieldErrors,
  );
  assignOptionalText(
    value,
    result,
    'country',
    ONBOARDING_LIMITS.country,
    fieldErrors,
  );

  if ('company' in value) {
    if (
      typeof value.company !== 'object' ||
      value.company === null ||
      Array.isArray(value.company)
    ) {
      fieldErrors.company = ['Enter valid company details.'];
    } else {
      const companyValue = value.company as Record<string, unknown>;
      rejectUnknownFields(
        companyValue,
        COMPANY_FIELDS,
        fieldErrors,
        'company.',
      );
      const company: NonNullable<UpdateOnboardingProfileRequest['company']> =
        {};
      if ('name' in companyValue) {
        if (typeof companyValue.name !== 'string') {
          fieldErrors['company.name'] = ['Enter a company name.'];
        } else {
          const normalized = normalizeShortText(companyValue.name);
          if (normalized.length < 2) {
            fieldErrors['company.name'] = ['Enter a company name.'];
          } else if (normalized.length > ONBOARDING_LIMITS.companyName) {
            fieldErrors['company.name'] = [
              `Use ${String(ONBOARDING_LIMITS.companyName)} characters or fewer.`,
            ];
          } else {
            company.name = normalized;
          }
        }
      }
      assignOptionalCompanyText(
        companyValue,
        company,
        'industry',
        ONBOARDING_LIMITS.industry,
        fieldErrors,
      );
      assignOptionalCompanyText(
        companyValue,
        company,
        'stage',
        ONBOARDING_LIMITS.stage,
        fieldErrors,
      );
      assignOptionalCompanyText(
        companyValue,
        company,
        'city',
        ONBOARDING_LIMITS.city,
        fieldErrors,
      );
      assignOptionalCompanyText(
        companyValue,
        company,
        'country',
        ONBOARDING_LIMITS.country,
        fieldErrors,
      );
      if ('description' in companyValue) {
        if (
          companyValue.description === null ||
          companyValue.description === ''
        ) {
          company.description = null;
        } else if (typeof companyValue.description !== 'string') {
          fieldErrors['company.description'] = ['Enter a valid description.'];
        } else {
          const normalized = companyValue.description
            .replace(/\r\n?/g, '\n')
            .trim();
          if (normalized.length > ONBOARDING_LIMITS.description) {
            fieldErrors['company.description'] = [
              `Use ${String(ONBOARDING_LIMITS.description)} characters or fewer.`,
            ];
          } else {
            company.description = normalized || null;
          }
        }
      }
      if ('website' in companyValue) {
        if (companyValue.website === null || companyValue.website === '') {
          company.website = null;
        } else if (typeof companyValue.website !== 'string') {
          fieldErrors['company.website'] = ['Enter a valid website URL.'];
        } else {
          const normalized = normalizeWebsite(companyValue.website);
          if (!normalized || normalized.length > ONBOARDING_LIMITS.website) {
            fieldErrors['company.website'] = [
              'Enter a valid HTTP or HTTPS website URL.',
            ];
          } else {
            company.website = normalized;
          }
        }
      }
      result.company = company;
    }
  }

  if (
    Object.keys(result).length === 0 &&
    Object.keys(fieldErrors).length === 0
  ) {
    fieldErrors.profile = ['Add at least one profile detail.'];
  }
  throwIfInvalid(fieldErrors);
  return result;
}

export function validateExpertiseUpdate(
  body: unknown,
): UpdateOnboardingExpertiseRequest {
  const value = objectBody(body, EXPERTISE_FIELDS);
  const fieldErrors: Record<string, string[]> = {};
  const topicIds = parseTopicIds(value.topicIds, 'topicIds', fieldErrors);
  let customExpertise: string | null = null;
  if ('customExpertise' in value) {
    if (value.customExpertise === null || value.customExpertise === '') {
      customExpertise = null;
    } else if (typeof value.customExpertise !== 'string') {
      fieldErrors.customExpertise = ['Enter a valid expertise description.'];
    } else {
      const normalized = normalizeShortText(value.customExpertise);
      if (normalized.length > ONBOARDING_LIMITS.customExpertise) {
        fieldErrors.customExpertise = [
          `Use ${String(ONBOARDING_LIMITS.customExpertise)} characters or fewer.`,
        ];
      } else {
        customExpertise = normalized || null;
      }
    }
  }
  const total = topicIds.length + (customExpertise ? 1 : 0);
  if (total < ONBOARDING_LIMITS.expertiseMin) {
    fieldErrors.topicIds = [
      'Choose at least one area of experience, or add something specific.',
    ];
  } else if (total > ONBOARDING_LIMITS.expertiseMax) {
    fieldErrors.topicIds = [
      `Choose up to ${String(ONBOARDING_LIMITS.expertiseMax)} expertise selections, including custom text.`,
    ];
  }
  throwIfInvalid(fieldErrors);
  return { topicIds, customExpertise };
}

export function validateNeedsUpdate(
  body: unknown,
): UpdateOnboardingNeedsRequest {
  const value = objectBody(body, NEEDS_FIELDS);
  const fieldErrors: Record<string, string[]> = {};
  const topicIds = parseTopicIds(value.topicIds, 'topicIds', fieldErrors);
  if (topicIds.length > ONBOARDING_LIMITS.needsMax) {
    fieldErrors.topicIds = [
      `Choose up to ${String(ONBOARDING_LIMITS.needsMax)} common areas.`,
    ];
  }
  if (typeof value.currentNeedText !== 'string') {
    fieldErrors.currentNeedText = [
      'Describe what you need help with right now.',
    ];
  } else {
    const normalized = value.currentNeedText.replace(/\r\n?/g, '\n').trim();
    if (normalized.length < ONBOARDING_LIMITS.currentNeedTextMin) {
      fieldErrors.currentNeedText = [
        `Use at least ${String(ONBOARDING_LIMITS.currentNeedTextMin)} characters.`,
      ];
    } else if (normalized.length > ONBOARDING_LIMITS.currentNeedTextMax) {
      fieldErrors.currentNeedText = [
        `Use ${String(ONBOARDING_LIMITS.currentNeedTextMax)} characters or fewer.`,
      ];
    } else {
      throwIfInvalid(fieldErrors);
      return { topicIds, currentNeedText: normalized };
    }
  }
  throwIfInvalid(fieldErrors);
  return { topicIds, currentNeedText: '' };
}

export function validateCompleteBody(body: unknown): void {
  if (body === undefined || body === null) return;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw validationError({
      onboarding: ['This request cannot include a body.'],
    });
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length === 0) return;
  const fieldErrors: Record<string, string[]> = {};
  rejectUnknownFields(value, new Set(), fieldErrors);
  throwIfInvalid(fieldErrors);
}

function objectBody(
  body: unknown,
  allowed: Set<string>,
): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validationError({ onboarding: ['Enter valid onboarding details.'] });
  }
  const value = body as Record<string, unknown>;
  const fieldErrors: Record<string, string[]> = {};
  rejectUnknownFields(value, allowed, fieldErrors);
  throwIfInvalid(fieldErrors);
  return value;
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  fieldErrors: Record<string, string[]>,
  prefix = '',
): void {
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    fieldErrors[`${prefix}${key}`] = [
      PROTECTED_FIELDS.includes(key as (typeof PROTECTED_FIELDS)[number])
        ? 'This field cannot be changed.'
        : 'This field cannot be changed.',
    ];
  }
}

function parseTopicIds(
  value: unknown,
  field: string,
  fieldErrors: Record<string, string[]>,
): string[] {
  if (value === undefined) {
    fieldErrors[field] = ['Provide topic IDs.'];
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fieldErrors[field] = ['Provide a list of topic IDs.'];
    return [];
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of value) {
    const topicId = id.trim();
    if (!topicId) {
      fieldErrors[field] = ['Provide valid topic IDs.'];
      return [];
    }
    if (seen.has(topicId)) {
      fieldErrors[field] = ['Remove duplicate topics.'];
      return [];
    }
    seen.add(topicId);
    unique.push(topicId);
  }
  return unique;
}

function assignOptionalText(
  value: Record<string, unknown>,
  result: UpdateOnboardingProfileRequest,
  field: 'city' | 'country',
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
  const normalized = normalizeShortText(raw);
  if (normalized.length > max) {
    fieldErrors[field] = [`Use ${String(max)} characters or fewer.`];
  } else {
    result[field] = normalized || null;
  }
}

function assignOptionalCompanyText(
  value: Record<string, unknown>,
  company: NonNullable<UpdateOnboardingProfileRequest['company']>,
  field: 'industry' | 'stage' | 'city' | 'country',
  max: number,
  fieldErrors: Record<string, string[]>,
): void {
  if (!(field in value)) return;
  const raw = value[field];
  if (raw === null || raw === '') {
    company[field] = null;
    return;
  }
  if (typeof raw !== 'string') {
    fieldErrors[`company.${field}`] = ['Enter a valid value.'];
    return;
  }
  const normalized = normalizeShortText(raw);
  if (normalized.length > max) {
    fieldErrors[`company.${field}`] = [
      `Use ${String(max)} characters or fewer.`,
    ];
  } else {
    company[field] = normalized || null;
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

function throwIfInvalid(fieldErrors: Record<string, string[]>): void {
  if (Object.keys(fieldErrors).length > 0) {
    throw validationError(fieldErrors);
  }
}

function validationError(fieldErrors: Record<string, string[]>): ApiError {
  return new ApiError(
    APPLICATION_ERROR_CODES.invalidState,
    'Review the onboarding details and try again.',
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}
