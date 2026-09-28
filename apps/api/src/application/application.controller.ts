import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AUTH_ERROR_CODES,
  type FounderApplicationResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { ApiError } from '../http/api-error.js';
import { OriginGuard } from '../http/origin.guard.js';
import { ApplicationService } from './application.service.js';

@Controller('application')
export class ApplicationController {
  constructor(
    @Inject(ApplicationService)
    private readonly applications: ApplicationService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Get('me')
  async getMine(@Req() request: Request): Promise<FounderApplicationResponse> {
    const userId = await this.authenticatedFounderId(request);
    return this.applications.get(userId);
  }

  @Put('me')
  @UseGuards(OriginGuard)
  async updateMine(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<FounderApplicationResponse> {
    const userId = await this.authenticatedFounderId(request);
    return this.applications.update(userId, body);
  }

  @Post('me/submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async submitMine(
    @Req() request: Request,
  ): Promise<FounderApplicationResponse> {
    const userId = await this.authenticatedFounderId(request);
    return this.applications.submit(userId);
  }

  @Post('me/resubmit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async resubmitMine(
    @Req() request: Request,
  ): Promise<FounderApplicationResponse> {
    const userId = await this.authenticatedFounderId(request);
    return this.applications.resubmit(userId);
  }

  private async authenticatedFounderId(request: Request): Promise<string> {
    const principal = await this.sessions.authenticate(
      this.readSessionCookie(request),
    );
    if (!principal.user.emailVerifiedAt) {
      throw new ApiError(
        AUTH_ERROR_CODES.emailNotVerified,
        'Verify your email before starting an application.',
        HttpStatus.FORBIDDEN,
      );
    }
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
