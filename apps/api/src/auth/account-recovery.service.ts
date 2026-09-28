import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AUTH_ERROR_CODES,
  type AcceptedResponse,
  type ResetPasswordResponse,
  type VerifyEmailResponse,
} from '@founderchatters/contracts';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import { validatePassword } from './auth-input.js';
import { AuthTokenService } from './auth-token.service.js';
import {
  AuthEmailFailureReporter,
  AuthEmailService,
  type AuthEmailContext,
} from './email-delivery.service.js';
import { PasswordHasher } from './password-hasher.js';

export const AUTH_TOKEN_ISSUANCE_MAX_ATTEMPTS = 3;

@Injectable()
export class AccountRecoveryService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuthTokenService)
    private readonly tokens: AuthTokenService,
    @Inject(AuthEmailService)
    private readonly email: AuthEmailService,
    @Inject(AuthEmailFailureReporter)
    private readonly failures: AuthEmailFailureReporter,
    @Inject(PasswordHasher)
    private readonly passwords: PasswordHasher,
  ) {}

  async resendVerification(
    email: string,
    context: AuthEmailContext,
  ): Promise<AcceptedResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        status: true,
        deletedAt: true,
      },
    });

    if (
      user &&
      !user.emailVerifiedAt &&
      user.status !== 'DELETED' &&
      !user.deletedAt
    ) {
      await this.issueVerificationToken(user.id, user.email, context).catch(
        () => this.failures.report(context, 'token-finalization'),
      );
    }

    return { accepted: true };
  }

  async verifyEmail(rawToken: string): Promise<VerifyEmailResponse> {
    const tokenHash = this.tokens.hash('email-verification', rawToken);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: {
              id: true,
              status: true,
              deletedAt: true,
              emailVerifiedAt: true,
            },
          },
        },
      });

      if (!token || token.user.status === 'DELETED' || token.user.deletedAt) {
        throw this.tokenError(
          AUTH_ERROR_CODES.verifyTokenInvalid,
          'This verification link is invalid.',
        );
      }
      if (token.usedAt) {
        throw this.tokenError(
          AUTH_ERROR_CODES.verifyTokenInvalid,
          'This verification link has already been used.',
        );
      }
      if (token.expiresAt <= now) {
        throw this.tokenError(
          AUTH_ERROR_CODES.verifyTokenExpired,
          'This verification link has expired.',
        );
      }

      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw this.tokenError(
          AUTH_ERROR_CODES.verifyTokenInvalid,
          'This verification link has already been used.',
        );
      }

      if (!token.user.emailVerifiedAt) {
        await tx.user.update({
          where: { id: token.userId },
          data: { emailVerifiedAt: now },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: token.userId,
            action: 'AUTH_EMAIL_VERIFIED',
            targetType: 'User',
            targetId: token.userId,
          },
        });
      }

      return {
        verified: true,
      };
    });
  }

  async requestPasswordReset(
    email: string,
    context: AuthEmailContext,
  ): Promise<AcceptedResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true, deletedAt: true },
    });

    if (user && user.status !== 'DELETED' && !user.deletedAt) {
      await this.issuePasswordResetToken(user.id, user.email, context).catch(
        () => this.failures.report(context, 'token-finalization'),
      );
    }

    return { accepted: true };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<ResetPasswordResponse> {
    validatePassword(newPassword);
    const tokenHash = this.tokens.hash('password-reset', rawToken);
    const passwordHash = await this.passwords.hash(newPassword);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: { id: true, status: true, deletedAt: true },
          },
        },
      });

      if (!token || token.user.status === 'DELETED' || token.user.deletedAt) {
        throw this.tokenError(
          AUTH_ERROR_CODES.resetTokenInvalid,
          'This password reset link is invalid.',
        );
      }
      if (token.usedAt) {
        throw this.tokenError(
          AUTH_ERROR_CODES.resetTokenInvalid,
          'This password reset link has already been used.',
        );
      }
      if (token.expiresAt <= now) {
        throw this.tokenError(
          AUTH_ERROR_CODES.resetTokenExpired,
          'This password reset link has expired.',
        );
      }

      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw this.tokenError(
          AUTH_ERROR_CODES.resetTokenInvalid,
          'This password reset link has already been used.',
        );
      }

      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      });
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: {
          userId: token.userId,
          usedAt: null,
          id: { not: token.id },
        },
        data: { usedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: token.userId,
          action: 'AUTH_PASSWORD_RESET',
          targetType: 'User',
          targetId: token.userId,
        },
      });

      return {
        passwordReset: true,
      };
    });
  }

  private async issueVerificationToken(
    userId: string,
    email: string,
    context: AuthEmailContext,
  ): Promise<void> {
    const issued = this.tokens.issue('email-verification');
    const now = new Date();
    const candidate = await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        usedAt: now,
      },
    });

    try {
      await this.email.sendVerification(email, issued.rawToken, context);
    } catch {
      await this.deleteVerificationCandidate(candidate.id, context);
      return;
    }

    try {
      await this.withSerializableRetry(async (tx) => {
        const promoted = await tx.emailVerificationToken.updateMany({
          where: { id: candidate.id, userId },
          data: { usedAt: null },
        });
        if (promoted.count !== 1) {
          throw new Error('Verification token candidate is unavailable');
        }
        await tx.emailVerificationToken.updateMany({
          where: { userId, id: { not: candidate.id }, usedAt: null },
          data: { usedAt: now },
        });
      });
    } catch {
      await this.deleteVerificationCandidate(candidate.id, context);
      this.failures.report(context, 'token-finalization');
    }
  }

  private async issuePasswordResetToken(
    userId: string,
    email: string,
    context: AuthEmailContext,
  ): Promise<void> {
    const issued = this.tokens.issue('password-reset');
    const now = new Date();
    const candidate = await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        usedAt: now,
      },
    });

    try {
      await this.email.sendPasswordReset(email, issued.rawToken, context);
    } catch {
      await this.deletePasswordResetCandidate(candidate.id, context);
      return;
    }

    try {
      await this.withSerializableRetry(async (tx) => {
        const promoted = await tx.passwordResetToken.updateMany({
          where: { id: candidate.id, userId },
          data: { usedAt: null },
        });
        if (promoted.count !== 1) {
          throw new Error('Password reset token candidate is unavailable');
        }
        await tx.passwordResetToken.updateMany({
          where: { userId, id: { not: candidate.id }, usedAt: null },
          data: { usedAt: now },
        });
      });
    } catch {
      await this.deletePasswordResetCandidate(candidate.id, context);
      this.failures.report(context, 'token-finalization');
    }
  }

  private async deleteVerificationCandidate(
    id: string,
    context: AuthEmailContext,
  ): Promise<void> {
    await this.prisma.emailVerificationToken
      .deleteMany({ where: { id, usedAt: { not: null } } })
      .catch(() => this.failures.report(context, 'token-finalization'));
  }

  private async deletePasswordResetCandidate(
    id: string,
    context: AuthEmailContext,
  ): Promise<void> {
    await this.prisma.passwordResetToken
      .deleteMany({ where: { id, usedAt: { not: null } } })
      .catch(() => this.failures.report(context, 'token-finalization'));
  }

  private async withSerializableRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= AUTH_TOKEN_ISSUANCE_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !this.isTransactionConflict(error) ||
          attempt === AUTH_TOKEN_ISSUANCE_MAX_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
    throw new Error('Token issuance retry limit reached');
  }

  private isTransactionConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    );
  }

  private tokenError(code: string, message: string): ApiError {
    return new ApiError(code, message, HttpStatus.BAD_REQUEST);
  }
}
