import type { AddressInfo } from 'node:net';

import type {
  ApiErrorResponse,
  AuthSessionResponse,
} from '@founderchatters/contracts';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { SessionService } from '../src/auth/session.service.js';
import { AppConfig } from '../src/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTrustProxy } from '../src/http/trust-proxy.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://founderchatters:founderchatters@localhost:5432/founderchatters';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.SESSION_SECRET = 'integration-session-secret';
process.env.PASSWORD_PEPPER = 'integration-password-pepper';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('auth/session HTTP integration', () => {
  let app: INestApplication;
  let expressApplication: Express;
  let prisma: PrismaService;
  let sessions: SessionService;
  let baseUrl: string;
  let email: string;
  let cookie: string;
  let userId: string;

  const request = (
    path: string,
    init: RequestInit = {},
    origin = 'http://localhost:3000',
  ) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        origin,
        'content-type': 'application/json',
        ...init.headers,
      },
    });

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    expressApplication = app.getHttpAdapter().getInstance() as Express;
    configureTrustProxy(expressApplication, app.get(AppConfig));
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
    email = `fc005-${Date.now()}@example.com`;

    const redis = createClient({ url: redisUrl });
    await redis.connect();
    const hashes = ['127.0.0.1', '::ffff:127.0.0.1'].map((address) =>
      sessions.hashRateLimitClient(address),
    );
    await redis.del(
      hashes.flatMap((hash) => [
        `auth-rate:v1:signup:${hash}`,
        `auth-rate:v1:signin:${hash}`,
      ]),
    );
    await redis.quit();
  }, 30_000);

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('rejects an untrusted mutation origin with the standard error body', async () => {
    const response = await request(
      '/v1/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password: 'correct horse battery staple',
        }),
      },
      'https://attacker.example',
    );
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      error: {
        code: 'AUTH_FORBIDDEN',
        requestId: expect.any(String),
        fieldErrors: {},
      },
    });
    expect(response.headers.get('x-request-id')).toBe(body.error.requestId);
  });

  it('signs up with normalized email, Argon2id storage, and a safe cookie response', async () => {
    const response = await request('/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: `  ${email.toUpperCase()}  `,
        password: 'correct horse battery staple',
      }),
    });
    const body = (await response.json()) as AuthSessionResponse;
    const setCookie = response.headers.get('set-cookie') ?? '';
    cookie = setCookie.split(';', 1)[0] ?? '';
    const rawToken = cookie.slice(cookie.indexOf('=') + 1);

    expect(response.status).toBe(201);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=2592000');
    expect(setCookie).not.toContain('Secure');
    expect(body).toMatchObject({
      user: {
        email,
        emailVerified: false,
        status: 'ACTIVE',
      },
      access: {
        state: 'VERIFY_EMAIL',
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /passwordHash|tokenHash|correct horse|rawToken/,
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { sessions: true },
    });
    userId = user.id;
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(user.passwordHash).not.toContain('correct horse battery staple');
    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0]?.tokenHash).not.toBe(rawToken);
    expect(user.sessions[0]?.ipHash).toBeTruthy();
  }, 30_000);

  it('handles duplicate email races without returning internals', async () => {
    const response = await request('/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'another valid password',
      }),
    });
    const body = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(JSON.stringify(body)).not.toMatch(/P2002|passwordHash|stack/i);
  }, 30_000);

  it('returns the safe current session and rejects unknown tokens', async () => {
    const valid = await request('/v1/auth/session', {
      headers: { cookie },
    });
    const validBody = (await valid.json()) as AuthSessionResponse;
    expect(valid.status).toBe(200);
    expect(validBody.user).toMatchObject({ id: userId, email });
    expect(JSON.stringify(validBody)).not.toMatch(/passwordHash|tokenHash/);

    const unknown = await request('/v1/auth/session', {
      headers: { cookie: `fc_session=${'A'.repeat(43)}` },
    });
    expect(unknown.status).toBe(401);
    await expect(unknown.json()).resolves.toMatchObject({
      error: { code: 'AUTH_SESSION_EXPIRED' },
    });

    const missing = await request('/v1/auth/session');
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'AUTH_SESSION_EXPIRED' },
    });
  });

  it('revokes only the current session, clears the cookie, and is idempotent', async () => {
    const response = await request('/v1/auth/signout', {
      method: 'POST',
      headers: { cookie },
    });
    expect(response.status).toBe(204);
    const cleared = response.headers.get('set-cookie') ?? '';
    expect(cleared).toContain('fc_session=');
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toContain('SameSite=Lax');
    expect(cleared).toContain('Path=/');

    const session = await prisma.session.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(session.revokedAt).toBeInstanceOf(Date);

    const repeated = await request('/v1/auth/signout', {
      method: 'POST',
    });
    expect(repeated.status).toBe(204);
  });

  it('uses one invalid-credential response and creates a valid signin session', async () => {
    for (const credentials of [
      {
        email: `missing-${email}`,
        password: 'incorrect password value',
      },
      { email, password: 'incorrect password value' },
    ]) {
      const response = await request('/v1/auth/signin', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      const body = (await response.json()) as ApiErrorResponse;
      expect(response.status).toBe(401);
      expect(body.error).toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'The email or password is incorrect.',
      });
    }

    const response = await request('/v1/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email: email.toUpperCase(),
        password: 'correct horse battery staple',
      }),
    });
    expect(response.status).toBe(200);
    cookie = (response.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? '';
    const body = (await response.json()) as AuthSessionResponse;
    expect(body.access.state).toBe('VERIFY_EMAIL');
    expect(await prisma.session.count({ where: { userId } })).toBe(2);
  }, 45_000);

  it('rejects expired and revoked sessions', async () => {
    let current = await prisma.session.findFirstOrThrow({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.session.update({
      where: { id: current.id },
      data: { expiresAt: new Date(0) },
    });
    let response = await request('/v1/auth/session', {
      headers: { cookie },
    });
    expect(response.status).toBe(401);

    const signin = await request('/v1/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'correct horse battery staple',
      }),
    });
    cookie = (signin.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? '';
    current = await prisma.session.findFirstOrThrow({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.session.update({
      where: { id: current.id },
      data: { revokedAt: new Date() },
    });
    response = await request('/v1/auth/session', {
      headers: { cookie },
    });
    expect(response.status).toBe(401);
  }, 30_000);

  it('rejects sessions whose account is no longer eligible', async () => {
    const signin = await request('/v1/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'correct horse battery staple',
      }),
    });
    const activeCookie =
      (signin.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? '';
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });
    try {
      const response = await request('/v1/auth/session', {
        headers: { cookie: activeCookie },
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'AUTH_FORBIDDEN' },
      });
    } finally {
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
    }
  }, 30_000);

  it('persists Redis fixed windows with expiry and resets after expiry', async () => {
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    const key = `fc005:integration:${Date.now()}`;
    try {
      expect(await redis.incr(key)).toBe(1);
      await redis.expire(key, 1);
      expect(await redis.ttl(key)).toBeGreaterThan(0);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect(await redis.incr(key)).toBe(1);
    } finally {
      await redis.del(key);
      await redis.quit();
    }
  });

  it('ignores forwarded client IPs when no proxy is trusted', async () => {
    configureTrustProxy(expressApplication, {
      trustedProxyAddresses: false,
    } as AppConfig);
    const socketKey = `auth-rate:v1:signin:${sessions.hashRateLimitClient('127.0.0.1')}`;
    const spoofedKey = `auth-rate:v1:signin:${sessions.hashRateLimitClient('198.51.100.10')}`;
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    await redis.del([socketKey, spoofedKey]);

    try {
      const response = await request('/v1/auth/signin', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.10' },
        body: JSON.stringify({ email, password: 'short' }),
      });

      expect(response.status).toBe(400);
      expect(await redis.get(socketKey)).toBe('1');
      expect(await redis.get(spoofedKey)).toBeNull();
    } finally {
      await redis.del([socketKey, spoofedKey]);
      await redis.quit();
    }
  });

  it('honors distinct client IPs only behind an explicitly trusted proxy', async () => {
    configureTrustProxy(expressApplication, {
      trustedProxyAddresses: ['127.0.0.1/32', '::ffff:127.0.0.1/128'],
    } as AppConfig);
    const clientAddresses = ['198.51.100.10', '198.51.100.11'];
    const clientKeys = clientAddresses.map(
      (address) =>
        `auth-rate:v1:signin:${sessions.hashRateLimitClient(address)}`,
    );
    const socketKey = `auth-rate:v1:signin:${sessions.hashRateLimitClient('127.0.0.1')}`;
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    await redis.del([...clientKeys, socketKey]);

    try {
      const trustProxy = expressApplication.get('trust proxy fn') as (
        address: string,
        index: number,
      ) => boolean;
      expect(trustProxy('127.0.0.1', 0)).toBe(true);
      expect(trustProxy('203.0.113.200', 0)).toBe(false);

      for (const address of clientAddresses) {
        const response = await request('/v1/auth/signin', {
          method: 'POST',
          headers: { 'x-forwarded-for': address },
          body: JSON.stringify({ email, password: 'short' }),
        });
        expect(response.status).toBe(400);
      }

      await expect(
        Promise.all(clientKeys.map((key) => redis.get(key))),
      ).resolves.toEqual(['1', '1']);
      expect(await redis.get(socketKey)).toBeNull();
    } finally {
      configureTrustProxy(expressApplication, {
        trustedProxyAddresses: false,
      } as AppConfig);
      await redis.del([...clientKeys, socketKey]);
      await redis.quit();
    }
  });

  it('enforces the signin limit without putting credentials in Redis keys', async () => {
    const clientHash = sessions.hashRateLimitClient('127.0.0.1');
    const rateKey = `auth-rate:v1:signin:${clientHash}`;
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    await redis.del(rateKey);

    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await request('/v1/auth/signin', {
          method: 'POST',
          body: JSON.stringify({ email, password: 'short' }),
        });
        expect(response.status).toBe(400);
      }
      const rejected = await request('/v1/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'short' }),
      });
      expect(rejected.status).toBe(429);
      await expect(rejected.json()).resolves.toMatchObject({
        error: { code: 'AUTH_RATE_LIMITED' },
      });
      expect(rateKey).not.toContain(email);
      expect(rateKey).not.toContain('short');
      expect(await redis.ttl(rateKey)).toBeGreaterThan(0);
    } finally {
      await redis.del(rateKey);
      await redis.quit();
    }
  });
});
