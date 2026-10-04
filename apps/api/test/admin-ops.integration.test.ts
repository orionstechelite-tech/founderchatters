import type { AddressInfo } from 'node:net';

import {
  ACCOUNT_DELETION_CONFIRMATION,
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
} from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AdminPrincipal } from '../src/admin/admin-auth.service.js';
import { AdminOpsService } from '../src/admin/admin-ops.service.js';
import {
  assignAdminRole,
  ensureAdminRbac,
  grantAdminPermission,
  revokeAdminPermission,
} from '../src/admin/admin-rbac.js';
import { AppModule } from '../src/app.module.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { SessionService } from '../src/auth/session.service.js';
import { AppConfig } from '../src/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  lockNotificationDelivery,
  lockUser,
} from '../src/requests/request-locks.js';
import { AccountDeletionService } from '../src/settings/account-deletion.service.js';

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

const SECRET_MESSAGE = 'FC019-PRIVATE-MESSAGE-BODY-SHOULD-NEVER-LEAK';

describe('admin operations HTTP integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessions: SessionService;
  let config: AppConfig;
  let deletion: AccountDeletionService;
  let ops: AdminOpsService;
  let baseUrl: string;
  const userIds: string[] = [];
  const topicIds: string[] = [];
  const supportIds: string[] = [];
  const jobIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
    config = app.get(AppConfig);
    deletion = new AccountDeletionService(prisma, app.get(PasswordHasher));
    ops = app.get(AdminOpsService);
    await ensureAdminRbac(prisma);
  });

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await prisma.supportMessage.deleteMany({
          where: { caseId: { in: supportIds } },
        });
        await prisma.supportCase.deleteMany({
          where: { id: { in: supportIds } },
        });
        await prisma.jobFailure.deleteMany({ where: { id: { in: jobIds } } });
        await prisma.contributionTopic.deleteMany({
          where: { contribution: { contributorId: { in: userIds } } },
        });
        await prisma.thankYouNote.deleteMany({
          where: { contribution: { contributorId: { in: userIds } } },
        });
        await prisma.contribution.deleteMany({
          where: { contributorId: { in: userIds } },
        });
        await prisma.helpConfirmation.deleteMany({
          where: {
            OR: [
              { confirmerId: { in: userIds } },
              { helperId: { in: userIds } },
            ],
          },
        });
        await prisma.requestResponse.deleteMany({
          where: { authorId: { in: userIds } },
        });
        await prisma.requestTopic.deleteMany({
          where: { request: { authorId: { in: userIds } } },
        });
        const requestIds = (
          await prisma.request.findMany({
            where: { authorId: { in: userIds } },
            select: { id: true },
          })
        ).map(({ id }) => id);
        await prisma.message.deleteMany({
          where: { senderId: { in: userIds } },
        });
        await prisma.conversationParticipant.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.conversation.deleteMany({
          where: { requestId: { in: requestIds } },
        });
        await prisma.request.deleteMany({
          where: { authorId: { in: userIds } },
        });
        await prisma.notificationDelivery.deleteMany({
          where: { notification: { userId: { in: userIds } } },
        });
        await prisma.notification.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.report.deleteMany({
          where: {
            OR: [
              { reporterId: { in: userIds } },
              { targetId: { in: userIds } },
            ],
          },
        });
        await prisma.moderationAction.deleteMany({
          where: { actorUserId: { in: userIds } },
        });
        await prisma.auditLog.deleteMany({
          where: { actorUserId: { in: userIds } },
        });
        await prisma.userAdminRole.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.founderExpertise.deleteMany({
          where: { profile: { userId: { in: userIds } } },
        });
        await prisma.founderNeed.deleteMany({
          where: { profile: { userId: { in: userIds } } },
        });
        await prisma.company.deleteMany({
          where: { founderProfile: { userId: { in: userIds } } },
        });
        await prisma.founderProfile.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.founderApplication.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      if (topicIds.length > 0) {
        await prisma.taxonomyTopic.updateMany({
          where: { id: { in: topicIds } },
          data: { mergedIntoId: null },
        });
        await prisma.taxonomyTopic.deleteMany({
          where: { id: { in: topicIds } },
        });
      }
    } finally {
      await app.close();
    }
  });

  async function account(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `fc019-${label}-${Date.now()}-${userIds.length}@example.com`,
        passwordHash: '$argon2id$test-only',
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(user.id);
    await prisma.founderProfile.create({
      data: {
        userId: user.id,
        displayName: `Founder ${label}`,
        city: 'Mumbai',
        country: 'India',
        company: {
          create: { name: `${label} Co`, city: 'Mumbai', country: 'India' },
        },
      },
    });
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-019 integration test',
    });
    return {
      id: user.id,
      email: user.email,
      cookie: `${config.sessionCookieName}=${session.rawToken}`,
    };
  }

  async function admin(role: keyof typeof ADMIN_ROLES, label: string) {
    const user = await account(String(label));
    await assignAdminRole(prisma, user.id, ADMIN_ROLES[role]);
    return user;
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

  async function readJson<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
  }

  it('denies unauthenticated and non-admin callers', async () => {
    const member = await account('plain-member');
    const anon = await request('/v1/admin');
    expect(anon.status).toBe(401);
    const forbidden = await request('/v1/admin', member.cookie);
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({
      error: { code: 'ADMIN_PERMISSION_DENIED' },
    });
  });

  it('does not grant SUPER_ADMIN a hardcoded bypass', async () => {
    const user = await admin('superAdmin', 'no-bypass');
    await revokeAdminPermission(
      prisma,
      ADMIN_ROLES.superAdmin,
      ADMIN_PERMISSIONS.membersRead,
    );
    try {
      const response = await request('/v1/admin/members', user.cookie);
      expect(response.status).toBe(403);
    } finally {
      await grantAdminPermission(
        prisma,
        ADMIN_ROLES.superAdmin,
        ADMIN_PERMISSIONS.membersRead,
      );
    }
  });

  it('keeps least-privilege role grants', async () => {
    const reviewer = await admin('applicationReviewer', 'reviewer-scope');
    const operations = await admin('operations', 'ops-scope');
    const moderator = await admin('moderator', 'mod-scope');
    const support = await admin('support', 'support-scope');
    const analyst = await admin('analystReadonly', 'analyst-scope');

    expect((await request('/v1/admin/members', reviewer.cookie)).status).toBe(
      403,
    );
    expect((await request('/v1/admin/reports', operations.cookie)).status).toBe(
      403,
    );
    expect((await request('/v1/admin/audit', operations.cookie)).status).toBe(
      403,
    );
    expect((await request('/v1/admin/members', operations.cookie)).status).toBe(
      200,
    );
    expect((await request('/v1/admin/reports', moderator.cookie)).status).toBe(
      200,
    );
    expect(
      (await request('/v1/admin/analytics', moderator.cookie)).status,
    ).toBe(403);
    expect((await request('/v1/admin/support', support.cookie)).status).toBe(
      200,
    );
    expect((await request('/v1/admin/reports', support.cookie)).status).toBe(
      403,
    );
    expect((await request('/v1/admin/analytics', analyst.cookie)).status).toBe(
      200,
    );
    expect((await request('/v1/admin/members', analyst.cookie)).status).toBe(
      403,
    );
    expect(
      (
        await request('/v1/admin/members/x/suspend', operations.cookie, {
          method: 'POST',
          body: JSON.stringify({ reason: 'nope' }),
        })
      ).status,
    ).toBe(403);
  });

  it('manages admin users with ceiling, self-protection, and last SUPER_ADMIN lock', async () => {
    const superA = await admin('superAdmin', 'super-a');
    const superB = await admin('superAdmin', 'super-b');
    const operations = await admin('operations', 'ops-ceiling');
    const target = await account('role-target');
    const deleted = await account('deleted-target');
    await prisma.user.update({
      where: { id: deleted.id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    expect((await request('/v1/admin/admins', operations.cookie)).status).toBe(
      403,
    );
    const list = await request('/v1/admin/admins', superA.cookie);
    expect(list.status).toBe(200);

    const unknown = await request(
      `/v1/admin/admins/${target.id}/roles`,
      superA.cookie,
      {
        method: 'PUT',
        body: JSON.stringify({ roles: ['NOT_A_ROLE'] }),
      },
    );
    expect(unknown.status).toBe(400);

    const duplicate = await request(
      `/v1/admin/admins/${target.id}/roles`,
      superA.cookie,
      {
        method: 'PUT',
        body: JSON.stringify({ roles: ['OPERATIONS', 'OPERATIONS'] }),
      },
    );
    expect(duplicate.status).toBe(400);

    const ceiling = await request(
      `/v1/admin/admins/${target.id}/roles`,
      operations.cookie,
      {
        method: 'PUT',
        body: JSON.stringify({ roles: ['SUPER_ADMIN'] }),
      },
    );
    expect(ceiling.status).toBe(403);

    const self = await request(
      `/v1/admin/admins/${superA.id}/roles`,
      superA.cookie,
      {
        method: 'PUT',
        body: JSON.stringify({ roles: ['OPERATIONS'] }),
      },
    );
    expect(self.status).toBe(403);

    const deletedAssign = await request(
      `/v1/admin/admins/${deleted.id}/roles`,
      superA.cookie,
      { method: 'PUT', body: JSON.stringify({ roles: ['SUPPORT'] }) },
    );
    expect(deletedAssign.status).toBe(400);

    const assigned = await request(
      `/v1/admin/admins/${target.id}/roles`,
      superA.cookie,
      {
        method: 'PUT',
        body: JSON.stringify({ roles: ['SUPPORT'] }),
      },
    );
    expect(assigned.status).toBe(200);
    await expect(assigned.json()).resolves.toMatchObject({
      roles: ['SUPPORT'],
    });

    const replaced = await request(
      `/v1/admin/admins/${target.id}/roles`,
      superA.cookie,
      {
        method: 'PUT',
        body: JSON.stringify({ roles: ['MODERATOR'] }),
      },
    );
    expect(replaced.status).toBe(200);
    await expect(replaced.json()).resolves.toMatchObject({
      roles: ['MODERATOR'],
    });

    const selfDisable = await request(
      `/v1/admin/admins/${superA.id}/disable`,
      superA.cookie,
      {
        method: 'POST',
        body: '{}',
      },
    );
    expect(selfDisable.status).toBe(403);

    const others = await prisma.userAdminRole.findMany({
      where: {
        role: { key: ADMIN_ROLES.superAdmin },
        userId: { notIn: [superA.id, superB.id] },
      },
      select: { userId: true, roleId: true },
    });
    await prisma.userAdminRole.deleteMany({
      where: {
        role: { key: ADMIN_ROLES.superAdmin },
        userId: { notIn: [superA.id, superB.id] },
      },
    });
    let remainingActor = superA;
    try {
      const [first, second] = await Promise.all([
        request(`/v1/admin/admins/${superB.id}/disable`, superA.cookie, {
          method: 'POST',
          body: '{}',
        }),
        request(`/v1/admin/admins/${superA.id}/disable`, superB.cookie, {
          method: 'POST',
          body: '{}',
        }),
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toContain(200);
      expect(statuses.some((status) => status === 409 || status === 400)).toBe(
        true,
      );
      remainingActor = first.status === 200 ? superA : superB;
      const remaining = await prisma.userAdminRole.count({
        where: {
          role: { key: ADMIN_ROLES.superAdmin },
          user: { status: { not: 'DELETED' }, deletedAt: null },
        },
      });
      expect(remaining).toBeGreaterThanOrEqual(1);
    } finally {
      for (const row of others) {
        await prisma.userAdminRole.upsert({
          where: { userId_roleId: { userId: row.userId, roleId: row.roleId } },
          update: {},
          create: { userId: row.userId, roleId: row.roleId },
        });
      }
    }

    const founder = await account('still-founder');
    await assignAdminRole(prisma, founder.id, ADMIN_ROLES.support);
    const disabled = await request(
      `/v1/admin/admins/${founder.id}/disable`,
      remainingActor.cookie,
      {
        method: 'POST',
        body: '{}',
      },
    );
    expect(disabled.status).toBe(200);
    const founderRow = await prisma.user.findUniqueOrThrow({
      where: { id: founder.id },
    });
    expect(founderRow.status).toBe('ACTIVE');
    expect(founderRow.deletedAt).toBeNull();
    expect(
      await prisma.userAdminRole.count({ where: { userId: founder.id } }),
    ).toBe(0);
    expect(
      await prisma.session.count({
        where: { userId: founder.id, revokedAt: null },
      }),
    ).toBe(0);

    const revokeAgain = await request(
      `/v1/admin/admins/${target.id}/sessions`,
      remainingActor.cookie,
      { method: 'DELETE', body: '{}' },
    );
    expect(revokeAgain.status).toBe(200);
    const revokeIdempotent = await request(
      `/v1/admin/admins/${target.id}/sessions`,
      remainingActor.cookie,
      { method: 'DELETE', body: '{}' },
    );
    expect(revokeIdempotent.status).toBe(200);
    await expect(revokeIdempotent.json()).resolves.toMatchObject({
      revokedCount: 0,
    });
  });

  it('lists members, tombstones, and audited suspend/restore without DM bodies', async () => {
    const moderator = await admin('moderator', 'mod-members');
    const member = await account('visible-member');
    const deleted = await account('tombstone-member');
    await prisma.user.update({
      where: { id: deleted.id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        email: `deleted-fc019-${deleted.id}@deleted.invalid`,
      },
    });
    const published = await prisma.request.create({
      data: {
        authorId: member.id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: 'Need hiring help',
        context: 'Hiring a founding engineer.',
        publishedAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
    const conversation = await prisma.conversation.create({
      data: { requestId: published.id },
    });
    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conversation.id, userId: member.id },
        { conversationId: conversation.id, userId: moderator.id },
      ],
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: member.id,
        body: SECRET_MESSAGE,
      },
    });

    const list = await request('/v1/admin/members', moderator.cookie);
    expect(list.status).toBe(200);
    const listed = await readJson<{ items: Array<{ id: string }> }>(list);
    expect(JSON.stringify(listed)).not.toContain(SECRET_MESSAGE);
    expect(listed.items.some((item) => item.id === deleted.id)).toBe(true);

    const detail = await request(
      `/v1/admin/members/${member.id}`,
      moderator.cookie,
    );
    expect(detail.status).toBe(200);
    const body = await readJson<{ requestCount: number }>(detail);
    expect(body.requestCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body)).not.toContain(SECRET_MESSAGE);
    expect(body).not.toHaveProperty('messages');

    const tombstone = await request(
      `/v1/admin/members/${deleted.id}`,
      moderator.cookie,
    );
    expect(tombstone.status).toBe(200);
    await expect(tombstone.json()).resolves.toMatchObject({
      deleted: true,
      email: null,
      displayName: 'Deleted founder',
    });

    const suspendDeleted = await request(
      `/v1/admin/members/${deleted.id}/suspend`,
      moderator.cookie,
      { method: 'POST', body: JSON.stringify({ reason: 'no' }) },
    );
    expect(suspendDeleted.status).toBe(400);

    const suspend = await request(
      `/v1/admin/members/${member.id}/suspend`,
      moderator.cookie,
      { method: 'POST', body: JSON.stringify({ reason: 'Policy violation' }) },
    );
    expect(suspend.status).toBe(200);
    const restored = await request(
      `/v1/admin/members/${member.id}/restore`,
      moderator.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(restored.status).toBe(200);
    const audits = await prisma.auditLog.findMany({
      where: {
        targetId: member.id,
        action: { in: ['MEMBER_SUSPENDED', 'MEMBER_RESTORED'] },
      },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes requests and reputation without private messages or score edits', async () => {
    const operations = await admin('operations', 'ops-requests');
    const author = await account('request-author');
    const helper = await account('request-helper');
    const requestRow = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: 'Need pricing help',
        context: 'SaaS packaging.',
        publishedAt: new Date('2026-02-02T00:00:00.000Z'),
      },
    });
    const responseRow = await prisma.requestResponse.create({
      data: {
        requestId: requestRow.id,
        authorId: helper.id,
        type: 'ADVICE',
        body: 'Try usage-based pricing.',
      },
    });
    const confirmation = await prisma.helpConfirmation.create({
      data: {
        requestId: requestRow.id,
        confirmerId: author.id,
        helperId: helper.id,
        responseId: responseRow.id,
        outcome: 'HELPED',
      },
    });
    const contribution = await prisma.contribution.create({
      data: {
        helpConfirmationId: confirmation.id,
        contributorId: helper.id,
      },
    });

    const queue = await request('/v1/admin/requests', operations.cookie);
    expect(queue.status).toBe(200);
    const detail = await request(
      `/v1/admin/requests/${requestRow.id}`,
      operations.cookie,
    );
    expect(detail.status).toBe(200);
    const payload = await readJson<{ headline: string }>(detail);
    expect(payload.headline).toBe('Need pricing help');
    expect(JSON.stringify(payload)).not.toContain(SECRET_MESSAGE);

    expect(
      (
        await request(
          `/v1/admin/requests/${requestRow.id}/resolve`,
          operations.cookie,
          {
            method: 'POST',
            body: '{}',
          },
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);

    const reputation = await request('/v1/admin/reputation', operations.cookie);
    expect(reputation.status).toBe(200);
    const item = await request(
      `/v1/admin/reputation/${contribution.id}`,
      operations.cookie,
    );
    expect(item.status).toBe(200);
    expect(
      (
        await request(
          `/v1/admin/reputation/${contribution.id}`,
          operations.cookie,
          {
            method: 'PATCH',
            body: JSON.stringify({ score: 99 }),
          },
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it('validates support transitions and reply bodies', async () => {
    const support = await admin('support', 'support-ops');
    const created = await prisma.supportCase.create({
      data: {
        email: 'founder@example.com',
        category: 'ACCOUNT',
        subject: 'Cannot verify email',
        status: 'OPEN',
      },
    });
    supportIds.push(created.id);
    const list = await request('/v1/admin/support', support.cookie);
    expect(list.status).toBe(200);
    const empty = await request(
      `/v1/admin/support/${created.id}/reply`,
      support.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: '' }),
      },
    );
    expect(empty.status).toBe(400);
    const reply = await request(
      `/v1/admin/support/${created.id}/reply`,
      support.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: 'We can help with verification.' }),
      },
    );
    expect(reply.status).toBe(200);
    const closed = await request(
      `/v1/admin/support/${created.id}/status`,
      support.cookie,
      { method: 'POST', body: JSON.stringify({ status: 'CLOSED' }) },
    );
    expect(closed.status).toBe(200);
    const reopen = await request(
      `/v1/admin/support/${created.id}/status`,
      support.cookie,
      { method: 'POST', body: JSON.stringify({ status: 'OPEN' }) },
    );
    expect(reopen.status).toBe(400);
  });

  it('retries notification deliveries without duplicating notifications', async () => {
    const operations = await admin('operations', 'ops-notify');
    const member = await account('notify-target');
    const notification = await prisma.notification.create({
      data: {
        userId: member.id,
        type: 'APPLICATION_APPROVED',
        title: 'Approved',
        body: 'Welcome.',
      },
    });
    const delivery = await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: 'EMAIL',
        templateVersion: 'v1',
        status: 'FAILED',
        lastErrorCode: 'PROVIDER_ERROR',
        attemptCount: 2,
      },
    });
    const sent = await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: 'IN_APP',
        templateVersion: 'v1',
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    const retry = await request(
      `/v1/admin/notifications/${delivery.id}/retry`,
      operations.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(retry.status).toBe(200);
    const updated = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(updated.status).toBe('QUEUED');
    expect(
      await prisma.notification.count({ where: { userId: member.id } }),
    ).toBe(1);
    expect(
      (
        await request(
          `/v1/admin/notifications/${sent.id}/retry`,
          operations.cookie,
          {
            method: 'POST',
            body: '{}',
          },
        )
      ).status,
    ).toBe(400);

    await prisma.user.update({
      where: { id: member.id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        email: `deleted-fc019-${member.id}@deleted.invalid`,
      },
    });
    expect(
      (
        await request(
          `/v1/admin/notifications/${delivery.id}/retry`,
          operations.cookie,
          { method: 'POST', body: '{}' },
        )
      ).status,
    ).toBe(400);

    const templates = await request(
      '/v1/admin/notifications/templates',
      operations.cookie,
    );
    expect(templates.status).toBe(200);
  });

  it('creates, edits, and merges taxonomy without rewriting history', async () => {
    const operations = await admin('operations', 'ops-tax');
    const create = await request('/v1/admin/taxonomy', operations.cookie, {
      method: 'POST',
      body: JSON.stringify({
        label: 'FC019 Pricing',
        description: 'Pricing help',
      }),
    });
    expect(create.status).toBe(201);
    const source = await readJson<{ topic: { id: string } }>(create);
    topicIds.push(source.topic.id);
    const targetRes = await request('/v1/admin/taxonomy', operations.cookie, {
      method: 'POST',
      body: JSON.stringify({ label: 'FC019 GTM' }),
    });
    const target = await readJson<{ topic: { id: string } }>(targetRes);
    topicIds.push(target.topic.id);
    const duplicate = await request('/v1/admin/taxonomy', operations.cookie, {
      method: 'POST',
      body: JSON.stringify({ label: 'FC019 Pricing' }),
    });
    expect(duplicate.status).toBe(400);
    const deactivate = await request(
      `/v1/admin/taxonomy/${source.topic.id}`,
      operations.cookie,
      { method: 'PATCH', body: JSON.stringify({ isActive: false }) },
    );
    expect(deactivate.status).toBe(200);

    const author = await account('tax-author');
    const helper = await account('tax-helper');
    const requestRow = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: 'Taxonomy history',
        context: 'Keep source IDs.',
        publishedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    });
    await prisma.requestTopic.create({
      data: { requestId: requestRow.id, topicId: source.topic.id },
    });
    const confirmation = await prisma.helpConfirmation.create({
      data: {
        requestId: requestRow.id,
        confirmerId: author.id,
        helperId: helper.id,
        outcome: 'HELPED',
      },
    });
    const contribution = await prisma.contribution.create({
      data: {
        helpConfirmationId: confirmation.id,
        contributorId: helper.id,
      },
    });
    await prisma.contributionTopic.create({
      data: { contributionId: contribution.id, topicId: source.topic.id },
    });

    const same = await request(
      `/v1/admin/taxonomy/${source.topic.id}/merge`,
      operations.cookie,
      { method: 'POST', body: JSON.stringify({ targetId: source.topic.id }) },
    );
    expect(same.status).toBe(400);
    const merged = await request(
      `/v1/admin/taxonomy/${source.topic.id}/merge`,
      operations.cookie,
      { method: 'POST', body: JSON.stringify({ targetId: target.topic.id }) },
    );
    expect(merged.status).toBe(200);
    const sourceRow = await prisma.taxonomyTopic.findUniqueOrThrow({
      where: { id: source.topic.id },
    });
    expect(sourceRow.isActive).toBe(false);
    expect(sourceRow.mergedIntoId).toBe(target.topic.id);
    expect(
      await prisma.contributionTopic.findUnique({
        where: {
          contributionId_topicId: {
            contributionId: contribution.id,
            topicId: source.topic.id,
          },
        },
      }),
    ).not.toBeNull();
    expect(
      await prisma.requestTopic.findUnique({
        where: {
          requestId_topicId: {
            requestId: requestRow.id,
            topicId: source.topic.id,
          },
        },
      }),
    ).not.toBeNull();
  });

  it('returns real analytics, settings, system, jobs, audit, and permission-filtered search', async () => {
    const superUser = await admin('superAdmin', 'super-reads');
    const operations = await admin('operations', 'ops-search');
    const published = await prisma.request.create({
      data: {
        authorId: (await account('analytics-author')).id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: 'Analytics fixture request',
        context: 'Deterministic.',
        publishedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    });
    const report = await prisma.report.create({
      data: {
        reporterId: superUser.id,
        targetType: 'USER',
        targetId: operations.id,
        reasonCode: 'OTHER',
        details: 'FC019-REPORT-EVIDENCE-BODY',
      },
    });
    const support = await prisma.supportCase.create({
      data: {
        category: 'OTHER',
        subject: 'Searchable support case',
        email: 'search@example.com',
      },
    });
    supportIds.push(support.id);
    const job = await prisma.jobFailure.create({
      data: {
        queue: 'notifications',
        jobName: 'unknown-job',
        errorCode: 'POISON',
        message: 'cannot synthesize',
      },
    });
    jobIds.push(job.id);

    const analytics = await request('/v1/admin/analytics', superUser.cookie);
    expect(analytics.status).toBe(200);
    const metrics = await readJson<{ publishedRequests: number }>(analytics);
    expect(metrics.publishedRequests).toBeGreaterThanOrEqual(1);
    expect(metrics).not.toHaveProperty('likes');

    const settings = await request('/v1/admin/settings', superUser.cookie);
    expect(settings.status).toBe(200);
    expect(
      (
        await request('/v1/admin/settings', superUser.cookie, {
          method: 'POST',
          body: '{}',
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);

    const system = await request('/v1/admin/system', superUser.cookie);
    expect(system.status).toBe(200);
    const health = await readJson<{ api: string }>(system);
    expect(health.api).toBe('ok');
    expect(JSON.stringify(health)).not.toMatch(/DATABASE_URL|REDIS|password/i);

    const jobs = await request('/v1/admin/system/jobs', superUser.cookie);
    expect(jobs.status).toBe(200);
    const unsupported = await request(
      `/v1/admin/system/jobs/${job.id}/retry`,
      superUser.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(unsupported.status).toBe(400);

    const audit = await request('/v1/admin/audit', superUser.cookie);
    expect(audit.status).toBe(200);

    const short = await request('/v1/admin/search?q=a', operations.cookie);
    expect(short.status).toBe(400);
    const search = await request(
      `/v1/admin/search?q=${encodeURIComponent(published.headline)}`,
      operations.cookie,
    );
    expect(search.status).toBe(200);
    const hits = await readJson<{ results: Array<{ type: string }> }>(search);
    expect(hits.results.some((hit) => hit.type === 'request')).toBe(true);
    expect(hits.results.some((hit) => hit.type === 'report')).toBe(false);
    expect(JSON.stringify(hits)).not.toContain('FC019-REPORT-EVIDENCE-BODY');
    expect(JSON.stringify(hits)).not.toContain(SECRET_MESSAGE);

    const reportSearch = await request(
      `/v1/admin/search?q=${report.id}`,
      superUser.cookie,
    );
    expect(reportSearch.status).toBe(200);
    await expect(reportSearch.json()).resolves.toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ type: 'report', id: report.id }),
      ]),
    });
  });

  it('cannot suspend or restore a member that is concurrently deleted', async () => {
    const moderator = await admin('moderator', 'race-mod-member');
    const suspendTarget = await account('race-suspend-target');
    const restoreTarget = await account('race-restore-target');
    await prisma.user.update({
      where: { id: restoreTarget.id },
      data: { status: 'SUSPENDED', suspensionReason: 'Held for restore race' },
    });

    const [suspendRes] = await Promise.all([
      request(
        `/v1/admin/members/${suspendTarget.id}/suspend`,
        moderator.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Concurrent deletion race' }),
        },
      ),
      deletion.deleteAccount(suspendTarget.id, {
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      }),
    ]);
    const [restoreRes] = await Promise.all([
      request(
        `/v1/admin/members/${restoreTarget.id}/restore`,
        moderator.cookie,
        {
          method: 'POST',
          body: '{}',
        },
      ),
      deletion.deleteAccount(restoreTarget.id, {
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      }),
    ]);

    expect([200, 400]).toContain(suspendRes.status);
    expect([200, 400]).toContain(restoreRes.status);
    const suspended = await prisma.user.findUniqueOrThrow({
      where: { id: suspendTarget.id },
    });
    const restored = await prisma.user.findUniqueOrThrow({
      where: { id: restoreTarget.id },
    });
    expect(suspended.status).toBe('DELETED');
    expect(suspended.deletedAt).not.toBeNull();
    expect(restored.status).toBe('DELETED');
    expect(restored.deletedAt).not.toBeNull();
  });

  it('cannot assign admin roles to a user that is concurrently deleted', async () => {
    const superUser = await admin('superAdmin', 'race-role-actor');
    const target = await account('race-role-target');
    const [assignRes] = await Promise.all([
      request(`/v1/admin/admins/${target.id}/roles`, superUser.cookie, {
        method: 'PUT',
        body: JSON.stringify({ roles: ['SUPPORT'] }),
      }),
      deletion.deleteAccount(target.id, {
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      }),
    ]);
    expect([200, 400]).toContain(assignRes.status);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(user.status).toBe('DELETED');
    expect(user.deletedAt).not.toBeNull();
    expect(
      await prisma.userAdminRole.count({ where: { userId: target.id } }),
    ).toBe(0);
  });

  it('executes last SUPER_ADMIN removals concurrently and keeps one', async () => {
    const superA = await admin('superAdmin', 'last-sa-conc-a');
    const superB = await admin('superAdmin', 'last-sa-conc-b');
    const others = await prisma.userAdminRole.findMany({
      where: {
        role: { key: ADMIN_ROLES.superAdmin },
        userId: { notIn: [superA.id, superB.id] },
      },
      select: { userId: true, roleId: true },
    });
    await prisma.userAdminRole.deleteMany({
      where: {
        role: { key: ADMIN_ROLES.superAdmin },
        userId: { notIn: [superA.id, superB.id] },
      },
    });
    try {
      const [first, second] = await Promise.all([
        request(`/v1/admin/admins/${superB.id}/disable`, superA.cookie, {
          method: 'POST',
          body: '{}',
        }),
        request(`/v1/admin/admins/${superA.id}/disable`, superB.cookie, {
          method: 'POST',
          body: '{}',
        }),
      ]);
      const statuses = [first.status, second.status];
      expect(statuses).toContain(200);
      expect(statuses.some((status) => status === 409 || status === 400)).toBe(
        true,
      );
      expect(
        await prisma.userAdminRole.count({
          where: {
            role: { key: ADMIN_ROLES.superAdmin },
            user: { status: { not: 'DELETED' }, deletedAt: null },
          },
        }),
      ).toBeGreaterThanOrEqual(1);
    } finally {
      for (const row of others) {
        await prisma.userAdminRole.upsert({
          where: { userId_roleId: { userId: row.userId, roleId: row.roleId } },
          update: {},
          create: { userId: row.userId, roleId: row.roleId },
        });
      }
    }
  });

  it('serializes concurrent notification retries and never requeues SENT or deleted users', async () => {
    const operations = await admin('operations', 'race-notify');
    const member = await account('race-notify-target');
    const sentMember = await account('race-sent-target');
    const deletedMember = await account('race-deleted-mail');

    const failedNotification = await prisma.notification.create({
      data: {
        userId: member.id,
        type: 'APPLICATION_APPROVED',
        title: 'Retry race',
        body: 'Failed first.',
      },
    });
    const failed = await prisma.notificationDelivery.create({
      data: {
        notificationId: failedNotification.id,
        channel: 'EMAIL',
        templateVersion: 'v1',
        status: 'FAILED',
        lastErrorCode: 'PROVIDER_ERROR',
        attemptCount: 2,
      },
    });
    const [firstRetry, secondRetry] = await Promise.all([
      request(`/v1/admin/notifications/${failed.id}/retry`, operations.cookie, {
        method: 'POST',
        body: '{}',
      }),
      request(`/v1/admin/notifications/${failed.id}/retry`, operations.cookie, {
        method: 'POST',
        body: '{}',
      }),
    ]);
    const retryStatuses = [firstRetry.status, secondRetry.status].sort();
    expect(retryStatuses).toEqual([200, 400]);
    expect(
      (
        await prisma.notificationDelivery.findUniqueOrThrow({
          where: { id: failed.id },
        })
      ).status,
    ).toBe('QUEUED');
    expect(
      await prisma.notification.count({ where: { userId: member.id } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          targetId: failed.id,
          action: 'NOTIFICATION_DELIVERY_RETRIED',
        },
      }),
    ).toBe(1);

    const sentNotification = await prisma.notification.create({
      data: {
        userId: sentMember.id,
        type: 'APPLICATION_APPROVED',
        title: 'Sent race',
        body: 'About to send.',
      },
    });
    const racing = await prisma.notificationDelivery.create({
      data: {
        notificationId: sentNotification.id,
        channel: 'EMAIL',
        templateVersion: 'v1',
        status: 'FAILED',
        lastErrorCode: 'PROVIDER_ERROR',
        attemptCount: 1,
      },
    });
    await Promise.all([
      request(`/v1/admin/notifications/${racing.id}/retry`, operations.cookie, {
        method: 'POST',
        body: '{}',
      }),
      prisma.$transaction(async (tx) => {
        await lockUser(tx, sentMember.id);
        await lockNotificationDelivery(tx, racing.id);
        await tx.notificationDelivery.update({
          where: { id: racing.id },
          data: { status: 'SENT', sentAt: new Date(), lastErrorCode: null },
        });
      }),
    ]);
    expect(
      (
        await prisma.notificationDelivery.findUniqueOrThrow({
          where: { id: racing.id },
        })
      ).status,
    ).toBe('SENT');

    const deletedNotification = await prisma.notification.create({
      data: {
        userId: deletedMember.id,
        type: 'APPLICATION_APPROVED',
        title: 'Deleted race',
        body: 'Should not queue.',
      },
    });
    const doomed = await prisma.notificationDelivery.create({
      data: {
        notificationId: deletedNotification.id,
        channel: 'EMAIL',
        templateVersion: 'v1',
        status: 'FAILED',
        lastErrorCode: 'PROVIDER_ERROR',
      },
    });
    const [deletedRetry] = await Promise.all([
      request(`/v1/admin/notifications/${doomed.id}/retry`, operations.cookie, {
        method: 'POST',
        body: '{}',
      }),
      deletion.deleteAccount(deletedMember.id, {
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      }),
    ]);
    expect([200, 400]).toContain(deletedRetry.status);
    const doomedRow = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: doomed.id },
    });
    expect(doomedRow.status).not.toBe('QUEUED');
    const deletedUser = await prisma.user.findUniqueOrThrow({
      where: { id: deletedMember.id },
    });
    expect(deletedUser.status).toBe('DELETED');
  });

  it('retries a supported job atomically and rejects unsupported or concurrent duplicates', async () => {
    const superUser = await admin('superAdmin', 'race-jobs');
    const member = await account('race-job-target');
    const notification = await prisma.notification.create({
      data: {
        userId: member.id,
        type: 'APPLICATION_APPROVED',
        title: 'Job retry',
        body: 'Failed worker.',
      },
    });
    const delivery = await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: 'EMAIL',
        templateVersion: 'v1',
        status: 'FAILED',
        lastErrorCode: 'PROVIDER_ERROR',
        attemptCount: 3,
      },
    });
    const supported = await prisma.jobFailure.create({
      data: {
        queue: 'notifications',
        jobName: 'notification-delivery',
        jobId: delivery.id,
        errorCode: 'PROVIDER_ERROR',
        message: 'delivery failed',
      },
    });
    jobIds.push(supported.id);
    const unsupported = await prisma.jobFailure.create({
      data: {
        queue: 'notifications',
        jobName: 'unknown-job',
        jobId: delivery.id,
        errorCode: 'POISON',
        message: 'cannot synthesize',
      },
    });
    jobIds.push(unsupported.id);
    const rollbackJob = await prisma.jobFailure.create({
      data: {
        queue: 'notifications',
        jobName: 'notification-delivery',
        jobId: delivery.id,
        errorCode: 'PROVIDER_ERROR',
        message: 'rollback fixture',
      },
    });
    jobIds.push(rollbackJob.id);

    const [firstJob, secondJob] = await Promise.all([
      request(`/v1/admin/system/jobs/${supported.id}/retry`, superUser.cookie, {
        method: 'POST',
        body: '{}',
      }),
      request(`/v1/admin/system/jobs/${supported.id}/retry`, superUser.cookie, {
        method: 'POST',
        body: '{}',
      }),
    ]);
    const jobStatuses = [firstJob.status, secondJob.status].sort();
    expect(jobStatuses).toEqual([200, 400]);
    const queued = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(queued.status).toBe('QUEUED');
    const resolved = await prisma.jobFailure.findUniqueOrThrow({
      where: { id: supported.id },
    });
    expect(resolved.resolvedAt).not.toBeNull();
    expect(
      await prisma.notification.count({ where: { userId: member.id } }),
    ).toBe(1);

    const unsupportedRes = await request(
      `/v1/admin/system/jobs/${unsupported.id}/retry`,
      superUser.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(unsupportedRes.status).toBe(400);
    expect(
      (
        await prisma.jobFailure.findUniqueOrThrow({
          where: { id: unsupported.id },
        })
      ).resolvedAt,
    ).toBeNull();

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        lastErrorCode: 'PROVIDER_ERROR',
        attemptCount: 3,
      },
    });
    const fakeActor = {
      sessionId: 'rollback-session',
      user: {
        id: 'missing-actor-for-job-rollback',
        email: 'missing-actor@example.com',
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
        onboardingCompletedAt: null,
        application: null,
      },
      permissions: new Set([ADMIN_PERMISSIONS.jobsRetry]),
    } as AdminPrincipal;
    await expect(ops.retryJob(fakeActor, rollbackJob.id)).rejects.toThrow();
    expect(
      (
        await prisma.notificationDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        })
      ).status,
    ).toBe('FAILED');
    expect(
      (
        await prisma.jobFailure.findUniqueOrThrow({
          where: { id: rollbackJob.id },
        })
      ).resolvedAt,
    ).toBeNull();
  });

  it('allows only one concurrent taxonomy merge and keeps historical topic ids', async () => {
    const operations = await admin('operations', 'race-tax');
    const source = await prisma.taxonomyTopic.create({
      data: {
        slug: `fc019-race-source-${Date.now()}`,
        label: 'FC019 Race Source',
      },
    });
    const targetA = await prisma.taxonomyTopic.create({
      data: {
        slug: `fc019-race-target-a-${Date.now()}`,
        label: 'FC019 Race Target A',
      },
    });
    const targetB = await prisma.taxonomyTopic.create({
      data: {
        slug: `fc019-race-target-b-${Date.now()}`,
        label: 'FC019 Race Target B',
      },
    });
    topicIds.push(source.id, targetA.id, targetB.id);
    const author = await account('race-tax-author');
    const helper = await account('race-tax-helper');
    const requestRow = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: 'Keep historical topic ids',
        context: 'Merge must not rewrite history.',
        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
    await prisma.requestTopic.create({
      data: { requestId: requestRow.id, topicId: source.id },
    });
    const confirmation = await prisma.helpConfirmation.create({
      data: {
        requestId: requestRow.id,
        confirmerId: author.id,
        helperId: helper.id,
        outcome: 'HELPED',
      },
    });
    const contribution = await prisma.contribution.create({
      data: {
        helpConfirmationId: confirmation.id,
        contributorId: helper.id,
      },
    });
    await prisma.contributionTopic.create({
      data: { contributionId: contribution.id, topicId: source.id },
    });

    const [first, second] = await Promise.all([
      request(`/v1/admin/taxonomy/${source.id}/merge`, operations.cookie, {
        method: 'POST',
        body: JSON.stringify({ targetId: targetA.id }),
      }),
      request(`/v1/admin/taxonomy/${source.id}/merge`, operations.cookie, {
        method: 'POST',
        body: JSON.stringify({ targetId: targetB.id }),
      }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 400]);
    const sourceRow = await prisma.taxonomyTopic.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(sourceRow.isActive).toBe(false);
    expect([targetA.id, targetB.id]).toContain(sourceRow.mergedIntoId);
    expect(
      await prisma.requestTopic.findUnique({
        where: {
          requestId_topicId: { requestId: requestRow.id, topicId: source.id },
        },
      }),
    ).not.toBeNull();
    expect(
      await prisma.contributionTopic.findUnique({
        where: {
          contributionId_topicId: {
            contributionId: contribution.id,
            topicId: source.id,
          },
        },
      }),
    ).not.toBeNull();
  });
});
