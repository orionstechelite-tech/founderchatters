import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/http/api-error.js';
import {
  assertActiveMember,
  requireOnboardingWritable,
} from '../src/onboarding/onboarding-access.js';
import type { AuthPrincipal } from '../src/auth/session.service.js';

function principal(
  overrides: Partial<AuthPrincipal['user']> = {},
): AuthPrincipal {
  return {
    sessionId: 'session-1',
    user: {
      id: 'user-1',
      email: 'founder@example.com',
      emailVerifiedAt: new Date('2026-09-28T00:00:00.000Z'),
      status: 'ACTIVE',
      onboardingCompletedAt: new Date('2026-09-29T00:00:00.000Z'),
      application: { status: 'APPROVED' },
      ...overrides,
    },
  };
}

describe('member access gate', () => {
  it('allows verified approved onboarded members', () => {
    expect(() => assertActiveMember(principal())).not.toThrow();
  });

  it.each([
    ['unverified', { emailVerifiedAt: null }],
    ['not approved', { application: { status: 'SUBMITTED' as const } }],
    ['not onboarded', { onboardingCompletedAt: null }],
  ])('rejects %s users', (_label, overrides) => {
    expect(() =>
      assertActiveMember(
        principal(overrides as Partial<AuthPrincipal['user']>),
      ),
    ).toThrow(ApiError);
  });

  it('blocks onboarding writes after completion', () => {
    expect(() => requireOnboardingWritable(principal())).toThrow(ApiError);
    expect(() =>
      requireOnboardingWritable(principal({ onboardingCompletedAt: null })),
    ).not.toThrow();
  });
});
