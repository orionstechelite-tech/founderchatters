import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';

import {
  HealthService,
  type LiveHealth,
  type ReadyHealth,
} from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService)
    private readonly health: HealthService,
  ) {}

  @Get('live')
  getLive(): LiveHealth {
    return this.health.live();
  }

  @Get('ready')
  async getReady(@Res() response: Response): Promise<void> {
    const body: ReadyHealth = await this.health.ready();
    response
      .status(
        body.status === 'ready'
          ? HttpStatus.OK
          : HttpStatus.SERVICE_UNAVAILABLE,
      )
      .json(body);
  }
}
