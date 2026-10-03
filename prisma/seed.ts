import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';
import { ensureOnboardingTaxonomy } from '../apps/api/src/onboarding/taxonomy-seed.js';
import { ensureNotificationTemplates } from '../apps/api/src/notifications/notification-template-seed.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

await ensureOnboardingTaxonomy(prisma, true);
await ensureNotificationTemplates(prisma, true);
await prisma.$disconnect();
