import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PasswordHasher } from '../src/auth/password-hasher.js';
import { AppConfig } from '../src/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { InMemoryNotificationEmailDelivery } from '../src/notifications/notification-email.service.js';
import { NotificationDeliveryService } from '../src/notifications/notification-delivery.service.js';
import { ensureNotificationTemplates } from '../src/notifications/notification-template-seed.js';
import { AccountDeletionService } from '../src/settings/account-deletion.service.js';
import { WorkerModule } from '../src/worker.module.js';

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

describe('notification delivery integration', { timeout: 90_000 }, () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  let deliveries: NotificationDeliveryService;
  let email: InMemoryNotificationEmailDelivery;
  let deletion: AccountDeletionService;

  const userIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });

    prisma = app.get(PrismaService);
    deliveries = app.get(NotificationDeliveryService);
    email = app.get(InMemoryNotificationEmailDelivery);
    deletion = new AccountDeletionService(
      prisma,
      new PasswordHasher(app.get(AppConfig)),
    );

    await ensureNotificationTemplates(prisma, true);
  }, 60_000);

  afterEach(() => {
    email.clear();
  });

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await prisma.notification.deleteMany({
          where: {
            userId: {
              in: userIds,
            },
          },
        });

        await prisma.user.deleteMany({
          where: {
            id: {
              in: userIds,
            },
          },
        });
      }
    } finally {
      await app.close();
    }
  });

  async function createUser(label: string): Promise<{
    id: string;
    email: string;
  }> {
    const user = await prisma.user.create({
      data: {
        email: `fc015-delivery-${label}-${Date.now()}-${userIds.length}@example.com`,
        passwordHash: '$argon2id$test-only',
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
      },
    });

    userIds.push(user.id);
    return user;
  }

  it('seeds the application notification template idempotently', async () => {
    await ensureNotificationTemplates(prisma, true);
    await ensureNotificationTemplates(prisma, true);

    const templates = await prisma.notificationTemplate.findMany({
      where: {
        key: 'application-status',
        version: 'v1',
      },
    });

    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      key: 'application-status',
      version: 'v1',
      subject: 'FounderChatters application update',
      body: '{{title}}\n\n{{body}}',
      isActive: true,
    });
  });

  it('enforces one delivery per notification, channel, and template version', async () => {
    const user = await createUser('delivery-unique');

    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'APPLICATION_APPROVED',
        title: 'Application approved',
        body: 'Your FounderChatters application has been approved.',
        href: '/application',
      },
    });

    const data = {
      notificationId: notification.id,
      channel: 'EMAIL' as const,
      templateVersion: 'v1',
    };

    await prisma.notificationDelivery.create({ data });

    await expect(
      prisma.notificationDelivery.create({ data }),
    ).rejects.toThrow();

    expect(
      await prisma.notificationDelivery.count({
        where: data,
      }),
    ).toBe(1);

    await prisma.notificationDelivery.deleteMany({
      where: {
        notificationId: notification.id,
      },
    });
  });

  it('allows the memory email adapter to be inspected and cleared', async () => {
    await email.send({
      to: 'memory@example.com',
      subject: 'Memory subject',
      body: 'Memory body',
    });

    expect(email.getMessages()).toEqual([
      {
        to: 'memory@example.com',
        subject: 'Memory subject',
        body: 'Memory body',
      },
    ]);

    email.clear();

    expect(email.getMessages()).toEqual([]);
  });

  it('sends a queued application email and marks the delivery sent', async () => {
    const user = await createUser('send');

    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'APPLICATION_APPROVED',
        title: 'Application approved',
        body: 'Your FounderChatters application has been approved.',
        href: '/application',
        deliveries: {
          create: {
            channel: 'EMAIL',
            templateVersion: 'v1',
          },
        },
      },
      include: {
        deliveries: true,
      },
    });

    expect(notification.deliveries).toHaveLength(1);

    const processed = await deliveries.processBatch();

    expect(processed).toBe(1);

    const stored = await prisma.notificationDelivery.findUniqueOrThrow({
      where: {
        id: notification.deliveries[0]!.id,
      },
    });

    expect(stored.status).toBe('SENT');
    expect(stored.attemptCount).toBe(1);
    expect(stored.sentAt).not.toBeNull();
    expect(stored.lastErrorCode).toBeNull();

    expect(email.getMessages()).toEqual([
      {
        to: user.email,
        subject: 'FounderChatters application update',
        body:
          'Application approved\n\n' +
          'Your FounderChatters application has been approved.',
      },
    ]);
  });

  it('retries failed delivery and stops after three total attempts', async () => {
    const user = await createUser('retry');

    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'APPLICATION_REJECTED',
        title: 'Application not approved',
        body: 'Your FounderChatters application was not approved.',
        href: '/application',
        deliveries: {
          create: {
            channel: 'EMAIL',
            templateVersion: 'missing-v1',
          },
        },
      },
      include: {
        deliveries: true,
      },
    });

    const deliveryId = notification.deliveries[0]!.id;
    const base = new Date();

    expect(await deliveries.processBatch(base)).toBe(1);

    let stored = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });

    expect(stored.status).toBe('RETRY_QUEUED');
    expect(stored.attemptCount).toBe(1);
    expect(stored.lastErrorCode).toBe('TEMPLATE_UNAVAILABLE');

    expect(
      await deliveries.processBatch(new Date(base.getTime() + 61_000)),
    ).toBe(1);

    stored = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });

    expect(stored.status).toBe('RETRY_QUEUED');
    expect(stored.attemptCount).toBe(2);
    expect(stored.lastErrorCode).toBe('TEMPLATE_UNAVAILABLE');

    expect(
      await deliveries.processBatch(new Date(base.getTime() + 361_000)),
    ).toBe(1);

    stored = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });

    expect(stored.status).toBe('FAILED');
    expect(stored.attemptCount).toBe(3);
    expect(stored.sentAt).toBeNull();
    expect(stored.lastErrorCode).toBe('TEMPLATE_UNAVAILABLE');

    expect(email.getMessages()).toEqual([]);
  });

  it('does not email a deleted account and marks the delivery ACCOUNT_DELETED', async () => {
    const user = await createUser('deleted');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        email: `deleted-${user.id}@deleted.invalid`,
      },
    });

    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'APPLICATION_APPROVED',
        title: 'Should not send',
        body: 'Deleted accounts do not receive mail.',
        deliveries: {
          create: {
            channel: 'EMAIL',
            templateVersion: 'v1',
          },
        },
      },
      include: { deliveries: true },
    });

    expect(await deliveries.processBatch()).toBe(1);
    const stored = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: notification.deliveries[0]!.id },
    });
    expect(stored.status).toBe('FAILED');
    expect(stored.lastErrorCode).toBe('ACCOUNT_DELETED');
    expect(email.getMessages()).toEqual([]);
  });

  it('does not start a provider send after account deletion has committed', async () => {
    const user = await createUser('delete-wins');
    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'APPLICATION_APPROVED',
        title: 'Should not send after delete',
        body: 'Deletion committed first.',
        deliveries: {
          create: {
            channel: 'EMAIL',
            templateVersion: 'v1',
          },
        },
      },
      include: { deliveries: true },
    });

    await deletion.deleteAccount(user.id, { confirmation: 'DELETE' });
    const afterDelete = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(afterDelete.status).toBe('DELETED');
    expect(afterDelete.email).not.toBe(user.email);

    expect(await deliveries.processBatch()).toBe(0);
    const stored = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: notification.deliveries[0]!.id },
    });
    expect(stored.status).toBe('FAILED');
    expect(stored.lastErrorCode).toBe('ACCOUNT_DELETED');
    expect(email.getMessages()).toEqual([]);
  });

  it('serializes deletion behind an in-flight provider send on the same user', async () => {
    const user = await createUser('send-owns-lock');
    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'APPLICATION_APPROVED',
        title: 'Send started first',
        body: 'Provider owns the send boundary.',
        deliveries: {
          create: {
            channel: 'EMAIL',
            templateVersion: 'v1',
          },
        },
      },
      include: { deliveries: true },
    });

    const gate = email.deferSend();
    const batch = deliveries.processBatch();
    const inFlight = await gate.started;
    expect(inFlight.to).toBe(user.email);

    const deleting = deletion.deleteAccount(user.id, {
      confirmation: 'DELETE',
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 3_000);
    });
    const mid = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(mid.status).toBe('ACTIVE');
    expect(mid.email).toBe(user.email);
    expect(email.getMessages()).toEqual([]);

    gate.release();
    await expect(batch).resolves.toBe(1);
    await deleting;

    const stored = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: notification.deliveries[0]!.id },
    });
    expect(stored.status).toBe('SENT');
    expect(email.getMessages()).toEqual([
      {
        to: user.email,
        subject: 'FounderChatters application update',
        body: 'Send started first\n\nProvider owns the send boundary.',
      },
    ]);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.status).toBe('DELETED');
    expect(after.email).not.toBe(user.email);
    expect(after.deletedAt).not.toBeNull();
  });
});
