import { Logger, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AccountRecoveryService } from '../src/auth/account-recovery.service.js';
import { AuthRateLimiter } from '../src/auth/auth-rate-limiter.js';
import { AuthService } from '../src/auth/auth.service.js';
import {
  AUTH_TOKEN_BYTES,
  AUTH_TOKEN_TTL_MS,
  AuthTokenService,
} from '../src/auth/auth-token.service.js';
import {
  AuthEmailDeliveryError,
  AuthEmailFailureReporter,
  AuthEmailService,
  type EmailDelivery,
} from '../src/auth/email-delivery.service.js';
import {
  ARGON2ID_OPTIONS,
  PasswordHasher,
} from '../src/auth/password-hasher.js';
import {
  SESSION_LIFETIME_MS,
  SessionService,
} from '../src/auth/session.service.js';
import { AppConfig } from '../src/config.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { ApiError } from '../src/http/api-error.js';
import { OriginGuard } from '../src/http/origin.guard.js';
import type { RedisService } from '../src/redis/redis.service.js';

const config = (production = false) =>
  ({
    isProduction: production,
    secureCookies: production,
    sessionSecret: 'test-session-secret',
    passwordPepper: 'test-password-pepper',
    allowedOrigins: new Set(['http://localhost:3000']),
  }) as AppConfig;
const signupEmailContext = {
  flow: 'signup-verification',
  requestId: 'request-test',
} as const;

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
] as const;

function withEnvironment(
  values: Partial<Record<(typeof CONFIG_ENVIRONMENT_KEYS)[number], string>>,
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

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://local/test',
  REDIS_URL: 'redis://localhost:6379',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  WEB_URL: 'http://localhost:3000',
} as const;
const productionEnvironment = {
  DATABASE_URL:
    'postgresql://prod_user:prod_pass@postgres.internal:5432/founderchatters_prod',
  REDIS_URL: 'redis://redis.internal:6379',
  ALLOWED_ORIGINS: 'https://app.founderchatters.com',
  WEB_URL: 'https://app.founderchatters.com',
} as const;

describe('AppConfig security environment', () => {
  it('keeps development localhost-compatible with no trusted proxy', () => {
    withEnvironment(
      {
        ...requiredEnvironment,
        NODE_ENV: 'development',
      },
      () => {
        const runtimeConfig = new AppConfig();
        const sessions = new SessionService({} as PrismaService, runtimeConfig);

        expect(runtimeConfig.trustedProxyAddresses).toBe(false);
        expect(sessions.cookieOptions(new Date()).secure).toBe(false);
      },
    );
  });

  it('requires production secrets and keeps Secure cookie policy', () => {
    const sessions = new SessionService(
      {} as PrismaService,
      {
        isProduction: true,
        secureCookies: true,
      } as AppConfig,
    );
    expect(sessions.cookieOptions(new Date()).secure).toBe(true);

    withEnvironment(
      {
        ...productionEnvironment,
        NODE_ENV: 'production',
        AUTH_TOKEN_SECRET: 't'.repeat(32),
        PASSWORD_PEPPER: 'p'.repeat(32),
        TRUST_PROXY_ADDRESSES: 'none',
      },
      () => {
        expect(() => new AppConfig()).toThrow(/SESSION_SECRET is required/);
      },
    );
    withEnvironment(
      {
        ...productionEnvironment,
        NODE_ENV: 'production',
        AUTH_TOKEN_SECRET: 't'.repeat(32),
        SESSION_SECRET: 's'.repeat(32),
        TRUST_PROXY_ADDRESSES: 'none',
      },
      () => {
        expect(() => new AppConfig()).toThrow(/PASSWORD_PEPPER is required/);
      },
    );
    withEnvironment(
      {
        ...productionEnvironment,
        NODE_ENV: 'production',
        SESSION_SECRET: 's'.repeat(32),
        PASSWORD_PEPPER: 'p'.repeat(32),
        TRUST_PROXY_ADDRESSES: 'none',
      },
      () => {
        expect(() => new AppConfig()).toThrow(/AUTH_TOKEN_SECRET is required/);
      },
    );
  });

  it.each(['development', 'test'] as const)(
    'allows the deterministic memory provider in %s',
    (environment) => {
      withEnvironment(
        {
          ...requiredEnvironment,
          NODE_ENV: environment,
          EMAIL_PROVIDER: 'memory',
        },
        () => {
          expect(new AppConfig().emailProvider).toBe('memory');
        },
      );
    },
  );

  it.each([
    ['staging', undefined],
    ['staging', 'memory'],
    ['production', undefined],
    ['production', 'memory'],
  ] as const)(
    'rejects an unapproved provider in %s when EMAIL_PROVIDER=%s',
    (environment, provider) => {
      withEnvironment(
        {
          ...productionEnvironment,
          NODE_ENV: environment,
          SESSION_SECRET: 's'.repeat(32),
          PASSWORD_PEPPER: 'p'.repeat(32),
          AUTH_TOKEN_SECRET: 't'.repeat(32),
          TRUST_PROXY_ADDRESSES: 'none',
          ...(provider ? { EMAIL_PROVIDER: provider } : {}),
        },
        () => {
          expect(() => new AppConfig()).toThrow(
            /approved production-capable EMAIL_PROVIDER is required/,
          );
        },
      );
    },
  );

  it('accepts a valid production HTTPS WEB_URL before provider validation', () => {
    withEnvironment(
      {
        ...productionEnvironment,
        NODE_ENV: 'production',
        SESSION_SECRET: 's'.repeat(32),
        PASSWORD_PEPPER: 'p'.repeat(32),
        AUTH_TOKEN_SECRET: 't'.repeat(32),
        TRUST_PROXY_ADDRESSES: 'none',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /approved production-capable EMAIL_PROVIDER is required/,
        );
      },
    );
  });

  it('rejects production HTTP and accepts localhost HTTP in development', () => {
    withEnvironment(
      {
        ...productionEnvironment,
        NODE_ENV: 'production',
        WEB_URL: 'http://app.founderchatters.com',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /WEB_URL must use HTTPS in staging and production/,
        );
      },
    );
    withEnvironment(
      {
        ...requiredEnvironment,
        NODE_ENV: 'development',
      },
      () => {
        expect(new AppConfig().webUrl).toBe('http://localhost:3000');
      },
    );
  });

  it.each([
    ['not a URL', /valid absolute URL origin/],
    ['https://user:secret@app.example.com', /origin only/],
    ['https://app.example.com/path', /origin only/],
    ['https://app.example.com?next=x', /origin only/],
    ['https://app.example.com#fragment', /origin only/],
  ] as const)('rejects unsafe WEB_URL %s', (webUrl, expected) => {
    withEnvironment(
      {
        ...requiredEnvironment,
        NODE_ENV: 'development',
        WEB_URL: webUrl,
      },
      () => {
        expect(() => new AppConfig()).toThrow(expected);
      },
    );
  });

  it('rejects unsupported NODE_ENV values', () => {
    withEnvironment(
      {
        ...requiredEnvironment,
        NODE_ENV: 'productionn',
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /NODE_ENV must be one of: development, test, staging, production/,
        );
      },
    );
  });

  it.each(['not-an-address', '10.0.0.0/99', '10.0.0.1,'])(
    'rejects malformed trusted proxy configuration: %s',
    (trustedProxy) => {
      withEnvironment(
        {
          ...productionEnvironment,
          NODE_ENV: 'production',
          SESSION_SECRET: 's'.repeat(32),
          PASSWORD_PEPPER: 'p'.repeat(32),
          AUTH_TOKEN_SECRET: 't'.repeat(32),
          TRUST_PROXY_ADDRESSES: trustedProxy,
        },
        () => {
          expect(() => new AppConfig()).toThrow(
            /TRUST_PROXY_ADDRESSES must contain only/,
          );
        },
      );
    },
  );

  it('requires an explicit production proxy decision', () => {
    withEnvironment(
      {
        ...productionEnvironment,
        NODE_ENV: 'production',
        SESSION_SECRET: 's'.repeat(32),
        PASSWORD_PEPPER: 'p'.repeat(32),
        AUTH_TOKEN_SECRET: 't'.repeat(32),
      },
      () => {
        expect(() => new AppConfig()).toThrow(
          /TRUST_PROXY_ADDRESSES is required/,
        );
      },
    );
  });
});

describe('PasswordHasher', () => {
  it('uses the documented Argon2id parameters and verifies safely', async () => {
    const hasher = new PasswordHasher(config());
    const hash = await hasher.hash('a sufficiently long password');

    expect(ARGON2ID_OPTIONS).toMatchObject({
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(hash).not.toContain('a sufficiently long password');
    await expect(
      hasher.verify(hash, 'a sufficiently long password'),
    ).resolves.toBe(true);
    await expect(hasher.verify(hash, 'incorrect password')).resolves.toBe(
      false,
    );
    await expect(hasher.verify('malformed', 'anything at all')).resolves.toBe(
      false,
    );
  }, 20_000);
});

describe('AuthTokenService', () => {
  it('issues random purpose-separated token digests with a fixed expiry', () => {
    const tokens = new AuthTokenService({
      authTokenSecret: 'test-auth-token-secret',
    } as AppConfig);
    const now = new Date('2030-01-01T00:00:00.000Z');
    const first = tokens.issue('email-verification', now);
    const second = tokens.issue('email-verification', now);

    expect(Buffer.from(first.rawToken, 'base64url')).toHaveLength(
      AUTH_TOKEN_BYTES,
    );
    expect(first.rawToken).not.toBe(second.rawToken);
    expect(first.tokenHash).not.toContain(first.rawToken);
    expect(first.expiresAt.getTime() - now.getTime()).toBe(AUTH_TOKEN_TTL_MS);
    expect(tokens.hash('email-verification', first.rawToken)).toBe(
      first.tokenHash,
    );
    expect(tokens.hash('password-reset', first.rawToken)).not.toBe(
      first.tokenHash,
    );
  });
});

describe('AuthEmailService', () => {
  it('surfaces delivery failure while logging only sanitized flow context', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const token = 'raw-secret-token';
    const providerSecret = 'provider-secret-value';
    const delivery = {
      send: vi.fn().mockRejectedValue(new Error(`${providerSecret}:${token}`)),
    } as EmailDelivery;
    const email = new AuthEmailService(
      {
        webUrl: 'http://localhost:3000',
      } as AppConfig,
      delivery,
      new AuthEmailFailureReporter(),
    );

    await expect(
      email.sendVerification('founder@example.com', token, {
        flow: 'resend-verification',
        requestId: 'request-123',
      }),
    ).rejects.toBeInstanceOf(AuthEmailDeliveryError);

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('auth_email_failure');
    expect(logged).toContain('request-123');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(providerSecret);
    expect(logged).not.toContain('founder@example.com');
    log.mockRestore();
  });
});

describe('AccountRecoveryService issuance retries', () => {
  const context = {
    flow: 'forgot-password',
    requestId: 'request-retry',
  } as const;

  function recoveryWithTransaction(transaction: ReturnType<typeof vi.fn>) {
    const failures = { report: vi.fn() };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'founder@example.com',
          status: 'ACTIVE',
          deletedAt: null,
        }),
      },
      passwordResetToken: {
        create: vi.fn().mockResolvedValue({ id: 'candidate-1' }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: transaction,
    };
    const service = new AccountRecoveryService(
      prisma as unknown as PrismaService,
      {
        issue: vi.fn().mockReturnValue({
          rawToken: 'raw-reset-token',
          tokenHash: 'reset-token-hash',
          expiresAt: new Date('2030-01-01'),
        }),
      } as never,
      { sendPasswordReset: vi.fn().mockResolvedValue(undefined) } as never,
      failures as never,
      {} as PasswordHasher,
    );
    return { failures, prisma, service };
  }

  it('retries only recognized transaction conflicts within the bound', async () => {
    const tx = {
      passwordResetToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const transaction = vi
      .fn()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementation((operation: (client: typeof tx) => unknown) =>
        operation(tx),
      );
    const { failures, service } = recoveryWithTransaction(transaction);

    await expect(
      service.requestPasswordReset('founder@example.com', context),
    ).resolves.toEqual({ accepted: true });
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(failures.report).not.toHaveBeenCalled();
  });

  it('does not retry arbitrary errors and keeps the public response generic', async () => {
    const transaction = vi
      .fn()
      .mockRejectedValue(new Error('application failure'));
    const { failures, prisma, service } = recoveryWithTransaction(transaction);

    await expect(
      service.requestPasswordReset('founder@example.com', context),
    ).resolves.toEqual({ accepted: true });
    expect(transaction).toHaveBeenCalledOnce();
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled();
    expect(failures.report).toHaveBeenCalledWith(context, 'token-finalization');
  });

  it('stops after bounded conflict retries and preserves the generic response', async () => {
    const transaction = vi.fn().mockRejectedValue({ code: 'P2034' });
    const { failures, service } = recoveryWithTransaction(transaction);

    await expect(
      service.requestPasswordReset('founder@example.com', context),
    ).resolves.toEqual({ accepted: true });
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(failures.report).toHaveBeenCalledWith(context, 'token-finalization');
  });
});

describe('AuthService', () => {
  it('normalizes signup email, persists only a hash, and returns safe fields', async () => {
    const userCreate = vi.fn().mockImplementation(({ data }) => ({
      id: 'user-1',
      email: data.email,
      passwordHash: data.passwordHash,
      emailVerifiedAt: null,
      onboardingCompletedAt: null,
    }));
    const hash = vi.fn().mockResolvedValue('$argon2id$hash');
    const createSession = vi.fn().mockResolvedValue({
      rawToken: 'raw-token',
      expiresAt: new Date('2030-01-01'),
    });
    const verificationCreate = vi.fn().mockResolvedValue({});
    const transaction = {
      user: { create: userCreate },
      emailVerificationToken: { create: verificationCreate },
    };
    const service = new AuthService(
      {
        $transaction: vi
          .fn()
          .mockImplementation(
            (operation: (client: typeof transaction) => unknown) =>
              operation(transaction),
          ),
      } as unknown as PrismaService,
      { hash } as unknown as PasswordHasher,
      { create: createSession } as unknown as SessionService,
      {
        issue: vi.fn().mockReturnValue({
          rawToken: 'raw-verification-token',
          tokenHash: 'verification-token-hash',
          expiresAt: new Date('2030-01-01'),
        }),
      } as never,
      { sendVerification: vi.fn().mockResolvedValue(undefined) } as never,
    );

    const result = await service.signup(
      { email: '  Founder@Example.COM ', password: 'long-enough-password' },
      { ipAddress: '127.0.0.1', userAgent: 'test' },
      signupEmailContext,
    );

    expect(hash).toHaveBeenCalledWith('long-enough-password');
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        email: 'founder@example.com',
        passwordHash: '$argon2id$hash',
      },
    });
    expect(verificationCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tokenHash: 'verification-token-hash',
        expiresAt: new Date('2030-01-01'),
      },
    });
    expect(JSON.stringify(result.response)).not.toMatch(
      /passwordHash|tokenHash|raw-token/,
    );
    expect(result.response.access.state).toBe('VERIFY_EMAIL');
  });

  it.each([
    [null, 'APPLICATION'],
    ['DRAFT', 'APPLICATION'],
    ['SUBMITTED', 'APPLICATION'],
    ['NEEDS_INFO', 'APPLICATION'],
    ['REJECTED', 'APPLICATION'],
  ] as const)(
    'keeps access state APPLICATION for application status %s',
    async (applicationStatus, state) => {
      const service = new AuthService(
        {} as PrismaService,
        {} as PasswordHasher,
        {
          inspect: vi.fn().mockResolvedValue({
            sessionId: 'session-1',
            user: {
              id: 'user-1',
              email: 'founder@example.com',
              emailVerifiedAt: new Date('2026-09-28T00:00:00.000Z'),
              status: 'ACTIVE',
              onboardingCompletedAt: null,
              application: applicationStatus
                ? { status: applicationStatus }
                : null,
            },
          }),
        } as unknown as SessionService,
        {} as never,
        {} as never,
      );

      await expect(service.session('raw-token')).resolves.toMatchObject({
        access: { state, applicationStatus },
      });
    },
  );

  it('maps an approved application without onboarding to ONBOARDING', async () => {
    const service = new AuthService(
      {} as PrismaService,
      {} as PasswordHasher,
      {
        inspect: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          user: {
            id: 'user-1',
            email: 'founder@example.com',
            emailVerifiedAt: new Date('2026-09-28T00:00:00.000Z'),
            status: 'ACTIVE',
            onboardingCompletedAt: null,
            application: { status: 'APPROVED' },
          },
        }),
      } as unknown as SessionService,
      {} as never,
      {} as never,
    );

    await expect(service.session('raw-token')).resolves.toMatchObject({
      access: {
        state: 'ONBOARDING',
        applicationStatus: 'APPROVED',
        onboardingCompleted: false,
      },
    });
  });

  it('maps an approved and onboarded founder to ACTIVE', async () => {
    const service = new AuthService(
      {} as PrismaService,
      {} as PasswordHasher,
      {
        inspect: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          user: {
            id: 'user-1',
            email: 'founder@example.com',
            emailVerifiedAt: new Date('2026-09-28T00:00:00.000Z'),
            status: 'ACTIVE',
            onboardingCompletedAt: new Date('2026-09-28T00:00:00.000Z'),
            application: { status: 'APPROVED' },
          },
        }),
      } as unknown as SessionService,
      {} as never,
      {} as never,
    );

    await expect(service.session('raw-token')).resolves.toMatchObject({
      access: {
        state: 'ACTIVE',
        applicationStatus: 'APPROVED',
        onboardingCompleted: true,
      },
    });
  });

  it('maps a suspended account to session access state SUSPENDED', async () => {
    const service = new AuthService(
      {} as PrismaService,
      {} as PasswordHasher,
      {
        inspect: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          user: {
            id: 'user-1',
            email: 'founder@example.com',
            emailVerifiedAt: new Date('2026-09-28T00:00:00.000Z'),
            status: 'SUSPENDED',
            suspensionReason: 'POLICY_VIOLATION',
            suspendedUntil: null,
            onboardingCompletedAt: new Date('2026-09-28T00:00:00.000Z'),
            application: { status: 'APPROVED' },
          },
        }),
      } as unknown as SessionService,
      {} as never,
      {} as never,
    );

    await expect(service.session('raw-token')).resolves.toMatchObject({
      user: { status: 'SUSPENDED' },
      access: {
        state: 'SUSPENDED',
        suspensionReason: 'POLICY_VIOLATION',
        suspendedUntil: null,
      },
    });
  });

  it('rejects invalid input with field errors', async () => {
    const service = new AuthService(
      {} as PrismaService,
      {} as PasswordHasher,
      {} as SessionService,
      {} as never,
      {} as never,
    );

    await expect(
      service.signup(
        { email: 'bad', password: 'short' },
        { ipAddress: undefined, userAgent: undefined },
        signupEmailContext,
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      fieldErrors: {
        email: expect.any(Array),
        password: expect.any(Array),
      },
    });
  });

  it('maps duplicate signup races to a safe error', async () => {
    const service = new AuthService(
      {
        $transaction: vi.fn().mockRejectedValue({ code: 'P2002' }),
      } as unknown as PrismaService,
      {
        hash: vi.fn().mockResolvedValue('$argon2id$hash'),
      } as unknown as PasswordHasher,
      {} as SessionService,
      {
        issue: vi.fn().mockReturnValue({
          rawToken: 'raw-verification-token',
          tokenHash: 'verification-token-hash',
          expiresAt: new Date('2030-01-01'),
        }),
      } as never,
      {} as never,
    );

    await expect(
      service.signup(
        { email: 'founder@example.com', password: 'long-enough-password' },
        { ipAddress: undefined, userAgent: undefined },
        signupEmailContext,
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 409,
    });
  });

  it('uses the same safe error for unknown email and invalid password', async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const password = {
      hash: vi.fn().mockResolvedValue('$argon2id$dummy'),
      verify,
    } as unknown as PasswordHasher;
    const sessions = {} as SessionService;
    const missing = new AuthService(
      {
        user: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      password,
      sessions,
      {} as never,
      {} as never,
    );
    const existing = new AuthService(
      {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-1',
            email: 'founder@example.com',
            passwordHash: '$argon2id$hash',
            status: 'ACTIVE',
          }),
        },
      } as unknown as PrismaService,
      password,
      sessions,
      {} as never,
      {} as never,
    );
    const input = {
      email: 'founder@example.com',
      password: 'incorrect-password',
    };

    for (const service of [missing, existing]) {
      await expect(
        service.signin(input, {
          ipAddress: undefined,
          userAgent: undefined,
        }),
      ).rejects.toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'The email or password is incorrect.',
        status: 401,
      });
    }
  });
});

describe('SessionService', () => {
  it('stores only a token digest and privacy-preserving IP hash', async () => {
    const create = vi.fn().mockResolvedValue({});
    const service = new SessionService(
      { session: { create } } as unknown as PrismaService,
      config(),
    );
    const result = await service.create('user-1', {
      ipAddress: '203.0.113.8',
      userAgent: 'agent',
    });
    const data = create.mock.calls[0]?.[0].data;

    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data.tokenHash).not.toBe(result.rawToken);
    expect(data.ipHash).not.toContain('203.0.113.8');
    expect(JSON.stringify(data)).not.toContain(result.rawToken);
  });

  it.each([
    ['missing', undefined, null],
    ['unknown', 'A'.repeat(43), null],
    [
      'expired',
      'A'.repeat(43),
      {
        id: 'session',
        revokedAt: null,
        expiresAt: new Date(0),
      },
    ],
    [
      'revoked',
      'A'.repeat(43),
      {
        id: 'session',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 10_000),
      },
    ],
  ])('rejects a %s session safely', async (_name, token, record) => {
    const service = new SessionService(
      {
        session: { findUnique: vi.fn().mockResolvedValue(record) },
      } as unknown as PrismaService,
      config(),
    );
    await expect(service.authenticate(token)).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
      status: 401,
    });
  });

  it('rejects an invalid account state', async () => {
    const service = new SessionService(
      {
        session: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'session',
            revokedAt: null,
            expiresAt: new Date(Date.now() + 10_000),
            user: {
              id: 'user',
              email: 'founder@example.com',
              emailVerifiedAt: new Date(),
              status: 'SUSPENDED',
              deletedAt: null,
              suspendedUntil: null,
              onboardingCompletedAt: null,
              application: null,
            },
          }),
        },
      } as unknown as PrismaService,
      config(),
    );
    await expect(service.authenticate('A'.repeat(43))).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_SUSPENDED',
      status: 403,
    });
  });

  it('defines matching development, production, and clearing cookie policies', () => {
    const development = new SessionService({} as PrismaService, config(false));
    const production = new SessionService({} as PrismaService, config(true));
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    expect(development.cookieOptions(expiresAt)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_LIFETIME_MS,
      expires: expiresAt,
    });
    expect(production.cookieOptions(expiresAt).secure).toBe(true);
    expect(production.clearCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });
  });
});

describe('AuthRateLimiter', () => {
  it('allows attempts through the limit without exposing raw client data', async () => {
    const increment = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    const limiter = new AuthRateLimiter(
      { incrementFixedWindow: increment } as unknown as RedisService,
      {
        hashRateLimitClient: vi.fn().mockReturnValue('private-client-hash'),
      } as unknown as SessionService,
    );

    await limiter.check('signup', '203.0.113.8');
    await limiter.check('signup', '203.0.113.8');

    expect(increment).toHaveBeenCalledWith(
      'auth-rate:v1:signup:private-client-hash',
      900,
    );
    expect(JSON.stringify(increment.mock.calls)).not.toContain('203.0.113.8');
  });

  it('rejects attempts over the limit and fails closed on Redis errors', async () => {
    for (const result of [11, new Error('redis unavailable')]) {
      const increment =
        result instanceof Error
          ? vi.fn().mockRejectedValue(result)
          : vi.fn().mockResolvedValue(result);
      const limiter = new AuthRateLimiter(
        { incrementFixedWindow: increment } as unknown as RedisService,
        {
          hashRateLimitClient: vi.fn().mockReturnValue('hash'),
        } as unknown as SessionService,
      );
      await expect(limiter.check('signin', '127.0.0.1')).rejects.toMatchObject({
        code: 'AUTH_RATE_LIMITED',
        status: 429,
      });
    }
  });

  it('throttles one normalized recipient across rotating client identities', async () => {
    const counts = new Map<string, number>();
    const increment = vi.fn().mockImplementation((key: string) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count;
    });
    const sessions = new SessionService({} as PrismaService, config());
    const limiter = new AuthRateLimiter(
      { incrementFixedWindow: increment } as unknown as RedisService,
      sessions,
    );
    const email = 'victim@example.com';

    for (const address of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      await limiter.check('forgotPassword', address);
      await limiter.checkRecipient('forgotPassword', email);
    }
    await limiter.check('forgotPassword', '198.51.100.4');
    await expect(
      limiter.checkRecipient('forgotPassword', email),
    ).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
      status: 429,
    });

    const keys = [...counts.keys()];
    expect(keys.join(' ')).not.toContain(email);
    expect(keys.filter((key) => key.includes(':recipient:'))).toHaveLength(1);
  });

  it('separates recipient and purpose buckets without plaintext email keys', async () => {
    const keys: string[] = [];
    const limiter = new AuthRateLimiter(
      {
        incrementFixedWindow: vi.fn().mockImplementation((key: string) => {
          keys.push(key);
          return 1;
        }),
      } as unknown as RedisService,
      new SessionService({} as PrismaService, config()),
    );

    await limiter.checkRecipient('resendVerification', 'one@example.com');
    await limiter.checkRecipient('resendVerification', 'two@example.com');
    await limiter.checkRecipient('forgotPassword', 'one@example.com');

    expect(new Set(keys).size).toBe(3);
    expect(keys.join(' ')).not.toMatch(/one@example|two@example/);
    expect(keys[0]).toContain(':recipient:resendVerification:');
    expect(keys[2]).toContain(':recipient:forgotPassword:');
  });
});

describe('OriginGuard', () => {
  const context = (origin: string | undefined) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          header: () => origin,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('accepts trusted origins and rejects missing or untrusted origins', () => {
    const guard = new OriginGuard(config());
    expect(guard.canActivate(context('http://localhost:3000'))).toBe(true);
    for (const origin of [undefined, 'https://attacker.example']) {
      expect(() => guard.canActivate(context(origin))).toThrowError(ApiError);
      try {
        guard.canActivate(context(origin));
      } catch (error) {
        expect(error).toMatchObject({
          code: 'AUTH_FORBIDDEN',
          status: 403,
        });
      }
    }
  });
});
