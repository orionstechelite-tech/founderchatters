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
  ConversationCreatedResponse,
  MemberConversationResponse,
  MemberConversationsResponse,
  MemberMessagesResponse,
  MessageSentResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { requireActiveMember } from '../onboarding/onboarding-access.js';
import { ConversationsService } from './conversations.service.js';

@Controller('conversations')
export class ConversationsController {
  constructor(
    @Inject(ConversationsService)
    private readonly conversations: ConversationsService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<MemberConversationsResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.conversations.list(principal.user.id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OriginGuard)
  async create(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<ConversationCreatedResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.conversations.create(principal.user.id, body);
  }

  @Get(':id')
  async get(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<MemberConversationResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.conversations.get(principal.user.id, id);
  }

  @Get(':id/messages')
  async messages(
    @Req() request: Request,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<MemberMessagesResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.conversations.listMessages(principal.user.id, id, query);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OriginGuard)
  async send(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MessageSentResponse> {
    const principal = await requireActiveMember(
      request,
      this.sessions,
      this.config,
    );
    return this.conversations.sendMessage(principal.user.id, id, body);
  }
}
