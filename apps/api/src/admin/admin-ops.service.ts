import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_OPS_AUDIT_ACTIONS,
  HELP_OUTCOMES,
  REPORT_STATUSES,
  REQUEST_LIMITS,
  REQUEST_STATUSES,
  type AdminAnalyticsResponse,
  type AdminAuditListItem,
  type AdminContributionListItem,
  type AdminJobFailureItem,
  type AdminNotificationDeliveryItem,
  type AdminNotificationTemplate,
  type AdminOverviewResponse,
  type AdminPage,
  type AdminRequestListItem,
  type AdminSearchResponse,
  type AdminSettingsResponse,
  type AdminSupportCaseListItem,
  type AdminSupportMessage,
  type AdminSystemResponse,
  type AdminTaxonomyTopic,
  type SupportCaseStatus,
} from '@founderchatters/contracts';

import type { Prisma } from '../../../../generated/prisma/client.js';

import { AppConfig } from '../config.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  DELETED_FOUNDER_DISPLAY_NAME,
  isDeletedAccount,
  isTombstoneEmail,
} from '../identity/deleted-founder.js';
import {
  lockJobFailure,
  lockNotificationDelivery,
  lockUser,
} from '../requests/request-locks.js';
import { ACCOUNT_DELETION_WORKFLOW_VERSION } from '../settings/account-deletion.service.js';
import type { AdminPrincipal } from './admin-auth.service.js';
import { ADMIN_PAGE_SIZE, adminInvalid, slugify } from './admin-input.js';

const SUPPORT_TRANSITIONS: Record<SupportCaseStatus, SupportCaseStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['WAITING_ON_USER', 'RESOLVED', 'CLOSED', 'OPEN'],
  WAITING_ON_USER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

@Injectable()
export class AdminOpsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  async overview(): Promise<AdminOverviewResponse> {
    const [
      submittedApplications,
      openReports,
      publishedRequests,
      openSupportCases,
      queuedNotificationDeliveries,
      unresolvedJobFailures,
    ] = await this.prisma.$transaction([
      this.prisma.founderApplication.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.report.count({ where: { status: REPORT_STATUSES.open } }),
      this.prisma.request.count({
        where: { status: REQUEST_STATUSES.published },
      }),
      this.prisma.supportCase.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER'] } },
      }),
      this.prisma.notificationDelivery.count({
        where: { status: { in: ['QUEUED', 'RETRY_QUEUED'] } },
      }),
      this.prisma.jobFailure.count({ where: { resolvedAt: null } }),
    ]);
    return {
      metrics: {
        submittedApplications,
        openReports,
        publishedRequests,
        openSupportCases,
        queuedNotificationDeliveries,
        unresolvedJobFailures,
      },
    };
  }

  async listRequests(page: number): Promise<AdminPage<AdminRequestListItem>> {
    const where = { status: { not: REQUEST_STATUSES.draft } };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.request.count({ where }),
      this.prisma.request.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        include: {
          author: {
            select: {
              status: true,
              deletedAt: true,
              profile: { select: { displayName: true } },
            },
          },
          _count: { select: { responses: true } },
        },
      }),
    ]);
    return pageOf(
      page,
      total,
      rows.map((row) => ({
        id: row.id,
        headline: row.headline,
        status: row.status,
        type: row.type,
        authorId: row.authorId,
        authorDisplayName: isDeletedAccount(row.author)
          ? DELETED_FOUNDER_DISPLAY_NAME
          : (row.author.profile?.displayName ?? ''),
        responseCount: row._count.responses,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
      })),
    );
  }

  async getRequest(
    id: string,
  ): Promise<AdminRequestListItem & { context: string }> {
    const row = await this.prisma.request.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            status: true,
            deletedAt: true,
            profile: { select: { displayName: true } },
          },
        },
        _count: { select: { responses: true } },
      },
    });
    if (!row) throw adminInvalid('This request could not be found.');
    return {
      id: row.id,
      headline: row.headline,
      context: row.context,
      status: row.status,
      type: row.type,
      authorId: row.authorId,
      authorDisplayName: isDeletedAccount(row.author)
        ? DELETED_FOUNDER_DISPLAY_NAME
        : (row.author.profile?.displayName ?? ''),
      responseCount: row._count.responses,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }

  async listSupport(
    page: number,
  ): Promise<AdminPage<AdminSupportCaseListItem>> {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.supportCase.count(),
      this.prisma.supportCase.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
      }),
    ]);
    return pageOf(page, total, rows.map(toSupportItem));
  }

  async getSupport(id: string): Promise<{
    case: AdminSupportCaseListItem;
    messages: AdminSupportMessage[];
  }> {
    const row = await this.prisma.supportCase.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) throw adminInvalid('This support case could not be found.');
    return {
      case: toSupportItem(row),
      messages: row.messages.map((message) => ({
        id: message.id,
        actorType: message.actorType,
        createdAt: message.createdAt.toISOString(),
        body: message.body,
      })),
    };
  }

  async replySupport(actor: AdminPrincipal, id: string, body: string) {
    const current = await this.prisma.supportCase.findUnique({ where: { id } });
    if (!current) throw adminInvalid('This support case could not be found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: {
          caseId: id,
          actorType: 'SUPPORT',
          actorId: actor.user.id,
          body,
        },
      });
      if (current.status === 'OPEN') {
        await tx.supportCase.update({
          where: { id },
          data: { status: 'IN_PROGRESS' },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.supportReplied,
          targetType: 'SUPPORT_CASE',
          targetId: id,
          metadata: { messageLength: body.length },
        },
      });
    });
    return this.getSupport(id);
  }

  async statusSupport(
    actor: AdminPrincipal,
    id: string,
    status: SupportCaseStatus,
  ) {
    const current = await this.prisma.supportCase.findUnique({ where: { id } });
    if (!current) throw adminInvalid('This support case could not be found.');
    const allowed =
      SUPPORT_TRANSITIONS[current.status as SupportCaseStatus] ?? [];
    if (!allowed.includes(status)) {
      throw adminInvalid('That support status change is not allowed.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.supportCase.update({ where: { id }, data: { status } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.supportStatusChanged,
          targetType: 'SUPPORT_CASE',
          targetId: id,
          metadata: { from: current.status, to: status },
        },
      });
    });
    return this.getSupport(id);
  }

  async listReputation(
    page: number,
  ): Promise<AdminPage<AdminContributionListItem>> {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contribution.count(),
      this.prisma.contribution.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        include: {
          contributor: {
            select: {
              status: true,
              deletedAt: true,
              profile: { select: { displayName: true } },
            },
          },
          helpConfirmation: {
            select: { confirmerId: true, requestId: true },
          },
          thankYou: { select: { id: true } },
        },
      }),
    ]);
    return pageOf(
      page,
      total,
      rows.map((row) => ({
        id: row.id,
        helperId: row.contributorId,
        helperDisplayName: isDeletedAccount(row.contributor)
          ? DELETED_FOUNDER_DISPLAY_NAME
          : (row.contributor.profile?.displayName ?? ''),
        confirmerId: row.helpConfirmation.confirmerId,
        requestId: row.helpConfirmation.requestId,
        createdAt: row.createdAt.toISOString(),
        hasThankYou: Boolean(row.thankYou),
      })),
    );
  }

  async getReputation(id: string): Promise<AdminContributionListItem> {
    const match = await this.prisma.contribution.findUnique({
      where: { id },
      include: {
        contributor: {
          select: {
            status: true,
            deletedAt: true,
            profile: { select: { displayName: true } },
          },
        },
        helpConfirmation: {
          select: { confirmerId: true, requestId: true },
        },
        thankYou: { select: { id: true } },
      },
    });
    if (!match) throw adminInvalid('This contribution could not be found.');
    return {
      id: match.id,
      helperId: match.contributorId,
      helperDisplayName: isDeletedAccount(match.contributor)
        ? DELETED_FOUNDER_DISPLAY_NAME
        : (match.contributor.profile?.displayName ?? ''),
      confirmerId: match.helpConfirmation.confirmerId,
      requestId: match.helpConfirmation.requestId,
      createdAt: match.createdAt.toISOString(),
      hasThankYou: Boolean(match.thankYou),
    };
  }

  async listNotifications(
    page: number,
  ): Promise<AdminPage<AdminNotificationDeliveryItem>> {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notificationDelivery.count(),
      this.prisma.notificationDelivery.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        include: {
          notification: {
            select: {
              id: true,
              type: true,
              title: true,
              userId: true,
              user: { select: { email: true, status: true, deletedAt: true } },
            },
          },
        },
      }),
    ]);
    return pageOf(page, total, rows.map(toDeliveryItem));
  }

  async getNotification(id: string): Promise<AdminNotificationDeliveryItem> {
    const row = await this.prisma.notificationDelivery.findUnique({
      where: { id },
      include: {
        notification: {
          select: {
            id: true,
            type: true,
            title: true,
            userId: true,
            user: { select: { email: true, status: true, deletedAt: true } },
          },
        },
      },
    });
    if (!row) throw adminInvalid('This delivery could not be found.');
    return toDeliveryItem(row);
  }

  async retryNotification(actor: AdminPrincipal, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.requeueDelivery(
        tx,
        actor,
        id,
        ADMIN_OPS_AUDIT_ACTIONS.notificationRetried,
      );
    });
    return this.getNotification(id);
  }

  async listTemplates(): Promise<{ templates: AdminNotificationTemplate[] }> {
    const templates = await this.prisma.notificationTemplate.findMany({
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
    });
    return {
      templates: templates.map((row) => ({
        id: row.id,
        key: row.key,
        version: row.version,
        subject: row.subject,
        isActive: row.isActive,
      })),
    };
  }

  async getTemplate(id: string): Promise<AdminNotificationTemplate> {
    const row = await this.prisma.notificationTemplate.findUnique({
      where: { id },
    });
    if (!row) throw adminInvalid('This template could not be found.');
    return {
      id: row.id,
      key: row.key,
      version: row.version,
      subject: row.subject,
      isActive: row.isActive,
    };
  }

  async listTaxonomy(): Promise<{ topics: AdminTaxonomyTopic[] }> {
    const topics = await this.prisma.taxonomyTopic.findMany({
      orderBy: [{ label: 'asc' }, { id: 'asc' }],
    });
    return { topics: topics.map(toTopic) };
  }

  async createTaxonomy(
    actor: AdminPrincipal,
    input: { label: string; description: string | null },
  ) {
    const slug = slugify(input.label);
    const topic = await this.prisma.$transaction(async (tx) => {
      const taken = await tx.taxonomyTopic.findUnique({ where: { slug } });
      if (taken) throw adminInvalid('That slug is already in use.');
      const created = await tx.taxonomyTopic.create({
        data: {
          slug,
          label: input.label,
          description: input.description,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.taxonomyCreated,
          targetType: 'TAXONOMY_TOPIC',
          targetId: created.id,
          metadata: { slug },
        },
      });
      return created;
    });
    return { topic: toTopic(topic) };
  }

  async patchTaxonomy(
    actor: AdminPrincipal,
    id: string,
    input: { label?: string; description?: string | null; isActive?: boolean },
  ) {
    const topic = await this.prisma.$transaction(async (tx) => {
      const current = await tx.taxonomyTopic.findUnique({ where: { id } });
      if (!current) throw adminInvalid('This topic could not be found.');
      if (current.mergedIntoId && input.isActive) {
        throw adminInvalid(
          'A merged topic cannot be reactivated independently.',
        );
      }
      const updated = await tx.taxonomyTopic.update({
        where: { id },
        data: {
          ...(input.label ? { label: input.label } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.taxonomyUpdated,
          targetType: 'TAXONOMY_TOPIC',
          targetId: id,
          metadata: { fields: Object.keys(input) },
        },
      });
      return updated;
    });
    return { topic: toTopic(topic) };
  }

  async mergeTaxonomy(
    actor: AdminPrincipal,
    sourceId: string,
    targetId: string,
  ) {
    if (sourceId === targetId) {
      throw adminInvalid('Choose a different merge target.');
    }
    await this.prisma.$transaction(async (tx) => {
      const [first, second] = [sourceId, targetId].sort();
      await tx.$queryRaw`SELECT id FROM "TaxonomyTopic" WHERE id = ${first} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "TaxonomyTopic" WHERE id = ${second} FOR UPDATE`;
      const source = await tx.taxonomyTopic.findUnique({
        where: { id: sourceId },
      });
      const target = await tx.taxonomyTopic.findUnique({
        where: { id: targetId },
      });
      if (!source || !target)
        throw adminInvalid('Those topics could not be found.');
      if (source.mergedIntoId) {
        throw adminInvalid('This topic has already been merged.');
      }
      if (!target.isActive || target.mergedIntoId) {
        throw adminInvalid('Merge into an active, unmerged topic.');
      }
      await tx.taxonomyTopic.update({
        where: { id: sourceId },
        data: { isActive: false, mergedIntoId: targetId },
      });
      await this.repointProfileTopics(tx, sourceId, targetId);
      await tx.auditLog.create({
        data: {
          actorUserId: actor.user.id,
          action: ADMIN_OPS_AUDIT_ACTIONS.taxonomyMerged,
          targetType: 'TAXONOMY_TOPIC',
          targetId: sourceId,
          metadata: { targetId },
        },
      });
    });
    return this.listTaxonomy();
  }

  async analytics(): Promise<AdminAnalyticsResponse> {
    const [
      publishedRequests,
      requestsWithResponse,
      confirmedHelped,
      requestsWithNoResponse,
      submittedApplications,
      helpers,
    ] = await Promise.all([
      this.prisma.request.count({
        where: { status: REQUEST_STATUSES.published },
      }),
      this.prisma.request.count({
        where: {
          status: {
            in: [REQUEST_STATUSES.published, REQUEST_STATUSES.resolved],
          },
          responses: { some: { deletedAt: null } },
        },
      }),
      this.prisma.helpConfirmation.count({
        where: { outcome: HELP_OUTCOMES.helped },
      }),
      this.prisma.request.count({
        where: {
          status: REQUEST_STATUSES.published,
          responses: { none: { deletedAt: null } },
        },
      }),
      this.prisma.founderApplication.count({
        where: {
          status: { in: ['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED'] },
        },
      }),
      this.prisma.contribution.findMany({
        where: { contributor: { status: 'ACTIVE', deletedAt: null } },
        distinct: ['contributorId'],
        select: { contributorId: true },
      }),
    ]);
    return {
      publishedRequests,
      requestsWithResponse,
      confirmedHelped,
      activeHelpers: helpers.length,
      requestsWithNoResponse,
      submittedApplications,
    };
  }

  async listAudit(
    page: number,
    filters: {
      action: string | null;
      actorUserId: string | null;
      targetType: string | null;
      targetId: string | null;
    },
  ): Promise<AdminPage<AdminAuditListItem>> {
    const where = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.targetType ? { targetType: filters.targetType } : {}),
      ...(filters.targetId ? { targetId: filters.targetId } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
      }),
    ]);
    return pageOf(
      page,
      total,
      rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }

  async getAudit(
    id: string,
  ): Promise<AdminAuditListItem & { metadata: unknown }> {
    const row = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!row) throw adminInvalid('This audit entry could not be found.');
    return {
      id: row.id,
      actorUserId: row.actorUserId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      metadata: sanitizeMetadata(row.metadata),
    };
  }

  async settings(): Promise<AdminSettingsResponse> {
    const stored = await this.prisma.platformSetting.findMany({
      orderBy: { key: 'asc' },
    });
    return {
      settings: [
        {
          key: 'openPublishedRequestLimit',
          source: 'code',
          value: REQUEST_LIMITS.openPublished,
        },
        {
          key: 'emailProvider',
          source: 'code',
          value: this.config.emailProvider,
        },
        {
          key: 'accountDeletionWorkflowVersion',
          source: 'code',
          value: ACCOUNT_DELETION_WORKFLOW_VERSION,
        },
        ...stored.map((row) => ({
          key: row.key,
          source: 'database' as const,
          value: row.value,
        })),
      ],
    };
  }

  async system(): Promise<AdminSystemResponse> {
    let database: 'ok' | 'unavailable' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unavailable';
    }
    const [notificationBacklog, unresolvedJobFailures] =
      await this.prisma.$transaction([
        this.prisma.notificationDelivery.count({
          where: { status: { in: ['QUEUED', 'RETRY_QUEUED'] } },
        }),
        this.prisma.jobFailure.count({ where: { resolvedAt: null } }),
      ]);
    return {
      api: 'ok',
      database,
      notificationBacklog,
      unresolvedJobFailures,
    };
  }

  async listJobs(page: number): Promise<AdminPage<AdminJobFailureItem>> {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.jobFailure.count(),
      this.prisma.jobFailure.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
      }),
    ]);
    return pageOf(page, total, rows.map(toJob));
  }

  async getJob(id: string): Promise<AdminJobFailureItem> {
    const row = await this.prisma.jobFailure.findUnique({ where: { id } });
    if (!row) throw adminInvalid('This job failure could not be found.');
    return toJob(row);
  }

  async retryJob(actor: AdminPrincipal, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockJobFailure(tx, id);
      const job = await tx.jobFailure.findUnique({ where: { id } });
      if (!job) throw adminInvalid('This job failure could not be found.');
      if (job.resolvedAt)
        throw adminInvalid('That job has already been resolved.');
      if (job.jobName !== 'notification-delivery' || !job.jobId) {
        throw adminInvalid(
          'This job type cannot be retried from persisted state.',
        );
      }
      await this.requeueDelivery(
        tx,
        actor,
        job.jobId,
        ADMIN_OPS_AUDIT_ACTIONS.jobRetried,
      );
      await tx.jobFailure.update({
        where: { id },
        data: { resolvedAt: new Date() },
      });
    });
    return this.getJob(id);
  }

  async search(
    q: string,
    permissions: Set<string>,
  ): Promise<AdminSearchResponse> {
    const results: AdminSearchResponse['results'] = [];
    if (permissions.has('admin.members.read')) {
      const members = await this.prisma.user.findMany({
        where: {
          OR: [
            { id: q },
            { email: { contains: q, mode: 'insensitive' } },
            {
              profile: {
                is: { displayName: { contains: q, mode: 'insensitive' } },
              },
            },
            {
              profile: {
                is: {
                  company: {
                    is: { name: { contains: q, mode: 'insensitive' } },
                  },
                },
              },
            },
          ],
        },
        take: 8,
        select: {
          id: true,
          email: true,
          status: true,
          deletedAt: true,
          profile: { select: { displayName: true } },
        },
      });
      for (const member of members) {
        results.push({
          type: 'member',
          id: member.id,
          label: isDeletedAccount(member)
            ? DELETED_FOUNDER_DISPLAY_NAME
            : member.profile?.displayName || member.email,
        });
      }
    }
    if (permissions.has('admin.requests.read')) {
      const requests = await this.prisma.request.findMany({
        where: {
          OR: [{ id: q }, { headline: { contains: q, mode: 'insensitive' } }],
        },
        take: 8,
        select: { id: true, headline: true },
      });
      for (const request of requests) {
        results.push({
          type: 'request',
          id: request.id,
          label: request.headline,
        });
      }
    }
    if (permissions.has('admin.reports.read')) {
      const reports = await this.prisma.report.findMany({
        where: { id: q },
        take: 8,
        select: { id: true, reasonCode: true },
      });
      for (const report of reports) {
        results.push({
          type: 'report',
          id: report.id,
          label: report.reasonCode,
        });
      }
    }
    if (permissions.has('admin.support.read')) {
      const cases = await this.prisma.supportCase.findMany({
        where: {
          OR: [{ id: q }, { subject: { contains: q, mode: 'insensitive' } }],
        },
        take: 8,
        select: { id: true, subject: true },
      });
      for (const item of cases) {
        results.push({ type: 'support', id: item.id, label: item.subject });
      }
    }
    return { q, results: results.slice(0, 20) };
  }

  private async requeueDelivery(
    tx: Prisma.TransactionClient,
    actor: AdminPrincipal,
    deliveryId: string,
    action: string,
  ): Promise<void> {
    const identity = await tx.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: { notification: { select: { userId: true } } },
    });
    if (!identity) throw adminInvalid('This delivery could not be found.');
    await lockUser(tx, identity.notification.userId);
    await lockNotificationDelivery(tx, deliveryId);
    const row = await tx.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        notification: {
          select: {
            user: { select: { status: true, deletedAt: true, email: true } },
          },
        },
      },
    });
    if (!row) throw adminInvalid('This delivery could not be found.');
    if (row.status === 'SENT') {
      throw adminInvalid('A sent delivery cannot be retried.');
    }
    if (row.status === 'QUEUED') {
      throw adminInvalid('This delivery is already queued.');
    }
    const user = row.notification.user;
    if (isDeletedAccount(user) || isTombstoneEmail(user.email)) {
      throw adminInvalid('A deleted account cannot receive mail.');
    }
    await tx.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'QUEUED',
        attemptCount: 0,
        lastErrorCode: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.user.id,
        action,
        targetType: 'NOTIFICATION_DELIVERY',
        targetId: deliveryId,
        metadata: { notificationId: row.notificationId },
      },
    });
  }

  private async repointProfileTopics(
    tx: Prisma.TransactionClient,
    sourceId: string,
    targetId: string,
  ): Promise<void> {
    const expertise = await tx.founderExpertise.findMany({
      where: { topicId: sourceId },
    });
    for (const row of expertise) {
      const exists = await tx.founderExpertise.findUnique({
        where: {
          profileId_topicId: { profileId: row.profileId, topicId: targetId },
        },
      });
      if (exists) {
        await tx.founderExpertise.delete({
          where: {
            profileId_topicId: { profileId: row.profileId, topicId: sourceId },
          },
        });
      } else {
        await tx.founderExpertise.update({
          where: {
            profileId_topicId: { profileId: row.profileId, topicId: sourceId },
          },
          data: { topicId: targetId },
        });
      }
    }
    const needs = await tx.founderNeed.findMany({
      where: { topicId: sourceId },
    });
    for (const row of needs) {
      const exists = await tx.founderNeed.findUnique({
        where: {
          profileId_topicId: { profileId: row.profileId, topicId: targetId },
        },
      });
      if (exists) {
        await tx.founderNeed.delete({
          where: {
            profileId_topicId: { profileId: row.profileId, topicId: sourceId },
          },
        });
      } else {
        await tx.founderNeed.update({
          where: {
            profileId_topicId: { profileId: row.profileId, topicId: sourceId },
          },
          data: { topicId: targetId },
        });
      }
    }
  }
}

function pageOf<T>(page: number, total: number, items: T[]): AdminPage<T> {
  return {
    items,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}

function toSupportItem(row: {
  id: string;
  subject: string;
  category: string;
  status: string;
  email: string | null;
  userId: string | null;
  createdAt: Date;
}): AdminSupportCaseListItem {
  return {
    id: row.id,
    subject: row.subject,
    category: row.category,
    status: row.status as SupportCaseStatus,
    email: row.email,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toTopic(row: {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  isActive: boolean;
  mergedIntoId: string | null;
}): AdminTaxonomyTopic {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description,
    isActive: row.isActive,
    mergedIntoId: row.mergedIntoId,
  };
}

function toDeliveryItem(row: {
  id: string;
  channel: string;
  status: string;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: Date;
  sentAt: Date | null;
  templateVersion: string;
  notificationId: string;
  notification: {
    id: string;
    type: string;
    title: string;
    userId: string;
    user: { email: string; status: string; deletedAt: Date | null };
  };
}): AdminNotificationDeliveryItem {
  const deleted = isDeletedAccount(row.notification.user);
  return {
    id: row.id,
    notificationId: row.notification.id,
    type: row.notification.type,
    title: row.notification.title,
    recipientUserId: row.notification.userId,
    recipientEmail:
      deleted || isTombstoneEmail(row.notification.user.email)
        ? null
        : row.notification.user.email,
    channel: row.channel,
    status: row.status,
    attemptCount: row.attemptCount,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    templateVersion: row.templateVersion,
  };
}

function toJob(row: {
  id: string;
  queue: string;
  jobName: string;
  jobId: string | null;
  errorCode: string | null;
  attempts: number;
  resolvedAt: Date | null;
  createdAt: Date;
}): AdminJobFailureItem {
  return {
    id: row.id,
    queue: row.queue,
    jobName: row.jobName,
    jobId: row.jobId,
    errorCode: row.errorCode,
    attempts: row.attempts,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function sanitizeMetadata(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const banned = /password|token|cookie|secret|hash|body|evidence/i;
  const copy = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(copy)) {
    if (banned.test(key)) delete copy[key];
  }
  return copy;
}
