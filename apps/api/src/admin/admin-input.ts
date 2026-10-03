import { HttpStatus } from '@nestjs/common';
import {
  ADMIN_ERROR_CODES,
  ADMIN_ROLES,
  SUPPORT_CASE_STATUSES,
  type AdminRoleKey,
  type SupportCaseStatus,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_PAGE_MAX = 10_000;
export const ADMIN_ID_MAX = 64;
export const ADMIN_QUERY_MIN = 2;
export const ADMIN_QUERY_MAX = 120;
export const ADMIN_REASON_MAX = 2000;
export const ADMIN_SUPPORT_BODY_MAX = 4000;
export const ADMIN_LABEL_MAX = 80;
export const ADMIN_DESCRIPTION_MAX = 400;

const ROLE_KEYS = new Set<string>(Object.values(ADMIN_ROLES));
const SUPPORT_STATUSES = new Set<string>(SUPPORT_CASE_STATUSES);

export function adminInvalid(
  message: string,
  fieldErrors: Record<string, string[]> = {},
): ApiError {
  return new ApiError(
    ADMIN_ERROR_CODES.actionInvalidState,
    message,
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}

export function adminForbidden(message: string): ApiError {
  return new ApiError(
    ADMIN_ERROR_CODES.permissionDenied,
    message,
    HttpStatus.FORBIDDEN,
  );
}

export function parseAdminPage(value: unknown): number {
  const scalar = scalarQuery(value);
  if (scalar === null) return 1;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw adminInvalid('Choose a valid page.', {
      page: ['Choose a valid page.'],
    });
  }
  const page = Number.parseInt(scalar, 10);
  if (page > ADMIN_PAGE_MAX) {
    throw adminInvalid('Choose a valid page.', {
      page: ['Choose a valid page.'],
    });
  }
  return page;
}

export function parseAdminId(value: unknown, field = 'id'): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ADMIN_ID_MAX
  ) {
    throw adminInvalid('This record could not be found.', {
      [field]: ['Choose a valid identifier.'],
    });
  }
  return value;
}

const USER_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'DELETED']);

export function parseOptionalMemberStatus(value: unknown): string | null {
  const scalar = scalarQuery(value);
  if (scalar === null) return null;
  if (!USER_STATUSES.has(scalar)) {
    throw adminInvalid('Choose a valid member status.', {
      status: ['Choose a valid member status.'],
    });
  }
  return scalar;
}

export function parseOptionalAction(value: unknown): string | null {
  const scalar = scalarQuery(value);
  if (scalar === null) return null;
  if (scalar.length > 80) {
    throw adminInvalid('Choose a valid action.', {
      action: ['Choose a valid action.'],
    });
  }
  return scalar;
}

export function parseOptionalId(value: unknown, field: string): string | null {
  const scalar = scalarQuery(value);
  if (scalar === null) return null;
  return parseAdminId(scalar, field);
}

export function parseAdminQuery(
  value: unknown,
  required = false,
): string | null {
  const scalar = scalarQuery(value);
  if (scalar === null) {
    if (required) {
      throw adminInvalid('Enter a search query.', {
        q: ['Enter a search query.'],
      });
    }
    return null;
  }
  if (scalar.length < ADMIN_QUERY_MIN || scalar.length > ADMIN_QUERY_MAX) {
    throw adminInvalid('Enter a more specific search.', {
      q: ['Use between 2 and 120 characters.'],
    });
  }
  return scalar;
}

export function parseEmptyBody(body: unknown): void {
  if (body == null || body === '') return;
  record(body, []);
}

export function parseRequiredReason(body: unknown): string {
  const value = record(body, ['reason']);
  const reason = value.reason;
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw adminInvalid('Enter a reason.', { reason: ['Enter a reason.'] });
  }
  if (reason.trim().length > ADMIN_REASON_MAX) {
    throw adminInvalid('Shorten that reason.', {
      reason: [`Use ${ADMIN_REASON_MAX} characters or fewer.`],
    });
  }
  return reason.trim();
}

export function parseSupportReply(body: unknown): string {
  const value = record(body, ['body']);
  const text = value.body;
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw adminInvalid('Enter a reply.', { body: ['Enter a reply.'] });
  }
  if (text.trim().length > ADMIN_SUPPORT_BODY_MAX) {
    throw adminInvalid('Shorten that reply.', {
      body: [`Use ${ADMIN_SUPPORT_BODY_MAX} characters or fewer.`],
    });
  }
  return text.trim();
}

export function parseSupportStatus(body: unknown): SupportCaseStatus {
  const value = record(body, ['status']);
  const status = value.status;
  if (typeof status !== 'string' || !SUPPORT_STATUSES.has(status)) {
    throw adminInvalid('Choose a valid support status.', {
      status: ['Choose a valid support status.'],
    });
  }
  return status as SupportCaseStatus;
}

export function parseAdminRoles(body: unknown): AdminRoleKey[] {
  const value = record(body, ['roles']);
  const roles = value.roles;
  if (!Array.isArray(roles) || roles.length === 0) {
    throw adminInvalid('Assign at least one predefined role.', {
      roles: ['Assign at least one predefined role.'],
    });
  }
  const unique = new Set<string>();
  for (const role of roles) {
    if (typeof role !== 'string' || !ROLE_KEYS.has(role)) {
      throw adminInvalid('Use predefined admin roles only.', {
        roles: ['Use predefined admin roles only.'],
      });
    }
    if (unique.has(role)) {
      throw adminInvalid('Role assignments must be unique.', {
        roles: ['Remove duplicate roles.'],
      });
    }
    unique.add(role);
  }
  return [...unique] as AdminRoleKey[];
}

export function parseTaxonomyCreate(body: unknown): {
  label: string;
  description: string | null;
} {
  const value = record(body, ['label', 'description']);
  return {
    label: parseLabel(value.label),
    description: parseOptionalText(
      value.description,
      'description',
      ADMIN_DESCRIPTION_MAX,
    ),
  };
}

export function parseTaxonomyPatch(body: unknown): {
  label?: string;
  description?: string | null;
  isActive?: boolean;
} {
  const value = record(body, ['label', 'description', 'isActive']);
  const next: {
    label?: string;
    description?: string | null;
    isActive?: boolean;
  } = {};
  if ('label' in value) next.label = parseLabel(value.label);
  if ('description' in value) {
    next.description = parseOptionalText(
      value.description,
      'description',
      ADMIN_DESCRIPTION_MAX,
    );
  }
  if ('isActive' in value) {
    if (typeof value.isActive !== 'boolean') {
      throw adminInvalid('Choose a valid active state.', {
        isActive: ['Choose a valid active state.'],
      });
    }
    next.isActive = value.isActive;
  }
  if (Object.keys(next).length === 0) {
    throw adminInvalid('No supported fields were provided.');
  }
  return next;
}

export function parseMergeTarget(body: unknown): string {
  const value = record(body, ['targetId']);
  return parseAdminId(value.targetId, 'targetId');
}

export function slugify(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw adminInvalid('Enter a label that can become a slug.', {
      label: ['Enter a usable label.'],
    });
  }
  return slug;
}

function parseLabel(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw adminInvalid('Enter a label.', { label: ['Enter a label.'] });
  }
  if (value.trim().length > ADMIN_LABEL_MAX) {
    throw adminInvalid('Shorten that label.', {
      label: [`Use ${ADMIN_LABEL_MAX} characters or fewer.`],
    });
  }
  return value.trim();
}

function parseOptionalText(
  value: unknown,
  field: string,
  max: number,
): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw adminInvalid('Enter valid text.', { [field]: ['Enter valid text.'] });
  }
  if (value.trim().length > max) {
    throw adminInvalid('Shorten that text.', {
      [field]: [`Use ${max} characters or fewer.`],
    });
  }
  return value.trim() || null;
}

function record(body: unknown, allowed?: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw adminInvalid('This request is not valid.');
  }
  const value = body as Record<string, unknown>;
  if (allowed) {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) {
        throw adminInvalid('This request includes unsupported fields.', {
          [key]: ['This field cannot be changed.'],
        });
      }
    }
  }
  return value;
}

function scalarQuery(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) {
    throw adminInvalid('This filter is not valid.');
  }
  if (typeof value !== 'string') {
    throw adminInvalid('This filter is not valid.');
  }
  return value.trim() || null;
}
