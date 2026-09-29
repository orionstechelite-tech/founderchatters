import { HttpStatus } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '@founderchatters/contracts';
import type { Request } from 'express';

import type { SessionService, AuthPrincipal } from '../auth/session.service.js';
import type { AppConfig } from '../config.js';
import { ApiError } from '../http/api-error.js';

export function readSessionCookie(
  request: Request,
  cookieName: string,
): string | undefined {
  const header = request.header('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === cookieName) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export async function requireApprovedFounder(
  request: Request,
  sessions: SessionService,
  config: AppConfig,
): Promise<AuthPrincipal> {
  const principal = await sessions.authenticate(
    readSessionCookie(request, config.sessionCookieName),
  );
  if (!principal.user.emailVerifiedAt) {
    throw new ApiError(
      AUTH_ERROR_CODES.emailNotVerified,
      'Verify your email before continuing onboarding.',
      HttpStatus.FORBIDDEN,
    );
  }
  if (principal.user.application?.status !== 'APPROVED') {
    throw new ApiError(
      AUTH_ERROR_CODES.forbidden,
      'Onboarding is only available after your application is approved.',
      HttpStatus.FORBIDDEN,
    );
  }
  return principal;
}

export function requireOnboardingWritable(principal: AuthPrincipal): void {
  if (principal.user.onboardingCompletedAt) {
    throw new ApiError(
      AUTH_ERROR_CODES.forbidden,
      'Onboarding details can no longer be changed here.',
      HttpStatus.FORBIDDEN,
    );
  }
}

export function assertActiveMember(principal: AuthPrincipal): void {
  if (
    !principal.user.emailVerifiedAt ||
    principal.user.application?.status !== 'APPROVED' ||
    !principal.user.onboardingCompletedAt
  ) {
    throw new ApiError(
      AUTH_ERROR_CODES.forbidden,
      'Active membership is required.',
      HttpStatus.FORBIDDEN,
    );
  }
}

export async function requireActiveMember(
  request: Request,
  sessions: SessionService,
  config: AppConfig,
): Promise<AuthPrincipal> {
  const principal = await sessions.authenticate(
    readSessionCookie(request, config.sessionCookieName),
  );
  assertActiveMember(principal);
  return principal;
}
