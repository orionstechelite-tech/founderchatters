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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  MemberRequestResponse,
  OwnRequestsResponse,
  RequestDeletedResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { requireActiveMember } from '../onboarding/onboarding-access.js';
import { RequestsService } from './requests.service.js';

@Controller('requests')
export class RequestsController {
  constructor(
    @Inject(RequestsService)
    private readonly requests: RequestsService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<OwnRequestsResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.requests.listOwn(principal.user.id, query);
  }

  @Get(':id')
  async getById(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<MemberRequestResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.requests.getById(principal.user.id, id);
  }

  @Post()
  @UseGuards(OriginGuard)
  async create(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<MemberRequestResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.requests.create(principal.user.id, body);
  }

  @Patch(':id')
  @UseGuards(OriginGuard)
  async patch(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MemberRequestResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.requests.patch(principal.user.id, id, body);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async publish(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MemberRequestResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.requests.publish(principal.user.id, id, body);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async resolve(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MemberRequestResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.requests.resolve(principal.user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async remove(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<RequestDeletedResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.requests.remove(principal.user.id, id, body);
  }
}
