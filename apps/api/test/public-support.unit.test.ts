import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_ERROR_CODES,
  PUBLIC_SUPPORT_ERROR_CODES,
} from '@founderchatters/contracts';

import { ApiError } from '../src/http/api-error.js';
import { parsePublicSupportBody } from '../src/support/public-support-input.js';
import { PublicSupportService } from '../src/support/public-support.service.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function guestRequest() {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    header: () => undefined,
  } as never;
}

function cookieRequest() {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    header: (name: string) =>
      name.toLowerCase() === 'cookie' ? 'fc_session=stale-token' : undefined,
  } as never;
}

describe('public support input', () => {
  it('normalizes email and rejects unknown fields and oversize text', () => {
    expect(
      parsePublicSupportBody({
        category: 'account',
        email: '  Guest@Example.COM ',
        subject: 'Cannot sign in',
        message: 'The form keeps failing.',
      }),
    ).toEqual({
      category: 'account',
      email: 'guest@example.com',
      subject: 'Cannot sign in',
      message: 'The form keeps failing.',
    });

    expect(() =>
      parsePublicSupportBody({
        category: 'account',
        email: 'guest@example.com',
        subject: 'Hello',
        message: 'Body',
        extra: true,
      }),
    ).toThrowError(ApiError);

    try {
      parsePublicSupportBody({
        category: 'account',
        email: 'guest@example.com',
        subject: 'x'.repeat(161),
        message: 'Body',
      });
      throw new Error('expected oversize subject to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).fieldErrors.subject).toEqual([
        'Use 160 characters or fewer.',
      ]);
    }
  });
});

describe('public support session inspect', () => {
  it('does not inspect when no session cookie is present', async () => {
    const inspect = vi.fn();
    const supportCaseCreate = vi.fn().mockResolvedValue({
      id: 'case-guest',
      status: 'OPEN',
    });
    const supportMessageCreate = vi.fn().mockResolvedValue({});
    const service = new PublicSupportService(
      {
        $transaction: vi.fn(
          async (operation: (tx: never) => Promise<unknown>) =>
            operation({
              supportCase: { create: supportCaseCreate },
              supportMessage: { create: supportMessageCreate },
            } as never),
        ),
      } as never,
      { inspect } as never,
      {
        checkClient: vi.fn().mockResolvedValue(undefined),
        checkEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      { sessionCookieName: 'fc_session' } as never,
    );

    await expect(
      service.create(
        {
          category: 'other',
          email: 'guest@example.com',
          subject: 'Help',
          message: 'Please help.',
        },
        guestRequest(),
      ),
    ).resolves.toEqual({ caseId: 'case-guest', status: 'OPEN' });
    expect(inspect).not.toHaveBeenCalled();
    expect(supportCaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          email: 'guest@example.com',
        }),
      }),
    );
    expect(supportMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorType: 'GUEST', actorId: null }),
      }),
    );
  });

  it('treats an expired session ApiError as a guest', async () => {
    const inspect = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          AUTH_ERROR_CODES.sessionExpired,
          'The session is missing or has expired.',
          HttpStatus.UNAUTHORIZED,
        ),
      );
    const supportCaseCreate = vi.fn().mockResolvedValue({
      id: 'case-stale',
      status: 'OPEN',
    });
    const supportMessageCreate = vi.fn().mockResolvedValue({});
    const service = new PublicSupportService(
      {
        $transaction: vi.fn(
          async (operation: (tx: never) => Promise<unknown>) =>
            operation({
              supportCase: { create: supportCaseCreate },
              supportMessage: { create: supportMessageCreate },
            } as never),
        ),
      } as never,
      { inspect } as never,
      {
        checkClient: vi.fn().mockResolvedValue(undefined),
        checkEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      { sessionCookieName: 'fc_session' } as never,
    );

    await expect(
      service.create(
        {
          category: 'other',
          email: 'guest@example.com',
          subject: 'Help',
          message: 'Please help.',
        },
        cookieRequest(),
      ),
    ).resolves.toEqual({ caseId: 'case-stale', status: 'OPEN' });
    expect(inspect).toHaveBeenCalledOnce();
    expect(supportCaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: null }),
      }),
    );
  });

  it('propagates unexpected inspect errors without creating a case', async () => {
    const inspect = vi
      .fn()
      .mockRejectedValue(new Error('prisma connection lost'));
    const transaction = vi.fn();
    const service = new PublicSupportService(
      { $transaction: transaction } as never,
      { inspect } as never,
      {
        checkClient: vi.fn().mockResolvedValue(undefined),
        checkEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      { sessionCookieName: 'fc_session' } as never,
    );

    await expect(
      service.create(
        {
          category: 'other',
          email: 'guest@example.com',
          subject: 'Help',
          message: 'Please help.',
        },
        cookieRequest(),
      ),
    ).rejects.toThrow('prisma connection lost');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('uses the locked re-read user when the account is still live', async () => {
    const inspect = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'stale-client@example.com' },
    });
    const supportCaseCreate = vi.fn().mockResolvedValue({
      id: 'case-user',
      status: 'OPEN',
    });
    const supportMessageCreate = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'account@example.com',
      status: 'ACTIVE',
      deletedAt: null,
    });
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'user-1' }]);
    const service = new PublicSupportService(
      {
        $transaction: vi.fn(
          async (operation: (tx: never) => Promise<unknown>) =>
            operation({
              $queryRaw: queryRaw,
              user: { findUnique },
              supportCase: { create: supportCaseCreate },
              supportMessage: { create: supportMessageCreate },
            } as never),
        ),
      } as never,
      { inspect } as never,
      {
        checkClient: vi.fn().mockResolvedValue(undefined),
        checkEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      { sessionCookieName: 'fc_session' } as never,
    );

    await service.create(
      {
        category: 'account',
        email: 'attacker@example.com',
        subject: 'Help',
        message: 'Please help.',
      },
      cookieRequest(),
    );
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledOnce();
    expect(supportCaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          email: 'account@example.com',
        }),
      }),
    );
    expect(supportMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorType: 'USER',
          actorId: 'user-1',
        }),
      }),
    );
  });

  it('falls back to guest after a deleted locked re-read', async () => {
    const inspect = vi.fn().mockResolvedValue({
      user: { id: 'user-1', email: 'pre-delete@example.com' },
    });
    const supportCaseCreate = vi.fn().mockResolvedValue({
      id: 'case-deleted',
      status: 'OPEN',
    });
    const supportMessageCreate = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'deleted-abc@deleted.invalid',
      status: 'DELETED',
      deletedAt: new Date(),
    });
    const service = new PublicSupportService(
      {
        $transaction: vi.fn(
          async (operation: (tx: never) => Promise<unknown>) =>
            operation({
              $queryRaw: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
              user: { findUnique },
              supportCase: { create: supportCaseCreate },
              supportMessage: { create: supportMessageCreate },
            } as never),
        ),
      } as never,
      { inspect } as never,
      {
        checkClient: vi.fn().mockResolvedValue(undefined),
        checkEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      { sessionCookieName: 'fc_session' } as never,
    );

    await service.create(
      {
        category: 'account',
        email: 'reach-me@example.com',
        subject: 'Help',
        message: 'Please help.',
      },
      cookieRequest(),
    );
    expect(findUnique).toHaveBeenCalledOnce();
    expect(supportCaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          email: 'reach-me@example.com',
        }),
      }),
    );
    expect(supportMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorType: 'GUEST', actorId: null }),
      }),
    );
  });
});

describe('public support transaction', () => {
  it('creates the case and first message in the same Prisma transaction callback', async () => {
    const supportCaseCreate = vi.fn().mockResolvedValue({
      id: 'case-1',
      status: 'OPEN',
    });
    const supportMessageCreate = vi
      .fn()
      .mockRejectedValue(new Error('forced message failure'));
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: never) => Promise<unknown>) =>
        operation({
          supportCase: { create: supportCaseCreate },
          supportMessage: { create: supportMessageCreate },
        } as never),
      ),
    };
    const service = new PublicSupportService(
      prisma as never,
      { inspect: vi.fn() } as never,
      {
        checkClient: vi.fn().mockResolvedValue(undefined),
        checkEmail: vi.fn().mockResolvedValue(undefined),
      } as never,
      { sessionCookieName: 'fc_session' } as never,
    );

    await expect(
      service.create(
        {
          category: 'other',
          email: 'guest@example.com',
          subject: 'Help',
          message: 'Please help.',
        },
        guestRequest(),
      ),
    ).rejects.toThrow('forced message failure');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(supportCaseCreate).toHaveBeenCalledOnce();
    expect(supportMessageCreate).toHaveBeenCalledOnce();
    expect(PUBLIC_SUPPORT_ERROR_CODES.invalidInput).toBe(
      'PUBLIC_SUPPORT_INVALID_INPUT',
    );
  });
});
