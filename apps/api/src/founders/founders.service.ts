import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  FOUNDER_ERROR_CODES,
  type DiscoverFounder,
  type DiscoverFoundersResponse,
  type MemberFounderProfile,
  type MemberFounderProfileResponse,
  type MemberTopicRef,
  type SavedFounderMutationResponse,
  type SavedFoundersResponse,
} from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import {
  founderNotFound,
  parseDiscoverQuery,
  parseFounderId,
  parseSaveBody,
  parseSavedFoundersQuery,
  type DiscoverQuery,
} from './founders-query.js';

const activeTopic = {
  isActive: true,
  mergedIntoId: null,
} as const;

const topicSelect = {
  id: true,
  slug: true,
  label: true,
} as const;

const listProfileSelect = {
  displayName: true,
  avatarUrl: true,
  city: true,
  country: true,
  customExpertise: true,
  company: {
    select: {
      name: true,
      industry: true,
      stage: true,
      city: true,
      country: true,
    },
  },
  expertise: {
    where: { topic: activeTopic },
    select: { topic: { select: topicSelect } },
    orderBy: { topic: { label: 'asc' as const } },
  },
} as const;

@Injectable()
export class FoundersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async list(
    callerId: string,
    query: Record<string, unknown>,
  ): Promise<DiscoverFoundersResponse> {
    const parsed = parseDiscoverQuery(query);
    const now = new Date();
    if (parsed.expertiseTopicId) {
      await this.requireActiveTopic(parsed.expertiseTopicId);
    }
    const where = this.discoverWhere(callerId, parsed, now);
    const [total, rows, savedCount, expertiseTopics] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where }),
        this.prisma.user.findMany({
          where,
          select: {
            id: true,
            profile: { select: listProfileSelect },
          },
          orderBy: [{ profile: { displayName: 'asc' } }, { id: 'asc' }],
          skip: (parsed.page - 1) * parsed.pageSize,
          take: parsed.pageSize,
        }),
        this.prisma.user.count({
          where: this.eligibleWhere(now, {
            id: { not: callerId },
            savedBy: { some: { saverId: callerId } },
          }),
        }),
        this.prisma.taxonomyTopic.findMany({
          where: activeTopic,
          select: topicSelect,
          orderBy: { label: 'asc' },
        }),
      ]);
    const savedIds = await this.savedIdSet(
      callerId,
      rows.map((row) => row.id),
    );
    return {
      founders: rows.flatMap((row) => {
        const card = this.toDiscoverCard(row, savedIds.has(row.id));
        return card ? [card] : [];
      }),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.pageSize)),
      savedCount,
      q: parsed.q,
      country: parsed.country,
      industry: parsed.industry,
      stage: parsed.stage,
      expertiseTopicId: parsed.expertiseTopicId,
      saved: parsed.saved,
      expertiseTopics,
    };
  }

  async getProfile(
    callerId: string,
    rawId: unknown,
  ): Promise<MemberFounderProfileResponse> {
    const targetId = parseFounderId(rawId);
    const now = new Date();
    const user = await this.prisma.user.findFirst({
      where: this.eligibleWhere(now, { id: targetId }),
      select: {
        id: true,
        onboardingCompletedAt: true,
        profile: {
          select: {
            displayName: true,
            headline: true,
            bio: true,
            avatarUrl: true,
            city: true,
            country: true,
            customExpertise: true,
            currentNeedText: true,
            company: {
              select: {
                name: true,
                website: true,
                description: true,
                stage: true,
                industry: true,
                city: true,
                country: true,
              },
            },
            expertise: {
              where: { topic: activeTopic },
              select: { topic: { select: topicSelect } },
              orderBy: { topic: { label: 'asc' } },
            },
            needs: {
              where: { topic: activeTopic },
              select: { topic: { select: topicSelect } },
              orderBy: { topic: { label: 'asc' } },
            },
          },
        },
      },
    });
    const profile = user?.profile;
    if (!user || !profile?.company) {
      throw founderNotFound();
    }
    const isSelf = user.id === callerId;
    const savedByMe =
      !isSelf &&
      Boolean(
        await this.prisma.savedFounder.findUnique({
          where: {
            saverId_savedFounderId: {
              saverId: callerId,
              savedFounderId: user.id,
            },
          },
          select: { saverId: true },
        }),
      );
    const founder: MemberFounderProfile = {
      id: user.id,
      displayName: profile.displayName,
      headline: profile.headline?.trim() || null,
      bio: profile.bio?.trim() || null,
      avatarUrl: profile.avatarUrl,
      city: profile.city,
      country: profile.country,
      company: profile.company,
      expertise: profile.expertise.map(({ topic }) => topic),
      customExpertise: profile.customExpertise?.trim() || null,
      currentNeedText: profile.currentNeedText?.trim() || null,
      needs: profile.needs.map(({ topic }) => topic),
      savedByMe,
      memberSinceYear: user.onboardingCompletedAt
        ? user.onboardingCompletedAt.getUTCFullYear()
        : null,
      isSelf,
    };
    return { founder };
  }

  async listSaved(
    callerId: string,
    query: Record<string, unknown>,
  ): Promise<SavedFoundersResponse> {
    const parsed = parseSavedFoundersQuery(query);
    const now = new Date();
    const where = this.eligibleWhere(now, {
      id: { not: callerId },
      savedBy: { some: { saverId: callerId } },
    });
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          profile: { select: listProfileSelect },
        },
        orderBy: [{ profile: { displayName: 'asc' } }, { id: 'asc' }],
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
      }),
    ]);
    return {
      founders: rows.flatMap((row) => {
        const card = this.toDiscoverCard(row, true);
        return card ? [card] : [];
      }),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.pageSize)),
    };
  }

  async save(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<SavedFounderMutationResponse> {
    parseSaveBody(body);
    const targetId = parseFounderId(rawId);
    if (targetId === callerId) {
      throw new ApiError(
        FOUNDER_ERROR_CODES.invalidSave,
        'You cannot save your own profile.',
        HttpStatus.CONFLICT,
        { founderId: ['You cannot save your own profile.'] },
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      await this.lockUsers(transaction, callerId, targetId);
      await this.requireVisibleTarget(transaction, targetId);
      try {
        await transaction.savedFounder.create({
          data: { saverId: callerId, savedFounderId: targetId },
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
      }
    });
    return {
      saved: true,
      savedCount: await this.countVisibleSaved(callerId, new Date()),
    };
  }

  async unsave(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<SavedFounderMutationResponse> {
    parseSaveBody(body);
    const targetId = parseFounderId(rawId);
    await this.prisma.$transaction(async (transaction) => {
      await this.lockUsers(transaction, callerId, targetId);
      if (targetId !== callerId) {
        await this.requireVisibleTarget(transaction, targetId);
      }
      await transaction.savedFounder.deleteMany({
        where: { saverId: callerId, savedFounderId: targetId },
      });
    });
    return {
      saved: false,
      savedCount: await this.countVisibleSaved(callerId, new Date()),
    };
  }

  private discoverWhere(
    callerId: string,
    parsed: DiscoverQuery,
    now: Date,
  ): Prisma.UserWhereInput {
    const extra: Prisma.UserWhereInput = { id: { not: callerId } };
    if (parsed.saved === true) {
      extra.savedBy = { some: { saverId: callerId } };
    }
    const profileAnd: Prisma.FounderProfileWhereInput[] = [];
    if (parsed.country) {
      const country = this.insensitiveEquals(parsed.country);
      profileAnd.push({
        OR: [{ country }, { company: { is: { country } } }],
      });
    }
    if (parsed.industry) {
      profileAnd.push({
        company: {
          is: { industry: this.insensitiveEquals(parsed.industry) },
        },
      });
    }
    if (parsed.stage) {
      profileAnd.push({
        company: { is: { stage: this.insensitiveEquals(parsed.stage) } },
      });
    }
    if (parsed.expertiseTopicId) {
      profileAnd.push({
        expertise: {
          some: {
            topicId: parsed.expertiseTopicId,
            topic: activeTopic,
          },
        },
      });
    }
    if (parsed.q) {
      const q = parsed.q;
      profileAnd.push({
        OR: [
          { displayName: this.insensitiveContains(q) },
          { city: this.insensitiveContains(q) },
          { country: this.insensitiveContains(q) },
          { customExpertise: this.insensitiveContains(q) },
          {
            company: {
              is: {
                OR: [
                  { name: this.insensitiveContains(q) },
                  { city: this.insensitiveContains(q) },
                  { country: this.insensitiveContains(q) },
                  { industry: this.insensitiveContains(q) },
                  { stage: this.insensitiveContains(q) },
                ],
              },
            },
          },
          {
            expertise: {
              some: {
                topic: {
                  ...activeTopic,
                  label: this.insensitiveContains(q),
                },
              },
            },
          },
        ],
      });
    }
    return this.eligibleWhere(now, extra, profileAnd);
  }

  private eligibleWhere(
    now: Date,
    extra: Prisma.UserWhereInput = {},
    profileAnd: Prisma.FounderProfileWhereInput[] = [],
  ): Prisma.UserWhereInput {
    return {
      status: 'ACTIVE',
      deletedAt: null,
      emailVerifiedAt: { not: null },
      onboardingCompletedAt: { not: null },
      application: { is: { status: 'APPROVED' } },
      profile: {
        is: {
          company: { isNot: null },
          ...(profileAnd.length > 0 ? { AND: profileAnd } : {}),
        },
      },
      AND: [
        {
          OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
        },
        extra,
      ],
    };
  }

  private insensitiveContains(q: string): Prisma.StringFilter {
    return { contains: q, mode: 'insensitive' };
  }

  private insensitiveEquals(value: string): Prisma.StringFilter {
    return { equals: value, mode: 'insensitive' };
  }

  private toDiscoverCard(
    row: {
      id: string;
      profile: {
        displayName: string;
        avatarUrl: string | null;
        city: string | null;
        country: string | null;
        customExpertise: string | null;
        company: {
          name: string;
          industry: string | null;
          stage: string | null;
          city: string | null;
          country: string | null;
        } | null;
        expertise: Array<{ topic: MemberTopicRef }>;
      } | null;
    },
    savedByMe: boolean,
  ): DiscoverFounder | null {
    const profile = row.profile;
    if (!profile?.company) return null;
    return {
      id: row.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      city: profile.city,
      country: profile.country,
      companyName: profile.company.name,
      industry: profile.company.industry,
      stage: profile.company.stage,
      expertise: profile.expertise.map(({ topic }) => topic),
      customExpertise: profile.customExpertise?.trim() || null,
      savedByMe,
    };
  }

  private async savedIdSet(
    callerId: string,
    founderIds: string[],
  ): Promise<Set<string>> {
    if (founderIds.length === 0) return new Set();
    const rows = await this.prisma.savedFounder.findMany({
      where: { saverId: callerId, savedFounderId: { in: founderIds } },
      select: { savedFounderId: true },
    });
    return new Set(rows.map((row) => row.savedFounderId));
  }

  private async countVisibleSaved(
    callerId: string,
    now: Date,
  ): Promise<number> {
    return this.prisma.user.count({
      where: this.eligibleWhere(now, {
        id: { not: callerId },
        savedBy: { some: { saverId: callerId } },
      }),
    });
  }

  private async requireActiveTopic(topicId: string): Promise<void> {
    const topic = await this.prisma.taxonomyTopic.findUnique({
      where: { id: topicId },
      select: { isActive: true, mergedIntoId: true },
    });
    if (!topic || !topic.isActive || topic.mergedIntoId) {
      throw new ApiError(
        FOUNDER_ERROR_CODES.invalidQuery,
        'Review the search details and try again.',
        HttpStatus.BAD_REQUEST,
        { expertiseTopicId: ['Choose a valid expertise topic.'] },
      );
    }
  }

  private async requireVisibleTarget(
    transaction: Pick<PrismaService, 'user'>,
    targetId: string,
  ): Promise<void> {
    const found = await transaction.user.findFirst({
      where: this.eligibleWhere(new Date(), { id: targetId }),
      select: { id: true },
    });
    if (!found) {
      throw founderNotFound();
    }
  }

  private async lockUsers(
    transaction: Pick<PrismaService, '$queryRaw'>,
    firstId: string,
    secondId: string,
  ): Promise<void> {
    const ids = firstId === secondId ? [firstId] : [firstId, secondId].sort();
    for (const id of ids) {
      await transaction.$queryRaw`
        SELECT id FROM "User" WHERE id = ${id} FOR UPDATE
      `;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
