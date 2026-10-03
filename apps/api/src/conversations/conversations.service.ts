import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  CONVERSATION_STATUSES,
  MESSAGING_ERROR_CODES,
  NOTIFICATION_TYPES,
  REQUEST_STATUSES,
  RESPONSE_TYPES,
  type ConversationCreatedResponse,
  type ConversationLatestMessage,
  type ConversationRequestContext,
  type MemberConversation,
  type MemberConversationResponse,
  type MemberConversationsResponse,
  type MemberConversationSummary,
  type MemberMessage,
  type MemberMessagesResponse,
  type MemberMessagingCounterpart,
  type MemberRequestListStatus,
  type MemberTopicRef,
  type MessageSentResponse,
  type RequestType,
} from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { Prisma as PrismaNamespace } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import { areMembersBlocked } from '../safety/block-access.js';
import { NotificationWriterService } from '../notifications/notification-writer.service.js';
import {
  isTransactionConflict,
  isUniqueConstraintError,
  lockConversation,
  lockRequest,
  REQUEST_ROW_RETRY_ATTEMPTS,
} from '../requests/request-locks.js';
import {
  conversationCreatedEvent,
  messageSentEvent,
} from './conversations-events.js';
import {
  conversationNotFound,
  messagingIdempotencyConflict,
  messagingInvalidInput,
  messagingInvalidState,
  messagingNotAllowed,
  parseConversationId,
  parseConversationsListQuery,
  parseCreateConversationBody,
  parseMessagesHistoryQuery,
  parseSendMessageBody,
} from './conversations-query.js';
import { MessagingRateLimiter } from './messaging-rate-limiter.js';

const MESSAGING_RETRY_ATTEMPTS = REQUEST_ROW_RETRY_ATTEMPTS;

const authorSelect = {
  id: true,
  status: true,
  deletedAt: true,
  emailVerifiedAt: true,
  onboardingCompletedAt: true,
  suspendedUntil: true,
  application: { select: { status: true } },
  profile: {
    select: {
      displayName: true,
      avatarUrl: true,
      city: true,
      country: true,
      company: {
        select: {
          name: true,
          city: true,
          country: true,
        },
      },
    },
  },
} as const;

const requestSelect = {
  id: true,
  authorId: true,
  type: true,
  status: true,
  headline: true,
  author: { select: authorSelect },
  topics: {
    select: {
      topic: {
        select: {
          id: true,
          slug: true,
          label: true,
          isActive: true,
          mergedIntoId: true,
        },
      },
    },
    orderBy: { topic: { label: 'asc' as const } },
  },
} as const;

const conversationInclude = {
  participants: {
    include: {
      user: { select: authorSelect },
    },
  },
  request: {
    select: requestSelect,
  },
} as const;

const messageSelect = {
  id: true,
  senderId: true,
  createdAt: true,
  body: true,
  deletedAt: true,
} as const;

const offerPreviewInclude = {
  author: { select: authorSelect },
  request: { select: requestSelect },
} as const;

type StoredConversation = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

type StoredUser = StoredConversation['participants'][number]['user'];
type StoredRequest = NonNullable<StoredConversation['request']>;
type StoredMessage = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;
type MessagePreviewRow = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date | string;
};

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MessagingRateLimiter)
    private readonly rateLimiter: MessagingRateLimiter,
    @Inject(NotificationWriterService)
    private readonly notifications: NotificationWriterService,
  ) {}

  async list(
    callerId: string,
    query: Record<string, unknown>,
  ): Promise<MemberConversationsResponse> {
    const parsed = parseConversationsListQuery(query);
    const where = this.listWhere(callerId, parsed.q);
    const [total, rows] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        include: conversationInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
      }),
    ]);
    const latestByConversation = await this.latestPreviews(
      rows.map((row) => row.id),
      callerId,
    );
    return {
      conversations: rows.map((row) =>
        this.toSummary(row, callerId, latestByConversation.get(row.id) ?? null),
      ),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.pageSize)),
      q: parsed.q,
    };
  }

  async create(
    callerId: string,
    body: unknown,
  ): Promise<ConversationCreatedResponse> {
    const parsed = parseCreateConversationBody(body);
    const preview = await this.prisma.requestResponse.findUnique({
      where: { id: parsed.privateChatOfferResponseId },
      include: offerPreviewInclude,
    });
    this.assertCreatableOffer(preview, callerId);

    const stored = await this.withMessagingRetry(async (tx) => {
      await lockRequest(tx, preview!.requestId);
      const request = await tx.request.findUnique({
        where: { id: preview!.requestId },
        select: requestSelect,
      });
      if (!request) throw conversationNotFound();
      const offer = await tx.requestResponse.findUnique({
        where: { id: preview!.id },
        include: { author: { select: authorSelect } },
      });
      this.assertCreatableOffer(offer ? { ...offer, request } : null, callerId);
      const helperId = offer!.authorId;
      if (await this.isBlocked(callerId, helperId, tx)) {
        throw messagingNotAllowed();
      }
      const existing = await this.findPairConversation(
        tx,
        request.id,
        request.authorId,
        helperId,
      );
      if (existing) {
        return existing.id;
      }
      const created = await tx.conversation.create({
        data: {
          requestId: request.id,
          status: CONVERSATION_STATUSES.active,
          participants: {
            create: [{ userId: request.authorId }, { userId: helperId }],
          },
        },
        select: { id: true },
      });
      conversationCreatedEvent({
        conversationId: created.id,
        requestId: request.id,
        requesterId: request.authorId,
        helperId,
      });
      return created.id;
    });

    return { conversation: await this.requireDetail(stored, callerId) };
  }

  async get(
    callerId: string,
    rawId: unknown,
  ): Promise<MemberConversationResponse> {
    const id = parseConversationId(rawId);
    return { conversation: await this.requireDetail(id, callerId) };
  }

  async listMessages(
    callerId: string,
    rawId: unknown,
    query: Record<string, unknown>,
  ): Promise<MemberMessagesResponse> {
    const id = parseConversationId(rawId);
    const parsed = parseMessagesHistoryQuery(query);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { userId: true } } },
    });
    this.assertParticipant(conversation, callerId);
    let cursor: { createdAt: Date; id: string } | null = null;
    if (parsed.before) {
      const anchor = await this.prisma.message.findUnique({
        where: { id: parsed.before },
        select: { id: true, conversationId: true, createdAt: true },
      });
      if (!anchor || anchor.conversationId !== id) {
        throw messagingInvalidInput(
          { before: ['Choose a valid message.'] },
          'Review the conversation and try again.',
        );
      }
      cursor = { createdAt: anchor.createdAt, id: anchor.id };
    }
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  AND: [
                    { createdAt: cursor.createdAt },
                    { id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: parsed.limit + 1,
      select: messageSelect,
    });
    const hasMore = rows.length > parsed.limit;
    const window = hasMore ? rows.slice(0, parsed.limit) : rows;
    const messages = [...window].reverse().map((row) => this.toMessage(row));
    return {
      messages,
      nextBefore: hasMore && messages[0] ? messages[0].id : null,
    };
  }

  async sendMessage(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<MessageSentResponse> {
    const conversationId = parseConversationId(rawId);
    const parsed = parseSendMessageBody(body);
    const preview = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: conversationInclude,
    });
    this.assertParticipant(preview, callerId);

    const existing = await this.prisma.message.findUnique({
      where: {
        conversationId_clientMessageId: {
          conversationId,
          clientMessageId: parsed.clientMessageId,
        },
      },
      select: messageSelect,
    });
    if (existing) {
      if (existing.body === parsed.body) {
        return { message: this.toMessage(existing) };
      }
      throw messagingIdempotencyConflict();
    }

    try {
      const stored = await this.withMessagingRetry(async (tx) => {
        await lockConversation(tx, conversationId);
        const current = await tx.conversation.findUnique({
          where: { id: conversationId },
          include: conversationInclude,
        });
        this.assertParticipant(current, callerId);
        this.assertCanSend(current, callerId);
        const counterpartId = this.counterpartId(current, callerId);
        if (await this.isBlocked(callerId, counterpartId, tx)) {
          throw messagingNotAllowed();
        }
        const replay = await tx.message.findUnique({
          where: {
            conversationId_clientMessageId: {
              conversationId,
              clientMessageId: parsed.clientMessageId,
            },
          },
          select: messageSelect,
        });
        if (replay) {
          if (replay.body === parsed.body) return replay;
          throw messagingIdempotencyConflict();
        }
        await this.rateLimiter.consumeNewMessage(callerId);
        const created = await tx.message.create({
          data: {
            conversationId,
            senderId: callerId,
            clientMessageId: parsed.clientMessageId,
            body: parsed.body,
          },
          select: messageSelect,
        });
        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: created.createdAt },
        });

        if (current.request) {
          const senderName =
            current.participants
              .find((participant) => participant.userId === callerId)
              ?.user.profile?.displayName?.trim() || 'A founder';

          await this.notifications.create(
            {
              userId: counterpartId,
              type: NOTIFICATION_TYPES.requestMessage,
              title: 'New message',
              body: `${senderName} sent you a message about "${current.request.headline}".`,
              href: `/messages/${conversationId}`,
            },
            tx,
          );
        }

        messageSentEvent({
          messageId: created.id,
          conversationId,
          senderId: callerId,
          clientMessageId: parsed.clientMessageId,
        });
        return created;
      });
      return { message: this.toMessage(stored) };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.prisma.message.findUnique({
          where: {
            conversationId_clientMessageId: {
              conversationId,
              clientMessageId: parsed.clientMessageId,
            },
          },
          select: messageSelect,
        });
        if (replay && replay.body === parsed.body) {
          return { message: this.toMessage(replay) };
        }
        throw messagingIdempotencyConflict();
      }
      throw error;
    }
  }

  private assertCreatableOffer(
    offer: {
      deletedAt: Date | null;
      type: string;
      authorId: string;
      author: StoredUser;
      request: StoredRequest;
    } | null,
    callerId: string,
  ): asserts offer is NonNullable<typeof offer> {
    if (
      !offer ||
      offer.deletedAt !== null ||
      offer.type !== RESPONSE_TYPES.privateChatOffer
    ) {
      throw conversationNotFound();
    }
    if (offer.request.authorId !== callerId) {
      throw conversationNotFound();
    }
    if (offer.authorId === callerId) {
      throw conversationNotFound();
    }
    const status = offer.request.status;
    if (
      status === REQUEST_STATUSES.draft ||
      status === REQUEST_STATUSES.deletedByAuthor ||
      status === REQUEST_STATUSES.moderatedRemoved
    ) {
      throw messagingInvalidState();
    }
    if (
      status !== REQUEST_STATUSES.published &&
      status !== REQUEST_STATUSES.resolved
    ) {
      throw messagingInvalidState();
    }
    if (!this.isEligibleMember(offer.author)) {
      throw messagingNotAllowed();
    }
  }

  private assertParticipant(
    conversation: { participants: Array<{ userId: string }> } | null,
    callerId: string,
  ): asserts conversation is NonNullable<typeof conversation> {
    if (!conversation) throw conversationNotFound();
    if (!conversation.participants.some((row) => row.userId === callerId)) {
      throw conversationNotFound();
    }
  }

  private assertCanSend(
    conversation: StoredConversation,
    callerId: string,
  ): void {
    if (conversation.status !== CONVERSATION_STATUSES.active) {
      throw messagingInvalidState();
    }
    const counterpart = this.counterpartUser(conversation, callerId);
    if (!this.isEligibleMember(counterpart)) {
      throw messagingNotAllowed();
    }
  }

  private async requireDetail(
    id: string,
    callerId: string,
  ): Promise<MemberConversation> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
      include: conversationInclude,
    });
    this.assertParticipant(row, callerId);
    const latest = await this.prisma.message.findFirst({
      where: { conversationId: id, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: messageSelect,
    });
    const counterpartUser = this.counterpartUser(row, callerId);
    const blocked = await this.isBlocked(callerId, counterpartUser.id);
    return this.toDetail(row, callerId, latest, blocked);
  }

  private toDetail(
    row: StoredConversation,
    callerId: string,
    latest: StoredMessage | null,
    blocked: boolean,
  ): MemberConversation {
    const counterpart = this.toCounterpart(this.counterpartUser(row, callerId));
    return {
      ...this.toSummary(row, callerId, latest),
      canSend:
        row.status === CONVERSATION_STATUSES.active &&
        counterpart !== null &&
        !blocked,
    };
  }

  private toSummary(
    row: StoredConversation,
    callerId: string,
    latest: StoredMessage | ConversationLatestMessage | null,
  ): MemberConversationSummary {
    return {
      id: row.id,
      status: row.status as MemberConversationSummary['status'],
      updatedAt: row.updatedAt.toISOString(),
      counterpart: this.toCounterpart(this.counterpartUser(row, callerId)),
      requestContext: this.toRequestContext(row.request),
      latestMessage: this.toLatest(latest, callerId),
    };
  }

  private toLatest(
    latest: StoredMessage | ConversationLatestMessage | null,
    callerId: string,
  ): ConversationLatestMessage | null {
    if (!latest) return null;
    if ('senderIsViewer' in latest) return latest;
    if (latest.deletedAt) return null;
    return {
      id: latest.id,
      senderIsViewer: latest.senderId === callerId,
      body: latest.body,
      createdAt: latest.createdAt.toISOString(),
    };
  }

  private toMessage(row: StoredMessage): MemberMessage {
    const removed = row.deletedAt !== null;
    return {
      id: row.id,
      senderId: row.senderId,
      createdAt: row.createdAt.toISOString(),
      body: removed ? null : row.body,
      removed,
    };
  }

  private toCounterpart(user: StoredUser): MemberMessagingCounterpart | null {
    if (!this.isEligibleMember(user)) return null;
    const profile = user.profile;
    const company = profile?.company;
    return {
      id: user.id,
      displayName: profile?.displayName ?? '',
      avatarUrl: profile?.avatarUrl ?? null,
      companyName: company?.name ?? '',
      city: profile?.city ?? company?.city ?? null,
      country: profile?.country ?? company?.country ?? null,
    };
  }

  private toRequestContext(
    request: StoredRequest | null,
  ): ConversationRequestContext {
    if (!request) return { available: false };
    if (
      request.status !== REQUEST_STATUSES.published &&
      request.status !== REQUEST_STATUSES.resolved
    ) {
      return { available: false };
    }
    if (!this.isEligibleMember(request.author)) {
      return { available: false };
    }
    return {
      available: true,
      id: request.id,
      type: request.type as RequestType,
      status: request.status as MemberRequestListStatus,
      headline: request.headline,
      topics: this.visibleTopics(request),
    };
  }

  private visibleTopics(request: StoredRequest): MemberTopicRef[] {
    return request.topics
      .filter((row) => row.topic.isActive && row.topic.mergedIntoId === null)
      .map((row) => ({
        id: row.topic.id,
        slug: row.topic.slug,
        label: row.topic.label,
      }));
  }

  private counterpartUser(
    conversation: StoredConversation,
    callerId: string,
  ): StoredUser {
    const other = conversation.participants.find(
      (row) => row.userId !== callerId,
    );
    if (!other) {
      throw conversationNotFound();
    }
    return other.user;
  }

  private counterpartId(
    conversation: StoredConversation,
    callerId: string,
  ): string {
    return this.counterpartUser(conversation, callerId).id;
  }

  private isEligibleMember(user: StoredUser): boolean {
    const now = new Date();
    return (
      user.status === 'ACTIVE' &&
      user.deletedAt === null &&
      user.emailVerifiedAt !== null &&
      user.onboardingCompletedAt !== null &&
      user.application?.status === 'APPROVED' &&
      Boolean(user.profile?.company) &&
      (!user.suspendedUntil || user.suspendedUntil <= now)
    );
  }

  private eligibleMemberWhere(now = new Date()): Prisma.UserWhereInput {
    return {
      status: 'ACTIVE',
      deletedAt: null,
      emailVerifiedAt: { not: null },
      onboardingCompletedAt: { not: null },
      application: { is: { status: 'APPROVED' } },
      profile: { is: { company: { isNot: null } } },
      AND: [
        { OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }] },
      ],
    };
  }

  private listWhere(
    callerId: string,
    q: string | null,
  ): Prisma.ConversationWhereInput {
    const participant: Prisma.ConversationWhereInput = {
      participants: { some: { userId: callerId } },
    };
    if (!q) return participant;
    const eligible = this.eligibleMemberWhere();
    const contains: Prisma.StringFilter = { contains: q, mode: 'insensitive' };
    return {
      AND: [
        participant,
        {
          OR: [
            {
              request: {
                is: {
                  status: {
                    in: [REQUEST_STATUSES.published, REQUEST_STATUSES.resolved],
                  },
                  headline: contains,
                  author: { is: eligible },
                },
              },
            },
            {
              participants: {
                some: {
                  userId: { not: callerId },
                  user: {
                    is: {
                      ...eligible,
                      profile: {
                        is: {
                          company: { isNot: null },
                          displayName: contains,
                        },
                      },
                    },
                  },
                },
              },
            },
            {
              participants: {
                some: {
                  userId: { not: callerId },
                  user: {
                    is: {
                      ...eligible,
                      profile: {
                        is: {
                          company: { is: { name: contains } },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    };
  }

  private async latestPreviews(
    conversationIds: string[],
    callerId: string,
  ): Promise<Map<string, ConversationLatestMessage>> {
    const latest = new Map<string, ConversationLatestMessage>();
    if (conversationIds.length === 0) return latest;
    const rows = await this.prisma.$queryRaw<MessagePreviewRow[]>(
      PrismaNamespace.sql`
        SELECT DISTINCT ON ("conversationId")
          id,
          "conversationId",
          "senderId",
          body,
          "createdAt"
        FROM "Message"
        WHERE "conversationId" IN (${PrismaNamespace.join(
          conversationIds.map((id) => PrismaNamespace.sql`${id}`),
        )})
          AND "deletedAt" IS NULL
        ORDER BY "conversationId", "createdAt" DESC, id DESC
      `,
    );
    for (const row of rows) {
      const createdAt =
        row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
      latest.set(row.conversationId, {
        id: row.id,
        senderIsViewer: row.senderId === callerId,
        body: row.body,
        createdAt: createdAt.toISOString(),
      });
    }
    return latest;
  }

  private async findPairConversation(
    tx: Prisma.TransactionClient,
    requestId: string,
    requesterId: string,
    helperId: string,
  ): Promise<{ id: string } | null> {
    const rows = await tx.conversation.findMany({
      where: {
        requestId,
        AND: [
          { participants: { some: { userId: requesterId } } },
          { participants: { some: { userId: helperId } } },
        ],
      },
      include: { participants: { select: { userId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const expected = [requesterId, helperId].sort();
    const match = rows.find((row) => {
      const ids = row.participants.map((item) => item.userId).sort();
      return (
        ids.length === 2 && ids[0] === expected[0] && ids[1] === expected[1]
      );
    });
    return match ? { id: match.id } : null;
  }

  private async isBlocked(
    leftId: string,
    rightId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    return areMembersBlocked(tx, leftId, rightId);
  }

  private async withMessagingRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MESSAGING_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel:
            PrismaNamespace.TransactionIsolationLevel.ReadCommitted,
        });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (isUniqueConstraintError(error)) throw error;
        const conflict = isTransactionConflict(error);
        if (conflict && attempt < MESSAGING_RETRY_ATTEMPTS) continue;
        if (conflict) {
          throw new ApiError(
            MESSAGING_ERROR_CODES.invalidState,
            'We could not complete that conversation. Please try again.',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      }
    }
    throw new ApiError(
      MESSAGING_ERROR_CODES.invalidState,
      'We could not complete that conversation. Please try again.',
      HttpStatus.CONFLICT,
    );
  }
}
