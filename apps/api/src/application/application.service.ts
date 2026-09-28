import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  APPLICATION_ELIGIBILITY_ROLES,
  APPLICATION_ERROR_CODES,
  type ApplicationEligibilityRole,
  type FounderApplicationResponse,
} from '@founderchatters/contracts';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import {
  validateApplicationForSubmission,
  validateApplicationUpdate,
} from './application-input.js';

type ApplicationRecord = {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED';
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
  events: Array<{ note: string | null }>;
};

const applicationInclude = {
  events: {
    where: { toStatus: 'NEEDS_INFO' as const },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { note: true },
  },
} as const;

@Injectable()
export class ApplicationService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async get(userId: string): Promise<FounderApplicationResponse> {
    const application = await this.prisma.founderApplication.findUnique({
      where: { userId },
      include: applicationInclude,
    });
    if (!application) {
      throw this.notFound();
    }
    return this.response(application);
  }

  async update(
    userId: string,
    body: unknown,
  ): Promise<FounderApplicationResponse> {
    const input = validateApplicationUpdate(body);
    const existing = await this.prisma.founderApplication.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });

    if (!existing) {
      try {
        const application = await this.prisma.founderApplication.create({
          data: { userId, ...input },
          include: applicationInclude,
        });
        return this.response(application);
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    const current =
      existing ??
      (await this.prisma.founderApplication.findUnique({
        where: { userId },
        select: { id: true, status: true },
      }));
    if (!current) {
      throw this.invalidState(
        'Your application could not be saved. Please try again.',
      );
    }
    if (current.status !== 'DRAFT' && current.status !== 'NEEDS_INFO') {
      throw this.invalidState(
        'This application cannot be edited in its current state.',
      );
    }

    const updated = await this.prisma.founderApplication.updateMany({
      where: {
        id: current.id,
        status: { in: ['DRAFT', 'NEEDS_INFO'] },
      },
      data: input,
    });
    if (updated.count !== 1) {
      throw this.invalidState(
        'This application cannot be edited in its current state.',
      );
    }
    return this.get(userId);
  }

  submit(userId: string): Promise<FounderApplicationResponse> {
    return this.transition(userId, 'DRAFT', false);
  }

  resubmit(userId: string): Promise<FounderApplicationResponse> {
    return this.transition(userId, 'NEEDS_INFO', true);
  }

  private async transition(
    userId: string,
    fromStatus: 'DRAFT' | 'NEEDS_INFO',
    isResubmit: boolean,
  ): Promise<FounderApplicationResponse> {
    const application = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.founderApplication.findUnique({
        where: { userId },
        include: applicationInclude,
      });
      if (!current) {
        throw this.notFound();
      }
      if (current.status !== fromStatus) {
        if (!isResubmit && current.status === 'SUBMITTED') {
          throw new ApiError(
            APPLICATION_ERROR_CODES.alreadySubmitted,
            'This application has already been submitted.',
            HttpStatus.CONFLICT,
          );
        }
        if (!isResubmit && current.status === 'NEEDS_INFO') {
          throw new ApiError(
            APPLICATION_ERROR_CODES.needsInfo,
            'Update the requested information and resubmit this application.',
            HttpStatus.CONFLICT,
          );
        }
        throw this.invalidState(
          isResubmit
            ? 'Only an application awaiting more information can be resubmitted.'
            : 'Only a draft application can be submitted.',
        );
      }

      validateApplicationForSubmission(current);
      const now = new Date();
      const claimed = await transaction.founderApplication.updateMany({
        where: { id: current.id, status: fromStatus },
        data: {
          status: 'SUBMITTED',
          submittedAt: now,
        },
      });
      if (claimed.count !== 1) {
        throw isResubmit
          ? this.invalidState('This application has already been resubmitted.')
          : new ApiError(
              APPLICATION_ERROR_CODES.alreadySubmitted,
              'This application has already been submitted.',
              HttpStatus.CONFLICT,
            );
      }
      await transaction.applicationStatusEvent.create({
        data: {
          applicationId: current.id,
          fromStatus,
          toStatus: 'SUBMITTED',
          actorUserId: userId,
        },
      });
      return transaction.founderApplication.findUniqueOrThrow({
        where: { id: current.id },
        include: applicationInclude,
      });
    });
    return this.response(application);
  }

  private response(application: ApplicationRecord): FounderApplicationResponse {
    return {
      application: {
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
        needsInfoNote:
          application.status === 'NEEDS_INFO'
            ? (application.events[0]?.note ?? null)
            : null,
      },
    };
  }

  private notFound(): ApiError {
    return new ApiError(
      APPLICATION_ERROR_CODES.notFound,
      'No founder application exists yet.',
      HttpStatus.NOT_FOUND,
    );
  }

  private invalidState(message: string): ApiError {
    return new ApiError(
      APPLICATION_ERROR_CODES.invalidState,
      message,
      HttpStatus.CONFLICT,
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

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
