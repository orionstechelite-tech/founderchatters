import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OriginGuard } from '../http/origin.guard.js';
import { FoundersController } from './founders.controller.js';
import { FoundersService } from './founders.service.js';

@Module({
  imports: [AuthModule],
  controllers: [FoundersController],
  providers: [OriginGuard, FoundersService],
})
export class FoundersModule {}
