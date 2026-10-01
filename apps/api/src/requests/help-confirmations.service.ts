import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  HELP_OUTCOMES,
  INTRODUCTION_STATUSES,
  REQUEST_ERROR_CODES,
  REQUEST_STATUSES,
  RESPONSE_TYPES,
  type HelpConfirmationMutationResponse,
  type HelpOutcome,
  type MemberHelpConfirmation,
  type MemberRequestAuthor,
  type OwnerHelpConfirmation,
  type ThankYouMutationResponse,
} from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import {
  contributionCreatedEvent,
  emitHelpConfirmationEvent,
  helpConfirmedEvent,
  type HelpConfirmationDomainEvent,
} from './help-confirmations-events.js';
import {
  confirmationInvalidInput,
  confirmationInvalidState,
  confirmationNotAllowed,
  confirmationNotFound,
  contributionNotEligible,
  normalizeTopicIds,
  parseConfirmationId,
  parseHelpConfirmationBody,
  parseThankYouBody,
  sameTopicSet,
  thankYouAlreadyExists,
} from './help-confirmations-query.js';
import {
  isUniqueConstraintError,
  lockRequest,
  withRequestRowRetry,
} from './request-locks.js';
import { parseRequestId, requestNotFound } from './requests-query.js';

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

const requestInclude = {
  author: { select: authorSelect },
  topics: { select: { topicId: true } },
} as const;

const responseInclude = {
  author: { select: authorSelect },
  introduction: { select: { status: true } },
} as const;

const confirmationInclude = {
  contribution: {
    include: {
      thankYou: true,
      topics: { select: { topicId: true } },
    },
  },
  helper: { select: authorSelect },
  response: { select: { type: true, deletedAt: true } },
} as const;

type StoredRequest = Prisma.RequestGetPayload<{
  include: typeof requestInclude;
}>;
type StoredResponse = Prisma.RequestResponseGetPayload<{
  include: typeof responseInclude;
}>;
type StoredConfirmation = Prisma.HelpConfirmationGetPayload<{
  include: typeof confirmationInclude;
}>;
type ConfirmationWrite = {
  row: StoredConfirmation;
  events: HelpConfirmationDomainEvent[];
};

@Injectable()
export class HelpConfirmationsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async confirm(
    callerId: string,
    rawRequestId: unknown,
    body: unknown,
  ): Promise<HelpConfirmationMutationResponse> {
    const requestId = parseRequestId(rawRequestId);
    const parsed = parseHelpConfirmationBody(body);
    const topicIds = normalizeTopicIds(
      parsed.outcome === HELP_OUTCOMES.helped ? parsed.topicIds : [],
    );
    const preview = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: requestInclude,
    });
    this.assertOwnerMutable(preview, callerId);
    const written = await withRequestRowRetry(this.prisma, async (tx) => {
      await lockRequest(tx, requestId);
      const request = await tx.request.findUnique({
        where: { id: requestId },
        include: requestInclude,
      });
      this.assertOwnerMutable(request, callerId);
      const response = await tx.requestResponse.findUnique({
        where: { id: parsed.responseId },
        include: responseInclude,
      });
      const credited = await this.requireCreditable(
        tx,
        request,
        response,
        callerId,
        parsed.outcome,
      );
      const helperId = credited.authorId;
      this.assertDistinctParties(callerId, helperId);
      if (parsed.outcome === HELP_OUTCOMES.helped) {
        this.assertTopicsBelongToRequest(request, topicIds);
      }
      const existing = await tx.helpConfirmation.findUnique({
        where: {
          requestId_confirmerId_helperId: {
            requestId,
            confirmerId: callerId,
            helperId,
          },
        },
        include: confirmationInclude,
      });
      if (existing) {
        return this.applyExisting(
          tx,
          request,
          credited,
          existing,
          parsed.outcome,
          topicIds,
        );
      }
      try {
        return await this.createConfirmation(
          tx,
          request,
          credited,
          callerId,
          helperId,
          parsed.outcome,
          topicIds,
        );
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const raced = await tx.helpConfirmation.findUnique({
          where: {
            requestId_confirmerId_helperId: {
              requestId,
              confirmerId: callerId,
              helperId,
            },
          },
          include: confirmationInclude,
        });
        if (!raced) throw confirmationInvalidState();
        return this.applyExisting(
          tx,
          request,
          credited,
          raced,
          parsed.outcome,
          topicIds,
        );
      }
    });
    for (const event of written.events) {
      emitHelpConfirmationEvent(event);
    }
    const blocked = await this.isBlocked(callerId, written.row.helperId);
    return {
      confirmation: this.toMemberConfirmation(written.row, preview, blocked),
    };
  }

  async thankYou(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<ThankYouMutationResponse> {
    const id = parseConfirmationId(rawId);
    const parsed = parseThankYouBody(body);
    const preview = await this.prisma.helpConfirmation.findUnique({
      where: { id },
      include: confirmationInclude,
    });
    if (!preview || preview.confirmerId !== callerId) {
      throw confirmationNotFound();
    }
    const stored = await withRequestRowRetry(this.prisma, async (tx) => {
      await lockRequest(tx, preview.requestId);
      const confirmation = await tx.helpConfirmation.findUnique({
        where: { id },
        include: confirmationInclude,
      });
      if (!confirmation || confirmation.confirmerId !== callerId) {
        throw confirmationNotFound();
      }
      const request = await tx.request.findUnique({
        where: { id: confirmation.requestId },
        include: requestInclude,
      });
      this.assertOwnerMutable(request, callerId);
      this.assertDistinctParties(
        confirmation.confirmerId,
        confirmation.helperId,
      );
      if (confirmation.outcome !== HELP_OUTCOMES.helped) {
        throw contributionNotEligible();
      }
      if (!confirmation.contribution) {
        throw contributionNotEligible();
      }
      const response = confirmation.responseId
        ? await tx.requestResponse.findUnique({
            where: { id: confirmation.responseId },
            include: responseInclude,
          })
        : null;
      if (!response || response.deletedAt) {
        throw confirmationNotAllowed();
      }
      if (!this.authorIsEligible(response.author)) {
        throw confirmationNotAllowed();
      }
      if (await this.isBlocked(callerId, confirmation.helperId, tx)) {
        throw confirmationNotAllowed();
      }
      const existing = confirmation.contribution.thankYou;
      if (existing) {
        if ((existing.body ?? '') === parsed.body) {
          return existing;
        }
        throw thankYouAlreadyExists();
      }
      try {
        return await tx.thankYouNote.create({
          data: {
            contributionId: confirmation.contribution.id,
            body: parsed.body,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const raced = await tx.thankYouNote.findUnique({
          where: { contributionId: confirmation.contribution.id },
        });
        if (!raced) throw thankYouAlreadyExists();
        if ((raced.body ?? '') === parsed.body) return raced;
        throw thankYouAlreadyExists();
      }
    });
    return {
      thankYou: {
        body: stored.body ?? '',
        createdAt: stored.createdAt.toISOString(),
      },
    };
  }

  toOwnerHelpConfirmation(input: {
    isOwner: boolean;
    responseId: string;
    helperBlocked: boolean;
    helperEligible: boolean;
    requestMutable: boolean;
    responseDeleted: boolean;
    canCreditNonHelped: boolean;
    canCreditHelped: boolean;
    confirmation: {
      id: string;
      outcome: HelpOutcome;
      responseId: string | null;
      hasContribution: boolean;
      hasThankYou: boolean;
    } | null;
  }): OwnerHelpConfirmation | null {
    if (!input.isOwner) return null;
    const helped = input.confirmation?.outcome === HELP_OUTCOMES.helped;
    const canCredit = input.canCreditNonHelped || input.canCreditHelped;
    const canThank = Boolean(
      helped &&
      input.confirmation?.responseId === input.responseId &&
      input.confirmation.hasContribution &&
      !input.confirmation.hasThankYou &&
      input.requestMutable &&
      !input.responseDeleted &&
      input.helperEligible &&
      !input.helperBlocked,
    );
    return {
      id: input.confirmation?.id ?? null,
      outcome: input.confirmation?.outcome ?? null,
      creditedResponseId: input.confirmation?.responseId ?? null,
      canConfirm: !input.confirmation && canCredit,
      canUpdate: Boolean(input.confirmation && !helped && canCredit),
      hasContribution: Boolean(input.confirmation?.hasContribution),
      hasThankYou: Boolean(input.confirmation?.hasThankYou),
      canThank,
    };
  }

  async privateChatEvidence(
    db: Prisma.TransactionClient | PrismaService,
    requestId: string,
    requesterId: string,
    helperId: string,
  ): Promise<{ conversation: boolean; helperMessage: boolean }> {
    const conversations = await db.conversation.findMany({
      where: {
        requestId,
        AND: [
          { participants: { some: { userId: requesterId } } },
          { participants: { some: { userId: helperId } } },
        ],
      },
      select: {
        id: true,
        participants: { select: { userId: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const expected = [requesterId, helperId].sort();
    const match = conversations.find((row) => {
      const ids = row.participants.map((item) => item.userId).sort();
      return (
        ids.length === 2 && ids[0] === expected[0] && ids[1] === expected[1]
      );
    });
    if (!match) return { conversation: false, helperMessage: false };
    const helperMessage = await db.message.findFirst({
      where: {
        conversationId: match.id,
        senderId: helperId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return { conversation: true, helperMessage: Boolean(helperMessage) };
  }

  authorIsEligible(author: StoredResponse['author']): boolean {
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

  toAuthor(author: StoredResponse['author']): MemberRequestAuthor | null {
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

  private async applyExisting(
    tx: Prisma.TransactionClient,
    request: StoredRequest,
    response: StoredResponse,
    existing: StoredConfirmation,
    outcome: HelpOutcome,
    topicIds: string[],
  ): Promise<ConfirmationWrite> {
    this.assertDistinctParties(existing.confirmerId, existing.helperId);
    if (existing.helperId !== response.authorId) {
      throw confirmationNotAllowed();
    }
    if (existing.outcome === HELP_OUTCOMES.helped) {
      const currentTopics = existing.contribution
        ? existing.contribution.topics.map((row) => row.topicId)
        : [];
      if (
        outcome === HELP_OUTCOMES.helped &&
        existing.responseId === response.id &&
        sameTopicSet(currentTopics, topicIds)
      ) {
        if (existing.contribution) return { row: existing, events: [] };
        const repaired = await this.createContribution(
          tx,
          existing.id,
          existing.confirmerId,
          existing.helperId,
          topicIds,
        );
        const reloaded = await tx.helpConfirmation.findUnique({
          where: { id: existing.id },
          include: confirmationInclude,
        });
        if (!reloaded?.contribution) throw confirmationInvalidState();
        return {
          row: reloaded,
          events: repaired.created
            ? [
                contributionCreatedEvent({
                  contributionId: repaired.row.id,
                  helpConfirmationId: existing.id,
                  contributorId: existing.helperId,
                  requestId: request.id,
                  responseType: response.type,
                  topicCount: topicIds.length,
                }),
              ]
            : [],
        };
      }
      throw confirmationInvalidState();
    }
    if (
      outcome !== HELP_OUTCOMES.helped &&
      existing.outcome === outcome &&
      existing.responseId === response.id
    ) {
      return { row: existing, events: [] };
    }
    if (outcome !== HELP_OUTCOMES.helped) {
      const updated = await tx.helpConfirmation.update({
        where: { id: existing.id },
        data: { outcome, responseId: response.id },
        include: confirmationInclude,
      });
      return {
        row: updated,
        events: [
          helpConfirmedEvent({
            helpConfirmationId: updated.id,
            requestId: request.id,
            confirmerId: updated.confirmerId,
            helperId: updated.helperId,
            responseId: response.id,
            outcome,
            responseType: response.type,
          }),
        ],
      };
    }
    const updated = await tx.helpConfirmation.update({
      where: { id: existing.id },
      data: { outcome: HELP_OUTCOMES.helped, responseId: response.id },
      include: confirmationInclude,
    });
    const contribution = await this.createContribution(
      tx,
      updated.id,
      updated.confirmerId,
      updated.helperId,
      topicIds,
    );
    const reloaded = await tx.helpConfirmation.findUnique({
      where: { id: updated.id },
      include: confirmationInclude,
    });
    if (!reloaded?.contribution) throw confirmationInvalidState();
    const events: HelpConfirmationDomainEvent[] = [
      helpConfirmedEvent({
        helpConfirmationId: updated.id,
        requestId: request.id,
        confirmerId: updated.confirmerId,
        helperId: updated.helperId,
        responseId: response.id,
        outcome: HELP_OUTCOMES.helped,
        responseType: response.type,
      }),
    ];
    if (contribution.created) {
      events.push(
        contributionCreatedEvent({
          contributionId: contribution.row.id,
          helpConfirmationId: updated.id,
          contributorId: updated.helperId,
          requestId: request.id,
          responseType: response.type,
          topicCount: topicIds.length,
        }),
      );
    }
    return { row: reloaded, events };
  }

  private async createConfirmation(
    tx: Prisma.TransactionClient,
    request: StoredRequest,
    response: StoredResponse,
    confirmerId: string,
    helperId: string,
    outcome: HelpOutcome,
    topicIds: string[],
  ): Promise<ConfirmationWrite> {
    this.assertDistinctParties(confirmerId, helperId);
    const created = await tx.helpConfirmation.create({
      data: {
        requestId: request.id,
        confirmerId,
        helperId,
        responseId: response.id,
        outcome,
      },
      include: confirmationInclude,
    });
    const events: HelpConfirmationDomainEvent[] = [
      helpConfirmedEvent({
        helpConfirmationId: created.id,
        requestId: request.id,
        confirmerId,
        helperId,
        responseId: response.id,
        outcome,
        responseType: response.type,
      }),
    ];
    if (outcome !== HELP_OUTCOMES.helped) return { row: created, events };
    const contribution = await this.createContribution(
      tx,
      created.id,
      confirmerId,
      helperId,
      topicIds,
    );
    if (contribution.created) {
      events.push(
        contributionCreatedEvent({
          contributionId: contribution.row.id,
          helpConfirmationId: created.id,
          contributorId: helperId,
          requestId: request.id,
          responseType: response.type,
          topicCount: topicIds.length,
        }),
      );
    }
    const reloaded = await tx.helpConfirmation.findUnique({
      where: { id: created.id },
      include: confirmationInclude,
    });
    if (!reloaded?.contribution) {
      throw new ApiError(
        REQUEST_ERROR_CODES.publishFailed,
        'We could not record that contribution. Please try again.',
        HttpStatus.CONFLICT,
      );
    }
    return { row: reloaded, events };
  }

  private async createContribution(
    tx: Prisma.TransactionClient,
    helpConfirmationId: string,
    confirmerId: string,
    contributorId: string,
    topicIds: string[],
  ): Promise<{
    row: { id: string };
    created: boolean;
  }> {
    this.assertDistinctParties(confirmerId, contributorId);
    try {
      const created = await tx.contribution.create({
        data: {
          helpConfirmationId,
          contributorId,
          topics: {
            create: topicIds.map((topicId) => ({ topicId })),
          },
        },
      });
      return { row: created, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await tx.contribution.findUnique({
        where: { helpConfirmationId },
      });
      if (!existing) throw confirmationInvalidState();
      return { row: existing, created: false };
    }
  }

  private async requireCreditable(
    tx: Prisma.TransactionClient,
    request: StoredRequest,
    response: StoredResponse | null,
    confirmerId: string,
    outcome: HelpOutcome,
  ): Promise<StoredResponse> {
    if (!response || response.requestId !== request.id || response.deletedAt) {
      throw confirmationNotAllowed();
    }
    this.assertDistinctParties(confirmerId, response.authorId);
    if (!this.authorIsEligible(response.author)) {
      throw confirmationNotAllowed();
    }
    if (await this.isBlocked(confirmerId, response.authorId, tx)) {
      throw confirmationNotAllowed();
    }
    const allowed = await this.canCredit(tx, request, response, outcome);
    if (!allowed) throw confirmationNotAllowed();
    return response;
  }

  async canCredit(
    tx: Prisma.TransactionClient | PrismaService,
    request: { id: string; authorId: string },
    response: StoredResponse,
    outcome: HelpOutcome,
  ): Promise<boolean> {
    if (response.type === RESPONSE_TYPES.advice) return true;
    if (response.type === RESPONSE_TYPES.introductionOffer) {
      if (!response.introduction) return false;
      if (outcome !== HELP_OUTCOMES.helped) return true;
      return response.introduction.status === INTRODUCTION_STATUSES.introduced;
    }
    if (response.type === RESPONSE_TYPES.privateChatOffer) {
      const evidence = await this.privateChatEvidence(
        tx,
        request.id,
        request.authorId,
        response.authorId,
      );
      if (!evidence.conversation) return false;
      if (outcome !== HELP_OUTCOMES.helped) return true;
      return evidence.helperMessage;
    }
    return false;
  }

  private assertTopicsBelongToRequest(
    request: StoredRequest,
    topicIds: string[],
  ): void {
    const allowed = new Set(request.topics.map((row) => row.topicId));
    if (topicIds.some((id) => !allowed.has(id))) {
      throw confirmationInvalidInput(
        { topicIds: ['Choose topics from this request.'] },
        'Review the help confirmation and try again.',
      );
    }
  }

  private assertOwnerMutable(
    request: StoredRequest | null,
    callerId: string,
  ): asserts request is StoredRequest {
    if (!request) throw requestNotFound();
    if (request.authorId !== callerId) throw requestNotFound();
    if (
      request.status !== REQUEST_STATUSES.published &&
      request.status !== REQUEST_STATUSES.resolved
    ) {
      throw requestNotFound();
    }
  }

  private assertDistinctParties(confirmerId: string, helperId: string): void {
    if (confirmerId === helperId) throw confirmationNotAllowed();
  }

  private toMemberConfirmation(
    row: StoredConfirmation,
    request: StoredRequest,
    blocked: boolean,
  ): MemberHelpConfirmation {
    const helperEligible = this.authorIsEligible(row.helper);
    const responseDeleted = Boolean(row.response?.deletedAt);
    const requestMutable =
      request.status === REQUEST_STATUSES.published ||
      request.status === REQUEST_STATUSES.resolved;
    return {
      id: row.id,
      requestId: row.requestId,
      outcome: row.outcome,
      creditedResponseId: row.responseId,
      helper: this.toAuthor(row.helper),
      topicIds: row.contribution
        ? row.contribution.topics.map((item) => item.topicId)
        : [],
      hasContribution: Boolean(row.contribution),
      hasThankYou: Boolean(row.contribution?.thankYou),
      canThank: Boolean(
        row.outcome === HELP_OUTCOMES.helped &&
        row.contribution &&
        !row.contribution.thankYou &&
        requestMutable &&
        !responseDeleted &&
        helperEligible &&
        !blocked,
      ),
    };
  }

  async isBlocked(
    leftId: string,
    rightId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    if (leftId === rightId) return false;
    const row = await tx.block.findFirst({
      where: {
        OR: [
          { blockerId: leftId, blockedId: rightId },
          { blockerId: rightId, blockedId: leftId },
        ],
      },
      select: { blockerId: true },
    });
    return Boolean(row);
  }
}
