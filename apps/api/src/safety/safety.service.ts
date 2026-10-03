import { Injectable, Inject } from '@nestjs/common';
import {
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  REQUEST_STATUSES,
  type BlockedFoundersResponse,
  type BlockMutationResponse,
  type MemberReportCreatedResponse,
  type ReportReasonCode,
  type ReportTargetType,
} from '@founderchatters/contracts';

import { PrismaService } from '../database/prisma.service.js';
import {
  parseCreateReportBody,
  parseSafetyId,
  parseSafetyPage,
  safetyNotAllowed,
  safetyTargetNotFound,
} from './safety-input.js';
import { SafetyRateLimiter } from './safety-rate-limiter.js';

const founderSelect = {
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
      company: { select: { name: true } },
    },
  },
} as const;

@Injectable()
export class SafetyService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(SafetyRateLimiter)
    private readonly limiter: SafetyRateLimiter,
  ) {}

  async createReport(
    callerId: string,
    body: unknown,
  ): Promise<MemberReportCreatedResponse> {
    const parsed = parseCreateReportBody(body);
    await this.assertReportable(callerId, parsed.targetType, parsed.targetId);
    await this.limiter.consumeReport(callerId);

    const report = await this.prisma.report.create({
      data: {
        reporterId: callerId,
        targetType: parsed.targetType,
        targetId: parsed.targetId,
        reasonCode: parsed.reasonCode,
        details: parsed.details,
        status: REPORT_STATUSES.open,
      },
      select: { id: true, status: true },
    });

    return {
      report: {
        id: report.id,
        status: REPORT_STATUSES.open,
      },
    };
  }

  async listBlocks(
    callerId: string,
    query: Record<string, unknown>,
  ): Promise<BlockedFoundersResponse> {
    const parsed = parseSafetyPage(query);
    const where = { blockerId: callerId };
    const [total, rows] = await Promise.all([
      this.prisma.block.count({ where }),
      this.prisma.block.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { blockedId: 'desc' }],
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
        select: {
          blockedId: true,
          createdAt: true,
          blocked: { select: founderSelect },
        },
      }),
    ]);

    return {
      founders: rows.map((row) => ({
        id: row.blockedId,
        displayName: row.blocked.profile?.displayName ?? 'Founder',
        companyName: row.blocked.profile?.company?.name ?? '',
        blockedAt: row.createdAt.toISOString(),
      })),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.pageSize)),
    };
  }

  async block(
    callerId: string,
    rawUserId: unknown,
  ): Promise<BlockMutationResponse> {
    const targetId = parseSafetyId(rawUserId);
    if (targetId === callerId) {
      throw safetyNotAllowed('You cannot block yourself.');
    }
    await this.requireEligibleFounder(targetId);

    await this.prisma.block.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: callerId,
          blockedId: targetId,
        },
      },
      update: {},
      create: {
        blockerId: callerId,
        blockedId: targetId,
      },
    });

    return { blocked: true, userId: targetId };
  }

  async unblock(
    callerId: string,
    rawUserId: unknown,
  ): Promise<BlockMutationResponse> {
    const targetId = parseSafetyId(rawUserId);
    if (targetId === callerId) {
      throw safetyNotAllowed('You cannot block yourself.');
    }
    await this.requireEligibleFounder(targetId);

    await this.prisma.block.deleteMany({
      where: {
        blockerId: callerId,
        blockedId: targetId,
      },
    });

    return { blocked: false, userId: targetId };
  }

  private async assertReportable(
    callerId: string,
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<void> {
    if (targetType === REPORT_TARGET_TYPES.user) {
      if (targetId === callerId) {
        throw safetyNotAllowed('You cannot report yourself.');
      }
      await this.requireEligibleFounder(targetId);
      return;
    }

    if (targetType === REPORT_TARGET_TYPES.request) {
      const request = await this.prisma.request.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          authorId: true,
          status: true,
          author: { select: founderSelect },
        },
      });
      if (!request || !this.requestVisible(request, callerId)) {
        throw safetyTargetNotFound();
      }
      if (request.authorId === callerId) {
        throw safetyNotAllowed('You cannot report your own request.');
      }
      return;
    }

    if (targetType === REPORT_TARGET_TYPES.response) {
      const response = await this.prisma.requestResponse.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          authorId: true,
          deletedAt: true,
          request: {
            select: {
              id: true,
              authorId: true,
              status: true,
              author: { select: founderSelect },
            },
          },
        },
      });
      if (
        !response ||
        response.deletedAt ||
        !this.requestVisible(response.request, callerId)
      ) {
        throw safetyTargetNotFound();
      }
      if (response.authorId === callerId) {
        throw safetyNotAllowed('You cannot report your own response.');
      }
      return;
    }

    const message = await this.prisma.message.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        senderId: true,
        conversationId: true,
        conversation: {
          select: {
            participants: {
              where: { userId: callerId },
              select: { userId: true },
            },
          },
        },
      },
    });
    if (!message || message.conversation.participants.length === 0) {
      throw safetyTargetNotFound();
    }
    if (message.senderId === callerId) {
      throw safetyNotAllowed('You cannot report your own message.');
    }
  }

  private requestVisible(
    request: {
      authorId: string;
      status: string;
      author: Parameters<SafetyService['isEligibleFounder']>[0];
    },
    callerId: string,
  ): boolean {
    if (
      request.status === REQUEST_STATUSES.deletedByAuthor ||
      request.status === REQUEST_STATUSES.moderatedRemoved
    ) {
      return false;
    }
    if (request.status === REQUEST_STATUSES.draft) {
      return request.authorId === callerId;
    }
    if (
      request.status !== REQUEST_STATUSES.published &&
      request.status !== REQUEST_STATUSES.resolved
    ) {
      return false;
    }
    return (
      request.authorId === callerId || this.isEligibleFounder(request.author)
    );
  }

  private async requireEligibleFounder(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: founderSelect,
    });
    if (!user || !this.isEligibleFounder(user)) {
      throw safetyTargetNotFound();
    }
  }

  private isEligibleFounder(user: {
    status: string;
    deletedAt: Date | null;
    emailVerifiedAt: Date | null;
    onboardingCompletedAt: Date | null;
    suspendedUntil: Date | null;
    application: { status: string } | null;
    profile: { company: { name: string } | null } | null;
  }): boolean {
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
}

export type { ReportReasonCode };
