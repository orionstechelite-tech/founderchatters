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
import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Request } from 'express';

import { OriginGuard } from '../http/origin.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import {
  parseAdminId,
  parseAdminPage,
  parseAdminQuery,
  parseEmptyBody,
  parseOptionalMemberStatus,
  parseRequiredReason,
} from './admin-input.js';
import { AdminMembersService } from './admin-members.service.js';

@Controller('admin/members')
export class AdminMembersController {
  constructor(
    @Inject(AdminMembersService)
    private readonly members: AdminMembersService,
    @Inject(AdminAuthService)
    private readonly adminAuth: AdminAuthService,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query('page') page: unknown,
    @Query('status') status: unknown,
    @Query('q') q: unknown,
  ) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.membersRead);
    return this.members.list(
      parseAdminPage(page),
      parseOptionalMemberStatus(status),
      parseAdminQuery(q),
    );
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.membersRead);
    return this.members.get(parseAdminId(id));
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async suspend(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.membersSuspend,
    );
    return this.members.suspend(
      principal,
      parseAdminId(id),
      parseRequiredReason(body),
    );
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async restore(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.membersRestore,
    );
    parseEmptyBody(body);
    return this.members.restore(principal, parseAdminId(id));
  }
}
