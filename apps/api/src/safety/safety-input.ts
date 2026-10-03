import { HttpStatus } from '@nestjs/common';
import {
  REPORT_REASON_CODES,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  SAFETY_ERROR_CODES,
  SAFETY_LIMITS,
  type ReportReasonCode,
  type ReportStatus,
  type ReportTargetType,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

const ID_MAX = 64;
const REASON_CODES = new Set<string>(Object.values(REPORT_REASON_CODES));
const TARGET_TYPES = new Set<string>(Object.values(REPORT_TARGET_TYPES));
const REPORT_STATUS_VALUES = new Set<string>(Object.values(REPORT_STATUSES));

export function safetyInvalidInput(
  message = 'Review the report and try again.',
  fieldErrors: Record<string, string[]> = {},
): ApiError {
  return new ApiError(
    SAFETY_ERROR_CODES.invalidInput,
    message,
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}

export function safetyTargetNotFound(): ApiError {
  return new ApiError(
    SAFETY_ERROR_CODES.targetNotFound,
    'That content is not available.',
    HttpStatus.NOT_FOUND,
  );
}

export function safetyNotAllowed(message: string): ApiError {
  return new ApiError(
    SAFETY_ERROR_CODES.notAllowed,
    message,
    HttpStatus.FORBIDDEN,
  );
}

export function safetyReportNotFound(): ApiError {
  return new ApiError(
    SAFETY_ERROR_CODES.reportNotFound,
    'That report is not available.',
    HttpStatus.NOT_FOUND,
  );
}

export function safetyInvalidState(message: string): ApiError {
  return new ApiError(
    SAFETY_ERROR_CODES.invalidState,
    message,
    HttpStatus.CONFLICT,
  );
}

export function parseSafetyId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ID_MAX ||
    value.includes('\0')
  ) {
    throw safetyTargetNotFound();
  }
  return value;
}

export function parseReportId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > ID_MAX ||
    value.includes('\0')
  ) {
    throw safetyReportNotFound();
  }
  return value;
}

function rejectUnknown(body: Record<string, unknown>, allowed: string[]): void {
  const fieldErrors: Record<string, string[]> = {};
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      fieldErrors[key] = ['This field cannot be changed.'];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw safetyInvalidInput(
      'This request includes unsupported fields.',
      fieldErrors,
    );
  }
}

export function parseCreateReportBody(body: unknown): {
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: ReportReasonCode;
  details: string | null;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw safetyInvalidInput();
  }
  const value = body as Record<string, unknown>;
  rejectUnknown(value, ['targetType', 'targetId', 'reasonCode', 'details']);

  const fieldErrors: Record<string, string[]> = {};
  if (
    typeof value.targetType !== 'string' ||
    !TARGET_TYPES.has(value.targetType)
  ) {
    fieldErrors.targetType = ['Choose what you are reporting.'];
  }
  if (
    typeof value.targetId !== 'string' ||
    value.targetId.length === 0 ||
    value.targetId.length > ID_MAX ||
    value.targetId.includes('\0')
  ) {
    fieldErrors.targetId = ['Choose what you are reporting.'];
  }
  if (
    typeof value.reasonCode !== 'string' ||
    !REASON_CODES.has(value.reasonCode)
  ) {
    fieldErrors.reasonCode = ['Choose the closest reason.'];
  }

  let details: string | null = null;
  if (value.details !== undefined && value.details !== null) {
    if (typeof value.details !== 'string') {
      fieldErrors.details = ['Add optional context as text.'];
    } else {
      const trimmed = value.details.trim();
      if (trimmed.length > SAFETY_LIMITS.detailsMax) {
        fieldErrors.details = [
          `Use ${String(SAFETY_LIMITS.detailsMax)} characters or fewer.`,
        ];
      } else if (trimmed.length > 0) {
        details = trimmed;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw safetyInvalidInput('Review the report and try again.', fieldErrors);
  }

  return {
    targetType: value.targetType as ReportTargetType,
    targetId: value.targetId as string,
    reasonCode: value.reasonCode as ReportReasonCode,
    details,
  };
}

export function parseSafetyPage(query: Record<string, unknown>): {
  page: number;
  pageSize: number;
  status: ReportStatus | null;
} {
  const allowed = ['page', 'pageSize', 'status'];
  const fieldErrors: Record<string, string[]> = {};
  for (const key of Object.keys(query)) {
    if (!allowed.includes(key)) {
      fieldErrors[key] = ['This filter is not supported.'];
    }
  }

  const page = parsePositiveInt(query.page, 1, SAFETY_LIMITS.pageMax, 1);
  const pageSize = parsePositiveInt(
    query.pageSize,
    1,
    SAFETY_LIMITS.pageSizeMax,
    SAFETY_LIMITS.pageSizeDefault,
  );
  let status: ReportStatus | null = null;
  if (query.status !== undefined && query.status !== '') {
    if (
      typeof query.status !== 'string' ||
      !REPORT_STATUS_VALUES.has(query.status)
    ) {
      fieldErrors.status = ['Choose a valid report status.'];
    } else {
      status = query.status as ReportStatus;
    }
  }
  if (page === null) fieldErrors.page = ['Enter a valid page.'];
  if (pageSize === null) fieldErrors.pageSize = ['Enter a valid page size.'];
  if (Object.keys(fieldErrors).length > 0) {
    throw safetyInvalidInput('Review the filters and try again.', fieldErrors);
  }
  return { page: page!, pageSize: pageSize!, status };
}

function parsePositiveInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number | null {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export function parseEmptyBody(body: unknown): void {
  if (body === undefined || body === null || body === '') return;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw safetyInvalidInput('This request cannot include a body.');
  }
  if (Object.keys(body as Record<string, unknown>).length > 0) {
    throw safetyInvalidInput('This request cannot include extra fields.');
  }
}

export function suspensionReasonFor(reasonCode: ReportReasonCode): string {
  switch (reasonCode) {
    case REPORT_REASON_CODES.spamPromotion:
      return 'Community guidelines';
    case REPORT_REASON_CODES.fraudImpersonation:
      return 'Fraud or impersonation';
    case REPORT_REASON_CODES.harassmentAbuse:
      return 'Harassment or abuse';
    case REPORT_REASON_CODES.unsafePolicy:
      return 'Policy violation';
    default:
      return 'Community guidelines';
  }
}
