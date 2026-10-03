import type { AddressInfo } from 'node:net';

import type {
  AdminReportDetailResponse,
  BlockedFoundersResponse,
  BlockMutationResponse,
  MemberMessagesResponse,
  MemberReportCreatedResponse,
} from '@founderchatters/contracts';
import { SAFETY_AUDIT_ACTIONS } from '@founderchatters/contracts';
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

describe('FC-017 safety HTTP integration', () => {
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

  async function member(suffix: string, displayName = `Safety ${suffix}`) {
    const passwordHash = await passwords.hash('correct horse battery');
    const user = await prisma.user.create({
      data: {
        email: `fc017-${suffix}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}@example.com`,
        passwordHash,
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
        application: {
          create: {
            status: 'APPROVED',
            companyName: `${displayName} Co`,
            roleTitle: 'Founder',
          },
        },
        profile: {
          create: {
            displayName,
            company: { create: { name: `${displayName} Co` } },
          },
        },
      },
    });
    createdUserIds.push(user.id);
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: `FC-017 ${suffix}`,
    });
    return {
      id: user.id,
      cookie: `${config.sessionCookieName}=${session.rawToken}`,
    };
  }

  async function publishedRequest(authorId: string) {
    return prisma.request.create({
      data: {
        authorId,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: 'Need help with hiring',
        context: 'Looking for practical hiring process advice from founders.',
        urgency: 'THIS_WEEK',
        publishedAt: new Date(),
      },
    });
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
        await prisma.session.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.userAdminRole.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } finally {
      await app.close();
    }
  }, 30_000);

  it('creates reports for visible targets and rejects unsafe or unknown input', async () => {
    const reporter = await member('reporter');
    const target = await member('target', 'Ada Helper');
    const requestRow = await publishedRequest(target.id);
    const responseRow = await prisma.requestResponse.create({
      data: {
        requestId: requestRow.id,
        authorId: target.id,
        type: 'ADVICE',
        body: 'Hire from a known operator network first.',
      },
    });

    const created = await request('/v1/reports', reporter.cookie, {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'USER',
        targetId: target.id,
        reasonCode: 'HARASSMENT_ABUSE',
        details: 'Repeated unwanted promotion.',
      }),
    });
    expect(created.status).toBe(200);
    const payload = (await created.json()) as MemberReportCreatedResponse;
    expect(payload.report.status).toBe('OPEN');

    const requestReport = await request('/v1/reports', reporter.cookie, {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'REQUEST',
        targetId: requestRow.id,
        reasonCode: 'SPAM_PROMOTION',
      }),
    });
    expect(requestReport.status).toBe(200);

    const responseReport = await request('/v1/reports', reporter.cookie, {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'RESPONSE',
        targetId: responseRow.id,
        reasonCode: 'OTHER',
      }),
    });
    expect(responseReport.status).toBe(200);

    const unknown = await request('/v1/reports', reporter.cookie, {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'USER',
        targetId: target.id,
        reasonCode: 'HARASSMENT_ABUSE',
        reporterId: 'spoofed',
      }),
    });
    expect(unknown.status).toBe(400);

    const selfReport = await request('/v1/reports', reporter.cookie, {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'USER',
        targetId: reporter.id,
        reasonCode: 'OTHER',
      }),
    });
    expect(selfReport.status).toBe(403);

    const missing = await request('/v1/reports', reporter.cookie, {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'USER',
        targetId: 'missing-user',
        reasonCode: 'OTHER',
      }),
    });
    expect(missing.status).toBe(404);
    const missingBody = (await missing.json()) as {
      error: { code: string };
    };
    expect(missingBody.error.code).toBe('SAFETY_TARGET_NOT_FOUND');

    const noOrigin = await request(
      '/v1/reports',
      reporter.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'USER',
          targetId: target.id,
          reasonCode: 'OTHER',
        }),
      },
      '',
    );
    expect(noOrigin.status).toBe(403);
  }, 30_000);

  it('manages caller-owned blocks and prevents new interactions in either direction', async () => {
    const alice = await member('alice', 'Alice Founder');
    const bob = await member('bob', 'Bob Founder');
    const requestRow = await publishedRequest(alice.id);

    const blocked = await request(`/v1/me/blocks/${bob.id}`, alice.cookie, {
      method: 'POST',
      body: '{}',
    });
    expect(blocked.status).toBe(200);
    await expect(blocked.json()).resolves.toMatchObject({
      blocked: true,
      userId: bob.id,
    } satisfies Partial<BlockMutationResponse>);

    const again = await request(`/v1/me/blocks/${bob.id}`, alice.cookie, {
      method: 'POST',
      body: '{}',
    });
    expect(again.status).toBe(200);

    const list = await request('/v1/me/blocks', alice.cookie);
    const listed = (await list.json()) as BlockedFoundersResponse;
    expect(listed.founders.map((item) => item.id)).toContain(bob.id);
    expect(JSON.stringify(listed)).not.toMatch(/tokenHash|ipHash|password/i);

    const bobList = await request('/v1/me/blocks', bob.cookie);
    const bobListed = (await bobList.json()) as BlockedFoundersResponse;
    expect(bobListed.founders.map((item) => item.id)).not.toContain(alice.id);

    const advice = await request(
      `/v1/requests/${requestRow.id}/responses/advice`,
      bob.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          body: 'This should not create a new help offer after a block.',
        }),
      },
    );
    expect(advice.status).toBe(403);

    await request(`/v1/me/blocks/${alice.id}`, bob.cookie, {
      method: 'DELETE',
    });
    const stillBlocked = await request(
      `/v1/requests/${requestRow.id}/responses/advice`,
      bob.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          body: 'Still blocked because Alice blocked Bob.',
        }),
      },
    );
    expect(stillBlocked.status).toBe(403);

    const self = await request(`/v1/me/blocks/${alice.id}`, alice.cookie, {
      method: 'POST',
      body: '{}',
    });
    expect(self.status).toBe(403);
  }, 30_000);

  it('returns only the reported message body to authorized moderators and audits that access', async () => {
    const reporter = await member('privacy-reporter', 'Priya Reporter');
    const helper = await member('privacy-helper', 'Omar Helper');
    const requestRow = await publishedRequest(reporter.id);
    const offer = await prisma.requestResponse.create({
      data: {
        requestId: requestRow.id,
        authorId: helper.id,
        type: 'PRIVATE_CHAT_OFFER',
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        requestId: requestRow.id,
        status: 'ACTIVE',
        participants: {
          create: [{ userId: reporter.id }, { userId: helper.id }],
        },
      },
    });
    const earlier = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: reporter.id,
        body: 'NEIGHBOR_PREVIOUS_MESSAGE_BODY',
        clientMessageId: '11111111-1111-4111-8111-111111111110',
        createdAt: new Date('2026-10-03T00:00:00.000Z'),
      },
    });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: helper.id,
        body: 'SECRET_PRIVATE_MESSAGE_BODY',
        clientMessageId: '11111111-1111-4111-8111-111111111111',
        createdAt: new Date('2026-10-03T00:01:00.000Z'),
      },
    });
    const later = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: reporter.id,
        body: 'NEIGHBOR_NEXT_MESSAGE_BODY',
        clientMessageId: '11111111-1111-4111-8111-111111111112',
        createdAt: new Date('2026-10-03T00:02:00.000Z'),
      },
    });
    const otherConversation = await prisma.conversation.create({
      data: {
        requestId: requestRow.id,
        status: 'ACTIVE',
        participants: {
          create: [{ userId: reporter.id }, { userId: helper.id }],
        },
      },
    });
    const unrelated = await prisma.message.create({
      data: {
        conversationId: otherConversation.id,
        senderId: helper.id,
        body: 'UNRELATED_PRIVATE_MESSAGE_BODY',
        clientMessageId: '11111111-1111-4111-8111-111111111113',
      },
    });
    const report = await request('/v1/reports', reporter.cookie, {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'MESSAGE',
        targetId: message.id,
        reasonCode: 'UNSAFE_POLICY',
        details: 'Please review this private message.',
      }),
    });
    expect(report.status).toBe(200);
    const created = (await report.json()) as MemberReportCreatedResponse;
    expect(JSON.stringify(created)).not.toContain(
      'SECRET_PRIVATE_MESSAGE_BODY',
    );

    const stranger = await member('stranger');
    const leaked = await request(
      `/v1/admin/reports/${created.report.id}`,
      stranger.cookie,
    );
    expect(leaked.status).toBe(403);
    expect(JSON.stringify(await leaked.json())).not.toContain(
      'SECRET_PRIVATE_MESSAGE_BODY',
    );

    const reviewer = await member('reviewer-role', 'App Reviewer');
    await assignAdminRole(prisma, reviewer.id, 'APPLICATION_REVIEWER');
    const deniedReviewer = await request(
      `/v1/admin/reports/${created.report.id}`,
      reviewer.cookie,
    );
    expect(deniedReviewer.status).toBe(403);

    const support = await member('support-role', 'Support Agent');
    await assignAdminRole(prisma, support.id, 'SUPPORT');
    expect(
      (await request(`/v1/admin/reports/${created.report.id}`, support.cookie))
        .status,
    ).toBe(403);

    const missing = await request(
      '/v1/admin/reports/missing-report',
      stranger.cookie,
    );
    expect(missing.status).toBe(403);

    expect(
      (await request(`/v1/admin/messages/${message.id}`, stranger.cookie))
        .status,
    ).toBeGreaterThanOrEqual(400);
    const moderator = await member('moderator', 'Mo Moderator');
    await assignAdminRole(prisma, moderator.id, 'MODERATOR');
    const missingForMod = await request(
      '/v1/admin/reports/missing-report',
      moderator.cookie,
    );
    expect(missingForMod.status).toBe(404);
    expect(
      await prisma.auditLog.count({
        where: {
          actorUserId: moderator.id,
          action: SAFETY_AUDIT_ACTIONS.messageEvidenceViewed,
        },
      }),
    ).toBe(0);
    const arbitrary = await request(
      `/v1/admin/messages/${message.id}`,
      moderator.cookie,
    );
    expect(arbitrary.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await arbitrary.json())).not.toContain(
      'SECRET_PRIVATE_MESSAGE_BODY',
    );
    expect(
      (
        await request(
          `/v1/admin/conversations/${conversation.id}`,
          moderator.cookie,
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);

    const userReport = await request('/v1/reports', reporter.cookie, {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'USER',
        targetId: helper.id,
        reasonCode: 'OTHER',
      }),
    });
    const userCreated =
      (await userReport.json()) as MemberReportCreatedResponse;
    const userDetail = await request(
      `/v1/admin/reports/${userCreated.report.id}`,
      moderator.cookie,
    );
    expect(userDetail.status).toBe(200);
    const userBody = (await userDetail.json()) as AdminReportDetailResponse;
    expect(userBody.report.evidence.kind).toBe('USER');
    const userAudits = await prisma.auditLog.findMany({
      where: {
        action: SAFETY_AUDIT_ACTIONS.messageEvidenceViewed,
        targetId: userCreated.report.id,
      },
    });
    expect(userAudits).toHaveLength(0);

    const detail = await request(
      `/v1/admin/reports/${created.report.id}`,
      moderator.cookie,
    );
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as AdminReportDetailResponse;
    expect(body.report.evidence).toMatchObject({
      kind: 'MESSAGE',
      messageId: message.id,
      conversationId: conversation.id,
      sender: { id: helper.id, displayName: 'Omar Helper' },
      body: 'SECRET_PRIVATE_MESSAGE_BODY',
    });
    expect(JSON.stringify(body)).not.toContain(earlier.body);
    expect(JSON.stringify(body)).not.toContain(later.body);
    expect(JSON.stringify(body)).not.toContain(unrelated.body);
    expect(JSON.stringify(body)).not.toMatch(/NEIGHBOR_|UNRELATED_/);
    expect(
      body.report.evidence.kind === 'MESSAGE' &&
        'messages' in body.report.evidence,
    ).toBe(false);

    const accessAudits = await prisma.auditLog.findMany({
      where: {
        action: SAFETY_AUDIT_ACTIONS.messageEvidenceViewed,
        actorUserId: moderator.id,
        targetId: created.report.id,
      },
    });
    expect(accessAudits).toHaveLength(1);
    expect(accessAudits[0]).toMatchObject({
      actorUserId: moderator.id,
      targetType: 'REPORT',
      targetId: created.report.id,
    });
    expect(accessAudits[0]?.metadata).toMatchObject({
      reportId: created.report.id,
      messageId: message.id,
      conversationId: conversation.id,
    });
    expect(JSON.stringify(accessAudits)).not.toContain(
      'SECRET_PRIVATE_MESSAGE_BODY',
    );
    expect(JSON.stringify(accessAudits)).not.toContain(reporter.id);
    expect(JSON.stringify(accessAudits)).not.toContain('Priya Reporter');
    expect(JSON.stringify(accessAudits)).not.toMatch(/@example\.com/);

    const second = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetType: 'MESSAGE',
        targetId: message.id,
        reasonCode: 'HARASSMENT_ABUSE',
        status: 'OPEN',
      },
    });
    const dismissable = await request(
      `/v1/admin/reports/${second.id}/dismiss`,
      moderator.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(dismissable.status).toBe(200);
    await expect(dismissable.json()).resolves.toMatchObject({
      report: {
        id: second.id,
        status: 'DISMISSED',
        evidence: {
          kind: 'MESSAGE',
          messageId: message.id,
          body: 'SECRET_PRIVATE_MESSAGE_BODY',
        },
      },
    });

    const enforced = await request(
      `/v1/admin/reports/${created.report.id}/enforce`,
      moderator.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(enforced.status).toBe(200);
    const enforcedBody = (await enforced.json()) as AdminReportDetailResponse;
    expect(enforcedBody.report.status).toBe('ENFORCED');
    expect(enforcedBody.report.evidence).toMatchObject({
      kind: 'MESSAGE',
      messageId: message.id,
      body: 'SECRET_PRIVATE_MESSAGE_BODY',
    });
    expect(
      enforcedBody.report.evidence.kind === 'MESSAGE' &&
        enforcedBody.report.evidence.deletedAt,
    ).toBeTruthy();

    const stored = await prisma.message.findUnique({
      where: { id: message.id },
    });
    expect(stored?.deletedAt).not.toBeNull();
    expect(stored?.body).toBe('SECRET_PRIVATE_MESSAGE_BODY');

    const memberHistory = await request(
      `/v1/conversations/${conversation.id}/messages`,
      reporter.cookie,
    );
    expect(memberHistory.status).toBe(200);
    const history = (await memberHistory.json()) as MemberMessagesResponse;
    const reported = history.messages.find((item) => item.id === message.id);
    expect(reported?.removed).toBe(true);
    expect(reported?.body).toBeNull();
    expect(
      JSON.stringify(history.messages.find((item) => item.id === message.id)),
    ).not.toContain('SECRET_PRIVATE_MESSAGE_BODY');

    const targetSession = await request('/v1/auth/session', helper.cookie);
    expect(JSON.stringify(await targetSession.json())).not.toContain(
      reporter.id,
    );

    const audits = await prisma.auditLog.findMany({
      where: {
        OR: [{ targetId: message.id }, { targetId: created.report.id }],
      },
    });
    expect(JSON.stringify(audits)).not.toContain('SECRET_PRIVATE_MESSAGE_BODY');
    expect(offer.id).toBeTruthy();
  }, 30_000);

  it('suspends a reported user and blocks member access without naming the reporter', async () => {
    const reporter = await member('suspend-reporter');
    const target = await member('suspend-target', 'Suspended Founder');
    const created = await request('/v1/reports', reporter.cookie, {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'USER',
        targetId: target.id,
        reasonCode: 'FRAUD_IMPERSONATION',
      }),
    });
    const report = (await created.json()) as MemberReportCreatedResponse;
    const moderator = await member('suspend-mod');
    await assignAdminRole(prisma, moderator.id, 'SUPER_ADMIN');
    const enforced = await request(
      `/v1/admin/reports/${report.report.id}/enforce`,
      moderator.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(enforced.status).toBe(200);

    const session = await request('/v1/auth/session', target.cookie);
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      access: { state: 'SUSPENDED' },
    });
    const sessionBody = await (
      await request('/v1/auth/session', target.cookie)
    ).json();
    expect(JSON.stringify(sessionBody)).not.toContain(reporter.id);

    const profile = await request('/v1/me/settings/profile', target.cookie);
    expect(profile.status).toBe(403);
    await expect(profile.json()).resolves.toMatchObject({
      error: { code: 'AUTH_ACCOUNT_SUSPENDED' },
    });
  }, 30_000);
});
