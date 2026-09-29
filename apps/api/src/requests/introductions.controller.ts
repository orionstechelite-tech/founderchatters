import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { HelpResponseMutationResponse } from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { requireActiveMember } from '../onboarding/onboarding-access.js';
import { HelpResponsesService } from './help-responses.service.js';

@Controller('introductions')
export class IntroductionsController {
  constructor(
    @Inject(HelpResponsesService)
    private readonly help: HelpResponsesService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Post(':id/consent')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async consent(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.help.consent(principal.user.id, id, body);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async decline(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.help.decline(principal.user.id, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async cancel(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<HelpResponseMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.help.cancel(principal.user.id, id, body);
  }
}
