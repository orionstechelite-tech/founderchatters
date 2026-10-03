import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type MarkAllNotificationsReadResponse,
  type MarkNotificationReadResponse,
  type MemberNotificationsResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<MemberNotificationsResponse> {
    const userId = await this.authenticatedUserId(request);
    return this.notifications.list(userId, query);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async markRead(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<MarkNotificationReadResponse> {
    const userId = await this.authenticatedUserId(request);
    return this.notifications.markRead(userId, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async markAllRead(
    @Req() request: Request,
  ): Promise<MarkAllNotificationsReadResponse> {
    const userId = await this.authenticatedUserId(request);
    return this.notifications.markAllRead(userId);
  }

  private async authenticatedUserId(request: Request): Promise<string> {
    const principal = await this.sessions.authenticate(
      this.readSessionCookie(request),
    );
    return principal.user.id;
  }

  private readSessionCookie(request: Request): string | undefined {
    const header = request.header('cookie');
    if (!header) return undefined;

    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;

      if (part.slice(0, separator).trim() === this.config.sessionCookieName) {
        return part.slice(separator + 1).trim();
      }
    }

    return undefined;
  }
}
