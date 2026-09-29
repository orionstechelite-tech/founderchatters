import { HttpStatus } from '@nestjs/common';
import {
  MEMBER_REQUEST_LIST_STATUSES,
  REQUEST_ERROR_CODES,
  REQUEST_LIMITS,
  REQUEST_TYPES,
  REQUEST_URGENCIES,
  type CreateRequestBody,
  type MemberRequestListStatus,
  type RequestType,
  type RequestUrgency,
  type UpsertRequestBody,
} from '@founderchatters/contracts';

import { ApiError } from '../http/api-error.js';

export type OwnRequestsQuery = {
  page: number;
  pageSize: number;
  status: MemberRequestListStatus | null;
};

export type RequestContent = {
  type: RequestType;
  headline: string;
  context: string;
  whoCouldHelp: string | null;
  urgency: RequestUrgency | null;
  topicIds: string[] | undefined;
};

const REQUEST_ID_MAX = 64;
const ALLOWED_CONTENT_FIELDS = new Set([
  'type',
  'headline',
  'context',
  'whoCouldHelp',
  'urgency',
  'topicIds',
]);
const REQUEST_TYPE_SET = new Set<string>(Object.values(REQUEST_TYPES));
const URGENCY_SET = new Set<string>(Object.values(REQUEST_URGENCIES));
const LIST_STATUS_SET = new Set<string>(MEMBER_REQUEST_LIST_STATUSES);

export function parseRequestId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > REQUEST_ID_MAX ||
    value.includes('\0')
  ) {
    throw requestNotFound();
  }
  return value;
}

export function requestNotFound(): ApiError {
  return new ApiError(
    REQUEST_ERROR_CODES.notFound,
    'That request is not available.',
    HttpStatus.NOT_FOUND,
  );
}

export function parseEmptyMutationBody(body: unknown): void {
  if (body === undefined || body === null || body === '') return;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw invalidInput(
      { body: ['This request cannot include a body.'] },
      'This request cannot include a body.',
    );
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length === 0) return;
  const fieldErrors: Record<string, string[]> = {};
  for (const key of keys) {
    fieldErrors[key] = ['This field cannot be changed.'];
  }
  throw invalidInput(fieldErrors, 'This request cannot include a body.');
}

export function parseOwnRequestsQuery(
  query: Record<string, unknown>,
): OwnRequestsQuery {
  rejectUnknown(query, ['page', 'pageSize', 'status']);
  return {
    page: parsePage(query.page),
    pageSize: parsePageSize(query.pageSize),
    status: parseListStatus(query.status),
  };
}

export function parseCreateBody(body: unknown): CreateRequestBody {
  const value = requireObject(body);
  rejectUnknown(value, [...ALLOWED_CONTENT_FIELDS]);
  if (!('type' in value)) {
    throw invalidInput(
      { type: ['Choose a request type.'] },
      'Review the request details and try again.',
    );
  }
  const parsed = parseContentFields(value, true);
  return {
    type: parsed.type as RequestType,
    headline: parsed.headline ?? '',
    context: parsed.context ?? '',
    whoCouldHelp: parsed.whoCouldHelp ?? null,
    urgency: parsed.urgency ?? null,
    topicIds: parsed.topicIds ?? [],
  };
}

export function parsePatchBody(body: unknown): UpsertRequestBody {
  const value = requireObject(body);
  rejectUnknown(value, [...ALLOWED_CONTENT_FIELDS]);
  const parsed = parseContentFields(value, false);
  if (
    parsed.type === undefined &&
    parsed.headline === undefined &&
    parsed.context === undefined &&
    parsed.whoCouldHelp === undefined &&
    parsed.urgency === undefined &&
    parsed.topicIds === undefined
  ) {
    throw invalidInput(
      { request: ['Add at least one request detail.'] },
      'Review the request details and try again.',
    );
  }
  return parsed;
}

export function assertDraftBounds(content: {
  headline: string;
  context: string;
  whoCouldHelp: string | null;
  topicIds: string[];
}): void {
  const fieldErrors: Record<string, string[]> = {};
  if (content.headline.length > REQUEST_LIMITS.headlineMax) {
    fieldErrors.headline = [
      `Use ${String(REQUEST_LIMITS.headlineMax)} characters or fewer.`,
    ];
  }
  if (content.context.length > REQUEST_LIMITS.contextMax) {
    fieldErrors.context = [
      `Use ${String(REQUEST_LIMITS.contextMax)} characters or fewer.`,
    ];
  }
  if (
    content.whoCouldHelp &&
    content.whoCouldHelp.length > REQUEST_LIMITS.whoCouldHelpMax
  ) {
    fieldErrors.whoCouldHelp = [
      `Use ${String(REQUEST_LIMITS.whoCouldHelpMax)} characters or fewer.`,
    ];
  }
  if (content.topicIds.length > REQUEST_LIMITS.topicIdsMax) {
    fieldErrors.topicIds = [
      `Choose ${String(REQUEST_LIMITS.topicIdsMax)} topics or fewer.`,
    ];
  }
  throwIfFields(fieldErrors);
}

export function assertPublishRequirements(content: {
  type: RequestType;
  headline: string;
  context: string;
  whoCouldHelp: string | null;
  urgency: RequestUrgency | null;
  topicIds: string[];
}): void {
  const headline = content.headline.trim();
  const context = content.context.trim();
  const fieldErrors: Record<string, string[]> = {};
  if (!REQUEST_TYPE_SET.has(content.type)) {
    fieldErrors.type = ['Choose a request type.'];
  }
  if (headline.length < REQUEST_LIMITS.headlinePublishMin) {
    fieldErrors.headline = [
      `Use at least ${String(REQUEST_LIMITS.headlinePublishMin)} characters.`,
    ];
  } else if (headline.length > REQUEST_LIMITS.headlineMax) {
    fieldErrors.headline = [
      `Use ${String(REQUEST_LIMITS.headlineMax)} characters or fewer.`,
    ];
  }
  if (context.length < REQUEST_LIMITS.contextPublishMin) {
    fieldErrors.context = [
      `Use at least ${String(REQUEST_LIMITS.contextPublishMin)} characters.`,
    ];
  } else if (context.length > REQUEST_LIMITS.contextMax) {
    fieldErrors.context = [
      `Use ${String(REQUEST_LIMITS.contextMax)} characters or fewer.`,
    ];
  }
  if (
    content.whoCouldHelp &&
    content.whoCouldHelp.length > REQUEST_LIMITS.whoCouldHelpMax
  ) {
    fieldErrors.whoCouldHelp = [
      `Use ${String(REQUEST_LIMITS.whoCouldHelpMax)} characters or fewer.`,
    ];
  }
  if (!content.urgency || !URGENCY_SET.has(content.urgency)) {
    fieldErrors.urgency = ['Choose an urgency.'];
  }
  if (content.topicIds.length > REQUEST_LIMITS.topicIdsMax) {
    fieldErrors.topicIds = [
      `Choose ${String(REQUEST_LIMITS.topicIdsMax)} topics or fewer.`,
    ];
  }
  throwIfFields(fieldErrors);
}

function parseContentFields(
  value: Record<string, unknown>,
  creating: boolean,
): UpsertRequestBody {
  const result: UpsertRequestBody = {};
  const fieldErrors: Record<string, string[]> = {};

  if ('type' in value) {
    if (typeof value.type !== 'string' || !REQUEST_TYPE_SET.has(value.type)) {
      fieldErrors.type = ['Choose a request type.'];
    } else {
      result.type = value.type as RequestType;
    }
  }

  if ('headline' in value) {
    const parsed = parseBoundedText(
      value.headline,
      'headline',
      REQUEST_LIMITS.headlineMax,
      true,
    );
    if (parsed.error) fieldErrors.headline = [parsed.error];
    else result.headline = parsed.value ?? '';
  } else if (creating) {
    result.headline = '';
  }

  if ('context' in value) {
    const parsed = parseBoundedText(
      value.context,
      'context',
      REQUEST_LIMITS.contextMax,
      true,
    );
    if (parsed.error) fieldErrors.context = [parsed.error];
    else result.context = parsed.value ?? '';
  } else if (creating) {
    result.context = '';
  }

  if ('whoCouldHelp' in value) {
    const parsed = parseBoundedText(
      value.whoCouldHelp,
      'whoCouldHelp',
      REQUEST_LIMITS.whoCouldHelpMax,
      false,
    );
    if (parsed.error) fieldErrors.whoCouldHelp = [parsed.error];
    else result.whoCouldHelp = parsed.value ?? null;
  } else if (creating) {
    result.whoCouldHelp = null;
  }

  if ('urgency' in value) {
    if (value.urgency === null || value.urgency === '') {
      result.urgency = null;
    } else if (
      typeof value.urgency !== 'string' ||
      !URGENCY_SET.has(value.urgency)
    ) {
      fieldErrors.urgency = ['Choose a valid urgency.'];
    } else {
      result.urgency = value.urgency as RequestUrgency;
    }
  } else if (creating) {
    result.urgency = null;
  }

  if ('topicIds' in value) {
    const parsed = parseTopicIds(value.topicIds);
    if (parsed.error) fieldErrors.topicIds = [parsed.error];
    else result.topicIds = parsed.value ?? [];
  } else if (creating) {
    result.topicIds = [];
  }

  throwIfFields(fieldErrors);
  return result;
}

function parseTopicIds(value: unknown): { value?: string[]; error?: string } {
  if (!Array.isArray(value)) {
    return { error: 'Choose valid topics.' };
  }
  if (value.length > REQUEST_LIMITS.topicIdsMax) {
    return {
      error: `Choose ${String(REQUEST_LIMITS.topicIdsMax)} topics or fewer.`,
    };
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim() || item.includes('\0')) {
      return { error: 'Choose valid topics.' };
    }
    const id = item.trim();
    if (id.length > REQUEST_ID_MAX) {
      return { error: 'Choose valid topics.' };
    }
    if (seen.has(id)) {
      return { error: 'Choose each topic only once.' };
    }
    seen.add(id);
    ids.push(id);
  }
  return { value: ids };
}

function parseBoundedText(
  value: unknown,
  field: string,
  max: number,
  allowBlank: boolean,
): { value?: string | null; error?: string } {
  if (value === null || value === '') {
    return { value: allowBlank ? '' : null };
  }
  if (typeof value !== 'string') {
    return { error: `Enter a valid ${field}.` };
  }
  const trimmed = value.replace(/\r\n?/g, '\n').trim();
  if (!trimmed) {
    return { value: allowBlank ? '' : null };
  }
  if (trimmed.includes('\0')) {
    return { error: `Enter a valid ${field}.` };
  }
  if (trimmed.length > max) {
    return { error: `Use ${String(max)} characters or fewer.` };
  }
  return { value: trimmed };
}

function parsePage(value: unknown): number {
  const scalar = scalarQuery(value, 'page');
  if (scalar === null) return 1;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('page', 'Choose a valid page.');
  }
  const page = Number.parseInt(scalar, 10);
  if (page > REQUEST_LIMITS.pageMax) {
    throw queryError('page', 'Choose a valid page.');
  }
  return page;
}

function parsePageSize(value: unknown): number {
  const scalar = scalarQuery(value, 'pageSize');
  if (scalar === null) return REQUEST_LIMITS.pageSizeDefault;
  if (!/^[1-9][0-9]*$/.test(scalar)) {
    throw queryError('pageSize', 'Choose a valid page size.');
  }
  const pageSize = Number.parseInt(scalar, 10);
  if (pageSize > REQUEST_LIMITS.pageSizeMax) {
    throw queryError(
      'pageSize',
      `Use ${String(REQUEST_LIMITS.pageSizeMax)} or fewer results per page.`,
    );
  }
  return pageSize;
}

function parseListStatus(value: unknown): MemberRequestListStatus | null {
  const scalar = scalarQuery(value, 'status');
  if (scalar === null) return null;
  if (!LIST_STATUS_SET.has(scalar)) {
    throw queryError('status', 'Choose a valid request status.');
  }
  return scalar as MemberRequestListStatus;
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
    throw invalidInput(
      { request: ['Enter request details.'] },
      'Review the request details and try again.',
    );
  }
  return body as Record<string, unknown>;
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: string[],
): void {
  const allowedSet = new Set(allowed);
  const fieldErrors: Record<string, string[]> = {};
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      fieldErrors[key] = ['This field cannot be changed.'];
    }
  }
  throwIfFields(fieldErrors);
}

function queryError(field: string, message: string): ApiError {
  return invalidInput({ [field]: [message] });
}

function throwIfFields(fieldErrors: Record<string, string[]>): void {
  if (Object.keys(fieldErrors).length === 0) return;
  throw invalidInput(fieldErrors);
}

export function invalidInput(
  fieldErrors: Record<string, string[]>,
  message = 'Review the request details and try again.',
): ApiError {
  return new ApiError(
    REQUEST_ERROR_CODES.invalidInput,
    message,
    HttpStatus.BAD_REQUEST,
    fieldErrors,
  );
}

export function invalidState(message: string): ApiError {
  return new ApiError(
    REQUEST_ERROR_CODES.invalidState,
    message,
    HttpStatus.CONFLICT,
  );
}

export function limitReached(): ApiError {
  return new ApiError(
    REQUEST_ERROR_CODES.limitReached,
    'You already have three open requests. Resolve or delete one before publishing another.',
    HttpStatus.CONFLICT,
  );
}
