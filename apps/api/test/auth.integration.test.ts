import type { AddressInfo } from 'node:net';

import type {
  ApiErrorResponse,
  AuthSessionResponse,
} from '@founderchatters/contracts';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { AUTH_RATE_LIMITS } from '../src/auth/auth-rate-limiter.js';
import { AuthTokenService } from '../src/auth/auth-token.service.js';
import { InMemoryEmailDelivery } from '../src/auth/email-delivery.service.js';
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
process.env.AUTH_TOKEN_SECRET = 'integration-auth-token-secret';
process.env.EMAIL_PROVIDER = 'memory';
process.env.WEB_URL = 'http://localhost:3000';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('auth/session HTTP integration', () => {
  let app: INestApplication;
  let expressApplication: Express;
  let prisma: PrismaService;
  let sessions: SessionService;
  let authTokens: AuthTokenService;
  let emailDelivery: InMemoryEmailDelivery;
  let baseUrl: string;
  let email: string;
  let cookie: string;
  let userId: string;
  let recoveryUserId: string;
  let recoveryEmail: string;

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
    authTokens = app.get(AuthTokenService);
    emailDelivery = app.get(InMemoryEmailDelivery);
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
        `auth-rate:v1:resendVerification:${hash}`,
        `auth-rate:v1:verifyEmail:${hash}`,
        `auth-rate:v1:forgotPassword:${hash}`,
        `auth-rate:v1:resetPassword:${hash}`,
      ]),
    );
    await redis.quit();
  }, 30_000);

  afterAll(async () => {
    try {
      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      if (recoveryUserId) {
        await prisma.auditLog.deleteMany({
          where: { targetType: 'User', targetId: recoveryUserId },
        });
        await prisma.user.deleteMany({ where: { id: recoveryUserId } });
      }
    } finally {
      await app.close();
    }
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

  it('rolls back signup and returns a safe error when delivery fails', async () => {
    const failedEmail = `delivery-failure-${Date.now()}@example.com`;
    const delivery = vi
      .spyOn(emailDelivery, 'send')
      .mockRejectedValueOnce(new Error('provider-internal-secret'));
    const response = await request('/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: failedEmail,
        password: 'correct horse battery staple',
      }),
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId: expect.any(String),
      },
    });
    expect(
      await prisma.user.findUnique({ where: { email: failedEmail } }),
    ).toBeNull();
    delivery.mockRestore();
  }, 30_000);

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
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        access: { state: 'SUSPENDED' },
      });
    } finally {
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
    }
  }, 30_000);

  it('issues hashed, expiring, purpose-scoped verification tokens', async () => {
    recoveryEmail = `fc006-${Date.now()}@example.com`;
    emailDelivery.clear();
    const signup = await request('/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: recoveryEmail,
        password: 'original recovery password',
      }),
    });
    expect(signup.status).toBe(201);
    const signupBody = await signup.text();

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: recoveryEmail },
    });
    recoveryUserId = user.id;
    const firstMessage = emailDelivery
      .getMessages()
      .find((message) => message.kind === 'verification');
    expect(firstMessage?.kind).toBe('verification');
    if (!firstMessage || firstMessage.kind !== 'verification') {
      throw new Error('Expected verification email');
    }
    const firstToken = new URL(firstMessage.verifyUrl).searchParams.get(
      'token',
    );
    if (!firstToken) {
      throw new Error('Expected raw verification token');
    }
    expect(signupBody).not.toContain(firstToken);
    const firstRecord = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: recoveryUserId },
    });
    expect(firstRecord.tokenHash).not.toBe(firstToken);
    expect(firstRecord.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const deliveryLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const failedDelivery = vi
      .spyOn(emailDelivery, 'send')
      .mockRejectedValueOnce(new Error('provider-secret:raw-token'));
    const failedResend = await request('/v1/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: recoveryEmail }),
    });
    expect(failedResend.status).toBe(202);
    await expect(failedResend.json()).resolves.toEqual({ accepted: true });
    expect(
      (
        await prisma.emailVerificationToken.findUniqueOrThrow({
          where: { id: firstRecord.id },
        })
      ).usedAt,
    ).toBeNull();
    expect(
      await prisma.emailVerificationToken.count({
        where: { userId: recoveryUserId, usedAt: null },
      }),
    ).toBe(1);
    const sanitizedLog = JSON.stringify(deliveryLog.mock.calls);
    expect(sanitizedLog).toContain('auth_email_failure');
    expect(sanitizedLog).not.toMatch(
      /provider-secret|raw-token|fc006-.*@example\.com/,
    );
    failedDelivery.mockRestore();
    deliveryLog.mockRestore();

    const missingResend = await request('/v1/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: `missing-${recoveryEmail}` }),
    });
    const resend = await request('/v1/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: recoveryEmail }),
    });
    expect(missingResend.status).toBe(202);
    expect(resend.status).toBe(202);
    expect(await missingResend.json()).toEqual(await resend.json());
    const verificationMessages = emailDelivery
      .getMessages()
      .filter((message) => message.kind === 'verification');
    const secondMessage = verificationMessages.at(-1);
    if (!secondMessage || secondMessage.kind !== 'verification') {
      throw new Error('Expected reissued verification email');
    }
    const secondToken = new URL(secondMessage.verifyUrl).searchParams.get(
      'token',
    );
    expect(secondToken).toBeTruthy();
    expect(
      (
        await prisma.emailVerificationToken.findUniqueOrThrow({
          where: { id: firstRecord.id },
        })
      ).usedAt,
    ).toBeInstanceOf(Date);

    const wrongPurpose = await request('/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: secondToken,
        password: 'replacement recovery password',
        confirmPassword: 'replacement recovery password',
      }),
    });
    expect(wrongPurpose.status).toBe(400);
    await expect(wrongPurpose.json()).resolves.toMatchObject({
      error: { code: 'RESET_TOKEN_INVALID' },
    });

    const currentRecord = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: recoveryUserId, usedAt: null },
    });
    await prisma.emailVerificationToken.update({
      where: { id: currentRecord.id },
      data: { expiresAt: new Date(0) },
    });
    const expired = await request('/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: secondToken }),
    });
    expect(expired.status).toBe(400);
    await expect(expired.json()).resolves.toMatchObject({
      error: { code: 'VERIFY_TOKEN_EXPIRED' },
    });

    const recipientRedis = createClient({ url: redisUrl });
    await recipientRedis.connect();
    const recipientRateKey = `auth-rate:v1:recipient:resendVerification:${sessions.hashRateLimitRecipient('resendVerification', recoveryEmail)}`;
    await recipientRedis.del(recipientRateKey);
    await recipientRedis.quit();

    const messagesBeforeConcurrentResend = emailDelivery
      .getMessages()
      .filter((message) => message.kind === 'verification').length;
    const concurrentResends = await Promise.all([
      request('/v1/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: recoveryEmail }),
      }),
      request('/v1/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: recoveryEmail }),
      }),
    ]);
    expect(concurrentResends.map((response) => response.status)).toEqual([
      202, 202,
    ]);
    const concurrentMessages = emailDelivery
      .getMessages()
      .filter((message) => message.kind === 'verification')
      .slice(messagesBeforeConcurrentResend);
    expect(concurrentMessages).toHaveLength(2);
    const concurrentTokens = concurrentMessages.map((message) => {
      if (message.kind !== 'verification') {
        throw new Error('Expected concurrent verification email');
      }
      const rawToken = new URL(message.verifyUrl).searchParams.get('token');
      if (!rawToken) {
        throw new Error('Expected concurrent verification token');
      }
      return rawToken;
    });
    const activeVerificationTokens =
      await prisma.emailVerificationToken.findMany({
        where: { userId: recoveryUserId, usedAt: null },
      });
    expect(activeVerificationTokens).toHaveLength(1);
    const validConcurrentToken = concurrentTokens.find(
      (rawToken) =>
        authTokens.hash('email-verification', rawToken) ===
        activeVerificationTokens[0]?.tokenHash,
    );
    if (!validConcurrentToken) {
      throw new Error('Expected one valid concurrent verification token');
    }

    const redemptionResponses = await Promise.all([
      request('/v1/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: validConcurrentToken }),
      }),
      request('/v1/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: validConcurrentToken }),
      }),
    ]);
    expect(
      redemptionResponses.map((response) => response.status).sort(),
    ).toEqual([200, 400]);
    const redemptionBodies = await Promise.all(
      redemptionResponses.map((response) => response.json()),
    );
    expect(redemptionBodies).toContainEqual({ verified: true });
    expect(redemptionBodies).toContainEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VERIFY_TOKEN_INVALID' }),
      }),
    );
    expect(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: recoveryUserId },
        })
      ).emailVerifiedAt,
    ).toBeInstanceOf(Date);
    expect(
      await prisma.auditLog.count({
        where: {
          actorUserId: recoveryUserId,
          action: 'AUTH_EMAIL_VERIFIED',
        },
      }),
    ).toBe(1);
  }, 45_000);

  it('keeps reset requests enumeration-safe and revokes sessions on use', async () => {
    const messagesBefore = emailDelivery.getMessages().length;
    const missing = await request('/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: `missing-${recoveryEmail}` }),
    });
    const existing = await request('/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: recoveryEmail }),
    });
    expect(missing.status).toBe(202);
    expect(existing.status).toBe(202);
    expect(await missing.json()).toEqual(await existing.json());
    expect(emailDelivery.getMessages()).toHaveLength(messagesBefore + 1);

    const resetMessage = emailDelivery.getMessages().at(-1);
    if (!resetMessage || resetMessage.kind !== 'password-reset') {
      throw new Error('Expected password reset email');
    }
    const resetToken = resetMessage.resetUrl.split('/').at(-1);
    expect(resetToken).toBeTruthy();
    const resetRecord = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: recoveryUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(resetRecord.tokenHash).not.toBe(resetToken);

    const failedResetDelivery = vi
      .spyOn(emailDelivery, 'send')
      .mockRejectedValueOnce(new Error('provider reset failure'));
    const failedRequest = await request('/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: recoveryEmail }),
    });
    expect(failedRequest.status).toBe(202);
    await expect(failedRequest.json()).resolves.toEqual({ accepted: true });
    expect(
      (
        await prisma.passwordResetToken.findUniqueOrThrow({
          where: { id: resetRecord.id },
        })
      ).usedAt,
    ).toBeNull();
    expect(
      await prisma.passwordResetToken.count({
        where: { userId: recoveryUserId, usedAt: null },
      }),
    ).toBe(1);
    failedResetDelivery.mockRestore();

    await prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { expiresAt: new Date(0) },
    });
    const expired = await request('/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: resetToken,
        password: 'replacement recovery password',
        confirmPassword: 'replacement recovery password',
      }),
    });
    expect(expired.status).toBe(400);
    await expect(expired.json()).resolves.toMatchObject({
      error: { code: 'RESET_TOKEN_EXPIRED' },
    });

    const forgotRecipientRedis = createClient({ url: redisUrl });
    await forgotRecipientRedis.connect();
    const forgotRecipientKey = `auth-rate:v1:recipient:forgotPassword:${sessions.hashRateLimitRecipient('forgotPassword', recoveryEmail)}`;
    await forgotRecipientRedis.del(forgotRecipientKey);
    await forgotRecipientRedis.quit();

    const resetMessagesBeforeConcurrent = emailDelivery
      .getMessages()
      .filter((message) => message.kind === 'password-reset').length;
    const concurrentForgot = await Promise.all([
      request('/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: recoveryEmail }),
      }),
      request('/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: recoveryEmail }),
      }),
    ]);
    expect(concurrentForgot.map((response) => response.status)).toEqual([
      202, 202,
    ]);
    const concurrentResetMessages = emailDelivery
      .getMessages()
      .filter((message) => message.kind === 'password-reset')
      .slice(resetMessagesBeforeConcurrent);
    expect(concurrentResetMessages).toHaveLength(2);
    const concurrentResetTokens = concurrentResetMessages.map((message) => {
      if (message.kind !== 'password-reset') {
        throw new Error('Expected concurrent password reset email');
      }
      const rawToken = message.resetUrl.split('/').at(-1);
      if (!rawToken) {
        throw new Error('Expected concurrent password reset token');
      }
      return rawToken;
    });
    const activeResetTokens = await prisma.passwordResetToken.findMany({
      where: { userId: recoveryUserId, usedAt: null },
    });
    expect(activeResetTokens).toHaveLength(1);
    const validToken = concurrentResetTokens.find(
      (rawToken) =>
        authTokens.hash('password-reset', rawToken) ===
        activeResetTokens[0]?.tokenHash,
    );
    if (!validToken) {
      throw new Error('Expected one valid concurrent password reset token');
    }
    const signin = await request('/v1/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email: recoveryEmail,
        password: 'original recovery password',
      }),
    });
    expect(signin.status).toBe(200);
    expect(
      await prisma.session.count({
        where: { userId: recoveryUserId, revokedAt: null },
      }),
    ).toBeGreaterThan(0);

    const reset = await request('/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: validToken,
        password: 'replacement recovery password',
        confirmPassword: 'replacement recovery password',
      }),
    });
    expect(reset.status).toBe(200);
    await expect(reset.json()).resolves.toEqual({ passwordReset: true });
    expect(
      await prisma.session.count({
        where: { userId: recoveryUserId, revokedAt: null },
      }),
    ).toBe(0);
    const changedUser = await prisma.user.findUniqueOrThrow({
      where: { id: recoveryUserId },
    });
    expect(changedUser.passwordHash).toMatch(/^\$argon2id\$/);
    expect(changedUser.passwordHash).not.toContain(
      'replacement recovery password',
    );
    expect(
      await prisma.auditLog.count({
        where: {
          actorUserId: recoveryUserId,
          action: 'AUTH_PASSWORD_RESET',
        },
      }),
    ).toBe(1);

    const replay = await request('/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: validToken,
        password: 'another replacement password',
        confirmPassword: 'another replacement password',
      }),
    });
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({
      error: { code: 'RESET_TOKEN_INVALID' },
    });

    const oldPassword = await request('/v1/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email: recoveryEmail,
        password: 'original recovery password',
      }),
    });
    expect(oldPassword.status).toBe(401);
    const newPassword = await request('/v1/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email: recoveryEmail,
        password: 'replacement recovery password',
      }),
    });
    expect(newPassword.status).toBe(200);
  }, 60_000);

  it('preserves previously valid recovery tokens when replacement delivery fails', async () => {
    const sourceUser = await prisma.user.findUniqueOrThrow({
      where: { id: recoveryUserId },
      select: { passwordHash: true },
    });
    const deliveryFailureEmail = `delivery-recovery-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email: deliveryFailureEmail,
        passwordHash: sourceUser.passwordHash,
      },
    });
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    const clientHashes = ['127.0.0.1', '::ffff:127.0.0.1'].map((address) =>
      sessions.hashRateLimitClient(address),
    );
    await redis.del(
      clientHashes.flatMap((hash) => [
        `auth-rate:v1:resendVerification:${hash}`,
        `auth-rate:v1:forgotPassword:${hash}`,
      ]),
    );
    await redis.quit();

    try {
      const verification = authTokens.issue('email-verification');
      const originalVerification = await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: verification.tokenHash,
          expiresAt: verification.expiresAt,
        },
      });
      const failedResend = vi
        .spyOn(emailDelivery, 'send')
        .mockRejectedValueOnce(new Error('provider unavailable'));
      const resendResponse = await request('/v1/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: deliveryFailureEmail }),
      });
      failedResend.mockRestore();

      expect(resendResponse.status).toBe(202);
      expect(await resendResponse.json()).toEqual({ accepted: true });
      await expect(
        prisma.emailVerificationToken.findUniqueOrThrow({
          where: { id: originalVerification.id },
          select: { usedAt: true },
        }),
      ).resolves.toEqual({ usedAt: null });
      expect(
        await prisma.emailVerificationToken.count({
          where: { userId: user.id },
        }),
      ).toBe(1);
      const verifyResponse = await request('/v1/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verification.rawToken }),
      });
      expect(verifyResponse.status).toBe(200);

      const reset = authTokens.issue('password-reset');
      const originalReset = await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: reset.tokenHash,
          expiresAt: reset.expiresAt,
        },
      });
      const failedForgot = vi
        .spyOn(emailDelivery, 'send')
        .mockRejectedValueOnce(new Error('provider unavailable'));
      const forgotResponse = await request('/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: deliveryFailureEmail }),
      });
      failedForgot.mockRestore();

      expect(forgotResponse.status).toBe(202);
      expect(await forgotResponse.json()).toEqual({ accepted: true });
      await expect(
        prisma.passwordResetToken.findUniqueOrThrow({
          where: { id: originalReset.id },
          select: { usedAt: true },
        }),
      ).resolves.toEqual({ usedAt: null });
      expect(
        await prisma.passwordResetToken.count({
          where: { userId: user.id },
        }),
      ).toBe(1);
      const resetResponse = await request('/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: reset.rawToken,
          password: 'replacement after delivery failure',
          confirmPassword: 'replacement after delivery failure',
        }),
      });
      expect(resetResponse.status).toBe(200);
    } finally {
      vi.restoreAllMocks();
      await prisma.auditLog.deleteMany({
        where: { targetType: 'User', targetId: user.id },
      });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 30_000);

  it('applies trusted-origin protection to recovery mutations', async () => {
    const response = await request(
      '/v1/auth/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email: recoveryEmail }),
      },
      'https://attacker.example',
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AUTH_FORBIDDEN' },
    });
  });

  it('throttles forgot-password recipients across rotating trusted client IPs', async () => {
    configureTrustProxy(expressApplication, {
      trustedProxyAddresses: ['127.0.0.1/32', '::ffff:127.0.0.1/128'],
    } as AppConfig);
    const target = `recipient-${recoveryEmail}`;
    const recipientKey = `auth-rate:v1:recipient:forgotPassword:${sessions.hashRateLimitRecipient('forgotPassword', target)}`;
    const addresses = [
      '198.51.100.31',
      '198.51.100.32',
      '198.51.100.33',
      '198.51.100.34',
      '198.51.100.35',
    ];
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    const ipKeys = addresses.map(
      (address) =>
        `auth-rate:v1:forgotPassword:${sessions.hashRateLimitClient(address)}`,
    );
    await redis.del([recipientKey, ...ipKeys]);
    try {
      for (const address of addresses.slice(0, 3)) {
        const response = await request('/v1/auth/forgot-password', {
          method: 'POST',
          headers: { 'x-forwarded-for': address },
          body: JSON.stringify({ email: target }),
        });
        expect(response.status).toBe(202);
        await expect(response.json()).resolves.toEqual({ accepted: true });
      }
      const rejected = await request('/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'x-forwarded-for': addresses[3] },
        body: JSON.stringify({ email: target }),
      });
      expect(rejected.status).toBe(429);
      await expect(rejected.json()).resolves.toMatchObject({
        error: { code: 'AUTH_RATE_LIMITED' },
      });

      const otherRecipient = await request('/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'x-forwarded-for': addresses[4] },
        body: JSON.stringify({ email: `other-${target}` }),
      });
      expect(otherRecipient.status).toBe(202);
      expect(recipientKey).not.toContain(target);
      expect(await redis.ttl(recipientKey)).toBeGreaterThan(0);
    } finally {
      configureTrustProxy(expressApplication, {
        trustedProxyAddresses: false,
      } as AppConfig);
      await redis.del([recipientKey, ...ipKeys]);
      await redis.quit();
    }
  });

  it('enforces the resend recipient limit independently of client IP', async () => {
    configureTrustProxy(expressApplication, {
      trustedProxyAddresses: ['127.0.0.1/32', '::ffff:127.0.0.1/128'],
    } as AppConfig);
    const recipientKey = `auth-rate:v1:recipient:resendVerification:${sessions.hashRateLimitRecipient('resendVerification', recoveryEmail)}`;
    const addresses = [
      '198.51.100.41',
      '198.51.100.42',
      '198.51.100.43',
      '198.51.100.44',
    ];
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    const ipKeys = addresses.map(
      (address) =>
        `auth-rate:v1:resendVerification:${sessions.hashRateLimitClient(address)}`,
    );
    await redis.del([recipientKey, ...ipKeys]);
    try {
      for (const address of addresses.slice(0, 3)) {
        const response = await request('/v1/auth/resend-verification', {
          method: 'POST',
          headers: { 'x-forwarded-for': address },
          body: JSON.stringify({ email: recoveryEmail }),
        });
        expect(response.status).toBe(202);
      }
      const rejected = await request('/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'x-forwarded-for': addresses[3] },
        body: JSON.stringify({ email: recoveryEmail }),
      });
      expect(rejected.status).toBe(429);
      await expect(rejected.json()).resolves.toMatchObject({
        error: { code: 'AUTH_RATE_LIMITED' },
      });
      expect(recipientKey).not.toContain(recoveryEmail);
    } finally {
      configureTrustProxy(expressApplication, {
        trustedProxyAddresses: false,
      } as AppConfig);
      await redis.del([recipientKey, ...ipKeys]);
      await redis.quit();
    }
  });

  it.each([
    [
      'resendVerification',
      '/v1/auth/resend-verification',
      { email: 'x@example.com' },
    ],
    ['verifyEmail', '/v1/auth/verify-email', { token: 'invalid-token' }],
    [
      'resetPassword',
      '/v1/auth/reset-password',
      {
        token: 'invalid-token',
        password: 'replacement password',
        confirmPassword: 'replacement password',
      },
    ],
  ] as const)(
    'enforces the %s client Redis limit',
    async (action, path, body) => {
      const hashes = ['127.0.0.1', '::ffff:127.0.0.1'].map((address) =>
        sessions.hashRateLimitClient(address),
      );
      const keys = hashes.map((hash) => `auth-rate:v1:${action}:${hash}`);
      const redis = createClient({ url: redisUrl });
      await redis.connect();
      try {
        await Promise.all(
          keys.map((key) =>
            redis.set(key, String(AUTH_RATE_LIMITS[action]), { EX: 900 }),
          ),
        );
        const response = await request(path, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(429);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: 'AUTH_RATE_LIMITED' },
        });
      } finally {
        await redis.del(keys);
        await redis.quit();
      }
    },
  );

  it('rate limits reset requests without putting email in Redis keys', async () => {
    const clientHash = sessions.hashRateLimitClient('127.0.0.1');
    const rateKey = `auth-rate:v1:forgotPassword:${clientHash}`;
    const redis = createClient({ url: redisUrl });
    await redis.connect();
    await redis.del(rateKey);
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await request('/v1/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({
            email: `rate-${attempt}-${recoveryEmail}`,
          }),
        });
        expect(response.status).toBe(202);
      }
      const rejected = await request('/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: recoveryEmail }),
      });
      expect(rejected.status).toBe(429);
      await expect(rejected.json()).resolves.toMatchObject({
        error: { code: 'AUTH_RATE_LIMITED' },
      });
      expect(rateKey).not.toContain(recoveryEmail);
      expect(await redis.ttl(rateKey)).toBeGreaterThan(0);
    } finally {
      await redis.del(rateKey);
      await redis.quit();
    }
  });

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
