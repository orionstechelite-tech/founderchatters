import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { MemberReputationResponse } from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { requireActiveMember } from '../onboarding/onboarding-access.js';
import { ReputationService } from './reputation.service.js';

@Controller()
export class ReputationController {
  constructor(
    @Inject(ReputationService)
    private readonly reputation: ReputationService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Get('me/reputation')
  async mine(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<MemberReputationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.reputation.getMine(principal.user.id, query);
  }

  @Get('founders/:id/reputation')
  async founder(
    @Req() request: Request,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<MemberReputationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.reputation.getFounder(principal.user.id, id, query);
  }
}
