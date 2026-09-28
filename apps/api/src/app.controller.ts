import { Controller, Get } from '@nestjs/common';

export type BootstrapStatus = {
  service: 'api';
  status: 'ok';
};

@Controller()
export class AppController {
  @Get()
  getBootstrapStatus(): BootstrapStatus {
    return {
      service: 'api',
      status: 'ok',
    };
  }
}
