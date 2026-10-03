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
  'admin.members.suspend': 'Suspend a member',
  'admin.overview.read': 'Read the admin command-center metrics',
  'admin.members.read': 'Read member list and Founder 360 metadata',
  'admin.members.restore': 'Restore a suspended member',
  'admin.requests.read': 'Read request operational queue and detail',
  'admin.support.read': 'Read support cases',
  'admin.support.reply': 'Reply to a support case',
  'admin.support.status': 'Change support case status',
  'admin.reputation.read': 'Read contribution history',
  'admin.notifications.read': 'Read notification deliveries and templates',
  'admin.notifications.retry': 'Manually re-queue a notification delivery',
  'admin.taxonomy.read': 'Read taxonomy topics',
  'admin.taxonomy.manage': 'Create, edit, or merge taxonomy topics',
  'admin.analytics.read': 'Read operational analytics',
  'admin.admins.read': 'Read admin users and assignments',
  'admin.admins.manage':
    'Change admin roles, disable admin access, revoke sessions',
  'admin.roles.read': 'Read predefined admin roles',
  'admin.audit.read': 'Read immutable audit entries',
  'admin.settings.read': 'Read inspectable platform configuration',
  'admin.system.read': 'Read system health facts',
  'admin.jobs.read': 'Read failed job records',
  'admin.jobs.retry': 'Retry a supported failed job',
  'admin.search.read': 'Search permitted operational entities',
};

const APPLICATION_PERMISSIONS: AdminPermission[] = [
  ADMIN_PERMISSIONS.applicationsRead,
  ADMIN_PERMISSIONS.applicationsNeedsInfo,
  ADMIN_PERMISSIONS.applicationsApprove,
  ADMIN_PERMISSIONS.applicationsReject,
];

const OPERATIONS_PERMISSIONS: AdminPermission[] = [
  ...APPLICATION_PERMISSIONS,
  ADMIN_PERMISSIONS.overviewRead,
  ADMIN_PERMISSIONS.membersRead,
  ADMIN_PERMISSIONS.requestsRead,
  ADMIN_PERMISSIONS.supportRead,
  ADMIN_PERMISSIONS.supportReply,
  ADMIN_PERMISSIONS.supportStatus,
  ADMIN_PERMISSIONS.reputationRead,
  ADMIN_PERMISSIONS.notificationsRead,
  ADMIN_PERMISSIONS.notificationsRetry,
  ADMIN_PERMISSIONS.taxonomyRead,
  ADMIN_PERMISSIONS.taxonomyManage,
  ADMIN_PERMISSIONS.analyticsRead,
  ADMIN_PERMISSIONS.searchRead,
];

const MODERATOR_PERMISSIONS: AdminPermission[] = [
  ADMIN_PERMISSIONS.reportsRead,
  ADMIN_PERMISSIONS.reportsModerate,
  ADMIN_PERMISSIONS.membersRead,
  ADMIN_PERMISSIONS.membersSuspend,
  ADMIN_PERMISSIONS.membersRestore,
];

const SUPPORT_PERMISSIONS: AdminPermission[] = [
  ADMIN_PERMISSIONS.membersRead,
  ADMIN_PERMISSIONS.supportRead,
  ADMIN_PERMISSIONS.supportReply,
  ADMIN_PERMISSIONS.supportStatus,
];

const ANALYST_PERMISSIONS: AdminPermission[] = [
  ADMIN_PERMISSIONS.overviewRead,
  ADMIN_PERMISSIONS.analyticsRead,
];

export function permissionsForRole(roleKey: string): AdminPermission[] {
  if (roleKey === ADMIN_ROLES.superAdmin) {
    return Object.values(ADMIN_PERMISSIONS);
  }
  if (roleKey === ADMIN_ROLES.applicationReviewer) {
    return APPLICATION_PERMISSIONS;
  }
  if (roleKey === ADMIN_ROLES.operations) {
    return OPERATIONS_PERMISSIONS;
  }
  if (roleKey === ADMIN_ROLES.moderator) {
    return MODERATOR_PERMISSIONS;
  }
  if (roleKey === ADMIN_ROLES.support) {
    return SUPPORT_PERMISSIONS;
  }
  if (roleKey === ADMIN_ROLES.analystReadonly) {
    return ANALYST_PERMISSIONS;
  }
  return [];
}

export function permissionsGrantedByRoles(
  roleKeys: readonly string[],
): Set<AdminPermission> {
  const granted = new Set<AdminPermission>();
  for (const key of roleKeys) {
    for (const permission of permissionsForRole(key)) {
      granted.add(permission);
    }
  }
  return granted;
}

export type AdminRbacCatalogSyncResult = {
  permissionsCreated: number;
  permissionsUpdated: number;
  rolesCreated: number;
  rolesUpdated: number;
  grantsCreated: number;
  grantsRemoved: number;
  userAdminRolesCreated: 0;
};

/**
 * Production-safe, idempotent predefined admin RBAC catalog sync.
 *
 * Upserts Permission, AdminRole, and RolePermission rows for the frozen
 * FC-019 catalog. Does not assign UserAdminRole, create a first admin,
 * or change member accounts.
 *
 * Must not be invoked from AppModule, HTTP handlers, or process startup.
 * Operators run `npm run admin:rbac:sync`.
 */
export async function syncAdminRbacCatalog(
  prisma: Pick<PrismaService, 'permission' | 'adminRole' | 'rolePermission'>,
): Promise<AdminRbacCatalogSyncResult> {
  const result: AdminRbacCatalogSyncResult = {
    permissionsCreated: 0,
    permissionsUpdated: 0,
    rolesCreated: 0,
    rolesUpdated: 0,
    grantsCreated: 0,
    grantsRemoved: 0,
    userAdminRolesCreated: 0,
  };

  const permissions = [];
  for (const key of Object.values(ADMIN_PERMISSIONS)) {
    const existing = await prisma.permission.findUnique({ where: { key } });
    const row = await prisma.permission.upsert({
      where: { key },
      update: { description: PERMISSION_DESCRIPTIONS[key] },
      create: { key, description: PERMISSION_DESCRIPTIONS[key] },
    });
    if (existing) result.permissionsUpdated += 1;
    else result.permissionsCreated += 1;
    permissions.push(row);
  }

  const roles = [];
  for (const key of Object.values(ADMIN_ROLES)) {
    const existing = await prisma.adminRole.findUnique({ where: { key } });
    const row = await prisma.adminRole.upsert({
      where: { key },
      update: { name: ROLE_NAMES[key] },
      create: { key, name: ROLE_NAMES[key] },
    });
    if (existing) result.rolesUpdated += 1;
    else result.rolesCreated += 1;
    roles.push(row);
  }

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
        result.grantsCreated += 1;
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
        result.grantsRemoved += 1;
      }
    }
  }

  return result;
}

/**
 * Test/local fictional RBAC catalog helper.
 *
 * Delegates to syncAdminRbacCatalog after a production block so ordinary
 * tests cannot accidentally treat this wrapper as a production operator
 * path. Production request handlers must only READ existing AdminRole,
 * Permission, RolePermission, and UserAdminRole rows.
 */
export async function ensureAdminRbac(
  prisma: Pick<PrismaService, 'permission' | 'adminRole' | 'rolePermission'>,
): Promise<void> {
  assertFixtureOnly('ensureAdminRbac');
  await syncAdminRbacCatalog(prisma);
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
