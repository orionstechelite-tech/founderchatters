import {
  Body,
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
import type {
  HelpResponseMutationResponse,
  MemberHelpResponsesResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { requireActiveMember } from '../onboarding/onboarding-access.js';
import { HelpResponsesService } from './help-responses.service.js';

@Controller('requests')
export class HelpResponsesController {
  constructor(
    @Inject(HelpResponsesService)
    private readonly help: HelpResponsesService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Get(':id/responses')
  async list(
    @Req() request: Request,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<MemberHelpResponsesResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.help.list(principal.user.id, id, query);
  }

  @Post(':id/responses/advice')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OriginGuard)
  async advice(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.help.createAdvice(principal.user.id, id, body);
  }

  @Post(':id/responses/introduction')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OriginGuard)
  async introduction(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.help.createIntroduction(principal.user.id, id, body);
  }

  @Post(':id/responses/private-chat')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OriginGuard)
  async privateChat(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.help.createPrivateChat(principal.user.id, id, body);
  }
}
