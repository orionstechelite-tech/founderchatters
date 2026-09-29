import { describe, expect, it } from 'vitest';

import {
  helpNotAllowed,
  parseAdviceBody,
  parseHelpResponsesQuery,
  parseIntroductionBody,
  parsePrivateChatBody,
} from '../src/requests/help-responses-query.js';

describe('help response input', () => {
  it('requires trimmed advice between 20 and 2000 characters', () => {
    expect(() => parseAdviceBody({ body: '   ' })).toThrow();
    expect(() => parseAdviceBody({ body: 'x'.repeat(19) })).toThrow();
    expect(parseAdviceBody({ body: 'x'.repeat(20) }).body).toHaveLength(20);
    expect(parseAdviceBody({ body: 'x'.repeat(2000) }).body).toHaveLength(2000);
    expect(() => parseAdviceBody({ body: 'x'.repeat(2001) })).toThrow();
    const ok = parseAdviceBody({
      body: '  Practical partner advice from a real launch.  ',
    });
    expect(ok.body.startsWith('Practical')).toBe(true);
    expect(() => parseAdviceBody({ body: 12 })).toThrow();
    expect(() =>
      parseAdviceBody({
        body: 'Enough advice for a founder.',
        extra: 1,
        authorId: 'user-1',
        requestId: 'req-1',
        type: 'ADVICE',
        deletedAt: 'now',
      }),
    ).toThrow();
    expect(
      parseAdviceBody({
        body: '  <script>alert(1)</script> useful launch advice.  ',
      }).body,
    ).toBe('<script>alert(1)</script> useful launch advice.');
  });

  it('requires introduction attestation and bounded personName', () => {
    expect(() =>
      parseIntroductionBody({
        personName: 'A',
        permissionConfirmed: true,
      }),
    ).toThrow();
    expect(
      parseIntroductionBody({
        personName: 'Ab',
        permissionConfirmed: true,
      }).personName,
    ).toBe('Ab');
    expect(
      parseIntroductionBody({
        personName: 'A'.repeat(160),
        permissionConfirmed: true,
      }).personName,
    ).toHaveLength(160);
    expect(() =>
      parseIntroductionBody({
        personName: 'A'.repeat(161),
        permissionConfirmed: true,
      }),
    ).toThrow();
    expect(() =>
      parseIntroductionBody({
        personName: 'Ada Founder',
        reason: 'r'.repeat(501),
        permissionConfirmed: true,
      }),
    ).toThrow();
    expect(() =>
      parseIntroductionBody({
        personName: 'Ada Founder',
        permissionConfirmed: false,
      }),
    ).toThrow();
    expect(() =>
      parseIntroductionBody({
        personName: 'Ada Founder',
      }),
    ).toThrow();
    expect(() =>
      parseIntroductionBody({
        personName: 'Ada Founder',
        permissionConfirmed: 'true',
      }),
    ).toThrow();
    expect(() =>
      parseIntroductionBody({
        personName: 'Ada Founder',
        permissionConfirmed: 1,
      }),
    ).toThrow();
    expect(() =>
      parseIntroductionBody({
        personName: 'Ada Founder',
        permissionConfirmed: null,
      }),
    ).toThrow();
    const parsed = parseIntroductionBody({
      personName: '  Ada Founder  ',
      reason: '   ',
      permissionConfirmed: true,
    });
    expect(parsed.personName).toBe('Ada Founder');
    expect(parsed.reason).toBeNull();
    for (const extra of [
      'email',
      'phone',
      'linkedin',
      'contact',
      'url',
      'authorId',
      'requestId',
      'status',
      'consentedAt',
      'introducedAt',
      'responseId',
    ]) {
      expect(() =>
        parseIntroductionBody({
          personName: 'Ada Founder',
          permissionConfirmed: true,
          [extra]: 'smuggled',
        }),
      ).toThrow();
    }
  });

  it('rejects private-chat bodies and malformed list queries', () => {
    expect(() => parsePrivateChatBody({ note: 'hi' })).toThrow();
    expect(() => parsePrivateChatBody({ body: 'secret' })).toThrow();
    expect(() => parsePrivateChatBody({ conversationId: 'c1' })).toThrow();
    expect(() => parsePrivateChatBody({})).not.toThrow();
    expect(() => parseHelpResponsesQuery({ page: ['1'] })).toThrow();
    expect(() => parseHelpResponsesQuery({ page: '0' })).toThrow();
    expect(() => parseHelpResponsesQuery({ page: '-1' })).toThrow();
    expect(() => parseHelpResponsesQuery({ page: '1.5' })).toThrow();
    expect(() => parseHelpResponsesQuery({ page: 'abc' })).toThrow();
    expect(() => parseHelpResponsesQuery({ pageSize: '0' })).toThrow();
    expect(() => parseHelpResponsesQuery({ pageSize: '51' })).toThrow();
    expect(() => parseHelpResponsesQuery({ pageSize: ['20'] })).toThrow();
    expect(() => parseHelpResponsesQuery({ foo: '1' })).toThrow();
    expect(() => parseHelpResponsesQuery({ pageSize: '99' })).toThrow();
    expect(parseHelpResponsesQuery({ page: '2', pageSize: '10' })).toEqual({
      page: 2,
      pageSize: 10,
    });
    expect(parseHelpResponsesQuery({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('does not leak ownership in the not-allowed error', () => {
    const error = helpNotAllowed();
    expect(error.code).toBe('HELP_RESPONSE_NOT_ALLOWED');
    expect(error.message).toBe('You cannot add this help response.');
  });
});
