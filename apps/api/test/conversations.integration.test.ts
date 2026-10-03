import type { AddressInfo } from 'node:net';

import type {
  ConversationCreatedResponse,
  MemberConversationResponse,
  MemberConversationsResponse,
  MemberHelpResponsesResponse,
  MemberMessagesResponse,
  MessageSentResponse,
} from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { SessionService } from '../src/auth/session.service.js';
import { AppConfig } from '../src/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { ensureOnboardingTaxonomy } from '../src/onboarding/taxonomy-seed.js';
import { RedisService } from '../src/redis/redis.service.js';

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

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';
const UUID_D = '44444444-4444-4444-8444-444444444444';
const UUID_E = '55555555-5555-4555-8555-555555555555';

describe('conversations HTTP integration', { timeout: 90_000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessions: SessionService;
  let config: AppConfig;
  let redis: RedisService;
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
    redis = app.get(RedisService);
    await ensureOnboardingTaxonomy(prisma, true);
  }, 60_000);

  afterAll(async () => {
    try {
      if (userIds.length > 0) {
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
      companyName?: string;
    } = {},
  ): Promise<{ id: string; cookie: string; email: string }> {
    const onboarded = extras.onboarded ?? true;
    const user = await prisma.user.create({
      data: {
        email: `fc013-${label}-${Date.now()}-${userIds.length}@example.com`,
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
            name: extras.companyName ?? `${label} Co`,
            city: 'Dubai',
            country: 'UAE',
          },
        },
      },
    });
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-013 integration test',
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
    extras: {
      status?:
        | 'DRAFT'
        | 'PUBLISHED'
        | 'RESOLVED'
        | 'DELETED_BY_AUTHOR'
        | 'MODERATED_REMOVED';
      headline?: string;
    } = {},
  ): Promise<string> {
    const status = extras.status ?? 'PUBLISHED';
    const created = await prisma.request.create({
      data: {
        authorId,
        type: 'ASK',
        status,
        headline: extras.headline ?? 'Looking for UAE B2B launch help',
        context:
          'Private request context must never appear in conversation payloads.',
        whoCouldHelp: 'Operators with distributor experience.',
        urgency: 'THIS_WEEK',
        publishedAt: status === 'DRAFT' ? null : new Date(),
        resolvedAt: status === 'RESOLVED' ? new Date() : null,
        deletedAt:
          status === 'DELETED_BY_AUTHOR' || status === 'MODERATED_REMOVED'
            ? new Date()
            : null,
      },
    });
    return created.id;
  }

  async function privateOffer(requestId: string, helperId: string) {
    return prisma.requestResponse.create({
      data: {
        requestId,
        authorId: helperId,
        type: 'PRIVATE_CHAT_OFFER',
      },
    });
  }

  function leak(payload: unknown): string {
    return JSON.stringify(payload);
  }

  it('requires ACTIVE_MEMBER and OriginGuard, and rejects mass assignment', async () => {
    const owner = await member('gate-owner', { displayName: 'Owner' });
    const helper = await member('gate-helper', { displayName: 'Helper' });
    const requestId = await publishedRequest(owner.id);
    const offer = await privateOffer(requestId, helper.id);
    expect((await request('/v1/conversations')).status).toBe(401);
    const unverified = await member('gate-unverified', { verified: false });
    expect((await request('/v1/conversations', unverified.cookie)).status).toBe(
      403,
    );
    expect(
      (await request('/v1/conversations/missing', unverified.cookie)).status,
    ).toBe(403);
    expect(
      (await request('/v1/conversations/missing/messages', unverified.cookie))
        .status,
    ).toBe(403);
    expect(
      (
        await request('/v1/conversations/missing/messages', unverified.cookie, {
          method: 'POST',
          body: JSON.stringify({ clientMessageId: UUID_A, body: 'nope' }),
        })
      ).status,
    ).toBe(403);
    const missingOrigin = await request(
      '/v1/conversations',
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
        headers: { origin: '' },
      },
      '',
    );
    expect(missingOrigin.status).toBe(403);
    const smuggled = await json<{ error: { code: string } }>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          privateChatOfferResponseId: offer.id,
          requestId,
          participantIds: [owner.id, helper.id],
          userId: owner.id,
          helperId: helper.id,
          status: 'ACTIVE',
          createdAt: 'now',
          updatedAt: 'now',
          conversationId: 'forced',
          senderId: owner.id,
          body: 'hello',
        }),
      }),
    );
    expect(smuggled.error.code).toBe('MESSAGING_INVALID_INPUT');
  });

  it('creates a request-linked conversation only from a valid private-chat offer', async () => {
    const owner = await member('create-owner', { displayName: 'Requester' });
    const helper = await member('create-helper', {
      displayName: 'Offer Helper',
      companyName: 'OrbitFlow',
    });
    const stranger = await member('create-stranger', {
      displayName: 'Stranger',
    });
    const requestId = await publishedRequest(owner.id);
    const offer = await privateOffer(requestId, helper.id);

    const helperCreate = await json<{ error: { code: string } }>(
      await request('/v1/conversations', helper.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    );
    expect(helperCreate.error.code).toBe('CONVERSATION_NOT_FOUND');

    const created = await request('/v1/conversations', owner.cookie, {
      method: 'POST',
      body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
    });
    expect(created.status).toBe(201);
    const body = await json<ConversationCreatedResponse>(created);
    expect(body.conversation.counterpart?.displayName).toBe('Offer Helper');
    expect(body.conversation.latestMessage).toBeNull();
    expect(body.conversation.requestContext.available).toBe(true);
    expect(
      await prisma.message.count({
        where: { conversationId: body.conversation.id },
      }),
    ).toBe(0);
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: body.conversation.id },
    });
    expect(participants.map((row) => row.userId).sort()).toEqual(
      [owner.id, helper.id].sort(),
    );
    expect(participants).toHaveLength(2);

    const duplicate = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    );
    expect(duplicate.conversation.id).toBe(body.conversation.id);
    expect(
      await prisma.conversation.count({
        where: { requestId, participants: { some: { userId: owner.id } } },
      }),
    ).toBe(1);

    const [first, second] = await Promise.all([
      request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
      request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    ]);
    const concurrent = [
      await json<ConversationCreatedResponse>(first),
      await json<ConversationCreatedResponse>(second),
    ];
    expect(concurrent[0]!.conversation.id).toBe(concurrent[1]!.conversation.id);
    expect(
      await prisma.conversation.count({
        where: { requestId },
      }),
    ).toBe(1);

    const hidden = await json<{ error: { code: string; message: string } }>(
      await request(
        `/v1/conversations/${body.conversation.id}`,
        stranger.cookie,
      ),
    );
    expect(hidden.error.code).toBe('CONVERSATION_NOT_FOUND');
    expect(leak(hidden)).not.toContain(requestId);
    expect(leak(hidden)).not.toContain(helper.id);
    expect(leak(body)).not.toContain(helper.email);
    expect(leak(body)).not.toContain('Private request context');
    expect(leak(body)).not.toContain('Secret Role');
    expect(leak(body)).not.toContain('THIS_WEEK');
    expect(leak(body)).not.toContain('whoCouldHelp');
    expect(Object.keys(body.conversation.requestContext).sort()).toEqual([
      'available',
      'headline',
      'id',
      'status',
      'topics',
      'type',
    ]);
    const hiddenMessages = await json<{
      error: { code: string; message: string };
    }>(
      await request(
        `/v1/conversations/${body.conversation.id}/messages`,
        stranger.cookie,
      ),
    );
    expect(hiddenMessages.error.code).toBe('CONVERSATION_NOT_FOUND');
    expect(leak(hiddenMessages)).not.toContain(requestId);
    expect(leak(hiddenMessages)).not.toContain(helper.id);
    expect(leak(hiddenMessages)).not.toMatch(/P2002|SELECT |stack/i);
  });

  it('rejects create from invalid request states, deleted offers, blocks, and ineligible helpers', async () => {
    const owner = await member('state-owner', { displayName: 'Owner' });
    const helper = await member('state-helper', { displayName: 'Helper' });
    for (const status of [
      'DRAFT',
      'DELETED_BY_AUTHOR',
      'MODERATED_REMOVED',
    ] as const) {
      const requestId = await publishedRequest(owner.id, { status });
      const offer = await privateOffer(requestId, helper.id);
      const denied = await json<{ error: { code: string } }>(
        await request('/v1/conversations', owner.cookie, {
          method: 'POST',
          body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
        }),
      );
      expect(denied.error.code).toBe(
        status === 'DRAFT' ||
          status === 'DELETED_BY_AUTHOR' ||
          status === 'MODERATED_REMOVED'
          ? 'MESSAGING_INVALID_STATE'
          : 'CONVERSATION_NOT_FOUND',
      );
    }

    const resolvedId = await publishedRequest(owner.id, { status: 'RESOLVED' });
    const resolvedOffer = await privateOffer(resolvedId, helper.id);
    const resolved = await request('/v1/conversations', owner.cookie, {
      method: 'POST',
      body: JSON.stringify({ privateChatOfferResponseId: resolvedOffer.id }),
    });
    expect(resolved.status).toBe(201);

    const liveId = await publishedRequest(owner.id);
    const deletedOffer = await privateOffer(liveId, helper.id);
    await prisma.requestResponse.update({
      where: { id: deletedOffer.id },
      data: { deletedAt: new Date() },
    });
    const deletedDenied = await json<{ error: { code: string } }>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: deletedOffer.id }),
      }),
    );
    expect(deletedDenied.error.code).toBe('CONVERSATION_NOT_FOUND');

    const blockedHelper = await member('blocked-helper', {
      displayName: 'Blocked',
    });
    const blockedRequest = await publishedRequest(owner.id);
    const blockedOffer = await privateOffer(blockedRequest, blockedHelper.id);
    await prisma.block.create({
      data: { blockerId: blockedHelper.id, blockedId: owner.id },
    });
    const blockedDenied = await json<{ error: { code: string } }>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: blockedOffer.id }),
      }),
    );
    expect(blockedDenied.error.code).toBe('MESSAGING_NOT_ALLOWED');

    const gone = await member('gone-helper', { displayName: 'Gone' });
    const goneRequest = await publishedRequest(owner.id);
    const goneOffer = await privateOffer(goneRequest, gone.id);
    await prisma.user.update({
      where: { id: gone.id },
      data: { status: 'SUSPENDED' },
    });
    const goneDenied = await json<{ error: { code: string } }>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: goneOffer.id }),
      }),
    );
    expect(goneDenied.error.code).toBe('MESSAGING_NOT_ALLOWED');
    expect(leak(goneDenied)).not.toContain('SUSPENDED');

    const liveAsk = await publishedRequest(owner.id);
    const advice = await prisma.requestResponse.create({
      data: {
        requestId: liveAsk,
        authorId: helper.id,
        type: 'ADVICE',
        body: 'UniqueAdviceBodyMustNeverMatchSearch',
      },
    });
    const intro = await prisma.requestResponse.create({
      data: {
        requestId: liveAsk,
        authorId: helper.id,
        type: 'INTRODUCTION_OFFER',
        introduction: {
          create: {
            personName: 'Secret Intro Person',
            reason: 'Confidential intro reason',
          },
        },
      },
    });
    for (const id of [advice.id, intro.id]) {
      const denied = await json<{ error: { code: string; message: string } }>(
        await request('/v1/conversations', owner.cookie, {
          method: 'POST',
          body: JSON.stringify({ privateChatOfferResponseId: id }),
        }),
      );
      expect(denied.error.code).toBe('CONVERSATION_NOT_FOUND');
      expect(leak(denied)).not.toContain('ADVICE');
      expect(leak(denied)).not.toContain('INTRODUCTION_OFFER');
      expect(leak(denied)).not.toContain(
        'UniqueAdviceBodyMustNeverMatchSearch',
      );
    }
    const outsider = await member('offer-outsider', {
      displayName: 'Outsider',
    });
    const liveOffer = await privateOffer(liveAsk, helper.id);
    const foreign = await json<{ error: { code: string; message: string } }>(
      await request('/v1/conversations', outsider.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: liveOffer.id }),
      }),
    );
    expect(foreign.error.code).toBe('CONVERSATION_NOT_FOUND');
    expect(leak(foreign)).not.toContain(liveAsk);
    expect(leak(foreign)).not.toContain(helper.id);
  });

  it('keeps history after resolve/delete/moderation and hides request context', async () => {
    const owner = await member('life-owner', { displayName: 'Owner' });
    const helper = await member('life-helper', { displayName: 'Helper' });
    const requestId = await publishedRequest(owner.id, {
      headline: 'Visible UAE partner request',
    });
    const offer = await privateOffer(requestId, helper.id);
    const created = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    );
    await request(
      `/v1/conversations/${created.conversation.id}/messages`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ clientMessageId: UUID_A, body: 'First note' }),
      },
    );
    await prisma.request.update({
      where: { id: requestId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    const afterResolve = await json<MemberConversationResponse>(
      await request(
        `/v1/conversations/${created.conversation.id}`,
        owner.cookie,
      ),
    );
    expect(afterResolve.conversation.requestContext.available).toBe(true);
    const sent = await request(
      `/v1/conversations/${created.conversation.id}/messages`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: UUID_B,
          body: 'Still talking after resolve',
        }),
      },
    );
    expect(sent.status).toBe(201);

    await prisma.request.update({
      where: { id: requestId },
      data: { status: 'DELETED_BY_AUTHOR', deletedAt: new Date() },
    });
    const afterDelete = await json<MemberConversationResponse>(
      await request(
        `/v1/conversations/${created.conversation.id}`,
        owner.cookie,
      ),
    );
    expect(afterDelete.conversation.requestContext).toEqual({
      available: false,
    });
    expect(leak(afterDelete)).not.toContain('Visible UAE partner request');
    const history = await json<MemberMessagesResponse>(
      await request(
        `/v1/conversations/${created.conversation.id}/messages`,
        owner.cookie,
      ),
    );
    expect(history.messages.map((row) => row.body)).toEqual([
      'First note',
      'Still talking after resolve',
    ]);

    await prisma.request.update({
      where: { id: requestId },
      data: { status: 'MODERATED_REMOVED' },
    });
    const afterModeration = await json<MemberConversationResponse>(
      await request(
        `/v1/conversations/${created.conversation.id}`,
        helper.cookie,
      ),
    );
    expect(afterModeration.conversation.requestContext.available).toBe(false);

    await prisma.user.update({
      where: { id: helper.id },
      data: { status: 'SUSPENDED' },
    });
    const unavailable = await json<MemberConversationResponse>(
      await request(
        `/v1/conversations/${created.conversation.id}`,
        owner.cookie,
      ),
    );
    expect(unavailable.conversation.counterpart).toBeNull();
    expect(unavailable.conversation.canSend).toBe(false);
    const blockedSend = await json<{ error: { code: string } }>(
      await request(
        `/v1/conversations/${created.conversation.id}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: '88888888-8888-4888-8888-888888888888',
            body: 'helper gone',
          }),
        },
      ),
    );
    expect(blockedSend.error.code).toBe('MESSAGING_NOT_ALLOWED');
    expect(leak(unavailable)).not.toContain('life-helper');

    await prisma.user.update({
      where: { id: helper.id },
      data: { status: 'ACTIVE' },
    });
    await prisma.user.update({
      where: { id: owner.id },
      data: { status: 'SUSPENDED' },
    });
    const authorGone = await json<MemberConversationResponse>(
      await request(
        `/v1/conversations/${created.conversation.id}`,
        helper.cookie,
      ),
    );
    expect(authorGone.conversation.requestContext).toEqual({
      available: false,
    });
    expect(leak(authorGone)).not.toContain('Visible UAE partner request');
    const authorHistory = await json<MemberMessagesResponse>(
      await request(
        `/v1/conversations/${created.conversation.id}/messages`,
        helper.cookie,
      ),
    );
    expect(authorHistory.messages.map((row) => row.body)).toEqual([
      'First note',
      'Still talking after resolve',
    ]);
    await prisma.user.update({
      where: { id: owner.id },
      data: { status: 'ACTIVE' },
    });
  });

  it('sends messages with idempotency, closed-state, block, and updatedAt rules', async () => {
    const owner = await member('send-owner', { displayName: 'Owner' });
    const helper = await member('send-helper', { displayName: 'Helper' });
    const stranger = await member('send-stranger');
    const requestId = await publishedRequest(owner.id);
    const offer = await privateOffer(requestId, helper.id);
    const created = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    );
    const conversationId = created.conversation.id;
    const before = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const first = await request(
      `/v1/conversations/${conversationId}/messages`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: UUID_A,
          body: '  Hello there  ',
        }),
      },
    );
    expect(first.status).toBe(201);
    const firstBody = await json<MessageSentResponse>(first);
    expect(firstBody.message.body).toBe('Hello there');
    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime(),
    );

    const replay = await json<MessageSentResponse>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: UUID_A,
            body: 'Hello there',
          }),
        },
      ),
    );
    expect(replay.message.id).toBe(firstBody.message.id);
    expect(replay.message.createdAt).toBe(firstBody.message.createdAt);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
    const afterReplay = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(afterReplay.updatedAt.toISOString()).toBe(
      after.updatedAt.toISOString(),
    );

    const messageNotifications = await prisma.notification.findMany({
      where: {
        userId: helper.id,
        type: 'REQUEST_MESSAGE',
      },
      select: {
        type: true,
        title: true,
        body: true,
        href: true,
      },
    });
    expect(messageNotifications).toEqual([
      {
        type: 'REQUEST_MESSAGE',
        title: 'New message',
        body: 'Owner sent you a message about "Looking for UAE B2B launch help".',
        href: `/messages/${conversationId}`,
      },
    ]);
    expect(JSON.stringify(messageNotifications)).not.toContain('Hello there');

    const conflict = await json<{ error: { code: string; message: string } }>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ clientMessageId: UUID_A, body: 'Different' }),
        },
      ),
    );
    expect(conflict.error.code).toBe('MESSAGING_IDEMPOTENCY_CONFLICT');
    expect(leak(conflict)).not.toMatch(/P2002|Prisma|SELECT /);
    expect(leak(conflict)).not.toContain('Hello there');
    expect(leak(conflict)).not.toContain('Different');

    const [left, right] = await Promise.all([
      request(`/v1/conversations/${conversationId}/messages`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: UUID_B,
          body: 'Concurrent one',
        }),
      }),
      request(`/v1/conversations/${conversationId}/messages`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: UUID_B,
          body: 'Concurrent one',
        }),
      }),
    ]);
    expect((await json<MessageSentResponse>(left)).message.id).toBe(
      (await json<MessageSentResponse>(right)).message.id,
    );
    expect(
      await prisma.message.count({
        where: { conversationId, clientMessageId: UUID_B },
      }),
    ).toBe(1);

    const mismatchId = '99999999-9999-4999-8999-999999999999';
    const [mismatchLeft, mismatchRight] = await Promise.all([
      request(`/v1/conversations/${conversationId}/messages`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: mismatchId,
          body: 'Mismatch body A',
        }),
      }),
      request(`/v1/conversations/${conversationId}/messages`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: mismatchId,
          body: 'Mismatch body B',
        }),
      }),
    ]);
    const mismatchStatuses = [mismatchLeft.status, mismatchRight.status].sort();
    expect(mismatchStatuses).toEqual([201, 409]);
    expect(
      await prisma.message.count({
        where: { conversationId, clientMessageId: mismatchId },
      }),
    ).toBe(1);
    const mismatchWinner = await prisma.message.findUniqueOrThrow({
      where: {
        conversationId_clientMessageId: {
          conversationId,
          clientMessageId: mismatchId,
        },
      },
    });
    expect(['Mismatch body A', 'Mismatch body B']).toContain(
      mismatchWinner.body,
    );
    const mismatchLoser =
      mismatchLeft.status === 409 ? mismatchLeft : mismatchRight;
    const mismatchError = await json<{ error: { code: string } }>(
      mismatchLoser,
    );
    expect(mismatchError.error.code).toBe('MESSAGING_IDEMPOTENCY_CONFLICT');
    expect(leak(mismatchError)).not.toMatch(/P2002/);

    const [distinctLeft, distinctRight] = await Promise.all([
      request(`/v1/conversations/${conversationId}/messages`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaa01',
          body: 'Distinct one',
        }),
      }),
      request(`/v1/conversations/${conversationId}/messages`, helper.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaa02',
          body: 'Distinct two',
        }),
      }),
    ]);
    expect(distinctLeft.status).toBe(201);
    expect(distinctRight.status).toBe(201);
    expect(
      await prisma.message.count({
        where: {
          conversationId,
          clientMessageId: {
            in: [
              'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaa01',
              'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaa02',
            ],
          },
        },
      }),
    ).toBe(2);
    const afterDistinct = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const distinctBodies = [
      await json<MessageSentResponse>(distinctLeft),
      await json<MessageSentResponse>(distinctRight),
    ];
    const latestCreated = distinctBodies
      .map((row) => new Date(row.message.createdAt).getTime())
      .sort((left, right) => right - left)[0]!;
    expect(afterDistinct.updatedAt.getTime()).toBeGreaterThanOrEqual(
      latestCreated,
    );

    const smuggledSend = await json<{ error: { code: string } }>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaa03',
            body: 'hello',
            senderId: helper.id,
            conversationId: 'other',
            requestId,
            deletedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            id: 'forced-id',
            participantIds: [owner.id],
            status: 'CLOSED',
            userId: helper.id,
            authorId: helper.id,
            email: helper.email,
          }),
        },
      ),
    );
    expect(smuggledSend.error.code).toBe('MESSAGING_INVALID_INPUT');

    const other = await json<MessageSentResponse>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: UUID_C,
            body: '<script>alert(1)</script>',
          }),
        },
      ),
    );
    expect(other.message.body).toBe('<script>alert(1)</script>');

    const missingOrigin = await request(
      `/v1/conversations/${conversationId}/messages`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: UUID_D,
          body: 'no origin',
        }),
        headers: { origin: '' },
      },
      '',
    );
    expect(missingOrigin.status).toBe(403);

    const foreign = await json<{ error: { code: string } }>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        stranger.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: UUID_E,
            body: 'nope',
          }),
        },
      ),
    );
    expect(foreign.error.code).toBe('CONVERSATION_NOT_FOUND');

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'CLOSED' },
    });
    const closed = await json<{ error: { code: string } }>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: '66666666-6666-4666-8666-666666666666',
            body: 'closed',
          }),
        },
      ),
    );
    expect(closed.error.code).toBe('MESSAGING_INVALID_STATE');
    const closedDetail = await json<MemberConversationResponse>(
      await request(`/v1/conversations/${conversationId}`, owner.cookie),
    );
    expect(closedDetail.conversation.status).toBe('CLOSED');
    expect(closedDetail.conversation.canSend).toBe(false);
    const closedHistory = await json<MemberMessagesResponse>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
      ),
    );
    expect(closedHistory.messages.length).toBeGreaterThan(0);
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'ACTIVE' },
    });

    await prisma.block.create({
      data: { blockerId: owner.id, blockedId: helper.id },
    });
    const blocked = await json<{ error: { code: string } }>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: '77777777-7777-4777-8777-777777777777',
            body: 'blocked',
          }),
        },
      ),
    );
    expect(blocked.error.code).toBe('MESSAGING_NOT_ALLOWED');
    const listed = await json<MemberConversationsResponse>(
      await request('/v1/conversations', owner.cookie),
    );
    expect(listed.conversations.some((row) => row.id === conversationId)).toBe(
      true,
    );
  });

  it('paginates history, hides deleted bodies, and keeps GET side-effect free', async () => {
    const owner = await member('hist-owner', { displayName: 'Owner' });
    const helper = await member('hist-helper', { displayName: 'Helper' });
    const requestId = await publishedRequest(owner.id);
    const offer = await privateOffer(requestId, helper.id);
    const created = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    );
    const conversationId = created.conversation.id;
    const createdRow = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const stamp = new Date('2024-01-01T00:00:00.000Z');
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId: owner.id },
      },
      data: { lastReadAt: stamp },
    });
    const tied = new Date('2026-04-01T00:00:00.000Z');
    const first = await prisma.message.create({
      data: {
        id: 'msghist000000000000000001',
        conversationId,
        senderId: owner.id,
        clientMessageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        body: 'Oldest',
        createdAt: tied,
      },
    });
    const second = await prisma.message.create({
      data: {
        id: 'msghist000000000000000002',
        conversationId,
        senderId: helper.id,
        clientMessageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        body: 'Middle',
        createdAt: tied,
      },
    });
    const third = await prisma.message.create({
      data: {
        id: 'msghist000000000000000003',
        conversationId,
        senderId: owner.id,
        clientMessageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
        body: 'Newest secret',
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    });
    await prisma.message.update({
      where: { id: second.id },
      data: { deletedAt: new Date() },
    });
    const latest = await json<MemberMessagesResponse>(
      await request(
        `/v1/conversations/${conversationId}/messages?limit=2`,
        owner.cookie,
      ),
    );
    expect(latest.messages.map((row) => row.id)).toEqual([second.id, third.id]);
    expect(latest.messages[0]).toMatchObject({ body: null, removed: true });
    expect(latest.messages[1]?.body).toBe('Newest secret');
    expect(latest.nextBefore).toBe(second.id);
    const older = await json<MemberMessagesResponse>(
      await request(
        `/v1/conversations/${conversationId}/messages?limit=2&before=${second.id}`,
        owner.cookie,
      ),
    );
    expect(older.messages.map((row) => row.id)).toEqual([first.id]);
    expect(older.nextBefore).toBeNull();
    const foreign = await json<{ error: { code: string } }>(
      await request(
        `/v1/conversations/${conversationId}/messages?before=${offer.id}`,
        owner.cookie,
      ),
    );
    expect(foreign.error.code).toBe('MESSAGING_INVALID_INPUT');
    expect(leak(foreign)).not.toContain('Oldest');
    const otherRequest = await publishedRequest(owner.id);
    const otherOffer = await privateOffer(otherRequest, helper.id);
    const otherCreated = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: otherOffer.id }),
      }),
    );
    const foreignMessage = await prisma.message.create({
      data: {
        conversationId: otherCreated.conversation.id,
        senderId: owner.id,
        clientMessageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9',
        body: 'Foreign conversation secret',
      },
    });
    const foreignCursor = await json<{
      error: { code: string; message: string };
    }>(
      await request(
        `/v1/conversations/${conversationId}/messages?before=${foreignMessage.id}`,
        owner.cookie,
      ),
    );
    expect(foreignCursor.error.code).toBe('MESSAGING_INVALID_INPUT');
    expect(leak(foreignCursor)).not.toContain(otherCreated.conversation.id);
    expect(leak(foreignCursor)).not.toContain('Foreign conversation secret');
    expect(leak(foreignCursor)).not.toContain(helper.id);

    const reread = await prisma.conversationParticipant.findUniqueOrThrow({
      where: {
        conversationId_userId: { conversationId, userId: owner.id },
      },
    });
    expect(reread.lastReadAt?.toISOString()).toBe(stamp.toISOString());
    await request(`/v1/conversations/${conversationId}`, owner.cookie);
    await request(`/v1/conversations/${conversationId}`, owner.cookie);
    await request(`/v1/conversations/${conversationId}/messages`, owner.cookie);
    await request('/v1/conversations', owner.cookie);
    const afterGets = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(afterGets.updatedAt.toISOString()).toBe(
      createdRow.updatedAt.toISOString(),
    );
    const rereadAgain = await prisma.conversationParticipant.findUniqueOrThrow({
      where: {
        conversationId_userId: { conversationId, userId: owner.id },
      },
    });
    expect(rereadAgain.lastReadAt?.toISOString()).toBe(stamp.toISOString());
    const preview = await json<MemberConversationsResponse>(
      await request('/v1/conversations', owner.cookie),
    );
    expect(
      preview.conversations.find((row) => row.id === conversationId)
        ?.latestMessage?.body,
    ).toBe('Newest secret');

    await prisma.message.update({
      where: { id: first.id },
      data: { deletedAt: new Date() },
    });
    await prisma.message.update({
      where: { id: third.id },
      data: { deletedAt: new Date() },
    });
    const emptyPreview = await json<MemberConversationsResponse>(
      await request('/v1/conversations', owner.cookie),
    );
    expect(
      emptyPreview.conversations.find((row) => row.id === conversationId)
        ?.latestMessage,
    ).toBeNull();
  });

  it('lists only the caller inbox, searches safely, and distinguishes empty from search-zero', async () => {
    const owner = await member('list-owner', { displayName: 'List Owner' });
    const helper = await member('list-helper', {
      displayName: 'Searchable Chen',
      companyName: 'OrbitFlow Search Co',
    });
    const other = await member('list-other', { displayName: 'Other' });
    const requestId = await publishedRequest(owner.id, {
      headline: 'Unique headline about Dubai partners',
    });
    const offer = await privateOffer(requestId, helper.id);
    const created = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    );
    await request(
      `/v1/conversations/${created.conversation.id}/messages`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: UUID_A,
          body: 'Secret body should not match search',
        }),
      },
    );
    const otherInbox = await json<MemberConversationsResponse>(
      await request('/v1/conversations', other.cookie),
    );
    expect(otherInbox.total).toBe(0);
    expect(otherInbox.q).toBeNull();
    const named = await json<MemberConversationsResponse>(
      await request('/v1/conversations?q=Searchable%20Chen', owner.cookie),
    );
    expect(named.total).toBe(1);
    const company = await json<MemberConversationsResponse>(
      await request('/v1/conversations?q=OrbitFlow%20Search', owner.cookie),
    );
    expect(company.total).toBe(1);
    const headline = await json<MemberConversationsResponse>(
      await request('/v1/conversations?q=Unique%20headline', owner.cookie),
    );
    expect(headline.total).toBe(1);
    const bodySearch = await json<MemberConversationsResponse>(
      await request(
        '/v1/conversations?q=Secret%20body%20should%20not%20match%20search',
        owner.cookie,
      ),
    );
    expect(bodySearch.total).toBe(0);
    await prisma.requestResponse.create({
      data: {
        requestId,
        authorId: helper.id,
        type: 'ADVICE',
        body: 'AdviceOnlyTokenShouldNeverMatchInbox',
      },
    });
    await prisma.requestResponse.create({
      data: {
        requestId,
        authorId: helper.id,
        type: 'INTRODUCTION_OFFER',
        introduction: {
          create: {
            personName: 'IntroOnlyPersonNeverSearchable',
            reason: 'IntroOnlyReasonNeverSearchable',
          },
        },
      },
    });
    const adviceSearch = await json<MemberConversationsResponse>(
      await request(
        '/v1/conversations?q=AdviceOnlyTokenShouldNeverMatchInbox',
        owner.cookie,
      ),
    );
    expect(adviceSearch.total).toBe(0);
    const introSearch = await json<MemberConversationsResponse>(
      await request(
        '/v1/conversations?q=IntroOnlyPersonNeverSearchable',
        owner.cookie,
      ),
    );
    expect(introSearch.total).toBe(0);
    const emailSearch = await json<MemberConversationsResponse>(
      await request(
        `/v1/conversations?q=${encodeURIComponent(helper.email)}`,
        owner.cookie,
      ),
    );
    expect(emailSearch.total).toBe(0);

    const helperB = await member('list-helper-b', {
      displayName: 'Beta Helper',
    });
    const secondRequest = await publishedRequest(owner.id, {
      headline: 'Second inbox request',
    });
    const secondOffer = await privateOffer(secondRequest, helperB.id);
    const second = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: secondOffer.id }),
      }),
    );
    const tied = new Date('2026-06-01T00:00:00.000Z');
    await prisma.conversation.update({
      where: { id: created.conversation.id },
      data: { updatedAt: tied },
    });
    await prisma.conversation.update({
      where: { id: second.conversation.id },
      data: { updatedAt: tied },
    });
    const ordered = await json<MemberConversationsResponse>(
      await request('/v1/conversations', owner.cookie),
    );
    const tiedIds = ordered.conversations
      .filter(
        (row) =>
          row.id === created.conversation.id ||
          row.id === second.conversation.id,
      )
      .map((row) => row.id);
    const expectedOrder = [created.conversation.id, second.conversation.id]
      .sort()
      .reverse();
    expect(tiedIds).toEqual(expectedOrder);

    await prisma.user.update({
      where: { id: helper.id },
      data: { status: 'SUSPENDED' },
    });
    const staleName = await json<MemberConversationsResponse>(
      await request('/v1/conversations?q=Searchable%20Chen', owner.cookie),
    );
    expect(staleName.total).toBe(0);
    const stillListed = await json<MemberConversationsResponse>(
      await request('/v1/conversations', owner.cookie),
    );
    const listedFirst = stillListed.conversations.find(
      (row) => row.id === created.conversation.id,
    );
    expect(listedFirst).toBeDefined();
    expect(listedFirst?.counterpart).toBeNull();
    expect(leak(listedFirst)).not.toContain('Searchable Chen');
    expect(leak(listedFirst)).not.toContain('OrbitFlow Search Co');

    await prisma.request.update({
      where: { id: requestId },
      data: { status: 'DELETED_BY_AUTHOR', deletedAt: new Date() },
    });
    const hiddenHeadline = await json<MemberConversationsResponse>(
      await request('/v1/conversations?q=Unique%20headline', owner.cookie),
    );
    expect(hiddenHeadline.total).toBe(0);
    const unfiltered = await json<MemberConversationsResponse>(
      await request('/v1/conversations', owner.cookie),
    );
    expect(
      unfiltered.conversations.some(
        (row) => row.id === created.conversation.id,
      ),
    ).toBe(true);
  });

  it('rate-limits new sends, skips exact replay, and fail-closes when Redis is down', async () => {
    const owner = await member('rate-owner', { displayName: 'Owner' });
    const helper = await member('rate-helper', { displayName: 'Helper' });
    const requestId = await publishedRequest(owner.id);
    const offer = await privateOffer(requestId, helper.id);
    const created = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    );
    const conversationId = created.conversation.id;
    const spy = vi.spyOn(redis, 'incrementFixedWindow');
    const firstId = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaa01';
    const first = await request(
      `/v1/conversations/${conversationId}/messages`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ clientMessageId: firstId, body: 'counted' }),
      },
    );
    expect(first.status).toBe(201);
    expect(spy.mock.calls.at(-1)?.[0]).toMatch(/^messaging-rate:v1:send:/);
    expect(JSON.stringify(spy.mock.calls.at(-1))).not.toContain('counted');
    const replayCalls = spy.mock.calls.length;
    const replay = await request(
      `/v1/conversations/${conversationId}/messages`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ clientMessageId: firstId, body: 'counted' }),
      },
    );
    expect(replay.status).toBe(201);
    expect(spy.mock.calls.length).toBe(replayCalls);
    const conflictCalls = spy.mock.calls.length;
    const conflict = await json<{ error: { code: string } }>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: firstId,
            body: 'different counted',
          }),
        },
      ),
    );
    expect(conflict.error.code).toBe('MESSAGING_IDEMPOTENCY_CONFLICT');
    expect(spy.mock.calls.length).toBe(conflictCalls);

    const helperB = await member('rate-helper-b', { displayName: 'Helper B' });
    const secondRequest = await publishedRequest(owner.id);
    const secondOffer = await privateOffer(secondRequest, helperB.id);
    const second = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: secondOffer.id }),
      }),
    );
    const secondId = second.conversation.id;

    for (let index = 2; index <= 15; index += 1) {
      const id = `aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaa${String(index).padStart(2, '0')}`;
      const sent = await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: id,
            body: `msg ${String(index)}`,
          }),
        },
      );
      expect(sent.status).toBe(201);
    }
    for (let index = 16; index <= 30; index += 1) {
      const id = `aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaa${String(index).padStart(2, '0')}`;
      const sent = await request(
        `/v1/conversations/${secondId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: id,
            body: `msg ${String(index)}`,
          }),
        },
      );
      expect(sent.status).toBe(201);
    }
    const limited = await json<{ error: { code: string; message: string } }>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaa31',
            body: 'too many',
          }),
        },
      ),
    );
    expect(limited.error.code).toBe('MESSAGING_RATE_LIMITED');
    expect(leak(limited)).not.toContain('too many');
    expect(JSON.stringify(spy.mock.calls)).not.toContain(owner.email);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(conversationId);
    const helperSend = await request(
      `/v1/conversations/${conversationId}/messages`,
      helper.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
          body: 'helper still allowed',
        }),
      },
    );
    expect(helperSend.status).toBe(201);

    spy.mockRejectedValueOnce(new Error('redis down'));
    const closed = await json<{ error: { code: string } }>(
      await request(
        `/v1/conversations/${conversationId}/messages`,
        owner.cookie,
        {
          method: 'POST',
          body: JSON.stringify({
            clientMessageId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaa32',
            body: 'fail closed',
          }),
        },
      ),
    );
    expect(closed.error.code).toBe('MESSAGING_RATE_LIMITED');
    expect(
      await prisma.message.count({
        where: {
          conversationId,
          clientMessageId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaa32',
        },
      }),
    ).toBe(0);
    spy.mockRestore();
  });

  it('serializes concurrent same-id sends so Redis is charged once', async () => {
    const owner = await member('quota-owner', { displayName: 'Owner' });
    const helper = await member('quota-helper', { displayName: 'Helper' });
    const requestId = await publishedRequest(owner.id);
    const offer = await privateOffer(requestId, helper.id);
    const created = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    );
    const conversationId = created.conversation.id;
    const beforeRow = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const spy = vi.spyOn(redis, 'incrementFixedWindow');
    const sameId = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
    const beforeSame = spy.mock.calls.length;
    const [sameLeft, sameRight] = await Promise.all([
      request(`/v1/conversations/${conversationId}/messages`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: sameId,
          body: 'Same concurrent body',
        }),
      }),
      request(`/v1/conversations/${conversationId}/messages`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: sameId,
          body: 'Same concurrent body',
        }),
      }),
    ]);
    expect(sameLeft.status).toBe(201);
    expect(sameRight.status).toBe(201);
    const sameBodies = [
      await json<MessageSentResponse>(sameLeft),
      await json<MessageSentResponse>(sameRight),
    ];
    expect(sameBodies[0]!.message.id).toBe(sameBodies[1]!.message.id);
    expect(
      await prisma.message.count({
        where: { conversationId, clientMessageId: sameId },
      }),
    ).toBe(1);
    expect(spy.mock.calls.length).toBe(beforeSame + 1);
    const afterSame = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(afterSame.updatedAt.getTime()).toBeGreaterThan(
      beforeRow.updatedAt.getTime(),
    );

    const replay = await request(
      `/v1/conversations/${conversationId}/messages`,
      owner.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: sameId,
          body: 'Same concurrent body',
        }),
      },
    );
    expect(replay.status).toBe(201);
    expect(spy.mock.calls.length).toBe(beforeSame + 1);
    const afterReplay = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(afterReplay.updatedAt.toISOString()).toBe(
      afterSame.updatedAt.toISOString(),
    );

    const mismatchId = 'cccccccc-cccc-4ccc-8ccc-cccccccccc02';
    const beforeMismatch = spy.mock.calls.length;
    const [mismatchLeft, mismatchRight] = await Promise.all([
      request(`/v1/conversations/${conversationId}/messages`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: mismatchId,
          body: 'Quota body A',
        }),
      }),
      request(`/v1/conversations/${conversationId}/messages`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: mismatchId,
          body: 'Quota body B',
        }),
      }),
    ]);
    expect([mismatchLeft.status, mismatchRight.status].sort()).toEqual([
      201, 409,
    ]);
    expect(
      await prisma.message.count({
        where: { conversationId, clientMessageId: mismatchId },
      }),
    ).toBe(1);
    expect(spy.mock.calls.length).toBe(beforeMismatch + 1);
    const mismatchLoser =
      mismatchLeft.status === 409 ? mismatchLeft : mismatchRight;
    expect(
      (await json<{ error: { code: string } }>(mismatchLoser)).error.code,
    ).toBe('MESSAGING_IDEMPOTENCY_CONFLICT');

    const beforeDistinct = spy.mock.calls.length;
    const [distinctLeft, distinctRight] = await Promise.all([
      request(`/v1/conversations/${conversationId}/messages`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc03',
          body: 'Quota distinct one',
        }),
      }),
      request(`/v1/conversations/${conversationId}/messages`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc04',
          body: 'Quota distinct two',
        }),
      }),
    ]);
    expect(distinctLeft.status).toBe(201);
    expect(distinctRight.status).toBe(201);
    expect(spy.mock.calls.length).toBe(beforeDistinct + 2);
    expect(
      await prisma.message.count({
        where: {
          conversationId,
          clientMessageId: {
            in: [
              'cccccccc-cccc-4ccc-8ccc-cccccccccc03',
              'cccccccc-cccc-4ccc-8ccc-cccccccccc04',
            ],
          },
        },
      }),
    ).toBe(2);
    spy.mockRestore();
  });

  it('keeps FC-012 private-chat offers body-less and hides conversation metadata from general viewers', async () => {
    const owner = await member('reg-owner', { displayName: 'Owner' });
    const helper = await member('reg-helper', { displayName: 'Helper' });
    const viewer = await member('reg-viewer', { displayName: 'Viewer' });
    const requestId = await publishedRequest(owner.id);
    await request(
      `/v1/requests/${requestId}/responses/private-chat`,
      helper.cookie,
      { method: 'POST', body: JSON.stringify({}) },
    );
    const ownerList = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, owner.cookie),
    );
    const helperList = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, helper.cookie),
    );
    const viewerList = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, viewer.cookie),
    );
    const ownerPrivate = ownerList.responses.find(
      (row) => row.type === 'PRIVATE_CHAT_OFFER',
    );
    const helperPrivate = helperList.responses.find(
      (row) => row.type === 'PRIVATE_CHAT_OFFER',
    );
    const viewerPrivate = viewerList.responses.find(
      (row) => row.type === 'PRIVATE_CHAT_OFFER',
    );
    expect(ownerPrivate?.body).toBeNull();
    expect(helperPrivate?.body).toBeNull();
    expect(viewerPrivate?.body).toBeNull();
    expect(ownerPrivate?.privateChat).toEqual({
      conversationId: null,
      canStart: true,
      canOpen: false,
    });
    expect(helperPrivate?.privateChat).toEqual({
      conversationId: null,
      canStart: false,
      canOpen: false,
    });
    expect(viewerPrivate?.privateChat).toBeNull();
    expect(leak(viewerList)).not.toContain('canStart');
    expect(leak(viewerList)).not.toContain('conversationId');

    const started = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          privateChatOfferResponseId: ownerPrivate!.id,
        }),
      }),
    );
    expect(
      await prisma.helpConfirmation.count({
        where: { requestId },
      }),
    ).toBe(0);
    const notifications = await prisma.notification.findMany({
      where: { userId: { in: [owner.id, helper.id, viewer.id] } },
      select: {
        userId: true,
        type: true,
        title: true,
        body: true,
        href: true,
      },
    });
    expect(notifications).toEqual([
      {
        userId: owner.id,
        type: 'PRIVATE_HELP_OFFER',
        title: 'Private help offered',
        body: 'Helper offered to help privately.',
        href: `/requests/${requestId}`,
      },
    ]);
    const ownerAfter = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, owner.cookie),
    );
    const helperAfter = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, helper.cookie),
    );
    const viewerAfter = await json<MemberHelpResponsesResponse>(
      await request(`/v1/requests/${requestId}/responses`, viewer.cookie),
    );
    expect(
      ownerAfter.responses.find((row) => row.type === 'PRIVATE_CHAT_OFFER')
        ?.privateChat,
    ).toEqual({
      conversationId: started.conversation.id,
      canStart: false,
      canOpen: true,
    });
    expect(
      helperAfter.responses.find((row) => row.type === 'PRIVATE_CHAT_OFFER')
        ?.privateChat,
    ).toEqual({
      conversationId: started.conversation.id,
      canStart: false,
      canOpen: true,
    });
    expect(
      viewerAfter.responses.find((row) => row.type === 'PRIVATE_CHAT_OFFER')
        ?.privateChat,
    ).toBeNull();
    expect(leak(viewerAfter)).not.toContain(started.conversation.id);
  });

  it('returns the oldest legacy pair without merging or deleting extras', async () => {
    const owner = await member('legacy-owner', { displayName: 'Owner' });
    const helper = await member('legacy-helper', { displayName: 'Helper' });
    const requestId = await publishedRequest(owner.id);
    const offer = await privateOffer(requestId, helper.id);
    const older = await prisma.conversation.create({
      data: {
        requestId,
        status: 'ACTIVE',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        participants: {
          create: [{ userId: owner.id }, { userId: helper.id }],
        },
      },
    });
    const newer = await prisma.conversation.create({
      data: {
        requestId,
        status: 'ACTIVE',
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
        participants: {
          create: [{ userId: owner.id }, { userId: helper.id }],
        },
      },
    });
    const returned = await json<ConversationCreatedResponse>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: offer.id }),
      }),
    );
    expect(returned.conversation.id).toBe(older.id);
    expect(returned.conversation.id).not.toBe(newer.id);
    expect(await prisma.conversation.count({ where: { requestId } })).toBe(2);
    expect(
      await prisma.conversationParticipant.count({
        where: { conversationId: { in: [older.id, newer.id] } },
      }),
    ).toBe(4);
  });

  it('keeps create coherent against concurrent resolve and delete', async () => {
    const owner = await member('race-owner', { displayName: 'Owner' });
    const helper = await member('race-helper', { displayName: 'Helper' });
    const resolveRequest = await publishedRequest(owner.id);
    const resolveOffer = await privateOffer(resolveRequest, helper.id);
    const [createVsResolve, resolveRes] = await Promise.all([
      request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          privateChatOfferResponseId: resolveOffer.id,
        }),
      }),
      request(`/v1/requests/${resolveRequest}/resolve`, owner.cookie, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    ]);
    expect(createVsResolve.status).toBe(201);
    expect(resolveRes.status).toBe(200);
    expect(
      await prisma.conversation.count({ where: { requestId: resolveRequest } }),
    ).toBe(1);
    const resolvedRow = await prisma.request.findUniqueOrThrow({
      where: { id: resolveRequest },
    });
    expect(resolvedRow.status).toBe('RESOLVED');

    const deleteRequest = await publishedRequest(owner.id);
    const deleteOffer = await privateOffer(deleteRequest, helper.id);
    const [createVsDelete, deleteRes] = await Promise.all([
      request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({
          privateChatOfferResponseId: deleteOffer.id,
        }),
      }),
      request(`/v1/requests/${deleteRequest}`, owner.cookie, {
        method: 'DELETE',
        body: JSON.stringify({}),
      }),
    ]);
    expect([createVsDelete.status, deleteRes.status].includes(500)).toBe(false);
    const createVsDeleteBody = await json<{
      conversation?: { id: string };
      error?: { code: string; message: string };
    }>(createVsDelete);
    expect(leak(createVsDeleteBody)).not.toMatch(/P2002|deadlock/i);
    const deletedRow = await prisma.request.findUniqueOrThrow({
      where: { id: deleteRequest },
    });
    const conversations = await prisma.conversation.count({
      where: { requestId: deleteRequest },
    });
    if (deletedRow.status === 'DELETED_BY_AUTHOR') {
      if (createVsDelete.status === 201) {
        expect(conversations).toBe(1);
      } else {
        expect(createVsDeleteBody.error?.code).toBe('MESSAGING_INVALID_STATE');
        expect(conversations).toBe(0);
      }
    } else {
      expect(createVsDelete.status).toBe(201);
      expect(conversations).toBe(1);
    }

    const afterDelete = await publishedRequest(owner.id);
    const afterOffer = await privateOffer(afterDelete, helper.id);
    await request(`/v1/requests/${afterDelete}`, owner.cookie, {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    const tooLate = await json<{ error: { code: string } }>(
      await request('/v1/conversations', owner.cookie, {
        method: 'POST',
        body: JSON.stringify({ privateChatOfferResponseId: afterOffer.id }),
      }),
    );
    expect(tooLate.error.code).toBe('MESSAGING_INVALID_STATE');
    expect(
      await prisma.conversation.count({ where: { requestId: afterDelete } }),
    ).toBe(0);
  });
});
