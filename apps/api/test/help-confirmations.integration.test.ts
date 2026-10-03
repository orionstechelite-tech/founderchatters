import type { AddressInfo } from 'node:net';

import type {
  HelpConfirmationMutationResponse,
  MemberHelpResponsesResponse,
  MemberReputationResponse,
  ThankYouMutationResponse,
} from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { SessionService } from '../src/auth/session.service.js';
import { AppConfig } from '../src/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { ensureOnboardingTaxonomy } from '../src/onboarding/taxonomy-seed.js';
import { takeHelpConfirmationEvents } from '../src/requests/help-confirmations-events.js';

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

describe('help confirmation HTTP integration', { timeout: 60_000 }, () => {
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
        await prisma.thankYouNote.deleteMany({
          where: {
            contribution: { contributorId: { in: userIds } },
          },
        });
        await prisma.contributionTopic.deleteMany({
          where: { contribution: { contributorId: { in: userIds } } },
        });
        await prisma.contribution.deleteMany({
          where: {
            OR: [
              { contributorId: { in: userIds } },
              { helpConfirmation: { confirmerId: { in: userIds } } },
            ],
          },
        });
        await prisma.helpConfirmation.deleteMany({
          where: {
            OR: [
              { confirmerId: { in: userIds } },
              { helperId: { in: userIds } },
            ],
          },
        });
        const conversations = await prisma.conversation.findMany({
          where: {
            OR: [
              { request: { authorId: { in: userIds } } },
              { participants: { some: { userId: { in: userIds } } } },
            ],
          },
          select: { id: true },
        });
        const conversationIds = conversations.map((row) => row.id);
        if (conversationIds.length > 0) {
          await prisma.message.deleteMany({
            where: { conversationId: { in: conversationIds } },
          });
          await prisma.conversationParticipant.deleteMany({
            where: { conversationId: { in: conversationIds } },
          });
          await prisma.conversation.deleteMany({
            where: { id: { in: conversationIds } },
          });
        }
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
        email: `fc014-${label}-${Date.now()}-${userIds.length}@example.com`,
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
        displayName: extras.displayName ?? `Founder ${label}`,
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
      userAgent: 'FC-014 integration test',
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

  async function publishedRequest(
    authorId: string,
    topicIds: string[] = [],
  ): Promise<string> {
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
        topics: {
          create: topicIds.map((topicId) => ({ topicId })),
        },
      },
    });
    return created.id;
  }

  async function topicId(slug: string): Promise<string> {
    const topic = await prisma.taxonomyTopic.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    });
    return topic.id;
  }

  async function advice(
    requestId: string,
    helperCookie: string,
  ): Promise<string> {
    const created = await request(
      `/v1/requests/${requestId}/responses/advice`,
      helperCookie,
      { method: 'POST', body: JSON.stringify({ body: ADVICE }) },
    );
    expect(created.status).toBe(201);
    const payload = await json<{ response: { id: string } }>(created);
    return payload.response.id;
  }

  it('requires an active member, owner-only confirm, and OriginGuard', async () => {
    const owner = await member('owner-auth');
    const helper = await member('helper-auth');
    const stranger = await member('stranger-auth');
    const requestId = await publishedRequest(owner.id);
    const responseId = await advice(requestId, helper.cookie);
    expect(
      (
        await request(
          `/v1/requests/${requestId}/help-confirmations`,
          undefined,
          {
            method: 'POST',
            body: JSON.stringify({ responseId, outcome: 'HELPED' }),
          },
        )
      ).status,
    ).toBe(401);
    const unverified = await member('unverified', { verified: false });
    expect(
      (
        await request(
          `/v1/requests/${requestId}/help-confirmations`,
          unverified.cookie,
          {
            method: 'POST',
            body: JSON.stringify({
              responseId,
              outcome: 'HELPED',
            }),
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/v1/requests/${requestId}/help-confirmations`,
          helper.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ responseId, outcome: 'HELPED' }),
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/v1/requests/${requestId}/help-confirmations`,
          stranger.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ responseId, outcome: 'HELPED' }),
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/v1/requests/${requestId}/help-confirmations`,
          owner.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ responseId, outcome: 'HELPED' }),
          },
          'https://evil.example',
        )
      ).status,
    ).toBe(403);
    expect((await request('/v1/me/reputation')).status).toBe(401);
    expect((await request(`/v1/founders/${helper.id}/reputation`)).status).toBe(
      401,
    );
  });

  it('records HELPED from advice, stays terminal, and is idempotent', async () => {
    const owner = await member('owner-advice', { displayName: 'Sarah Chen' });
    const helper = await member('helper-advice', { displayName: 'Chaitanya' });
    const gtm = await topicId('gtm');
    const requestId = await publishedRequest(owner.id, [gtm]);
    const responseId = await advice(requestId, helper.cookie);
    takeHelpConfirmationEvents();
    const created = await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId,
          outcome: 'HELPED',
          topicIds: [gtm],
        }),
      },
    );
    expect(created.status).toBe(200);
    const payload = await json<HelpConfirmationMutationResponse>(created);
    expect(payload.confirmation.outcome).toBe('HELPED');
    expect(payload.confirmation.hasContribution).toBe(true);
    expect(payload.confirmation.creditedResponseId).toBe(responseId);
    expect(payload.confirmation.helper?.displayName).toBe('Chaitanya');
    expect(
      await prisma.contribution.count({ where: { contributorId: helper.id } }),
    ).toBe(1);
    const events = takeHelpConfirmationEvents();
    expect(events.map((event) => event.type)).toEqual([
      'help.confirmed',
      'contribution.created',
    ]);
    const replay = await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId,
          outcome: 'HELPED',
          topicIds: [gtm],
        }),
      },
    );
    expect(replay.status).toBe(200);
    expect(takeHelpConfirmationEvents()).toEqual([]);
    expect(
      await prisma.contribution.count({ where: { contributorId: helper.id } }),
    ).toBe(1);

    const contributionNotifications = await prisma.notification.findMany({
      where: {
        userId: helper.id,
        type: 'CONTRIBUTION_RECORDED',
      },
      select: {
        type: true,
        title: true,
        body: true,
        href: true,
      },
    });
    expect(contributionNotifications).toEqual([
      {
        type: 'CONTRIBUTION_RECORDED',
        title: 'Contribution recorded',
        body: 'Sarah Chen confirmed your help. Advice confirmed helpful.',
        href: '/reputation',
      },
    ]);

    await prisma.contribution.delete({
      where: {
        helpConfirmationId: payload.confirmation.id,
      },
    });

    const repaired = await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId,
          outcome: 'HELPED',
          topicIds: [],
        }),
      },
    );
    expect(repaired.status).toBe(200);
    expect(
      await prisma.contribution.count({ where: { contributorId: helper.id } }),
    ).toBe(1);
    expect(takeHelpConfirmationEvents().map((event) => event.type)).toEqual([
      'contribution.created',
    ]);
    expect(
      await prisma.notification.count({
        where: {
          userId: helper.id,
          type: 'CONTRIBUTION_RECORDED',
        },
      }),
    ).toBe(2);

    const repairedReplay = await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId,
          outcome: 'HELPED',
          topicIds: [],
        }),
      },
    );
    expect(repairedReplay.status).toBe(200);
    expect(takeHelpConfirmationEvents()).toEqual([]);
    expect(
      await prisma.notification.count({
        where: {
          userId: helper.id,
          type: 'CONTRIBUTION_RECORDED',
        },
      }),
    ).toBe(2);

    const conflict = await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId,
          outcome: 'STILL_TALKING',
        }),
      },
    );
    expect(conflict.status).toBe(409);
    const thread = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, owner.cookie),
    );
    expect(thread.responses[0]?.helpConfirmation?.outcome).toBe('HELPED');
    expect(thread.responses[0]?.helpConfirmation?.canUpdate).toBe(false);
    const helperThread = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, helper.cookie),
    );
    expect(helperThread.responses[0]?.helpConfirmation).toBeNull();
    expect(JSON.stringify(helperThread)).not.toContain('NOT_HELPFUL');
  });

  it('allows STILL and NOT without reputation, then upgrades to HELPED', async () => {
    const owner = await member('owner-still');
    const helper = await member('helper-still');
    const requestId = await publishedRequest(owner.id);
    const responseId = await advice(requestId, helper.cookie);
    const still = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            responseId,
            outcome: 'STILL_TALKING',
          }),
        },
      ),
    );
    expect(still.confirmation.outcome).toBe('STILL_TALKING');
    expect(still.confirmation.hasContribution).toBe(false);
    expect(
      (
        await request(
          `/v1/help-confirmations/${still.confirmation.id}/thank-you`,
          owner.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ body: 'Should not persist' }),
          },
        )
      ).status,
    ).toBe(409);
    expect(
      await prisma.contribution.count({ where: { contributorId: helper.id } }),
    ).toBe(0);
    const notHelpful = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            responseId,
            outcome: 'NOT_HELPFUL',
          }),
        },
      ),
    );
    expect(notHelpful.confirmation.outcome).toBe('NOT_HELPFUL');
    expect(
      await prisma.notification.count({
        where: {
          userId: helper.id,
          type: 'CONTRIBUTION_RECORDED',
        },
      }),
    ).toBe(0);

    const helped = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            responseId,
            outcome: 'HELPED',
          }),
        },
      ),
    );
    expect(helped.confirmation.outcome).toBe('HELPED');
    expect(helped.confirmation.hasContribution).toBe(true);
    const reputation = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, owner.cookie),
    );
    expect(reputation.summary.confirmedHelps).toBe(1);
    expect(reputation.summary.foundersHelped).toBe(1);
    expect(reputation.contributions[0]?.label).toBe('Advice confirmed helpful');
    expect(JSON.stringify(reputation)).not.toContain(ADVICE);
    expect(JSON.stringify(reputation)).not.toContain(
      'Looking for UAE B2B launch help',
    );
    expect(JSON.stringify(reputation)).not.toContain('STILL_TALKING');
  });

  it('rejects intro HELPED until INTRODUCED and private chat until helper message', async () => {
    const owner = await member('owner-qualify');
    const helper = await member('helper-qualify');
    const requestId = await publishedRequest(owner.id);
    const intro = await json<{
      response: { id: string; introduction: { id: string } };
    }>(
      await request(
        `/v1/requests/${requestId}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Secret Operator',
            reason: 'Knows distributors',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    const introRejected = await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId: intro.response.id,
          outcome: 'HELPED',
        }),
      },
    );
    expect(introRejected.status).toBe(403);
    await request(
      `/v1/introductions/${intro.response.introduction.id}/consent`,
      owner.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    const introHelped = await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId: intro.response.id,
          outcome: 'HELPED',
        }),
      },
    );
    expect(introHelped.status).toBe(200);

    const owner2 = await member('owner-private');
    const helper2 = await member('helper-private');
    const requestId2 = await publishedRequest(owner2.id);
    const privateOffer = await json<{ response: { id: string } }>(
      await request(
        `/v1/requests/${requestId2}/responses/private-chat`,
        helper2.cookie,
        { method: 'POST', body: JSON.stringify({}) },
      ),
    );
    expect(
      (
        await request(
          `/v1/requests/${requestId2}/help-confirmations`,
          owner2.cookie,
          {
            method: 'POST',
            body: JSON.stringify({
              responseId: privateOffer.response.id,
              outcome: 'HELPED',
            }),
          },
        )
      ).status,
    ).toBe(403);
    const conversation = await json<{ conversation: { id: string } }>(
      await request('/v1/conversations', owner2.cookie, {
        method: 'POST',
        body: JSON.stringify({
          privateChatOfferResponseId: privateOffer.response.id,
        }),
      }),
    );
    expect(
      (
        await request(
          `/v1/requests/${requestId2}/help-confirmations`,
          owner2.cookie,
          {
            method: 'POST',
            body: JSON.stringify({
              responseId: privateOffer.response.id,
              outcome: 'HELPED',
            }),
          },
        )
      ).status,
    ).toBe(403);
    await prisma.message.create({
      data: {
        conversationId: conversation.conversation.id,
        senderId: helper2.id,
        body: 'private distributor map that must never leak',
      },
    });
    const privateHelped = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId2}/help-confirmations`,
        owner2.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            responseId: privateOffer.response.id,
            outcome: 'HELPED',
          }),
        },
      ),
    );
    expect(privateHelped.confirmation.outcome).toBe('HELPED');
    const reputation = await json<MemberReputationResponse>(
      await request(`/v1/me/reputation`, helper2.cookie),
    );
    expect(reputation.contributions[0]?.label).toBe(
      'Private help confirmed helpful',
    );
    expect(JSON.stringify(reputation)).not.toContain(
      'private distributor map that must never leak',
    );
    expect(JSON.stringify(reputation)).not.toContain(
      conversation.conversation.id,
    );
  });

  it('validates topics, thank-you immutability, and reputation metrics', async () => {
    const owner = await member('owner-metrics', { displayName: 'Sarah Chen' });
    const owner2 = await member('owner-metrics-2');
    const helper = await member('helper-metrics', { displayName: 'Chaitanya' });
    const gtm = await topicId('gtm');
    const product = await topicId('product');
    const hiring = await topicId('hiring');
    const unrelated = await topicId('fundraising');
    const requestId = await publishedRequest(owner.id, [gtm, product, hiring]);
    const responseId = await advice(requestId, helper.cookie);
    expect(
      (
        await request(
          `/v1/requests/${requestId}/help-confirmations`,
          owner.cookie,
          {
            method: 'POST',
            body: JSON.stringify({
              responseId,
              outcome: 'HELPED',
              topicIds: [unrelated],
            }),
          },
        )
      ).status,
    ).toBe(400);
    const helped = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            responseId,
            outcome: 'HELPED',
            topicIds: [product, gtm],
          }),
        },
      ),
    );
    const note = await json<ThankYouMutationResponse>(
      await request(
        `/v1/help-confirmations/${helped.confirmation.id}/thank-you`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ body: 'Helped us avoid a bad setup.' }),
        },
      ),
    );
    expect(note.thankYou.body).toBe('Helped us avoid a bad setup.');
    const replay = await json<ThankYouMutationResponse>(
      await request(
        `/v1/help-confirmations/${helped.confirmation.id}/thank-you`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ body: 'Helped us avoid a bad setup.' }),
        },
      ),
    );
    expect(replay.thankYou.body).toBe(note.thankYou.body);
    expect(
      (
        await request(
          `/v1/help-confirmations/${helped.confirmation.id}/thank-you`,
          owner.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ body: 'A different note' }),
          },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/v1/help-confirmations/${helped.confirmation.id}/thank-you`,
          helper.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ body: 'Nope' }),
          },
        )
      ).status,
    ).toBe(404);

    const requestId2 = await publishedRequest(owner2.id);
    const responseId2 = await advice(requestId2, helper.cookie);
    await request(
      `/v1/requests/${requestId2}/help-confirmations`,
      owner2.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ responseId: responseId2, outcome: 'HELPED' }),
      },
    );

    const reputation = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, owner.cookie),
    );
    expect(reputation.summary.confirmedHelps).toBe(2);
    expect(reputation.summary.foundersHelped).toBe(2);
    expect(reputation.summary.introductions).toBe(0);
    expect(reputation.summary.helpfulTopics[0]?.id).toBeDefined();
    expect(JSON.stringify(reputation.contributions[0])).not.toContain(
      'Secret Operator',
    );
    expect(reputation.contributions.some((item) => item.thankYou)).toBe(true);

    await prisma.request.update({
      where: { id: requestId },
      data: { status: 'DELETED_BY_AUTHOR' },
    });
    const afterDelete = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, owner.cookie),
    );
    const hidden = afterDelete.contributions.find((item) =>
      item.topics.some((topic) => topic.id === gtm),
    );
    expect(hidden?.requestAvailable).toBe(false);
    expect(hidden?.requestId).toBeNull();
    expect(JSON.stringify(afterDelete)).not.toContain(
      'Looking for UAE B2B launch help',
    );
  });

  it('rejects draft/deleted requests, blocks, and concurrent duplicate HELPED', async () => {
    const owner = await member('owner-races');
    const helper = await member('helper-races');
    const draft = await prisma.request.create({
      data: {
        authorId: owner.id,
        type: 'ASK',
        status: 'DRAFT',
        headline: 'Draft only',
        context: 'Not published yet and should not accept confirmation.',
      },
    });
    const draftAdvice = await prisma.requestResponse.create({
      data: {
        requestId: draft.id,
        authorId: helper.id,
        type: 'ADVICE',
        body: ADVICE,
      },
    });
    expect(
      (
        await request(
          `/v1/requests/${draft.id}/help-confirmations`,
          owner.cookie,
          {
            method: 'POST',
            body: JSON.stringify({
              responseId: draftAdvice.id,
              outcome: 'HELPED',
            }),
          },
        )
      ).status,
    ).toBe(404);

    const requestId = await publishedRequest(owner.id);
    const responseId = await advice(requestId, helper.cookie);
    await prisma.block.create({
      data: { blockerId: helper.id, blockedId: owner.id },
    });
    expect(
      (
        await request(
          `/v1/requests/${requestId}/help-confirmations`,
          owner.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ responseId, outcome: 'HELPED' }),
          },
        )
      ).status,
    ).toBe(403);
    await prisma.block.deleteMany({
      where: { blockerId: helper.id, blockedId: owner.id },
    });

    takeHelpConfirmationEvents();
    const [first, second] = await Promise.all([
      request(`/v1/requests/${requestId}/help-confirmations`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ responseId, outcome: 'HELPED' }),
      }),
      request(`/v1/requests/${requestId}/help-confirmations`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ responseId, outcome: 'HELPED' }),
      }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 200]);
    expect(
      await prisma.helpConfirmation.count({
        where: { requestId, confirmerId: owner.id, helperId: helper.id },
      }),
    ).toBe(1);
    expect(
      await prisma.contribution.count({ where: { contributorId: helper.id } }),
    ).toBe(1);
    const raceEvents = takeHelpConfirmationEvents();
    expect(
      raceEvents.filter((event) => event.type === 'help.confirmed'),
    ).toHaveLength(1);
    expect(
      raceEvents.filter((event) => event.type === 'contribution.created'),
    ).toHaveLength(1);

    await prisma.request.update({
      where: { id: requestId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    const thankYou = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ responseId, outcome: 'HELPED' }),
        },
      ),
    );
    const note = await request(
      `/v1/help-confirmations/${thankYou.confirmation.id}/thank-you`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: 'Still grateful after resolve.' }),
      },
    );
    expect(note.status).toBe(200);
  });

  it('hides ineligible confirmer identity and thank-you on public reputation', async () => {
    const owner = await member('owner-hide', { displayName: 'Sarah Chen' });
    const helper = await member('helper-hide');
    const requestId = await publishedRequest(owner.id);
    const responseId = await advice(requestId, helper.cookie);
    const helped = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ responseId, outcome: 'HELPED' }),
        },
      ),
    );
    await request(
      `/v1/help-confirmations/${helped.confirmation.id}/thank-you`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ body: 'Private gratitude.' }),
      },
    );
    await prisma.user.update({
      where: { id: owner.id },
      data: { status: 'SUSPENDED', suspendedUntil: new Date('2099-01-01') },
    });
    const reputation = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, helper.cookie),
    );
    expect(reputation.contributions[0]?.confirmer).toBeNull();
    expect(reputation.contributions[0]?.thankYou).toBeNull();
    expect(JSON.stringify(reputation)).not.toContain('Sarah Chen');
    expect(JSON.stringify(reputation)).not.toContain('Private gratitude.');
    expect(
      (await request(`/v1/founders/${owner.id}/reputation`, helper.cookie))
        .status,
    ).toBe(404);
  });

  it('rejects self-help, foreign response ids, and helper-visible negative outcomes', async () => {
    const owner = await member('owner-self');
    const helper = await member('helper-self');
    const other = await member('other-self');
    const requestId = await publishedRequest(owner.id);
    const otherRequestId = await publishedRequest(other.id);
    const selfResponse = await prisma.requestResponse.create({
      data: {
        requestId,
        authorId: owner.id,
        type: 'ADVICE',
        body: ADVICE,
      },
    });
    expect(
      (
        await request(
          `/v1/requests/${requestId}/help-confirmations`,
          owner.cookie,
          {
            method: 'POST',
            body: JSON.stringify({
              responseId: selfResponse.id,
              outcome: 'HELPED',
            }),
          },
        )
      ).status,
    ).toBe(403);
    expect(
      await prisma.contribution.count({ where: { contributorId: owner.id } }),
    ).toBe(0);
    const foreign = await advice(otherRequestId, helper.cookie);
    const foreignAttempt = await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId: foreign,
          outcome: 'HELPED',
          helperId: helper.id,
        }),
      },
    );
    expect(foreignAttempt.status).toBe(400);
    const foreignAllowed = await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ responseId: foreign, outcome: 'HELPED' }),
      },
    );
    expect(foreignAllowed.status).toBe(403);
    const responseId = await advice(requestId, helper.cookie);
    await request(
      `/v1/requests/${requestId}/help-confirmations`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId,
          outcome: 'NOT_HELPFUL',
        }),
      },
    );
    const helperThread = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, helper.cookie),
    );
    expect(helperThread.responses[0]?.helpConfirmation).toBeNull();
    expect(JSON.stringify(helperThread)).not.toMatch(
      /NOT_HELPFUL|STILL_TALKING/,
    );
    const reputation = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, owner.cookie),
    );
    expect(reputation.summary.confirmedHelps).toBe(0);
    expect(JSON.stringify(reputation)).not.toMatch(/NOT_HELPFUL|STILL_TALKING/);
    expect(JSON.stringify(reputation)).not.toMatch(/P2002|P2034/);
  });

  it('counts DISTINCT foundersHelped and ignores INTRODUCED without HELPED', async () => {
    const owner = await member('owner-distinct');
    const helper = await member('helper-distinct');
    for (let index = 0; index < 3; index += 1) {
      const requestId = await publishedRequest(owner.id);
      const responseId = await advice(requestId, helper.cookie);
      const confirmed = await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ responseId, outcome: 'HELPED' }),
        },
      );
      expect(confirmed.status).toBe(200);
    }
    const introOwner = await member('owner-intro-metric');
    const introRequest = await publishedRequest(introOwner.id);
    const intro = await json<{
      response: { id: string; introduction: { id: string } };
    }>(
      await request(
        `/v1/requests/${introRequest}/responses/introduction`,
        helper.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            personName: 'Metric Operator',
            reason: 'Knows operators',
            permissionConfirmed: true,
          }),
        },
      ),
    );
    await request(
      `/v1/introductions/${intro.response.introduction.id}/consent`,
      introOwner.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    const beforeHelped = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, owner.cookie),
    );
    expect(beforeHelped.summary.confirmedHelps).toBe(3);
    expect(beforeHelped.summary.foundersHelped).toBe(1);
    expect(beforeHelped.summary.introductions).toBe(0);
    expect(JSON.stringify(beforeHelped)).not.toContain('Metric Operator');
    expect(JSON.stringify(beforeHelped)).not.toContain('Knows operators');
    expect(JSON.stringify(beforeHelped)).not.toContain('repeat founder');
    const introHelped = await request(
      `/v1/requests/${introRequest}/help-confirmations`,
      introOwner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          responseId: intro.response.id,
          outcome: 'HELPED',
        }),
      },
    );
    expect(introHelped.status).toBe(200);
    const afterHelped = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, owner.cookie),
    );
    expect(afterHelped.summary.confirmedHelps).toBe(4);
    expect(afterHelped.summary.foundersHelped).toBe(2);
    expect(afterHelped.summary.introductions).toBe(1);
  });

  it('resolves conflicting outcome races to one confirmation and durable HELPED', async () => {
    async function racePair(
      label: string,
      left: 'HELPED' | 'STILL_TALKING' | 'NOT_HELPFUL',
      right: 'HELPED' | 'STILL_TALKING' | 'NOT_HELPFUL',
    ) {
      const owner = await member(`owner-race-${label}`);
      const helper = await member(`helper-race-${label}`);
      const requestId = await publishedRequest(owner.id);
      const responseId = await advice(requestId, helper.cookie);
      const [first, second] = await Promise.all([
        request(`/v1/requests/${requestId}/help-confirmations`, owner.cookie, {
          method: 'POST',
          body: JSON.stringify({ responseId, outcome: left }),
        }),
        request(`/v1/requests/${requestId}/help-confirmations`, owner.cookie, {
          method: 'POST',
          body: JSON.stringify({ responseId, outcome: right }),
        }),
      ]);
      const bodies = await Promise.all([
        first.json() as Promise<Record<string, unknown>>,
        second.json() as Promise<Record<string, unknown>>,
      ]);
      expect(JSON.stringify(bodies)).not.toMatch(/P2002|P2034/);
      const rows = await prisma.helpConfirmation.findMany({
        where: { requestId, confirmerId: owner.id, helperId: helper.id },
        include: { contribution: true },
      });
      expect(rows).toHaveLength(1);
      const helped = left === 'HELPED' || right === 'HELPED';
      if (helped) {
        expect(rows[0]?.outcome).toBe('HELPED');
        expect(rows[0]?.contribution).toBeTruthy();
        expect(
          await prisma.contribution.count({
            where: { contributorId: helper.id },
          }),
        ).toBe(1);
        expect([first.status, second.status]).toContain(200);
      } else {
        expect(['STILL_TALKING', 'NOT_HELPFUL']).toContain(rows[0]?.outcome);
        expect(rows[0]?.contribution).toBeNull();
        expect([first.status, second.status].sort()).toEqual([200, 200]);
      }
    }
    await racePair('helped-still', 'HELPED', 'STILL_TALKING');
    await racePair('helped-not', 'HELPED', 'NOT_HELPFUL');
    await racePair('still-not', 'STILL_TALKING', 'NOT_HELPFUL');
  });

  it('keeps thank-you races and deleted-request privacy intact', async () => {
    const owner = await member('owner-thanks');
    const helper = await member('helper-thanks');
    const requestId = await publishedRequest(owner.id);
    const responseId = await advice(requestId, helper.cookie);
    const helped = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ responseId, outcome: 'HELPED' }),
        },
      ),
    );
    const [sameA, sameB] = await Promise.all([
      request(
        `/v1/help-confirmations/${helped.confirmation.id}/thank-you`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ body: 'Same note' }),
        },
      ),
      request(
        `/v1/help-confirmations/${helped.confirmation.id}/thank-you`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ body: 'Same note' }),
        },
      ),
    ]);
    expect([sameA.status, sameB.status].sort()).toEqual([200, 200]);
    expect(
      await prisma.thankYouNote.count({
        where: { contribution: { contributorId: helper.id } },
      }),
    ).toBe(1);

    const owner2 = await member('owner-thanks-2');
    const requestId2 = await publishedRequest(owner2.id);
    const responseId2 = await advice(requestId2, helper.cookie);
    const helped2 = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId2}/help-confirmations`,
        owner2.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ responseId: responseId2, outcome: 'HELPED' }),
        },
      ),
    );
    const [diffA, diffB] = await Promise.all([
      request(
        `/v1/help-confirmations/${helped2.confirmation.id}/thank-you`,
        owner2.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ body: 'Note A' }),
        },
      ),
      request(
        `/v1/help-confirmations/${helped2.confirmation.id}/thank-you`,
        owner2.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ body: 'Note B' }),
        },
      ),
    ]);
    const diffStatuses = [diffA.status, diffB.status].sort();
    expect(diffStatuses).toEqual([200, 409]);
    const conflictBody = await (diffA.status === 409 ? diffA : diffB).json();
    expect(JSON.stringify(conflictBody)).not.toMatch(/P2002|P2034/);
    expect(
      await prisma.thankYouNote.count({
        where: {
          contribution: { helpConfirmationId: helped2.confirmation.id },
        },
      }),
    ).toBe(1);

    const owner3 = await member('owner-deleted-note');
    const requestId3 = await publishedRequest(owner3.id);
    const responseId3 = await advice(requestId3, helper.cookie);
    const helped3 = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId3}/help-confirmations`,
        owner3.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ responseId: responseId3, outcome: 'HELPED' }),
        },
      ),
    );
    await prisma.request.update({
      where: { id: requestId3 },
      data: { status: 'DELETED_BY_AUTHOR' },
    });
    expect(
      (
        await request(
          `/v1/help-confirmations/${helped3.confirmation.id}/thank-you`,
          owner3.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ body: 'Too late' }),
          },
        )
      ).status,
    ).toBe(404);
    const hiddenContribution = await prisma.contribution.findFirstOrThrow({
      where: { helpConfirmationId: helped3.confirmation.id },
      select: { id: true },
    });
    const afterDelete = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, helper.cookie),
    );
    const hidden = afterDelete.contributions.find(
      (item) => item.id === hiddenContribution.id,
    );
    expect(hidden?.requestAvailable).toBe(false);
    expect(hidden?.requestId).toBeNull();
    expect(JSON.stringify(afterDelete)).not.toContain(
      'Looking for UAE B2B launch help',
    );

    const owner4 = await member('owner-soft-response');
    const requestId4 = await publishedRequest(owner4.id);
    const responseId4 = await advice(requestId4, helper.cookie);
    const helped4 = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId4}/help-confirmations`,
        owner4.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ responseId: responseId4, outcome: 'HELPED' }),
        },
      ),
    );
    await prisma.requestResponse.update({
      where: { id: responseId4 },
      data: { deletedAt: new Date() },
    });
    expect(
      (
        await request(
          `/v1/help-confirmations/${helped4.confirmation.id}/thank-you`,
          owner4.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ body: 'Deleted response' }),
          },
        )
      ).status,
    ).toBe(403);
  });

  it('paginates tied contribution timestamps and does not mutate on GET', async () => {
    const helper = await member('helper-page');
    const stamp = new Date('2026-04-01T12:00:00.000Z');
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const owner = await member(`owner-page-${String(index)}`);
      const requestId = await publishedRequest(owner.id);
      const responseId = await advice(requestId, helper.cookie);
      await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ responseId, outcome: 'HELPED' }),
        },
      );
      const contribution = await prisma.contribution.findFirstOrThrow({
        where: { contributorId: helper.id, id: { notIn: ids } },
        orderBy: { createdAt: 'desc' },
      });
      await prisma.contribution.update({
        where: { id: contribution.id },
        data: { createdAt: stamp },
      });
      ids.push(contribution.id);
    }
    const page1 = await json<MemberReputationResponse>(
      await request(
        `/v1/founders/${helper.id}/reputation?page=1&pageSize=1`,
        helper.cookie,
      ),
    );
    const page2 = await json<MemberReputationResponse>(
      await request(
        `/v1/founders/${helper.id}/reputation?page=2&pageSize=1`,
        helper.cookie,
      ),
    );
    const page3 = await json<MemberReputationResponse>(
      await request(
        `/v1/founders/${helper.id}/reputation?page=3&pageSize=1`,
        helper.cookie,
      ),
    );
    const paged = [
      page1.contributions[0]?.id,
      page2.contributions[0]?.id,
      page3.contributions[0]?.id,
    ];
    expect(new Set(paged).size).toBe(3);
    expect(paged.every((id) => ids.includes(id as string))).toBe(true);
    expect(
      (
        await request(
          `/v1/founders/${helper.id}/reputation?page=0`,
          helper.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/v1/founders/${helper.id}/reputation?pageSize=51`,
          helper.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/v1/founders/${helper.id}/reputation?q=score`,
          helper.cookie,
        )
      ).status,
    ).toBe(400);

    const confirmation = await prisma.helpConfirmation.findFirstOrThrow({
      where: { helperId: helper.id },
    });
    const contribution = await prisma.contribution.findFirstOrThrow({
      where: { contributorId: helper.id },
    });
    const requestRow = await prisma.request.findFirstOrThrow({
      where: { id: confirmation.requestId },
    });
    const responseRow = await prisma.requestResponse.findFirstOrThrow({
      where: { requestId: confirmation.requestId },
    });
    const before = {
      confirmations: await prisma.helpConfirmation.count({
        where: { helperId: helper.id },
      }),
      contributions: await prisma.contribution.count({
        where: { contributorId: helper.id },
      }),
      topics: await prisma.contributionTopic.count({
        where: { contribution: { contributorId: helper.id } },
      }),
      notes: await prisma.thankYouNote.count({
        where: { contribution: { contributorId: helper.id } },
      }),
      requestUpdated: requestRow.updatedAt.toISOString(),
      responseUpdated: responseRow.updatedAt.toISOString(),
      confirmationCreated: confirmation.createdAt.toISOString(),
      contributionCreated: contribution.createdAt.toISOString(),
      notifications: await prisma.notification.count(),
    };
    const mine = await json<MemberReputationResponse>(
      await request(`/v1/me/reputation`, helper.cookie),
    );
    expect(mine.isSelf).toBe(true);
    expect(JSON.stringify(mine)).not.toMatch(
      /@example\.com|applicationStatus|passwordHash|emailVerifiedAt|session/i,
    );
    expect(mine.founder).not.toHaveProperty('email');
    await request(`/v1/founders/${helper.id}/reputation`, helper.cookie);
    expect(
      await prisma.helpConfirmation.count({ where: { helperId: helper.id } }),
    ).toBe(before.confirmations);
    expect(
      await prisma.contribution.count({ where: { contributorId: helper.id } }),
    ).toBe(before.contributions);
    expect(
      await prisma.contributionTopic.count({
        where: { contribution: { contributorId: helper.id } },
      }),
    ).toBe(before.topics);
    expect(
      await prisma.thankYouNote.count({
        where: { contribution: { contributorId: helper.id } },
      }),
    ).toBe(before.notes);
    expect(
      (
        await prisma.request.findUniqueOrThrow({
          where: { id: requestRow.id },
        })
      ).updatedAt.toISOString(),
    ).toBe(before.requestUpdated);
    expect(
      (
        await prisma.requestResponse.findUniqueOrThrow({
          where: { id: responseRow.id },
        })
      ).updatedAt.toISOString(),
    ).toBe(before.responseUpdated);
    expect(
      (
        await prisma.helpConfirmation.findUniqueOrThrow({
          where: { id: confirmation.id },
        })
      ).createdAt.toISOString(),
    ).toBe(before.confirmationCreated);
    expect(
      (
        await prisma.contribution.findUniqueOrThrow({
          where: { id: contribution.id },
        })
      ).createdAt.toISOString(),
    ).toBe(before.contributionCreated);
    expect(await prisma.notification.count()).toBe(before.notifications);
  });

  it('credits historical request topics, keeps reputation after block, and hides moderated requests', async () => {
    const owner = await member('owner-topic-hist');
    const helper = await member('helper-topic-hist');
    const suffix = `${Date.now()}`;
    const historical = await prisma.taxonomyTopic.create({
      data: {
        slug: `fc014-hist-${suffix}`,
        label: `FC014_HIST_${suffix}`,
        isActive: true,
      },
    });
    const requestId = await publishedRequest(owner.id, [historical.id]);
    await prisma.taxonomyTopic.update({
      where: { id: historical.id },
      data: { isActive: false },
    });
    const responseId = await advice(requestId, helper.cookie);
    const helped = await json<HelpConfirmationMutationResponse>(
      await request(
        `/v1/requests/${requestId}/help-confirmations`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            responseId,
            outcome: 'HELPED',
            topicIds: [historical.id],
          }),
        },
      ),
    );
    expect(helped.confirmation.hasContribution).toBe(true);
    expect(
      await prisma.contributionTopic.count({
        where: {
          topicId: historical.id,
          contribution: { contributorId: helper.id },
        },
      }),
    ).toBe(1);
    await prisma.block.create({
      data: { blockerId: owner.id, blockedId: helper.id },
    });
    expect(
      (
        await request(
          `/v1/help-confirmations/${helped.confirmation.id}/thank-you`,
          owner.cookie,
          {
            method: 'POST',
            body: JSON.stringify({ body: 'Blocked now' }),
          },
        )
      ).status,
    ).toBe(403);
    const afterBlock = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, helper.cookie),
    );
    expect(afterBlock.summary.confirmedHelps).toBe(1);
    expect(afterBlock.contributions[0]?.topics[0]?.id).toBe(historical.id);

    const owner2 = await member('owner-moderated');
    const requestId2 = await publishedRequest(owner2.id);
    const responseId2 = await advice(requestId2, helper.cookie);
    await request(
      `/v1/requests/${requestId2}/help-confirmations`,
      owner2.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ responseId: responseId2, outcome: 'HELPED' }),
      },
    );
    await prisma.request.update({
      where: { id: requestId2 },
      data: { status: 'MODERATED_REMOVED' },
    });
    expect(
      (
        await request(
          `/v1/requests/${requestId2}/help-confirmations`,
          owner2.cookie,
          {
            method: 'POST',
            body: JSON.stringify({
              responseId: responseId2,
              outcome: 'HELPED',
            }),
          },
        )
      ).status,
    ).toBe(404);
    const afterModeration = await json<MemberReputationResponse>(
      await request(`/v1/founders/${helper.id}/reputation`, helper.cookie),
    );
    expect(afterModeration.summary.confirmedHelps).toBe(2);
    expect(
      afterModeration.contributions.some(
        (item) => item.requestId === requestId2,
      ),
    ).toBe(false);
    expect(JSON.stringify(afterModeration)).not.toContain(
      'Looking for UAE B2B launch help',
    );
  });
});
