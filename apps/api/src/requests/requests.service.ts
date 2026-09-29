import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  REQUEST_ERROR_CODES,
  REQUEST_LIMITS,
  REQUEST_STATUSES,
  type MemberRequest,
  type MemberRequestAuthor,
  type MemberRequestResponse,
  type MemberTopicRef,
  type OwnRequestsResponse,
  type RequestDeletedResponse,
  type RequestType,
  type RequestUrgency,
  type UpsertRequestBody,
} from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import { lockRequest, lockUser, withRequestRowRetry } from './request-locks.js';
import {
  assertDraftBounds,
  assertPublishRequirements,
  invalidState,
  limitReached,
  parseCreateBody,
  parseEmptyMutationBody,
  parseOwnRequestsQuery,
  parsePatchBody,
  parseRequestId,
  requestNotFound,
} from './requests-query.js';

const activeTopic = {
  isActive: true,
  mergedIntoId: null,
} as const;

const topicSelect = {
  id: true,
  slug: true,
  label: true,
} as const;

const requestInclude = {
  topics: {
    select: {
      topic: {
        select: {
          ...topicSelect,
          isActive: true,
          mergedIntoId: true,
        },
      },
    },
    orderBy: { topic: { label: 'asc' as const } },
  },
  author: {
    select: {
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
    },
  },
  _count: {
    select: {
      responses: { where: { deletedAt: null } },
    },
  },
} as const;

type StoredRequest = Prisma.RequestGetPayload<{
  include: typeof requestInclude;
}>;

@Injectable()
export class RequestsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listOwn(
    callerId: string,
    query: Record<string, unknown>,
  ): Promise<OwnRequestsResponse> {
    const parsed = parseOwnRequestsQuery(query);
    const statuses = parsed.status
      ? [parsed.status]
      : [
          REQUEST_STATUSES.draft,
          REQUEST_STATUSES.published,
          REQUEST_STATUSES.resolved,
        ];
    const where: Prisma.RequestWhereInput = {
      authorId: callerId,
      status: { in: statuses },
    };
    const [total, rows, availableTopics] = await this.prisma.$transaction([
      this.prisma.request.count({ where }),
      this.prisma.request.findMany({
        where,
        include: requestInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
      }),
      this.prisma.taxonomyTopic.findMany({
        where: activeTopic,
        select: topicSelect,
        orderBy: { label: 'asc' },
      }),
    ]);
    return {
      requests: rows.map((row) => this.toMemberRequest(row, true)),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.pageSize)),
      status: parsed.status,
      availableTopics,
    };
  }

  async getById(
    callerId: string,
    rawId: unknown,
  ): Promise<MemberRequestResponse> {
    const id = parseRequestId(rawId);
    const row = await this.prisma.request.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!row) throw requestNotFound();
    const isOwner = row.authorId === callerId;
    if (!this.isMemberVisible(row, isOwner)) {
      throw requestNotFound();
    }
    if (!isOwner && !this.authorIsEligible(row.author)) {
      throw requestNotFound();
    }
    return { request: this.toMemberRequest(row, isOwner) };
  }

  async create(
    callerId: string,
    body: unknown,
  ): Promise<MemberRequestResponse> {
    const parsed = parseCreateBody(body);
    assertDraftBounds({
      headline: parsed.headline ?? '',
      context: parsed.context ?? '',
      whoCouldHelp: parsed.whoCouldHelp ?? null,
      topicIds: parsed.topicIds ?? [],
    });
    const created = await withRequestRowRetry(this.prisma, async (tx) => {
      await lockUser(tx, callerId);
      const existing = await tx.request.findFirst({
        where: { authorId: callerId, status: REQUEST_STATUSES.draft },
        select: { id: true },
      });
      if (existing) {
        throw invalidState('You already have a draft request.');
      }
      const topicIds = parsed.topicIds ?? [];
      await this.requireWritableTopics(tx, topicIds);
      const data = {
        authorId: callerId,
        type: parsed.type,
        status: REQUEST_STATUSES.draft,
        headline: parsed.headline ?? '',
        context: parsed.context ?? '',
        whoCouldHelp: parsed.whoCouldHelp ?? null,
        urgency: parsed.urgency ?? null,
      };
      if (topicIds.length > 0) {
        return tx.request.create({
          data: {
            ...data,
            topics: { create: topicIds.map((topicId) => ({ topicId })) },
          },
          include: requestInclude,
        });
      }
      return tx.request.create({
        data,
        include: requestInclude,
      });
    });
    return { request: this.toMemberRequest(created, true) };
  }

  async patch(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<MemberRequestResponse> {
    const id = parseRequestId(rawId);
    const parsed = parsePatchBody(body);
    const updated = await withRequestRowRetry(this.prisma, async (tx) => {
      const current = await this.loadOwnedForMutation(tx, callerId, id);
      if (!this.isMemberVisible(current, true)) {
        throw requestNotFound();
      }
      const selectedTopicIds = parsed.topicIds ?? this.visibleTopicIds(current);
      if (current.status === REQUEST_STATUSES.draft) {
        const next = this.mergeContent(current, parsed);
        assertDraftBounds({
          headline: next.headline,
          context: next.context,
          whoCouldHelp: next.whoCouldHelp,
          topicIds: selectedTopicIds,
        });
        if (parsed.topicIds) {
          await this.requireWritableTopics(tx, parsed.topicIds);
        }
        return this.applyContent(tx, current.id, next, parsed.topicIds);
      }
      if (current.status === REQUEST_STATUSES.published) {
        if (current._count.responses > 0) {
          throw invalidState(
            'This request can no longer be edited after a response exists.',
          );
        }
        const next = this.mergeContent(current, parsed);
        assertPublishRequirements({
          type: next.type,
          headline: next.headline,
          context: next.context,
          whoCouldHelp: next.whoCouldHelp,
          urgency: next.urgency,
          topicIds: selectedTopicIds,
        });
        if (parsed.topicIds) {
          await this.requireWritableTopics(tx, parsed.topicIds);
        }
        return this.applyContent(tx, current.id, next, parsed.topicIds);
      }
      throw invalidState('This request cannot be edited.');
    });
    return { request: this.toMemberRequest(updated, true) };
  }

  async publish(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<MemberRequestResponse> {
    parseEmptyMutationBody(body);
    const id = parseRequestId(rawId);
    const published = await withRequestRowRetry(this.prisma, async (tx) => {
      const current = await this.loadOwnedForMutation(tx, callerId, id);
      if (
        current.status === REQUEST_STATUSES.deletedByAuthor ||
        current.status === REQUEST_STATUSES.moderatedRemoved
      ) {
        throw requestNotFound();
      }
      if (current.status === REQUEST_STATUSES.published) {
        return current;
      }
      if (current.status !== REQUEST_STATUSES.draft) {
        throw invalidState('This request cannot be published.');
      }
      const topicIds = this.visibleTopicIds(current);
      assertPublishRequirements({
        type: current.type,
        headline: current.headline,
        context: current.context,
        whoCouldHelp: current.whoCouldHelp,
        urgency: this.asUrgency(current.urgency),
        topicIds,
      });
      const openCount = await tx.request.count({
        where: {
          authorId: callerId,
          status: REQUEST_STATUSES.published,
        },
      });
      if (openCount >= REQUEST_LIMITS.openPublished) {
        throw limitReached();
      }
      return tx.request.update({
        where: { id: current.id },
        data: {
          status: REQUEST_STATUSES.published,
          publishedAt: new Date(),
        },
        include: requestInclude,
      });
    });
    return { request: this.toMemberRequest(published, true) };
  }

  async resolve(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<MemberRequestResponse> {
    parseEmptyMutationBody(body);
    const id = parseRequestId(rawId);
    const resolved = await withRequestRowRetry(this.prisma, async (tx) => {
      const current = await this.loadOwnedForMutation(tx, callerId, id);
      if (
        current.status === REQUEST_STATUSES.deletedByAuthor ||
        current.status === REQUEST_STATUSES.moderatedRemoved
      ) {
        throw requestNotFound();
      }
      if (current.status === REQUEST_STATUSES.resolved) {
        return current;
      }
      if (current.status !== REQUEST_STATUSES.published) {
        throw invalidState('This request cannot be resolved.');
      }
      return tx.request.update({
        where: { id: current.id },
        data: {
          status: REQUEST_STATUSES.resolved,
          resolvedAt: current.resolvedAt ?? new Date(),
        },
        include: requestInclude,
      });
    });
    return { request: this.toMemberRequest(resolved, true) };
  }

  async remove(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<RequestDeletedResponse> {
    parseEmptyMutationBody(body);
    const id = parseRequestId(rawId);
    await withRequestRowRetry(this.prisma, async (tx) => {
      const current = await this.loadOwnedForMutation(tx, callerId, id);
      if (current.status === REQUEST_STATUSES.moderatedRemoved) {
        throw requestNotFound();
      }
      if (current.status === REQUEST_STATUSES.deletedByAuthor) {
        return;
      }
      if (current.status === REQUEST_STATUSES.resolved) {
        throw invalidState('Resolved requests cannot be deleted.');
      }
      if (current.status === REQUEST_STATUSES.draft) {
        await tx.request.delete({ where: { id: current.id } });
        return;
      }
      if (current.status === REQUEST_STATUSES.published) {
        await tx.request.update({
          where: { id: current.id },
          data: {
            status: REQUEST_STATUSES.deletedByAuthor,
            deletedAt: new Date(),
          },
        });
        return;
      }
      throw invalidState('This request cannot be deleted.');
    });
    return { deleted: true };
  }

  private mergeContent(
    current: StoredRequest,
    patch: UpsertRequestBody,
  ): {
    type: RequestType;
    headline: string;
    context: string;
    whoCouldHelp: string | null;
    urgency: RequestUrgency | null;
    topicIds: string[];
  } {
    return {
      type: patch.type ?? current.type,
      headline: patch.headline ?? current.headline,
      context: patch.context ?? current.context,
      whoCouldHelp:
        patch.whoCouldHelp !== undefined
          ? patch.whoCouldHelp
          : current.whoCouldHelp,
      urgency:
        patch.urgency !== undefined
          ? patch.urgency
          : this.asUrgency(current.urgency),
      topicIds: patch.topicIds ?? this.visibleTopicIds(current),
    };
  }

  private async applyContent(
    tx: Prisma.TransactionClient,
    id: string,
    next: {
      type: RequestType;
      headline: string;
      context: string;
      whoCouldHelp: string | null;
      urgency: RequestUrgency | null;
    },
    topicIds: string[] | undefined,
  ): Promise<StoredRequest> {
    if (topicIds) {
      const existing = await tx.requestTopic.findMany({
        where: { requestId: id },
        select: {
          topicId: true,
          topic: { select: { isActive: true, mergedIntoId: true } },
        },
      });
      const retained = existing
        .filter(({ topic }) => !topic.isActive || topic.mergedIntoId !== null)
        .map(({ topicId }) => topicId);
      const nextIds = [...new Set([...topicIds, ...retained])];
      await tx.requestTopic.deleteMany({ where: { requestId: id } });
      if (nextIds.length > 0) {
        await tx.requestTopic.createMany({
          data: nextIds.map((topicId) => ({ requestId: id, topicId })),
        });
      }
    }
    return tx.request.update({
      where: { id },
      data: {
        type: next.type,
        headline: next.headline,
        context: next.context,
        whoCouldHelp: next.whoCouldHelp,
        urgency: next.urgency,
      },
      include: requestInclude,
    });
  }

  private async requireWritableTopics(
    tx: Prisma.TransactionClient,
    topicIds: string[],
  ): Promise<void> {
    if (topicIds.length === 0) return;
    const topics = await tx.taxonomyTopic.findMany({
      where: { id: { in: topicIds }, ...activeTopic },
      select: { id: true },
    });
    if (topics.length !== topicIds.length) {
      throw new ApiError(
        REQUEST_ERROR_CODES.invalidInput,
        'Review the request details and try again.',
        HttpStatus.BAD_REQUEST,
        { topicIds: ['Choose active topics only.'] },
      );
    }
  }

  private async loadOwnedForMutation(
    tx: Prisma.TransactionClient,
    callerId: string,
    id: string,
  ): Promise<StoredRequest> {
    await lockUser(tx, callerId);
    const existing = await tx.request.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!existing || existing.authorId !== callerId) {
      throw requestNotFound();
    }
    await lockRequest(tx, existing.id);
    const current = await tx.request.findUnique({
      where: { id: existing.id },
      include: requestInclude,
    });
    if (!current) throw requestNotFound();
    return current;
  }

  private isMemberVisible(row: StoredRequest, isOwner: boolean): boolean {
    if (
      row.status === REQUEST_STATUSES.deletedByAuthor ||
      row.status === REQUEST_STATUSES.moderatedRemoved
    ) {
      return false;
    }
    if (row.status === REQUEST_STATUSES.draft) {
      return isOwner;
    }
    return (
      row.status === REQUEST_STATUSES.published ||
      row.status === REQUEST_STATUSES.resolved
    );
  }

  private authorIsEligible(author: StoredRequest['author']): boolean {
    const now = new Date();
    return (
      author.status === 'ACTIVE' &&
      author.deletedAt === null &&
      author.emailVerifiedAt !== null &&
      author.onboardingCompletedAt !== null &&
      author.application?.status === 'APPROVED' &&
      Boolean(author.profile?.company) &&
      (!author.suspendedUntil || author.suspendedUntil <= now)
    );
  }

  private toMemberRequest(row: StoredRequest, isOwner: boolean): MemberRequest {
    if (
      row.status !== REQUEST_STATUSES.draft &&
      row.status !== REQUEST_STATUSES.published &&
      row.status !== REQUEST_STATUSES.resolved
    ) {
      throw requestNotFound();
    }
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      headline: row.headline,
      context: row.context,
      whoCouldHelp: row.whoCouldHelp,
      urgency: this.asUrgency(row.urgency),
      topics: this.visibleTopics(row),
      responseCount: row._count.responses,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: this.toAuthor(row, isOwner),
    };
  }

  private toAuthor(row: StoredRequest, isOwner: boolean): MemberRequestAuthor {
    const profile = row.author.profile;
    const company = profile?.company;
    return {
      id: row.author.id,
      displayName: profile?.displayName ?? (isOwner ? '' : ''),
      avatarUrl: profile?.avatarUrl ?? null,
      companyName: company?.name ?? '',
      city: profile?.city ?? company?.city ?? null,
      country: profile?.country ?? company?.country ?? null,
    };
  }

  private visibleTopics(row: StoredRequest): MemberTopicRef[] {
    return row.topics.flatMap(({ topic }) =>
      topic.isActive && topic.mergedIntoId === null
        ? [{ id: topic.id, slug: topic.slug, label: topic.label }]
        : [],
    );
  }

  private visibleTopicIds(row: StoredRequest): string[] {
    return this.visibleTopics(row).map((topic) => topic.id);
  }

  private asUrgency(value: string | null): RequestUrgency | null {
    if (value === 'TODAY' || value === 'THIS_WEEK' || value === 'NO_RUSH') {
      return value;
    }
    return null;
  }
}
