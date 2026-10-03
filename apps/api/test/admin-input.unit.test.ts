import { describe, expect, it } from 'vitest';

import {
  parseAdminQuery,
  parseAdminRoles,
  parseOptionalMemberStatus,
  parseSupportStatus,
  parseTaxonomyCreate,
} from '../src/admin/admin-input.js';

describe('admin input parsers', () => {
  it('rejects short search queries and unknown roles', () => {
    expect(() => parseAdminQuery('a', true)).toThrow();
    expect(() =>
      parseAdminRoles({ roles: ['SUPER_ADMIN', 'SUPER_ADMIN'] }),
    ).toThrow();
    expect(() => parseAdminRoles({ roles: ['CUSTOM'] })).toThrow();
    expect(() => parseOptionalMemberStatus('BANNED')).toThrow();
    expect(() => parseSupportStatus({ status: 'ARCHIVED' })).toThrow();
    expect(() => parseTaxonomyCreate({ label: '', extra: true })).toThrow();
  });

  it('accepts predefined roles and member statuses', () => {
    expect(parseAdminRoles({ roles: ['SUPPORT', 'MODERATOR'] })).toEqual([
      'SUPPORT',
      'MODERATOR',
    ]);
    expect(parseOptionalMemberStatus('SUSPENDED')).toBe('SUSPENDED');
    expect(parseAdminQuery('priya')).toBe('priya');
  });
});
