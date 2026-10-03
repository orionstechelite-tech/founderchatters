import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  type AdminPermission,
  type AdminRoleKey,
} from '@founderchatters/contracts';

import type { PrismaService } from '../database/prisma.service.js';

export const ADMIN_REVIEW_ROLE_KEYS = [
  ADMIN_ROLES.superAdmin,
  ADMIN_ROLES.applicationReviewer,
  ADMIN_ROLES.operations,
] as const;

export const ADMIN_NON_REVIEW_ROLE_KEYS = [
  ADMIN_ROLES.moderator,
  ADMIN_ROLES.support,
  ADMIN_ROLES.analystReadonly,
] as const;

const ROLE_NAMES: Record<AdminRoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  APPLICATION_REVIEWER: 'Application Reviewer',
  OPERATIONS: 'Operations',
  MODERATOR: 'Moderator',
  SUPPORT: 'Support',
  ANALYST_READONLY: 'Analyst (read only)',
};

const PERMISSION_DESCRIPTIONS: Record<AdminPermission, string> = {
  'admin.applications.read': 'Read founder application review queue and detail',
  'admin.applications.needs_info':
    'Return a submitted application for more information',
  'admin.applications.approve': 'Approve a submitted founder application',
  'admin.applications.reject': 'Reject a submitted founder application',
  'admin.reports.read':
    'Read the member report queue and report-scoped evidence',
  'admin.reports.moderate': 'Review, dismiss, or enforce member reports',
  'admin.members.suspend': 'Suspend a member as report enforcement',
};

const APPLICATION_PERMISSIONS: AdminPermission[] = [
  ADMIN_PERMISSIONS.applicationsRead,
  ADMIN_PERMISSIONS.applicationsNeedsInfo,
  ADMIN_PERMISSIONS.applicationsApprove,
  ADMIN_PERMISSIONS.applicationsReject,
];

const SAFETY_PERMISSIONS: AdminPermission[] = [
  ADMIN_PERMISSIONS.reportsRead,
  ADMIN_PERMISSIONS.reportsModerate,
  ADMIN_PERMISSIONS.membersSuspend,
];

function permissionsForRole(roleKey: string): AdminPermission[] {
  if (roleKey === ADMIN_ROLES.superAdmin) {
    return Object.values(ADMIN_PERMISSIONS);
  }
  if (
    roleKey === ADMIN_ROLES.applicationReviewer ||
    roleKey === ADMIN_ROLES.operations
  ) {
    return APPLICATION_PERMISSIONS;
  }
  if (roleKey === ADMIN_ROLES.moderator) {
    return SAFETY_PERMISSIONS;
  }
  return [];
}

/**
 * Test/local fictional RBAC catalog helper.
 *
 * Production request handlers must only READ existing AdminRole,
 * Permission, RolePermission, and UserAdminRole rows. FC-019 will
 * provision real admin-user assignments. Do not call this from app
 * startup or ordinary API handlers.
 */
export async function ensureAdminRbac(
  prisma: Pick<PrismaService, 'permission' | 'adminRole' | 'rolePermission'>,
): Promise<void> {
  assertFixtureOnly('ensureAdminRbac');
  const permissions = await Promise.all(
    Object.values(ADMIN_PERMISSIONS).map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: { description: PERMISSION_DESCRIPTIONS[key] },
        create: { key, description: PERMISSION_DESCRIPTIONS[key] },
      }),
    ),
  );
  const roles = await Promise.all(
    Object.values(ADMIN_ROLES).map((key) =>
      prisma.adminRole.upsert({
        where: { key },
        update: { name: ROLE_NAMES[key] },
        create: { key, name: ROLE_NAMES[key] },
      }),
    ),
  );

  for (const role of roles) {
    const granted = new Set(permissionsForRole(role.key));
    for (const permission of permissions) {
      const existing = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
      });
      const shouldGrant = granted.has(permission.key as AdminPermission);
      if (shouldGrant && !existing) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
      }
      if (!shouldGrant && existing) {
        await prisma.rolePermission.delete({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
        });
      }
    }
  }
}

export async function assignAdminRole(
  prisma: Pick<PrismaService, 'adminRole' | 'userAdminRole'>,
  userId: string,
  roleKey: AdminRoleKey,
): Promise<void> {
  assertFixtureOnly('assignAdminRole');
  const role = await prisma.adminRole.findUniqueOrThrow({
    where: { key: roleKey },
  });
  await prisma.userAdminRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
}

export async function grantAdminPermission(
  prisma: Pick<PrismaService, 'adminRole' | 'permission' | 'rolePermission'>,
  roleKey: AdminRoleKey,
  permissionKey: AdminPermission,
): Promise<void> {
  assertFixtureOnly('grantAdminPermission');
  const role = await prisma.adminRole.findUniqueOrThrow({
    where: { key: roleKey },
  });
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { key: permissionKey },
  });
  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: { roleId: role.id, permissionId: permission.id },
    },
    update: {},
    create: { roleId: role.id, permissionId: permission.id },
  });
}

export async function revokeAdminPermission(
  prisma: Pick<PrismaService, 'adminRole' | 'permission' | 'rolePermission'>,
  roleKey: AdminRoleKey,
  permissionKey: AdminPermission,
): Promise<void> {
  assertFixtureOnly('revokeAdminPermission');
  const role = await prisma.adminRole.findUniqueOrThrow({
    where: { key: roleKey },
  });
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { key: permissionKey },
  });
  await prisma.rolePermission.deleteMany({
    where: { roleId: role.id, permissionId: permission.id },
  });
}

function assertFixtureOnly(helper: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${helper} is a test/local RBAC fixture helper and must not run in production.`,
    );
  }
}
