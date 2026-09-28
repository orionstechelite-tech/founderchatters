import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AUTH_ERROR_CODES,
  type AuthSessionResponse,
  type SigninRequest,
  type SignupRequest,
} from '@founderchatters/contracts';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import { PasswordHasher } from './password-hasher.js';
import {
  SessionService,
  type AuthPrincipal,
  type SessionMetadata,
} from './session.service.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

export type AuthResult = {
  response: AuthSessionResponse;
  rawToken: string;
  expiresAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(PasswordHasher)
    private readonly passwords: PasswordHasher,
    @Inject(SessionService)
    private readonly sessions: SessionService,
  ) {}

  async signup(body: unknown, metadata: SessionMetadata): Promise<AuthResult> {
    const input = this.validateCredentials(body);
    const passwordHash = await this.passwords.hash(input.password);

    try {
      const { user, session } = await this.prisma.$transaction(
        async (transaction) => {
          const user = await transaction.user.create({
            data: {
              email: input.email,
              passwordHash,
            },
          });
          const session = await this.sessions.create(
            user.id,
            metadata,
            transaction,
          );
          return { user, session };
        },
      );
      return {
        response: this.toResponse({
          sessionId: '',
          user: {
            id: user.id,
            email: user.email,
            emailVerifiedAt: user.emailVerifiedAt,
            status: 'ACTIVE',
            onboardingCompletedAt: user.onboardingCompletedAt,
            application: null,
          },
        }),
        ...session,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw this.invalidSignupError();
      }
      throw error;
    }
  }

  async signin(body: unknown, metadata: SessionMetadata): Promise<AuthResult> {
    const input = this.validateCredentials(body);
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: {
        application: {
          select: { status: true },
        },
      },
    });

    if (!user) {
      await this.passwords.hash(input.password);
      throw this.invalidCredentialsError();
    }
    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      throw this.invalidCredentialsError();
    }

    const now = new Date();
    if (
      user.status !== 'ACTIVE' ||
      user.deletedAt ||
      (user.suspendedUntil && user.suspendedUntil > now)
    ) {
      throw new ApiError(
        AUTH_ERROR_CODES.forbidden,
        'This account cannot access the service.',
        HttpStatus.FORBIDDEN,
      );
    }

    const session = await this.sessions.create(user.id, metadata);
    return {
      response: this.toResponse({
        sessionId: '',
        user: {
          id: user.id,
          email: user.email,
          emailVerifiedAt: user.emailVerifiedAt,
          status: user.status,
          onboardingCompletedAt: user.onboardingCompletedAt,
          application: user.application,
        },
      }),
      ...session,
    };
  }

  async session(rawToken: string | undefined): Promise<AuthSessionResponse> {
    return this.toResponse(await this.sessions.authenticate(rawToken));
  }

  signout(rawToken: string | undefined): Promise<void> {
    return this.sessions.revoke(rawToken);
  }

  private toResponse(principal: AuthPrincipal): AuthSessionResponse {
    const { user } = principal;
    const applicationStatus = user.application?.status ?? null;
    const state = !user.emailVerifiedAt
      ? 'VERIFY_EMAIL'
      : applicationStatus !== 'APPROVED'
        ? 'APPLICATION'
        : !user.onboardingCompletedAt
          ? 'ONBOARDING'
          : 'ACTIVE';

    return {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: Boolean(user.emailVerifiedAt),
        status: user.status,
      },
      access: {
        state,
        applicationStatus,
        onboardingCompleted: Boolean(user.onboardingCompletedAt),
      },
    };
  }

  private validateCredentials(body: unknown): SignupRequest & SigninRequest {
    const value =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : {};
    const email =
      typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
    const password = typeof value.password === 'string' ? value.password : '';
    const fieldErrors: Record<string, string[]> = {};

    if (
      !email ||
      email.length > MAX_EMAIL_LENGTH ||
      !EMAIL_PATTERN.test(email)
    ) {
      fieldErrors.email = ['Enter a valid email address.'];
    }
    if (
      password.length < MIN_PASSWORD_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      fieldErrors.password = [
        `Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`,
      ];
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new ApiError(
        AUTH_ERROR_CODES.invalidCredentials,
        'The supplied credentials are invalid.',
        HttpStatus.BAD_REQUEST,
        fieldErrors,
      );
    }
    return { email, password };
  }

  private invalidCredentialsError(): ApiError {
    return new ApiError(
      AUTH_ERROR_CODES.invalidCredentials,
      'The email or password is incorrect.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private invalidSignupError(): ApiError {
    return new ApiError(
      AUTH_ERROR_CODES.invalidCredentials,
      'Unable to create an account with those credentials.',
      HttpStatus.CONFLICT,
    );
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
