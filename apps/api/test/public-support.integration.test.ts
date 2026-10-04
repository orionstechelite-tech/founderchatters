import type { AddressInfo } from 'node:net';

import { createClient } from 'redis';
import { PUBLIC_SUPPORT_LIMITS } from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { SessionService } from '../src/auth/session.service.js';
import { AppConfig } from '../src/config.js';
import { PrismaService } from '../src/database/prisma.service.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://founderchatters:founderchatters@localhost:5432/founderchatters';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.SESSION_SECRET = 'integration-session-secret';
process.env.PASSWORD_PEPPER = 'integration-password-pepper';
process.env.AUTH_TOKEN_SECRET = 'integration-auth-token-secret';
process.env.EMAIL_PROVIDER = 'memory';
process.env.WEB_URL = 'http://localhost:3000';

const SECRET_BODY = 'FC020-SUPPORT-MESSAGE-SHOULD-NOT-ECHO';

describe('public support HTTP integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessions: SessionService;
  let config: AppConfig;
  let baseUrl: string;
  const userIds: string[] = [];
  const caseIds: string[] = [];
  const rateEmails: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
    config = app.get(AppConfig);
  });

  beforeEach(async () => {
    await clearRateLimits();
  });

  afterAll(async () => {
    try {
      if (caseIds.length > 0) {
        await prisma.supportMessage.deleteMany({
          where: { caseId: { in: caseIds } },
        });
        await prisma.supportCase.deleteMany({ where: { id: { in: caseIds } } });
      }
      if (userIds.length > 0) {
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await clearRateLimits();
    } finally {
      await app.close();
    }
  });

  function trackEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    rateEmails.push(normalized);
    return email;
  }

  function uniqueEmail(label: string): string {
    return trackEmail(
      `fc020-${label}-${Date.now()}-${rateEmails.length}@example.com`,
    );
  }

  async function clearRateLimits(): Promise<void> {
    const hashes = ['127.0.0.1', '::ffff:127.0.0.1', 'unknown'].map((address) =>
      sessions.hashRateLimitClient(address),
    );
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    try {
      const keys = [
        ...hashes.map((hash) => `support-rate:v1:create:${hash}`),
        ...rateEmails.map(
          (email) =>
            `support-rate:v1:email:${sessions.hashRateLimitRecipient('public-support', email)}`,
        ),
      ];
      if (keys.length > 0) await redis.del(keys);
    } finally {
      await redis.quit();
    }
  }

  async function account(
    label: string,
    status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
  ) {
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: '$argon2id$test-only',
        emailVerifiedAt: null,
        status,
      },
    });
    userIds.push(user.id);
    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FC-020 integration test',
    });
    return {
      id: user.id,
      email: user.email,
      cookie: `${config.sessionCookieName}=${session.rawToken}`,
    };
  }

  function request(
    path: string,
    init: RequestInit = {},
    origin: string | null = 'http://localhost:3000',
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(origin ? { origin } : {}),
        ...init.headers,
      },
    });
  }

  async function createCase(
    body: Record<string, unknown>,
    cookie?: string,
    origin: string | null = 'http://localhost:3000',
  ): Promise<Response> {
    if (typeof body.email === 'string') {
      trackEmail(body.email);
    }
    return request(
      '/v1/support/cases',
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: cookie ? { cookie } : {},
      },
      origin,
    );
  }

  it('lets a guest create an OPEN case with a GUEST first message', async () => {
    const email = uniqueEmail('guest');
    const response = await createCase({
      category: 'account',
      email: `  ${email.toUpperCase()} `,
      subject: 'Cannot access my account',
      message: SECRET_BODY,
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      caseId: string;
      status: string;
      message?: string;
    };
    caseIds.push(payload.caseId);
    expect(payload).toEqual({ caseId: payload.caseId, status: 'OPEN' });
    expect(JSON.stringify(payload)).not.toContain(SECRET_BODY);
    expect(payload).not.toHaveProperty('message');

    const stored = await prisma.supportCase.findUniqueOrThrow({
      where: { id: payload.caseId },
      include: { messages: true },
    });
    expect(stored.status).toBe('OPEN');
    expect(stored.userId).toBeNull();
    expect(stored.email).toBe(email);
    expect(stored.messages).toHaveLength(1);
    expect(stored.messages[0]?.actorType).toBe('GUEST');
    expect(stored.messages[0]?.actorId).toBeNull();
    expect(stored.messages[0]?.body).toBe(SECRET_BODY);
  });

  it('treats a stale session cookie as a guest', async () => {
    const email = uniqueEmail('stale-guest');
    const response = await createCase(
      {
        category: 'other',
        email,
        subject: 'Stale cookie',
        message: 'Please help.',
      },
      `${config.sessionCookieName}=not-a-valid-session-token`,
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { caseId: string };
    caseIds.push(payload.caseId);
    const stored = await prisma.supportCase.findUniqueOrThrow({
      where: { id: payload.caseId },
      include: { messages: true },
    });
    expect(stored.userId).toBeNull();
    expect(stored.email).toBe(email);
    expect(stored.messages[0]?.actorType).toBe('GUEST');
    expect(stored.messages[0]?.actorId).toBeNull();
  });

  it('associates a signed-in account and ignores a mismatched client email', async () => {
    const user = await account('signed-in');
    const response = await createCase(
      {
        category: 'application',
        email: 'attacker@example.com',
        subject: 'Application question',
        message: 'When will my application be reviewed?',
      },
      user.cookie,
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { caseId: string };
    caseIds.push(payload.caseId);
    const stored = await prisma.supportCase.findUniqueOrThrow({
      where: { id: payload.caseId },
      include: { messages: true },
    });
    expect(stored.userId).toBe(user.id);
    expect(stored.email).toBe(user.email);
    expect(stored.email).not.toBe('attacker@example.com');
    expect(stored.messages[0]?.actorType).toBe('USER');
    expect(stored.messages[0]?.actorId).toBe(user.id);
  });

  it('does not require an ACTIVE member and still helps a suspended user', async () => {
    const suspended = await account('suspended', 'SUSPENDED');
    const response = await createCase(
      {
        category: 'safety',
        email: suspended.email,
        subject: 'Need help while suspended',
        message: 'I need to contact support.',
      },
      suspended.cookie,
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { caseId: string };
    caseIds.push(payload.caseId);
    const stored = await prisma.supportCase.findUniqueOrThrow({
      where: { id: payload.caseId },
    });
    expect(stored.userId).toBe(suspended.id);
  });

  it('does not associate a currently deleted account after locked re-read', async () => {
    const user = await account('already-deleted');
    const submitted = uniqueEmail('deleted-fallback');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });
    const response = await createCase(
      {
        category: 'account',
        email: submitted,
        subject: 'Help after deletion',
        message: 'I still need support.',
      },
      user.cookie,
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { caseId: string };
    caseIds.push(payload.caseId);
    const stored = await prisma.supportCase.findUniqueOrThrow({
      where: { id: payload.caseId },
      include: { messages: true },
    });
    expect(stored.userId).toBeNull();
    expect(stored.email).toBe(submitted);
    expect(stored.email).not.toBe(user.email);
    expect(stored.messages[0]?.actorType).toBe('GUEST');
    expect(stored.messages[0]?.actorId).toBeNull();
  });

  it('rejects invalid categories, unknown fields, and invalid text', async () => {
    const invalidCategory = await createCase({
      category: 'billing',
      email: uniqueEmail('invalid-category'),
      subject: 'Hello',
      message: 'Body',
    });
    expect(invalidCategory.status).toBe(400);

    const unknownField = await createCase({
      category: 'other',
      email: uniqueEmail('unknown-field'),
      subject: 'Hello',
      message: 'Body',
      ticketId: 'nope',
    });
    expect(unknownField.status).toBe(400);

    const invalidEmail = await createCase({
      category: 'other',
      email: 'not-an-email',
      subject: 'Hello',
      message: 'Body',
    });
    expect(invalidEmail.status).toBe(400);

    const emptySubject = await createCase({
      category: 'other',
      email: uniqueEmail('empty-subject'),
      subject: '   ',
      message: 'Body',
    });
    expect(emptySubject.status).toBe(400);

    const longSubject = await createCase({
      category: 'other',
      email: uniqueEmail('long-subject'),
      subject: 's'.repeat(161),
      message: 'Body',
    });
    expect(longSubject.status).toBe(400);

    const emptyMessage = await createCase({
      category: 'other',
      email: uniqueEmail('empty-message'),
      subject: 'Hello',
      message: '',
    });
    expect(emptyMessage.status).toBe(400);

    const longMessage = await createCase({
      category: 'other',
      email: uniqueEmail('long-message'),
      subject: 'Hello',
      message: 'm'.repeat(5001),
    });
    expect(longMessage.status).toBe(400);
  });

  it('requires OriginGuard and has no public list or detail browsing', async () => {
    const missingOrigin = await createCase(
      {
        category: 'privacy',
        email: uniqueEmail('origin'),
        subject: 'Privacy question',
        message: 'How do you handle DMs?',
      },
      undefined,
      null,
    );
    expect(missingOrigin.status).toBe(403);

    const list = await request('/v1/support/cases');
    expect(list.status).toBe(404);
    const detail = await request('/v1/support/cases/does-not-exist');
    expect(detail.status).toBe(404);
  });

  it('allows five submissions and rejects the sixth in the abuse window', async () => {
    for (
      let index = 0;
      index < PUBLIC_SUPPORT_LIMITS.submissionsPerWindow;
      index += 1
    ) {
      const response = await createCase({
        category: 'technical',
        email: uniqueEmail(`rate-${index}`),
        subject: `Rate ${index}`,
        message: 'Rate-limit fixture.',
      });
      expect(response.status).toBe(201);
      const payload = (await response.json()) as { caseId: string };
      caseIds.push(payload.caseId);
    }
    const blocked = await createCase({
      category: 'technical',
      email: uniqueEmail('rate-blocked'),
      subject: 'Too many',
      message: 'Should be limited.',
    });
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({
      error: { code: 'PUBLIC_SUPPORT_RATE_LIMITED' },
    });
  });
});
