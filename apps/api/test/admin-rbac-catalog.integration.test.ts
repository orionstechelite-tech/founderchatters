import { ADMIN_PERMISSIONS, ADMIN_ROLES } from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  permissionsForRole,
  syncAdminRbacCatalog,
} from '../src/admin/admin-rbac.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://founderchatters:founderchatters@localhost:5432/founderchatters';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.SESSION_SECRET = 'integration-session-secret';
process.env.PASSWORD_PEPPER = 'integration-password-pepper';
process.env.AUTH_TOKEN_SECRET = 'integration-auth-token-secret';
process.env.EMAIL_PROVIDER = 'memory';
process.env.WEB_URL = 'http://localhost:3000';

describe('admin RBAC catalog sync', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function grantsFor(roleKey: string): Promise<string[]> {
    const role = await prisma.adminRole.findUniqueOrThrow({
      where: { key: roleKey },
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
      },
    });
    return role.permissions.map((row) => row.permission.key).sort();
  }

  it('creates the known catalog, is idempotent, and repairs grants without UserAdminRole writes', async () => {
    const search = ADMIN_PERMISSIONS.searchRead;
    const existingSearch = await prisma.permission.findUnique({
      where: { key: search },
    });
    if (existingSearch) {
      await prisma.rolePermission.deleteMany({
        where: { permissionId: existingSearch.id },
      });
      await prisma.permission.delete({ where: { id: existingSearch.id } });
    }

    const assignmentsBefore = await prisma.userAdminRole.count();
    const first = await syncAdminRbacCatalog(prisma);
    expect(first.userAdminRolesCreated).toBe(0);
    expect(first.permissionsCreated + first.permissionsUpdated).toBe(
      Object.values(ADMIN_PERMISSIONS).length,
    );
    expect(first.rolesCreated + first.rolesUpdated).toBe(
      Object.values(ADMIN_ROLES).length,
    );
    expect(first.permissionsCreated).toBeGreaterThanOrEqual(1);
    expect(first.grantsCreated).toBeGreaterThanOrEqual(1);

    const permissions = await prisma.permission.findMany({
      where: { key: { in: Object.values(ADMIN_PERMISSIONS) } },
    });
    expect(permissions).toHaveLength(Object.values(ADMIN_PERMISSIONS).length);
    const roles = await prisma.adminRole.findMany({
      where: { key: { in: Object.values(ADMIN_ROLES) } },
    });
    expect(roles).toHaveLength(Object.values(ADMIN_ROLES).length);

    for (const key of Object.values(ADMIN_ROLES)) {
      expect(await grantsFor(key)).toEqual([...permissionsForRole(key)].sort());
    }

    const second = await syncAdminRbacCatalog(prisma);
    expect(second.permissionsCreated).toBe(0);
    expect(second.rolesCreated).toBe(0);
    expect(second.grantsCreated).toBe(0);
    expect(second.grantsRemoved).toBe(0);
    expect(second.userAdminRolesCreated).toBe(0);

    const operations = await prisma.adminRole.findUniqueOrThrow({
      where: { key: ADMIN_ROLES.operations },
    });
    const searchPermission = await prisma.permission.findUniqueOrThrow({
      where: { key: search },
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: operations.id,
          permissionId: searchPermission.id,
        },
      },
    });
    const repaired = await syncAdminRbacCatalog(prisma);
    expect(repaired.grantsCreated).toBe(1);
    expect(await grantsFor(ADMIN_ROLES.operations)).toContain(search);

    const audit = await prisma.permission.findUniqueOrThrow({
      where: { key: ADMIN_PERMISSIONS.auditRead },
    });
    await prisma.rolePermission.create({
      data: { roleId: operations.id, permissionId: audit.id },
    });
    const cleaned = await syncAdminRbacCatalog(prisma);
    expect(cleaned.grantsRemoved).toBe(1);
    expect(await grantsFor(ADMIN_ROLES.operations)).not.toContain(
      ADMIN_PERMISSIONS.auditRead,
    );

    expect(await prisma.userAdminRole.count()).toBe(assignmentsBefore);

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const productionSafe = await syncAdminRbacCatalog(prisma);
      expect(productionSafe.userAdminRolesCreated).toBe(0);
      expect(productionSafe.grantsCreated).toBe(0);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
