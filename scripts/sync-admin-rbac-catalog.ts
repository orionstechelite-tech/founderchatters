import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { syncAdminRbacCatalog } from '../apps/api/src/admin/admin-rbac.js';
import { PrismaClient } from '../generated/prisma/client.js';

const PRODUCTION_CONFIRM_VALUE = 'SYNC_ADMIN_RBAC_CATALOG';

function assertOperatorConfirmation(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const flagged = process.argv.includes('--confirm');
  const envConfirm = process.env.ADMIN_RBAC_SYNC_CONFIRM === PRODUCTION_CONFIRM_VALUE;
  if (!flagged && !envConfirm) {
    throw new Error(
      'Production catalog sync requires --confirm or ADMIN_RBAC_SYNC_CONFIRM=SYNC_ADMIN_RBAC_CATALOG.',
    );
  }
}

async function main(): Promise<void> {
  assertOperatorConfirmation();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const result = await syncAdminRbacCatalog(prisma);
    console.log('Admin RBAC catalog synced.');
    console.log(
      `Permissions created=${result.permissionsCreated} updated=${result.permissionsUpdated}`,
    );
    console.log(`Roles created=${result.rolesCreated} updated=${result.rolesUpdated}`);
    console.log(
      `Grants created=${result.grantsCreated} removed=${result.grantsRemoved}`,
    );
    console.log(`UserAdminRole assignments created=${result.userAdminRolesCreated}`);
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Catalog sync failed.';
  console.error(message);
  process.exitCode = 1;
}
