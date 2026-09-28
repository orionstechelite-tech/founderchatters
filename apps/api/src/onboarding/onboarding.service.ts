import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  APPLICATION_ERROR_CODES,
  AUTH_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  ONBOARDING_EXPERTISE_TOPICS,
  ONBOARDING_LIMITS,
  ONBOARDING_NEED_TOPICS,
  type OnboardingCompleteResponse,
  type OnboardingProfileResponse,
  type OnboardingTopicRef,
} from '@founderchatters/contracts';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import {
  validateCompleteBody,
  validateExpertiseUpdate,
  validateNeedsUpdate,
  validateProfileUpdate,
} from './onboarding-input.js';

const profileSelect = {
  id: true,
  displayName: true,
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
    select: {
      topic: { select: { id: true, slug: true, label: true } },
    },
  },
  needs: {
    select: {
      topic: { select: { id: true, slug: true, label: true } },
    },
  },
  user: {
    select: {
      onboardingCompletedAt: true,
      application: {
        select: {
          companyName: true,
          website: true,
          buildingSummary: true,
          city: true,
          country: true,
          roleTitle: true,
        },
      },
    },
  },
} as const;

type ProfileRecord = {
  id: string;
  displayName: string;
  city: string | null;
  country: string | null;
  customExpertise: string | null;
  currentNeedText: string | null;
  company: {
    name: string;
    website: string | null;
    description: string | null;
    stage: string | null;
    industry: string | null;
    city: string | null;
    country: string | null;
  } | null;
  expertise: Array<{
    topic: { id: string; slug: string; label: string };
  }>;
  needs: Array<{
    topic: { id: string; slug: string; label: string };
  }>;
  user: {
    onboardingCompletedAt: Date | null;
    application: {
      companyName: string | null;
      website: string | null;
      buildingSummary: string | null;
      city: string | null;
      country: string | null;
      roleTitle: string | null;
    } | null;
  };
};

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async getProfile(userId: string): Promise<OnboardingProfileResponse> {
    const [profile, application, topics] = await Promise.all([
      this.prisma.founderProfile.findUnique({
        where: { userId },
        select: profileSelect,
      }),
      this.prisma.founderApplication.findUnique({
        where: { userId },
        select: {
          companyName: true,
          website: true,
          buildingSummary: true,
          city: true,
          country: true,
          roleTitle: true,
        },
      }),
      this.prisma.taxonomyTopic.findMany({
        where: {
          slug: {
            in: [
              ...ONBOARDING_EXPERTISE_TOPICS.map((topic) => topic.slug),
              ...ONBOARDING_NEED_TOPICS.map((topic) => topic.slug),
            ],
          },
          isActive: true,
          mergedIntoId: null,
        },
        select: { id: true, slug: true, label: true },
      }),
    ]);
    return this.response(profile, application, topics);
  }

  async updateProfile(
    userId: string,
    body: unknown,
  ): Promise<OnboardingProfileResponse> {
    const input = validateProfileUpdate(body);
    const application = await this.prisma.founderApplication.findUnique({
      where: { userId },
      select: {
        companyName: true,
        website: true,
        buildingSummary: true,
        city: true,
        country: true,
      },
    });
    if (!application) {
      throw new ApiError(
        APPLICATION_ERROR_CODES.notFound,
        'No founder application exists yet.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      await this.assertOnboardingWritable(transaction, userId);
      const existing = await transaction.founderProfile.findUnique({
        where: { userId },
        select: {
          id: true,
          displayName: true,
          city: true,
          country: true,
        },
      });
      const displayName = input.displayName ?? existing?.displayName ?? null;
      if (!displayName) {
        throw new ApiError(
          APPLICATION_ERROR_CODES.invalidState,
          'Enter your name before saving your profile.',
          HttpStatus.BAD_REQUEST,
          { displayName: ['Enter your name.'] },
        );
      }
      const profileCity = this.persistedOrPrefill(
        input.city,
        existing?.city,
        application.city,
        Boolean(existing),
      );
      const profileCountry = this.persistedOrPrefill(
        input.country,
        existing?.country,
        application.country,
        Boolean(existing),
      );

      let profileId = existing?.id;
      if (!profileId) {
        try {
          const created = await transaction.founderProfile.create({
            data: {
              userId,
              displayName,
              city: profileCity,
              country: profileCountry,
            },
            select: { id: true },
          });
          profileId = created.id;
        } catch (error) {
          if (!this.isUniqueConstraintError(error)) {
            throw error;
          }
          const raced = await transaction.founderProfile.findUnique({
            where: { userId },
            select: { id: true },
          });
          if (!raced) {
            throw error;
          }
          profileId = raced.id;
          await transaction.founderProfile.update({
            where: { id: profileId },
            data: {
              displayName,
              city: profileCity,
              country: profileCountry,
            },
          });
        }
      } else {
        await transaction.founderProfile.update({
          where: { id: profileId },
          data: {
            displayName,
            city: profileCity,
            country: profileCountry,
          },
        });
      }

      const companyInput = input.company ?? {};
      const existingCompany = await transaction.company.findUnique({
        where: { founderProfileId: profileId },
        select: {
          name: true,
          website: true,
          description: true,
          stage: true,
          industry: true,
          city: true,
          country: true,
        },
      });
      const companyName =
        companyInput.name ??
        existingCompany?.name ??
        (existingCompany ? null : application.companyName) ??
        null;
      if (!companyName) {
        throw new ApiError(
          APPLICATION_ERROR_CODES.invalidState,
          'Enter a company name before saving your profile.',
          HttpStatus.BAD_REQUEST,
          { 'company.name': ['Enter a company name.'] },
        );
      }
      const hasCompany = Boolean(existingCompany);
      const companyData = {
        name: companyName,
        website: this.persistedOrPrefill(
          companyInput.website,
          existingCompany?.website,
          application.website,
          hasCompany,
        ),
        description: this.persistedOrPrefill(
          companyInput.description,
          existingCompany?.description,
          application.buildingSummary,
          hasCompany,
        ),
        stage:
          companyInput.stage !== undefined
            ? companyInput.stage
            : (existingCompany?.stage ?? null),
        industry:
          companyInput.industry !== undefined
            ? companyInput.industry
            : (existingCompany?.industry ?? null),
        city: this.persistedOrPrefill(
          companyInput.city,
          existingCompany?.city,
          application.city,
          hasCompany,
        ),
        country: this.persistedOrPrefill(
          companyInput.country,
          existingCompany?.country,
          application.country,
          hasCompany,
        ),
      };
      try {
        await transaction.company.upsert({
          where: { founderProfileId: profileId },
          create: { founderProfileId: profileId, ...companyData },
          update: companyData,
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
        await transaction.company.update({
          where: { founderProfileId: profileId },
          data: companyData,
        });
      }
    });

    return this.getProfile(userId);
  }

  async updateExpertise(
    userId: string,
    body: unknown,
  ): Promise<OnboardingProfileResponse> {
    const input = validateExpertiseUpdate(body);
    await this.replaceTopics(userId, input.topicIds, 'expertise', {
      customExpertise: input.customExpertise ?? null,
    });
    return this.getProfile(userId);
  }

  async updateNeeds(
    userId: string,
    body: unknown,
  ): Promise<OnboardingProfileResponse> {
    const input = validateNeedsUpdate(body);
    await this.replaceTopics(userId, input.topicIds, 'needs', {
      currentNeedText: input.currentNeedText,
    });
    return this.getProfile(userId);
  }

  async complete(
    userId: string,
    body: unknown,
  ): Promise<OnboardingCompleteResponse> {
    validateCompleteBody(body);
    const completedAt = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          status: true,
          deletedAt: true,
          emailVerifiedAt: true,
          onboardingCompletedAt: true,
          application: { select: { status: true } },
          profile: {
            select: {
              displayName: true,
              customExpertise: true,
              currentNeedText: true,
              company: { select: { name: true } },
              expertise: { select: { topicId: true } },
            },
          },
        },
      });
      if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
        throw new ApiError(
          AUTH_ERROR_CODES.forbidden,
          'This account cannot access the service.',
          HttpStatus.FORBIDDEN,
        );
      }
      if (!user.emailVerifiedAt) {
        throw new ApiError(
          AUTH_ERROR_CODES.emailNotVerified,
          'Verify your email before continuing onboarding.',
          HttpStatus.FORBIDDEN,
        );
      }
      if (user.application?.status !== 'APPROVED') {
        throw new ApiError(
          APPLICATION_ERROR_CODES.invalidState,
          'Onboarding can only be completed after approval.',
          HttpStatus.FORBIDDEN,
        );
      }
      if (user.onboardingCompletedAt) {
        return user.onboardingCompletedAt;
      }
      this.assertCompletionReady(user.profile);
      const now = new Date();
      const updated = await transaction.user.updateMany({
        where: { id: userId, onboardingCompletedAt: null },
        data: { onboardingCompletedAt: now },
      });
      if (updated.count !== 1) {
        const current = await transaction.user.findUniqueOrThrow({
          where: { id: userId },
          select: { onboardingCompletedAt: true },
        });
        if (!current.onboardingCompletedAt) {
          throw new ApiError(
            APPLICATION_ERROR_CODES.invalidState,
            'Onboarding could not be completed. Please try again.',
            HttpStatus.CONFLICT,
          );
        }
        return current.onboardingCompletedAt;
      }
      return now;
    });
    return {
      completed: true,
      onboardingCompletedAt: completedAt.toISOString(),
    };
  }

  private async replaceTopics(
    userId: string,
    topicIds: string[],
    kind: 'expertise' | 'needs',
    profileData: { customExpertise?: string | null; currentNeedText?: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      await this.assertOnboardingWritable(transaction, userId);
      const profile = await transaction.founderProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!profile) {
        throw new ApiError(
          APPLICATION_ERROR_CODES.invalidState,
          'Save your name and company before continuing.',
          HttpStatus.BAD_REQUEST,
          { displayName: ['Enter your name.'] },
        );
      }
      await transaction.$queryRaw`
        SELECT id FROM "FounderProfile" WHERE id = ${profile.id} FOR UPDATE
      `;
      if (topicIds.length > 0) {
        const topics = await transaction.taxonomyTopic.findMany({
          where: { id: { in: topicIds } },
          select: { id: true, isActive: true, mergedIntoId: true },
        });
        const byId = new Map(topics.map((topic) => [topic.id, topic]));
        const fieldErrors: Record<string, string[]> = {};
        for (const topicId of topicIds) {
          const topic = byId.get(topicId);
          if (!topic) {
            fieldErrors.topicIds = ['One or more topics are not available.'];
            break;
          }
          if (!topic.isActive || topic.mergedIntoId) {
            fieldErrors.topicIds = [
              'One or more selected topics are no longer available.',
            ];
            break;
          }
        }
        if (Object.keys(fieldErrors).length > 0) {
          throw new ApiError(
            APPLICATION_ERROR_CODES.invalidState,
            'Review the onboarding details and try again.',
            HttpStatus.BAD_REQUEST,
            fieldErrors,
          );
        }
      }
      if (kind === 'expertise') {
        await transaction.founderExpertise.deleteMany({
          where: { profileId: profile.id },
        });
        if (topicIds.length > 0) {
          await transaction.founderExpertise.createMany({
            data: topicIds.map((topicId) => ({
              profileId: profile.id,
              topicId,
            })),
          });
        }
        await transaction.founderProfile.update({
          where: { id: profile.id },
          data: { customExpertise: profileData.customExpertise ?? null },
        });
      } else {
        await transaction.founderNeed.deleteMany({
          where: { profileId: profile.id },
        });
        if (topicIds.length > 0) {
          await transaction.founderNeed.createMany({
            data: topicIds.map((topicId) => ({
              profileId: profile.id,
              topicId,
            })),
          });
        }
        await transaction.founderProfile.update({
          where: { id: profile.id },
          data: { currentNeedText: profileData.currentNeedText ?? '' },
        });
      }
    });
  }

  private assertCompletionReady(
    profile: {
      displayName: string;
      customExpertise: string | null;
      currentNeedText: string | null;
      company: { name: string } | null;
      expertise: Array<{ topicId: string }>;
    } | null,
  ): void {
    const fieldErrors: Record<string, string[]> = {};
    if (!profile?.displayName.trim()) {
      fieldErrors.displayName = ['Enter your name.'];
    }
    if (!profile?.company?.name.trim()) {
      fieldErrors['company.name'] = ['Enter a company name.'];
    }
    const expertiseCount =
      (profile?.expertise.length ?? 0) +
      (profile?.customExpertise?.trim() ? 1 : 0);
    if (expertiseCount < ONBOARDING_LIMITS.expertiseMin) {
      fieldErrors.topicIds = [
        'Choose at least one area of experience, or add something specific.',
      ];
    }
    if (expertiseCount > ONBOARDING_LIMITS.expertiseMax) {
      fieldErrors.topicIds = [
        `Choose up to ${String(ONBOARDING_LIMITS.expertiseMax)} expertise selections, including custom text.`,
      ];
    }
    const need = profile?.currentNeedText?.trim() ?? '';
    if (need.length < ONBOARDING_LIMITS.currentNeedTextMin) {
      fieldErrors.currentNeedText = [
        `Use at least ${String(ONBOARDING_LIMITS.currentNeedTextMin)} characters.`,
      ];
    } else if (need.length > ONBOARDING_LIMITS.currentNeedTextMax) {
      fieldErrors.currentNeedText = [
        `Use ${String(ONBOARDING_LIMITS.currentNeedTextMax)} characters or fewer.`,
      ];
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new ApiError(
        ONBOARDING_ERROR_CODES.incomplete,
        'Finish onboarding before entering the network.',
        HttpStatus.BAD_REQUEST,
        fieldErrors,
      );
    }
  }

  private response(
    profile: ProfileRecord | null,
    application: {
      companyName: string | null;
      website: string | null;
      buildingSummary: string | null;
      city: string | null;
      country: string | null;
      roleTitle: string | null;
    } | null,
    topics: OnboardingTopicRef[],
  ): OnboardingProfileResponse {
    const bySlug = new Map(topics.map((topic) => [topic.slug, topic]));
    const company = profile?.company
      ? {
          name: profile.company.name,
          website: profile.company.website,
          description: profile.company.description,
          stage: profile.company.stage,
          industry: profile.company.industry,
          city: profile.company.city,
          country: profile.company.country,
        }
      : application?.companyName
        ? {
            name: application.companyName,
            website: application.website,
            description: application.buildingSummary,
            stage: null,
            industry: null,
            city: application.city,
            country: application.country,
          }
        : null;
    return {
      profile: {
        displayName: profile?.displayName ?? null,
        city: profile ? profile.city : (application?.city ?? null),
        country: profile ? profile.country : (application?.country ?? null),
        customExpertise: profile?.customExpertise ?? null,
        currentNeedText: profile?.currentNeedText ?? null,
        onboardingCompleted: Boolean(profile?.user.onboardingCompletedAt),
      },
      company,
      applicationRoleTitle: application?.roleTitle ?? null,
      expertise: (profile?.expertise ?? []).map(({ topic }) => topic),
      needs: (profile?.needs ?? []).map(({ topic }) => topic),
      topics: {
        expertise: ONBOARDING_EXPERTISE_TOPICS.flatMap((topic) => {
          const match = bySlug.get(topic.slug);
          return match ? [match] : [];
        }),
        needs: ONBOARDING_NEED_TOPICS.flatMap((topic) => {
          const match = bySlug.get(topic.slug);
          return match ? [match] : [];
        }),
      },
    };
  }

  private async assertOnboardingWritable(
    transaction: Pick<PrismaService, 'user'>,
    userId: string,
  ): Promise<void> {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { onboardingCompletedAt: true },
    });
    if (user?.onboardingCompletedAt) {
      throw new ApiError(
        AUTH_ERROR_CODES.forbidden,
        'Onboarding details can no longer be changed here.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private persistedOrPrefill(
    input: string | null | undefined,
    existing: string | null | undefined,
    prefill: string | null,
    hasPersisted: boolean,
  ): string | null {
    if (input !== undefined) return input;
    if (hasPersisted) return existing ?? null;
    return existing ?? prefill ?? null;
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
