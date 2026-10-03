import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type {
  ChangePasswordResponse,
  MemberAccountSettingsResponse,
  MemberProfileSettingsResponse,
  MemberSessionsResponse,
  OtherSessionsRevokedResponse,
  SessionRevokedResponse,
} from '@founderchatters/contracts';
import type { Request, Response } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { requireActiveMember } from '../onboarding/onboarding-access.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { SettingsService } from './settings.service.js';

@Controller('me')
export class SettingsController {
  constructor(
    @Inject(SettingsService)
    private readonly settings: SettingsService,
    @Inject(AccountDeletionService)
    private readonly deletion: AccountDeletionService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Get('settings/profile')
  async getProfile(
    @Req() request: Request,
  ): Promise<MemberProfileSettingsResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );

    return this.settings.getProfile(principal.user.id);
  }

  @Patch('settings/profile')
  @UseGuards(OriginGuard)
  async updateProfile(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<MemberProfileSettingsResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );

    return this.settings.updateProfile(principal.user.id, body);
  }

  @Get('settings/account')
  async getAccount(
    @Req() request: Request,
  ): Promise<MemberAccountSettingsResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );

    return {
      account: {
        email: principal.user.email,
        emailVerified: Boolean(principal.user.emailVerifiedAt),
        status: principal.user.status,
      },
    };
  }

  @Get('sessions')
  async listSessions(@Req() request: Request): Promise<MemberSessionsResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );

    return this.settings.listSessions(principal.user.id, principal.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(OriginGuard)
  async revokeSession(
    @Req() request: Request,
    @Param('id') sessionId: string,
  ): Promise<SessionRevokedResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );

    return this.settings.revokeSession(
      principal.user.id,
      principal.sessionId,
      sessionId,
    );
  }

  @Post('sessions/revoke-others')
  @UseGuards(OriginGuard)
  async revokeOtherSessions(
    @Req() request: Request,
  ): Promise<OtherSessionsRevokedResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );

    return this.settings.revokeOtherSessions(
      principal.user.id,
      principal.sessionId,
    );
  }

  @Post('password')
  @UseGuards(OriginGuard)
  async changePassword(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<ChangePasswordResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );

    return this.settings.changePassword(
      principal.user.id,
      principal.sessionId,
      body,
    );
  }

  @Post('account/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OriginGuard)
  async deleteAccount(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    await this.deletion.deleteAccount(principal.user.id, body);
    response.cookie(
      this.config.sessionCookieName,
      '',
      this.sessions.clearCookieOptions(),
    );
  }
}
