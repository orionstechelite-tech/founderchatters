import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_OPS_AUDIT_ACTIONS,
  ADMIN_ROLES,
  type AdminPage,
  type AdminRoleKey,
  type AdminRoleListItem,
  type AdminUserListItem,
} from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import { isDeletedAccount } from '../identity/deleted-founder.js';
import { lockUser } from '../requests/request-locks.js';
import type { AdminPrincipal } from './admin-auth.service.js';
import {
  ADMIN_PAGE_SIZE,
  adminForbidden,
  adminInvalid,
} from './admin-input.js';
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async list(page: number): Promise<AdminPage<AdminUserListItem>> {
    const where = { adminRoles: { some: {} } };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        select: userSelect,
      }),
    ]);
    return {
      items: rows.map(toAdminUser),
      page,
      pageSize: ADMIN_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
    };
  }

  async get(userId: string): Promise<AdminUserListItem> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!user || user.adminRoles.length === 0) {
      throw adminInvalid('This admin user could not be found.');
    }
    return toAdminUser(user);
  }

  async listRoles(): Promise<{ roles: AdminRoleListItem[] }> {
    const roles = await this.prisma.adminRole.findMany({
      orderBy: { key: 'asc' },
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
      },
    });
    return {
      roles: roles.map((role) => ({
        key: role.key as AdminRoleKey,
        name: role.name,
        permissions: role.permissions.map(
          (row) =>
            row.permission.key as AdminRoleListItem['permissions'][number],
        ),
      })),
    };
  }

  async replaceRoles(
    actor: AdminPrincipal,
    userId: string,
    roles: AdminRoleKey[],
  ): Promise<AdminUserListItem> {
    if (actor.user.id === userId) {
      throw adminForbidden('You cannot change your own admin roles here.');
    }
    await this.prisma.$transaction(async (tx) => {
      await lockSuperAdminRole(tx);
      await lockUser(tx, userId);
      const catalog = await tx.adminRole.findMany({
        where: { key: { in: roles } },
        select: {
          id: true,
          key: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      });
      if (catalog.length !== roles.length) {
        throw adminInvalid('Use predefined admin roles only.');
      }
      for (const role of catalog) {
        for (const row of role.permissions) {
          if (!actor.permissions.has(row.permission.key)) {
            throw adminForbidden(
              'You cannot assign a role that exceeds your permissions.',
            );
          }
        }
      }
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: userSelect,
      });
      if (!target) throw adminInvalid('This user could not be found.');
      if (isDeletedAccount(target)) {
        throw adminInvalid('A deleted account cannot be made an admin.');
      }
      await this.assertKeepsSuperAdmin(tx, userId, roles);
      await tx.userAdminRole.deleteMany({ where: { userId } });
      await tx.userAdminRole.createMany({
        data: catalog.map((role) => ({ userId, roleId: role.id })),
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.adminRolesChanged,
          targetType: 'USER',
          targetId: userId,
          metadata: {
            before: target.adminRoles.map((row) => row.role.key),
            after: roles,
          },
        },
      });
    });
    return this.get(userId);
  }

  async disable(
    actor: AdminPrincipal,
    userId: string,
  ): Promise<{ disabled: true }> {
    if (actor.user.id === userId) {
      throw adminForbidden('You cannot disable your own admin access here.');
    }
    await this.prisma.$transaction(async (tx) => {
      await lockSuperAdminRole(tx);
      await lockUser(tx, userId);
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: userSelect,
      });
      if (!target || target.adminRoles.length === 0) {
        throw adminInvalid('This admin user could not be found.');
      }
      await this.assertKeepsSuperAdmin(tx, userId, []);
      const now = new Date();
      await tx.userAdminRole.deleteMany({ where: { userId } });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.adminDisabled,
          targetType: 'USER',
          targetId: userId,
          metadata: {
            revokedSession: true,
            previousRoles: target.adminRoles.map((row) => row.role.key),
          },
        },
      });
    });
    return { disabled: true };
  }

  async revokeSessions(
    actor: AdminPrincipal,
    userId: string,
  ): Promise<{ revokedCount: number }> {
    if (actor.user.id === userId) {
      throw adminForbidden(
        'Use account security settings to end your session.',
      );
    }
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, adminRoles: { select: { roleId: true } } },
    });
    if (!target || target.adminRoles.length === 0) {
      throw adminInvalid('This admin user could not be found.');
    }
    const revoked = await this.prisma.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.adminSessionsRevoked,
          targetType: 'USER',
          targetId: userId,
          metadata: { revokedCount: result.count },
        },
      });
      return result.count;
    });
    return { revokedCount: revoked };
  }

  private async assertKeepsSuperAdmin(
    tx: Prisma.TransactionClient,
    targetId: string,
    nextRoles: readonly string[],
  ): Promise<void> {
    const keeps = nextRoles.includes(ADMIN_ROLES.superAdmin);
    if (keeps) return;
    const remaining = await tx.userAdminRole.count({
      where: {
        role: { key: ADMIN_ROLES.superAdmin },
        userId: { not: targetId },
        user: { status: { not: 'DELETED' }, deletedAt: null },
      },
    });
    if (remaining === 0) {
      throw new ApiError(
        'ADMIN_ACTION_INVALID_STATE',
        'The last effective Super Admin cannot be removed.',
        HttpStatus.CONFLICT,
      );
    }
  }
}

const userSelect = {
  id: true,
  email: true,
  status: true,
  deletedAt: true,
  profile: { select: { displayName: true } },
  adminRoles: { select: { role: { select: { key: true } } } },
} as const;

function toAdminUser(user: {
  id: string;
  email: string;
  status: string;
  profile: { displayName: string } | null;
  adminRoles: Array<{ role: { key: string } }>;
}): AdminUserListItem {
  return {
    id: user.id,
    email: user.email,
    displayName: user.profile?.displayName ?? '',
    status: user.status,
    roles: user.adminRoles
      .map((row) => row.role.key)
      .filter((key): key is AdminRoleKey =>
        Object.values(ADMIN_ROLES).includes(key as AdminRoleKey),
      ),
  };
}

async function lockSuperAdminRole(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "AdminRole" WHERE key = ${ADMIN_ROLES.superAdmin} FOR UPDATE
  `;
}
