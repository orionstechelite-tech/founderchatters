import type { AddressInfo } from 'node:net';

import {
  ACCOUNT_DELETION_AUDIT_ACTIONS,
  type BlockedFoundersResponse,
  type DiscoverFoundersResponse,
  type MemberConversationResponse,
  type MemberRequestResponse,
} from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assignAdminRole, ensureAdminRbac } from '../src/admin/admin-rbac.js';
import { AppModule } from '../src/app.module.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { SessionService } from '../src/auth/session.service.js';
import { AppConfig } from '../src/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTrustProxy } from '../src/http/trust-proxy.js';
import {
  isTombstoneEmail,
  newTombstoneEmail,
} from '../src/identity/deleted-founder.js';

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

describe('FC-018 account deletion HTTP integration', () => {
  let app: INestApplication;
  let expressApplication: Express;
  let prisma: PrismaService;
  let sessions: SessionService;
  let passwords: PasswordHasher;
  let config: AppConfig;
  let baseUrl: string;
  const createdUserIds: string[] = [];

  const request = (
    path: string,
    cookie?: string,
    init: RequestInit = {},
    origin = 'http://localhost:3000',
  ) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...init.headers,
      },
    });

  async function member(suffix: string, displayName = `Delete ${suffix}`) {
    const password = 'correct horse battery';
    const passwordHash = await passwords.hash(password);
    const email = `fc018-${suffix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
        application: {
          create: {
            status: 'APPROVED',
            companyName: `${displayName} Co`,
            roleTitle: 'Founder',
            city: 'Lisbon',
            country: 'Portugal',
            buildingSummary: 'Building a private founder tool.',
          },
        },
        profile: {
          create: {
            displayName,
            headline: 'Visible founder headline',
            bio: 'Identifying biography that must not survive deletion.',
            city: 'Lisbon',
            country: 'Portugal',
            customExpertise: 'Secret expertise copy',
            currentNeedText: 'Secret current need',
            company: {
              create: {
                name: `${displayName} Co`,
                website: 'https://example.invalid',
                description: 'Identifying company copy',
                stage: 'Seed',
                industry: 'Marketplace',
                city: 'Lisbon',
                country: 'Portugal',
              },
            },
          },
        },
      },
    });
    createdUserIds.push(user.id);
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: `FC-018 ${suffix}`,
    });
    return {
      id: user.id,
      email,
      password,
      cookie: `${config.sessionCookieName}=${session.rawToken}`,
      rawToken: session.rawToken,
    };
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    expressApplication = app.getHttpAdapter().getInstance() as Express;
    config = app.get(AppConfig);
    configureTrustProxy(expressApplication, config);
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
    passwords = app.get(PasswordHasher);
    await ensureAdminRbac(prisma);
  }, 30_000);

  afterAll(async () => {
    try {
      if (createdUserIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { actorUserId: { in: createdUserIds } },
        });
        await prisma.moderationAction.deleteMany({
          where: { actorUserId: { in: createdUserIds } },
        });
        await prisma.report.deleteMany({
          where: { reporterId: { in: createdUserIds } },
        });
        await prisma.block.deleteMany({
          where: {
            OR: [
              { blockerId: { in: createdUserIds } },
              { blockedId: { in: createdUserIds } },
            ],
          },
        });
        await prisma.notification.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.message.deleteMany({
          where: { senderId: { in: createdUserIds } },
        });
        await prisma.conversationParticipant.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.conversation.deleteMany({
          where: { request: { authorId: { in: createdUserIds } } },
        });
        await prisma.requestResponse.deleteMany({
          where: { authorId: { in: createdUserIds } },
        });
        await prisma.request.deleteMany({
          where: { authorId: { in: createdUserIds } },
        });
        await prisma.savedFounder.deleteMany({
          where: {
            OR: [
              { saverId: { in: createdUserIds } },
              { savedFounderId: { in: createdUserIds } },
            ],
          },
        });
        await prisma.userAdminRole.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.session.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } finally {
      await app.close();
    }
  }, 30_000);

  it('rejects unsafe confirmation without mutating the account', async () => {
    const user = await member('reject');
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    expect(
      (
        await request('/v1/me/account/delete', undefined, {
          method: 'POST',
          body: JSON.stringify({ confirmation: 'DELETE' }),
        })
      ).status,
    ).toBe(401);
    const noOrigin = await request(
      '/v1/me/account/delete',
      user.cookie,
      { method: 'POST', body: JSON.stringify({ confirmation: 'DELETE' }) },
      '',
    );
    expect(noOrigin.status).toBe(403);

    for (const body of [
      {},
      { confirmation: 'delete' },
      { confirmation: 'PLEASE_DELETE' },
      { confirmation: 'DELETE', extra: true },
    ]) {
      const denied = await request('/v1/me/account/delete', user.cookie, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      expect(denied.status).toBe(400);
      await expect(denied.json()).resolves.toMatchObject({
        error: { code: 'ACCOUNT_DELETION_CONFIRMATION_REQUIRED' },
      });
    }

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.status).toBe('ACTIVE');
    expect(after.email).toBe(user.email);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.deletedAt).toBeNull();
  }, 30_000);

  it('anonymizes identity, revokes access, and keeps integrity records', async () => {
    const victim = await member('victim', 'Ada Visible');
    const viewer = await member('viewer', 'Omar Viewer');
    const second = await sessions.create(victim.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-018 second',
    });
    await assignAdminRole(prisma, victim.id, 'MODERATOR');
    await prisma.passwordResetToken.create({
      data: {
        userId: victim.id,
        tokenHash: `fc018-reset-${victim.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.emailVerificationToken.create({
      data: {
        userId: victim.id,
        tokenHash: `fc018-verify-${victim.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const requestRow = await prisma.request.create({
      data: {
        authorId: victim.id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: 'Need hiring help that must remain',
        context: 'Historical request context stays.',
        urgency: 'THIS_WEEK',
        publishedAt: new Date(),
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        requestId: requestRow.id,
        status: 'ACTIVE',
        participants: {
          create: [{ userId: victim.id }, { userId: viewer.id }],
        },
        messages: {
          create: {
            senderId: victim.id,
            body: 'SECRET_PRIVATE_MESSAGE_BODY',
            clientMessageId: '11111111-1111-4111-8111-111111111118',
          },
        },
      },
    });
    await prisma.savedFounder.create({
      data: { saverId: viewer.id, savedFounderId: victim.id },
    });
    await prisma.block.create({
      data: { blockerId: viewer.id, blockedId: victim.id },
    });
    await prisma.report.create({
      data: {
        reporterId: viewer.id,
        targetType: 'USER',
        targetId: victim.id,
        reasonCode: 'OTHER',
      },
    });
    const notification = await prisma.notification.create({
      data: {
        userId: victim.id,
        type: 'APPLICATION_APPROVED',
        title: 'Approved',
        href: `/founders/${victim.id}`,
        deliveries: {
          create: { channel: 'EMAIL', templateVersion: 'v1' },
        },
      },
      include: { deliveries: true },
    });

    const deleted = await request('/v1/me/account/delete', victim.cookie, {
      method: 'POST',
      body: JSON.stringify({ confirmation: ' DELETE ' }),
    });
    expect(deleted.status).toBe(204);
    expect(deleted.headers.get('set-cookie') ?? '').toMatch(/Max-Age=0/i);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: victim.id },
      include: {
        profile: { include: { company: true, expertise: true, needs: true } },
        application: true,
        adminRoles: true,
        sessions: true,
        passwordResetTokens: true,
        emailVerificationTokens: true,
      },
    });
    expect(stored.status).toBe('DELETED');
    expect(stored.deletedAt).not.toBeNull();
    expect(isTombstoneEmail(stored.email)).toBe(true);
    expect(stored.email).toMatch(/^deleted-[a-f0-9]{32}@deleted\.invalid$/);
    expect(stored.email).not.toBe(victim.email);
    expect(stored.email).not.toContain(victim.email);
    expect(stored.email).not.toBe(`deleted-${victim.id}@deleted.invalid`);
    expect(JSON.stringify(stored)).not.toContain(victim.email);
    expect(stored.passwordHash).not.toBe('');
    expect(await passwords.verify(stored.passwordHash, victim.password)).toBe(
      false,
    );
    expect(stored.profile?.displayName).toBe('Deleted founder');
    expect(stored.profile?.headline).toBeNull();
    expect(stored.profile?.bio).toBeNull();
    expect(stored.profile?.city).toBeNull();
    expect(stored.profile?.company?.name).toBe('Deleted account');
    expect(stored.profile?.company?.website).toBeNull();
    expect(stored.profile?.expertise).toEqual([]);
    expect(stored.application?.companyName).toBeNull();
    expect(stored.application?.status).toBe('APPROVED');
    expect(stored.adminRoles).toEqual([]);
    expect(stored.sessions.every((row) => row.revokedAt)).toBe(true);
    expect(stored.passwordResetTokens.every((row) => row.usedAt !== null)).toBe(
      true,
    );
    expect(
      stored.emailVerificationTokens.every((row) => row.usedAt !== null),
    ).toBe(true);

    const signin = await request('/v1/auth/signin', undefined, {
      method: 'POST',
      body: JSON.stringify({ email: victim.email, password: victim.password }),
    });
    expect(signin.status).toBe(401);
    const currentSession = await request('/v1/auth/session', victim.cookie);
    expect(currentSession.status).toBe(401);
    const otherSession = await request(
      '/v1/auth/session',
      `${config.sessionCookieName}=${second.rawToken}`,
    );
    expect(otherSession.status).toBe(401);

    const profile = await request(`/v1/founders/${victim.id}`, viewer.cookie);
    expect(profile.status).toBe(404);
    const discover = await request(
      '/v1/founders?q=Ada%20Visible',
      viewer.cookie,
    );
    const discoverBody = (await discover.json()) as DiscoverFoundersResponse;
    expect(discoverBody.founders).toEqual([]);
    expect(JSON.stringify(discoverBody.founders)).not.toContain(victim.email);

    const remaining = await request(
      `/v1/requests/${requestRow.id}`,
      viewer.cookie,
    );
    expect(remaining.status).toBe(200);
    const requestBody = (await remaining.json()) as MemberRequestResponse;
    expect(requestBody.request.headline).toBe(
      'Need hiring help that must remain',
    );
    expect(requestBody.request.author).toMatchObject({
      id: victim.id,
      displayName: 'Deleted founder',
      companyName: 'Deleted account',
      avatarUrl: null,
    });
    expect(JSON.stringify(requestBody)).not.toContain('Ada Visible');
    expect(JSON.stringify(requestBody)).not.toContain(victim.email);

    const thread = await request(
      `/v1/conversations/${conversation.id}`,
      viewer.cookie,
    );
    expect(thread.status).toBe(200);
    const threadBody = (await thread.json()) as MemberConversationResponse;
    expect(threadBody.conversation.counterpart).toMatchObject({
      id: victim.id,
      displayName: 'Deleted founder',
      companyName: 'Deleted account',
      avatarUrl: null,
    });
    expect(threadBody.conversation.canSend).toBe(false);
    expect(JSON.stringify(threadBody)).not.toContain('Ada Visible');
    expect(JSON.stringify(threadBody)).not.toContain(victim.email);

    const forgot = await request('/v1/auth/forgot-password', undefined, {
      method: 'POST',
      body: JSON.stringify({ email: victim.email }),
    });
    expect(forgot.status).toBe(202);
    expect(
      await prisma.passwordResetToken.count({
        where: { userId: victim.id, usedAt: null },
      }),
    ).toBe(0);

    expect(await prisma.request.count({ where: { id: requestRow.id } })).toBe(
      1,
    );
    expect(
      await prisma.conversation.count({ where: { id: conversation.id } }),
    ).toBe(1);
    expect(
      await prisma.message.count({
        where: { conversationId: conversation.id },
      }),
    ).toBe(1);
    expect(
      await prisma.savedFounder.count({
        where: { saverId: viewer.id, savedFounderId: victim.id },
      }),
    ).toBe(0);
    const blocks = await request('/v1/me/blocks', viewer.cookie);
    const listed = (await blocks.json()) as BlockedFoundersResponse;
    expect(listed.founders.map((row) => row.id)).not.toContain(victim.id);
    expect(
      await prisma.block.count({
        where: { blockerId: viewer.id, blockedId: victim.id },
      }),
    ).toBe(1);

    const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: notification.deliveries[0]!.id },
    });
    expect(delivery.status).toBe('FAILED');
    expect(delivery.lastErrorCode).toBe('ACCOUNT_DELETED');
    const note = await prisma.notification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(note.href).toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: ACCOUNT_DELETION_AUDIT_ACTIONS.deleted,
        actorUserId: victim.id,
        targetId: victim.id,
      },
    });
    expect(JSON.stringify(audit)).not.toContain(victim.email);
    expect(JSON.stringify(audit)).not.toContain('Ada Visible');
    expect(JSON.stringify(audit)).not.toContain('SECRET_PRIVATE_MESSAGE_BODY');
    expect(JSON.stringify(audit)).not.toMatch(
      /passwordHash|tokenHash|rawToken/,
    );
    expect(JSON.stringify(audit)).not.toContain(stored.email);
  }, 30_000);

  it('uses a collision-resistant tombstone even if deleted-<userId>@deleted.invalid is taken', async () => {
    expect(newTombstoneEmail()).not.toBe(newTombstoneEmail());

    const victim = await member('squat');
    const deterministic = `deleted-${victim.id}@deleted.invalid`;
    const squatter = await prisma.user.create({
      data: {
        email: deterministic,
        passwordHash: await passwords.hash('unused squatter password'),
      },
    });
    createdUserIds.push(squatter.id);

    const deleted = await request('/v1/me/account/delete', victim.cookie, {
      method: 'POST',
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    expect(deleted.status).toBe(204);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: victim.id },
    });
    const occupant = await prisma.user.findUniqueOrThrow({
      where: { id: squatter.id },
    });
    expect(occupant.email).toBe(deterministic);
    expect(stored.email).not.toBe(deterministic);
    expect(stored.email).not.toBe(victim.email);
    expect(stored.email).not.toContain(victim.email);
    expect(isTombstoneEmail(stored.email)).toBe(true);
    expect(stored.status).toBe('DELETED');
  }, 30_000);
});
