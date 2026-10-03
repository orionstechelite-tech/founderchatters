import type { AddressInfo } from 'node:net';

import type {
  AdminApplicationDetailResponse,
  AdminApplicationQueueResponse,
  AdminRoleKey,
} from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADMIN_NON_REVIEW_ROLE_KEYS,
  assignAdminRole,
  ensureAdminRbac,
  grantAdminPermission,
  revokeAdminPermission,
} from '../src/admin/admin-rbac.js';
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

const completeDraft = {
  eligibilityRole: 'FOUNDER_COFOUNDER',
  companyName: 'Nexora',
  roleTitle: 'Founder',
  website: 'https://nexora.example',
  city: 'Mumbai',
  country: 'India',
  buildingSummary:
    'Workflow automation for finance teams currently in private alpha.',
} as const;

describe('admin application review HTTP integration', () => {
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
    await ensureAdminRbac(prisma);
  });

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        const applicationIds = (
          await prisma.founderApplication.findMany({
            where: { userId: { in: userIds } },
            select: { id: true },
          })
        ).map(({ id }) => id);
        await prisma.auditLog.deleteMany({
          where: { actorUserId: { in: userIds } },
        });
        await prisma.applicationStatusEvent.deleteMany({
          where: { applicationId: { in: applicationIds } },
        });
        await prisma.founderApplication.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.userAdminRole.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app.close();
    }
  });

  async function account(label: string, verified = true) {
    const user = await prisma.user.create({
      data: {
        email: `fc008-${label}-${Date.now()}-${userIds.length}@example.com`,
        passwordHash: '$argon2id$test-only',
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
    userIds.push(user.id);
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-008 integration test',
    });
    return {
      id: user.id,
      cookie: `${config.sessionCookieName}=${session.rawToken}`,
    };
  }

  async function reviewer(role: AdminRoleKey, label = role.toLowerCase()) {
    const user = await account(label);
    await assignAdminRole(prisma, user.id, role);
    return user;
  }

  async function submittedApplication(
    country = 'India',
    companyName: string = completeDraft.companyName,
  ) {
    const founder = await account(`app-${companyName}`);
    const application = await prisma.founderApplication.create({
      data: {
        userId: founder.id,
        ...completeDraft,
        companyName,
        country,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
    return { founder, application };
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

  it('denies unauthenticated, founder, and non-review admin roles', async () => {
    const founder = await account('plain-founder');
    await prisma.founderApplication.create({
      data: {
        userId: founder.id,
        ...completeDraft,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
    const missing = await request('/v1/admin/applications');
    expect(missing.status).toBe(401);
    const founderResponse = await request(
      '/v1/admin/applications',
      founder.cookie,
    );
    expect(founderResponse.status).toBe(403);
    await expect(founderResponse.json()).resolves.toMatchObject({
      error: { code: 'ADMIN_PERMISSION_DENIED' },
    });

    for (const role of ADMIN_NON_REVIEW_ROLE_KEYS) {
      const user = await reviewer(role);
      const response = await request('/v1/admin/applications', user.cookie);
      expect(response.status).toBe(403);
    }
  });

  it('allows APPLICATION_REVIEWER, OPERATIONS, and SUPER_ADMIN through permissions', async () => {
    const { application } = await submittedApplication();
    for (const role of [
      'APPLICATION_REVIEWER',
      'OPERATIONS',
      'SUPER_ADMIN',
    ] as const) {
      const user = await reviewer(role, `allow-${role}`);
      const queue = await request('/v1/admin/applications', user.cookie);
      expect(queue.status).toBe(200);
      const detail = await request(
        `/v1/admin/applications/${application.id}`,
        user.cookie,
      );
      expect(detail.status).toBe(200);
    }
  });

  it('allows read without approve when approve permission is absent', async () => {
    const { application } = await submittedApplication('India', 'ReadOnly Co');
    const user = await reviewer('APPLICATION_REVIEWER', 'read-only-action');
    await revokeAdminPermission(
      prisma,
      'APPLICATION_REVIEWER',
      'admin.applications.approve',
    );
    try {
      const detail = await request(
        `/v1/admin/applications/${application.id}`,
        user.cookie,
      );
      expect(detail.status).toBe(200);
      await expect(detail.json()).resolves.toMatchObject({
        capabilities: { approve: false, needsInfo: true, reject: true },
      });
      const approve = await request(
        `/v1/admin/applications/${application.id}/approve`,
        user.cookie,
        { method: 'POST', body: '{}' },
      );
      expect(approve.status).toBe(403);
      await expect(approve.json()).resolves.toMatchObject({
        error: { code: 'ADMIN_PERMISSION_DENIED' },
      });
    } finally {
      await grantAdminPermission(
        prisma,
        'APPLICATION_REVIEWER',
        'admin.applications.approve',
      );
    }
  });

  it('does not grant SUPER_ADMIN a hardcoded bypass', async () => {
    const { application } = await submittedApplication('India', 'Bypass Co');
    const user = await reviewer('SUPER_ADMIN', 'no-bypass');
    await revokeAdminPermission(
      prisma,
      'SUPER_ADMIN',
      'admin.applications.approve',
    );
    try {
      const approve = await request(
        `/v1/admin/applications/${application.id}/approve`,
        user.cookie,
        { method: 'POST', body: '{}' },
      );
      expect(approve.status).toBe(403);
    } finally {
      await grantAdminPermission(
        prisma,
        'SUPER_ADMIN',
        'admin.applications.approve',
      );
    }
  });

  it('denies users without permission before any application lookup', async () => {
    const founder = await account('probe-founder');
    const { application } = await submittedApplication('India', 'Probe Co');
    const draftFounder = await account('probe-draft');
    const draft = await prisma.founderApplication.create({
      data: { userId: draftFounder.id, ...completeDraft, status: 'DRAFT' },
    });
    const ids = [application.id, draft.id, 'does-not-exist', 'x'.repeat(65)];
    for (const id of ids) {
      const response = await request(
        `/v1/admin/applications/${id}`,
        founder.cookie,
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'ADMIN_PERMISSION_DENIED' },
      });
      const approve = await request(
        `/v1/admin/applications/${id}/approve`,
        founder.cookie,
        { method: 'POST', body: '{}' },
      );
      expect(approve.status).toBe(403);
      await expect(approve.json()).resolves.toMatchObject({
        error: { code: 'ADMIN_PERMISSION_DENIED' },
      });
    }
  });

  it('still denies missing decision permissions on a direct POST', async () => {
    const { application } = await submittedApplication('India', 'Hint Co');
    const user = await reviewer('APPLICATION_REVIEWER', 'hint-actions');
    await revokeAdminPermission(
      prisma,
      'APPLICATION_REVIEWER',
      'admin.applications.needs_info',
    );
    await revokeAdminPermission(
      prisma,
      'APPLICATION_REVIEWER',
      'admin.applications.reject',
    );
    try {
      const detail = await request(
        `/v1/admin/applications/${application.id}`,
        user.cookie,
      );
      const body = (await detail.json()) as AdminApplicationDetailResponse;
      expect(detail.status).toBe(200);
      expect(body.capabilities).toEqual({
        needsInfo: false,
        approve: true,
        reject: false,
      });
      const needsInfo = await request(
        `/v1/admin/applications/${application.id}/needs-info`,
        user.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ note: 'Need more evidence.' }),
        },
      );
      expect(needsInfo.status).toBe(403);
      const reject = await request(
        `/v1/admin/applications/${application.id}/reject`,
        user.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Not a current builder.' }),
        },
      );
      expect(reject.status).toBe(403);
    } finally {
      await grantAdminPermission(
        prisma,
        'APPLICATION_REVIEWER',
        'admin.applications.needs_info',
      );
      await grantAdminPermission(
        prisma,
        'APPLICATION_REVIEWER',
        'admin.applications.reject',
      );
    }
  });

  it('rejects expired, suspended, and deleted reviewers', async () => {
    const expired = await reviewer('APPLICATION_REVIEWER', 'expired');
    await prisma.session.updateMany({
      where: { userId: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredResponse = await request(
      '/v1/admin/applications',
      expired.cookie,
    );
    expect(expiredResponse.status).toBe(401);

    const revoked = await reviewer('APPLICATION_REVIEWER', 'revoked');
    await prisma.session.updateMany({
      where: { userId: revoked.id },
      data: { revokedAt: new Date() },
    });
    const revokedResponse = await request(
      '/v1/admin/applications',
      revoked.cookie,
    );
    expect(revokedResponse.status).toBe(401);

    const suspended = await reviewer('APPLICATION_REVIEWER', 'suspended');
    await prisma.user.update({
      where: { id: suspended.id },
      data: {
        status: 'SUSPENDED',
        suspendedUntil: new Date(Date.now() + 60_000),
      },
    });
    const suspendedResponse = await request(
      '/v1/admin/applications',
      suspended.cookie,
    );
    expect(suspendedResponse.status).toBe(403);

    const deleted = await reviewer('APPLICATION_REVIEWER', 'deleted');
    await prisma.user.update({
      where: { id: deleted.id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    const deletedResponse = await request(
      '/v1/admin/applications',
      deleted.cookie,
    );
    expect(deletedResponse.status).toBe(403);
  });

  it('lists pending applications without drafts and paginates deterministically', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'queue');
    const first = await submittedApplication('India', 'Alpha Oldest');
    await prisma.founderApplication.update({
      where: { id: first.application.id },
      data: { submittedAt: new Date('2026-09-01T00:00:00.000Z') },
    });
    const second = await submittedApplication('UAE', 'Beta Newer');
    await prisma.founderApplication.update({
      where: { id: second.application.id },
      data: { submittedAt: new Date('2026-09-02T00:00:00.000Z') },
    });
    const draftFounder = await account('draft-hidden');
    await prisma.founderApplication.create({
      data: { userId: draftFounder.id, ...completeDraft, status: 'DRAFT' },
    });

    const page1 = await request(
      '/v1/admin/applications?status=SUBMITTED&page=1',
      admin.cookie,
    );
    const body = (await page1.json()) as AdminApplicationQueueResponse;
    expect(page1.status).toBe(200);
    expect(body.pageSize).toBe(5);
    expect(body.status).toBe('SUBMITTED');
    const companyOrder = body.applications.map((item) => item.companyName);
    expect(companyOrder.indexOf('Alpha Oldest')).toBeGreaterThanOrEqual(0);
    expect(companyOrder.indexOf('Alpha Oldest')).toBeLessThan(
      companyOrder.indexOf('Beta Newer'),
    );
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    expect(JSON.stringify(body)).not.toContain('DRAFT');

    const defaultQueue = await request('/v1/admin/applications', admin.cookie);
    const defaultBody =
      (await defaultQueue.json()) as AdminApplicationQueueResponse;
    expect(defaultBody.status).toBe('SUBMITTED');

    const india = await request(
      '/v1/admin/applications?status=SUBMITTED&country=India',
      admin.cookie,
    );
    const indiaBody = (await india.json()) as AdminApplicationQueueResponse;
    expect(
      indiaBody.applications.every((item) => item.country === 'India'),
    ).toBe(true);

    const draftDetail = await request(
      `/v1/admin/applications/${(await prisma.founderApplication.findUniqueOrThrow({ where: { userId: draftFounder.id } })).id}`,
      admin.cookie,
    );
    expect(draftDetail.status).toBe(404);
  });

  it('filters queue tabs and returns 404 for unknown applications', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'tabs');
    const submitted = await submittedApplication('Germany', 'Tab Company');
    await prisma.founderApplication.update({
      where: { id: submitted.application.id },
      data: { status: 'NEEDS_INFO' },
    });
    const needsInfo = await request(
      '/v1/admin/applications?status=NEEDS_INFO',
      admin.cookie,
    );
    const needsBody = (await needsInfo.json()) as AdminApplicationQueueResponse;
    expect(
      needsBody.applications.some(
        (item) => item.id === submitted.application.id,
      ),
    ).toBe(true);

    const missing = await request(
      '/v1/admin/applications/does-not-exist',
      admin.cookie,
    );
    expect(missing.status).toBe(404);
  });

  it('paginates five applications and lists approved and rejected tabs', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'paginate');
    const country = `QueueLand-${Date.now()}`;
    for (let index = 0; index < 6; index += 1) {
      const created = await submittedApplication(
        country,
        `Page Co ${String(index).padStart(2, '0')}`,
      );
      await prisma.founderApplication.update({
        where: { id: created.application.id },
        data: {
          submittedAt: new Date(
            `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
          ),
        },
      });
    }
    const page1 = await request(
      `/v1/admin/applications?status=SUBMITTED&country=${country}&page=1`,
      admin.cookie,
    );
    const first = (await page1.json()) as AdminApplicationQueueResponse;
    expect(first.applications).toHaveLength(5);
    expect(first.total).toBe(6);
    expect(first.totalPages).toBe(2);
    expect(first.applications[0]?.companyName).toBe('Page Co 00');
    const page2 = await request(
      `/v1/admin/applications?status=SUBMITTED&country=${country}&page=2`,
      admin.cookie,
    );
    const second = (await page2.json()) as AdminApplicationQueueResponse;
    expect(second.applications).toHaveLength(1);
    expect(second.applications[0]?.companyName).toBe('Page Co 05');

    const approvedCase = await submittedApplication('Spain', 'Approved Tab Co');
    await prisma.founderApplication.update({
      where: { id: approvedCase.application.id },
      data: {
        status: 'APPROVED',
        decidedAt: new Date('2026-09-20T00:00:00.000Z'),
      },
    });
    const rejectedCase = await submittedApplication('Spain', 'Rejected Tab Co');
    await prisma.founderApplication.update({
      where: { id: rejectedCase.application.id },
      data: {
        status: 'REJECTED',
        decidedAt: new Date('2026-09-21T00:00:00.000Z'),
      },
    });
    const approved = await request(
      '/v1/admin/applications?status=APPROVED',
      admin.cookie,
    );
    const approvedBody =
      (await approved.json()) as AdminApplicationQueueResponse;
    expect(
      approvedBody.applications.some(
        (item) => item.id === approvedCase.application.id,
      ),
    ).toBe(true);
    const rejected = await request(
      '/v1/admin/applications?status=REJECTED',
      admin.cookie,
    );
    const rejectedBody =
      (await rejected.json()) as AdminApplicationQueueResponse;
    expect(
      rejectedBody.applications.some(
        (item) => item.id === rejectedCase.application.id,
      ),
    ).toBe(true);
  });

  it('returns reviewable detail fields without a fabricated name', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'detail');
    const { application, founder } = await submittedApplication();
    const response = await request(
      `/v1/admin/applications/${application.id}`,
      admin.cookie,
    );
    const body = (await response.json()) as AdminApplicationDetailResponse;
    expect(body.application.applicant.email).toContain('@example.com');
    expect(body.application.applicant.emailVerified).toBe(true);
    expect(body.application).not.toHaveProperty('displayName');
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    expect(JSON.stringify(body)).not.toContain('emailVerifiedAt');
    expect(JSON.stringify(body)).not.toContain('admin.applications');
    expect(body.capabilities).toEqual({
      needsInfo: true,
      approve: true,
      reject: true,
    });
    expect(founder.id).toBeTruthy();
  });

  it('moves SUBMITTED to NEEDS_INFO without decidedAt and keeps history', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'needs-info');
    const { application, founder } = await submittedApplication(
      'India',
      'Needs Co',
    );
    const submittedAt = application.submittedAt;
    const empty = await request(
      `/v1/admin/applications/${application.id}/needs-info`,
      admin.cookie,
      { method: 'POST', body: JSON.stringify({ note: '   ' }) },
    );
    expect(empty.status).toBe(400);

    const response = await request(
      `/v1/admin/applications/${application.id}/needs-info`,
      admin.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ note: 'Clarify the customer and stage.' }),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as AdminApplicationDetailResponse;
    expect(body.application.status).toBe('NEEDS_INFO');
    expect(body.application.decidedAt).toBeNull();
    expect(body.application.submittedAt).toBe(submittedAt?.toISOString());
    expect(body.application.latestReviewNote).toBe(
      'Clarify the customer and stage.',
    );
    expect(
      await prisma.applicationStatusEvent.count({
        where: {
          applicationId: application.id,
          fromStatus: 'SUBMITTED',
          toStatus: 'NEEDS_INFO',
          actorUserId: admin.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          targetId: application.id,
          action: 'application.needs_info',
          actorUserId: admin.id,
        },
      }),
    ).toBe(1);

    const needsInfoNotifications = await prisma.notification.findMany({
      where: {
        userId: founder.id,
        type: 'APPLICATION_NEEDS_INFO',
      },
      include: {
        deliveries: true,
      },
    });
    expect(needsInfoNotifications).toHaveLength(1);
    expect(needsInfoNotifications[0]).toMatchObject({
      type: 'APPLICATION_NEEDS_INFO',
      title: 'More information needed',
      body: 'Your application needs more information before review can continue.',
      href: '/application',
      deliveries: [
        {
          channel: 'EMAIL',
          templateVersion: 'v1',
          status: 'QUEUED',
          attemptCount: 0,
        },
      ],
    });
    expect(JSON.stringify(needsInfoNotifications)).not.toContain(
      'Clarify the customer and stage.',
    );
  });

  it('approves and rejects with decidedAt and terminal rules', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'decide');
    const approvedCase = await submittedApplication('India', 'Approve Co');
    const approve = await request(
      `/v1/admin/applications/${approvedCase.application.id}/approve`,
      admin.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(approve.status).toBe(200);
    const approved = (await approve.json()) as AdminApplicationDetailResponse;
    expect(approved.application.status).toBe('APPROVED');
    expect(approved.application.decidedAt).toBeTruthy();
    expect(approved.application.submittedAt).toBe(
      approvedCase.application.submittedAt?.toISOString(),
    );
    const again = await request(
      `/v1/admin/applications/${approvedCase.application.id}/approve`,
      admin.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(again.status).toBe(409);

    const approvedNotifications = await prisma.notification.findMany({
      where: {
        userId: approvedCase.founder.id,
        type: 'APPLICATION_APPROVED',
      },
      include: {
        deliveries: true,
      },
    });
    expect(approvedNotifications).toHaveLength(1);
    expect(approvedNotifications[0]).toMatchObject({
      type: 'APPLICATION_APPROVED',
      title: 'Application approved',
      body: 'Your FounderChatters application has been approved.',
      href: '/application',
      deliveries: [
        {
          channel: 'EMAIL',
          templateVersion: 'v1',
          status: 'QUEUED',
          attemptCount: 0,
        },
      ],
    });

    const rejectedCase = await submittedApplication('India', 'Reject Co');
    const reject = await request(
      `/v1/admin/applications/${rejectedCase.application.id}/reject`,
      admin.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'Not a current builder.' }),
      },
    );
    expect(reject.status).toBe(200);
    const rejected = (await reject.json()) as AdminApplicationDetailResponse;
    expect(rejected.application.status).toBe('REJECTED');
    expect(rejected.application.decidedAt).toBeTruthy();
    expect(
      await prisma.auditLog.count({
        where: {
          targetId: rejectedCase.application.id,
          action: 'application.rejected',
        },
      }),
    ).toBe(1);

    const rejectedNotifications = await prisma.notification.findMany({
      where: {
        userId: rejectedCase.founder.id,
        type: 'APPLICATION_REJECTED',
      },
      include: {
        deliveries: true,
      },
    });
    expect(rejectedNotifications).toHaveLength(1);
    expect(rejectedNotifications[0]).toMatchObject({
      type: 'APPLICATION_REJECTED',
      title: 'Application not approved',
      body: 'Your FounderChatters application was not approved.',
      href: '/application',
      deliveries: [
        {
          channel: 'EMAIL',
          templateVersion: 'v1',
          status: 'QUEUED',
          attemptCount: 0,
        },
      ],
    });
    expect(JSON.stringify(rejectedNotifications)).not.toContain(
      'Not a current builder.',
    );
  });

  it('rejects origin-less mutations and invalid states from NEEDS_INFO', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'invalid');
    const { application } = await submittedApplication('India', 'Origin Co');
    const origin = await request(
      `/v1/admin/applications/${application.id}/approve`,
      admin.cookie,
      { method: 'POST', body: '{}' },
      'https://attacker.example',
    );
    expect(origin.status).toBe(403);

    await prisma.founderApplication.update({
      where: { id: application.id },
      data: { status: 'NEEDS_INFO' },
    });
    const needsInfoApprove = await request(
      `/v1/admin/applications/${application.id}/approve`,
      admin.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(needsInfoApprove.status).toBe(409);
  });

  it('allows only one concurrent admin decision and one audit/event pair', async () => {
    const first = await reviewer('APPLICATION_REVIEWER', 'race-a');
    const second = await reviewer('OPERATIONS', 'race-b');
    const { application } = await submittedApplication('India', 'Race Co');

    const responses = await Promise.all([
      request(
        `/v1/admin/applications/${application.id}/approve`,
        first.cookie,
        {
          method: 'POST',
          body: '{}',
        },
      ),
      request(
        `/v1/admin/applications/${application.id}/reject`,
        second.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Too early.' }),
        },
      ),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const loser = responses.find((response) => response.status === 409);
    await expect(loser?.json()).resolves.toMatchObject({
      error: { code: 'ADMIN_ACTION_INVALID_STATE' },
    });
    const updated = await prisma.founderApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(['APPROVED', 'REJECTED']).toContain(updated.status);
    expect(updated.decidedAt).toBeInstanceOf(Date);
    expect(updated.submittedAt?.toISOString()).toBe(
      application.submittedAt?.toISOString(),
    );
    expect(
      await prisma.applicationStatusEvent.count({
        where: { applicationId: application.id, fromStatus: 'SUBMITTED' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { targetId: application.id },
      }),
    ).toBe(1);
  });

  it('allows only one concurrent needs-info or approve decision', async () => {
    const first = await reviewer('APPLICATION_REVIEWER', 'race-info-a');
    const second = await reviewer('OPERATIONS', 'race-info-b');
    const { application } = await submittedApplication('India', 'Race Info');
    const responses = await Promise.all([
      request(
        `/v1/admin/applications/${application.id}/needs-info`,
        first.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ note: 'Need a clearer customer.' }),
        },
      ),
      request(
        `/v1/admin/applications/${application.id}/approve`,
        second.cookie,
        { method: 'POST', body: '{}' },
      ),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const updated = await prisma.founderApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(['NEEDS_INFO', 'APPROVED']).toContain(updated.status);
    if (updated.status === 'NEEDS_INFO') {
      expect(updated.decidedAt).toBeNull();
    } else {
      expect(updated.decidedAt).toBeInstanceOf(Date);
    }
    expect(
      await prisma.auditLog.count({ where: { targetId: application.id } }),
    ).toBe(1);
  });

  it('allows only one concurrent duplicate or reject/needs-info decision', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'dup-a');
    const other = await reviewer('OPERATIONS', 'dup-b');
    const duplicate = await submittedApplication('India', 'Dup Approve');
    const duplicates = await Promise.all([
      request(
        `/v1/admin/applications/${duplicate.application.id}/approve`,
        admin.cookie,
        { method: 'POST', body: '{}' },
      ),
      request(
        `/v1/admin/applications/${duplicate.application.id}/approve`,
        other.cookie,
        { method: 'POST', body: '{}' },
      ),
    ]);
    expect(duplicates.map(({ status }) => status).sort()).toEqual([200, 409]);

    const mixed = await submittedApplication('India', 'Dup Mixed');
    const mixedResponses = await Promise.all([
      request(
        `/v1/admin/applications/${mixed.application.id}/reject`,
        admin.cookie,
        { method: 'POST', body: JSON.stringify({ reason: 'Not a fit.' }) },
      ),
      request(
        `/v1/admin/applications/${mixed.application.id}/needs-info`,
        other.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ note: 'Need more context.' }),
        },
      ),
    ]);
    expect(mixedResponses.map(({ status }) => status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      await prisma.auditLog.count({
        where: { targetId: mixed.application.id },
      }),
    ).toBe(1);

    const duplicateInfo = await submittedApplication('India', 'Dup Info');
    const infoResponses = await Promise.all([
      request(
        `/v1/admin/applications/${duplicateInfo.application.id}/needs-info`,
        admin.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ note: 'Need a clearer product.' }),
        },
      ),
      request(
        `/v1/admin/applications/${duplicateInfo.application.id}/needs-info`,
        other.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ note: 'Need a clearer customer.' }),
        },
      ),
    ]);
    expect(infoResponses.map(({ status }) => status).sort()).toEqual([
      200, 409,
    ]);
  });

  it('lets OPERATIONS approve through permissions rather than role name', async () => {
    const admin = await reviewer('OPERATIONS', 'ops-action');
    const { application } = await submittedApplication('India', 'Ops Co');
    const response = await request(
      `/v1/admin/applications/${application.id}/approve`,
      admin.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(response.status).toBe(200);
  });

  it('keeps founder access-state ONBOARDING after approval', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'onboarding-state');
    const { application, founder } = await submittedApplication(
      'India',
      'Access Co',
    );
    await request(
      `/v1/admin/applications/${application.id}/approve`,
      admin.cookie,
      { method: 'POST', body: '{}' },
    );
    const session = await request('/v1/auth/session', founder.cookie);
    await expect(session.json()).resolves.toMatchObject({
      access: { state: 'ONBOARDING', applicationStatus: 'APPROVED' },
    });
  });

  it('rolls back status, event, and audit when the audit write fails', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'rollback');
    const { application } = await submittedApplication('India', 'Rollback Co');
    const originalTransaction = prisma.$transaction.bind(prisma);
    prisma.$transaction = (async (operation: unknown, options?: unknown) => {
      if (typeof operation !== 'function') {
        return originalTransaction(operation as never, options as never);
      }
      return originalTransaction(async (transaction) => {
        transaction.auditLog.create = (async () => {
          throw new Error('forced audit failure');
        }) as unknown as typeof transaction.auditLog.create;
        return (operation as (client: typeof transaction) => Promise<unknown>)(
          transaction,
        );
      }, options as never);
    }) as typeof prisma.$transaction;
    try {
      const response = await request(
        `/v1/admin/applications/${application.id}/approve`,
        admin.cookie,
        { method: 'POST', body: '{}' },
      );
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('forced audit failure');
      expect(JSON.stringify(body)).not.toMatch(/P20\d{2}/);
    } finally {
      prisma.$transaction = originalTransaction;
    }
    const updated = await prisma.founderApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(updated.status).toBe('SUBMITTED');
    expect(updated.decidedAt).toBeNull();
    expect(updated.submittedAt?.toISOString()).toBe(
      application.submittedAt?.toISOString(),
    );
    expect(
      await prisma.applicationStatusEvent.count({
        where: { applicationId: application.id },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { targetId: application.id } }),
    ).toBe(0);
  });

  it('rejects mass-assigned decision fields', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'mass-assign');
    const { application } = await submittedApplication('India', 'Mass Co');
    const malicious = {
      status: 'APPROVED',
      decidedAt: '2020-01-01T00:00:00.000Z',
      submittedAt: '2020-01-01T00:00:00.000Z',
      actorUserId: 'attacker',
      userId: 'attacker',
      applicationId: 'other-id',
      note: 'Please add the customer.',
      reason: 'Not a fit.',
    };
    const needsInfo = await request(
      `/v1/admin/applications/${application.id}/needs-info`,
      admin.cookie,
      { method: 'POST', body: JSON.stringify(malicious) },
    );
    expect(needsInfo.status).toBe(400);
    const approve = await request(
      `/v1/admin/applications/${application.id}/approve`,
      admin.cookie,
      { method: 'POST', body: JSON.stringify(malicious) },
    );
    expect(approve.status).toBe(400);
    const reject = await request(
      `/v1/admin/applications/${application.id}/reject`,
      admin.cookie,
      { method: 'POST', body: JSON.stringify(malicious) },
    );
    expect(reject.status).toBe(400);
    const unchanged = await prisma.founderApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(unchanged.status).toBe('SUBMITTED');
    expect(unchanged.decidedAt).toBeNull();
  });

  it('validates queue query parameters and malformed ids safely', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'query-validation');
    const invalidPage = await request(
      '/v1/admin/applications?page=0',
      admin.cookie,
    );
    expect(invalidPage.status).toBe(400);
    const hugePage = await request(
      '/v1/admin/applications?page=10001',
      admin.cookie,
    );
    expect(hugePage.status).toBe(400);
    const unknownStatus = await request(
      '/v1/admin/applications?status=DRAFT',
      admin.cookie,
    );
    expect(unknownStatus.status).toBe(400);
    const longCountry = await request(
      `/v1/admin/applications?country=${'x'.repeat(101)}`,
      admin.cookie,
    );
    expect(longCountry.status).toBe(400);
    const malformed = await request(
      `/v1/admin/applications/${'x'.repeat(65)}`,
      admin.cookie,
    );
    expect(malformed.status).toBe(404);
    const missing = await request(
      '/v1/admin/applications/does-not-exist',
      admin.cookie,
    );
    expect(missing.status).toBe(404);
    const missingBody = (await missing.json()) as {
      error?: { code?: string; message?: string };
    };
    expect(missingBody.error?.code).toBe('APPLICATION_NOT_FOUND');
    expect(JSON.stringify(missingBody)).not.toMatch(/P20\d{2}|prisma/i);
  });

  it('pages equal timestamps with a stable id tie-breaker', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'stable-order');
    const country = `StableLand-${Date.now()}`;
    const submittedAt = new Date('2026-07-01T00:00:00.000Z');
    const ids: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const created = await submittedApplication(
        country,
        `Stable Co ${String(index).padStart(2, '0')}`,
      );
      await prisma.founderApplication.update({
        where: { id: created.application.id },
        data: { submittedAt },
      });
      ids.push(created.application.id);
    }
    ids.sort();
    const page1 = await request(
      `/v1/admin/applications?status=SUBMITTED&country=${country}&page=1`,
      admin.cookie,
    );
    const first = (await page1.json()) as AdminApplicationQueueResponse;
    const page2 = await request(
      `/v1/admin/applications?status=SUBMITTED&country=${country}&page=2`,
      admin.cookie,
    );
    const second = (await page2.json()) as AdminApplicationQueueResponse;
    const returned = [...first.applications, ...second.applications].map(
      (item) => item.id,
    );
    expect(returned).toEqual(ids);
    expect(new Set(returned).size).toBe(6);
  });

  it('does not leak a stale needs-info note onto a later approval', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'stale-note');
    const { application, founder } = await submittedApplication(
      'India',
      'Stale Note Co',
    );
    await request(
      `/v1/admin/applications/${application.id}/needs-info`,
      admin.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ note: 'Clarify the customer.' }),
      },
    );
    const founderNeedsInfo = await request(
      '/v1/application/me',
      founder.cookie,
    );
    const founderBody = (await founderNeedsInfo.json()) as {
      application?: {
        needsInfoNote?: string | null;
        actorUserId?: string;
      };
    };
    expect(founderBody.application?.needsInfoNote).toBe(
      'Clarify the customer.',
    );
    expect(founderBody.application).not.toHaveProperty('actorUserId');
    expect(JSON.stringify(founderBody)).not.toContain(admin.id);

    const notificationsBeforeResubmit = await prisma.notification.count({
      where: {
        userId: founder.id,
      },
    });

    const resubmit = await request(
      '/v1/application/me/resubmit',
      founder.cookie,
      {
        method: 'POST',
        body: '{}',
      },
    );
    expect(resubmit.status).toBe(200);

    expect(
      await prisma.notification.count({
        where: {
          userId: founder.id,
        },
      }),
    ).toBe(notificationsBeforeResubmit);

    await request(
      `/v1/admin/applications/${application.id}/approve`,
      admin.cookie,
      { method: 'POST', body: '{}' },
    );
    const detail = await request(
      `/v1/admin/applications/${application.id}`,
      admin.cookie,
    );
    const body = (await detail.json()) as AdminApplicationDetailResponse;
    expect(body.application.status).toBe('APPROVED');
    expect(body.application.latestReviewNote).toBeNull();
  });

  it('allows only one concurrent duplicate reject', async () => {
    const admin = await reviewer('APPLICATION_REVIEWER', 'dup-reject-a');
    const other = await reviewer('OPERATIONS', 'dup-reject-b');
    const { application } = await submittedApplication('India', 'Dup Reject');
    const responses = await Promise.all([
      request(`/v1/admin/applications/${application.id}/reject`, admin.cookie, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Not a current builder.' }),
      }),
      request(`/v1/admin/applications/${application.id}/reject`, other.cookie, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Too early.' }),
      }),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      await prisma.applicationStatusEvent.count({
        where: { applicationId: application.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { targetId: application.id } }),
    ).toBe(1);
  });
});
