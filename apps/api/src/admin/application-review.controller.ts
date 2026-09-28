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
import {
  ADMIN_PERMISSIONS,
  type AdminApplicationDetailResponse,
  type AdminApplicationQueueResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { OriginGuard } from '../http/origin.guard.js';
import {
  parseApproveBody,
  parseApplicationId,
  parseCountryFilter,
  parseQueuePage,
  parseQueueStatus,
  parseRequiredDecisionNote,
} from './admin-application-input.js';
import { AdminAuthService } from './admin-auth.service.js';
import { ApplicationReviewService } from './application-review.service.js';

@Controller('admin/applications')
export class ApplicationReviewController {
  constructor(
    @Inject(ApplicationReviewService)
    private readonly reviews: ApplicationReviewService,
    @Inject(AdminAuthService)
    private readonly adminAuth: AdminAuthService,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query('status') status: unknown,
    @Query('country') country: unknown,
    @Query('page') page: unknown,
  ): Promise<AdminApplicationQueueResponse> {
    await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.applicationsRead,
    );
    return this.reviews.list({
      status: parseQueueStatus(status),
      country: parseCountryFilter(country),
      page: parseQueuePage(page),
    });
  }

  @Get(':id')
  async get(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<AdminApplicationDetailResponse> {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.applicationsRead,
    );
    return this.reviews.get(principal, parseApplicationId(id));
  }

  @Post(':id/needs-info')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async needsInfo(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminApplicationDetailResponse> {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.applicationsNeedsInfo,
    );
    return this.reviews.requestInfo(
      principal,
      parseApplicationId(id),
      parseRequiredDecisionNote(body, 'note'),
    );
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async approve(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminApplicationDetailResponse> {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.applicationsApprove,
    );
    parseApproveBody(body);
    return this.reviews.approve(principal, parseApplicationId(id));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async reject(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminApplicationDetailResponse> {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.applicationsReject,
    );
    return this.reviews.reject(
      principal,
      parseApplicationId(id),
      parseRequiredDecisionNote(body, 'reason'),
    );
  }
}
