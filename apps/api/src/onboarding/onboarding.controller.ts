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
import type {
  OnboardingCompleteResponse,
  OnboardingProfileResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import {
  requireApprovedFounder,
  requireOnboardingWritable,
} from './onboarding-access.js';
import { OnboardingService } from './onboarding.service.js';

@Controller('me')
export class OnboardingController {
  constructor(
    @Inject(OnboardingService)
    private readonly onboarding: OnboardingService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Get('profile')
  async getProfile(
    @Req() request: Request,
  ): Promise<OnboardingProfileResponse> {
    const principal = await requireApprovedFounder(
      request,
      this.sessions,
      this.config,
    );
    return this.onboarding.getProfile(principal.user.id);
  }

  @Put('profile')
  @UseGuards(OriginGuard)
  async updateProfile(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<OnboardingProfileResponse> {
    const principal = await requireApprovedFounder(
      request,
      this.sessions,
      this.config,
    );
    requireOnboardingWritable(principal);
    return this.onboarding.updateProfile(principal.user.id, body);
  }

  @Put('expertise')
  @UseGuards(OriginGuard)
  async updateExpertise(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<OnboardingProfileResponse> {
    const principal = await requireApprovedFounder(
      request,
      this.sessions,
      this.config,
    );
    requireOnboardingWritable(principal);
    return this.onboarding.updateExpertise(principal.user.id, body);
  }

  @Put('needs')
  @UseGuards(OriginGuard)
  async updateNeeds(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<OnboardingProfileResponse> {
    const principal = await requireApprovedFounder(
      request,
      this.sessions,
      this.config,
    );
    requireOnboardingWritable(principal);
    return this.onboarding.updateNeeds(principal.user.id, body);
  }

  @Post('onboarding/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async complete(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<OnboardingCompleteResponse> {
    const principal = await requireApprovedFounder(
      request,
      this.sessions,
      this.config,
    );
    return this.onboarding.complete(principal.user.id, body);
  }
}
