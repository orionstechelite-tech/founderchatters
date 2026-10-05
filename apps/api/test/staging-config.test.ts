import { describe, expect, it } from 'vitest';

import { SessionService } from '../src/auth/session.service.js';
import {
  AppConfig,
  evaluateTrustedProxyAddresses,
  nestLoggerLevels,
  usesSecureCookies,
} from '../src/config.js';
import type { PrismaService } from '../src/database/prisma.service.js';

const CONFIG_ENVIRONMENT_KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'REDIS_URL',
  'ALLOWED_ORIGINS',
  'SESSION_SECRET',
  'PASSWORD_PEPPER',
  'AUTH_TOKEN_SECRET',
  'WEB_URL',
  'EMAIL_PROVIDER',
  'TRUST_PROXY_ADDRESSES',
  'LOG_LEVEL',
] as const;

function withEnvironment(
  values: Partial<
    Record<(typeof CONFIG_ENVIRONMENT_KEYS)[number], string | undefined>
  >,
  operation: () => void,
): void {
  const previous = new Map(
    CONFIG_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of CONFIG_ENVIRONMENT_KEYS) {
      const value = values[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    operation();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const stagingEnvironment = {
  NODE_ENV: 'staging',
  DATABASE_URL:
    'postgresql://staging_user:staging_pass@postgres.internal:5432/founderchatters_staging',
  REDIS_URL: 'redis://redis.internal:6379',
  ALLOWED_ORIGINS: 'https://app.staging.example.invalid',
  WEB_URL: 'https://app.staging.example.invalid',
  SESSION_SECRET: 's'.repeat(32),
  PASSWORD_PEPPER: 'p'.repeat(32),
  AUTH_TOKEN_SECRET: 't'.repeat(32),
  TRUST_PROXY_ADDRESSES: '172.30.0.10',
} as const;

describe('staging AppConfig fail-closed contract', () => {
  it('still rejects EMAIL_PROVIDER=memory and does not boot a memory adapter', () => {
    withEnvironment(
      {
        ...stagingEnvironment,
        EMAIL_PROVIDER: 'memory',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /approved production-capable EMAIL_PROVIDER is required/,
        );
      },
    );
  });

  it('rejects placeholder and weak staging secrets', () => {
    withEnvironment(
      {
        ...stagingEnvironment,
        SESSION_SECRET: 'replace-me-replace-me-replace-me-secret',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /SESSION_SECRET must be a strong staging secret/,
        );
      },
    );
    withEnvironment(
      {
        ...stagingEnvironment,
        PASSWORD_PEPPER: 'local-password-pepper-local-password',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /PASSWORD_PEPPER must be a strong staging secret/,
        );
      },
    );
  });

  it('rejects non-HTTPS and localhost public staging origins', () => {
    withEnvironment(
      {
        ...stagingEnvironment,
        WEB_URL: 'http://app.staging.example.invalid',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /WEB_URL must use HTTPS in staging and production/,
        );
      },
    );
    withEnvironment(
      {
        ...stagingEnvironment,
        WEB_URL: 'https://localhost:3000',
        ALLOWED_ORIGINS: 'https://localhost:3000',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /WEB_URL must not use a localhost address/,
        );
      },
    );
  });

  it('rejects development database credentials and localhost service URLs', () => {
    withEnvironment(
      {
        ...stagingEnvironment,
        DATABASE_URL:
          'postgresql://founderchatters:founderchatters@postgres.internal:5432/founderchatters',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /DATABASE_URL must not reuse development credentials/,
        );
      },
    );
    withEnvironment(
      {
        ...stagingEnvironment,
        REDIS_URL: 'redis://localhost:6379',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /REDIS_URL must not use a localhost address/,
        );
      },
    );
  });

  it('uses Secure cookies in staging and production without constructing AppConfig', () => {
    expect(usesSecureCookies('development')).toBe(false);
    expect(usesSecureCookies('test')).toBe(false);
    expect(usesSecureCookies('staging')).toBe(true);
    expect(usesSecureCookies('production')).toBe(true);

    const expiresAt = new Date();
    const development = new SessionService(
      {} as PrismaService,
      {
        secureCookies: usesSecureCookies('development'),
      } as AppConfig,
    );
    const testEnv = new SessionService(
      {} as PrismaService,
      {
        secureCookies: usesSecureCookies('test'),
      } as AppConfig,
    );
    const staging = new SessionService(
      {} as PrismaService,
      {
        secureCookies: usesSecureCookies('staging'),
      } as AppConfig,
    );
    const production = new SessionService(
      {} as PrismaService,
      {
        secureCookies: usesSecureCookies('production'),
      } as AppConfig,
    );

    expect(development.cookieOptions(expiresAt).secure).toBe(false);
    expect(testEnv.clearCookieOptions().secure).toBe(false);
    expect(staging.cookieOptions(expiresAt).secure).toBe(true);
    expect(staging.clearCookieOptions().secure).toBe(true);
    expect(production.cookieOptions(expiresAt).secure).toBe(true);
    expect(production.clearCookieOptions().secure).toBe(true);
  });

  it('maps LOG_LEVEL into Nest logger levels', () => {
    expect(nestLoggerLevels('error')).toEqual(['error', 'fatal']);
    expect(nestLoggerLevels('log')).toEqual(['log', 'warn', 'error', 'fatal']);
  });

  it('rejects missing or overly broad trusted-proxy configuration', () => {
    withEnvironment(
      {
        ...stagingEnvironment,
        TRUST_PROXY_ADDRESSES: undefined,
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /TRUST_PROXY_ADDRESSES is required/,
        );
      },
    );
    withEnvironment(
      {
        ...stagingEnvironment,
        TRUST_PROXY_ADDRESSES: '0.0.0.0/0',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /TRUST_PROXY_ADDRESSES must not trust every address/,
        );
      },
    );
    expect(() =>
      evaluateTrustedProxyAddresses('172.30.0.10,10.0.0.2', 'staging'),
    ).not.toThrow();
    expect(() =>
      evaluateTrustedProxyAddresses('172.30.0.10,not-an-ip', 'staging'),
    ).toThrow(/comma-separated IP addresses or CIDRs/);
    expect(() => evaluateTrustedProxyAddresses('::/0', 'staging')).toThrow(
      /must not trust every address/,
    );
  });
});
