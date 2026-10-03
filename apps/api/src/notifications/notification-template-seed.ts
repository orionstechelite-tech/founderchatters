import type { PrismaService } from '../database/prisma.service.js';

let seeded = false;

/**
 * Explicit local/dev/test notification-template seed.
 * Call from `prisma/seed.ts` or tests only.
 * HTTP handlers and AppModule must never invoke this.
 */
export async function ensureNotificationTemplates(
  prisma: Pick<PrismaService, 'notificationTemplate'>,
  force = false,
): Promise<void> {
  if (seeded && !force) {
    return;
  }

  await prisma.notificationTemplate.upsert({
    where: {
      key_version: {
        key: 'application-status',
        version: 'v1',
      },
    },
    update: {
      subject: 'FounderChatters application update',
      body: '{{title}}\n\n{{body}}',
      isActive: true,
    },
    create: {
      key: 'application-status',
      version: 'v1',
      subject: 'FounderChatters application update',
      body: '{{title}}\n\n{{body}}',
      isActive: true,
    },
  });

  seeded = true;
}
