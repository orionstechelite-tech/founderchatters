import type { AddressInfo } from 'node:net';

import type {
  MemberRequestResponse,
  OwnRequestsResponse,
} from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { SessionService } from '../src/auth/session.service.js';
import { AppConfig } from '../src/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { ensureOnboardingTaxonomy } from '../src/onboarding/taxonomy-seed.js';

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

const HEADLINE = 'Looking for UAE B2B launch help';
const CONTEXT =
  'We are entering the UAE next quarter and want practical partner-acquisition lessons from founders who have done it.';

describe('requests HTTP integration', { timeout: 60_000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessions: SessionService;
  let config: AppConfig;
  let baseUrl: string;
  const userIds: string[] = [];
  const extraTopicIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
    config = app.get(AppConfig);
    await ensureOnboardingTaxonomy(prisma, true);
  }, 60_000);

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await prisma.requestResponse.deleteMany({
          where: {
            OR: [
              { authorId: { in: userIds } },
              { request: { authorId: { in: userIds } } },
            ],
          },
        });
        await prisma.requestTopic.deleteMany({
          where: { request: { authorId: { in: userIds } } },
        });
        await prisma.request.deleteMany({
          where: { authorId: { in: userIds } },
        });
        if (extraTopicIds.length > 0) {
          await prisma.taxonomyTopic.deleteMany({
            where: { id: { in: extraTopicIds } },
          });
        }
        const profiles = await prisma.founderProfile.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const profileIds = profiles.map(({ id }) => id);
        await prisma.founderExpertise.deleteMany({
          where: { profileId: { in: profileIds } },
        });
        await prisma.founderNeed.deleteMany({
          where: { profileId: { in: profileIds } },
        });
        await prisma.company.deleteMany({
          where: { founderProfileId: { in: profileIds } },
        });
        await prisma.founderProfile.deleteMany({
          where: { userId: { in: userIds } },
        });
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
  }, 60_000);

  async function member(
    label: string,
    extras: {
      verified?: boolean;
      status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
      applicationStatus?:
        'DRAFT' | 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED';
      onboarded?: boolean;
      displayName?: string;
    } = {},
  ): Promise<{ id: string; cookie: string; email: string }> {
    const onboarded = extras.onboarded ?? true;
    const user = await prisma.user.create({
      data: {
        email: `fc011-${label}-${Date.now()}-${userIds.length}@example.com`,
        passwordHash: '$argon2id$test-only',
        emailVerifiedAt: extras.verified === false ? null : new Date(),
        status: extras.status ?? 'ACTIVE',
        deletedAt: extras.status === 'DELETED' ? new Date() : null,
        onboardingCompletedAt: onboarded
          ? new Date('2026-03-15T00:00:00.000Z')
          : null,
        application: {
          create: {
            status: extras.applicationStatus ?? 'APPROVED',
            eligibilityRole: 'FOUNDER_COFOUNDER',
            companyName: 'Hidden Application Co',
            roleTitle: 'Secret Role',
            city: 'HiddenCity',
            country: 'Hiddenland',
            buildingSummary: 'Admission only.',
            submittedAt: new Date('2020-01-02T00:00:00.000Z'),
            decidedAt: new Date('2020-01-03T00:00:00.000Z'),
          },
        },
      },
    });
    userIds.push(user.id);
    const profile = await prisma.founderProfile.create({
      data: {
        userId: user.id,
        displayName: extras.displayName ?? `Founder ${label}`,
        city: 'Dubai',
        country: 'UAE',
      },
    });
    await prisma.company.create({
      data: {
        founderProfileId: profile.id,
        name: `${label} Co`,
        industry: 'Marketplace',
        stage: 'Seed',
        city: 'Dubai',
        country: 'UAE',
      },
    });
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-011 integration test',
    });
    return {
      id: user.id,
      cookie: `${config.sessionCookieName}=${session.rawToken}`,
      email: user.email,
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

  async function topicId(slug: string): Promise<string> {
    const topic = await prisma.taxonomyTopic.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    });
    return topic.id;
  }

  function publishable(overrides: Record<string, unknown> = {}) {
    return {
      type: 'ASK',
      headline: HEADLINE,
      context: CONTEXT,
      whoCouldHelp: 'Founders with UAE B2B GTM experience',
      urgency: 'THIS_WEEK',
      topicIds: [] as string[],
      ...overrides,
    };
  }

  function leakHaystack(payload: unknown): string {
    return JSON.stringify(payload);
  }

  function expectMinimized(payload: unknown) {
    const raw = leakHaystack(payload);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('Secret Role');
    expect(raw).not.toContain('roleTitle');
    expect(raw).not.toContain('Hidden Application Co');
    expect(raw).not.toContain('HiddenCity');
    expect(raw).not.toContain('eligibilityRole');
    expect(raw).not.toContain('suspensionReason');
    expect(raw).not.toContain('tokenHash');
    expect(raw).not.toContain('emailVerifiedAt');
    expect(raw).not.toContain('onboardingCompletedAt');
    expect(raw).not.toContain('suspendedUntil');
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('"application"');
    expect(raw).not.toMatch(/fc011-[a-z0-9-]+@example\.com/);
  }

  it('requires an ACTIVE member for request APIs', async () => {
    expect((await request('/v1/requests')).status).toBe(401);
    const unverified = await member('unverified', { verified: false });
    expect((await request('/v1/requests', unverified.cookie)).status).toBe(403);
    const incomplete = await member('incomplete', { onboarded: false });
    expect((await request('/v1/requests', incomplete.cookie)).status).toBe(403);
    const unapproved = await member('unapproved', {
      applicationStatus: 'SUBMITTED',
    });
    expect((await request('/v1/requests', unapproved.cookie)).status).toBe(403);
    const suspended = await member('suspended', { status: 'SUSPENDED' });
    expect((await request('/v1/requests', suspended.cookie)).status).toBe(403);
    const deleted = await member('deleted', { status: 'DELETED' });
    expect((await request('/v1/requests', deleted.cookie)).status).toBe(403);
  });

  it('creates one incomplete draft from the session and rejects a second draft', async () => {
    const author = await member('draft-author');
    const created = await request('/v1/requests', author.cookie, {
      method: 'POST',
      body: JSON.stringify({ type: 'ASK' }),
    });
    expect(created.status).toBe(201);
    const payload = await json<MemberRequestResponse>(created);
    expect(payload.request.status).toBe('DRAFT');
    expect(payload.request.author.id).toBe(author.id);
    expect(payload.request.headline).toBe('');
    expect(payload.request.context).toBe('');
    expect(payload.request.urgency).toBeNull();
    expectMinimized(payload);

    const conflict = await request('/v1/requests', author.cookie, {
      method: 'POST',
      body: JSON.stringify({ type: 'FEEDBACK', headline: 'Second draft' }),
    });
    expect(conflict.status).toBe(409);
    const error = await json<{
      error: {
        code: string;
        message: string;
        fieldErrors: Record<string, string[]>;
      };
    }>(conflict);
    expect(error.error.code).toBe('REQUEST_INVALID_STATE');
    expect(error.error.message).not.toContain(payload.request.id);
    expect(error.error.message).not.toContain('Second draft');
    expect(JSON.stringify(error)).not.toContain(payload.request.id);
    expect(error.error.fieldErrors).toEqual({});
    expect(
      await prisma.request.count({
        where: { authorId: author.id, status: 'DRAFT' },
      }),
    ).toBe(1);

    const forged = await request('/v1/requests', author.cookie, {
      method: 'POST',
      body: JSON.stringify({
        type: 'ASK',
        authorId: 'other-user',
        status: 'PUBLISHED',
        publishedAt: '2020-01-01T00:00:00.000Z',
      }),
    });
    expect(forged.status).toBe(400);
    expect((await json<{ error: { code: string } }>(forged)).error.code).toBe(
      'REQUEST_INVALID_INPUT',
    );

    const originDenied = await request(
      '/v1/requests',
      author.cookie,
      { method: 'POST', body: JSON.stringify({ type: 'ASK' }) },
      'http://evil.example',
    );
    expect(originDenied.status).toBe(403);
  });

  it('does not leave multiple drafts under concurrent create', async () => {
    const author = await member('draft-race');
    const [first, second] = await Promise.all([
      request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify({ type: 'ASK', headline: 'Race A' }),
      }),
      request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify({ type: 'ASK', headline: 'Race B' }),
      }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect([first.status, second.status].includes(500)).toBe(false);
    const bodies = await Promise.all([
      json<{ error?: { code?: string } }>(first),
      json<{ error?: { code?: string } }>(second),
    ]);
    expect(JSON.stringify(bodies)).not.toMatch(/P20\d{2}/);
    expect(
      await prisma.request.count({
        where: { authorId: author.id, status: 'DRAFT' },
      }),
    ).toBe(1);
  });

  it('lets two different authors create drafts concurrently', async () => {
    const left = await member('peer-a');
    const right = await member('peer-b');
    const [first, second] = await Promise.all([
      request('/v1/requests', left.cookie, {
        method: 'POST',
        body: JSON.stringify({ type: 'ASK', headline: 'Peer draft A' }),
      }),
      request('/v1/requests', right.cookie, {
        method: 'POST',
        body: JSON.stringify({
          type: 'COLLABORATION',
          headline: 'Peer draft B',
        }),
      }),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(
      await prisma.request.count({
        where: { authorId: { in: [left.id, right.id] }, status: 'DRAFT' },
      }),
    ).toBe(2);
  });

  it('lists only the caller own member-relevant requests with pagination', async () => {
    const author = await member('lister');
    const other = await member('other-lister');
    await request('/v1/requests', other.cookie, {
      method: 'POST',
      body: JSON.stringify({ type: 'ASK', headline: 'Other draft headline' }),
    });
    const first = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify({ type: 'ASK', headline: 'Own draft headline' }),
      }),
    );
    await request(`/v1/requests/${first.request.id}`, author.cookie, {
      method: 'PATCH',
      body: JSON.stringify(publishable()),
    });
    await request(`/v1/requests/${first.request.id}/publish`, author.cookie, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const list = await json<OwnRequestsResponse>(
      await request('/v1/requests?status=PUBLISHED', author.cookie),
    );
    expect(list.requests).toHaveLength(1);
    expect(list.requests[0]?.id).toBe(first.request.id);
    expect(list.requests.some((row) => row.author.id === other.id)).toBe(false);
    const otherPublished = await prisma.request.create({
      data: {
        authorId: other.id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'TODAY',
        publishedAt: new Date(),
      },
    });
    const ownAll = await json<OwnRequestsResponse>(
      await request('/v1/requests', author.cookie),
    );
    expect(ownAll.requests.some((row) => row.id === otherPublished.id)).toBe(
      false,
    );
    expectMinimized(list);

    const hidden = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DELETED_BY_AUTHOR',
        headline: 'Gone',
        context: 'Should not list',
        deletedAt: new Date(),
      },
    });
    const defaultList = await json<OwnRequestsResponse>(
      await request('/v1/requests', author.cookie),
    );
    expect(defaultList.requests.some((row) => row.id === hidden.id)).toBe(
      false,
    );

    const duplicate = await request(
      '/v1/requests?status=DRAFT&status=PUBLISHED',
      author.cookie,
    );
    expect(duplicate.status).toBe(400);
    expect((await request('/v1/requests?page=0', author.cookie)).status).toBe(
      400,
    );
    expect((await request('/v1/requests?page=-1', author.cookie)).status).toBe(
      400,
    );
    expect(
      (await request('/v1/requests?pageSize=51', author.cookie)).status,
    ).toBe(400);
    expect(
      (await request('/v1/requests?status=MODERATED_REMOVED', author.cookie))
        .status,
    ).toBe(400);
    expect(
      (await request('/v1/requests?status=garbage', author.cookie)).status,
    ).toBe(400);

    const page = await json<OwnRequestsResponse>(
      await request('/v1/requests?page=1&pageSize=1', author.cookie),
    );
    expect(page.pageSize).toBe(1);
    expect(page.requests).toHaveLength(1);
  });

  it('enforces detail visibility, author eligibility, and responseCount-only', async () => {
    const author = await member('detail-owner', { displayName: 'Owner Ada' });
    const viewer = await member('detail-viewer');
    const created = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify({ type: 'ASK', headline: 'Draft only' }),
      }),
    );
    const draftGet = await request(
      `/v1/requests/${created.request.id}`,
      author.cookie,
    );
    expect(draftGet.status).toBe(200);
    const otherDraft = await request(
      `/v1/requests/${created.request.id}`,
      viewer.cookie,
    );
    expect(otherDraft.status).toBe(404);
    expect(
      (await json<{ error: { code: string } }>(otherDraft)).error.code,
    ).toBe('REQUEST_NOT_FOUND');
    const missing = await request(
      '/v1/requests/does-not-exist-id',
      viewer.cookie,
    );
    expect(missing.status).toBe(404);

    await request(`/v1/requests/${created.request.id}`, author.cookie, {
      method: 'PATCH',
      body: JSON.stringify(publishable()),
    });
    await request(`/v1/requests/${created.request.id}/publish`, author.cookie, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const published = await json<MemberRequestResponse>(
      await request(`/v1/requests/${created.request.id}`, viewer.cookie),
    );
    expect(published.request.status).toBe('PUBLISHED');
    expect(published.request.responseCount).toBe(0);
    expect(published.request.author.displayName).toBe('Owner Ada');
    expect(published.request.author.companyName).toBe('detail-owner Co');
    expect(leakHaystack(published)).not.toContain('body');
    expectMinimized(published);

    await request(`/v1/requests/${created.request.id}/resolve`, author.cookie, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(
      (
        await json<MemberRequestResponse>(
          await request(`/v1/requests/${created.request.id}`, viewer.cookie),
        )
      ).request.status,
    ).toBe('RESOLVED');

    const stale = await member('stale-author');
    const staleRequest = await prisma.request.create({
      data: {
        authorId: stale.id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'TODAY',
        publishedAt: new Date(),
      },
    });
    await prisma.user.update({
      where: { id: stale.id },
      data: { status: 'SUSPENDED', suspendedUntil: new Date('2099-01-01') },
    });
    const hiddenAuthor = await request(
      `/v1/requests/${staleRequest.id}`,
      viewer.cookie,
    );
    expect(hiddenAuthor.status).toBe(404);

    const deletedRow = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DELETED_BY_AUTHOR',
        headline: HEADLINE,
        context: CONTEXT,
        deletedAt: new Date(),
      },
    });
    expect(
      (await request(`/v1/requests/${deletedRow.id}`, viewer.cookie)).status,
    ).toBe(404);
    expect(
      (await request(`/v1/requests/${deletedRow.id}`, author.cookie)).status,
    ).toBe(404);
    const moderated = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'MODERATED_REMOVED',
        headline: HEADLINE,
        context: CONTEXT,
      },
    });
    expect(
      (await request(`/v1/requests/${moderated.id}`, viewer.cookie)).status,
    ).toBe(404);
  });

  it('patches drafts, published-before-response, and rejects invalid edits', async () => {
    const author = await member('patcher');
    const other = await member('patch-other');
    const gtm = await topicId('gtm');
    const hiring = await topicId('hiring');
    const created = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify({ type: 'ASK' }),
      }),
    );
    const patched = await json<MemberRequestResponse>(
      await request(`/v1/requests/${created.request.id}`, author.cookie, {
        method: 'PATCH',
        body: JSON.stringify(
          publishable({ topicIds: [gtm, hiring], type: 'FEEDBACK' }),
        ),
      }),
    );
    expect(patched.request.type).toBe('FEEDBACK');
    expect(patched.request.topics.map((topic) => topic.id).sort()).toEqual(
      [gtm, hiring].sort(),
    );

    const publishedAt = (
      await json<MemberRequestResponse>(
        await request(
          `/v1/requests/${created.request.id}/publish`,
          author.cookie,
          {
            method: 'POST',
            body: JSON.stringify({}),
          },
        ),
      )
    ).request.publishedAt;
    const edited = await json<MemberRequestResponse>(
      await request(`/v1/requests/${created.request.id}`, author.cookie, {
        method: 'PATCH',
        body: JSON.stringify({ headline: 'Updated published headline' }),
      }),
    );
    expect(edited.request.headline).toBe('Updated published headline');
    expect(edited.request.publishedAt).toBe(publishedAt);

    await prisma.requestResponse.create({
      data: {
        requestId: created.request.id,
        authorId: other.id,
        type: 'ADVICE',
        body: 'secret help body',
      },
    });
    const blocked = await request(
      `/v1/requests/${created.request.id}`,
      author.cookie,
      {
        method: 'PATCH',
        body: JSON.stringify({ headline: 'Should not save' }),
      },
    );
    expect(blocked.status).toBe(409);
    expect((await json<{ error: { code: string } }>(blocked)).error.code).toBe(
      'REQUEST_INVALID_STATE',
    );
    const afterResponse = await json<MemberRequestResponse>(
      await request(`/v1/requests/${created.request.id}`, other.cookie),
    );
    expect(afterResponse.request.responseCount).toBe(1);
    expect(leakHaystack(afterResponse)).not.toContain('secret help body');

    await request(`/v1/requests/${created.request.id}/resolve`, author.cookie, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(
      (
        await request(`/v1/requests/${created.request.id}`, author.cookie, {
          method: 'PATCH',
          body: JSON.stringify({ headline: 'Resolved no' }),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`/v1/requests/${created.request.id}`, other.cookie, {
          method: 'PATCH',
          body: JSON.stringify({ headline: 'Cross user' }),
        })
      ).status,
    ).toBe(404);
  });

  it('publishes with validation, open limit 3, and stable idempotency', async () => {
    const author = await member('publisher');
    const draft = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify({ type: 'ASK', headline: 'Too short' }),
      }),
    );
    const invalid = await request(
      `/v1/requests/${draft.request.id}/publish`,
      author.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(invalid.status).toBe(400);
    expect((await json<{ error: { code: string } }>(invalid)).error.code).toBe(
      'REQUEST_INVALID_INPUT',
    );
    expect(
      (
        await prisma.request.findUniqueOrThrow({
          where: { id: draft.request.id },
        })
      ).status,
    ).toBe('DRAFT');

    await request(`/v1/requests/${draft.request.id}`, author.cookie, {
      method: 'PATCH',
      body: JSON.stringify(publishable({ urgency: null })),
    });
    const missingUrgency = await request(
      `/v1/requests/${draft.request.id}/publish`,
      author.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(missingUrgency.status).toBe(400);

    await request(`/v1/requests/${draft.request.id}`, author.cookie, {
      method: 'PATCH',
      body: JSON.stringify(publishable()),
    });
    const first = await json<MemberRequestResponse>(
      await request(`/v1/requests/${draft.request.id}/publish`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(first.request.status).toBe('PUBLISHED');
    const publishedAt = first.request.publishedAt;
    const again = await json<MemberRequestResponse>(
      await request(`/v1/requests/${draft.request.id}/publish`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(again.request.publishedAt).toBe(publishedAt);

    const open = async () => {
      const row = await prisma.request.create({
        data: {
          authorId: author.id,
          type: 'ASK',
          status: 'DRAFT',
          headline: HEADLINE,
          context: CONTEXT,
          urgency: 'TODAY',
        },
      });
      const published = await json<MemberRequestResponse>(
        await request(`/v1/requests/${row.id}/publish`, author.cookie, {
          method: 'POST',
          body: JSON.stringify({}),
        }),
      );
      expect(published.request.status).toBe('PUBLISHED');
      return published.request.id;
    };
    const secondId = await open();
    const thirdId = await open();
    const fourth = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'NO_RUSH',
      },
    });
    const limited = await request(
      `/v1/requests/${fourth.id}/publish`,
      author.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(limited.status).toBe(409);
    expect((await json<{ error: { code: string } }>(limited)).error.code).toBe(
      'REQUEST_LIMIT_REACHED',
    );
    expect(
      (await prisma.request.findUniqueOrThrow({ where: { id: fourth.id } }))
        .status,
    ).toBe('DRAFT');

    await request(`/v1/requests/${secondId}/resolve`, author.cookie, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const afterResolve = await json<MemberRequestResponse>(
      await request(`/v1/requests/${fourth.id}/publish`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(afterResolve.request.status).toBe('PUBLISHED');

    const extraDraft = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'TODAY',
      },
    });
    const blockedAgain = await request(
      `/v1/requests/${extraDraft.id}/publish`,
      author.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(blockedAgain.status).toBe(409);
    await request(`/v1/requests/${thirdId}`, author.cookie, {
      method: 'DELETE',
    });
    const afterDelete = await json<MemberRequestResponse>(
      await request(`/v1/requests/${extraDraft.id}/publish`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(afterDelete.request.status).toBe('PUBLISHED');
    expect(
      await prisma.request.count({
        where: { authorId: author.id, status: 'PUBLISHED' },
      }),
    ).toBe(3);
  });

  it('never exceeds three published requests in a two-draft final-slot race', async () => {
    const author = await member('limit-race');
    for (let index = 0; index < 2; index += 1) {
      await prisma.request.create({
        data: {
          authorId: author.id,
          type: 'ASK',
          status: 'PUBLISHED',
          headline: HEADLINE,
          context: CONTEXT,
          urgency: 'TODAY',
          publishedAt: new Date(),
        },
      });
    }
    const draftA = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'THIS_WEEK',
      },
    });
    const draftB = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'NO_RUSH',
      },
    });
    const [left, right] = await Promise.all([
      request(`/v1/requests/${draftA.id}/publish`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      request(`/v1/requests/${draftB.id}/publish`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    ]);
    const codes = (
      await Promise.all([
        json<{ error?: { code?: string }; request?: { id: string } }>(left),
        json<{ error?: { code?: string }; request?: { id: string } }>(right),
      ])
    ).map((body, index) =>
      [left, right][index]?.status === 200
        ? 'OK'
        : (body.error?.code ?? 'UNKNOWN'),
    );
    expect(codes.sort()).toEqual(['OK', 'REQUEST_LIMIT_REACHED']);
    expect(
      await prisma.request.count({
        where: { authorId: author.id, status: 'PUBLISHED' },
      }),
    ).toBe(3);
    const publishedTimes = await prisma.request.findMany({
      where: { id: { in: [draftA.id, draftB.id] }, status: 'PUBLISHED' },
      select: { publishedAt: true },
    });
    expect(publishedTimes).toHaveLength(1);
  });

  it('treats concurrent publish of the same draft as idempotent', async () => {
    const author = await member('same-publish');
    const draft = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'TODAY',
      },
    });
    const [left, right] = await Promise.all([
      request(`/v1/requests/${draft.id}/publish`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      request(`/v1/requests/${draft.id}/publish`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    ]);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    const leftBody = await json<MemberRequestResponse>(left);
    const rightBody = await json<MemberRequestResponse>(right);
    expect(leftBody.request.publishedAt).toBe(rightBody.request.publishedAt);
    const row = await prisma.request.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(row.status).toBe('PUBLISHED');
    expect(row.publishedAt?.toISOString()).toBe(leftBody.request.publishedAt);
    expect(
      await prisma.request.count({
        where: { id: draft.id },
      }),
    ).toBe(1);
  });

  it('resolves, deletes, and keeps GET side-effect free for topics', async () => {
    const author = await member('lifecycle');
    const other = await member('lifecycle-other');
    const created = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify(publishable()),
      }),
    );
    const draftDelete = await request(
      `/v1/requests/${created.request.id}`,
      author.cookie,
      { method: 'DELETE' },
    );
    expect(draftDelete.status).toBe(200);
    expect(
      await prisma.request.findUnique({ where: { id: created.request.id } }),
    ).toBeNull();

    const live = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify(publishable()),
      }),
    );
    await request(`/v1/requests/${live.request.id}/publish`, author.cookie, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const resolved = await json<MemberRequestResponse>(
      await request(`/v1/requests/${live.request.id}/resolve`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    const resolvedAt = resolved.request.resolvedAt;
    const again = await json<MemberRequestResponse>(
      await request(`/v1/requests/${live.request.id}/resolve`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(again.request.resolvedAt).toBe(resolvedAt);
    expect(
      (
        await request(`/v1/requests/${live.request.id}`, author.cookie, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`/v1/requests/${live.request.id}/resolve`, other.cookie, {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(404);

    const toDelete = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify(publishable({ type: 'INTRODUCTION' })),
      }),
    );
    await request(
      `/v1/requests/${toDelete.request.id}/publish`,
      author.cookie,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
    expect(
      (
        await request(`/v1/requests/${toDelete.request.id}`, other.cookie, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/requests/${toDelete.request.id}`, author.cookie, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await prisma.request.findUniqueOrThrow({
          where: { id: toDelete.request.id },
        })
      ).status,
    ).toBe('DELETED_BY_AUTHOR');
    expect(
      (
        await request(`/v1/requests/${toDelete.request.id}`, author.cookie, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(200);

    const gtm = await topicId('gtm');
    const inactive = await prisma.taxonomyTopic.create({
      data: {
        slug: `fc011-inactive-${Date.now()}`,
        label: 'Inactive topic',
        isActive: false,
      },
    });
    extraTopicIds.push(inactive.id);
    const merged = await prisma.taxonomyTopic.create({
      data: {
        slug: `fc011-merged-${Date.now()}`,
        label: 'Merged topic',
        mergedIntoId: gtm,
      },
    });
    extraTopicIds.push(merged.id);
    const topicDraft = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify(publishable({ topicIds: [gtm] })),
      }),
    );
    const invalidInactive = await request(
      `/v1/requests/${topicDraft.request.id}`,
      author.cookie,
      {
        method: 'PATCH',
        body: JSON.stringify({ topicIds: [inactive.id] }),
      },
    );
    expect(invalidInactive.status).toBe(400);
    expect(
      (
        await json<MemberRequestResponse>(
          await request(`/v1/requests/${topicDraft.request.id}`, author.cookie),
        )
      ).request.topics.map((topic) => topic.id),
    ).toEqual([gtm]);
    expect(
      (
        await request(`/v1/requests/${topicDraft.request.id}`, author.cookie, {
          method: 'PATCH',
          body: JSON.stringify({ topicIds: [merged.id] }),
        })
      ).status,
    ).toBe(400);
    await prisma.requestTopic.create({
      data: { requestId: topicDraft.request.id, topicId: inactive.id },
    });
    const beforeTopics = await prisma.requestTopic.findMany({
      where: { requestId: topicDraft.request.id },
      orderBy: { topicId: 'asc' },
    });
    const beforeUpdated = (
      await prisma.request.findUniqueOrThrow({
        where: { id: topicDraft.request.id },
      })
    ).updatedAt;
    const got = await json<MemberRequestResponse>(
      await request(`/v1/requests/${topicDraft.request.id}`, author.cookie),
    );
    expect(got.request.topics.map((topic) => topic.id)).toEqual([gtm]);
    const afterGetTopics = await prisma.requestTopic.findMany({
      where: { requestId: topicDraft.request.id },
      orderBy: { topicId: 'asc' },
    });
    expect(afterGetTopics).toEqual(beforeTopics);
    expect(
      (
        await prisma.request.findUniqueOrThrow({
          where: { id: topicDraft.request.id },
        })
      ).updatedAt,
    ).toEqual(beforeUpdated);
    await request(`/v1/requests/${topicDraft.request.id}`, author.cookie, {
      method: 'PATCH',
      body: JSON.stringify({ topicIds: [gtm] }),
    });
    const afterPatchTopics = await prisma.requestTopic.findMany({
      where: { requestId: topicDraft.request.id },
      select: { topicId: true },
    });
    expect(afterPatchTopics.map((row) => row.topicId).sort()).toEqual(
      [gtm, inactive.id].sort(),
    );
  });

  it('keeps publish idempotent at the open limit and counts only PUBLISHED', async () => {
    const author = await member('limit-states');
    const viewer = await member('limit-viewer');
    const stamp = new Date('2026-05-01T00:00:00.000Z');
    const published = async (status: 'PUBLISHED' | 'RESOLVED') => {
      return prisma.request.create({
        data: {
          authorId: author.id,
          type: 'ASK',
          status,
          headline: HEADLINE,
          context: CONTEXT,
          urgency: 'TODAY',
          publishedAt: stamp,
          resolvedAt: status === 'RESOLVED' ? stamp : null,
        },
      });
    };
    const first = await published('PUBLISHED');
    const second = await published('PUBLISHED');
    await published('RESOLVED');
    await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DELETED_BY_AUTHOR',
        headline: HEADLINE,
        context: CONTEXT,
        deletedAt: stamp,
      },
    });
    await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'MODERATED_REMOVED',
        headline: HEADLINE,
        context: CONTEXT,
      },
    });
    await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: 'Parked extra draft',
        context: CONTEXT,
      },
    });
    const slot = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'THIS_WEEK',
      },
    });
    const allowed = await request(
      `/v1/requests/${slot.id}/publish`,
      author.cookie,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
    expect(allowed.status).toBe(200);

    const third = await json<MemberRequestResponse>(allowed);
    const republish = await json<MemberRequestResponse>(
      await request(`/v1/requests/${third.request.id}/publish`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(republish.request.status).toBe('PUBLISHED');
    expect(republish.request.publishedAt).toBe(third.request.publishedAt);
    expectMinimized(republish);

    const extra = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'NO_RUSH',
      },
    });
    const blocked = await request(
      `/v1/requests/${extra.id}/publish`,
      author.cookie,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
    expect(blocked.status).toBe(409);
    expect((await json<{ error: { code: string } }>(blocked)).error.code).toBe(
      'REQUEST_LIMIT_REACHED',
    );

    const atCapRepublish = await request(
      `/v1/requests/${first.id}/publish`,
      author.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(atCapRepublish.status).toBe(200);
    expect(
      (await json<MemberRequestResponse>(atCapRepublish)).request.publishedAt,
    ).toBe(stamp.toISOString());

    await prisma.request.deleteMany({
      where: { authorId: author.id, status: 'DRAFT' },
    });
    const whitespace = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify({
          type: 'ASK',
          headline: '          ',
          context: CONTEXT,
          urgency: 'TODAY',
        }),
      }),
    );
    expect(whitespace.request.headline).toBe('');
    const whitespacePublish = await request(
      `/v1/requests/${whitespace.request.id}/publish`,
      author.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(whitespacePublish.status).toBe(400);
    const whitespaceRow = await prisma.request.findUniqueOrThrow({
      where: { id: whitespace.request.id },
    });
    expect(whitespaceRow.status).toBe('DRAFT');
    expect(whitespaceRow.publishedAt).toBeNull();
    expect(whitespaceRow.headline).toBe('');
    expect(whitespaceRow.context).toBe(CONTEXT);

    const hiddenCases = [
      { label: 'elig-deleted', status: 'DELETED' as const },
      { label: 'elig-unverified', verified: false },
      { label: 'elig-unapproved', applicationStatus: 'REJECTED' as const },
      { label: 'elig-onboarding', onboarded: false },
    ];
    for (const extras of hiddenCases) {
      const stale = await member(extras.label, extras);
      const row = await prisma.request.create({
        data: {
          authorId: stale.id,
          type: 'ASK',
          status: 'PUBLISHED',
          headline: HEADLINE,
          context: CONTEXT,
          urgency: 'TODAY',
          publishedAt: stamp,
        },
      });
      const hidden = await request(`/v1/requests/${row.id}`, viewer.cookie);
      expect(hidden.status).toBe(404);
      const hiddenBody = JSON.stringify(await json(hidden));
      expect(hiddenBody).not.toContain(stale.email);
      expect(hiddenBody).not.toContain(stale.id);
      expect(hiddenBody).not.toContain(`Founder ${extras.label}`);
    }

    const noCompany = await member('elig-nocompany');
    const noCompanyRequest = await prisma.request.create({
      data: {
        authorId: noCompany.id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'TODAY',
        publishedAt: stamp,
      },
    });
    await prisma.company.deleteMany({
      where: { founderProfile: { userId: noCompany.id } },
    });
    expect(
      (await request(`/v1/requests/${noCompanyRequest.id}`, viewer.cookie))
        .status,
    ).toBe(404);

    expect(
      (await request(`/v1/requests/${'x'.repeat(65)}`, author.cookie)).status,
    ).toBe(404);
    expect(
      (await request('/v1/requests/not-a-real-id%00', author.cookie)).status,
    ).toBe(404);

    const live = await prisma.request.findUniqueOrThrow({
      where: { id: second.id },
    });
    await prisma.requestResponse.create({
      data: {
        requestId: live.id,
        authorId: viewer.id,
        type: 'ADVICE',
        body: 'soft-deleted secret',
        deletedAt: new Date(),
      },
    });
    const stillEditable = await request(
      `/v1/requests/${live.id}`,
      author.cookie,
      {
        method: 'PATCH',
        body: JSON.stringify({ headline: 'Still editable after soft delete' }),
      },
    );
    expect(stillEditable.status).toBe(200);
    expect(
      leakHaystack(await json<MemberRequestResponse>(stillEditable)),
    ).not.toContain('soft-deleted secret');

    const tiedAt = new Date('2026-06-02T00:00:00.000Z');
    const pager = await member('pager');
    for (const label of ['p-a', 'p-b', 'p-c']) {
      const row = await prisma.request.create({
        data: {
          authorId: pager.id,
          type: 'ASK',
          status: 'PUBLISHED',
          headline: `${label} ${HEADLINE}`,
          context: CONTEXT,
          urgency: 'TODAY',
          publishedAt: tiedAt,
        },
      });
      await prisma.request.update({
        where: { id: row.id },
        data: { updatedAt: tiedAt },
      });
    }
    const page1 = await json<OwnRequestsResponse>(
      await request('/v1/requests?page=1&pageSize=2', pager.cookie),
    );
    const page2 = await json<OwnRequestsResponse>(
      await request('/v1/requests?page=2&pageSize=2', pager.cookie),
    );
    const pageIds = [...page1.requests, ...page2.requests].map((row) => row.id);
    expect(new Set(pageIds).size).toBe(pageIds.length);
    const expectedPageIds = (
      await prisma.request.findMany({
        where: { authorId: pager.id },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      })
    ).map((row) => row.id);
    expect(pageIds).toEqual(expectedPageIds);

    const topicCount = await prisma.taxonomyTopic.count();
    const listed = await json<OwnRequestsResponse>(
      await request('/v1/requests', pager.cookie),
    );
    expect(
      listed.availableTopics.every((topic) => topic.label.length > 0),
    ).toBe(true);
    expect(
      listed.availableTopics.some((topic) => topic.slug.startsWith('fc011-')),
    ).toBe(false);
    expect(await prisma.taxonomyTopic.count()).toBe(topicCount);
    expectMinimized(listed);
  });

  it('serializes resolve versus delete and hard-deletes draft topics', async () => {
    const author = await member('race-owner');
    const other = await member('race-other');
    const gtm = await topicId('gtm');
    const published = await prisma.request.create({
      data: {
        authorId: author.id,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: HEADLINE,
        context: CONTEXT,
        urgency: 'TODAY',
        publishedAt: new Date(),
      },
    });
    const [resolveRes, deleteRes] = await Promise.all([
      request(`/v1/requests/${published.id}/resolve`, author.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      request(`/v1/requests/${published.id}`, author.cookie, {
        method: 'DELETE',
      }),
    ]);
    expect([resolveRes.status, deleteRes.status].includes(500)).toBe(false);
    expect(
      JSON.stringify([await json(resolveRes), await json(deleteRes)]),
    ).not.toMatch(/P20\d{2}/);
    const finalRow = await prisma.request.findUniqueOrThrow({
      where: { id: published.id },
    });
    if (finalRow.status === 'RESOLVED') {
      expect(finalRow.resolvedAt).not.toBeNull();
      expect(finalRow.deletedAt).toBeNull();
      expect([resolveRes.status, deleteRes.status].sort()).toEqual([200, 409]);
    } else {
      expect(finalRow.status).toBe('DELETED_BY_AUTHOR');
      expect(finalRow.deletedAt).not.toBeNull();
      expect(finalRow.resolvedAt).toBeNull();
    }

    const deletedAt = finalRow.deletedAt;
    if (finalRow.status === 'DELETED_BY_AUTHOR' && deletedAt) {
      const again = await request(
        `/v1/requests/${published.id}`,
        author.cookie,
        {
          method: 'DELETE',
        },
      );
      expect(again.status).toBe(200);
      expect(
        (
          await prisma.request.findUniqueOrThrow({
            where: { id: published.id },
          })
        ).deletedAt,
      ).toEqual(deletedAt);
      expect(
        (await request(`/v1/requests/${published.id}`, other.cookie)).status,
      ).toBe(404);
    }

    const draft = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify(publishable({ topicIds: [gtm] })),
      }),
    );
    expect(
      (
        await request(`/v1/requests/${draft.request.id}`, author.cookie, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(200);
    expect(
      await prisma.requestTopic.count({
        where: { requestId: draft.request.id },
      }),
    ).toBe(0);
    expect(
      (
        await request(`/v1/requests/${draft.request.id}`, author.cookie, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);

    const htmlDraft = await json<MemberRequestResponse>(
      await request('/v1/requests', author.cookie, {
        method: 'POST',
        body: JSON.stringify({
          type: 'ASK',
          headline: '<script>alert(1)</script> More headline',
          context:
            '<img src=x onerror=alert(1)> context that is long enough to keep.',
        }),
      }),
    );
    expect(htmlDraft.request.headline).toContain('<script>');
    expectMinimized(htmlDraft);
  });
});
