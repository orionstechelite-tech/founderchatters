import type { AddressInfo } from 'node:net';

import type {
  HelpResponseMutationResponse,
  MemberHelpResponsesResponse,
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

const ADVICE =
  'The biggest mistake we made was signing a broad distributor too early.';

describe('help responses HTTP integration', { timeout: 60_000 }, () => {
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
        await prisma.block.deleteMany({
          where: {
            OR: [
              { blockerId: { in: userIds } },
              { blockedId: { in: userIds } },
            ],
          },
        });
        await prisma.introductionOffer.deleteMany({
          where: {
            response: {
              OR: [
                { authorId: { in: userIds } },
                { request: { authorId: { in: userIds } } },
              ],
            },
          },
        });
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
        email: `fc012-${label}-${Date.now()}-${userIds.length}@example.com`,
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
    await prisma.founderProfile.create({
      data: {
        userId: user.id,
        displayName: extras.displayName ?? `Helper ${label}`,
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
      userAgent: 'FC-012 integration test',
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

  async function publishedRequest(authorId: string): Promise<string> {
    const created = await prisma.request.create({
      data: {
        authorId,
        type: 'ASK',
        status: 'PUBLISHED',
        headline: 'Looking for UAE B2B launch help',
        context:
          'We are entering the UAE next quarter and want practical partner-acquisition lessons.',
        urgency: 'THIS_WEEK',
        publishedAt: new Date(),
      },
    });
    return created.id;
  }

  function leak(payload: unknown): string {
    return JSON.stringify(payload);
  }

  function expectMinimized(payload: unknown) {
    const raw = leak(payload);
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
    expect(raw).not.toContain('"application"');
    expect(raw).not.toMatch(/fc012-[a-z0-9-]+@example\.com/);
  }

  it('requires an ACTIVE member and OriginGuard on mutations', async () => {
    const owner = await member('gate-owner', { displayName: 'Owner' });
    const requestId = await publishedRequest(owner.id);
    expect((await request(`/v1/requests/${requestId}/responses`)).status).toBe(
      401,
    );
    const unverified = await member('gate-unverified', { verified: false });
    expect(
      (await request(`/v1/requests/${requestId}/responses`, unverified.cookie))
        .status,
    ).toBe(403);
    const helper = await member('gate-helper');
    const missingOrigin = await request(
      `/v1/requests/${requestId}/responses/advice`,
      helper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: ADVICE }),
        headers: { origin: '' },
      },
      '',
    );
    expect(missingOrigin.status).toBe(403);
  });

  it('forbids self-response and block in either direction', async () => {
    const owner = await member('self-owner', { displayName: 'Owner' });
    const helper = await member('self-helper');
    const requestId = await publishedRequest(owner.id);
    const selfAdvice = await request(
      `/v1/requests/${requestId}/responses/advice`,
      owner.cookie,
      { method: 'POST', body: JSON.stringify({ body: ADVICE }) },
    );
    expect(selfAdvice.status).toBe(403);
    const selfBody = await json<{ error: { code: string; message: string } }>(
      selfAdvice,
    );
    expect(selfBody.error.code).toBe('HELP_RESPONSE_NOT_ALLOWED');
    expect(leak(selfBody)).not.toContain(owner.id);
    expect(selfBody.error.message).toBe('You cannot add this help response.');
    for (const path of [
      `/v1/requests/${requestId}/responses/introduction`,
      `/v1/requests/${requestId}/responses/private-chat`,
    ]) {
      const denied = await request(path, owner.cookie, {
        method: 'POST',
        body: JSON.stringify(
          path.endsWith('introduction')
            ? { personName: 'Self Person', permissionConfirmed: true }
            : {},
        ),
      });
      expect(denied.status).toBe(403);
      expect((await json<{ error: { code: string } }>(denied)).error.code).toBe(
        'HELP_RESPONSE_NOT_ALLOWED',
      );
    }

    await prisma.block.create({
      data: { blockerId: owner.id, blockedId: helper.id },
    });
    for (const [path, body] of [
      [
        `/v1/requests/${requestId}/responses/advice`,
        JSON.stringify({ body: ADVICE }),
      ],
      [
        `/v1/requests/${requestId}/responses/introduction`,
        JSON.stringify({
          personName: 'Blocked Person',
          permissionConfirmed: true,
        }),
      ],
      [`/v1/requests/${requestId}/responses/private-chat`, JSON.stringify({})],
    ] as const) {
      const blocked = await request(path, helper.cookie, {
        method: 'POST',
        body,
      });
      expect(blocked.status).toBe(403);
      expect(
        (await json<{ error: { code: string } }>(blocked)).error.code,
      ).toBe('HELP_RESPONSE_NOT_ALLOWED');
    }
  });

  it('creates advice, intro, and private-chat offers with one-per-type idempotency', async () => {
    const owner = await member('multi-owner', { displayName: 'Sarah Chen' });
    const helper = await member('multi-helper', { displayName: 'Chaitanya' });
    const requestId = await publishedRequest(owner.id);
    const advice = await request(
      `/v1/requests/${requestId}/responses/advice`,
      helper.cookie,
      { method: 'POST', body: JSON.stringify({ body: ADVICE }) },
    );
    expect(advice.status).toBe(201);
    const adviceBody = await json<HelpResponseMutationResponse>(advice);
    expect(adviceBody.response.type).toBe('ADVICE');
    expect(adviceBody.response.body).toBe(ADVICE);
    expectMinimized(adviceBody);

    const duplicate = await request(
      `/v1/requests/${requestId}/responses/advice`,
      helper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          body: 'A completely different retry body that should not overwrite.',
        }),
      },
    );
    expect(duplicate.status).toBe(201);
    const duplicateBody = await json<HelpResponseMutationResponse>(duplicate);
    expect(duplicateBody.response.id).toBe(adviceBody.response.id);
    expect(duplicateBody.response.body).toBe(ADVICE);

    const intro = await request(
      `/v1/requests/${requestId}/responses/introduction`,
      helper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          personName: 'Ravi Operator, FleetCo',
          reason: 'Can connect you with a founder in Abu Dhabi.',
          permissionConfirmed: true,
        }),
      },
    );
    expect(intro.status).toBe(201);
    const introBody = await json<HelpResponseMutationResponse>(intro);
    expect(introBody.response.type).toBe('INTRODUCTION_OFFER');
    expect(introBody.response.body).toBeNull();
    expect(introBody.response.introduction?.personName).toBe(
      'Ravi Operator, FleetCo',
    );
    expect(introBody.response.introduction?.status).toBe('CONSENT_PENDING');
    expect(
      await prisma.introductionOffer.count({
        where: { responseId: introBody.response.id },
      }),
    ).toBe(1);
    const introDuplicate = await request(
      `/v1/requests/${requestId}/responses/introduction`,
      helper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          personName: 'Replacement Person',
          reason: 'Replacement reason that must not overwrite.',
          permissionConfirmed: true,
        }),
      },
    );
    expect(introDuplicate.status).toBe(201);
    const introDupBody =
      await json<HelpResponseMutationResponse>(introDuplicate);
    expect(introDupBody.response.id).toBe(introBody.response.id);
    expect(introDupBody.response.introduction?.personName).toBe(
      'Ravi Operator, FleetCo',
    );
    expect(introDupBody.response.introduction?.reason).toBe(
      'Can connect you with a founder in Abu Dhabi.',
    );
    expect(
      await prisma.introductionOffer.count({
        where: { response: { requestId, authorId: helper.id } },
      }),
    ).toBe(1);

    const privateChat = await request(
      `/v1/requests/${requestId}/responses/private-chat`,
      helper.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(privateChat.status).toBe(201);
    const privateBody = await json<HelpResponseMutationResponse>(privateChat);
    expect(privateBody.response.type).toBe('PRIVATE_CHAT_OFFER');
    expect(privateBody.response.body).toBeNull();
    expect(await prisma.conversation.count({ where: { requestId } })).toBe(0);
    expect(
      await prisma.conversationParticipant.count({
        where: { userId: { in: [owner.id, helper.id] } },
      }),
    ).toBe(0);
    expect(
      await prisma.message.count({
        where: { senderId: { in: [owner.id, helper.id] } },
      }),
    ).toBe(0);
    const privateAgain = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${requestId}/responses/private-chat`,
        helper.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
    );
    expect(privateAgain.response.id).toBe(privateBody.response.id);
    expect(
      await prisma.requestResponse.count({
        where: {
          requestId,
          authorId: helper.id,
          type: 'PRIVATE_CHAT_OFFER',
        },
      }),
    ).toBe(1);

    const notifications = await prisma.notification.findMany({
      where: { userId: owner.id },
      select: {
        type: true,
        title: true,
        body: true,
        href: true,
      },
    });
    expect(notifications).toHaveLength(3);
    expect(notifications).toEqual(
      expect.arrayContaining([
        {
          type: 'REQUEST_ADVICE',
          title: 'New public advice',
          body: 'Chaitanya responded to your request.',
          href: `/requests/${requestId}`,
        },
        {
          type: 'INTRODUCTION_OFFERED',
          title: 'Introduction offered',
          body: 'Chaitanya offered an introduction.',
          href: `/requests/${requestId}`,
        },
        {
          type: 'PRIVATE_HELP_OFFER',
          title: 'Private help offered',
          body: 'Chaitanya offered to help privately.',
          href: `/requests/${requestId}`,
        },
      ]),
    );
    expect(JSON.stringify(notifications)).not.toContain(ADVICE);
    expect(JSON.stringify(notifications)).not.toContain(
      'Ravi Operator, FleetCo',
    );
    expect(JSON.stringify(notifications)).not.toContain(
      'Can connect you with a founder in Abu Dhabi.',
    );

    const listed = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, owner.cookie),
    );
    expect(listed.total).toBe(3);
    expect(listed.responses.map((row) => row.type)).toEqual([
      'ADVICE',
      'INTRODUCTION_OFFER',
      'PRIVATE_CHAT_OFFER',
    ]);
    expect(listed.canOfferHelp).toBe(false);
    const ownerIntro = listed.responses.find(
      (row) => row.type === 'INTRODUCTION_OFFER',
    );
    expect(ownerIntro?.introduction?.personName).toBeNull();
    expect(ownerIntro?.introduction?.reason).toBe(
      'Can connect you with a founder in Abu Dhabi.',
    );
    expect(ownerIntro?.introduction?.canConsent).toBe(true);
    expect(ownerIntro?.introduction?.canDecline).toBe(true);
    expect(ownerIntro?.introduction?.canCancel).toBe(false);
    expect(Object.keys(listed.responses[0]!.author!).sort()).toEqual([
      'avatarUrl',
      'city',
      'companyName',
      'country',
      'displayName',
      'id',
    ]);

    const helperList = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, helper.cookie),
    );
    const helperIntro = helperList.responses.find(
      (row) => row.type === 'INTRODUCTION_OFFER',
    );
    expect(helperIntro?.introduction?.personName).toBe(
      'Ravi Operator, FleetCo',
    );
    expect(helperIntro?.introduction?.canCancel).toBe(true);
    expect(helperIntro?.introduction?.canConsent).toBe(false);

    const stranger = await member('multi-stranger', { displayName: 'Maya' });
    const publicList = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, stranger.cookie),
    );
    const publicIntro = publicList.responses.find(
      (row) => row.type === 'INTRODUCTION_OFFER',
    );
    expect(publicIntro?.introduction).toBeNull();
    expect(leak(publicList)).not.toContain('Ravi Operator');
    expect(leak(publicList)).not.toContain('"canConsent"');
    expect(leak(publicList)).not.toContain('consentedAt');
    expect(leak(publicList)).not.toContain('introducedAt');
    expect(
      listed.responses[0]!.createdAt <= listed.responses[1]!.createdAt,
    ).toBe(true);
  });

  it('hides personName until requester consent and supports decline and cancel', async () => {
    const owner = await member('consent-owner', { displayName: 'Sarah' });
    const helper = await member('consent-helper', { displayName: 'Ahmed' });
    const requestId = await publishedRequest(owner.id);
    const created = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${requestId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Noura GTM',
            reason: 'Relevant UAE operator.',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const introId = created.response.introduction!.id;
    const pre = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, owner.cookie),
    );
    expect(pre.responses[0]?.introduction?.personName).toBeNull();
    expect(leak(pre.responses[0])).not.toMatch(/phone|linkedin|@/);

    const consented = await request(
      `/v1/introductions/${introId}/consent`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
    expect(consented.status).toBe(200);
    const consentedBody = await json<HelpResponseMutationResponse>(consented);
    expect(consentedBody.response.introduction?.status).toBe('INTRODUCED');
    expect(consentedBody.response.introduction?.personName).toBe('Noura GTM');
    const again = await request(
      `/v1/introductions/${introId}/consent`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
    expect(again.status).toBe(200);
    const againBody = await json<HelpResponseMutationResponse>(again);
    expect(againBody.response.introduction?.status).toBe('INTRODUCED');

    const acceptedNotifications = await prisma.notification.findMany({
      where: {
        userId: helper.id,
        type: 'INTRODUCTION_ACCEPTED',
      },
      select: {
        type: true,
        title: true,
        body: true,
        href: true,
      },
    });
    expect(acceptedNotifications).toEqual([
      {
        type: 'INTRODUCTION_ACCEPTED',
        title: 'Introduction accepted',
        body: 'Sarah accepted your introduction offer.',
        href: `/requests/${requestId}`,
      },
    ]);
    expect(JSON.stringify(acceptedNotifications)).not.toContain('Noura GTM');

    const otherId = await publishedRequest(owner.id);
    const pending = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${otherId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Pending Person',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const declined = await request(
      `/v1/introductions/${pending.response.introduction!.id}/decline`,
      owner.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(declined.status).toBe(200);
    expect(
      (await json<HelpResponseMutationResponse>(declined)).response.introduction
        ?.status,
    ).toBe('DECLINED');

    const cancelTarget = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${await publishedRequest(owner.id)}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Cancel Person',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const cancelled = await request(
      `/v1/introductions/${cancelTarget.response.introduction!.id}/cancel`,
      helper.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(cancelled.status).toBe(200);
    expect(
      (await json<HelpResponseMutationResponse>(cancelled)).response
        .introduction?.status,
    ).toBe('CANCELLED');
  });

  it('lets pending intros finish after resolve and rejects new responses', async () => {
    const owner = await member('resolved-owner');
    const helper = await member('resolved-helper');
    const requestId = await publishedRequest(owner.id);
    const intro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${requestId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Resolved Person',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const resolved = await request(
      `/v1/requests/${requestId}/resolve`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
    expect(resolved.status).toBe(200);
    const after = await request(
      `/v1/requests/${requestId}/responses/advice`,
      helper.cookie,
      { method: 'POST', body: JSON.stringify({ body: ADVICE }) },
    );
    expect(after.status).toBe(409);
    const finish = await request(
      `/v1/introductions/${intro.response.introduction!.id}/consent`,
      owner.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(finish.status).toBe(200);
    const history = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, helper.cookie),
    );
    expect(history.total).toBe(1);
    expect(history.canOfferHelp).toBe(false);
  });

  it('omits deleted responses, paginates oldest-first, and nulls ineligible authors', async () => {
    const owner = await member('list-owner');
    const helper = await member('list-helper', {
      displayName: 'Visible Helper',
    });
    const requestId = await publishedRequest(owner.id);
    await request(`/v1/requests/${requestId}/responses/advice`, helper.cookie, {
      method: 'POST',
      body: JSON.stringify({ body: ADVICE }),
    });
    const second = await member('list-second', { displayName: 'Second' });
    await request(`/v1/requests/${requestId}/responses/advice`, second.cookie, {
      method: 'POST',
      body: JSON.stringify({ body: `${ADVICE} second helper.` }),
    });
    const first = await prisma.requestResponse.findFirstOrThrow({
      where: { requestId, authorId: helper.id },
    });
    await prisma.requestResponse.update({
      where: { id: first.id },
      data: { deletedAt: new Date() },
    });
    const listed = await json<MemberHelpResponsesResponse>(
      await request(
        `/v1/requests/${requestId}/responses?page=1&pageSize=20`,
        owner.cookie,
      ),
    );
    expect(listed.total).toBe(1);
    expect(listed.responses).toHaveLength(1);
    expect(listed.responses[0]?.author?.displayName).toBe('Second');

    await prisma.user.update({
      where: { id: second.id },
      data: { status: 'SUSPENDED', suspendedUntil: new Date('2099-01-01') },
    });
    const afterSuspend = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, owner.cookie),
    );
    expect(afterSuspend.responses[0]?.author).toBeNull();

    const malformed = await request(
      `/v1/requests/${requestId}/responses?page=1&page=2`,
      owner.cookie,
    );
    expect(malformed.status).toBe(400);

    const draft = await prisma.request.create({
      data: {
        authorId: owner.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: 'Draft only',
        context: 'Not in the network yet and should not expose a thread.',
      },
    });
    expect(
      (await request(`/v1/requests/${draft.id}/responses`, owner.cookie))
        .status,
    ).toBe(404);
  });

  it('does not allow consent while blocked but still allows decline and cancel', async () => {
    const owner = await member('block-owner');
    const helper = await member('block-helper');
    const requestId = await publishedRequest(owner.id);
    const intro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${requestId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Blocked Person',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const cancelRequest = await publishedRequest(owner.id);
    const cancelIntro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${cancelRequest}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Cancel While Blocked',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    await prisma.block.create({
      data: { blockerId: helper.id, blockedId: owner.id },
    });
    const blockedConsent = await request(
      `/v1/introductions/${intro.response.introduction!.id}/consent`,
      owner.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(blockedConsent.status).toBe(403);
    const declined = await request(
      `/v1/introductions/${intro.response.introduction!.id}/decline`,
      owner.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(declined.status).toBe(200);
    const cancelled = await request(
      `/v1/introductions/${cancelIntro.response.introduction!.id}/cancel`,
      helper.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(cancelled.status).toBe(200);
  });

  it('serializes response create with published edit, resolve, and delete', async () => {
    const owner = await member('race-owner');
    const helper = await member('race-helper');
    const editId = await publishedRequest(owner.id);
    const original = 'Looking for UAE B2B launch help';
    const [editRes, adviceRes] = await Promise.all([
      request(`/v1/requests/${editId}`, owner.cookie, {
        method: 'PATCH',
        body: JSON.stringify({
          headline: 'Updated published headline after race',
          context:
            'We are entering the UAE next quarter and want practical partner-acquisition lessons.',
          urgency: 'TODAY',
        }),
      }),
      request(`/v1/requests/${editId}/responses/advice`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({ body: ADVICE }),
      }),
    ]);
    const adviceCount = await prisma.requestResponse.count({
      where: { requestId: editId, type: 'ADVICE' },
    });
    const afterEdit = await prisma.request.findUniqueOrThrow({
      where: { id: editId },
    });
    if (editRes.status === 200 && adviceRes.status === 201) {
      expect(adviceCount).toBe(1);
      expect(afterEdit.headline).toBe('Updated published headline after race');
    } else if (adviceRes.status === 201 && editRes.status === 409) {
      expect(adviceCount).toBe(1);
      expect(afterEdit.headline).toBe(original);
    } else {
      throw new Error(
        `Unexpected edit/advice race ${String(editRes.status)}/${String(adviceRes.status)}`,
      );
    }

    const resolveId = await publishedRequest(owner.id);
    const [resolveRes, resolveAdvice] = await Promise.all([
      request(`/v1/requests/${resolveId}/resolve`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      request(`/v1/requests/${resolveId}/responses/advice`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({ body: ADVICE }),
      }),
    ]);
    const resolved = await prisma.request.findUniqueOrThrow({
      where: { id: resolveId },
    });
    const resolveCount = await prisma.requestResponse.count({
      where: { requestId: resolveId },
    });
    expect(resolved.status).toBe('RESOLVED');
    if (resolveAdvice.status === 201) {
      expect(resolveCount).toBe(1);
    } else {
      expect(resolveRes.status).toBe(200);
      expect(resolveAdvice.status).toBe(409);
      expect(resolveCount).toBe(0);
    }

    const deleteId = await publishedRequest(owner.id);
    const [deleteRes, deleteAdvice] = await Promise.all([
      request(`/v1/requests/${deleteId}`, owner.cookie, { method: 'DELETE' }),
      request(`/v1/requests/${deleteId}/responses/advice`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({ body: ADVICE }),
      }),
    ]);
    const deleted = await prisma.request.findUniqueOrThrow({
      where: { id: deleteId },
    });
    const deleteCount = await prisma.requestResponse.count({
      where: { requestId: deleteId, type: 'ADVICE' },
    });
    if (deleteAdvice.status === 201) {
      expect(
        deleted.status === 'DELETED_BY_AUTHOR' || deleteRes.status === 200,
      ).toBe(true);
      expect(deleteCount).toBe(1);
    } else {
      expect(deleted.status).toBe('DELETED_BY_AUTHOR');
      expect(deleteAdvice.status).toBe(404);
      expect(deleteCount).toBe(0);
    }
  });

  it('keeps one row for concurrent duplicate posts and one terminal intro outcome', async () => {
    const owner = await member('dup-owner');
    const helper = await member('dup-helper');
    const requestId = await publishedRequest(owner.id);
    const [left, right] = await Promise.all([
      request(`/v1/requests/${requestId}/responses/advice`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({ body: ADVICE }),
      }),
      request(`/v1/requests/${requestId}/responses/advice`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({ body: ADVICE }),
      }),
    ]);
    expect([left.status, right.status].sort()).toEqual([201, 201]);
    expect(
      await prisma.requestResponse.count({
        where: { requestId, authorId: helper.id, type: 'ADVICE' },
      }),
    ).toBe(1);

    const introRequest = await publishedRequest(owner.id);
    const intro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${introRequest}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Race Person',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const introId = intro.response.introduction!.id;
    const [consentRes, cancelRes] = await Promise.all([
      request(`/v1/introductions/${introId}/consent`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      request(`/v1/introductions/${introId}/cancel`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    ]);
    const statuses = [consentRes.status, cancelRes.status].sort();
    expect(statuses).toEqual([200, 409]);
    const final = await prisma.introductionOffer.findUniqueOrThrow({
      where: { id: introId },
    });
    expect(['INTRODUCED', 'CANCELLED']).toContain(final.status);
    if (final.status === 'INTRODUCED') {
      expect(final.consentedAt).not.toBeNull();
      expect(final.introducedAt?.toISOString()).toBe(
        final.consentedAt?.toISOString(),
      );
    } else {
      expect(final.consentedAt).toBeNull();
      expect(final.introducedAt).toBeNull();
    }

    const declineRequest = await publishedRequest(owner.id);
    const pending = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${declineRequest}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Decline Race',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const [consentTwo, declineTwo] = await Promise.all([
      request(
        `/v1/introductions/${pending.response.introduction!.id}/consent`,
        owner.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
      request(
        `/v1/introductions/${pending.response.introduction!.id}/decline`,
        owner.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
    ]);
    expect([consentTwo.status, declineTwo.status].sort()).toEqual([200, 409]);
    const declinedFinal = await prisma.introductionOffer.findUniqueOrThrow({
      where: { id: pending.response.introduction!.id },
    });
    expect(['INTRODUCED', 'DECLINED']).toContain(declinedFinal.status);
    if (declinedFinal.status === 'DECLINED') {
      expect(declinedFinal.consentedAt).toBeNull();
      expect(declinedFinal.introducedAt).toBeNull();
    }

    const introDupId = await publishedRequest(owner.id);
    const [introLeft, introRight] = await Promise.all([
      request(
        `/v1/requests/${introDupId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Concurrent Intro',
            permissionConfirmed: true,
          }),
        },
      ),
      request(
        `/v1/requests/${introDupId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Concurrent Intro',
            permissionConfirmed: true,
          }),
        },
      ),
    ]);
    expect([introLeft.status, introRight.status].sort()).toEqual([201, 201]);
    expect(
      await prisma.requestResponse.count({
        where: {
          requestId: introDupId,
          authorId: helper.id,
          type: 'INTRODUCTION_OFFER',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.introductionOffer.count({
        where: { response: { requestId: introDupId, authorId: helper.id } },
      }),
    ).toBe(1);

    const privateDupId = await publishedRequest(owner.id);
    const [privateLeft, privateRight] = await Promise.all([
      request(
        `/v1/requests/${privateDupId}/responses/private-chat`,
        helper.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
      request(
        `/v1/requests/${privateDupId}/responses/private-chat`,
        helper.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
    ]);
    expect([privateLeft.status, privateRight.status].sort()).toEqual([
      201, 201,
    ]);
    expect(
      await prisma.requestResponse.count({
        where: {
          requestId: privateDupId,
          authorId: helper.id,
          type: 'PRIVATE_CHAT_OFFER',
        },
      }),
    ).toBe(1);

    const declineCancelId = await publishedRequest(owner.id);
    const declineCancelIntro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${declineCancelId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Decline Cancel',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const [declineRace, cancelRace] = await Promise.all([
      request(
        `/v1/introductions/${declineCancelIntro.response.introduction!.id}/decline`,
        owner.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
      request(
        `/v1/introductions/${declineCancelIntro.response.introduction!.id}/cancel`,
        helper.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
    ]);
    expect([declineRace.status, cancelRace.status].sort()).toEqual([200, 409]);
    const declineCancelFinal = await prisma.introductionOffer.findUniqueOrThrow(
      {
        where: { id: declineCancelIntro.response.introduction!.id },
      },
    );
    expect(['DECLINED', 'CANCELLED']).toContain(declineCancelFinal.status);
    expect(declineCancelFinal.consentedAt).toBeNull();
    expect(declineCancelFinal.introducedAt).toBeNull();
  });

  it('rejects unpublished/deleted/moderated creation and contact-detail fields', async () => {
    const owner = await member('state-owner');
    const helper = await member('state-helper');
    const draft = await prisma.request.create({
      data: {
        authorId: owner.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: 'Draft headline long enough',
        context: 'Draft context that is long enough to exist.',
      },
    });
    expect(
      (
        await request(
          `/v1/requests/${draft.id}/responses/advice`,
          helper.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ body: ADVICE }),
          },
        )
      ).status,
    ).toBe(404);

    const deleted = await publishedRequest(owner.id);
    await prisma.request.update({
      where: { id: deleted },
      data: { status: 'DELETED_BY_AUTHOR', deletedAt: new Date() },
    });
    expect(
      (await request(`/v1/requests/${deleted}/responses`, helper.cookie))
        .status,
    ).toBe(404);

    const live = await publishedRequest(owner.id);
    const contact = await request(
      `/v1/requests/${live}/responses/introduction`,
      helper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          personName: 'Ada',
          permissionConfirmed: true,
          linkedIn: 'https://linkedin.com/in/ada',
        }),
      },
    );
    expect(contact.status).toBe(400);
    const privateBody = await request(
      `/v1/requests/${live}/responses/private-chat`,
      helper.cookie,
      { method: 'POST', body: JSON.stringify({ body: 'secret note' }) },
    );
    expect(privateBody.status).toBe(400);

    const listedBefore = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${live}/responses`, helper.cookie),
    );
    const countBefore = await prisma.requestResponse.count({
      where: { requestId: live },
    });
    const listedAfter = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${live}/responses`, helper.cookie),
    );
    expect(listedAfter.total).toBe(listedBefore.total);
    expect(
      await prisma.requestResponse.count({ where: { requestId: live } }),
    ).toBe(countBefore);

    const reverseHelper = await member('state-reverse');
    await prisma.block.create({
      data: { blockerId: reverseHelper.id, blockedId: owner.id },
    });
    expect(
      (
        await request(
          `/v1/requests/${live}/responses/advice`,
          reverseHelper.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ body: ADVICE }),
          },
        )
      ).status,
    ).toBe(403);

    const moderated = await publishedRequest(owner.id);
    await prisma.request.update({
      where: { id: moderated },
      data: { status: 'MODERATED_REMOVED' },
    });
    expect(
      (await request(`/v1/requests/${moderated}/responses`, helper.cookie))
        .status,
    ).toBe(404);

    const deletedDuplicate = await publishedRequest(owner.id);
    const created = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${deletedDuplicate}/responses/advice`,
        helper.cookie,
        { method: 'POST', body: JSON.stringify({ body: ADVICE }) },
      ),
    );
    await prisma.requestResponse.update({
      where: { id: created.response.id },
      data: { deletedAt: new Date() },
    });
    const retryDeleted = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${deletedDuplicate}/responses/advice`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            body: 'A completely different retry body that should not overwrite.',
          }),
        },
      ),
    );
    expect(retryDeleted.response.id).toBe(created.response.id);
    expect(
      await prisma.requestResponse.count({
        where: {
          requestId: deletedDuplicate,
          authorId: helper.id,
          type: 'ADVICE',
        },
      }),
    ).toBe(1);

    const introLive = await publishedRequest(owner.id);
    const introCreated = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${introLive}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Origin Person',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const introId = introCreated.response.introduction!.id;
    const missingOriginConsent = await request(
      `/v1/introductions/${introId}/consent`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { origin: '' },
      },
      '',
    );
    expect(missingOriginConsent.status).toBe(403);

    const helperConsent = await request(
      `/v1/introductions/${introId}/consent`,
      helper.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(helperConsent.status).toBe(404);

    const firstConsent = await request(
      `/v1/introductions/${introId}/consent`,
      owner.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(firstConsent.status).toBe(200);
    const firstRow = await prisma.introductionOffer.findUniqueOrThrow({
      where: { id: introId },
    });
    const secondConsent = await request(
      `/v1/introductions/${introId}/consent`,
      owner.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(secondConsent.status).toBe(200);
    const secondRow = await prisma.introductionOffer.findUniqueOrThrow({
      where: { id: introId },
    });
    expect(secondRow.consentedAt?.toISOString()).toBe(
      firstRow.consentedAt?.toISOString(),
    );
    expect(secondRow.introducedAt?.toISOString()).toBe(
      firstRow.introducedAt?.toISOString(),
    );
    expect(
      (
        await request(`/v1/introductions/${introId}/decline`, owner.cookie, {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(409);
  });

  it('hides unavailable request threads and keeps intro authz enumeration-safe', async () => {
    const owner = await member('hide-owner', { displayName: 'Hidden Owner' });
    const helper = await member('hide-helper', {
      displayName: 'Visible Helper',
    });
    const stranger = await member('hide-stranger');
    const requestId = await publishedRequest(owner.id);
    const massAssigned = await request(
      `/v1/requests/${requestId}/responses/advice`,
      helper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          body: ADVICE,
          authorId: owner.id,
          requestId: 'other',
          type: 'PRIVATE_CHAT_OFFER',
          deletedAt: '2020-01-01',
          createdAt: '2020-01-01',
          conversationId: 'conv-1',
          message: 'nope',
        }),
      },
    );
    expect(massAssigned.status).toBe(400);
    const created = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${requestId}/responses/advice`,
        helper.cookie,
        { method: 'POST', body: JSON.stringify({ body: ADVICE }) },
      ),
    );
    expect(created.response.author?.displayName).toBe('Visible Helper');
    const duplicateMass = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${requestId}/responses/advice`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            body: 'A completely different retry body that should not overwrite.',
            authorId: owner.id,
            conversationId: 'conv-1',
          }),
        },
      ),
    );
    expect(duplicateMass.response.id).toBe(created.response.id);
    expect(duplicateMass.response.body).toBe(ADVICE);

    const detail = await json<{ request: { responseCount: number } }>(
      await request(`/v1/requests/${requestId}`, owner.cookie),
    );
    expect(detail.request.responseCount).toBe(1);
    const blockedEdit = await request(
      `/v1/requests/${requestId}`,
      owner.cookie,
      {
        method: 'PATCH',
        body: JSON.stringify({
          headline: 'Should not edit after a live response exists here',
          context:
            'We are entering the UAE next quarter and want practical partner-acquisition lessons.',
          urgency: 'TODAY',
        }),
      },
    );
    expect(blockedEdit.status).toBe(409);

    await prisma.block.create({
      data: { blockerId: owner.id, blockedId: helper.id },
    });
    const historical = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, owner.cookie),
    );
    expect(historical.total).toBe(1);
    expect(historical.responses[0]?.body).toBe(ADVICE);
    expect(historical.canOfferHelp).toBe(false);
    await prisma.block.deleteMany({
      where: { blockerId: owner.id, blockedId: helper.id },
    });

    const ineligibleId = await publishedRequest(owner.id);
    await request(
      `/v1/requests/${ineligibleId}/responses/advice`,
      helper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: `${ADVICE} ineligible owner.` }),
      },
    );
    await prisma.user.update({
      where: { id: owner.id },
      data: { status: 'SUSPENDED', suspendedUntil: new Date('2099-01-01') },
    });
    const hiddenThread = await request(
      `/v1/requests/${ineligibleId}/responses`,
      helper.cookie,
    );
    const hiddenDetail = await request(
      `/v1/requests/${ineligibleId}`,
      helper.cookie,
    );
    expect(hiddenThread.status).toBe(404);
    expect(hiddenDetail.status).toBe(404);
    const hiddenThreadBody = await json<Record<string, unknown>>(hiddenThread);
    expect(leak(hiddenThreadBody)).not.toContain('Visible Helper');
    expect(leak(hiddenThreadBody)).not.toContain('"total"');
    await prisma.user.update({
      where: { id: owner.id },
      data: { status: 'ACTIVE', suspendedUntil: null },
    });

    const authorProbe = await publishedRequest(owner.id);
    const deletedHelper = await member('probe-deleted');
    await request(
      `/v1/requests/${authorProbe}/responses/advice`,
      deletedHelper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: `${ADVICE} deleted helper.` }),
      },
    );
    await prisma.user.update({
      where: { id: deletedHelper.id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    const afterDeletedHelper = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${authorProbe}/responses`, owner.cookie),
    );
    expect(
      afterDeletedHelper.responses.some(
        (row) =>
          row.author?.displayName === 'Deleted founder' &&
          row.author.companyName === 'Deleted account' &&
          row.body?.includes('deleted helper'),
      ),
    ).toBe(true);
    expect(JSON.stringify(afterDeletedHelper)).not.toContain(
      deletedHelper.email,
    );

    const variants = [
      { emailVerifiedAt: null },
      { onboardingCompletedAt: null },
    ];
    for (const extras of variants) {
      const probeHelper = await member(
        `probe-${JSON.stringify(extras).length}`,
      );
      await request(
        `/v1/requests/${authorProbe}/responses/advice`,
        probeHelper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ body: `${ADVICE} variant.` }),
        },
      );
      await prisma.user.update({
        where: { id: probeHelper.id },
        data: extras,
      });
      const listed = await json<MemberHelpResponsesResponse>(
        await request(`/v1/requests/${authorProbe}/responses`, owner.cookie),
      );
      const row = listed.responses.find((item) => item.author === null);
      expect(row?.body).toContain('variant');
    }
    const unapproved = await member('probe-unapproved');
    await request(
      `/v1/requests/${authorProbe}/responses/advice`,
      unapproved.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: `${ADVICE} unapproved.` }),
      },
    );
    await prisma.founderApplication.update({
      where: { userId: unapproved.id },
      data: { status: 'REJECTED' },
    });
    const afterReject = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${authorProbe}/responses`, owner.cookie),
    );
    expect(
      afterReject.responses.some(
        (row) => row.author === null && row.body?.includes('unapproved'),
      ),
    ).toBe(true);

    const missingCompany = await member('probe-company');
    await request(
      `/v1/requests/${authorProbe}/responses/private-chat`,
      missingCompany.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    await prisma.company.deleteMany({
      where: { founderProfile: { userId: missingCompany.id } },
    });
    const afterCompany = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${authorProbe}/responses`, owner.cookie),
    );
    expect(
      afterCompany.responses.some(
        (row) =>
          row.type === 'PRIVATE_CHAT_OFFER' &&
          row.author === null &&
          row.body === null,
      ),
    ).toBe(true);

    const orderId = await publishedRequest(owner.id);
    const firstHelper = await member('order-a');
    const secondHelper = await member('order-b');
    await request(
      `/v1/requests/${orderId}/responses/advice`,
      firstHelper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: `${ADVICE} first ordered.` }),
      },
    );
    await request(
      `/v1/requests/${orderId}/responses/advice`,
      secondHelper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: `${ADVICE} second ordered.` }),
      },
    );
    const tiedAt = new Date('2026-04-01T00:00:00.000Z');
    await prisma.requestResponse.updateMany({
      where: { requestId: orderId },
      data: { createdAt: tiedAt },
    });
    const pageOne = await json<MemberHelpResponsesResponse>(
      await request(
        `/v1/requests/${orderId}/responses?page=1&pageSize=1`,
        owner.cookie,
      ),
    );
    const pageTwo = await json<MemberHelpResponsesResponse>(
      await request(
        `/v1/requests/${orderId}/responses?page=2&pageSize=1`,
        owner.cookie,
      ),
    );
    expect(pageOne.total).toBe(2);
    expect(pageOne.responses[0]!.id < pageTwo.responses[0]!.id).toBe(true);
    expect(
      new Set([pageOne.responses[0]!.id, pageTwo.responses[0]!.id]).size,
    ).toBe(2);

    expect(
      (await request(`/v1/requests/${orderId}/responses?page=0`, owner.cookie))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          `/v1/requests/${orderId}/responses?pageSize=51`,
          owner.cookie,
        )
      ).status,
    ).toBe(400);

    const xss = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${await publishedRequest(owner.id)}/responses/advice`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            body: '<script>alert(1)</script> useful founder advice.',
          }),
        },
      ),
    );
    expect(xss.response.body).toBe(
      '<script>alert(1)</script> useful founder advice.',
    );

    const introReq = await publishedRequest(owner.id);
    const introDenied = await request(
      `/v1/requests/${introReq}/responses/introduction`,
      helper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          personName: 'Auth Person',
          reason: 'Relevant operator.',
          permissionConfirmed: true,
          email: 'hidden@example.com',
        }),
      },
    );
    expect(introDenied.status).toBe(400);
    const introOk = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${introReq}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Auth Person',
            reason: 'Relevant operator.',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const introId = introOk.response.introduction!.id;
    const missing = await request(
      `/v1/introductions/missing-intro-id/consent`,
      stranger.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    const foreign = await request(
      `/v1/introductions/${introId}/consent`,
      stranger.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect((await json<{ error: { code: string } }>(missing)).error.code).toBe(
      'INTRODUCTION_NOT_FOUND',
    );
    expect((await json<{ error: { code: string } }>(foreign)).error.code).toBe(
      'INTRODUCTION_NOT_FOUND',
    );
    expect(
      (
        await request(`/v1/introductions/${introId}/cancel`, owner.cookie, {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/v1/introductions/${introId}/decline`, helper.cookie, {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(404);

    const declined = await json<HelpResponseMutationResponse>(
      await request(`/v1/introductions/${introId}/decline`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(declined.response.introduction?.status).toBe('DECLINED');
    const declinedRow = await prisma.introductionOffer.findUniqueOrThrow({
      where: { id: introId },
    });
    expect(declinedRow.consentedAt).toBeNull();
    expect(declinedRow.introducedAt).toBeNull();
    expect(
      (
        await request(`/v1/introductions/${introId}/consent`, owner.cookie, {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`/v1/introductions/${introId}/cancel`, helper.cookie, {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(409);

    const cancelReq = await publishedRequest(owner.id);
    const cancelIntro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${cancelReq}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Cancel Auth',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const cancelled = await request(
      `/v1/introductions/${cancelIntro.response.introduction!.id}/cancel`,
      helper.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(cancelled.status).toBe(200);
    expect(
      (
        await request(
          `/v1/introductions/${cancelIntro.response.introduction!.id}/cancel`,
          helper.cookie,
          { method: 'POST', body: JSON.stringify({}) },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/v1/introductions/${cancelIntro.response.introduction!.id}/consent`,
          owner.cookie,
          { method: 'POST', body: JSON.stringify({}) },
        )
      ).status,
    ).toBe(409);

    expect(await prisma.helpConfirmation.count({ where: { requestId } })).toBe(
      0,
    );
    expect(
      await prisma.contribution.count({ where: { contributorId: helper.id } }),
    ).toBe(0);
    expect((await request('/v1/conversations', helper.cookie)).status).not.toBe(
      201,
    );
  });

  it('keeps delete and resolve races coherent for pending introductions', async () => {
    const owner = await member('intro-race-owner');
    const helper = await member('intro-race-helper');
    const deleteId = await publishedRequest(owner.id);
    const deleteIntro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${deleteId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Delete Race',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const [deleteRes, consentRes] = await Promise.all([
      request(`/v1/requests/${deleteId}`, owner.cookie, { method: 'DELETE' }),
      request(
        `/v1/introductions/${deleteIntro.response.introduction!.id}/consent`,
        owner.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
    ]);
    const deleted = await prisma.request.findUniqueOrThrow({
      where: { id: deleteId },
    });
    const deleteIntroRow = await prisma.introductionOffer.findUniqueOrThrow({
      where: { id: deleteIntro.response.introduction!.id },
    });
    expect([200, 404]).toContain(consentRes.status);
    if (consentRes.status === 200) {
      expect(deleteIntroRow.status).toBe('INTRODUCED');
      expect(
        deleted.status === 'DELETED_BY_AUTHOR' || deleteRes.status === 200,
      ).toBe(true);
    } else {
      expect(deleted.status).toBe('DELETED_BY_AUTHOR');
      expect(deleteIntroRow.status).toBe('CONSENT_PENDING');
      expect(
        (await json<{ error: { code: string } }>(consentRes)).error.code,
      ).toBe('INTRODUCTION_NOT_FOUND');
    }

    const resolveId = await publishedRequest(owner.id);
    const resolveIntro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${resolveId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Resolve Race',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const [resolveRes, resolveConsent] = await Promise.all([
      request(`/v1/requests/${resolveId}/resolve`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      request(
        `/v1/introductions/${resolveIntro.response.introduction!.id}/consent`,
        owner.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
    ]);
    expect(resolveRes.status).toBe(200);
    expect(resolveConsent.status).toBe(200);
    const resolved = await prisma.request.findUniqueOrThrow({
      where: { id: resolveId },
    });
    const resolveIntroRow = await prisma.introductionOffer.findUniqueOrThrow({
      where: { id: resolveIntro.response.introduction!.id },
    });
    expect(resolved.status).toBe('RESOLVED');
    expect(resolveIntroRow.status).toBe('INTRODUCED');

    const blockedConsentReq = await publishedRequest(owner.id);
    const blockedIntro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${blockedConsentReq}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Secret Blocked Name',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    await prisma.block.create({
      data: { blockerId: owner.id, blockedId: helper.id },
    });
    const blockedConsent = await request(
      `/v1/introductions/${blockedIntro.response.introduction!.id}/consent`,
      owner.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(blockedConsent.status).toBe(403);
    expect(leak(await json(blockedConsent))).not.toContain(
      'Secret Blocked Name',
    );

    const deletedIntroReq = await publishedRequest(owner.id);
    const otherHelper = await member('intro-race-other');
    const liveIntro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${deletedIntroReq}/responses/introduction`,
        otherHelper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Soft Deleted Intro',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    await prisma.requestResponse.update({
      where: { id: liveIntro.response.id },
      data: { deletedAt: new Date() },
    });
    const retryIntro = await json<HelpResponseMutationResponse>(
      await request(
        `/v1/requests/${deletedIntroReq}/responses/introduction`,
        otherHelper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Replacement After Delete',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    expect(retryIntro.response.id).toBe(liveIntro.response.id);
    expect(
      await prisma.introductionOffer.count({
        where: {
          response: { requestId: deletedIntroReq, authorId: otherHelper.id },
        },
      }),
    ).toBe(1);
    const listedDeleted = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${deletedIntroReq}/responses`, owner.cookie),
    );
    expect(listedDeleted.total).toBe(0);
    expect(listedDeleted.responses).toHaveLength(0);
    expect(
      (
        await request(
          `/v1/introductions/${liveIntro.response.introduction!.id}/consent`,
          owner.cookie,
          { method: 'POST', body: JSON.stringify({}) },
        )
      ).status,
    ).toBe(404);
  });
});
