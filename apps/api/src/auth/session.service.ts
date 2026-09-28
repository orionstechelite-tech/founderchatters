import { createHmac, randomBytes } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '@founderchatters/contracts';
import type { CookieOptions } from 'express';

import { AppConfig } from '../config.js';
import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type SessionMetadata = {
  ipAddress: string | undefined;
  userAgent: string | undefined;
};

export type AuthPrincipal = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    status: 'ACTIVE';
    onboardingCompletedAt: Date | null;
    application: {
      status: 'DRAFT' | 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED';
    } | null;
  };
};

@Injectable()
export class SessionService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  async create(
    userId: string,
    metadata: SessionMetadata,
    client: Pick<PrismaService, 'session'> = this.prisma,
  ): Promise<{ rawToken: string; expiresAt: Date }> {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    await client.session.create({
      data: {
        userId,
        tokenHash: this.digest('session-token', rawToken),
        userAgent: metadata.userAgent?.slice(0, 512) ?? null,
        ipHash: metadata.ipAddress
          ? this.digest('session-ip', metadata.ipAddress)
          : null,
        expiresAt,
      },
    });
    return { rawToken, expiresAt };
  }

  async authenticate(rawToken: string | undefined): Promise<AuthPrincipal> {
    if (!rawToken || !SESSION_TOKEN_PATTERN.test(rawToken)) {
      throw this.expiredError();
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.digest('session-token', rawToken) },
      include: {
        user: {
          include: {
            application: {
              select: { status: true },
            },
          },
        },
      },
    });
    const now = new Date();

    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw this.expiredError();
    }
    if (
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt ||
      (session.user.suspendedUntil && session.user.suspendedUntil > now)
    ) {
      throw new ApiError(
        AUTH_ERROR_CODES.forbidden,
        'This account cannot access the service.',
        HttpStatus.FORBIDDEN,
      );
    }

    return {
      sessionId: session.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        emailVerifiedAt: session.user.emailVerifiedAt,
        status: session.user.status,
        onboardingCompletedAt: session.user.onboardingCompletedAt,
        application: session.user.application,
      },
    };
  }

  async revoke(rawToken: string | undefined): Promise<void> {
    if (!rawToken || !SESSION_TOKEN_PATTERN.test(rawToken)) {
      return;
    }
    await this.prisma.session.updateMany({
      where: {
        tokenHash: this.digest('session-token', rawToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  cookieOptions(expiresAt: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_LIFETIME_MS,
      expires: expiresAt,
    };
  }

  clearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    };
  }

  hashRateLimitClient(ipAddress: string): string {
    return this.digest('rate-limit-ip', ipAddress);
  }

  private digest(purpose: string, value: string): string {
    return createHmac('sha256', this.config.sessionSecret)
      .update(`${purpose}\0${value}`, 'utf8')
      .digest('base64url');
  }

  private expiredError(): ApiError {
    return new ApiError(
      AUTH_ERROR_CODES.sessionExpired,
      'The session is missing or has expired.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
