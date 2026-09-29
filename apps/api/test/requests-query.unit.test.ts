import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/http/api-error.js';
import {
  parseCreateBody,
  parseEmptyMutationBody,
  parseOwnRequestsQuery,
  parsePatchBody,
  parseRequestId,
} from '../src/requests/requests-query.js';

describe('request query and body parsing', () => {
  it('applies list defaults and bounds', () => {
    expect(parseOwnRequestsQuery({})).toEqual({
      page: 1,
      pageSize: 20,
      status: null,
    });
    expect(parseOwnRequestsQuery({ page: '2', pageSize: '50' }).pageSize).toBe(
      50,
    );
    expect(parseOwnRequestsQuery({ status: 'DRAFT' }).status).toBe('DRAFT');
  });

  it('rejects malformed, duplicate, and unknown list query values', () => {
    expect(() => parseOwnRequestsQuery({ page: '0' })).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ page: '-1' })).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ page: '1.5' })).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ page: 'abc' })).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ page: ['1', '2'] })).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ pageSize: '0' })).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ pageSize: '1.5' })).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ pageSize: '51' })).toThrow(ApiError);
    expect(() =>
      parseOwnRequestsQuery({ status: 'DELETED_BY_AUTHOR' }),
    ).toThrow(ApiError);
    expect(() =>
      parseOwnRequestsQuery({ status: 'MODERATED_REMOVED' }),
    ).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ status: 'garbage' })).toThrow(
      ApiError,
    );
    expect(() =>
      parseOwnRequestsQuery({ status: ['DRAFT', 'PUBLISHED'] }),
    ).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ authorId: 'x' })).toThrow(ApiError);
    expect(() => parseOwnRequestsQuery({ q: 'feed' })).toThrow(ApiError);
  });

  it('creates drafts with required type and optional incomplete fields', () => {
    expect(parseCreateBody({ type: 'ASK' })).toEqual({
      type: 'ASK',
      headline: '',
      context: '',
      whoCouldHelp: null,
      urgency: null,
      topicIds: [],
    });
    expect(
      parseCreateBody({
        type: 'FEEDBACK',
        headline: '  Launch help  ',
        whoCouldHelp: '   ',
        urgency: '',
      }),
    ).toMatchObject({
      type: 'FEEDBACK',
      headline: 'Launch help',
      whoCouldHelp: null,
      urgency: null,
    });
  });

  it('rejects unknown, mass-assigned, and invalid create fields', () => {
    expect(() => parseCreateBody({})).toThrow(ApiError);
    expect(() => parseCreateBody({ type: 'PITCH' })).toThrow(ApiError);
    expect(() => parseCreateBody({ type: 'ASK', authorId: 'other' })).toThrow(
      ApiError,
    );
    expect(() => parseCreateBody({ type: 'ASK', status: 'PUBLISHED' })).toThrow(
      ApiError,
    );
    expect(() => parseCreateBody({ type: 'ASK', publishedAt: 'now' })).toThrow(
      ApiError,
    );
    expect(() =>
      parseCreateBody({ type: 'ASK', headline: 'x'.repeat(161) }),
    ).toThrow(ApiError);
    expect(() =>
      parseCreateBody({ type: 'ASK', topicIds: ['a', 'b', 'c', 'd'] }),
    ).toThrow(ApiError);
    expect(() => parseCreateBody({ type: 'ASK', urgency: 'SOON' })).toThrow(
      ApiError,
    );
    expect(() => parseCreateBody({ type: 'ASK', responseCount: 9 })).toThrow(
      ApiError,
    );
    expect(() =>
      parseCreateBody({ type: 'ASK', topicIds: ['topic-1', 'topic-1'] }),
    ).toThrow(ApiError);
    expect(() =>
      parseCreateBody({ type: 'ASK', requestId: 'x', userId: 'y' }),
    ).toThrow(ApiError);
    expect(() => parseCreateBody({ type: 'ASK', applicationId: 'z' })).toThrow(
      ApiError,
    );
    expect(() => parseCreateBody({ type: 'ASK', arbitraryKey: true })).toThrow(
      ApiError,
    );
    expect(() =>
      parseCreateBody({ type: 'ASK', context: 'x'.repeat(2001) }),
    ).toThrow(ApiError);
    expect(() =>
      parseCreateBody({ type: 'ASK', whoCouldHelp: 'x'.repeat(301) }),
    ).toThrow(ApiError);
  });

  it('parses patch updates and empty mutation bodies', () => {
    expect(parsePatchBody({ headline: '  Hello there  ' })).toEqual({
      headline: 'Hello there',
    });
    expect(parsePatchBody({ urgency: null })).toEqual({ urgency: null });
    expect(parsePatchBody({ topicIds: ['topic-1'] })).toEqual({
      topicIds: ['topic-1'],
    });
    expect(() => parsePatchBody({})).toThrow(ApiError);
    expect(() => parsePatchBody({ resolvedAt: 'now' })).toThrow(ApiError);
    expect(() => parseEmptyMutationBody({ status: 'PUBLISHED' })).toThrow(
      ApiError,
    );
    expect(() => parseEmptyMutationBody(undefined)).not.toThrow();
    expect(() => parseEmptyMutationBody({})).not.toThrow();
    expect(() => parseRequestId('')).toThrow(ApiError);
    expect(() => parseRequestId('id\0bad')).toThrow(ApiError);
    expect(() => parseRequestId('x'.repeat(65))).toThrow(ApiError);
    expect(() => parsePatchBody({ topicIds: ['a', 'a'] })).toThrow(ApiError);
    expect(() => parsePatchBody({ deletedAt: 'now' })).toThrow(ApiError);
    expect(() => parsePatchBody({ createdAt: 'now' })).toThrow(ApiError);
    expect(() => parsePatchBody({ updatedAt: 'now' })).toThrow(ApiError);
  });
});
