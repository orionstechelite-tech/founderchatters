import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_APPLICATION_QUEUE_STATUSES,
  ADMIN_ERROR_CODES,
  APPLICATION_ELIGIBILITY_ROLES,
  APPLICATION_ERROR_CODES,
  type AdminApplicationDetail,
  type AdminApplicationDetailResponse,
  type AdminApplicationQueueItem,
  type AdminApplicationQueueResponse,
  type AdminApplicationQueueStatus,
  type ApplicationEligibilityRole,
  type ApplicationStatus,
} from '@founderchatters/contracts';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import { ADMIN_QUEUE_PAGE_SIZE } from './admin-application-input.js';
import type { AdminPrincipal } from './admin-auth.service.js';
import { AdminAuthService } from './admin-auth.service.js';

type ReviewableStatus = AdminApplicationQueueStatus;

type ApplicationRow = {
  id: string;
  status: ApplicationStatus;
  eligibilityRole: string | null;
  companyName: string | null;
  roleTitle: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  buildingSummary: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  updatedAt: Date;
  user: { email: string; emailVerifiedAt: Date | null };
  events: Array<{ note: string | null; toStatus: ApplicationStatus }>;
};

const applicationSelect = {
  id: true,
  status: true,
  eligibilityRole: true,
  companyName: true,
  roleTitle: true,
  website: true,
  city: true,
  country: true,
  buildingSummary: true,
  submittedAt: true,
  decidedAt: true,
  updatedAt: true,
  user: { select: { email: true, emailVerifiedAt: true } },
  events: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { note: true, toStatus: true },
  },
} as const;

const queueSelect = {
  id: true,
  status: true,
  eligibilityRole: true,
  companyName: true,
  roleTitle: true,
  city: true,
  country: true,
  submittedAt: true,
  decidedAt: true,
  updatedAt: true,
  user: { select: { email: true, emailVerifiedAt: true } },
} as const;

@Injectable()
export class ApplicationReviewService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AdminAuthService)
    private readonly auth: AdminAuthService,
  ) {}

  async list(query: {
    status: ReviewableStatus;
    country: string | null;
    page: number;
  }): Promise<AdminApplicationQueueResponse> {
    const where = {
      status: query.status,
      ...(query.country
        ? { country: { equals: query.country, mode: 'insensitive' as const } }
        : {}),
    };
    const orderBy = this.orderBy(query.status);
    const [total, rows, countryRows] = await Promise.all([
      this.prisma.founderApplication.count({ where }),
      this.prisma.founderApplication.findMany({
        where,
        select: queueSelect,
        orderBy,
        skip: (query.page - 1) * ADMIN_QUEUE_PAGE_SIZE,
        take: ADMIN_QUEUE_PAGE_SIZE,
      }),
      this.prisma.founderApplication.findMany({
        where: { status: query.status, country: { not: null } },
        distinct: ['country'],
        select: { country: true },
        orderBy: { country: 'asc' },
      }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_QUEUE_PAGE_SIZE));
    return {
      applications: rows.map((row) => this.queueItem(row)),
      page: query.page,
      pageSize: ADMIN_QUEUE_PAGE_SIZE,
      total,
      totalPages,
      status: query.status,
      country: query.country,
      countries: countryRows
        .map(({ country }) => country)
        .filter((country): country is string => Boolean(country)),
    };
  }

  async get(
    principal: AdminPrincipal,
    id: string,
  ): Promise<AdminApplicationDetailResponse> {
    const application = await this.prisma.founderApplication.findUnique({
      where: { id },
      select: applicationSelect,
    });
    if (!this.isReviewable(application)) {
      throw this.notFound();
    }
    return {
      application: this.detail(application),
      capabilities: this.auth.capabilities(principal.permissions),
    };
  }

  requestInfo(
    principal: AdminPrincipal,
    id: string,
    note: string,
  ): Promise<AdminApplicationDetailResponse> {
    return this.decide(principal, id, {
      toStatus: 'NEEDS_INFO',
      note,
      auditAction: 'application.needs_info',
      terminal: false,
    });
  }

  approve(
    principal: AdminPrincipal,
    id: string,
  ): Promise<AdminApplicationDetailResponse> {
    return this.decide(principal, id, {
      toStatus: 'APPROVED',
      note: null,
      auditAction: 'application.approved',
      terminal: true,
    });
  }

  reject(
    principal: AdminPrincipal,
    id: string,
    note: string,
  ): Promise<AdminApplicationDetailResponse> {
    return this.decide(principal, id, {
      toStatus: 'REJECTED',
      note,
      auditAction: 'application.rejected',
      terminal: true,
    });
  }

  private async decide(
    principal: AdminPrincipal,
    id: string,
    decision: {
      toStatus: 'NEEDS_INFO' | 'APPROVED' | 'REJECTED';
      note: string | null;
      auditAction:
        | 'application.needs_info'
        | 'application.approved'
        | 'application.rejected';
      terminal: boolean;
    },
  ): Promise<AdminApplicationDetailResponse> {
    const application = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.founderApplication.findUnique({
        where: { id },
        select: applicationSelect,
      });
      if (!this.isReviewable(current)) {
        throw this.notFound();
      }
      if (current.status !== 'SUBMITTED') {
        throw this.invalidAction(
          'This application cannot be reviewed in its current state.',
        );
      }

      const now = new Date();
      const claimed = await transaction.founderApplication.updateMany({
        where: { id: current.id, status: 'SUBMITTED' },
        data: decision.terminal
          ? { status: decision.toStatus, decidedAt: now }
          : { status: decision.toStatus },
      });
      if (claimed.count !== 1) {
        throw this.invalidAction(
          'This application was already reviewed by another administrator.',
        );
      }
      await transaction.applicationStatusEvent.create({
        data: {
          applicationId: current.id,
          fromStatus: 'SUBMITTED',
          toStatus: decision.toStatus,
          actorUserId: principal.user.id,
          note: decision.note,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: principal.user.id,
          action: decision.auditAction,
          targetType: 'FounderApplication',
          targetId: current.id,
          reason: decision.note,
        },
      });
      return transaction.founderApplication.findUniqueOrThrow({
        where: { id: current.id },
        select: applicationSelect,
      });
    });
    return {
      application: this.detail(application),
      capabilities: this.auth.capabilities(principal.permissions),
    };
  }

  private orderBy(status: ReviewableStatus) {
    if (status === 'SUBMITTED') {
      return [{ submittedAt: 'asc' as const }, { id: 'asc' as const }];
    }
    if (status === 'NEEDS_INFO') {
      return [{ updatedAt: 'desc' as const }, { id: 'desc' as const }];
    }
    return [{ decidedAt: 'desc' as const }, { id: 'desc' as const }];
  }

  private queueItem(application: {
    id: string;
    status: ApplicationStatus;
    eligibilityRole: string | null;
    companyName: string | null;
    roleTitle: string | null;
    city: string | null;
    country: string | null;
    submittedAt: Date | null;
    decidedAt: Date | null;
    updatedAt: Date;
    user: { email: string; emailVerifiedAt: Date | null };
  }): AdminApplicationQueueItem {
    return {
      id: application.id,
      status: application.status as ReviewableStatus,
      eligibilityRole: this.safeEligibilityRole(application.eligibilityRole),
      companyName: application.companyName,
      roleTitle: application.roleTitle,
      city: application.city,
      country: application.country,
      submittedAt: application.submittedAt?.toISOString() ?? null,
      decidedAt: application.decidedAt?.toISOString() ?? null,
      updatedAt: application.updatedAt.toISOString(),
      applicantEmail: application.user.email,
      emailVerified: Boolean(application.user.emailVerifiedAt),
    };
  }

  private detail(application: ApplicationRow): AdminApplicationDetail {
    return {
      id: application.id,
      status: application.status,
      eligibilityRole: this.safeEligibilityRole(application.eligibilityRole),
      companyName: application.companyName,
      roleTitle: application.roleTitle,
      website: application.website,
      city: application.city,
      country: application.country,
      buildingSummary: application.buildingSummary,
      submittedAt: application.submittedAt?.toISOString() ?? null,
      decidedAt: application.decidedAt?.toISOString() ?? null,
      updatedAt: application.updatedAt.toISOString(),
      latestReviewNote: this.relevantReviewNote(application),
      applicant: {
        email: application.user.email,
        emailVerified: Boolean(application.user.emailVerifiedAt),
      },
    };
  }

  private relevantReviewNote(application: ApplicationRow): string | null {
    const latest = application.events[0];
    if (!latest || latest.toStatus !== application.status) return null;
    if (
      application.status !== 'NEEDS_INFO' &&
      application.status !== 'REJECTED'
    ) {
      return null;
    }
    return latest.note ?? null;
  }

  private isReviewable(
    application: { status: ApplicationStatus } | null,
  ): application is ApplicationRow {
    return (
      application !== null &&
      (ADMIN_APPLICATION_QUEUE_STATUSES as readonly string[]).includes(
        application.status,
      )
    );
  }

  private safeEligibilityRole(
    value: string | null,
  ): ApplicationEligibilityRole | null {
    return Object.values(APPLICATION_ELIGIBILITY_ROLES).includes(
      value as ApplicationEligibilityRole,
    )
      ? (value as ApplicationEligibilityRole)
      : null;
  }

  private notFound(): ApiError {
    return new ApiError(
      APPLICATION_ERROR_CODES.notFound,
      'No founder application was found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private invalidAction(message: string): ApiError {
    return new ApiError(
      ADMIN_ERROR_CODES.actionInvalidState,
      message,
      HttpStatus.CONFLICT,
    );
  }
}
