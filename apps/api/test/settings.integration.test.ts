import type { AddressInfo } from 'node:net';

import type {
  ChangePasswordResponse,
  MemberAccountSettingsResponse,
  MemberProfileSettingsResponse,
  MemberSessionsResponse,
  OtherSessionsRevokedResponse,
  SessionRevokedResponse,
} from '@founderchatters/contracts';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
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

describe('settings HTTP integration', () => {
  let app: INestApplication;
  let expressApplication: Express;
  let prisma: PrismaService;
  let sessions: SessionService;
  let passwords: PasswordHasher;
  let config: AppConfig;
  let baseUrl: string;

  const createdUserIds: string[] = [];

  const request = (
    path: string,
    cookie?: string,
    init: RequestInit = {},
    origin = 'http://localhost:3000',
  ) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        origin,
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...init.headers,
      },
    });

  async function activeMember(
    suffix: string,
    input: {
      password?: string;
      displayName?: string;
      companyName?: string;
    } = {},
  ) {
    const password = input.password ?? 'original secure password';
    const passwordHash = await passwords.hash(password);
    const email = `fc016-${suffix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}@example.com`;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
        application: {
          create: {
            status: 'APPROVED',
            companyName: input.companyName ?? 'FounderChatters',
            roleTitle: 'Founder',
            city: 'Rajkot',
            country: 'India',
          },
        },
        profile: {
          create: {
            displayName: input.displayName ?? 'Settings Founder',
            city: 'Rajkot',
            country: 'India',
            headline: 'Building useful founder infrastructure',
            bio: 'Founder profile used for settings integration tests.',
            company: {
              create: {
                name: input.companyName ?? 'FounderChatters',
              },
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    createdUserIds.push(user.id);

    const session = await sessions.create(user.id, {
      ipAddress: '127.0.0.1',
      userAgent: `FC-016 ${suffix}`,
    });

    return {
      id: user.id,
      email: user.email,
      password,
      cookie: `${config.sessionCookieName}=${session.rawToken}`,
    };
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    expressApplication = app.getHttpAdapter().getInstance() as Express;
    config = app.get(AppConfig);
    configureTrustProxy(expressApplication, config);
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
    passwords = app.get(PasswordHasher);
  }, 30_000);

  afterAll(async () => {
    try {
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: {
            id: { in: createdUserIds },
          },
        });
      }
    } finally {
      await app.close();
    }
  });

  it('requires active membership for settings endpoints', async () => {
    expect((await request('/v1/me/settings/profile')).status).toBe(401);
    expect((await request('/v1/me/settings/account')).status).toBe(401);
    expect((await request('/v1/me/sessions')).status).toBe(401);
  });

  it('reads and updates only the caller profile settings', async () => {
    const member = await activeMember('profile', {
      displayName: 'Original Founder',
      companyName: 'Original Co',
    });

    const getResponse = await request('/v1/me/settings/profile', member.cookie);
    expect(getResponse.status).toBe(200);

    const initial = (await getResponse.json()) as MemberProfileSettingsResponse;

    expect(initial.profile).toEqual({
      displayName: 'Original Founder',
      companyName: 'Original Co',
      city: 'Rajkot',
      country: 'India',
      headline: 'Building useful founder infrastructure',
      bio: 'Founder profile used for settings integration tests.',
    });

    const patch = await request('/v1/me/settings/profile', member.cookie, {
      method: 'PATCH',
      body: JSON.stringify({
        displayName: 'Updated Founder',
        companyName: 'Updated Co',
        city: 'Ahmedabad',
        country: 'India',
        headline: 'Building founder tools',
        bio: 'Updated profile bio.',
      }),
    });

    expect(patch.status).toBe(200);

    const updated = (await patch.json()) as MemberProfileSettingsResponse;

    expect(updated.profile).toEqual({
      displayName: 'Updated Founder',
      companyName: 'Updated Co',
      city: 'Ahmedabad',
      country: 'India',
      headline: 'Building founder tools',
      bio: 'Updated profile bio.',
    });

    const stored = await prisma.founderProfile.findUniqueOrThrow({
      where: { userId: member.id },
      include: {
        company: true,
      },
    });

    expect(stored.displayName).toBe('Updated Founder');
    expect(stored.company?.name).toBe('Updated Co');
    expect(stored.headline).toBe('Building founder tools');
  });

  it('supports partial profile updates and rejects protected fields', async () => {
    const member = await activeMember('partial');

    const partial = await request('/v1/me/settings/profile', member.cookie, {
      method: 'PATCH',
      body: JSON.stringify({
        headline: 'Only this field changes',
      }),
    });

    expect(partial.status).toBe(200);

    const body = (await partial.json()) as MemberProfileSettingsResponse;
    expect(body.profile.headline).toBe('Only this field changes');
    expect(body.profile.displayName).toBe('Settings Founder');

    const protectedAttempt = await request(
      '/v1/me/settings/profile',
      member.cookie,
      {
        method: 'PATCH',
        body: JSON.stringify({
          email: 'attacker@example.com',
          userId: 'another-user',
        }),
      },
    );

    expect(protectedAttempt.status).toBe(400);

    await expect(protectedAttempt.json()).resolves.toMatchObject({
      error: {
        code: 'SETTINGS_INVALID_INPUT',
        fieldErrors: {
          email: ['This field cannot be changed.'],
          userId: ['This field cannot be changed.'],
        },
      },
    });

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: member.id },
      select: { email: true },
    });

    expect(stored.email).toBe(member.email);
  });

  it('enforces OriginGuard on settings mutations', async () => {
    const member = await activeMember('origin');

    const response = await request(
      '/v1/me/settings/profile',
      member.cookie,
      {
        method: 'PATCH',
        body: JSON.stringify({
          headline: 'Should not save',
        }),
      },
      'https://attacker.example',
    );

    expect(response.status).toBe(403);

    const stored = await prisma.founderProfile.findUniqueOrThrow({
      where: { userId: member.id },
      select: { headline: true },
    });

    expect(stored.headline).toBe('Building useful founder infrastructure');
  });

  it('returns safe account data only', async () => {
    const member = await activeMember('account');

    const response = await request('/v1/me/settings/account', member.cookie);

    expect(response.status).toBe(200);

    const body = (await response.json()) as MemberAccountSettingsResponse;

    expect(body).toEqual({
      account: {
        email: member.email,
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    expect(JSON.stringify(body)).not.toMatch(
      /passwordHash|tokenHash|ipHash|sessionSecret/i,
    );
  });

  it('lists only active caller sessions and revokes sessions safely', async () => {
    const member = await activeMember('sessions');
    const foreign = await activeMember('foreign-session');

    const current = await prisma.session.findFirstOrThrow({
      where: {
        userId: member.id,
        revokedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const second = await sessions.create(member.id, {
      ipAddress: '10.0.0.2',
      userAgent: 'Second device',
    });

    const secondRow = await prisma.session.findFirstOrThrow({
      where: {
        userId: member.id,
        tokenHash: {
          not: current.tokenHash,
        },
        revokedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const expired = await sessions.create(member.id, {
      ipAddress: '10.0.0.3',
      userAgent: 'Expired device',
    });

    const expiredRow = await prisma.session.findFirstOrThrow({
      where: {
        userId: member.id,
        tokenHash: {
          notIn: [current.tokenHash, secondRow.tokenHash],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    await prisma.session.update({
      where: { id: expiredRow.id },
      data: { expiresAt: new Date(0) },
    });

    const revoked = await sessions.create(member.id, {
      ipAddress: '10.0.0.4',
      userAgent: 'Revoked device',
    });

    const revokedRow = await prisma.session.findFirstOrThrow({
      where: {
        userId: member.id,
        tokenHash: {
          notIn: [current.tokenHash, secondRow.tokenHash, expiredRow.tokenHash],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    await prisma.session.update({
      where: { id: revokedRow.id },
      data: { revokedAt: new Date() },
    });

    const foreignSession = await prisma.session.findFirstOrThrow({
      where: {
        userId: foreign.id,
        revokedAt: null,
      },
    });

    const listResponse = await request('/v1/me/sessions', member.cookie);
    expect(listResponse.status).toBe(200);

    const list = (await listResponse.json()) as MemberSessionsResponse;

    expect(list.sessions).toHaveLength(2);
    expect(list.sessions.some((item) => item.id === current.id)).toBe(true);
    expect(list.sessions.some((item) => item.id === secondRow.id)).toBe(true);
    expect(list.sessions.some((item) => item.id === expiredRow.id)).toBe(false);
    expect(list.sessions.some((item) => item.id === revokedRow.id)).toBe(false);
    expect(list.sessions.some((item) => item.id === foreignSession.id)).toBe(
      false,
    );
    expect(list.sessions.find((item) => item.id === current.id)?.current).toBe(
      true,
    );
    expect(JSON.stringify(list)).not.toMatch(/tokenHash|ipHash/i);

    const foreignDelete = await request(
      `/v1/me/sessions/${foreignSession.id}`,
      member.cookie,
      {
        method: 'DELETE',
      },
    );

    expect(foreignDelete.status).toBe(404);

    const missingDelete = await request(
      '/v1/me/sessions/does-not-exist',
      member.cookie,
      {
        method: 'DELETE',
      },
    );

    expect(missingDelete.status).toBe(404);

    const foreignBody = (await foreignDelete.json()) as {
      error: {
        code: string;
        message: string;
        fieldErrors: Record<string, string[]>;
        requestId: string;
      };
    };

    const missingBody = (await missingDelete.json()) as {
      error: {
        code: string;
        message: string;
        fieldErrors: Record<string, string[]>;
        requestId: string;
      };
    };

    expect(foreignBody.error).toMatchObject({
      code: 'SETTINGS_SESSION_NOT_FOUND',
      message: 'That session is not available.',
      fieldErrors: {},
    });

    expect(missingBody.error).toMatchObject({
      code: 'SETTINGS_SESSION_NOT_FOUND',
      message: 'That session is not available.',
      fieldErrors: {},
    });

    expect(foreignBody.error.requestId).toEqual(expect.any(String));
    expect(missingBody.error.requestId).toEqual(expect.any(String));

    const currentDelete = await request(
      `/v1/me/sessions/${current.id}`,
      member.cookie,
      {
        method: 'DELETE',
      },
    );

    expect(currentDelete.status).toBe(409);

    const revokeResponse = await request(
      `/v1/me/sessions/${secondRow.id}`,
      member.cookie,
      {
        method: 'DELETE',
      },
    );

    expect(revokeResponse.status).toBe(200);

    const revokeBody = (await revokeResponse.json()) as SessionRevokedResponse;

    expect(revokeBody).toEqual({
      sessionId: secondRow.id,
      revoked: true,
    });

    expect(
      (
        await prisma.session.findUniqueOrThrow({
          where: { id: secondRow.id },
        })
      ).revokedAt,
    ).toBeInstanceOf(Date);

    const repeated = await request(
      `/v1/me/sessions/${secondRow.id}`,
      member.cookie,
      {
        method: 'DELETE',
      },
    );

    expect(repeated.status).toBe(200);

    void second;
    void expired;
    void revoked;
  });

  it('revokes all other sessions idempotently and preserves current session', async () => {
    const member = await activeMember('revoke-others');

    await sessions.create(member.id, {
      ipAddress: '10.0.1.1',
      userAgent: 'Laptop',
    });

    await sessions.create(member.id, {
      ipAddress: '10.0.1.2',
      userAgent: 'Tablet',
    });

    const first = await request(
      '/v1/me/sessions/revoke-others',
      member.cookie,
      {
        method: 'POST',
        body: '{}',
      },
    );

    expect(first.status).toBe(201);

    const firstBody = (await first.json()) as OtherSessionsRevokedResponse;

    expect(firstBody.revokedCount).toBe(2);

    const second = await request(
      '/v1/me/sessions/revoke-others',
      member.cookie,
      {
        method: 'POST',
        body: '{}',
      },
    );

    expect(second.status).toBe(201);

    const secondBody = (await second.json()) as OtherSessionsRevokedResponse;

    expect(secondBody.revokedCount).toBe(0);

    const stillAuthenticated = await request(
      '/v1/me/settings/account',
      member.cookie,
    );

    expect(stillAuthenticated.status).toBe(200);
  });

  it('changes password, revokes other sessions, and keeps current session valid', async () => {
    const originalPassword = 'original secure password';
    const newPassword = 'replacement secure password';

    const member = await activeMember('password', {
      password: originalPassword,
    });

    await sessions.create(member.id, {
      ipAddress: '10.0.2.1',
      userAgent: 'Other device',
    });

    const wrong = await request('/v1/me/password', member.cookie, {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: 'wrong current password',
        newPassword,
        confirmPassword: newPassword,
      }),
    });

    expect(wrong.status).toBe(400);

    await expect(wrong.json()).resolves.toMatchObject({
      error: {
        code: 'SETTINGS_CURRENT_PASSWORD_INVALID',
      },
    });

    const mismatch = await request('/v1/me/password', member.cookie, {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: originalPassword,
        newPassword,
        confirmPassword: 'different secure password',
      }),
    });

    expect(mismatch.status).toBe(400);

    const changed = await request('/v1/me/password', member.cookie, {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: originalPassword,
        newPassword,
        confirmPassword: newPassword,
      }),
    });

    expect(changed.status).toBe(201);

    const changedBody = (await changed.json()) as ChangePasswordResponse;

    expect(changedBody.changed).toBe(true);
    expect(changedBody.revokedSessionCount).toBe(1);

    const currentStillWorks = await request(
      '/v1/me/settings/account',
      member.cookie,
    );

    expect(currentStillWorks.status).toBe(200);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: member.id },
      select: { passwordHash: true },
    });

    expect(await passwords.verify(stored.passwordHash, originalPassword)).toBe(
      false,
    );
    expect(await passwords.verify(stored.passwordHash, newPassword)).toBe(true);

    const oldSignin = await request('/v1/auth/signin', undefined, {
      method: 'POST',
      body: JSON.stringify({
        email: member.email,
        password: originalPassword,
      }),
    });

    expect(oldSignin.status).toBe(401);

    const newSignin = await request('/v1/auth/signin', undefined, {
      method: 'POST',
      body: JSON.stringify({
        email: member.email,
        password: newPassword,
      }),
    });

    expect(newSignin.status).toBe(200);
  }, 45_000);
});
