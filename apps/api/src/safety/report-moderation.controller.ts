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
  type AdminReportDetailResponse,
  type AdminReportQueueResponse,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { AdminAuthService } from '../admin/admin-auth.service.js';
import { OriginGuard } from '../http/origin.guard.js';
import { ReportModerationService } from './report-moderation.service.js';

@Controller('admin/reports')
export class ReportModerationController {
  constructor(
    @Inject(ReportModerationService)
    private readonly reports: ReportModerationService,
    @Inject(AdminAuthService)
    private readonly adminAuth: AdminAuthService,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<AdminReportQueueResponse> {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.reportsRead);
    return this.reports.list(query);
  }

  @Get(':id')
  async get(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<AdminReportDetailResponse> {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.reportsRead,
    );
    return this.reports.get(principal, id);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async review(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminReportDetailResponse> {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.reportsModerate,
    );
    return this.reports.review(principal, id, body);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async dismiss(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminReportDetailResponse> {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.reportsModerate,
    );
    return this.reports.dismiss(principal, id, body);
  }

  @Post(':id/enforce')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async enforce(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminReportDetailResponse> {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.reportsModerate,
    );
    if (!principal.permissions.has(ADMIN_PERMISSIONS.membersSuspend)) {
      const targetType = await this.reports.peekTargetType(id);
      if (targetType === 'USER') {
        await this.adminAuth.authenticate(
          request,
          ADMIN_PERMISSIONS.membersSuspend,
        );
      }
    }
    return this.reports.enforce(principal, id, body);
  }
}
