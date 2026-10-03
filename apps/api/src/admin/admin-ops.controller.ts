import {
  Body,
  Controller,
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
import { ADMIN_PERMISSIONS } from '@founderchatters/contracts';
import type { Request } from 'express';

import { OriginGuard } from '../http/origin.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import {
  parseAdminId,
  parseAdminPage,
  parseAdminQuery,
  parseEmptyBody,
  parseMergeTarget,
  parseOptionalAction,
  parseOptionalId,
  parseSupportReply,
  parseSupportStatus,
  parseTaxonomyCreate,
  parseTaxonomyPatch,
} from './admin-input.js';
import { AdminOpsService } from './admin-ops.service.js';

@Controller('admin')
export class AdminOpsController {
  constructor(
    @Inject(AdminOpsService)
    private readonly ops: AdminOpsService,
    @Inject(AdminAuthService)
    private readonly adminAuth: AdminAuthService,
  ) {}

  @Get('session')
  session(@Req() request: Request) {
    return this.adminAuth.session(request);
  }

  @Get()
  async overview(@Req() request: Request) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.overviewRead);
    return this.ops.overview();
  }

  @Get('requests')
  async listRequests(@Req() request: Request, @Query('page') page: unknown) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.requestsRead);
    return this.ops.listRequests(parseAdminPage(page));
  }

  @Get('requests/:id')
  async getRequest(@Req() request: Request, @Param('id') id: string) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.requestsRead);
    return this.ops.getRequest(parseAdminId(id));
  }

  @Get('support')
  async listSupport(@Req() request: Request, @Query('page') page: unknown) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.supportRead);
    return this.ops.listSupport(parseAdminPage(page));
  }

  @Get('support/:id')
  async getSupport(@Req() request: Request, @Param('id') id: string) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.supportRead);
    return this.ops.getSupport(parseAdminId(id));
  }

  @Post('support/:id/reply')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async replySupport(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.supportReply,
    );
    return this.ops.replySupport(
      principal,
      parseAdminId(id),
      parseSupportReply(body),
    );
  }

  @Post('support/:id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async statusSupport(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.supportStatus,
    );
    return this.ops.statusSupport(
      principal,
      parseAdminId(id),
      parseSupportStatus(body),
    );
  }

  @Get('reputation')
  async listReputation(@Req() request: Request, @Query('page') page: unknown) {
    await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.reputationRead,
    );
    return this.ops.listReputation(parseAdminPage(page));
  }

  @Get('reputation/:id')
  async getReputation(@Req() request: Request, @Param('id') id: string) {
    await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.reputationRead,
    );
    return this.ops.getReputation(parseAdminId(id));
  }

  @Get('notifications/templates')
  async listTemplates(@Req() request: Request) {
    await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.notificationsRead,
    );
    return this.ops.listTemplates();
  }

  @Get('notifications/templates/:id')
  async getTemplate(@Req() request: Request, @Param('id') id: string) {
    await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.notificationsRead,
    );
    return this.ops.getTemplate(parseAdminId(id));
  }

  @Get('notifications')
  async listNotifications(
    @Req() request: Request,
    @Query('page') page: unknown,
  ) {
    await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.notificationsRead,
    );
    return this.ops.listNotifications(parseAdminPage(page));
  }

  @Get('notifications/:id')
  async getNotification(@Req() request: Request, @Param('id') id: string) {
    await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.notificationsRead,
    );
    return this.ops.getNotification(parseAdminId(id));
  }

  @Post('notifications/:id/retry')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async retryNotification(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.notificationsRetry,
    );
    parseEmptyBody(body);
    return this.ops.retryNotification(principal, parseAdminId(id));
  }

  @Get('taxonomy')
  async listTaxonomy(@Req() request: Request) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.taxonomyRead);
    return this.ops.listTaxonomy();
  }

  @Post('taxonomy')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OriginGuard)
  async createTaxonomy(@Req() request: Request, @Body() body: unknown) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.taxonomyManage,
    );
    return this.ops.createTaxonomy(principal, parseTaxonomyCreate(body));
  }

  @Patch('taxonomy/:id')
  @UseGuards(OriginGuard)
  async patchTaxonomy(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.taxonomyManage,
    );
    return this.ops.patchTaxonomy(
      principal,
      parseAdminId(id),
      parseTaxonomyPatch(body),
    );
  }

  @Post('taxonomy/:id/merge')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async mergeTaxonomy(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.taxonomyManage,
    );
    return this.ops.mergeTaxonomy(
      principal,
      parseAdminId(id),
      parseMergeTarget(body),
    );
  }

  @Get('analytics')
  async analytics(@Req() request: Request) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.analyticsRead);
    return this.ops.analytics();
  }

  @Get('audit')
  async listAudit(
    @Req() request: Request,
    @Query('page') page: unknown,
    @Query('action') action: unknown,
    @Query('actorUserId') actorUserId: unknown,
    @Query('targetType') targetType: unknown,
    @Query('targetId') targetId: unknown,
  ) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.auditRead);
    return this.ops.listAudit(parseAdminPage(page), {
      action: parseOptionalAction(action),
      actorUserId: parseOptionalId(actorUserId, 'actorUserId'),
      targetType: parseOptionalAction(targetType),
      targetId: parseOptionalId(targetId, 'targetId'),
    });
  }

  @Get('audit/:id')
  async getAudit(@Req() request: Request, @Param('id') id: string) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.auditRead);
    return this.ops.getAudit(parseAdminId(id));
  }

  @Get('settings')
  async settings(@Req() request: Request) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.settingsRead);
    return this.ops.settings();
  }

  @Get('system/jobs')
  async listJobs(@Req() request: Request, @Query('page') page: unknown) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.jobsRead);
    return this.ops.listJobs(parseAdminPage(page));
  }

  @Get('system/jobs/:id')
  async getJob(@Req() request: Request, @Param('id') id: string) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.jobsRead);
    return this.ops.getJob(parseAdminId(id));
  }

  @Post('system/jobs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async retryJob(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.jobsRetry,
    );
    parseEmptyBody(body);
    return this.ops.retryJob(principal, parseAdminId(id));
  }

  @Get('system')
  async system(@Req() request: Request) {
    await this.adminAuth.authenticate(request, ADMIN_PERMISSIONS.systemRead);
    return this.ops.system();
  }

  @Get('search')
  async search(@Req() request: Request, @Query('q') q: unknown) {
    const principal = await this.adminAuth.authenticate(
      request,
      ADMIN_PERMISSIONS.searchRead,
    );
    return this.ops.search(
      parseAdminQuery(q, true) ?? '',
      principal.permissions,
    );
  }
}
