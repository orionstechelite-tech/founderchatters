import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/http/api-error.js';
import {
  validateCompleteBody,
  validateExpertiseUpdate,
  validateNeedsUpdate,
  validateProfileUpdate,
} from '../src/onboarding/onboarding-input.js';

describe('onboarding input validation', () => {
  it('trims profile fields and rejects protected assignment', () => {
    expect(
      validateProfileUpdate({
        displayName: '  Chaitanya   Pandita  ',
        city: ' Rajkot ',
        country: ' India ',
        company: {
          name: '  FounderChatters  ',
          industry: ' Community / Founder Network ',
          stage: ' Pre-launch / MVP ',
        },
      }),
    ).toEqual({
      displayName: 'Chaitanya Pandita',
      city: 'Rajkot',
      country: 'India',
      company: {
        name: 'FounderChatters',
        industry: 'Community / Founder Network',
        stage: 'Pre-launch / MVP',
      },
    });

    expect(() =>
      validateProfileUpdate({
        displayName: 'A founder',
        userId: 'another-user',
        onboardingCompletedAt: '2026-09-29T00:00:00.000Z',
        company: { founderProfileId: 'forged', name: 'Co' },
      }),
    ).toThrow(ApiError);
  });

  it('normalizes blank custom expertise and enforces 1-5 selections', () => {
    expect(
      validateExpertiseUpdate({
        topicIds: ['topic-1'],
        customExpertise: '   ',
      }),
    ).toEqual({ topicIds: ['topic-1'], customExpertise: null });

    expect(() =>
      validateExpertiseUpdate({ topicIds: [], customExpertise: '' }),
    ).toThrow(ApiError);
    expect(() =>
      validateExpertiseUpdate({
        topicIds: ['a', 'b', 'c', 'd', 'e'],
        customExpertise: 'Marketplace ops',
      }),
    ).toThrow(ApiError);
    expect(() => validateExpertiseUpdate({ topicIds: ['a', 'a'] })).toThrow(
      ApiError,
    );
    expect(() =>
      validateExpertiseUpdate({
        topicIds: ['a'],
        customExpertise: 'x'.repeat(121),
      }),
    ).toThrow(ApiError);
  });

  it('requires current need prose and caps optional areas at 3', () => {
    expect(
      validateNeedsUpdate({
        topicIds: [],
        currentNeedText: '  Finding founders who have launched in the UAE.  ',
      }),
    ).toEqual({
      topicIds: [],
      currentNeedText: 'Finding founders who have launched in the UAE.',
    });
    expect(() =>
      validateNeedsUpdate({ topicIds: [], currentNeedText: 'Too short' }),
    ).toThrow(ApiError);
    expect(() =>
      validateNeedsUpdate({
        topicIds: ['a', 'b', 'c', 'd'],
        currentNeedText: 'Finding founders who have launched in the UAE.',
      }),
    ).toThrow(ApiError);
    expect(() =>
      validateExpertiseUpdate({
        topicIds: ['a'],
        userId: 'forged',
        founderProfileId: 'forged',
      }),
    ).toThrow(ApiError);
    expect(() =>
      validateNeedsUpdate({
        topicIds: [],
        currentNeedText: 'Finding founders who have launched in the UAE.',
        companyId: 'forged',
        applicationId: 'forged',
      }),
    ).toThrow(ApiError);
    expect(() =>
      validateCompleteBody({ onboardingCompletedAt: 'now' }),
    ).toThrow(ApiError);
  });
});
