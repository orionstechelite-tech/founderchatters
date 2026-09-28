import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthRateLimiter } from '../src/auth/auth-rate-limiter.js';
import { AuthService } from '../src/auth/auth.service.js';
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
    sessionSecret: 'test-session-secret',
    passwordPepper: 'test-password-pepper',
    allowedOrigins: new Set(['http://localhost:3000']),
  }) as AppConfig;

const CONFIG_ENVIRONMENT_KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'REDIS_URL',
  'ALLOWED_ORIGINS',
  'SESSION_SECRET',
  'PASSWORD_PEPPER',
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

  it('requires production secrets and enables Secure cookies', () => {
    withEnvironment(
      {
        ...requiredEnvironment,
        NODE_ENV: 'production',
        SESSION_SECRET: 's'.repeat(32),
        PASSWORD_PEPPER: 'p'.repeat(32),
        TRUST_PROXY_ADDRESSES: 'none',
      },
      () => {
        const runtimeConfig = new AppConfig();
        const sessions = new SessionService({} as PrismaService, runtimeConfig);

        expect(runtimeConfig.trustedProxyAddresses).toBe(false);
        expect(sessions.cookieOptions(new Date()).secure).toBe(true);
      },
    );

    withEnvironment(
      {
        ...requiredEnvironment,
        NODE_ENV: 'production',
        PASSWORD_PEPPER: 'p'.repeat(32),
        TRUST_PROXY_ADDRESSES: 'none',
      },
      () => {
        expect(() => new AppConfig()).toThrow(/SESSION_SECRET is required/);
      },
    );
    withEnvironment(
      {
        ...requiredEnvironment,
        NODE_ENV: 'production',
        SESSION_SECRET: 's'.repeat(32),
        TRUST_PROXY_ADDRESSES: 'none',
      },
      () => {
        expect(() => new AppConfig()).toThrow(/PASSWORD_PEPPER is required/);
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
          ...requiredEnvironment,
          NODE_ENV: 'production',
          SESSION_SECRET: 's'.repeat(32),
          PASSWORD_PEPPER: 'p'.repeat(32),
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
        ...requiredEnvironment,
        NODE_ENV: 'production',
        SESSION_SECRET: 's'.repeat(32),
        PASSWORD_PEPPER: 'p'.repeat(32),
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
    const transaction = { user: { create: userCreate } };
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
    );

    const result = await service.signup(
      { email: '  Founder@Example.COM ', password: 'long-enough-password' },
      { ipAddress: '127.0.0.1', userAgent: 'test' },
    );

    expect(hash).toHaveBeenCalledWith('long-enough-password');
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        email: 'founder@example.com',
        passwordHash: '$argon2id$hash',
      },
    });
    expect(JSON.stringify(result.response)).not.toMatch(
      /passwordHash|tokenHash|raw-token/,
    );
    expect(result.response.access.state).toBe('VERIFY_EMAIL');
  });

  it('rejects invalid input with field errors', async () => {
    const service = new AuthService(
      {} as PrismaService,
      {} as PasswordHasher,
      {} as SessionService,
    );

    await expect(
      service.signup(
        { email: 'bad', password: 'short' },
        { ipAddress: undefined, userAgent: undefined },
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
    );

    await expect(
      service.signup(
        { email: 'founder@example.com', password: 'long-enough-password' },
        { ipAddress: undefined, userAgent: undefined },
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
      code: 'AUTH_FORBIDDEN',
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
