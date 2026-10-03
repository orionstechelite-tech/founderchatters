import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  SETTINGS_ERROR_CODES,
  type ChangePasswordResponse,
  type MemberProfileSettingsResponse,
  type MemberSessionsResponse,
  type OtherSessionsRevokedResponse,
  type SessionRevokedResponse,
} from '@founderchatters/contracts';

import { PasswordHasher } from '../auth/password-hasher.js';
import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import {
  validateChangePassword,
  validateProfileSettingsUpdate,
} from './settings-input.js';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(PasswordHasher)
    private readonly passwords: PasswordHasher,
  ) {}

  async getProfile(userId: string): Promise<MemberProfileSettingsResponse> {
    const profile = await this.prisma.founderProfile.findUnique({
      where: { userId },
      select: {
        displayName: true,
        city: true,
        country: true,
        headline: true,
        bio: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!profile?.company) {
      throw this.profileUnavailable();
    }

    return {
      profile: {
        displayName: profile.displayName,
        companyName: profile.company.name,
        city: profile.city,
        country: profile.country,
        headline: profile.headline,
        bio: profile.bio,
      },
    };
  }

  async updateProfile(
    userId: string,
    body: unknown,
  ): Promise<MemberProfileSettingsResponse> {
    const input = validateProfileSettingsUpdate(body);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE
      `;

      const profile = await transaction.founderProfile.findUnique({
        where: { userId },
        select: {
          id: true,
          company: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!profile?.company) {
        throw this.profileUnavailable();
      }

      const profileData = {
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.headline !== undefined ? { headline: input.headline } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
      };

      if (Object.keys(profileData).length > 0) {
        await transaction.founderProfile.update({
          where: { id: profile.id },
          data: profileData,
        });
      }

      if (input.companyName !== undefined) {
        await transaction.company.update({
          where: { id: profile.company.id },
          data: { name: input.companyName },
        });
      }
    });

    return this.getProfile(userId);
  }

  async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<MemberSessionsResponse> {
    const now = new Date();

    const rows = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return {
      sessions: rows.map((row) => ({
        id: row.id,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        current: row.id === currentSessionId,
      })),
    };
  }

  async revokeSession(
    userId: string,
    currentSessionId: string,
    sessionId: string,
  ): Promise<SessionRevokedResponse> {
    const row = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: {
        id: true,
        revokedAt: true,
      },
    });

    if (!row) {
      throw this.sessionNotFound();
    }

    if (row.id === currentSessionId) {
      throw new ApiError(
        SETTINGS_ERROR_CODES.currentSession,
        'Sign out to end your current session.',
        HttpStatus.CONFLICT,
      );
    }

    if (!row.revokedAt) {
      await this.prisma.session.updateMany({
        where: {
          id: row.id,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return {
      sessionId: row.id,
      revoked: true,
    };
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<OtherSessionsRevokedResponse> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      revokedCount: result.count,
    };
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    body: unknown,
  ): Promise<ChangePasswordResponse> {
    const input = validateChangePassword(body);
    const newPasswordHash = await this.passwords.hash(input.newPassword);

    const revokedSessionCount = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE
        `;

        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            passwordHash: true,
          },
        });

        if (
          !user ||
          !(await this.passwords.verify(
            user.passwordHash,
            input.currentPassword,
          ))
        ) {
          throw new ApiError(
            SETTINGS_ERROR_CODES.currentPasswordInvalid,
            'The current password is incorrect.',
            HttpStatus.BAD_REQUEST,
            {
              currentPassword: ['The current password is incorrect.'],
            },
          );
        }

        await transaction.user.update({
          where: { id: userId },
          data: {
            passwordHash: newPasswordHash,
          },
        });

        const revoked = await transaction.session.updateMany({
          where: {
            userId,
            id: { not: currentSessionId },
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            revokedAt: new Date(),
          },
        });

        return revoked.count;
      },
    );

    return {
      changed: true,
      revokedSessionCount,
    };
  }

  private profileUnavailable(): ApiError {
    return new ApiError(
      SETTINGS_ERROR_CODES.profileUnavailable,
      'Your profile settings are not available.',
      HttpStatus.CONFLICT,
    );
  }

  private sessionNotFound(): ApiError {
    return new ApiError(
      SETTINGS_ERROR_CODES.sessionNotFound,
      'That session is not available.',
      HttpStatus.NOT_FOUND,
    );
  }
}
