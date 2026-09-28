import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_ERROR_CODES,
  type AdminPermission,
} from '@founderchatters/contracts';
import type { Request } from 'express';

import { SessionService, type AuthPrincipal } from '../auth/session.service.js';
import { AppConfig } from '../config.js';
import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/api-error.js';

export type AdminPrincipal = AuthPrincipal & {
  permissions: Set<string>;
};

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  async authenticate(
    request: Request,
    permission: AdminPermission,
  ): Promise<AdminPrincipal> {
    const principal = await this.sessions.authenticate(
      this.readSessionCookie(request),
    );
    const permissions = await this.loadPermissions(principal.user.id);
    if (!permissions.has(permission)) {
      throw new ApiError(
        ADMIN_ERROR_CODES.permissionDenied,
        'You do not have permission to perform this admin action.',
        HttpStatus.FORBIDDEN,
      );
    }
    return { ...principal, permissions };
  }

  capabilities(permissions: Set<string>): {
    needsInfo: boolean;
    approve: boolean;
    reject: boolean;
  } {
    return {
      needsInfo: permissions.has('admin.applications.needs_info'),
      approve: permissions.has('admin.applications.approve'),
      reject: permissions.has('admin.applications.reject'),
    };
  }

  private async loadPermissions(userId: string): Promise<Set<string>> {
    const assignments = await this.prisma.userAdminRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    });
    return new Set(
      assignments.flatMap((assignment) =>
        assignment.role.permissions.map(({ permission }) => permission.key),
      ),
    );
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
