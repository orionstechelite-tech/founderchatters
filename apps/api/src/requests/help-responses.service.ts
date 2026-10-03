import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  INTRODUCTION_STATUSES,
  NOTIFICATION_TYPES,
  REQUEST_ERROR_CODES,
  REQUEST_STATUSES,
  RESPONSE_TYPES,
  type HelpResponseIntroduction,
  type HelpResponseMutationResponse,
  type IntroductionStatus,
  type MemberHelpResponse,
  type MemberHelpResponsesResponse,
  type MemberRequestAuthor,
  type OwnerHelpConfirmation,
  type HelpOutcome,
  type ResponseType,
} from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import {
  deletedFounderSummary,
  isDeletedAccount,
} from '../identity/deleted-founder.js';
import { areMembersBlocked } from '../safety/block-access.js';
import { NotificationWriterService } from '../notifications/notification-writer.service.js';
import {
  helpNotAllowed,
  introductionInvalidState,
  introductionNotFound,
  parseAdviceBody,
  parseHelpResponsesQuery,
  parseIntroductionBody,
  parseIntroductionId,
  parsePrivateChatBody,
} from './help-responses-query.js';
import {
  lockIntroductionOffer,
  lockRequest,
  withRequestRowRetry,
} from './request-locks.js';
import { parseRequestId, requestNotFound } from './requests-query.js';
import { HelpConfirmationsService } from './help-confirmations.service.js';

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

const requestVisibilityInclude = {
  author: { select: authorSelect },
} as const;

const responseInclude = {
  author: { select: authorSelect },
  introduction: true,
} as const;

type StoredRequest = Prisma.RequestGetPayload<{
  include: typeof requestVisibilityInclude;
}>;

type StoredResponse = Prisma.RequestResponseGetPayload<{
  include: typeof responseInclude;
}>;

type IntroAction = 'consent' | 'decline' | 'cancel';

@Injectable()
export class HelpResponsesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(HelpConfirmationsService)
    private readonly confirmations: HelpConfirmationsService,
    @Inject(NotificationWriterService)
    private readonly notifications: NotificationWriterService,
  ) {}

  async list(
    callerId: string,
    rawId: unknown,
    query: Record<string, unknown>,
  ): Promise<MemberHelpResponsesResponse> {
    const id = parseRequestId(rawId);
    const parsed = parseHelpResponsesQuery(query);
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: requestVisibilityInclude,
    });
    this.assertHistoryVisible(request, callerId);
    const isOwner = request!.authorId === callerId;
    const blocked = await this.isBlocked(callerId, request!.authorId);
    const [total, rows, viewerRows] = await Promise.all([
      this.prisma.requestResponse.count({
        where: { requestId: id, deletedAt: null },
      }),
      this.prisma.requestResponse.findMany({
        where: { requestId: id, deletedAt: null },
        include: responseInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
      }),
      this.prisma.requestResponse.findMany({
        where: { requestId: id, authorId: callerId },
        select: { type: true },
      }),
    ]);
    const viewerResponseTypes = uniqueTypes(viewerRows.map((row) => row.type));
    const helperBlocked = new Map<string, boolean>();
    for (const row of rows) {
      if (!helperBlocked.has(row.authorId)) {
        helperBlocked.set(
          row.authorId,
          await this.isBlocked(request!.authorId, row.authorId),
        );
      }
    }
    const conversationByHelper = await this.privateChatConversations(
      id,
      callerId,
      request!.authorId,
      isOwner,
      rows,
    );
    const confirmationByHelper = isOwner
      ? await this.ownerConfirmations(id, callerId, rows)
      : new Map();
    const helperMessageByHelper = isOwner
      ? await this.helperMessageFlags(id, request!.authorId, rows)
      : new Map<string, boolean>();
    const requestMutable =
      request!.status === REQUEST_STATUSES.published ||
      request!.status === REQUEST_STATUSES.resolved;
    return {
      responses: rows.map((row) =>
        this.toMemberResponse(
          row,
          callerId,
          isOwner,
          helperBlocked.get(row.authorId) ?? false,
          conversationByHelper.get(row.authorId) ?? null,
          this.ownerConfirmationForRow(
            isOwner,
            row,
            confirmationByHelper.get(row.authorId) ?? null,
            helperBlocked.get(row.authorId) ?? false,
            helperMessageByHelper.get(row.authorId) ?? false,
            requestMutable,
            Boolean(conversationByHelper.get(row.authorId)),
          ),
        ),
      ),
      page: parsed.page,
      pageSize: parsed.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.pageSize)),
      viewerResponseTypes,
      canOfferHelp:
        !isOwner &&
        request!.status === REQUEST_STATUSES.published &&
        !blocked &&
        viewerResponseTypes.length < 3,
    };
  }

  async createAdvice(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    return this.createResponse(callerId, rawId, RESPONSE_TYPES.advice, body);
  }

  async createIntroduction(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    return this.createResponse(
      callerId,
      rawId,
      RESPONSE_TYPES.introductionOffer,
      body,
    );
  }

  async createPrivateChat(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    return this.createResponse(
      callerId,
      rawId,
      RESPONSE_TYPES.privateChatOffer,
      body,
    );
  }

  async consent(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    parsePrivateChatBody(body);
    return this.mutateIntroduction(callerId, rawId, 'consent');
  }

  async decline(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    parsePrivateChatBody(body);
    return this.mutateIntroduction(callerId, rawId, 'decline');
  }

  async cancel(
    callerId: string,
    rawId: unknown,
    body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    parsePrivateChatBody(body);
    return this.mutateIntroduction(callerId, rawId, 'cancel');
  }

  private async createResponse(
    callerId: string,
    rawId: unknown,
    type: ResponseType,
    body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    const id = parseRequestId(rawId);
    const preview = await this.prisma.request.findUnique({
      where: { id },
      include: requestVisibilityInclude,
    });
    this.assertCreateVisible(preview, callerId);
    const stored = await withRequestRowRetry(this.prisma, async (tx) => {
      await lockRequest(tx, id);
      const request = await tx.request.findUnique({
        where: { id },
        include: requestVisibilityInclude,
      });
      this.assertCreateVisible(request, callerId);
      if (request!.status !== REQUEST_STATUSES.published) {
        throw invalidRequestState();
      }
      if (request!.authorId === callerId) {
        throw helpNotAllowed();
      }
      if (await this.isBlocked(callerId, request!.authorId, tx)) {
        throw helpNotAllowed();
      }
      const existing = await tx.requestResponse.findFirst({
        where: { requestId: id, authorId: callerId, type },
        include: responseInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (existing) return existing;

      let adviceBody: string | null = null;
      let personName: string | undefined;
      let reason: string | null = null;
      if (type === RESPONSE_TYPES.advice) {
        adviceBody = parseAdviceBody(body).body;
      } else if (type === RESPONSE_TYPES.introductionOffer) {
        const parsed = parseIntroductionBody(body);
        personName = parsed.personName;
        reason = parsed.reason ?? null;
      } else {
        parsePrivateChatBody(body);
      }

      const created = await tx.requestResponse.create({
        data: {
          requestId: id,
          authorId: callerId,
          type,
          body: adviceBody,
          ...(type === RESPONSE_TYPES.introductionOffer
            ? {
                introduction: {
                  create: {
                    personName: personName as string,
                    reason,
                    status: INTRODUCTION_STATUSES.consentPending,
                  },
                },
              }
            : {}),
        },
        include: responseInclude,
      });

      const actorName =
        created.author.profile?.displayName?.trim() || 'A founder';

      if (type === RESPONSE_TYPES.advice) {
        await this.notifications.create(
          {
            userId: request!.authorId,
            type: NOTIFICATION_TYPES.requestAdvice,
            title: 'New public advice',
            body: `${actorName} responded to your request.`,
            href: `/requests/${id}`,
          },
          tx,
        );
      } else if (type === RESPONSE_TYPES.privateChatOffer) {
        await this.notifications.create(
          {
            userId: request!.authorId,
            type: NOTIFICATION_TYPES.privateHelpOffer,
            title: 'Private help offered',
            body: `${actorName} offered to help privately.`,
            href: `/requests/${id}`,
          },
          tx,
        );
      } else if (type === RESPONSE_TYPES.introductionOffer) {
        await this.notifications.create(
          {
            userId: request!.authorId,
            type: NOTIFICATION_TYPES.introductionOffered,
            title: 'Introduction offered',
            body: `${actorName} offered an introduction.`,
            href: `/requests/${id}`,
          },
          tx,
        );
      }

      return created;
    });
    return {
      response: this.toMemberResponse(
        stored,
        callerId,
        false,
        false,
        null,
        null,
      ),
    };
  }

  private async mutateIntroduction(
    callerId: string,
    rawId: unknown,
    action: IntroAction,
  ): Promise<HelpResponseMutationResponse> {
    const id = parseIntroductionId(rawId);
    // Authorize owner/helper and reject deleted responses before locking
    // the parent Request, so guessed ids cannot lock foreign rows.
    const preview = await this.prisma.introductionOffer.findUnique({
      where: { id },
      select: {
        id: true,
        response: {
          select: {
            requestId: true,
            authorId: true,
            deletedAt: true,
            request: { select: { authorId: true } },
          },
        },
      },
    });
    if (!preview || preview.response.deletedAt) throw introductionNotFound();
    const previewOwner = preview.response.request.authorId === callerId;
    const previewHelper = preview.response.authorId === callerId;
    if (!previewOwner && !previewHelper) throw introductionNotFound();

    const stored = await withRequestRowRetry(this.prisma, async (tx) => {
      await lockRequest(tx, preview.response.requestId);
      await lockIntroductionOffer(tx, preview.id);
      const current = await tx.introductionOffer.findUnique({
        where: { id: preview.id },
        include: {
          response: {
            include: {
              ...responseInclude,
              request: { include: requestVisibilityInclude },
            },
          },
        },
      });
      if (!current || current.response.deletedAt) throw introductionNotFound();
      const request = current.response.request;
      this.assertIntroRequestVisible(request, callerId);
      const isOwner = request.authorId === callerId;
      const isHelper = current.response.authorId === callerId;
      const blockedWithHelper = await this.isBlocked(
        request.authorId,
        current.response.authorId,
        tx,
      );

      if (action === 'consent') {
        if (!isOwner) throw introductionNotFound();
        if (current.status === INTRODUCTION_STATUSES.introduced) {
          return current.response;
        }
        if (blockedWithHelper) throw helpNotAllowed();
        if (current.status !== INTRODUCTION_STATUSES.consentPending) {
          throw introductionInvalidState();
        }
        const now = new Date();
        await tx.introductionOffer.update({
          where: { id: current.id },
          data: {
            status: INTRODUCTION_STATUSES.introduced,
            consentedAt: now,
            introducedAt: now,
          },
        });

        const requesterName =
          request.author.profile?.displayName?.trim() || 'A founder';

        await this.notifications.create(
          {
            userId: current.response.authorId,
            type: NOTIFICATION_TYPES.introductionAccepted,
            title: 'Introduction accepted',
            body: `${requesterName} accepted your introduction offer.`,
            href: `/requests/${request.id}`,
          },
          tx,
        );
      } else if (action === 'decline') {
        if (!isOwner) throw introductionNotFound();
        if (current.status === INTRODUCTION_STATUSES.declined) {
          return current.response;
        }
        if (current.status !== INTRODUCTION_STATUSES.consentPending) {
          throw introductionInvalidState();
        }
        await tx.introductionOffer.update({
          where: { id: current.id },
          data: { status: INTRODUCTION_STATUSES.declined },
        });
      } else {
        if (!isHelper) throw introductionNotFound();
        if (current.status === INTRODUCTION_STATUSES.cancelled) {
          return current.response;
        }
        if (
          current.status !== INTRODUCTION_STATUSES.consentPending &&
          current.status !== INTRODUCTION_STATUSES.offered
        ) {
          throw introductionInvalidState();
        }
        await tx.introductionOffer.update({
          where: { id: current.id },
          data: { status: INTRODUCTION_STATUSES.cancelled },
        });
      }

      const updated = await tx.requestResponse.findUnique({
        where: { id: current.response.id },
        include: responseInclude,
      });
      if (!updated) throw introductionNotFound();
      return updated;
    });
    const request = await this.prisma.request.findUnique({
      where: { id: stored.requestId },
      select: { authorId: true },
    });
    const isOwner = request?.authorId === callerId;
    const blocked = request
      ? await this.isBlocked(request.authorId, stored.authorId)
      : false;
    return {
      response: this.toMemberResponse(
        stored,
        callerId,
        Boolean(isOwner),
        blocked,
        null,
        null,
      ),
    };
  }

  private assertHistoryVisible(
    request: StoredRequest | null,
    callerId: string,
  ): asserts request is StoredRequest {
    if (!request) throw requestNotFound();
    const isOwner = request.authorId === callerId;
    if (
      request.status === REQUEST_STATUSES.deletedByAuthor ||
      request.status === REQUEST_STATUSES.moderatedRemoved ||
      request.status === REQUEST_STATUSES.draft
    ) {
      throw requestNotFound();
    }
    if (
      request.status !== REQUEST_STATUSES.published &&
      request.status !== REQUEST_STATUSES.resolved
    ) {
      throw requestNotFound();
    }
    if (
      !isOwner &&
      !this.authorIsEligible(request.author) &&
      !isDeletedAccount(request.author)
    ) {
      throw requestNotFound();
    }
  }

  private assertCreateVisible(
    request: StoredRequest | null,
    callerId: string,
  ): asserts request is StoredRequest {
    if (!request) throw requestNotFound();
    const isOwner = request.authorId === callerId;
    if (
      request.status === REQUEST_STATUSES.deletedByAuthor ||
      request.status === REQUEST_STATUSES.moderatedRemoved
    ) {
      throw requestNotFound();
    }
    if (request.status === REQUEST_STATUSES.draft && !isOwner) {
      throw requestNotFound();
    }
    if (!isOwner && !this.authorIsEligible(request.author)) {
      throw requestNotFound();
    }
  }

  private assertIntroRequestVisible(
    request: StoredRequest,
    callerId: string,
  ): void {
    const isOwner = request.authorId === callerId;
    if (
      request.status === REQUEST_STATUSES.deletedByAuthor ||
      request.status === REQUEST_STATUSES.moderatedRemoved ||
      request.status === REQUEST_STATUSES.draft
    ) {
      throw introductionNotFound();
    }
    if (
      request.status !== REQUEST_STATUSES.published &&
      request.status !== REQUEST_STATUSES.resolved
    ) {
      throw introductionNotFound();
    }
    if (!isOwner && !this.authorIsEligible(request.author)) {
      throw introductionNotFound();
    }
  }

  private async isBlocked(
    leftId: string,
    rightId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    return areMembersBlocked(tx, leftId, rightId);
  }

  private async ownerConfirmations(
    requestId: string,
    confirmerId: string,
    rows: StoredResponse[],
  ): Promise<
    Map<
      string,
      {
        id: string;
        outcome: HelpOutcome;
        responseId: string | null;
        hasContribution: boolean;
        hasThankYou: boolean;
      }
    >
  > {
    const helperIds = [...new Set(rows.map((row) => row.authorId))];
    if (helperIds.length === 0) return new Map();
    const rowsFound = await this.prisma.helpConfirmation.findMany({
      where: {
        requestId,
        confirmerId,
        helperId: { in: helperIds },
      },
      include: {
        contribution: { include: { thankYou: true } },
      },
    });
    const map = new Map<
      string,
      {
        id: string;
        outcome: HelpOutcome;
        responseId: string | null;
        hasContribution: boolean;
        hasThankYou: boolean;
      }
    >();
    for (const row of rowsFound) {
      map.set(row.helperId, {
        id: row.id,
        outcome: row.outcome,
        responseId: row.responseId,
        hasContribution: Boolean(row.contribution),
        hasThankYou: Boolean(row.contribution?.thankYou),
      });
    }
    return map;
  }

  private async helperMessageFlags(
    requestId: string,
    requesterId: string,
    rows: StoredResponse[],
  ): Promise<Map<string, boolean>> {
    const flags = new Map<string, boolean>();
    const helpers = rows
      .filter((row) => row.type === RESPONSE_TYPES.privateChatOffer)
      .map((row) => row.authorId);
    for (const helperId of helpers) {
      if (flags.has(helperId)) continue;
      const evidence = await this.confirmations.privateChatEvidence(
        this.prisma,
        requestId,
        requesterId,
        helperId,
      );
      flags.set(helperId, evidence.helperMessage);
    }
    return flags;
  }

  private ownerConfirmationForRow(
    isOwner: boolean,
    row: StoredResponse,
    confirmation: {
      id: string;
      outcome: HelpOutcome;
      responseId: string | null;
      hasContribution: boolean;
      hasThankYou: boolean;
    } | null,
    helperBlocked: boolean,
    helperMessage: boolean,
    requestMutable: boolean,
    hasConversation: boolean,
  ): OwnerHelpConfirmation | null {
    const helperEligible = this.authorIsEligible(row.author);
    const canCreditNonHelped =
      requestMutable &&
      helperEligible &&
      !helperBlocked &&
      row.deletedAt === null &&
      (row.type === RESPONSE_TYPES.advice ||
        (row.type === RESPONSE_TYPES.introductionOffer &&
          Boolean(row.introduction)) ||
        (row.type === RESPONSE_TYPES.privateChatOffer && hasConversation));
    const canCreditHelped =
      canCreditNonHelped &&
      (row.type !== RESPONSE_TYPES.introductionOffer ||
        row.introduction?.status === INTRODUCTION_STATUSES.introduced) &&
      (row.type !== RESPONSE_TYPES.privateChatOffer || helperMessage);
    return this.confirmations.toOwnerHelpConfirmation({
      isOwner,
      responseId: row.id,
      helperBlocked,
      helperEligible,
      requestMutable,
      responseDeleted: row.deletedAt !== null,
      canCreditNonHelped,
      canCreditHelped,
      confirmation,
    });
  }

  private async privateChatConversations(
    requestId: string,
    callerId: string,
    requesterId: string,
    isOwner: boolean,
    rows: StoredResponse[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const needsMeta = rows.some(
      (row) =>
        row.type === RESPONSE_TYPES.privateChatOffer &&
        (isOwner || row.authorId === callerId),
    );
    if (!needsMeta) return map;
    const conversations = await this.prisma.conversation.findMany({
      where: {
        requestId,
        participants: { some: { userId: callerId } },
      },
      include: { participants: { select: { userId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    for (const conversation of conversations) {
      const ids = conversation.participants.map((row) => row.userId);
      if (ids.length !== 2 || !ids.includes(requesterId)) continue;
      const helperId = ids.find((id) => id !== requesterId);
      if (helperId && !map.has(helperId)) {
        map.set(helperId, conversation.id);
      }
    }
    return map;
  }

  private toMemberResponse(
    row: StoredResponse,
    callerId: string,
    isRequestOwner: boolean,
    blocked: boolean,
    conversationId: string | null,
    helpConfirmation: OwnerHelpConfirmation | null,
  ): MemberHelpResponse {
    const isHelper = row.authorId === callerId;
    const roleSafe = isRequestOwner || isHelper;
    return {
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      author: this.toAuthor(row.author),
      body: row.type === RESPONSE_TYPES.advice ? (row.body ?? '') : null,
      introduction: this.toIntroduction(row, isRequestOwner, isHelper, blocked),
      privateChat:
        row.type === RESPONSE_TYPES.privateChatOffer && roleSafe
          ? {
              conversationId,
              canStart: isRequestOwner && conversationId === null,
              canOpen: conversationId !== null,
            }
          : null,
      helpConfirmation: isRequestOwner ? helpConfirmation : null,
    };
  }

  private toIntroduction(
    row: StoredResponse,
    isRequestOwner: boolean,
    isHelper: boolean,
    blocked: boolean,
  ): HelpResponseIntroduction | null {
    if (row.type !== RESPONSE_TYPES.introductionOffer || !row.introduction) {
      return null;
    }
    if (!isRequestOwner && !isHelper) return null;
    const status = row.introduction.status as IntroductionStatus;
    const pending = status === INTRODUCTION_STATUSES.consentPending;
    const offered = status === INTRODUCTION_STATUSES.offered;
    return {
      id: row.introduction.id,
      status,
      personName: isHelper
        ? row.introduction.personName
        : status === INTRODUCTION_STATUSES.introduced
          ? row.introduction.personName
          : null,
      reason: row.introduction.reason,
      canConsent: isRequestOwner && pending && !blocked,
      canDecline: isRequestOwner && pending,
      canCancel: isHelper && (pending || offered),
    };
  }

  private toAuthor(
    author: StoredResponse['author'],
  ): MemberRequestAuthor | null {
    if (isDeletedAccount(author)) return deletedFounderSummary(author.id);
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
}

function uniqueTypes(types: ResponseType[]): ResponseType[] {
  return [...new Set(types)];
}

function invalidRequestState(): ApiError {
  return new ApiError(
    REQUEST_ERROR_CODES.invalidState,
    'This request cannot accept help responses.',
    HttpStatus.CONFLICT,
  );
}
