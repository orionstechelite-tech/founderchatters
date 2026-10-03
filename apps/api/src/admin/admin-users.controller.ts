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
  Put,
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
  parseAdminRoles,
  parseEmptyBody,
} from './admin-input.js';
import { AdminUsersService } from './admin-users.service.js';

@Controller()
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService)
    private readonly users: AdminUsersService,
    @Inject(AdminAuthService)
    private readonly adminAuth: AdminAuthService,
  ) {}

  @Get('admin/roles')
  async listRoles(@Req() request: Request) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.rolesRead);
    return this.users.listRoles();
  }

  @Get('admin/admins')
  async list(@Req() request: Request, @Query('page') page: unknown) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.adminsRead);
    return this.users.list(parseAdminPage(page));
  }

  @Get('admin/admins/:userId')
  async get(@Req() request: Request, @Param('userId') userId: string) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.adminsRead);
    return this.users.get(parseAdminId(userId, 'userId'));
  }

  @Put('admin/admins/:userId/roles')
  @UseGuards(OriginGuard)
  async replaceRoles(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.adminsManage,
    );
    return this.users.replaceRoles(
      principal,
      parseAdminId(userId, 'userId'),
      parseAdminRoles(body),
    );
  }

  @Post('admin/admins/:userId/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async disable(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.adminsManage,
    );
    parseEmptyBody(body);
    return this.users.disable(principal, parseAdminId(userId, 'userId'));
  }

  @Delete('admin/admins/:userId/sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async revokeSessions(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.adminsManage,
    );
    parseEmptyBody(body);
    return this.users.revokeSessions(principal, parseAdminId(userId, 'userId'));
  }
}
