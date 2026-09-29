import type { AddressInfo } from 'node:net';

import type {
  DiscoverFoundersResponse,
  MemberFounderProfileResponse,
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

describe('founder discover HTTP integration', { timeout: 30_000 }, () => {
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
    await ensureOnboardingTaxonomy(prisma, true);
  }, 60_000);

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
        await prisma.savedFounder.deleteMany({
          where: {
            OR: [
              { saverId: { in: userIds } },
              { savedFounderId: { in: userIds } },
            ],
          },
        });
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
      profile?: boolean;
      company?: boolean;
      displayName?: string;
      city?: string;
      country?: string;
      industry?: string;
      stage?: string;
      customExpertise?: string | null;
      currentNeedText?: string | null;
      bio?: string | null;
      headline?: string | null;
      expertiseSlugs?: string[];
    } = {},
  ): Promise<{ id: string; cookie: string; email: string }> {
    const onboarded = extras.onboarded ?? true;
    const user = await prisma.user.create({
      data: {
        email: `fc010-${label}-${Date.now()}-${userIds.length}@example.com`,
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
    if (extras.profile !== false) {
      const profile = await prisma.founderProfile.create({
        data: {
          userId: user.id,
          displayName: extras.displayName ?? `Founder ${label}`,
          headline: extras.headline ?? null,
          bio: extras.bio ?? null,
          city: extras.city ?? 'Dubai',
          country: extras.country ?? 'UAE',
          customExpertise: extras.customExpertise ?? null,
          currentNeedText: extras.currentNeedText ?? null,
        },
      });
      if (extras.company !== false) {
        await prisma.company.create({
          data: {
            founderProfileId: profile.id,
            name: extras.displayName
              ? `${extras.displayName} Co`
              : `${label} Co`,
            industry: extras.industry ?? 'Marketplace',
            stage: extras.stage ?? 'Seed',
            city: extras.city ?? 'Dubai',
            country: extras.country ?? 'UAE',
            description: 'A real company summary.',
          },
        });
      }
      for (const slug of extras.expertiseSlugs ?? []) {
        const topic = await prisma.taxonomyTopic.findUniqueOrThrow({
          where: { slug },
          select: { id: true },
        });
        await prisma.founderExpertise.create({
          data: { profileId: profile.id, topicId: topic.id },
        });
      }
    }
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-010 integration test',
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

  function privateLeak(payload: unknown): string {
    return JSON.stringify(payload);
  }

  it('requires an ACTIVE member and excludes ineligible callers and targets', async () => {
    const viewer = await member('viewer', { displayName: 'Zelda Viewer' });
    expect((await request('/v1/founders')).status).toBe(401);
    const unverified = await member('unverified-caller', { verified: false });
    expect((await request('/v1/founders', unverified.cookie)).status).toBe(403);
    const incomplete = await member('incomplete-caller', { onboarded: false });
    expect((await request('/v1/founders', incomplete.cookie)).status).toBe(403);
    const unapproved = await member('unapproved-caller', {
      applicationStatus: 'SUBMITTED',
    });
    expect((await request('/v1/founders', unapproved.cookie)).status).toBe(403);
    const suspended = await member('suspended-caller', { status: 'SUSPENDED' });
    expect((await request('/v1/founders', suspended.cookie)).status).toBe(403);

    await member('unverified-target', {
      verified: false,
      displayName: 'Hidden Unverified',
    });
    await member('unapproved-target', {
      applicationStatus: 'REJECTED',
      displayName: 'Hidden Unapproved',
    });
    await member('incomplete-target', {
      onboarded: false,
      displayName: 'Hidden Incomplete',
    });
    await member('suspended-target', {
      status: 'SUSPENDED',
      displayName: 'Hidden Suspended',
    });
    await member('deleted-target', {
      status: 'DELETED',
      displayName: 'Hidden Deleted',
    });
    await member('no-company', {
      company: false,
      displayName: 'Hidden No Company',
    });
    const visible = await member('visible-target', {
      displayName: 'Ada Visible',
    });

    const listed = (await (
      await request('/v1/founders', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    const names = listed.founders.map((founder) => founder.displayName);
    expect(names).toContain('Ada Visible');
    expect(names).not.toContain('Zelda Viewer');
    expect(names.join(' ')).not.toMatch(/Hidden/);
    expect(privateLeak(listed)).not.toMatch(
      /passwordHash|emailVerifiedAt|suspensionReason|deletedAt|onboardingCompletedAt|Secret Role|HiddenCity|adminRoles|permission/i,
    );

    const missing = await request('/v1/founders/does-not-exist', viewer.cookie);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'FOUNDER_NOT_FOUND' },
    });
    expect(
      (await request(`/v1/founders/${suspended.id}`, viewer.cookie)).status,
    ).toBe(404);
    const own = await request(`/v1/founders/${viewer.id}`, viewer.cookie);
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as MemberFounderProfileResponse;
    expect(ownBody.founder.isSelf).toBe(true);
    expect(ownBody.founder.savedByMe).toBe(false);
    expect(ownBody.founder.memberSinceYear).toBe(2026);
    expect(ownBody.founder.id).toBe(viewer.id);
    expect(ownBody.founder).not.toHaveProperty('onboardingCompletedAt');
    expect(ownBody.founder).not.toHaveProperty('email');
    expect(ownBody.founder.company).not.toHaveProperty('id');
    expect(Object.keys(ownBody.founder.company).sort()).toEqual(
      [
        'city',
        'country',
        'description',
        'industry',
        'name',
        'stage',
        'website',
      ].sort(),
    );
    expect(JSON.stringify(ownBody)).not.toContain('Secret Role');
    const ownKeys = Object.keys(ownBody.founder).sort();
    expect(ownKeys).toEqual(
      [
        'avatarUrl',
        'bio',
        'city',
        'company',
        'country',
        'currentNeedText',
        'customExpertise',
        'displayName',
        'expertise',
        'headline',
        'id',
        'isSelf',
        'memberSinceYear',
        'needs',
        'savedByMe',
      ].sort(),
    );

    const ownMissingCompany = await member('own-no-company', {
      company: false,
      displayName: 'Own Missing Company',
    });
    expect(
      (
        await request(
          `/v1/founders/${ownMissingCompany.id}`,
          ownMissingCompany.cookie,
        )
      ).status,
    ).toBe(404);

    const other = (await (
      await request(`/v1/founders/${visible.id}`, viewer.cookie)
    ).json()) as MemberFounderProfileResponse;
    expect(other.founder.isSelf).toBe(false);
    expect(other.founder.company.name).toContain('Ada Visible');
  });

  it('searches, filters, orders, and paginates without searching needs or writing taxonomy', async () => {
    const viewer = await member('search-viewer', { displayName: 'Viewer One' });
    await member('alpha', {
      displayName: 'Alpha Founder',
      country: 'UAE',
      industry: 'Marketplace',
      stage: 'Seed',
      expertiseSlugs: ['b2b-sales'],
      customExpertise: 'Outstation taxi ops',
      currentNeedText: 'UNIQUE_NEED_PHRASE_SHOULD_NOT_MATCH',
    });
    await member('beta', {
      displayName: 'Beta Founder',
      country: 'India',
      city: 'Bengaluru',
      industry: 'Climate',
      stage: 'Series A',
      expertiseSlugs: ['product'],
    });
    await member('same-a', { displayName: 'Same Name' });
    await member('same-b', { displayName: 'Same Name' });
    const before = await prisma.taxonomyTopic.count();
    const byName = (await (
      await request('/v1/founders?q=Alpha%20Founder', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(byName.founders.map((founder) => founder.displayName)).toEqual([
      'Alpha Founder',
    ]);
    const byCompany = (await (
      await request('/v1/founders?q=Beta%20Founder%20Co', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(byCompany.founders[0]?.displayName).toBe('Beta Founder');
    const byPlace = (await (
      await request('/v1/founders?q=Bengaluru', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(byPlace.founders[0]?.displayName).toBe('Beta Founder');
    const byIndustry = (await (
      await request('/v1/founders?q=Climate', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(byIndustry.founders[0]?.displayName).toBe('Beta Founder');
    const byExpertise = (await (
      await request('/v1/founders?q=B2B%20sales', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(byExpertise.founders[0]?.displayName).toBe('Alpha Founder');
    const byCustom = (await (
      await request('/v1/founders?q=Outstation%20taxi', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(byCustom.founders[0]?.displayName).toBe('Alpha Founder');
    const needSearch = (await (
      await request(
        '/v1/founders?q=UNIQUE_NEED_PHRASE_SHOULD_NOT_MATCH',
        viewer.cookie,
      )
    ).json()) as DiscoverFoundersResponse;
    expect(needSearch.founders).toHaveLength(0);
    const admission = (await (
      await request('/v1/founders?q=Admission%20only', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(admission.founders).toHaveLength(0);
    const secretRole = (await (
      await request('/v1/founders?q=Secret%20Role', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(secretRole.founders).toHaveLength(0);
    const emailSearch = (await (
      await request(
        `/v1/founders?q=${encodeURIComponent(viewer.email)}`,
        viewer.cookie,
      )
    ).json()) as DiscoverFoundersResponse;
    expect(emailSearch.founders).toHaveLength(0);

    const country = (await (
      await request('/v1/founders?country=uae', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(country.founders.every((founder) => founder.country === 'UAE')).toBe(
      true,
    );
    const sales = await prisma.taxonomyTopic.findUniqueOrThrow({
      where: { slug: 'b2b-sales' },
    });
    const combined = (await (
      await request(
        `/v1/founders?country=UAE&stage=Seed&expertiseTopicId=${sales.id}`,
        viewer.cookie,
      )
    ).json()) as DiscoverFoundersResponse;
    expect(combined.founders.map((founder) => founder.displayName)).toEqual([
      'Alpha Founder',
    ]);
    const ordered = (await (
      await request('/v1/founders?q=Same%20Name&pageSize=20', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    const same = ordered.founders.filter(
      (founder) => founder.displayName === 'Same Name',
    );
    expect(same.map((founder) => founder.id)).toEqual(
      [...same.map((founder) => founder.id)].sort(),
    );
    expect(
      (await request('/v1/founders?pageSize=51', viewer.cookie)).status,
    ).toBe(400);
    expect(
      (await request(`/v1/founders?q=${'x'.repeat(101)}`, viewer.cookie))
        .status,
    ).toBe(400);
    const paged = (await (
      await request('/v1/founders?page=1&pageSize=1', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(paged.founders).toHaveLength(1);
    expect(paged.pageSize).toBe(1);
    expect(paged.totalPages).toBeGreaterThanOrEqual(1);
    expect(await prisma.taxonomyTopic.count()).toBe(before);
  });

  it('hides inactive and merged expertise from member surfaces', async () => {
    const viewer = await member('topic-viewer');
    const target = await member('topic-target', {
      displayName: 'Topic Target',
    });
    const suffix = `${Date.now()}-${target.id.slice(-6)}`;
    const inactiveTopic = await prisma.taxonomyTopic.create({
      data: {
        slug: `fc010-inactive-${suffix}`,
        label: `UNIQUE_INACTIVE_${suffix}`,
        isActive: true,
      },
    });
    const mergedTopic = await prisma.taxonomyTopic.create({
      data: {
        slug: `fc010-merged-${suffix}`,
        label: `UNIQUE_MERGED_${suffix}`,
        isActive: true,
      },
    });
    const profileId = (
      await prisma.founderProfile.findUniqueOrThrow({
        where: { userId: target.id },
        select: { id: true },
      })
    ).id;
    await prisma.founderExpertise.createMany({
      data: [
        { profileId, topicId: inactiveTopic.id },
        { profileId, topicId: mergedTopic.id },
      ],
    });
    try {
      await prisma.taxonomyTopic.update({
        where: { id: inactiveTopic.id },
        data: { isActive: false },
      });
      await prisma.taxonomyTopic.update({
        where: { id: mergedTopic.id },
        data: { mergedIntoId: inactiveTopic.id },
      });
      const profile = (await (
        await request(`/v1/founders/${target.id}`, viewer.cookie)
      ).json()) as MemberFounderProfileResponse;
      expect(profile.founder.expertise).toEqual([]);
      const listed = (await (
        await request('/v1/founders', viewer.cookie)
      ).json()) as DiscoverFoundersResponse;
      expect(
        listed.founders.find((founder) => founder.id === target.id)?.expertise,
      ).toEqual([]);
      expect(
        listed.expertiseTopics.some((topic) => topic.id === inactiveTopic.id),
      ).toBe(false);
      expect(
        listed.expertiseTopics.some((topic) => topic.id === mergedTopic.id),
      ).toBe(false);
      const inactiveSearch = (await (
        await request(
          `/v1/founders?q=${encodeURIComponent(inactiveTopic.label)}`,
          viewer.cookie,
        )
      ).json()) as DiscoverFoundersResponse;
      expect(
        inactiveSearch.founders.some((founder) => founder.id === target.id),
      ).toBe(false);
      const mergedSearch = (await (
        await request(
          `/v1/founders?q=${encodeURIComponent(mergedTopic.label)}`,
          viewer.cookie,
        )
      ).json()) as DiscoverFoundersResponse;
      expect(
        mergedSearch.founders.some((founder) => founder.id === target.id),
      ).toBe(false);
      expect(
        (
          await request(
            `/v1/founders?expertiseTopicId=${inactiveTopic.id}`,
            viewer.cookie,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(
            `/v1/founders?expertiseTopicId=${mergedTopic.id}`,
            viewer.cookie,
          )
        ).status,
      ).toBe(400);
    } finally {
      await prisma.founderExpertise.deleteMany({
        where: { topicId: { in: [inactiveTopic.id, mergedTopic.id] } },
      });
      await prisma.taxonomyTopic.update({
        where: { id: mergedTopic.id },
        data: { mergedIntoId: null },
      });
      await prisma.taxonomyTopic.deleteMany({
        where: { id: { in: [mergedTopic.id, inactiveTopic.id] } },
      });
    }
  });

  it('saves and unsaves idempotently with origin, isolation, and concurrency safety', async () => {
    const saver = await member('saver', { displayName: 'Saver Founder' });
    const other = await member('saved-target', {
      displayName: 'Saved Target',
    });
    const stranger = await member('stranger', { displayName: 'Stranger' });
    const selfSave = await request(
      `/v1/founders/${saver.id}/save`,
      saver.cookie,
      {
        method: 'POST',
        body: '{}',
      },
    );
    expect(selfSave.status).toBe(409);
    await expect(selfSave.json()).resolves.toMatchObject({
      error: { code: 'FOUNDER_INVALID_SAVE' },
    });
    expect(
      await prisma.savedFounder.count({
        where: { saverId: saver.id, savedFounderId: saver.id },
      }),
    ).toBe(0);

    const selfUnsave = await request(
      `/v1/founders/${saver.id}/save`,
      saver.cookie,
      { method: 'DELETE', body: '{}' },
    );
    expect(selfUnsave.status).toBe(200);
    expect(
      await prisma.savedFounder.count({
        where: { saverId: saver.id, savedFounderId: saver.id },
      }),
    ).toBe(0);

    const first = await request(`/v1/founders/${other.id}/save`, saver.cookie, {
      method: 'POST',
      body: '{}',
    });
    expect(first.status).toBe(200);
    const repeated = await request(
      `/v1/founders/${other.id}/save`,
      saver.cookie,
      { method: 'POST', body: '{}' },
    );
    expect(repeated.status).toBe(200);
    expect(
      await prisma.savedFounder.count({
        where: { saverId: saver.id, savedFounderId: other.id },
      }),
    ).toBe(1);
    const bodySave = await request(
      `/v1/founders/${other.id}/save`,
      saver.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          saverId: stranger.id,
          savedFounderId: stranger.id,
          userId: stranger.id,
          profileId: 'profile-1',
          companyId: 'company-1',
          createdAt: 'now',
          saved: true,
          arbitraryKey: 1,
        }),
      },
    );
    expect(bodySave.status).toBe(400);
    const origin = await request(
      `/v1/founders/${other.id}/save`,
      saver.cookie,
      { method: 'POST', body: '{}' },
      'https://attacker.example',
    );
    expect(origin.status).toBe(403);

    const listed = (await (
      await request('/v1/founders?saved=true', saver.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(listed.founders.map((founder) => founder.id)).toEqual([other.id]);
    expect(listed.savedCount).toBe(1);
    const strangerList = (await (
      await request('/v1/founders?saved=true', stranger.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(strangerList.founders).toHaveLength(0);

    await prisma.user.update({
      where: { id: other.id },
      data: { status: 'SUSPENDED' },
    });
    const stale = (await (
      await request('/v1/me/saved-founders', saver.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(stale.founders).toHaveLength(0);
    expect(
      await prisma.savedFounder.count({
        where: { saverId: saver.id, savedFounderId: other.id },
      }),
    ).toBe(1);
    const discoverCount = (await (
      await request('/v1/founders', saver.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(discoverCount.savedCount).toBe(0);
    await prisma.user.update({
      where: { id: other.id },
      data: { status: 'ACTIVE' },
    });

    const unsaved = await request(
      `/v1/founders/${other.id}/save`,
      saver.cookie,
      { method: 'DELETE', body: '{}' },
    );
    expect(unsaved.status).toBe(200);
    const unsavedAgain = await request(
      `/v1/founders/${other.id}/save`,
      saver.cookie,
      { method: 'DELETE', body: '{}' },
    );
    expect(unsavedAgain.status).toBe(200);

    const raceTarget = await member('race-target', {
      displayName: 'Race Target',
    });
    const duplicate = await Promise.all([
      request(`/v1/founders/${raceTarget.id}/save`, saver.cookie, {
        method: 'POST',
        body: '{}',
      }),
      request(`/v1/founders/${raceTarget.id}/save`, saver.cookie, {
        method: 'POST',
        body: '{}',
      }),
    ]);
    expect(duplicate.every((response) => response.status === 200)).toBe(true);
    expect(
      await prisma.savedFounder.count({
        where: { saverId: saver.id, savedFounderId: raceTarget.id },
      }),
    ).toBe(1);

    const mixed = await Promise.all([
      request(`/v1/founders/${raceTarget.id}/save`, saver.cookie, {
        method: 'POST',
        body: '{}',
      }),
      request(`/v1/founders/${raceTarget.id}/save`, saver.cookie, {
        method: 'DELETE',
        body: '{}',
      }),
    ]);
    expect(mixed.every((response) => [200].includes(response.status))).toBe(
      true,
    );
    expect(
      await prisma.savedFounder.count({
        where: { saverId: saver.id, savedFounderId: raceTarget.id },
      }),
    ).toBeLessThanOrEqual(1);

    const unavailable = await member('save-unavailable', {
      status: 'SUSPENDED',
      displayName: 'Unavailable Save',
    });
    expect(
      (
        await request(`/v1/founders/${unavailable.id}/save`, saver.cookie, {
          method: 'POST',
          body: '{}',
        })
      ).status,
    ).toBe(404);
  });

  it('returns optional profile fields and omits blank about', async () => {
    const viewer = await member('optional-viewer');
    const target = await member('optional-target', {
      displayName: 'Optional Target',
      headline: 'Stored headline',
      bio: 'A real bio.',
      customExpertise: 'Marketplace ops',
      currentNeedText: 'Hiring a senior product leader in travel.',
      expertiseSlugs: ['partnerships'],
    });
    const body = (await (
      await request(`/v1/founders/${target.id}`, viewer.cookie)
    ).json()) as MemberFounderProfileResponse;
    expect(body.founder.headline).toBe('Stored headline');
    expect(body.founder.bio).toBe('A real bio.');
    expect(body.founder.customExpertise).toBe('Marketplace ops');
    expect(body.founder.currentNeedText).toContain('Hiring');
    expect(body.founder.expertise.map((topic) => topic.slug)).toEqual([
      'partnerships',
    ]);
    const blank = await member('blank-about', {
      displayName: 'Blank About',
      bio: null,
      headline: null,
    });
    const blankBody = (await (
      await request(`/v1/founders/${blank.id}`, viewer.cookie)
    ).json()) as MemberFounderProfileResponse;
    expect(blankBody.founder.bio).toBeNull();
    expect(blankBody.founder.headline).toBeNull();
  });

  it('keeps counts, exact filters, AND semantics, and GET reads side-effect free', async () => {
    const viewer = await member('count-viewer', {
      displayName: 'Count Viewer Unique',
    });
    const marker = `CountProbe ${Date.now()}`;
    const visible = await member('count-visible', {
      displayName: marker,
      country: 'United Arab Emirates',
      industry: 'Marketplace',
      stage: 'Seed',
      expertiseSlugs: ['b2b-sales', 'product'],
    });
    await member('count-india', {
      displayName: `${marker} India`,
      country: 'India',
      industry: 'Marketplace',
      stage: 'Seed',
      expertiseSlugs: ['b2b-sales'],
    });
    await member('count-stage', {
      displayName: `${marker} Series`,
      country: 'United Arab Emirates',
      industry: 'Marketplace',
      stage: 'Series A',
      expertiseSlugs: ['b2b-sales'],
    });
    await member('count-hidden', {
      status: 'SUSPENDED',
      displayName: `${marker} Hidden`,
      country: 'United Arab Emirates',
      industry: 'Marketplace',
      stage: 'Seed',
    });
    const savedPeer = await member('count-saved-peer', {
      displayName: `${marker} Saved`,
      country: 'United Arab Emirates',
      industry: 'Marketplace',
      stage: 'Seed',
      expertiseSlugs: ['b2b-sales'],
    });
    await request(`/v1/founders/${savedPeer.id}/save`, viewer.cookie, {
      method: 'POST',
      body: '{}',
    });

    const isolated = (await (
      await request(
        `/v1/founders?q=${encodeURIComponent(marker)}`,
        viewer.cookie,
      )
    ).json()) as DiscoverFoundersResponse;
    expect(isolated.founders).toHaveLength(4);
    expect(isolated.total).toBe(4);
    expect(isolated.founders.some((founder) => founder.id === viewer.id)).toBe(
      false,
    );

    const countryExact = (await (
      await request('/v1/founders?country=United', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(
      countryExact.founders.some((founder) => founder.id === visible.id),
    ).toBe(false);
    const countryContains = (await (
      await request('/v1/founders?q=United', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(
      countryContains.founders.some((founder) => founder.id === visible.id),
    ).toBe(true);

    const sales = await prisma.taxonomyTopic.findUniqueOrThrow({
      where: { slug: 'b2b-sales' },
    });
    const andAll = (await (
      await request(
        `/v1/founders?country=United%20Arab%20Emirates&industry=Marketplace&stage=Seed&expertiseTopicId=${sales.id}&saved=true`,
        viewer.cookie,
      )
    ).json()) as DiscoverFoundersResponse;
    expect(andAll.founders.map((founder) => founder.id)).toEqual([
      savedPeer.id,
    ]);
    expect(andAll.total).toBe(1);
    expect(andAll.saved).toBe(true);

    const savedFalse = (await (
      await request(
        `/v1/founders?q=${encodeURIComponent(marker)}&saved=false`,
        viewer.cookie,
      )
    ).json()) as DiscoverFoundersResponse;
    expect(savedFalse.total).toBe(4);
    expect(savedFalse.saved).toBe(false);

    const duplicateExpertise = (await (
      await request(
        `/v1/founders?q=${encodeURIComponent(marker)}&expertiseTopicId=${sales.id}`,
        viewer.cookie,
      )
    ).json()) as DiscoverFoundersResponse;
    const ids = duplicateExpertise.founders.map((founder) => founder.id);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids.filter((id) => id === visible.id)).toHaveLength(1);

    const tieName = `Tie ${Date.now()}`;
    const firstTie = await member('tie-a', { displayName: tieName });
    const secondTie = await member('tie-b', { displayName: tieName });
    const pageOne = (await (
      await request(
        `/v1/founders?q=${encodeURIComponent(tieName)}&page=1&pageSize=1`,
        viewer.cookie,
      )
    ).json()) as DiscoverFoundersResponse;
    const pageTwo = (await (
      await request(
        `/v1/founders?q=${encodeURIComponent(tieName)}&page=2&pageSize=1`,
        viewer.cookie,
      )
    ).json()) as DiscoverFoundersResponse;
    expect(pageOne.total).toBe(2);
    expect(pageOne.totalPages).toBe(2);
    expect(pageOne.founders).toHaveLength(1);
    expect(pageTwo.founders).toHaveLength(1);
    expect(pageOne.founders[0]?.id).not.toBe(pageTwo.founders[0]?.id);
    expect([pageOne.founders[0]?.id, pageTwo.founders[0]?.id].sort()).toEqual(
      [firstTie.id, secondTie.id].sort(),
    );
    const orderedIds = [firstTie.id, secondTie.id].sort();
    expect(pageOne.founders[0]?.id).toBe(orderedIds[0]);
    expect(pageTwo.founders[0]?.id).toBe(orderedIds[1]);

    const trackedUserIds = [
      viewer.id,
      visible.id,
      savedPeer.id,
      firstTie.id,
      secondTie.id,
    ];
    const beforeTopics = await prisma.taxonomyTopic.findMany({
      where: { slug: { in: ['b2b-sales', 'product', 'fundraising'] } },
      select: {
        id: true,
        slug: true,
        label: true,
        isActive: true,
        mergedIntoId: true,
        updatedAt: true,
      },
      orderBy: { slug: 'asc' },
    });
    const beforeSaves = await prisma.savedFounder.findMany({
      where: { saverId: viewer.id },
      select: { saverId: true, savedFounderId: true, createdAt: true },
      orderBy: { savedFounderId: 'asc' },
    });
    const beforeProfiles = await prisma.founderProfile.findMany({
      where: { userId: { in: trackedUserIds } },
      select: { id: true, userId: true, updatedAt: true },
      orderBy: { userId: 'asc' },
    });
    const beforeUpdated = await prisma.user.findMany({
      where: { id: { in: [viewer.id, visible.id] } },
      select: { id: true, updatedAt: true },
    });
    await request('/v1/founders', viewer.cookie);
    await request(`/v1/founders/${visible.id}`, viewer.cookie);
    await request('/v1/me/saved-founders', viewer.cookie);
    const afterTopics = await prisma.taxonomyTopic.findMany({
      where: { slug: { in: ['b2b-sales', 'product', 'fundraising'] } },
      select: {
        id: true,
        slug: true,
        label: true,
        isActive: true,
        mergedIntoId: true,
        updatedAt: true,
      },
      orderBy: { slug: 'asc' },
    });
    expect(
      afterTopics.map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
    ).toEqual(
      beforeTopics.map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
    );
    expect(
      (
        await prisma.savedFounder.findMany({
          where: { saverId: viewer.id },
          select: { saverId: true, savedFounderId: true, createdAt: true },
          orderBy: { savedFounderId: 'asc' },
        })
      ).map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    ).toEqual(
      beforeSaves.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    );
    expect(
      (
        await prisma.founderProfile.findMany({
          where: { userId: { in: trackedUserIds } },
          select: { id: true, userId: true, updatedAt: true },
          orderBy: { userId: 'asc' },
        })
      ).map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
    ).toEqual(
      beforeProfiles.map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
    );
    const afterUpdated = await prisma.user.findMany({
      where: { id: { in: [viewer.id, visible.id] } },
      select: { id: true, updatedAt: true },
    });
    expect(
      afterUpdated
        .map((row) => ({
          id: row.id,
          updatedAt: row.updatedAt.toISOString(),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual(
      beforeUpdated
        .map((row) => ({
          id: row.id,
          updatedAt: row.updatedAt.toISOString(),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );

    expect((await request('/v1/founders?page=0', viewer.cookie)).status).toBe(
      400,
    );
    expect((await request('/v1/founders?page=-1', viewer.cookie)).status).toBe(
      400,
    );
    expect((await request('/v1/founders?page=1.5', viewer.cookie)).status).toBe(
      400,
    );
    expect(
      (await request('/v1/founders?pageSize=0', viewer.cookie)).status,
    ).toBe(400);
    expect((await request('/v1/founders?q=a&q=b', viewer.cookie)).status).toBe(
      400,
    );
    expect(
      (await request('/v1/founders?country=UAE&country=India', viewer.cookie))
        .status,
    ).toBe(400);
    expect(
      (await request('/v1/founders?page=1&page=2', viewer.cookie)).status,
    ).toBe(400);
    expect(
      (await request('/v1/founders?saved=true&saved=false', viewer.cookie))
        .status,
    ).toBe(400);
    expect(
      (await request('/v1/founders?saved=yes', viewer.cookie)).status,
    ).toBe(400);
    expect((await request('/v1/founders?saved=1', viewer.cookie)).status).toBe(
      400,
    );
    expect(
      (await request('/v1/founders?country=%20%20', viewer.cookie)).status,
    ).toBe(400);
    expect(
      (await request('/v1/founders?country=' + 'x'.repeat(101), viewer.cookie))
        .status,
    ).toBe(400);
    expect(
      (await request('/v1/founders?saved=True', viewer.cookie)).status,
    ).toBe(400);
    expect((await request('/v1/founders?country=', viewer.cookie)).status).toBe(
      400,
    );
    expect(
      (await request('/v1/me/saved-founders?q=Ada', viewer.cookie)).status,
    ).toBe(400);
    expect(
      (await request(`/v1/founders/${'x'.repeat(65)}`, viewer.cookie)).status,
    ).toBe(404);

    const unavailable = await member('same-404', {
      status: 'SUSPENDED',
      displayName: 'Same 404 Target',
    });
    const profile404 = await request(
      `/v1/founders/${unavailable.id}`,
      viewer.cookie,
    );
    const save404 = await request(
      `/v1/founders/${unavailable.id}/save`,
      viewer.cookie,
      { method: 'POST', body: '{}' },
    );
    const missing404 = await request(
      '/v1/founders/does-not-exist-2',
      viewer.cookie,
    );
    const nullByte = await request('/v1/founders/%00', viewer.cookie);
    expect([400, 404]).toContain(nullByte.status);
    expect(nullByte.status).not.toBe(500);
    expect(profile404.status).toBe(404);
    expect(save404.status).toBe(404);
    expect(missing404.status).toBe(404);
    const profileJson = (await profile404.json()) as {
      error: { code: string; message: string };
    };
    const saveJson = (await save404.json()) as {
      error: { code: string; message: string };
    };
    expect(profileJson.error).toMatchObject({
      code: 'FOUNDER_NOT_FOUND',
      message: 'That founder is not available.',
    });
    expect(saveJson.error).toMatchObject({
      code: profileJson.error.code,
      message: profileJson.error.message,
    });
    expect(JSON.stringify(profileJson)).not.toMatch(
      /suspended|deleted|not approved|onboarding|missing company/i,
    );

    await prisma.user.update({
      where: { id: savedPeer.id },
      data: { status: 'SUSPENDED' },
    });
    const afterSuspend = (await (
      await request('/v1/founders', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    const savedList = (await (
      await request('/v1/me/saved-founders', viewer.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(afterSuspend.savedCount).toBe(0);
    expect(savedList.total).toBe(0);
    expect(savedList.founders).toHaveLength(0);
    expect(
      await prisma.savedFounder.count({
        where: { saverId: viewer.id, savedFounderId: savedPeer.id },
      }),
    ).toBe(1);
  });

  it('rejects saving a target that becomes unavailable', async () => {
    const saver = await member('race-saver', { displayName: 'Race Saver' });
    const target = await member('race-live', { displayName: 'Race Live' });
    const raced = await Promise.all([
      request(`/v1/founders/${target.id}/save`, saver.cookie, {
        method: 'POST',
        body: '{}',
      }),
      prisma.user.update({
        where: { id: target.id },
        data: { status: 'SUSPENDED' },
      }),
    ]);
    expect([200, 404]).toContain(raced[0].status);
    const body = (await raced[0].json()) as {
      saved?: boolean;
      savedCount?: number;
      error?: { code: string; message: string };
    };
    expect(JSON.stringify(body)).not.toMatch(
      /email|passwordHash|application|suspendedUntil/i,
    );
    if (raced[0].status === 404) {
      expect(body.error).toMatchObject({
        code: 'FOUNDER_NOT_FOUND',
        message: 'That founder is not available.',
      });
    } else {
      expect(body.saved).toBe(true);
    }
    expect(
      await prisma.savedFounder.count({
        where: { saverId: saver.id, savedFounderId: target.id },
      }),
    ).toBeLessThanOrEqual(1);
    const listed = (await (
      await request('/v1/founders', saver.cookie)
    ).json()) as DiscoverFoundersResponse;
    expect(listed.savedCount).toBe(0);
    expect(listed.founders.some((founder) => founder.id === target.id)).toBe(
      false,
    );
    expect(
      (await request(`/v1/founders/${target.id}`, saver.cookie)).status,
    ).toBe(404);
  });
});
