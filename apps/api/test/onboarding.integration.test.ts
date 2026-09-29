import type { AddressInfo } from 'node:net';

import type {
  AuthSessionResponse,
  OnboardingCompleteResponse,
  OnboardingProfileResponse,
} from '@founderchatters/contracts';
import {
  ONBOARDING_EXPERTISE_TOPICS,
  ONBOARDING_TAXONOMY_TOPICS,
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

const needText = 'Finding founders who have launched a B2B product in the UAE.';

describe('onboarding HTTP integration', { timeout: 30_000 }, () => {
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
    await ensureOnboardingTaxonomy(prisma);
    await ensureOnboardingTaxonomy(prisma, true);
  }, 60_000);

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
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

  async function approvedFounder(
    label: string,
    extras: {
      verified?: boolean;
      status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
      applicationStatus?:
        'DRAFT' | 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED';
    } = {},
  ): Promise<{ id: string; cookie: string }> {
    const user = await prisma.user.create({
      data: {
        email: `fc009-${label}-${Date.now()}-${userIds.length}@example.com`,
        passwordHash: '$argon2id$test-only',
        emailVerifiedAt: extras.verified === false ? null : new Date(),
        status: extras.status ?? 'ACTIVE',
        deletedAt: extras.status === 'DELETED' ? new Date() : null,
        application: {
          create: {
            status: extras.applicationStatus ?? 'APPROVED',
            eligibilityRole: 'FOUNDER_COFOUNDER',
            companyName: 'FounderChatters',
            roleTitle: 'Founder',
            website: 'https://founderchatters.com/',
            city: 'Rajkot',
            country: 'India',
            buildingSummary:
              'A founder-to-founder support network for useful help.',
            submittedAt: new Date('2020-01-02T00:00:00.000Z'),
            decidedAt: new Date('2020-01-03T00:00:00.000Z'),
          },
        },
      },
    });
    userIds.push(user.id);
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-009 integration test',
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

  async function topicId(slug: string): Promise<string> {
    const topic = await prisma.taxonomyTopic.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    });
    return topic.id;
  }

  async function snapshotApplication(userId: string) {
    return prisma.founderApplication.findUniqueOrThrow({
      where: { userId },
      select: {
        eligibilityRole: true,
        companyName: true,
        roleTitle: true,
        website: true,
        city: true,
        country: true,
        buildingSummary: true,
        status: true,
        submittedAt: true,
        decidedAt: true,
      },
    });
  }

  async function saveReadyProfile(cookie: string): Promise<void> {
    const expertiseId = await topicId('marketplace-gtm');
    await request('/v1/me/profile', cookie, {
      method: 'PUT',
      body: JSON.stringify({
        displayName: 'Chaitanya Pandita',
        city: 'Rajkot',
        country: 'India',
        company: {
          name: 'FounderChatters',
          industry: 'Community / Founder Network',
          stage: 'Pre-launch / MVP',
        },
      }),
    });
    await request('/v1/me/expertise', cookie, {
      method: 'PUT',
      body: JSON.stringify({
        topicIds: [expertiseId],
        customExpertise: 'Outstation taxi marketplace operations',
      }),
    });
    await request('/v1/me/needs', cookie, {
      method: 'PUT',
      body: JSON.stringify({ topicIds: [], currentNeedText: needText }),
    });
  }

  it('seeds canonical taxonomy once and leaves labels intact on rerun', async () => {
    expect(ONBOARDING_TAXONOMY_TOPICS).toHaveLength(17);
    const topics = await prisma.taxonomyTopic.findMany({
      where: {
        slug: { in: ONBOARDING_TAXONOMY_TOPICS.map((topic) => topic.slug) },
      },
    });
    expect(topics).toHaveLength(ONBOARDING_TAXONOMY_TOPICS.length);
    const product = await prisma.taxonomyTopic.findUniqueOrThrow({
      where: { slug: 'product' },
    });
    await prisma.taxonomyTopic.update({
      where: { slug: 'product' },
      data: { label: 'Product (admin edited)' },
    });
    try {
      await ensureOnboardingTaxonomy(prisma, true);
      await expect(
        prisma.taxonomyTopic.findUniqueOrThrow({ where: { slug: 'product' } }),
      ).resolves.toMatchObject({
        id: product.id,
        label: 'Product (admin edited)',
      });
    } finally {
      await prisma.taxonomyTopic.update({
        where: { slug: 'product' },
        data: { label: 'Product' },
      });
    }
  });

  it('does not create or change TaxonomyTopic rows on GET /me/profile', async () => {
    const user = await approvedFounder('get-readonly');
    const beforeCount = await prisma.taxonomyTopic.count();
    const beforeRows = await prisma.taxonomyTopic.findMany({
      select: { id: true, slug: true, label: true, updatedAt: true },
      orderBy: { slug: 'asc' },
    });
    const first = await request('/v1/me/profile', user.cookie);
    const second = await request('/v1/me/profile', user.cookie);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await prisma.taxonomyTopic.count()).toBe(beforeCount);
    expect(
      await prisma.taxonomyTopic.findMany({
        select: { id: true, slug: true, label: true, updatedAt: true },
        orderBy: { slug: 'asc' },
      }),
    ).toEqual(beforeRows);
  });

  it('denies unauthenticated, unverified, non-approved, and foreign users', async () => {
    const missing = await request('/v1/me/profile');
    expect(missing.status).toBe(401);
    const unverified = await approvedFounder('unverified', { verified: false });
    expect((await request('/v1/me/profile', unverified.cookie)).status).toBe(
      403,
    );
    for (const status of [
      'DRAFT',
      'SUBMITTED',
      'NEEDS_INFO',
      'REJECTED',
    ] as const) {
      const user = await approvedFounder(status.toLowerCase(), {
        applicationStatus: status,
      });
      const response = await request('/v1/me/profile', user.cookie);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'AUTH_FORBIDDEN' },
      });
    }
    const owner = await approvedFounder('owner');
    const other = await approvedFounder('other');
    await request('/v1/me/profile', owner.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Owner Founder' }),
    });
    await request('/v1/me/profile', other.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Other Founder' }),
    });
    const mine = (await (
      await request('/v1/me/profile', owner.cookie)
    ).json()) as OnboardingProfileResponse;
    expect(mine.profile.displayName).toBe('Owner Founder');
    expect(JSON.stringify(mine)).not.toContain('Other Founder');
    expect(JSON.stringify(mine)).not.toContain('passwordHash');
    expect(JSON.stringify(mine)).not.toContain('adminRoles');
  });

  it('rejects expired, revoked, suspended, and deleted sessions', async () => {
    const expired = await approvedFounder('expired');
    await prisma.session.updateMany({
      where: { userId: expired.id, revokedAt: null },
      data: { expiresAt: new Date(0) },
    });
    expect((await request('/v1/me/profile', expired.cookie)).status).toBe(401);

    const revoked = await approvedFounder('revoked');
    await prisma.session.updateMany({
      where: { userId: revoked.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    expect((await request('/v1/me/profile', revoked.cookie)).status).toBe(401);

    const suspended = await approvedFounder('suspended', {
      status: 'SUSPENDED',
    });
    expect((await request('/v1/me/profile', suspended.cookie)).status).toBe(
      403,
    );

    const deleted = await approvedFounder('deleted', { status: 'DELETED' });
    expect((await request('/v1/me/profile', deleted.cookie)).status).toBe(403);
  });

  it('prefills from the approved application without mutating it or overwriting later edits', async () => {
    const user = await approvedFounder('prefill');
    const get = await request('/v1/me/profile', user.cookie);
    expect(get.status).toBe(200);
    const body = (await get.json()) as OnboardingProfileResponse;
    expect(body).toMatchObject({
      profile: {
        displayName: null,
        city: 'Rajkot',
        country: 'India',
        onboardingCompleted: false,
      },
      company: {
        name: 'FounderChatters',
        website: 'https://founderchatters.com/',
        city: 'Rajkot',
        country: 'India',
      },
      applicationRoleTitle: 'Founder',
    });
    expect(body.topics.expertise.length).toBe(
      ONBOARDING_EXPERTISE_TOPICS.length,
    );
    expect(body.topics.needs.length).toBe(8);
    expect(Object.keys(body).sort()).toEqual(
      [
        'applicationRoleTitle',
        'company',
        'expertise',
        'needs',
        'profile',
        'topics',
      ].sort(),
    );
    const before = await snapshotApplication(user.id);
    await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({
        displayName: 'Chaitanya Pandita',
        city: 'Dubai',
        country: 'UAE',
        company: {
          name: 'Edited Company',
          industry: 'Climate',
          description: 'Edited description that must stick.',
        },
      }),
    });
    const afterSave = await snapshotApplication(user.id);
    expect(afterSave).toEqual(before);
    const edited = (await (
      await request('/v1/me/profile', user.cookie)
    ).json()) as OnboardingProfileResponse;
    expect(edited.profile.city).toBe('Dubai');
    expect(edited.profile.country).toBe('UAE');
    expect(edited.company).toMatchObject({
      name: 'Edited Company',
      description: 'Edited description that must stick.',
    });
    const refreshed = (await (
      await request('/v1/me/profile', user.cookie)
    ).json()) as OnboardingProfileResponse;
    expect(refreshed.profile.city).toBe('Dubai');
    expect(refreshed.company?.name).toBe('Edited Company');
    expect(refreshed.company?.description).toBe(
      'Edited description that must stick.',
    );
  });

  it('rejects mass assignment, untrusted origins, and fabricated display names', async () => {
    const user = await approvedFounder('mass');
    const protectedResponse = await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({
        displayName: 'Safe Name',
        userId: 'another-user',
        founderProfileId: 'forged-profile',
        profileId: 'forged-profile',
        companyId: 'forged-company',
        applicationId: 'forged-application',
        onboardingCompletedAt: '2026-09-29T00:00:00.000Z',
        email: 'attacker@example.com',
        emailVerifiedAt: '2026-09-29T00:00:00.000Z',
        status: 'ACTIVE',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        injected: true,
      }),
    });
    expect(protectedResponse.status).toBe(400);
    await expect(protectedResponse.json()).resolves.toMatchObject({
      error: {
        code: 'APPLICATION_INVALID_STATE',
        fieldErrors: {
          userId: expect.any(Array),
          onboardingCompletedAt: expect.any(Array),
          email: expect.any(Array),
        },
      },
    });
    expect(
      await prisma.founderProfile.findUnique({ where: { userId: user.id } }),
    ).toBeNull();
    const origin = await request(
      '/v1/me/profile',
      user.cookie,
      {
        method: 'PUT',
        body: JSON.stringify({ displayName: 'Safe Name' }),
      },
      'https://attacker.example',
    );
    expect(origin.status).toBe(403);
    const userForMutations = await approvedFounder('mass-other');
    await request('/v1/me/profile', userForMutations.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Mass Founder' }),
    });
    const protectedPayload = {
      topicIds: [await topicId('product')],
      customExpertise: 'Marketplace ops',
      userId: 'another-user',
      founderProfileId: 'forged',
      profileId: 'forged',
      companyId: 'forged',
      applicationId: 'forged',
      onboardingCompletedAt: '2026-09-29T00:00:00.000Z',
      email: 'attacker@example.com',
    };
    expect(
      (
        await request('/v1/me/expertise', userForMutations.cookie, {
          method: 'PUT',
          body: JSON.stringify(protectedPayload),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/v1/me/needs', userForMutations.cookie, {
          method: 'PUT',
          body: JSON.stringify({
            topicIds: [],
            currentNeedText: needText,
            userId: 'another-user',
            onboardingCompletedAt: 'now',
          }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/v1/me/onboarding/complete', userForMutations.cookie, {
          method: 'POST',
          body: JSON.stringify({ userId: 'another-user', status: 'ACTIVE' }),
        })
      ).status,
    ).toBe(400);
    for (const path of [
      '/v1/me/expertise',
      '/v1/me/needs',
      '/v1/me/onboarding/complete',
    ]) {
      const blocked = await request(
        path,
        userForMutations.cookie,
        {
          method: path.includes('complete') ? 'POST' : 'PUT',
          body: path.includes('complete')
            ? '{}'
            : JSON.stringify({
                topicIds: [],
                currentNeedText: needText,
                customExpertise: 'x',
              }),
        },
        'https://attacker.example',
      );
      expect(blocked.status).toBe(403);
    }
  });

  it('creates one profile and company under concurrent first saves', async () => {
    const user = await approvedFounder('profile-race');
    const responses = await Promise.all([
      request('/v1/me/profile', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({
          displayName: 'Founder One',
          company: { name: 'Company One' },
        }),
      }),
      request('/v1/me/profile', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({
          displayName: 'Founder Two',
          company: { name: 'Company Two' },
        }),
      }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses.every((response) => response.status !== 500)).toBe(true);
    expect(
      await prisma.founderProfile.count({ where: { userId: user.id } }),
    ).toBe(1);
    expect(
      await prisma.company.count({
        where: { founderProfile: { userId: user.id } },
      }),
    ).toBe(1);
    const profile = await prisma.founderProfile.findUniqueOrThrow({
      where: { userId: user.id },
      select: {
        displayName: true,
        company: { select: { name: true } },
      },
    });
    const pair = `${profile.displayName}|${profile.company?.name ?? ''}`;
    expect(['Founder One|Company One', 'Founder Two|Company Two']).toContain(
      pair,
    );
    expect(await snapshotApplication(user.id)).toMatchObject({
      companyName: 'FounderChatters',
      status: 'APPROVED',
    });
  });

  it('replaces expertise atomically and rejects invalid or excessive topics', async () => {
    const user = await approvedFounder('expertise');
    await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Expertise Founder' }),
    });
    const [first, second, inactive, merged] = await Promise.all([
      topicId('marketplace-gtm'),
      topicId('product'),
      topicId('fundraising'),
      topicId('operations'),
    ]);
    await prisma.taxonomyTopic.update({
      where: { id: inactive },
      data: { isActive: false },
    });
    await prisma.taxonomyTopic.update({
      where: { id: merged },
      data: { mergedIntoId: first },
    });
    try {
      const saved = await request('/v1/me/expertise', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({
          topicIds: [first],
          customExpertise: 'Marketplace ops',
        }),
      });
      expect(saved.status).toBe(200);
      const replaced = await request('/v1/me/expertise', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({ topicIds: [second] }),
      });
      expect(replaced.status).toBe(200);
      const body = (await replaced.json()) as OnboardingProfileResponse;
      expect(body.expertise.map((topic) => topic.slug)).toEqual(['product']);
      expect(body.profile.customExpertise).toBeNull();
      expect(
        (
          await request('/v1/me/expertise', user.cookie, {
            method: 'PUT',
            body: JSON.stringify({ topicIds: [inactive] }),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request('/v1/me/expertise', user.cookie, {
            method: 'PUT',
            body: JSON.stringify({ topicIds: [merged] }),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request('/v1/me/expertise', user.cookie, {
            method: 'PUT',
            body: JSON.stringify({ topicIds: ['missing-topic'] }),
          })
        ).status,
      ).toBe(400);
      expect(
        await prisma.founderExpertise.findMany({
          where: { profile: { userId: user.id } },
        }),
      ).toHaveLength(1);
      const stored = await prisma.founderExpertise.findMany({
        where: { profile: { userId: user.id } },
        select: { topicId: true },
      });
      await prisma.taxonomyTopic.update({
        where: { id: inactive },
        data: { isActive: true },
      });
      await prisma.taxonomyTopic.update({
        where: { id: merged },
        data: { mergedIntoId: null },
      });
      await prisma.taxonomyTopic.update({
        where: { id: second },
        data: { isActive: false },
      });
      const readable = (await (
        await request('/v1/me/profile', user.cookie)
      ).json()) as OnboardingProfileResponse;
      expect(readable.expertise.map((topic) => topic.slug)).toEqual([
        'product',
      ]);
      expect(
        (
          await request('/v1/me/expertise', user.cookie, {
            method: 'PUT',
            body: JSON.stringify({ topicIds: [second] }),
          })
        ).status,
      ).toBe(400);
      expect(
        await prisma.founderExpertise.findMany({
          where: { profile: { userId: user.id } },
          select: { topicId: true },
        }),
      ).toEqual(stored);
    } finally {
      await prisma.taxonomyTopic.update({
        where: { id: inactive },
        data: { isActive: true },
      });
      await prisma.taxonomyTopic.update({
        where: { id: merged },
        data: { mergedIntoId: null },
      });
      await prisma.taxonomyTopic.update({
        where: { id: second },
        data: { isActive: true },
      });
    }
  });

  it('replaces expertise concurrently without duplicate joins', async () => {
    const user = await approvedFounder('expertise-race');
    await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Race Founder' }),
    });
    const [first, second, third, fourth] = await Promise.all([
      topicId('b2b-sales'),
      topicId('partnerships'),
      topicId('product'),
      topicId('pricing'),
    ]);
    const setA = [first, second];
    const setB = [third, fourth];
    const responses = await Promise.all([
      request('/v1/me/expertise', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({ topicIds: setA }),
      }),
      request('/v1/me/expertise', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({
          topicIds: setB,
          customExpertise: 'Marketplace ops',
        }),
      }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const serialized = await Promise.all(
      responses.map(async (response) => JSON.stringify(await response.json())),
    );
    expect(serialized.join(' ')).not.toMatch(/P2002|prisma/i);
    const rows = await prisma.founderExpertise.findMany({
      where: { profile: { userId: user.id } },
      select: { topicId: true },
    });
    const topicIds = [...new Set(rows.map((row) => row.topicId))].sort();
    expect(rows).toHaveLength(topicIds.length);
    const finalKey = topicIds.join('|');
    expect(
      [[...setA].sort().join('|'), [...setB].sort().join('|')].includes(
        finalKey,
      ),
    ).toBe(true);
    const profile = await prisma.founderProfile.findUniqueOrThrow({
      where: { userId: user.id },
      select: { customExpertise: true },
    });
    if (finalKey === [...setA].sort().join('|')) {
      expect(profile.customExpertise).toBeNull();
    } else {
      expect(profile.customExpertise).toBe('Marketplace ops');
    }
  });

  it('keeps previous expertise when a concurrent replacement uses an invalid topic', async () => {
    const user = await approvedFounder('expertise-rollback');
    await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Rollback Founder' }),
    });
    const valid = await topicId('gtm');
    await request('/v1/me/expertise', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ topicIds: [valid] }),
    });
    const failed = await request('/v1/me/expertise', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ topicIds: [valid, 'does-not-exist'] }),
    });
    expect(failed.status).toBe(400);
    expect(
      await prisma.founderExpertise.findMany({
        where: { profile: { userId: user.id } },
        select: { topicId: true },
      }),
    ).toEqual([{ topicId: valid }]);
  });

  it('replaces needs atomically with optional areas', async () => {
    const user = await approvedFounder('needs');
    await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Needs Founder' }),
    });
    const [gtm, hiring, pricing, tech] = await Promise.all([
      topicId('gtm'),
      topicId('hiring'),
      topicId('pricing'),
      topicId('tech'),
    ]);
    const saved = await request('/v1/me/needs', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({
        topicIds: [gtm, hiring],
        currentNeedText: needText,
      }),
    });
    expect(saved.status).toBe(200);
    const tooMany = await request('/v1/me/needs', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({
        topicIds: [gtm, hiring, pricing, tech],
        currentNeedText: needText,
      }),
    });
    expect(tooMany.status).toBe(400);
    expect(
      await prisma.founderNeed.count({
        where: { profile: { userId: user.id } },
      }),
    ).toBe(2);
    const responses = await Promise.all([
      request('/v1/me/needs', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({
          topicIds: [pricing],
          currentNeedText: needText,
        }),
      }),
      request('/v1/me/needs', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({ topicIds: [tech], currentNeedText: needText }),
      }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const remaining = await prisma.founderNeed.findMany({
      where: { profile: { userId: user.id } },
      select: { topicId: true },
    });
    const remainingIds = remaining.map((row) => row.topicId).sort();
    expect(remaining).toHaveLength(remainingIds.length);
    expect(
      [[pricing].join('|'), [tech].join('|')].includes(remainingIds.join('|')),
    ).toBe(true);
  });

  it('keeps one coherent needs replacement under concurrent writes', async () => {
    const user = await approvedFounder('needs-race-coherent');
    await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Needs Race Founder' }),
    });
    const [gtm, hiring, tech] = await Promise.all([
      topicId('gtm'),
      topicId('hiring'),
      topicId('tech'),
    ]);
    const textA =
      'Finding founders who have launched a B2B product in the UAE.';
    const textB =
      'I need introductions to operators who have launched in Europe.';
    const responses = await Promise.all([
      request('/v1/me/needs', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({
          topicIds: [gtm, hiring],
          currentNeedText: textA,
        }),
      }),
      request('/v1/me/needs', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({ topicIds: [tech], currentNeedText: textB }),
      }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const profile = await prisma.founderProfile.findUniqueOrThrow({
      where: { userId: user.id },
      select: { currentNeedText: true },
    });
    const rows = await prisma.founderNeed.findMany({
      where: { profile: { userId: user.id } },
      select: { topicId: true },
    });
    const topicKey = [...new Set(rows.map((row) => row.topicId))]
      .sort()
      .join('|');
    expect(rows).toHaveLength(topicKey ? topicKey.split('|').length : 0);
    const signature = `${profile.currentNeedText}|${topicKey}`;
    expect([
      `${textA}|${[gtm, hiring].sort().join('|')}`,
      `${textB}|${tech}`,
    ]).toContain(signature);
  });

  it('rolls back needs when a transaction fails after mutation starts', async () => {
    const user = await approvedFounder('needs-rollback');
    await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Needs Rollback' }),
    });
    const gtm = await topicId('gtm');
    const hiring = await topicId('hiring');
    expect(
      (
        await request('/v1/me/needs', user.cookie, {
          method: 'PUT',
          body: JSON.stringify({
            topicIds: [gtm],
            currentNeedText: needText,
          }),
        })
      ).status,
    ).toBe(200);

    type TransactionClient = {
      founderNeed: { createMany: (args: unknown) => Promise<unknown> };
    };
    type TransactionFn = (tx: TransactionClient) => Promise<unknown>;
    const prismaWithTx = prisma as unknown as {
      $transaction: (fn: TransactionFn, options?: unknown) => Promise<unknown>;
    };
    const originalTransaction = prismaWithTx.$transaction.bind(prisma);
    prismaWithTx.$transaction = async (fn, options) =>
      originalTransaction(async (tx) => {
        const originalCreateMany = tx.founderNeed.createMany.bind(
          tx.founderNeed,
        );
        tx.founderNeed.createMany = async (args: unknown) => {
          await originalCreateMany(args);
          throw new Error('forced-needs-transaction-failure');
        };
        return fn(tx);
      }, options);

    try {
      const failed = await request('/v1/me/needs', user.cookie, {
        method: 'PUT',
        body: JSON.stringify({
          topicIds: [hiring],
          currentNeedText:
            'I need introductions to operators who have launched in Europe.',
        }),
      });
      expect(failed.status).toBe(500);
      const body = (await failed.json()) as {
        error: {
          code: string;
          message: string;
          requestId: string;
          fieldErrors: Record<string, string[]>;
        };
      };
      expect(body.error).toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        fieldErrors: {},
      });
      expect(JSON.stringify(body)).not.toMatch(
        /P20\d{2}|prisma|SQL|SELECT |forced-needs/i,
      );
    } finally {
      prismaWithTx.$transaction = originalTransaction;
    }

    const profile = await prisma.founderProfile.findUniqueOrThrow({
      where: { userId: user.id },
      select: { currentNeedText: true },
    });
    expect(profile.currentNeedText).toBe(needText);
    expect(
      await prisma.founderNeed.findMany({
        where: { profile: { userId: user.id } },
        select: { topicId: true },
      }),
    ).toEqual([{ topicId: gtm }]);
  });

  it('stores custom expertise and need text as text without creating taxonomy', async () => {
    const user = await approvedFounder('custom-text');
    await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Custom Text Founder' }),
    });
    const product = await topicId('product');
    const beforeCount = await prisma.taxonomyTopic.count();
    const custom = '<script>alert(1)</script> Marketplace ops';
    const need =
      '<img src=x onerror=alert(1)> Finding founders who launched in UAE.';
    const expertise = await request('/v1/me/expertise', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({
        topicIds: [product],
        customExpertise: custom,
      }),
    });
    expect(expertise.status).toBe(200);
    const needs = await request('/v1/me/needs', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ topicIds: [], currentNeedText: need }),
    });
    expect(needs.status).toBe(200);
    const body = (await needs.json()) as OnboardingProfileResponse;
    expect(body.profile.customExpertise).toBe(custom);
    expect(body.profile.currentNeedText).toBe(need);
    expect(await prisma.taxonomyTopic.count()).toBe(beforeCount);
    expect(
      await prisma.taxonomyTopic.findUnique({
        where: { slug: 'scriptalert1script-marketplace-ops' },
      }),
    ).toBeNull();
  });

  it('completes onboarding idempotently and activates membership', async () => {
    const user = await approvedFounder('complete');
    const incomplete = await request(
      '/v1/me/onboarding/complete',
      user.cookie,
      {
        method: 'POST',
        body: '{}',
      },
    );
    expect(incomplete.status).toBe(400);
    await expect(incomplete.json()).resolves.toMatchObject({
      error: { code: 'ONBOARDING_INCOMPLETE' },
    });
    const beforeComplete = await snapshotApplication(user.id);
    await saveReadyProfile(user.cookie);
    const first = await request('/v1/me/onboarding/complete', user.cookie, {
      method: 'POST',
      body: '{}',
    });
    expect(first.status).toBe(200);
    const completed = (await first.json()) as OnboardingCompleteResponse;
    const stamped = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { onboardingCompletedAt: true },
    });
    expect(stamped.onboardingCompletedAt?.toISOString()).toBe(
      completed.onboardingCompletedAt,
    );
    const session = (await (
      await request('/v1/auth/session', user.cookie)
    ).json()) as AuthSessionResponse;
    expect(session.access).toEqual({
      state: 'ACTIVE',
      applicationStatus: 'APPROVED',
      onboardingCompleted: true,
    });
    const second = await request('/v1/me/onboarding/complete', user.cookie, {
      method: 'POST',
      body: JSON.stringify({ onboardingCompletedAt: '2020-01-01' }),
    });
    expect(second.status).toBe(400);
    const repeat = await request('/v1/me/onboarding/complete', user.cookie, {
      method: 'POST',
      body: '{}',
    });
    expect(repeat.status).toBe(200);
    const repeated = (await repeat.json()) as OnboardingCompleteResponse;
    expect(repeated.onboardingCompletedAt).toBe(
      completed.onboardingCompletedAt,
    );
    expect(await snapshotApplication(user.id)).toEqual(beforeComplete);
    expect((await request('/v1/me/profile', user.cookie)).status).toBe(200);
    const expertiseId = await topicId('marketplace-gtm');
    const deniedProfile = await request('/v1/me/profile', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Should Not Save' }),
    });
    const deniedExpertise = await request('/v1/me/expertise', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ topicIds: [expertiseId] }),
    });
    const deniedNeeds = await request('/v1/me/needs', user.cookie, {
      method: 'PUT',
      body: JSON.stringify({ topicIds: [], currentNeedText: needText }),
    });
    for (const denied of [deniedProfile, deniedExpertise, deniedNeeds]) {
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toMatchObject({
        error: { code: 'AUTH_FORBIDDEN' },
      });
    }
    const stillComplete = await request(
      '/v1/me/onboarding/complete',
      user.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(stillComplete.status).toBe(200);
    await expect(stillComplete.json()).resolves.toMatchObject({
      onboardingCompletedAt: completed.onboardingCompletedAt,
    });
    const persisted = await prisma.founderProfile.findUniqueOrThrow({
      where: { userId: user.id },
      select: { displayName: true },
    });
    expect(persisted.displayName).toBe('Chaitanya Pandita');
  });

  it('handles concurrent completion with one stable timestamp', async () => {
    const user = await approvedFounder('complete-race');
    await saveReadyProfile(user.cookie);
    const responses = await Promise.all([
      request('/v1/me/onboarding/complete', user.cookie, {
        method: 'POST',
        body: '{}',
      }),
      request('/v1/me/onboarding/complete', user.cookie, {
        method: 'POST',
        body: '{}',
      }),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 200]);
    const bodies = (await Promise.all(
      responses.map((response) => response.json()),
    )) as OnboardingCompleteResponse[];
    const first = bodies[0];
    const second = bodies[1];
    if (!first || !second) {
      throw new Error('expected two completion responses');
    }
    expect(first.onboardingCompletedAt).toBe(second.onboardingCompletedAt);
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { onboardingCompletedAt: true },
      }),
    ).toMatchObject({
      onboardingCompletedAt: new Date(first.onboardingCompletedAt),
    });
  });

  it('does not let admin approval create a profile or complete onboarding', async () => {
    const user = await approvedFounder('approval-regression');
    expect(
      await prisma.founderProfile.findUnique({ where: { userId: user.id } }),
    ).toBeNull();
    const session = (await (
      await request('/v1/auth/session', user.cookie)
    ).json()) as AuthSessionResponse;
    expect(session.access.state).toBe('ONBOARDING');
    expect(session.access.onboardingCompleted).toBe(false);
  });
});
