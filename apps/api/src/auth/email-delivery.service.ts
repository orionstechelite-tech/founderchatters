import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config.js';

export const EMAIL_DELIVERY = Symbol('EMAIL_DELIVERY');

export interface VerificationEmail {
  readonly kind: 'verification';
  readonly to: string;
  readonly verifyUrl: string;
}

export interface PasswordResetEmail {
  readonly kind: 'password-reset';
  readonly to: string;
  readonly resetUrl: string;
}

export type AuthEmail = VerificationEmail | PasswordResetEmail;

export interface EmailDelivery {
  send(message: AuthEmail): Promise<void>;
}

export type AuthEmailFlow =
  'signup-verification' | 'resend-verification' | 'forgot-password';

export interface AuthEmailContext {
  readonly flow: AuthEmailFlow;
  readonly requestId: string;
}

export class AuthEmailDeliveryError extends Error {
  constructor() {
    super('Authentication email delivery failed');
    this.name = 'AuthEmailDeliveryError';
  }
}

@Injectable()
export class AuthEmailFailureReporter {
  private readonly logger = new Logger('AuthEmailDelivery');

  report(
    context: AuthEmailContext,
    failure: 'delivery' | 'token-finalization',
  ): void {
    this.logger.error({
      event: 'auth_email_failure',
      failure,
      flow: context.flow,
      requestId: context.requestId,
    });
  }
}

@Injectable()
export class InMemoryEmailDelivery implements EmailDelivery {
  private readonly messages: AuthEmail[] = [];

  async send(message: AuthEmail): Promise<void> {
    this.messages.push(structuredClone(message));
  }

  getMessages(): readonly AuthEmail[] {
    return structuredClone(this.messages);
  }

  clear(): void {
    this.messages.length = 0;
  }
}

@Injectable()
export class AuthEmailService {
  constructor(
    @Inject(AppConfig)
    private readonly config: AppConfig,
    @Inject(EMAIL_DELIVERY)
    private readonly delivery: EmailDelivery,
    @Inject(AuthEmailFailureReporter)
    private readonly failures: AuthEmailFailureReporter,
  ) {}

  async sendVerification(
    to: string,
    token: string,
    context: AuthEmailContext,
  ): Promise<void> {
    await this.deliver(
      {
        kind: 'verification',
        to,
        verifyUrl: this.url('/verify-email', token),
      },
      context,
    );
  }

  async sendPasswordReset(
    to: string,
    token: string,
    context: AuthEmailContext,
  ): Promise<void> {
    await this.deliver(
      {
        kind: 'password-reset',
        to,
        resetUrl: new URL(
          `/reset-password/${encodeURIComponent(token)}`,
          this.config.webUrl,
        ).toString(),
      },
      context,
    );
  }

  private url(path: string, token: string): string {
    const url = new URL(path, this.config.webUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async deliver(
    message: AuthEmail,
    context: AuthEmailContext,
  ): Promise<void> {
    try {
      await this.delivery.send(message);
    } catch {
      this.failures.report(context, 'delivery');
      throw new AuthEmailDeliveryError();
    }
  }
}
