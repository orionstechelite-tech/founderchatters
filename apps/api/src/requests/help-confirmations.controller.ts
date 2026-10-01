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
import type {
  HelpConfirmationMutationResponse,
  ThankYouMutationResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { requireActiveMember } from '../onboarding/onboarding-access.js';
import { HelpConfirmationsService } from './help-confirmations.service.js';

@Controller()
export class HelpConfirmationsController {
  constructor(
    @Inject(HelpConfirmationsService)
    private readonly confirmations: HelpConfirmationsService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Post('requests/:requestId/help-confirmations')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async confirm(
    @Req() request: Request,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
  ): Promise<HelpConfirmationMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.confirmations.confirm(principal.user.id, requestId, body);
  }

  @Post('help-confirmations/:id/thank-you')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async thankYou(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ThankYouMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.confirmations.thankYou(principal.user.id, id, body);
  }
}
