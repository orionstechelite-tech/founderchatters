import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminMembersController } from './admin-members.controller.js';
import { AdminMembersService } from './admin-members.service.js';
import { AdminOpsController } from './admin-ops.controller.js';
import { AdminOpsService } from './admin-ops.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminOpsController,
    AdminMembersController,
    AdminUsersController,
  ],
  providers: [
    OriginGuard,
    AdminAuthService,
    AdminOpsService,
    AdminMembersService,
    AdminUsersService,
  ],
})
export class AdminOpsModule {}
