import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  type AdminPermission,
} from '@founderchatters/contracts';

import {
  ensureAdminRbac,
  permissionsForRole,
  syncAdminRbacCatalog,
} from '../src/admin/admin-rbac.js';

const previousNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = previousNodeEnv;
});

describe('admin RBAC fixture helpers', () => {
  it('is not invoked from production API modules', () => {
    const adminDir = resolve(process.cwd(), 'src/admin');
    const root = resolve(process.cwd(), 'src');
    const rbac = readFileSync(resolve(adminDir, 'admin-rbac.ts'), 'utf8');
    const moduleSource = readFileSync(
      resolve(adminDir, 'application-review.module.ts'),
      'utf8',
    );
    const opsModule = readFileSync(
      resolve(adminDir, 'admin-ops.module.ts'),
      'utf8',
    );
    const appModule = readFileSync(resolve(root, 'app.module.ts'), 'utf8');
    const controller = readFileSync(
      resolve(adminDir, 'application-review.controller.ts'),
      'utf8',
    );
    const service = readFileSync(
      resolve(adminDir, 'application-review.service.ts'),
      'utf8',
    );
    const main = readFileSync(resolve(root, 'main.ts'), 'utf8');
    const worker = readFileSync(resolve(root, 'worker.ts'), 'utf8');
    expect(rbac).toContain("NODE_ENV === 'production'");
    expect(rbac).toContain('must not run in production');
    expect(rbac).toContain('export async function syncAdminRbacCatalog');
    expect(moduleSource).not.toContain('ensureAdminRbac');
    expect(moduleSource).not.toContain('syncAdminRbacCatalog');
    expect(opsModule).not.toContain('ensureAdminRbac');
    expect(opsModule).not.toContain('syncAdminRbacCatalog');
    expect(appModule).not.toContain('ensureAdminRbac');
    expect(appModule).not.toContain('syncAdminRbacCatalog');
    expect(controller).not.toContain('ensureAdminRbac');
    expect(service).not.toContain('ensureAdminRbac');
    expect(main).not.toContain('ensureAdminRbac');
    expect(main).not.toContain('syncAdminRbacCatalog');
    expect(worker).not.toContain('ensureAdminRbac');
    expect(worker).not.toContain('syncAdminRbacCatalog');
  });

  it('keeps ensureAdminRbac production-blocked and the catalog sync callable', async () => {
    process.env.NODE_ENV = 'production';
    await expect(ensureAdminRbac({} as never)).rejects.toThrow(
      'must not run in production',
    );
    expect(syncAdminRbacCatalog.length).toBe(1);
  });

  it('matches the frozen least-privilege role matrix', () => {
    const application: AdminPermission[] = [
      ADMIN_PERMISSIONS.applicationsRead,
      ADMIN_PERMISSIONS.applicationsNeedsInfo,
      ADMIN_PERMISSIONS.applicationsApprove,
      ADMIN_PERMISSIONS.applicationsReject,
    ];
    expect(permissionsForRole(ADMIN_ROLES.superAdmin)).toEqual(
      Object.values(ADMIN_PERMISSIONS),
    );
    expect(permissionsForRole(ADMIN_ROLES.applicationReviewer)).toEqual(
      application,
    );
    expect(permissionsForRole(ADMIN_ROLES.operations)).toEqual([
      ...application,
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
    ]);
    expect(permissionsForRole(ADMIN_ROLES.moderator)).toEqual([
      ADMIN_PERMISSIONS.reportsRead,
      ADMIN_PERMISSIONS.reportsModerate,
      ADMIN_PERMISSIONS.membersRead,
      ADMIN_PERMISSIONS.membersSuspend,
      ADMIN_PERMISSIONS.membersRestore,
    ]);
    expect(permissionsForRole(ADMIN_ROLES.support)).toEqual([
      ADMIN_PERMISSIONS.membersRead,
      ADMIN_PERMISSIONS.supportRead,
      ADMIN_PERMISSIONS.supportReply,
      ADMIN_PERMISSIONS.supportStatus,
    ]);
    expect(permissionsForRole(ADMIN_ROLES.analystReadonly)).toEqual([
      ADMIN_PERMISSIONS.overviewRead,
      ADMIN_PERMISSIONS.analyticsRead,
    ]);
  });

  it('does not special-case SUPER_ADMIN in authorization', () => {
    const auth = readFileSync(
      resolve(process.cwd(), 'src/admin/admin-auth.service.ts'),
      'utf8',
    );
    expect(auth).not.toContain('SUPER_ADMIN');
    expect(auth).not.toContain('admin.*');
  });

  it('keeps the operator command explicit and secret-safe', () => {
    const script = readFileSync(
      resolve(process.cwd(), '../../scripts/sync-admin-rbac-catalog.ts'),
      'utf8',
    );
    const rootPackage = readFileSync(
      resolve(process.cwd(), '../../package.json'),
      'utf8',
    );
    expect(rootPackage).toContain('"admin:rbac:sync"');
    expect(script).toContain('syncAdminRbacCatalog');
    expect(script).not.toContain('assignAdminRole');
    expect(script).not.toContain('prisma.userAdminRole');
    expect(script).not.toContain('console.log(process.env.DATABASE_URL');
    expect(script).toContain('--confirm');
    expect(script).toContain('ADMIN_RBAC_SYNC_CONFIRM');
    expect(script).toContain('$disconnect');
    expect(script).toContain('UserAdminRole assignments created=');
  });
});
