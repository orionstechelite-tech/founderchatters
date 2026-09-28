import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { AuthSessionResponse } from '@founderchatters/contracts';
import type { Request, Response } from 'express';

import { AppConfig } from '../config.js';
import { OriginGuard } from '../http/origin.guard.js';
import { AuthRateLimiter } from './auth-rate-limiter.js';
import { AuthService } from './auth.service.js';
import { SessionService, type SessionMetadata } from './session.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(SessionService)
    private readonly sessions: SessionService,
    @Inject(AuthRateLimiter)
    private readonly rateLimiter: AuthRateLimiter,
    @Inject(AppConfig)
    private readonly config: AppConfig,
  ) {}

  @Post('signup')
  @UseGuards(OriginGuard)
  async signup(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    await this.rateLimiter.check('signup', this.clientIp(request));
    const result = await this.auth.signup(body, this.metadata(request));
    response.cookie(
      this.config.sessionCookieName,
      result.rawToken,
      this.sessions.cookieOptions(result.expiresAt),
    );
    return result.response;
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async signin(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    await this.rateLimiter.check('signin', this.clientIp(request));
    const result = await this.auth.signin(body, this.metadata(request));
    response.cookie(
      this.config.sessionCookieName,
      result.rawToken,
      this.sessions.cookieOptions(result.expiresAt),
    );
    return result.response;
  }

  @Get('session')
  session(@Req() request: Request): Promise<AuthSessionResponse> {
    return this.auth.session(this.readSessionCookie(request));
  }

  @Post('signout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OriginGuard)
  async signout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.signout(this.readSessionCookie(request));
    response.cookie(
      this.config.sessionCookieName,
      '',
      this.sessions.clearCookieOptions(),
    );
  }

  private metadata(request: Request): SessionMetadata {
    return {
      ipAddress: this.clientIp(request),
      userAgent: request.header('user-agent'),
    };
  }

  private clientIp(request: Request): string {
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private readSessionCookie(request: Request): string | undefined {
    const header = request.header('cookie');
    if (!header) {
      return undefined;
    }
    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) {
        continue;
      }
      const name = part.slice(0, separator).trim();
      if (name === this.config.sessionCookieName) {
        return part.slice(separator + 1).trim();
      }
    }
    return undefined;
  }
}
