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
import {
  AUTH_ERROR_CODES,
  type AcceptedResponse,
  type AuthSessionResponse,
  type EmailRequest,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from '@founderchatters/contracts';
import type { Request, Response } from 'express';

import { AppConfig } from '../config.js';
import { ApiError } from '../http/api-error.js';
import { OriginGuard } from '../http/origin.guard.js';
import { AccountRecoveryService } from './account-recovery.service.js';
import { AuthRateLimiter } from './auth-rate-limiter.js';
import { AuthService } from './auth.service.js';
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
} from './auth-input.js';
import type {
  AuthEmailContext,
  AuthEmailFlow,
} from './email-delivery.service.js';
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
    @Inject(AccountRecoveryService)
    private readonly recovery: AccountRecoveryService,
  ) {}

  @Post('signup')
  @UseGuards(OriginGuard)
  async signup(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    await this.rateLimiter.check('signup', this.clientIp(request));
    const result = await this.auth.signup(
      body,
      this.metadata(request),
      this.emailContext(request, 'signup-verification'),
    );
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

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async verifyEmail(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<VerifyEmailResponse> {
    await this.rateLimiter.check('verifyEmail', this.clientIp(request));
    return this.recovery.verifyEmail(
      this.readToken(body, AUTH_ERROR_CODES.verifyTokenInvalid),
    );
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(OriginGuard)
  async resendVerification(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<AcceptedResponse> {
    await this.rateLimiter.check('resendVerification', this.clientIp(request));
    const email = this.readEmail(body);
    await this.rateLimiter.checkRecipient('resendVerification', email);
    return this.recovery.resendVerification(
      email,
      this.emailContext(request, 'resend-verification'),
    );
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(OriginGuard)
  async forgotPassword(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<AcceptedResponse> {
    await this.rateLimiter.check('forgotPassword', this.clientIp(request));
    const email = this.readEmail(body);
    await this.rateLimiter.checkRecipient('forgotPassword', email);
    return this.recovery.requestPasswordReset(
      email,
      this.emailContext(request, 'forgot-password'),
    );
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async resetPassword(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<ResetPasswordResponse> {
    await this.rateLimiter.check('resetPassword', this.clientIp(request));
    const value = this.record(body);
    const token = this.readToken(value, AUTH_ERROR_CODES.resetTokenInvalid);
    const password: ResetPasswordRequest['password'] =
      typeof value.password === 'string' ? value.password : '';
    const confirmPassword =
      typeof value.confirmPassword === 'string' ? value.confirmPassword : '';
    validatePassword(password);
    if (password !== confirmPassword) {
      throw new ApiError(
        AUTH_ERROR_CODES.invalidCredentials,
        'The passwords do not match.',
        HttpStatus.BAD_REQUEST,
        { confirmPassword: ['Passwords must match.'] },
      );
    }
    return this.recovery.resetPassword(token, password);
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

  private readEmail(body: unknown): EmailRequest['email'] {
    const value = this.record(body);
    const email =
      typeof value.email === 'string' ? normalizeEmail(value.email) : '';
    validateEmail(email);
    return email;
  }

  private readToken(
    body: unknown,
    errorCode: string,
  ): VerifyEmailRequest['token'] {
    const value = this.record(body);
    const token = typeof value.token === 'string' ? value.token.trim() : '';
    if (!token || token.length > 256) {
      throw new ApiError(
        errorCode,
        'The supplied token is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return token;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private emailContext(
    request: Request,
    flow: AuthEmailFlow,
  ): AuthEmailContext {
    return {
      flow,
      requestId: String(request.res?.locals.requestId ?? 'unknown'),
    };
  }
}
