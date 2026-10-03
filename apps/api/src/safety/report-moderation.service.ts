import { Inject, Injectable } from '@nestjs/common';
import {
  REPORT_REASON_CODES,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  REQUEST_STATUSES,
  SAFETY_AUDIT_ACTIONS,
  type AdminReportDetailResponse,
  type AdminReportEvidence,
  type AdminReportQueueResponse,
  type ReportReasonCode,
  type ReportStatus,
  type ReportTargetType,
} from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import type { AdminPrincipal } from '../admin/admin-auth.service.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  parseEmptyBody,
  parseReportId,
  parseSafetyPage,
  safetyInvalidState,
  safetyReportNotFound,
  suspensionReasonFor,
} from './safety-input.js';

@Injectable()
export class ReportModerationService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async list(
    query: Record<string, unknown>,
  ): Promise<AdminReportQueueResponse> {
    const parsed = parseSafetyPage(query);
    const where = parsed.status ? { status: parsed.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
        select: {
          id: true,
          status: true,
          targetType: true,
          targetId: true,
          reasonCode: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      reports: rows.map((row) => ({
        id: row.id,
        status: row.status as ReportStatus,
        targetType: row.targetType,
        targetId: row.targetId,
        reasonCode: this.asReason(row.reasonCode),
        createdAt: row.createdAt.toISOString(),
      })),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.pageSize)),
      status: parsed.status,
    };
  }

  async get(
    principal: AdminPrincipal,
    id: string,
  ): Promise<AdminReportDetailResponse> {
    return {
      report: await this.loadReport(parseReportId(id), principal.user.id),
    };
  }

  async peekTargetType(id: string): Promise<ReportTargetType> {
    const row = await this.prisma.report.findUnique({
      where: { id: parseReportId(id) },
      select: { targetType: true },
    });
    if (!row) throw safetyReportNotFound();
    return row.targetType;
  }

  async review(
    principal: AdminPrincipal,
    id: string,
    body: unknown,
  ): Promise<AdminReportDetailResponse> {
    parseEmptyBody(body);
    return this.transition(principal, parseReportId(id), 'UNDER_REVIEW', {
      from: [REPORT_STATUSES.open],
      auditAction: 'report.reviewed',
    });
  }

  async dismiss(
    principal: AdminPrincipal,
    id: string,
    body: unknown,
  ): Promise<AdminReportDetailResponse> {
    parseEmptyBody(body);
    return this.transition(principal, parseReportId(id), 'DISMISSED', {
      from: [REPORT_STATUSES.open, REPORT_STATUSES.underReview],
      auditAction: 'report.dismissed',
    });
  }

  async enforce(
    principal: AdminPrincipal,
    id: string,
    body: unknown,
  ): Promise<AdminReportDetailResponse> {
    parseEmptyBody(body);
    const reportId = parseReportId(id);
    const current = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!current) throw safetyReportNotFound();
    if (
      current.status !== REPORT_STATUSES.open &&
      current.status !== REPORT_STATUSES.underReview
    ) {
      throw safetyInvalidState('This report can no longer be enforced.');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.applyEnforcement(tx, principal.user.id, current);
      await tx.report.update({
        where: { id: current.id },
        data: { status: REPORT_STATUSES.enforced },
      });
      await tx.moderationAction.create({
        data: {
          actorUserId: principal.user.id,
          targetType: current.targetType,
          targetId: current.targetId,
          action: 'ENFORCE_REPORT',
          reason: current.reasonCode,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: principal.user.id,
          action: 'report.enforced',
          targetType: current.targetType,
          targetId: current.targetId,
          reason: current.reasonCode,
          metadata: {
            reportId: current.id,
            targetType: current.targetType,
            targetId: current.targetId,
          },
        },
      });
    });

    return { report: await this.loadReport(current.id, principal.user.id) };
  }

  private async transition(
    principal: AdminPrincipal,
    reportId: string,
    next: ReportStatus,
    options: { from: ReportStatus[]; auditAction: string },
  ): Promise<AdminReportDetailResponse> {
    const current = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!current) throw safetyReportNotFound();
    if (!options.from.includes(current.status as ReportStatus)) {
      throw safetyInvalidState('This report cannot change to that state.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: current.id },
        data: { status: next },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: principal.user.id,
          action: options.auditAction,
          targetType: 'REPORT',
          targetId: current.id,
          reason: current.reasonCode,
          metadata: {
            reportId: current.id,
            from: current.status,
            to: next,
          },
        },
      });
    });

    return { report: await this.loadReport(current.id, principal.user.id) };
  }

  private async applyEnforcement(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    report: {
      id: string;
      targetType: string;
      targetId: string;
      reasonCode: string;
    },
  ): Promise<void> {
    const reason = this.asReason(report.reasonCode);
    if (report.targetType === REPORT_TARGET_TYPES.user) {
      await tx.user.update({
        where: { id: report.targetId },
        data: {
          status: 'SUSPENDED',
          suspensionReason: suspensionReasonFor(reason),
          suspendedUntil: null,
        },
      });
      await tx.moderationAction.create({
        data: {
          actorUserId,
          targetType: 'USER',
          targetId: report.targetId,
          action: 'SUSPEND',
          reason: report.reasonCode,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'user.suspended',
          targetType: 'USER',
          targetId: report.targetId,
          reason: report.reasonCode,
          metadata: { reportId: report.id },
        },
      });
      return;
    }

    if (report.targetType === REPORT_TARGET_TYPES.request) {
      await tx.request.updateMany({
        where: { id: report.targetId },
        data: {
          status: REQUEST_STATUSES.moderatedRemoved,
          deletedAt: new Date(),
        },
      });
      return;
    }

    if (report.targetType === REPORT_TARGET_TYPES.response) {
      await tx.requestResponse.updateMany({
        where: { id: report.targetId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return;
    }

    await tx.message.updateMany({
      where: { id: report.targetId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  private async loadReport(
    id: string,
    actorUserId: string,
  ): Promise<AdminReportDetailResponse['report']> {
    const row = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: {
          select: {
            id: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
    if (!row) throw safetyReportNotFound();

    return {
      id: row.id,
      status: row.status as ReportStatus,
      targetType: row.targetType,
      targetId: row.targetId,
      reasonCode: this.asReason(row.reasonCode),
      details: row.details,
      createdAt: row.createdAt.toISOString(),
      reporter: {
        id: row.reporter.id,
        displayName: row.reporter.profile?.displayName ?? 'Member',
      },
      evidence: await this.loadEvidence(
        actorUserId,
        row.id,
        row.targetType,
        row.targetId,
      ),
    };
  }

  private async loadEvidence(
    actorUserId: string,
    reportId: string,
    targetType: string,
    targetId: string,
  ): Promise<AdminReportEvidence> {
    if (targetType === REPORT_TARGET_TYPES.user) {
      const user = await this.prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          status: true,
          deletedAt: true,
          profile: {
            select: {
              displayName: true,
              company: { select: { name: true } },
            },
          },
        },
      });
      return {
        kind: 'USER',
        userId: targetId,
        displayName: user?.profile?.displayName ?? 'Founder',
        companyName: user?.profile?.company?.name ?? null,
        status: user?.deletedAt
          ? 'DELETED'
          : user?.status === 'SUSPENDED'
            ? 'SUSPENDED'
            : 'ACTIVE',
      };
    }

    if (targetType === REPORT_TARGET_TYPES.request) {
      const request = await this.prisma.request.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          headline: true,
          status: true,
          authorId: true,
        },
      });
      return {
        kind: 'REQUEST',
        requestId: targetId,
        headline: request?.headline ?? '',
        status: request?.status ?? 'UNKNOWN',
        authorId: request?.authorId ?? '',
      };
    }

    if (targetType === REPORT_TARGET_TYPES.response) {
      const response = await this.prisma.requestResponse.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          requestId: true,
          type: true,
          deletedAt: true,
          authorId: true,
        },
      });
      return {
        kind: 'RESPONSE',
        responseId: targetId,
        requestId: response?.requestId ?? '',
        type: response?.type ?? '',
        deletedAt: response?.deletedAt?.toISOString() ?? null,
        authorId: response?.authorId ?? '',
      };
    }

    return this.loadMessageEvidence(actorUserId, reportId, targetId);
  }

  private async loadMessageEvidence(
    actorUserId: string,
    reportId: string,
    targetId: string,
  ): Promise<AdminReportEvidence> {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          conversationId: true,
          createdAt: true,
          deletedAt: true,
          body: true,
          sender: {
            select: {
              id: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      });
      if (!message) {
        return {
          kind: 'MESSAGE',
          messageId: targetId,
          conversationId: '',
          sender: { id: '', displayName: 'Unavailable' },
          createdAt: new Date(0).toISOString(),
          deletedAt: null,
          body: '',
        };
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: SAFETY_AUDIT_ACTIONS.messageEvidenceViewed,
          targetType: 'REPORT',
          targetId: reportId,
          metadata: {
            reportId,
            messageId: message.id,
            conversationId: message.conversationId,
          },
        },
      });

      return {
        kind: 'MESSAGE',
        messageId: message.id,
        conversationId: message.conversationId,
        sender: {
          id: message.sender.id,
          displayName: message.sender.profile?.displayName ?? 'Founder',
        },
        createdAt: message.createdAt.toISOString(),
        deletedAt: message.deletedAt?.toISOString() ?? null,
        body: message.body,
      };
    });
  }

  private asReason(value: string): ReportReasonCode {
    if (
      value === REPORT_REASON_CODES.spamPromotion ||
      value === REPORT_REASON_CODES.fraudImpersonation ||
      value === REPORT_REASON_CODES.harassmentAbuse ||
      value === REPORT_REASON_CODES.unsafePolicy ||
      value === REPORT_REASON_CODES.other
    ) {
      return value;
    }
    return REPORT_REASON_CODES.other;
  }
}
