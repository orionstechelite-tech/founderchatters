import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_ERROR_CODES,
  type CreatePublicSupportCaseResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import type { Prisma } from '../../../../generated/prisma/client.js';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';
import { isDeletedAccount } from '../identity/deleted-founder.js';
import { lockUser } from '../requests/request-locks.js';
import { parsePublicSupportBody } from './public-support-input.js';
import { PublicSupportRateLimiter } from './public-support-rate-limiter.js';

type SupportActor = {
  userId: string | null;
  email: string;
  actorType: 'USER' | 'GUEST';
  actorId: string | null;
};

type SessionCandidate = {
  id: string;
  email: string;
};

@Injectable()
export class PublicSupportService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(PublicSupportRateLimiter)
    private readonly rateLimiter: PublicSupportRateLimiter,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  async create(
    body: unknown,
    request: Request,
  ): Promise<CreatePublicSupportCaseResponse> {
    const input = parsePublicSupportBody(body);
    await this.rateLimiter.checkClient(this.clientIp(request));
    const candidate = await this.optionalAccount(request);
    await this.rateLimiter.checkEmail(candidate?.email ?? input.email);

    return this.prisma.$transaction(async (tx) => {
      const actor = await this.resolveActor(tx, candidate, input.email);
      const created = await tx.supportCase.create({
        data: {
          status: 'OPEN',
          category: input.category,
          subject: input.subject,
          email: actor.email,
          userId: actor.userId,
        },
        select: { id: true, status: true },
      });
      await tx.supportMessage.create({
        data: {
          caseId: created.id,
          actorType: actor.actorType,
          actorId: actor.actorId,
          body: input.message,
        },
      });
      return { caseId: created.id, status: 'OPEN' as const };
    });
  }

  private async optionalAccount(
    request: Request,
  ): Promise<SessionCandidate | null> {
    const cookie = this.readSessionCookie(request);
    if (!cookie) return null;
    try {
      const session = await this.sessions.inspect(cookie);
      return { id: session.user.id, email: session.user.email };
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === AUTH_ERROR_CODES.sessionExpired
      ) {
        return null;
      }
      throw error;
    }
  }

  private async resolveActor(
    tx: Prisma.TransactionClient,
    candidate: SessionCandidate | null,
    submittedEmail: string,
  ): Promise<SupportActor> {
    if (!candidate) {
      return {
        userId: null,
        email: submittedEmail,
        actorType: 'GUEST',
        actorId: null,
      };
    }

    await lockUser(tx, candidate.id);
    const current = await tx.user.findUnique({
      where: { id: candidate.id },
      select: { id: true, email: true, status: true, deletedAt: true },
    });
    if (!current || isDeletedAccount(current)) {
      return {
        userId: null,
        email: submittedEmail,
        actorType: 'GUEST',
        actorId: null,
      };
    }
    return {
      userId: current.id,
      email: current.email,
      actorType: 'USER',
      actorId: current.id,
    };
  }

  private clientIp(request: Request): string {
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private readSessionCookie(request: Request): string | undefined {
    const header = request.header('cookie');
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;
      const name = part.slice(0, separator).trim();
      if (name === this.config.sessionCookieName) {
        return part.slice(separator + 1).trim();
      }
    }
    return undefined;
  }
}
