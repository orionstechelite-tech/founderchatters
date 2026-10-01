import { Inject, Injectable } from '@nestjs/common';
import {
  HELP_OUTCOMES,
  INTRODUCTION_STATUSES,
  REPUTATION_HISTORY_LABELS,
  REPUTATION_LIMITS,
  REQUEST_STATUSES,
  RESPONSE_TYPES,
  type MemberReputationResponse,
  type MemberRequestAuthor,
  type ReputationContribution,
  type ReputationTopic,
} from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';
import { founderNotFound, parseFounderId } from '../founders/founders-query.js';
import { parseReputationQuery } from './reputation-query.js';

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

const contributionInclude = {
  topics: {
    include: { topic: { select: { id: true, slug: true, label: true } } },
  },
  thankYou: { select: { body: true } },
  helpConfirmation: {
    include: {
      confirmer: { select: authorSelect },
      request: {
        select: {
          id: true,
          status: true,
          author: { select: authorSelect },
        },
      },
      response: { select: { type: true, deletedAt: true } },
    },
  },
} as const;

type StoredUser = Prisma.UserGetPayload<{ select: typeof authorSelect }>;
type StoredContribution = Prisma.ContributionGetPayload<{
  include: typeof contributionInclude;
}>;

@Injectable()
export class ReputationService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async getMine(
    callerId: string,
    query: Record<string, unknown>,
  ): Promise<MemberReputationResponse> {
    const parsed = parseReputationQuery(query);
    const founder = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: authorSelect,
    });
    if (!founder) throw founderNotFound();
    return this.build(callerId, founder, parsed, true);
  }

  async getFounder(
    callerId: string,
    rawId: unknown,
    query: Record<string, unknown>,
  ): Promise<MemberReputationResponse> {
    const targetId = parseFounderId(rawId);
    const parsed = parseReputationQuery(query);
    const now = new Date();
    const founder = await this.prisma.user.findFirst({
      where: this.eligibleWhere(now, { id: targetId }),
      select: authorSelect,
    });
    if (!founder) throw founderNotFound();
    return this.build(targetId, founder, parsed, callerId === targetId);
  }

  private async build(
    helperId: string,
    founder: StoredUser,
    parsed: { page: number; pageSize: number },
    isSelf: boolean,
  ): Promise<MemberReputationResponse> {
    const [confirmedHelps, confirmerGroups, introductions, topicGroups] =
      await Promise.all([
        this.prisma.contribution.count({ where: { contributorId: helperId } }),
        this.prisma.helpConfirmation.groupBy({
          by: ['confirmerId'],
          where: {
            helperId,
            outcome: HELP_OUTCOMES.helped,
            contribution: { isNot: null },
          },
        }),
        this.prisma.contribution.count({
          where: {
            contributorId: helperId,
            helpConfirmation: {
              outcome: HELP_OUTCOMES.helped,
              response: {
                type: RESPONSE_TYPES.introductionOffer,
                introduction: { status: INTRODUCTION_STATUSES.introduced },
              },
            },
          },
        }),
        this.prisma.contributionTopic.groupBy({
          by: ['topicId'],
          where: { contribution: { contributorId: helperId } },
          _count: { topicId: true },
        }),
      ]);
    const topicIds = topicGroups.map((row) => row.topicId);
    const topics =
      topicIds.length === 0
        ? []
        : await this.prisma.taxonomyTopic.findMany({
            where: { id: { in: topicIds } },
            select: { id: true, slug: true, label: true },
          });
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));
    const helpfulTopics = this.rankTopics(
      topicGroups.flatMap((row) => {
        const topic = topicById.get(row.topicId);
        if (!topic) return [];
        return [{ topic, count: row._count.topicId }];
      }),
    );
    const rows = await this.prisma.contribution.findMany({
      where: { contributorId: helperId },
      include: contributionInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (parsed.page - 1) * parsed.pageSize,
      take: parsed.pageSize,
    });
    return {
      founder: this.requireAuthor(founder),
      isSelf,
      summary: {
        foundersHelped: confirmerGroups.length,
        confirmedHelps,
        introductions,
        helpfulTopics,
        mostRecognizedTopic: helpfulTopics[0] ?? null,
      },
      contributions: rows.flatMap((row) => {
        const item = this.toHistoryItem(row);
        return item ? [item] : [];
      }),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total: confirmedHelps,
      totalPages: Math.max(1, Math.ceil(confirmedHelps / parsed.pageSize)),
    };
  }

  private toHistoryItem(
    row: StoredContribution,
  ): ReputationContribution | null {
    const confirmation = row.helpConfirmation;
    const response = confirmation.response;
    if (!response) return null;
    const type = response.type;
    const confirmer = this.toAuthor(confirmation.confirmer);
    const request = confirmation.request;
    const requestVisible =
      (request.status === REQUEST_STATUSES.published ||
        request.status === REQUEST_STATUSES.resolved) &&
      this.authorIsEligible(request.author);
    return {
      id: row.id,
      type,
      label: REPUTATION_HISTORY_LABELS[type],
      topics: row.topics.map((item) => ({
        id: item.topic.id,
        slug: item.topic.slug,
        label: item.topic.label,
      })),
      createdAt: row.createdAt.toISOString(),
      confirmer,
      thankYou:
        confirmer && row.thankYou?.body?.trim() ? row.thankYou.body : null,
      requestAvailable: requestVisible,
      requestId: requestVisible ? request.id : null,
    };
  }

  private rankTopics(
    rows: Array<{
      topic: { id: string; slug: string; label: string };
      count: number;
    }>,
  ): ReputationTopic[] {
    return rows
      .map((row) => ({
        id: row.topic.id,
        slug: row.topic.slug,
        label: row.topic.label,
        count: row.count,
      }))
      .sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count;
        const label = left.label.localeCompare(right.label);
        if (label !== 0) return label;
        return left.id.localeCompare(right.id);
      })
      .slice(0, REPUTATION_LIMITS.helpfulTopicsMax);
  }

  private requireAuthor(author: StoredUser): MemberRequestAuthor {
    const projected = this.toAuthor(author);
    if (projected) return projected;
    return {
      id: author.id,
      displayName: author.profile?.displayName ?? '',
      avatarUrl: author.profile?.avatarUrl ?? null,
      companyName: author.profile?.company?.name ?? '',
      city: author.profile?.city ?? author.profile?.company?.city ?? null,
      country:
        author.profile?.country ?? author.profile?.company?.country ?? null,
    };
  }

  private toAuthor(author: StoredUser): MemberRequestAuthor | null {
    if (!this.authorIsEligible(author)) return null;
    const profile = author.profile;
    const company = profile?.company;
    return {
      id: author.id,
      displayName: profile?.displayName ?? '',
      avatarUrl: profile?.avatarUrl ?? null,
      companyName: company?.name ?? '',
      city: profile?.city ?? company?.city ?? null,
      country: profile?.country ?? company?.country ?? null,
    };
  }

  private authorIsEligible(author: StoredUser): boolean {
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

  private eligibleWhere(
    now: Date,
    extra: Prisma.UserWhereInput,
  ): Prisma.UserWhereInput {
    return {
      status: 'ACTIVE',
      deletedAt: null,
      emailVerifiedAt: { not: null },
      onboardingCompletedAt: { not: null },
      application: { is: { status: 'APPROVED' } },
      profile: { is: { company: { isNot: null } } },
      AND: [
        {
          OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
        },
        extra,
      ],
    };
  }
}
