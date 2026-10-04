import * as argon2 from 'argon2';
import { createHmac, randomBytes } from 'node:crypto';

import { e2eEnv } from '../env.js';

export const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  version: 0x13,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    ...ARGON2ID_OPTIONS,
    secret: Buffer.from(e2eEnv().PASSWORD_PEPPER, 'utf8'),
  });
}

export function digestSession(purpose: string, value: string): string {
  return createHmac('sha256', e2eEnv().SESSION_SECRET)
    .update(`${purpose}\0${value}`, 'utf8')
    .digest('base64url');
}

export function hashAuthToken(
  purpose: 'email-verification' | 'password-reset',
  rawToken: string,
): string {
  return createHmac('sha256', e2eEnv().AUTH_TOKEN_SECRET)
    .update(`founderchatters:${purpose}:v1\0${rawToken}`, 'utf8')
    .digest('hex');
}

export function issueRawToken(): string {
  return randomBytes(32).toString('base64url');
}
