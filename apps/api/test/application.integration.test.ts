import type { AddressInfo } from 'node:net';

import type {
  ApiErrorResponse,
  AuthSessionResponse,
  FounderApplicationResponse,
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

const completeDraft = {
  eligibilityRole: 'FOUNDER_COFOUNDER',
  companyName: 'FounderChatters',
  roleTitle: 'Founder',
  website: 'https://founderchatters.com',
  city: 'Delhi',
  country: 'India',
  buildingSummary:
    'A focused founder support network for useful founder conversations.',
} as const;

describe('founder application HTTP integration', () => {
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
        await prisma.applicationStatusEvent.deleteMany({
          where: { applicationId: { in: applicationIds } },
        });
        await prisma.founderApplication.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app.close();
    }
  });

  async function founder(
    label: string,
    verified = true,
  ): Promise<{ id: string; cookie: string }> {
    const user = await prisma.user.create({
      data: {
        email: `fc007-${label}-${Date.now()}-${userIds.length}@example.com`,
        passwordHash: '$argon2id$test-only',
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
    userIds.push(user.id);
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-007 integration test',
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

  it('creates, updates, and reads only the authenticated founder application', async () => {
    const owner = await founder('owner');
    const other = await founder('other');
    const missing = await request('/v1/application/me', owner.cookie);
    const missingBody = (await missing.json()) as ApiErrorResponse;
    expect(missing.status).toBe(404);
    expect(missingBody).toMatchObject({
      error: {
        code: 'APPLICATION_NOT_FOUND',
        requestId: expect.any(String),
        fieldErrors: {},
      },
    });
    expect(missing.headers.get('x-request-id')).toBe(
      missingBody.error.requestId,
    );

    const create = await request('/v1/application/me', owner.cookie, {
      method: 'PUT',
      body: JSON.stringify({
        eligibilityRole: completeDraft.eligibilityRole,
        companyName: '  FounderChatters   Labs  ',
      }),
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as FounderApplicationResponse;
    expect(created.application).toMatchObject({
      status: 'DRAFT',
      companyName: 'FounderChatters Labs',
    });

    const update = await request('/v1/application/me', owner.cookie, {
      method: 'PUT',
      body: JSON.stringify(completeDraft),
    });
    expect(update.status).toBe(200);
    await prisma.founderApplication.create({
      data: {
        userId: other.id,
        eligibilityRole: 'FOUNDING_TEAM_OPERATOR',
        companyName: 'Other Company',
      },
    });

    const getMine = await request('/v1/application/me', owner.cookie);
    const mine = (await getMine.json()) as FounderApplicationResponse;
    expect(getMine.status).toBe(200);
    expect(mine.application.id).toBe(created.application.id);
    expect(mine.application.companyName).toBe('FounderChatters');
    expect(JSON.stringify(mine)).not.toContain('Other Company');
    expect(JSON.stringify(mine)).not.toContain('actorUserId');
  });

  it('rejects protected assignment and untrusted origins safely', async () => {
    const user = await founder('mass-assignment');
    const protectedResponse = await request('/v1/application/me', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({
        ...completeDraft,
        id: 'forged-application',
        status: 'APPROVED',
        userId: 'another-user',
        submittedAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
      }),
    });
    expect(protectedResponse.status).toBe(400);
    await expect(protectedResponse.json()).resolves.toMatchObject({
      error: {
        code: 'APPLICATION_INVALID_STATE',
        requestId: expect.any(String),
        fieldErrors: {
          id: expect.any(Array),
          status: expect.any(Array),
          userId: expect.any(Array),
          submittedAt: expect.any(Array),
          decidedAt: expect.any(Array),
        },
      },
    });
    expect(
      await prisma.founderApplication.findUnique({
        where: { userId: user.id },
      }),
    ).toBeNull();

    const originResponse = await request(
      '/v1/application/me',
      user.cookie,
      { method: 'PUT', body: JSON.stringify(completeDraft) },
      'https://attacker.example',
    );
    expect(originResponse.status).toBe(403);
  });

  it('allows only one concurrent initial submission and one status event', async () => {
    const user = await founder('submit-race');
    await request('/v1/application/me', user.cookie, {
      method: 'PUT',
      body: JSON.stringify(completeDraft),
    });

    const responses = await Promise.all([
      request('/v1/application/me/submit', user.cookie, {
        method: 'POST',
        body: '{}',
      }),
      request('/v1/application/me/submit', user.cookie, {
        method: 'POST',
        body: '{}',
      }),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const application = await prisma.founderApplication.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(application.status).toBe('SUBMITTED');
    expect(application.submittedAt).toBeInstanceOf(Date);
    expect(application.decidedAt).toBeNull();
    expect(
      await prisma.applicationStatusEvent.count({
        where: {
          applicationId: application.id,
          fromStatus: 'DRAFT',
          toStatus: 'SUBMITTED',
          actorUserId: user.id,
        },
      }),
    ).toBe(1);
  });

  it('supports NEEDS_INFO editing and only one concurrent resubmission', async () => {
    const user = await founder('resubmit-race');
    await request('/v1/application/me', user.cookie, {
      method: 'PUT',
      body: JSON.stringify(completeDraft),
    });
    const application = await prisma.founderApplication.update({
      where: { userId: user.id },
      data: { status: 'NEEDS_INFO' },
    });
    await prisma.applicationStatusEvent.create({
      data: {
        applicationId: application.id,
        fromStatus: 'SUBMITTED',
        toStatus: 'NEEDS_INFO',
        actorUserId: user.id,
        note: 'Clarify the customer and current stage.',
      },
    });

    const needsInfo = await request('/v1/application/me', user.cookie);
    await expect(needsInfo.json()).resolves.toMatchObject({
      application: {
        status: 'NEEDS_INFO',
        needsInfoNote: 'Clarify the customer and current stage.',
      },
    });
    const edit = await request('/v1/application/me', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({
        buildingSummary:
          'A revised description of the customer, product, and current stage.',
      }),
    });
    expect(edit.status).toBe(200);

    const responses = await Promise.all([
      request('/v1/application/me/resubmit', user.cookie, {
        method: 'POST',
        body: '{}',
      }),
      request('/v1/application/me/resubmit', user.cookie, {
        method: 'POST',
        body: '{}',
      }),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const updated = await prisma.founderApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(updated).toMatchObject({ status: 'SUBMITTED', decidedAt: null });
    expect(updated.submittedAt).toBeInstanceOf(Date);
    expect(
      await prisma.applicationStatusEvent.count({
        where: {
          applicationId: application.id,
          fromStatus: 'SUBMITTED',
          toStatus: 'NEEDS_INFO',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.applicationStatusEvent.count({
        where: {
          applicationId: application.id,
          fromStatus: 'NEEDS_INFO',
          toStatus: 'SUBMITTED',
          actorUserId: user.id,
        },
      }),
    ).toBe(1);
  });

  it('rejects unverified, invalid-session, suspended, and deleted access', async () => {
    const unverified = await founder('unverified', false);
    const unverifiedResponse = await request(
      '/v1/application/me',
      unverified.cookie,
    );
    expect(unverifiedResponse.status).toBe(403);
    await expect(unverifiedResponse.json()).resolves.toMatchObject({
      error: { code: 'AUTH_EMAIL_NOT_VERIFIED' },
    });
    const unverifiedSession = (await (
      await request('/v1/auth/session', unverified.cookie)
    ).json()) as AuthSessionResponse;
    expect(unverifiedSession.access.state).toBe('VERIFY_EMAIL');

    const invalid = await request(
      '/v1/application/me',
      `${config.sessionCookieName}=invalid`,
    );
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: 'AUTH_SESSION_EXPIRED' },
    });

    const expired = await founder('expired');
    await prisma.session.updateMany({
      where: { userId: expired.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expiredResponse = await request('/v1/application/me', expired.cookie);
    expect(expiredResponse.status).toBe(401);
    await expect(expiredResponse.json()).resolves.toMatchObject({
      error: { code: 'AUTH_SESSION_EXPIRED' },
    });

    for (const status of ['SUSPENDED', 'DELETED'] as const) {
      const blocked = await founder(status.toLowerCase());
      await prisma.user.update({
        where: { id: blocked.id },
        data: {
          status,
          ...(status === 'SUSPENDED'
            ? { suspendedUntil: new Date(Date.now() + 60_000) }
            : { deletedAt: new Date() }),
        },
      });
      const response = await request('/v1/application/me', blocked.cookie);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code:
            status === 'SUSPENDED'
              ? 'AUTH_ACCOUNT_SUSPENDED'
              : 'AUTH_FORBIDDEN',
        },
      });
    }
  });

  it('derives access state from every founder application status', async () => {
    const user = await founder('access-state');
    const application = await prisma.founderApplication.create({
      data: { userId: user.id, ...completeDraft },
    });

    for (const status of [
      'DRAFT',
      'SUBMITTED',
      'NEEDS_INFO',
      'REJECTED',
    ] as const) {
      await prisma.founderApplication.update({
        where: { id: application.id },
        data: { status },
      });
      const response = await request('/v1/auth/session', user.cookie);
      const body = (await response.json()) as AuthSessionResponse;
      expect(body.access).toMatchObject({
        state: 'APPLICATION',
        applicationStatus: status,
      });
    }

    await prisma.founderApplication.update({
      where: { id: application.id },
      data: { status: 'APPROVED' },
    });
    const approved = (await (
      await request('/v1/auth/session', user.cookie)
    ).json()) as AuthSessionResponse;
    expect(approved.access).toMatchObject({
      state: 'ONBOARDING',
      applicationStatus: 'APPROVED',
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { onboardingCompletedAt: new Date() },
    });
    const active = (await (
      await request('/v1/auth/session', user.cookie)
    ).json()) as AuthSessionResponse;
    expect(active.access).toMatchObject({
      state: 'ACTIVE',
      applicationStatus: 'APPROVED',
    });
  });

  it('creates exactly one application for concurrent first PUT requests', async () => {
    const user = await founder('create-race');
    const responses = await Promise.all([
      request('/v1/application/me', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({
          eligibilityRole: 'FOUNDER_COFOUNDER',
          companyName: 'Alpha Labs',
        }),
      }),
      request('/v1/application/me', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({
          eligibilityRole: 'FOUNDING_TEAM_OPERATOR',
          companyName: 'Beta Labs',
        }),
      }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses.some((response) => response.status >= 500)).toBe(false);

    const bodies = (await Promise.all(
      responses.map((response) => response.json()),
    )) as FounderApplicationResponse[];
    expect(new Set(bodies.map((body) => body.application.id)).size).toBe(1);
    expect(bodies.every((body) => body.application.status === 'DRAFT')).toBe(
      true,
    );
    expect(bodies.every((body) => body.application.submittedAt === null)).toBe(
      true,
    );

    const applications = await prisma.founderApplication.findMany({
      where: { userId: user.id },
    });
    expect(applications).toHaveLength(1);
    expect(['Alpha Labs', 'Beta Labs']).toContain(applications[0]?.companyName);
    expect(applications[0]?.status).toBe('DRAFT');
  });

  it('rejects founder edits and resubmits after approval or rejection', async () => {
    for (const status of ['APPROVED', 'REJECTED'] as const) {
      const user = await founder(status.toLowerCase());
      await prisma.founderApplication.create({
        data: { userId: user.id, ...completeDraft, status },
      });
      const edit = await request('/v1/application/me', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({ companyName: 'Changed' }),
      });
      expect(edit.status).toBe(409);
      await expect(edit.json()).resolves.toMatchObject({
        error: { code: 'APPLICATION_INVALID_STATE' },
      });
      const resubmit = await request(
        '/v1/application/me/resubmit',
        user.cookie,
        {
          method: 'POST',
          body: '{}',
        },
      );
      expect(resubmit.status).toBe(409);
      const application = await prisma.founderApplication.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(application.status).toBe(status);
      expect(application.companyName).toBe('FounderChatters');
    }
  });

  it('allows NOT_CURRENTLY_BUILDING as draft but rejects submit', async () => {
    const user = await founder('not-building');
    const draft = await request('/v1/application/me', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({
        ...completeDraft,
        eligibilityRole: 'NOT_CURRENTLY_BUILDING',
      }),
    });
    expect(draft.status).toBe(200);
    const saved = (await draft.json()) as FounderApplicationResponse;
    expect(saved.application).toMatchObject({
      status: 'DRAFT',
      eligibilityRole: 'NOT_CURRENTLY_BUILDING',
      submittedAt: null,
    });

    const submit = await request('/v1/application/me/submit', user.cookie, {
      method: 'POST',
      body: '{}',
    });
    expect(submit.status).toBe(400);
    await expect(submit.json()).resolves.toMatchObject({
      error: {
        code: 'APPLICATION_INVALID_STATE',
        fieldErrors: { eligibilityRole: expect.any(Array) },
      },
    });

    const application = await prisma.founderApplication.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(application.status).toBe('DRAFT');
    expect(application.submittedAt).toBeNull();
    expect(
      await prisma.applicationStatusEvent.count({
        where: { applicationId: application.id },
      }),
    ).toBe(0);
  });
});
