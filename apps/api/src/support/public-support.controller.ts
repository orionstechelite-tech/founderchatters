import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CreatePublicSupportCaseResponse } from '@founderchatters/contracts';
import type { Request } from 'express';

import { OriginGuard } from '../http/origin.guard.js';
import { PublicSupportService } from './public-support.service.js';

@Controller('support')
export class PublicSupportController {
  constructor(
    @Inject(PublicSupportService)
    private readonly support: PublicSupportService,
  ) {}

  @Post('cases')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OriginGuard)
  create(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<CreatePublicSupportCaseResponse> {
    return this.support.create(body, request);
  }
}
