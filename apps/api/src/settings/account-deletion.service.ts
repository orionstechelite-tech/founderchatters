import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ACCOUNT_DELETION_AUDIT_ACTIONS } from '@founderchatters/contracts';

import type { Prisma } from '../../../../generated/prisma/client.js';

import { PasswordHasher } from '../auth/password-hasher.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  DELETED_COMPANY_NAME,
  DELETED_FOUNDER_DISPLAY_NAME,
  newTombstoneEmail,
} from '../identity/deleted-founder.js';
import { lockUser } from '../requests/request-locks.js';
import { parseDeleteAccountBody } from './account-deletion-input.js';

export const ACCOUNT_DELETION_WORKFLOW_VERSION = 1;

@Injectable()
export class AccountDeletionService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(PasswordHasher)
    private readonly passwords: PasswordHasher,
  ) {}

  async deleteAccount(userId: string, body: unknown): Promise<void> {
    parseDeleteAccountBody(body);
    const passwordHash = await this.passwords.hash(
      randomBytes(32).toString('base64url'),
    );
    const now = new Date();

    // LEGAL REVIEW REQUIRED before production launch. This workflow only
    // anonymizes identity fields implemented below. It does not invent a
    // retention period and does not destroy historical free-text, message
    // bodies, report details, application notes, or other integrity records.
    await this.prisma.$transaction(
      async (tx) => {
        await lockUser(tx, userId);
        const tombstoneEmail = await allocateTombstoneEmail(tx);

        const revoked = await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.emailVerificationToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.passwordResetToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.userAdminRole.deleteMany({ where: { userId } });
        await tx.savedFounder.deleteMany({
          where: { OR: [{ saverId: userId }, { savedFounderId: userId }] },
        });

        const profile = await tx.founderProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (profile) {
          await tx.founderExpertise.deleteMany({
            where: { profileId: profile.id },
          });
          await tx.founderNeed.deleteMany({ where: { profileId: profile.id } });
          await tx.founderProfile.update({
            where: { id: profile.id },
            data: {
              displayName: DELETED_FOUNDER_DISPLAY_NAME,
              headline: null,
              bio: null,
              city: null,
              country: null,
              avatarUrl: null,
              customExpertise: null,
              currentNeedText: null,
            },
          });
          await tx.company.updateMany({
            where: { founderProfileId: profile.id },
            data: {
              name: DELETED_COMPANY_NAME,
              website: null,
              description: null,
              stage: null,
              industry: null,
              city: null,
              country: null,
            },
          });
        }

        await tx.founderApplication.updateMany({
          where: { userId },
          data: {
            eligibilityRole: null,
            companyName: null,
            roleTitle: null,
            website: null,
            city: null,
            country: null,
            buildingSummary: null,
          },
        });

        await tx.notificationDelivery.updateMany({
          where: {
            notification: { userId },
            status: { in: ['QUEUED', 'RETRY_QUEUED'] },
          },
          data: {
            status: 'FAILED',
            lastErrorCode: 'ACCOUNT_DELETED',
          },
        });
        await tx.notification.updateMany({
          where: { href: `/founders/${userId}` },
          data: { href: null },
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            status: 'DELETED',
            deletedAt: now,
            email: tombstoneEmail,
            passwordHash,
            emailVerifiedAt: null,
            suspendedUntil: null,
            suspensionReason: null,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            action: ACCOUNT_DELETION_AUDIT_ACTIONS.deleted,
            targetType: 'USER',
            targetId: userId,
            metadata: {
              workflowVersion: ACCOUNT_DELETION_WORKFLOW_VERSION,
              revokedSessionCount: revoked.count,
            },
          },
        });
      },
      {
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
  }
}

const TOMBSTONE_EMAIL_ATTEMPTS = 8;

async function allocateTombstoneEmail(
  tx: Prisma.TransactionClient,
): Promise<string> {
  for (let attempt = 0; attempt < TOMBSTONE_EMAIL_ATTEMPTS; attempt += 1) {
    const email = newTombstoneEmail();
    const taken = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!taken) return email;
  }
  throw new Error('Unable to allocate a unique tombstone email.');
}
