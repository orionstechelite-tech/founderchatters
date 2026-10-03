import {
  Body,
  Controller,
  Delete,
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
  BlockedFoundersResponse,
  BlockMutationResponse,
  MemberReportCreatedResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { requireActiveMember } from '../onboarding/onboarding-access.js';
import { parseEmptyBody } from './safety-input.js';
import { SafetyService } from './safety.service.js';

@Controller()
export class SafetyController {
  constructor(
    @Inject(SafetyService)
    private readonly safety: SafetyService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Post('reports')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async createReport(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<MemberReportCreatedResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.safety.createReport(principal.user.id, body);
  }

  @Get('me/blocks')
  async listBlocks(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<BlockedFoundersResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.safety.listBlocks(principal.user.id, query);
  }

  @Post('me/blocks/:userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async block(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ): Promise<BlockMutationResponse> {
    parseEmptyBody(body);
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.safety.block(principal.user.id, userId);
  }

  @Delete('me/blocks/:userId')
  @UseGuards(OriginGuard)
  async unblock(
    @Req() request: Request,
    @Param('userId') userId: string,
  ): Promise<BlockMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.safety.unblock(principal.user.id, userId);
  }
}
