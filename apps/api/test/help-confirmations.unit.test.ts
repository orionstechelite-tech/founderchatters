import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  HELP_CONFIRMATION_ERROR_CODES,
  HELP_OUTCOMES,
} from '@founderchatters/contracts';

import {
  confirmationNotAllowed,
  parseHelpConfirmationBody,
  parseThankYouBody,
  sameTopicSet,
} from '../src/requests/help-confirmations-query.js';
import {
  contributionCreatedEvent,
  eventHasPrivateContent,
  helpConfirmedEvent,
} from '../src/requests/help-confirmations-events.js';
import { parseReputationQuery } from '../src/requests/reputation-query.js';
import { ApiError } from '../src/http/api-error.js';

describe('help confirmation input', () => {
  it('requires a response, outcome, and allowlisted fields', () => {
    expect(() => parseHelpConfirmationBody(null)).toThrow(ApiError);
    expect(() => parseHelpConfirmationBody({ outcome: 'HELPED' })).toThrow();
    expect(() =>
      parseHelpConfirmationBody({ responseId: 'res-1', outcome: 'MAYBE' }),
    ).toThrow();
    expect(
      parseHelpConfirmationBody({
        responseId: 'res-1',
        outcome: HELP_OUTCOMES.stillTalking,
      }),
    ).toEqual({
      responseId: 'res-1',
      outcome: HELP_OUTCOMES.stillTalking,
    });
    expect(() =>
      parseHelpConfirmationBody({
        responseId: 'res-1',
        outcome: HELP_OUTCOMES.helped,
        helperId: 'user-1',
        confirmerId: 'user-2',
        contributorId: 'user-3',
        contributionId: 'c1',
        createdAt: 'now',
        foundersHelped: 9,
        introductionCount: 4,
        score: 12,
        rating: 5,
        adminOverride: true,
      }),
    ).toThrow();
    expect(() =>
      parseHelpConfirmationBody({
        responseId: 'res-1',
        outcome: HELP_OUTCOMES.stillTalking,
        topicIds: ['topic-1'],
      }),
    ).toThrow();
    expect(
      parseHelpConfirmationBody({
        responseId: 'res-1',
        outcome: HELP_OUTCOMES.helped,
        topicIds: ['b', 'a'],
      }).topicIds,
    ).toEqual(['b', 'a']);
    expect(() =>
      parseHelpConfirmationBody({
        responseId: 'res-1',
        outcome: HELP_OUTCOMES.helped,
        topicIds: ['a', 'a'],
      }),
    ).toThrow();
    expect(() =>
      parseHelpConfirmationBody({
        responseId: 'res-1',
        outcome: HELP_OUTCOMES.helped,
        topicIds: ['a', 'b', 'c', 'd'],
      }),
    ).toThrow();
  });

  it('requires a trimmed thank-you between 1 and 500 characters', () => {
    expect(() => parseThankYouBody({})).toThrow();
    expect(() => parseThankYouBody({ body: '   ' })).toThrow();
    expect(parseThankYouBody({ body: 'a' }).body).toBe('a');
    expect(parseThankYouBody({ body: `${'a'.repeat(500)}` }).body).toHaveLength(
      500,
    );
    expect(() => parseThankYouBody({ body: 'a'.repeat(501) })).toThrow();
    expect(parseThankYouBody({ body: '  Thanks\nfor the intro.  ' }).body).toBe(
      'Thanks\nfor the intro.',
    );
    expect(parseThankYouBody({ body: '<script>alert(1)</script>' }).body).toBe(
      '<script>alert(1)</script>',
    );
    expect(() =>
      parseThankYouBody({ body: 'Thanks', helperId: 'x' }),
    ).toThrow();
    expect(() =>
      parseThankYouBody({
        body: 'Thanks',
        contributionId: 'c1',
        confirmerId: 'u1',
        requestId: 'r1',
        responseId: 'res1',
        createdAt: 'now',
        id: 'n1',
        outcome: 'HELPED',
        topicIds: [],
      }),
    ).toThrow();
  });

  it('treats topic sets as order-independent', () => {
    expect(sameTopicSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameTopicSet([], [])).toBe(true);
    expect(sameTopicSet(['a'], ['a', 'b'])).toBe(false);
  });

  it('keeps block errors direction-agnostic', () => {
    const error = confirmationNotAllowed();
    expect(error.code).toBe(HELP_CONFIRMATION_ERROR_CODES.notAllowed);
    expect(error.message).not.toMatch(/blocker|blocked/i);
  });
});

describe('reputation query', () => {
  it('defaults page size, caps the max, and rejects unknown keys', () => {
    expect(parseReputationQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(parseReputationQuery({ page: '2', pageSize: '50' })).toEqual({
      page: 2,
      pageSize: 50,
    });
    expect(() => parseReputationQuery({ pageSize: '51' })).toThrow();
    expect(() => parseReputationQuery({ page: '0' })).toThrow();
    expect(() => parseReputationQuery({ page: '-1' })).toThrow();
    expect(() => parseReputationQuery({ page: '1.5' })).toThrow();
    expect(() => parseReputationQuery({ page: 'abc' })).toThrow();
    expect(() => parseReputationQuery({ page: 'NaN' })).toThrow();
    expect(() => parseReputationQuery({ pageSize: '0' })).toThrow();
    expect(() => parseReputationQuery({ page: ['1', '1'] })).toThrow();
    expect(() => parseReputationQuery({ sort: 'score' })).toThrow();
  });
});

describe('help confirmation events', () => {
  it('emits ids and outcome only, with no private content', () => {
    const confirmed = helpConfirmedEvent({
      helpConfirmationId: 'hc1',
      requestId: 'r1',
      confirmerId: 'u1',
      helperId: 'u2',
      responseId: 'res1',
      outcome: HELP_OUTCOMES.helped,
      responseType: 'ADVICE',
    });
    const created = contributionCreatedEvent({
      contributionId: 'c1',
      helpConfirmationId: 'hc1',
      contributorId: 'u2',
      requestId: 'r1',
      responseType: 'ADVICE',
      topicCount: 1,
    });
    expect(confirmed.type).toBe('help.confirmed');
    expect(created.type).toBe('contribution.created');
    expect(eventHasPrivateContent(confirmed)).toBe(false);
    expect(eventHasPrivateContent(created)).toBe(false);
    expect(JSON.stringify(confirmed)).not.toContain('headline');
    expect(JSON.stringify(created)).not.toContain('personName');
  });
});

describe('help confirmation source privacy', () => {
  it('does not log private bodies or write notifications', () => {
    const service = readFileSync(
      resolve(__dirname, '../src/requests/help-confirmations.service.ts'),
      'utf8',
    );
    const reputation = readFileSync(
      resolve(__dirname, '../src/requests/reputation.service.ts'),
      'utf8',
    );
    expect(service).not.toMatch(/console\.(log|debug|info|warn)/);
    expect(service).not.toMatch(/prisma\.notification/);
    expect(service).not.toMatch(/admin\/reputation/);
    expect(service).toMatch(/introduction: \{ select: \{ status: true \} \}/);
    expect(service).toMatch(/select: \{ id: true \}/);
    expect(service).not.toMatch(/message\.body|Message\.body/);
    expect(reputation).not.toMatch(/headline/);
    expect(reputation).not.toMatch(/personName/);
    expect(reputation).not.toMatch(/whoCouldHelp|context:/);
    expect(reputation).not.toMatch(/Message\.body|message\.body/);
    expect(reputation).not.toMatch(/repeat founder/);
  });
});
