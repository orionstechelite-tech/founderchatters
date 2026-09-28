import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

import { AppConfig } from '../config.js';

export const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  version: 0x13,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

@Injectable()
export class PasswordHasher {
  private readonly secret: Buffer;

  constructor(@Inject(AppConfig) config: AppConfig) {
    this.secret = Buffer.from(config.passwordPepper, 'utf8');
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      ...ARGON2ID_OPTIONS,
      secret: this.secret,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password, {
        secret: this.secret,
      });
    } catch {
      return false;
    }
  }
}
