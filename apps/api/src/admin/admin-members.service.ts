import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_OPS_AUDIT_ACTIONS,
  type AdminMemberDetail,
  type AdminMemberListItem,
  type AdminPage,
} from '@founderchatters/contracts';

import { PrismaService } from '../database/prisma.service.js';
import {
  DELETED_FOUNDER_DISPLAY_NAME,
  isDeletedAccount,
  isTombstoneEmail,
} from '../identity/deleted-founder.js';
import { lockUser } from '../requests/request-locks.js';
import type { AdminPrincipal } from './admin-auth.service.js';
import { ADMIN_PAGE_SIZE, adminInvalid } from './admin-input.js';

@Injectable()
export class AdminMembersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async list(
    page: number,
    status: string | null,
    q: string | null,
  ): Promise<AdminPage<AdminMemberListItem>> {
    const where = {
      ...(status
        ? { status: status as 'ACTIVE' | 'SUSPENDED' | 'DELETED' }
        : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { id: q },
              {
                profile: {
                  is: {
                    OR: [
                      {
                        displayName: {
                          contains: q,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        company: {
                          is: {
                            name: { contains: q, mode: 'insensitive' as const },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        select: memberSelect,
      }),
    ]);
    return {
      items: rows.map(toListItem),
      page,
      pageSize: ADMIN_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
    };
  }

  async get(id: string): Promise<AdminMemberDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...memberSelect,
        suspendedUntil: true,
        suspensionReason: true,
        _count: {
          select: {
            requests: true,
            responses: true,
            contributionsReceived: true,
          },
        },
      },
    });
    if (!user) throw adminInvalid('This member could not be found.');
    const reportCount = await this.prisma.report.count({
      where: { targetType: 'USER', targetId: id },
    });
    return {
      ...toListItem(user),
      city: user.profile?.city ?? null,
      country: user.profile?.country ?? null,
      suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
      suspensionReason: isDeletedAccount(user) ? null : user.suspensionReason,
      requestCount: user._count.requests,
      responseCount: user._count.responses,
      reportCount,
      contributionCount: user._count.contributionsReceived,
    };
  }

  async suspend(
    actor: AdminPrincipal,
    id: string,
    reason: string,
  ): Promise<AdminMemberDetail> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, id);
      const user = await tx.user.findUnique({
        where: { id },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!user) throw adminInvalid('This member could not be found.');
      if (isDeletedAccount(user)) {
        throw adminInvalid('A deleted account cannot be suspended.');
      }
      if (user.status === 'SUSPENDED') {
        throw adminInvalid('This member is already suspended.');
      }
      await tx.user.update({
        where: { id },
        data: {
          status: 'SUSPENDED',
          suspensionReason: reason,
          suspendedUntil: null,
        },
      });
      await tx.moderationAction.create({
        data: {
          actorUserId: actor.user.id,
          targetType: 'USER',
          targetId: id,
          action: 'SUSPEND',
          reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.memberSuspended,
          targetType: 'USER',
          targetId: id,
          reason,
          metadata: { from: user.status, to: 'SUSPENDED' },
        },
      });
    });
    return this.get(id);
  }

  async restore(actor: AdminPrincipal, id: string): Promise<AdminMemberDetail> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, id);
      const user = await tx.user.findUnique({
        where: { id },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!user) throw adminInvalid('This member could not be found.');
      if (isDeletedAccount(user)) {
        throw adminInvalid('A deleted account cannot be restored.');
      }
      if (user.status !== 'SUSPENDED') {
        throw adminInvalid('Only a suspended member can be restored.');
      }
      await tx.user.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          suspensionReason: null,
          suspendedUntil: null,
        },
      });
      await tx.moderationAction.create({
        data: {
          actorUserId: actor.user.id,
          targetType: 'USER',
          targetId: id,
          action: 'RESTORE',
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.memberRestored,
          targetType: 'USER',
          targetId: id,
          metadata: { from: 'SUSPENDED', to: 'ACTIVE' },
        },
      });
    });
    return this.get(id);
  }
}

const memberSelect = {
  id: true,
  email: true,
  status: true,
  deletedAt: true,
  emailVerifiedAt: true,
  onboardingCompletedAt: true,
  createdAt: true,
  application: { select: { status: true } },
  profile: {
    select: {
      displayName: true,
      city: true,
      country: true,
      company: { select: { name: true } },
    },
  },
} as const;

function toListItem(user: {
  id: string;
  email: string;
  status: string;
  deletedAt: Date | null;
  emailVerifiedAt: Date | null;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  application: { status: string } | null;
  profile: {
    displayName: string;
    company: { name: string } | null;
  } | null;
}): AdminMemberListItem {
  const deleted = isDeletedAccount(user);
  return {
    id: user.id,
    displayName: deleted
      ? DELETED_FOUNDER_DISPLAY_NAME
      : (user.profile?.displayName ?? ''),
    email: deleted || isTombstoneEmail(user.email) ? null : user.email,
    companyName: deleted ? null : (user.profile?.company?.name ?? null),
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    applicationStatus: user.application?.status ?? null,
    onboardingCompleted: Boolean(user.onboardingCompletedAt),
    createdAt: user.createdAt.toISOString(),
    deleted,
  };
}
