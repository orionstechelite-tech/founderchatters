import { describe, expect, it } from 'vitest';

import {
  parseApproveBody,
  parseApplicationId,
  parseCountryFilter,
  parseQueuePage,
  parseQueueStatus,
  parseRequiredDecisionNote,
} from '../src/admin/admin-application-input.js';

describe('admin application input', () => {
  it('defaults the queue to Pending/SUBMITTED', () => {
    expect(parseQueueStatus(undefined)).toBe('SUBMITTED');
    expect(parseQueuePage(undefined)).toBe(1);
    expect(parseCountryFilter('')).toBeNull();
    expect(parseCountryFilter('  India  ')).toBe('India');
  });

  it('rejects empty decision notes', () => {
    expect(() => parseRequiredDecisionNote({ note: '   ' }, 'note')).toThrow();
    expect(parseRequiredDecisionNote({ note: '  Need more.  ' }, 'note')).toBe(
      'Need more.',
    );
    expect(
      parseRequiredDecisionNote({ reason: 'Not a current builder.' }, 'reason'),
    ).toBe('Not a current builder.');
  });

  it('rejects invalid queue tabs, pages, country values, and oversized notes', () => {
    expect(() => parseQueueStatus('DRAFT')).toThrow();
    expect(() => parseQueueStatus(['SUBMITTED', 'APPROVED'])).toThrow();
    expect(() => parseQueuePage('0')).toThrow();
    expect(() => parseQueuePage('-1')).toThrow();
    expect(() => parseQueuePage('1.5')).toThrow();
    expect(() => parseQueuePage('page')).toThrow();
    expect(() => parseQueuePage('10001')).toThrow();
    expect(() => parseCountryFilter('x'.repeat(101))).toThrow();
    expect(() => parseCountryFilter(['India', 'UAE'])).toThrow();
    expect(() =>
      parseRequiredDecisionNote({ note: 'x'.repeat(2001) }, 'note'),
    ).toThrow();
  });

  it('rejects unknown decision fields and protected timestamps', () => {
    const malicious = {
      status: 'APPROVED',
      decidedAt: '2020-01-01T00:00:00.000Z',
      submittedAt: '2020-01-01T00:00:00.000Z',
      actorUserId: 'attacker',
      userId: 'attacker',
      applicationId: 'application-1',
      note: 'Please add the customer.',
      reason: 'Not a fit.',
    };
    expect(() => parseRequiredDecisionNote(malicious, 'note')).toThrow();
    expect(() => parseRequiredDecisionNote(malicious, 'reason')).toThrow();
    expect(() => parseApproveBody(malicious)).toThrow();
    expect(() => parseApproveBody({ note: 'Nope.' })).toThrow();
    parseApproveBody({});
    parseApproveBody(undefined);
  });

  it('accepts only the intended decision field', () => {
    expect(() =>
      parseRequiredDecisionNote({ reason: 'Need more.' }, 'note'),
    ).toThrow();
    expect(() =>
      parseRequiredDecisionNote({ note: 'Need more.' }, 'reason'),
    ).toThrow();
  });

  it('rejects malformed application ids without querying', () => {
    expect(() => parseApplicationId('')).toThrow();
    expect(() => parseApplicationId('x'.repeat(65))).toThrow();
    expect(() => parseApplicationId('ok\0id')).toThrow();
    expect(parseApplicationId('does-not-exist')).toBe('does-not-exist');
  });
});
