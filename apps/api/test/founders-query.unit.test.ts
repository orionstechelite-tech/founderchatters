import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/http/api-error.js';
import {
  parseDiscoverQuery,
  parseSaveBody,
  parseFounderId,
  parseSavedFoundersQuery,
} from '../src/founders/founders-query.js';

describe('discover query parsing', () => {
  it('applies defaults and bounds', () => {
    expect(parseDiscoverQuery({})).toEqual({
      page: 1,
      pageSize: 20,
      q: null,
      country: null,
      industry: null,
      stage: null,
      expertiseTopicId: null,
      saved: null,
    });
    expect(parseDiscoverQuery({ page: '2', pageSize: '50' }).pageSize).toBe(50);
    expect(parseDiscoverQuery({ saved: 'true' }).saved).toBe(true);
    expect(parseDiscoverQuery({ saved: 'false' }).saved).toBe(false);
    expect(parseDiscoverQuery({ q: '  Dubai  ' }).q).toBe('Dubai');
  });

  it('rejects malformed and oversized query values', () => {
    expect(() => parseDiscoverQuery({ page: '0' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ page: '-1' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ page: '1.5' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ page: 'abc' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ pageSize: '0' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ pageSize: '51' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ pageSize: '1.5' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ q: 'x'.repeat(101) })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ saved: 'yes' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ saved: '1' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ saved: 'True' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ saved: '' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ country: '' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ country: '   ' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ industry: '' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ stage: '' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ expertiseTopicId: '' })).toThrow(
      ApiError,
    );
    expect(() => parseDiscoverQuery({ country: 'x'.repeat(101) })).toThrow(
      ApiError,
    );
    expect(() => parseDiscoverQuery({ followerCount: '1' })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ country: ['UAE'] })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ q: ['a', 'b'] })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ page: ['1', '2'] })).toThrow(ApiError);
    expect(() => parseDiscoverQuery({ saved: ['true', 'false'] })).toThrow(
      ApiError,
    );
  });

  it('rejects unknown saved-list filters and forged save bodies', () => {
    expect(parseSavedFoundersQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(() => parseSavedFoundersQuery({ q: 'Ada' })).toThrow(ApiError);
    expect(() => parseSavedFoundersQuery({ saved: 'true' })).toThrow(ApiError);
    expect(() => parseSaveBody(undefined)).not.toThrow();
    expect(() => parseSaveBody({})).not.toThrow();
    expect(() => parseSaveBody({ saverId: 'x' })).toThrow(ApiError);
    expect(() => parseSaveBody({ savedFounderId: 'x' })).toThrow(ApiError);
    expect(() => parseSaveBody({ userId: 'x' })).toThrow(ApiError);
    expect(() => parseSaveBody({ profileId: 'x' })).toThrow(ApiError);
    expect(() => parseSaveBody({ companyId: 'x' })).toThrow(ApiError);
    expect(() => parseSaveBody({ createdAt: 'now' })).toThrow(ApiError);
    expect(() => parseSaveBody({ saved: true })).toThrow(ApiError);
    expect(() => parseSaveBody({ arbitraryKey: 1 })).toThrow(ApiError);
    expect(() => parseFounderId('')).toThrow(ApiError);
    expect(() => parseFounderId('x'.repeat(65))).toThrow(ApiError);
    expect(() => parseFounderId('id\0bad')).toThrow(ApiError);
  });
});
