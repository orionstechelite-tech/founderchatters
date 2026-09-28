import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { AppConfig } from '../config.js';

export const AUTH_TOKEN_BYTES = 32;
export const AUTH_TOKEN_TTL_MS = 30 * 60 * 1000;

export type AuthTokenPurpose = 'email-verification' | 'password-reset';

export interface IssuedAuthToken {
  readonly rawToken: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

@Injectable()
export class AuthTokenService {
  constructor(@Inject(AppConfig) private readonly config: AppConfig) {}

  issue(purpose: AuthTokenPurpose, now = new Date()): IssuedAuthToken {
    const rawToken = randomBytes(AUTH_TOKEN_BYTES).toString('base64url');
    return {
      rawToken,
      tokenHash: this.hash(purpose, rawToken),
      expiresAt: new Date(now.getTime() + AUTH_TOKEN_TTL_MS),
    };
  }

  hash(purpose: AuthTokenPurpose, rawToken: string): string {
    return createHmac('sha256', this.config.authTokenSecret)
      .update(`founderchatters:${purpose}:v1\0${rawToken}`, 'utf8')
      .digest('hex');
  }
}
