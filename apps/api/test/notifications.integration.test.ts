import type { AddressInfo } from 'node:net';

import type {
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  MemberNotificationsResponse,
} from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { SessionService } from '../src/auth/session.service.js';
import { AppConfig } from '../src/config.js';
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

describe('notifications HTTP integration', { timeout: 90_000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessions: SessionService;
  let config: AppConfig;
  let baseUrl: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
    config = app.get(AppConfig);
  }, 60_000);

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await prisma.notification.deleteMany({
          where: { userId: { in: userIds } },
        });

        await prisma.founderProfile.deleteMany({
          where: { userId: { in: userIds } },
        });

        await prisma.founderApplication.deleteMany({
          where: { userId: { in: userIds } },
        });

        await prisma.session.deleteMany({
          where: { userId: { in: userIds } },
        });

        await prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    } finally {
      await app.close();
    }
  });

  async function createUser(
    label: string,
  ): Promise<{ id: string; cookie: string }> {
    const user = await prisma.user.create({
      data: {
        email: `fc015-${label}-${Date.now()}-${userIds.length}@example.com`,
        passwordHash: '$argon2id$test-only',
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
        onboardingCompletedAt: new Date('2026-03-15T00:00:00.000Z'),
        application: {
          create: {
            status: 'APPROVED',
            eligibilityRole: 'FOUNDER_COFOUNDER',
            companyName: `${label} Co`,
            roleTitle: 'Founder',
            city: 'Dubai',
            country: 'UAE',
            buildingSummary: 'Notification integration test.',
            submittedAt: new Date('2026-03-10T00:00:00.000Z'),
            decidedAt: new Date('2026-03-11T00:00:00.000Z'),
          },
        },
      },
    });

    userIds.push(user.id);

    await prisma.founderProfile.create({
      data: {
        userId: user.id,
        displayName: `Founder ${label}`,
        city: 'Dubai',
        country: 'UAE',
        company: {
          create: {
            name: `${label} Co`,
            city: 'Dubai',
            country: 'UAE',
          },
        },
      },
    });

    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-015 integration test',
    });

    return {
      id: user.id,
      cookie: `${config.sessionCookieName}=${session.rawToken}`,
    };
  }

  function request(
    path: string,
    cookie?: string,
    init: RequestInit = {},
    origin = 'http://localhost:3000',
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...init.headers,
      },
    });
  }

  async function json<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
  }

  it('requires authentication', async () => {
    const response = await request('/v1/notifications');
    expect(response.status).toBe(401);
  });

  it('lists only the caller notifications newest first with cursor pagination', async () => {
    const owner = await createUser('list-owner');
    const other = await createUser('list-other');

    const first = await prisma.notification.create({
      data: {
        userId: owner.id,
        type: 'REQUEST_ADVICE',
        title: 'First',
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
      },
    });

    const second = await prisma.notification.create({
      data: {
        userId: owner.id,
        type: 'PRIVATE_HELP_OFFER',
        title: 'Second',
        createdAt: new Date('2026-10-01T11:00:00.000Z'),
      },
    });

    const third = await prisma.notification.create({
      data: {
        userId: owner.id,
        type: 'INTRODUCTION_OFFERED',
        title: 'Third',
        createdAt: new Date('2026-10-01T12:00:00.000Z'),
      },
    });

    await prisma.notification.create({
      data: {
        userId: other.id,
        type: 'REQUEST_ADVICE',
        title: 'Private to other user',
        createdAt: new Date('2026-10-01T13:00:00.000Z'),
      },
    });

    const pageOneResponse = await request(
      '/v1/notifications?limit=2',
      owner.cookie,
    );

    expect(pageOneResponse.status).toBe(200);

    const pageOne = await json<MemberNotificationsResponse>(pageOneResponse);

    expect(pageOne.notifications.map((item) => item.id)).toEqual([
      third.id,
      second.id,
    ]);
    expect(pageOne.nextBefore).toBe(second.id);

    const pageTwoResponse = await request(
      `/v1/notifications?limit=2&before=${encodeURIComponent(second.id)}`,
      owner.cookie,
    );

    expect(pageTwoResponse.status).toBe(200);

    const pageTwo = await json<MemberNotificationsResponse>(pageTwoResponse);

    expect(pageTwo.notifications.map((item) => item.id)).toEqual([first.id]);
    expect(pageTwo.nextBefore).toBeNull();
  });

  it('rejects a cursor owned by another user', async () => {
    const owner = await createUser('cursor-owner');
    const other = await createUser('cursor-other');

    const foreignCursor = await prisma.notification.create({
      data: {
        userId: other.id,
        type: 'REQUEST_ADVICE',
        title: 'Foreign cursor',
      },
    });

    const response = await request(
      `/v1/notifications?before=${encodeURIComponent(foreignCursor.id)}`,
      owner.cookie,
    );

    expect(response.status).toBe(400);

    const body = (await response.json()) as {
      error: {
        code: string;
        fieldErrors: Record<string, string[]>;
      };
    };

    expect(body.error.code).toBe('NOTIFICATION_INVALID_INPUT');
    expect(body.error.fieldErrors.before).toEqual([
      'Choose a valid notification.',
    ]);
  });

  it('marks one notification read idempotently and hides foreign notifications', async () => {
    const owner = await createUser('read-owner');
    const other = await createUser('read-other');

    const notification = await prisma.notification.create({
      data: {
        userId: owner.id,
        type: 'REQUEST_MESSAGE',
        title: 'New message',
      },
    });

    const firstResponse = await request(
      `/v1/notifications/${notification.id}/read`,
      owner.cookie,
      { method: 'POST' },
    );

    expect(firstResponse.status).toBe(200);

    const first = await json<MarkNotificationReadResponse>(firstResponse);

    expect(first.notification.id).toBe(notification.id);
    expect(first.notification.readAt).not.toBeNull();

    const secondResponse = await request(
      `/v1/notifications/${notification.id}/read`,
      owner.cookie,
      { method: 'POST' },
    );

    expect(secondResponse.status).toBe(200);

    const second = await json<MarkNotificationReadResponse>(secondResponse);

    expect(second.notification.readAt).toBe(first.notification.readAt);

    const foreignResponse = await request(
      `/v1/notifications/${notification.id}/read`,
      other.cookie,
      { method: 'POST' },
    );

    expect(foreignResponse.status).toBe(404);
  });

  it('marks all caller notifications read without touching another user', async () => {
    const owner = await createUser('read-all-owner');
    const other = await createUser('read-all-other');

    await prisma.notification.createMany({
      data: [
        {
          userId: owner.id,
          type: 'REQUEST_ADVICE',
          title: 'Unread one',
        },
        {
          userId: owner.id,
          type: 'PRIVATE_HELP_OFFER',
          title: 'Unread two',
        },
        {
          userId: owner.id,
          type: 'INTRODUCTION_OFFERED',
          title: 'Already read',
          readAt: new Date('2026-10-01T09:00:00.000Z'),
        },
        {
          userId: other.id,
          type: 'REQUEST_MESSAGE',
          title: 'Other user unread',
        },
      ],
    });

    const response = await request('/v1/notifications/read-all', owner.cookie, {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    const body = await json<MarkAllNotificationsReadResponse>(response);

    expect(body.updatedCount).toBe(2);

    const ownerUnread = await prisma.notification.count({
      where: {
        userId: owner.id,
        readAt: null,
      },
    });

    const otherUnread = await prisma.notification.count({
      where: {
        userId: other.id,
        readAt: null,
      },
    });

    expect(ownerUnread).toBe(0);
    expect(otherUnread).toBe(1);

    const repeatedResponse = await request(
      '/v1/notifications/read-all',
      owner.cookie,
      { method: 'POST' },
    );

    expect(repeatedResponse.status).toBe(200);

    const repeated =
      await json<MarkAllNotificationsReadResponse>(repeatedResponse);

    expect(repeated.updatedCount).toBe(0);
  });
});
