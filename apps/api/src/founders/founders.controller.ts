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
  DiscoverFoundersResponse,
  MemberFounderProfileResponse,
  SavedFounderMutationResponse,
  SavedFoundersResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { requireActiveMember } from '../onboarding/onboarding-access.js';
import { FoundersService } from './founders.service.js';

@Controller()
export class FoundersController {
  constructor(
    @Inject(FoundersService)
    private readonly founders: FoundersService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Get('founders')
  async list(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<DiscoverFoundersResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.founders.list(principal.user.id, query);
  }

  @Get('founders/:id')
  async getProfile(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<MemberFounderProfileResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.founders.getProfile(principal.user.id, id);
  }

  @Post('founders/:id/save')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async save(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<SavedFounderMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.founders.save(principal.user.id, id, body);
  }

  @Delete('founders/:id/save')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async unsave(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<SavedFounderMutationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.founders.unsave(principal.user.id, id, body);
  }

  @Get('me/saved-founders')
  async listSaved(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<SavedFoundersResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.founders.listSaved(principal.user.id, query);
  }
}
