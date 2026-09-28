import { describe, expect, it, vi } from 'vitest';

import { ApplicationService } from '../src/application/application.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { ApiError } from '../src/http/api-error.js';

const completeApplication = {
  id: 'application-1',
  userId: 'user-1',
  status: 'DRAFT' as const,
  eligibilityRole: 'FOUNDER_COFOUNDER',
  companyName: 'FounderChatters',
  roleTitle: 'Founder',
  website: 'https://founderchatters.com/',
  city: 'Delhi',
  country: 'India',
  buildingSummary:
    'A focused founder support network for useful conversations.',
  submittedAt: null,
  decidedAt: null,
  createdAt: new Date('2026-09-28T00:00:00.000Z'),
  updatedAt: new Date('2026-09-28T00:00:00.000Z'),
  events: [],
};

function transitionService(
  application: Omit<typeof completeApplication, 'status' | 'events'> & {
    status: 'DRAFT' | 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED';
    events: Array<{ note: string | null }>;
  },
  claimed = 1,
) {
  const eventCreate = vi.fn().mockResolvedValue({});
  const tx = {
    founderApplication: {
      findUnique: vi.fn().mockResolvedValue(application),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        ...application,
        status: 'SUBMITTED',
        submittedAt: new Date('2026-09-28T12:00:00.000Z'),
      }),
      updateMany: vi.fn().mockResolvedValue({ count: claimed }),
    },
    applicationStatusEvent: { create: eventCreate },
  };
  const prisma = {
    $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  };
  return {
    eventCreate,
    service: new ApplicationService(prisma as unknown as PrismaService),
    tx,
  };
}

describe('ApplicationService state machine', () => {
  it('transitions DRAFT to SUBMITTED and records the founder actor', async () => {
    const { eventCreate, service, tx } = transitionService(completeApplication);

    await expect(service.submit('user-1')).resolves.toMatchObject({
      application: { status: 'SUBMITTED' },
    });
    expect(tx.founderApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 'application-1', status: 'DRAFT' },
      data: {
        status: 'SUBMITTED',
        submittedAt: expect.any(Date),
      },
    });
    expect(
      tx.founderApplication.updateMany.mock.calls[0]?.[0].data,
    ).not.toHaveProperty('decidedAt');
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        applicationId: 'application-1',
        fromStatus: 'DRAFT',
        toStatus: 'SUBMITTED',
        actorUserId: 'user-1',
      },
    });
  });

  it('transitions NEEDS_INFO to SUBMITTED without overwriting history', async () => {
    const { eventCreate, service, tx } = transitionService({
      ...completeApplication,
      status: 'NEEDS_INFO',
      events: [{ note: 'Clarify the customer.' }],
    });

    await expect(service.resubmit('user-1')).resolves.toMatchObject({
      application: { status: 'SUBMITTED' },
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: 'NEEDS_INFO',
        toStatus: 'SUBMITTED',
        actorUserId: 'user-1',
      }),
    });
    expect(tx.founderApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 'application-1', status: 'NEEDS_INFO' },
      data: {
        status: 'SUBMITTED',
        submittedAt: expect.any(Date),
      },
    });
    expect(
      tx.founderApplication.updateMany.mock.calls[0]?.[0].data,
    ).not.toHaveProperty('decidedAt');
  });

  it('directs NEEDS_INFO applications to the resubmit transition', async () => {
    const { eventCreate, service } = transitionService({
      ...completeApplication,
      status: 'NEEDS_INFO',
      events: [{ note: 'Clarify the customer.' }],
    });

    await expect(service.submit('user-1')).rejects.toMatchObject({
      code: 'APPLICATION_NEEDS_INFO',
    });
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'rejects a founder submit directly from %s',
    async (status) => {
      const { eventCreate, service } = transitionService({
        ...completeApplication,
        status,
      });

      await expect(service.submit('user-1')).rejects.toMatchObject({
        code: 'APPLICATION_INVALID_STATE',
      });
      expect(eventCreate).not.toHaveBeenCalled();
    },
  );

  it('rejects SUBMITTED to DRAFT behavior through update', async () => {
    const prisma = {
      founderApplication: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'application-1', status: 'SUBMITTED' }),
      },
    };
    const service = new ApplicationService(prisma as unknown as PrismaService);

    await expect(
      service.update('user-1', { companyName: 'Changed' }),
    ).rejects.toMatchObject({ code: 'APPLICATION_INVALID_STATE' });
  });

  it('rejects duplicate submit without creating another event', async () => {
    const { eventCreate, service } = transitionService({
      ...completeApplication,
      status: 'SUBMITTED',
    });

    await expect(service.submit('user-1')).rejects.toMatchObject({
      code: 'APPLICATION_ALREADY_SUBMITTED',
    });
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const)(
    'rejects founder resubmit from %s',
    async (status) => {
      const { eventCreate, service } = transitionService({
        ...completeApplication,
        status,
      });

      await expect(service.resubmit('user-1')).rejects.toMatchObject({
        code: 'APPLICATION_INVALID_STATE',
      });
      expect(eventCreate).not.toHaveBeenCalled();
    },
  );

  it.each(['APPROVED', 'REJECTED'] as const)(
    'rejects founder edits while %s',
    async (status) => {
      const prisma = {
        founderApplication: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: 'application-1', status }),
        },
      };
      const service = new ApplicationService(
        prisma as unknown as PrismaService,
      );

      await expect(
        service.update('user-1', { roleTitle: 'Founder' }),
      ).rejects.toMatchObject({ code: 'APPLICATION_INVALID_STATE' });
    },
  );

  it('rejects protected mass-assignment fields before database access', async () => {
    const findUnique = vi.fn();
    const service = new ApplicationService({
      founderApplication: { findUnique },
    } as unknown as PrismaService);

    await expect(
      service.update('user-1', {
        id: 'forged-application',
        userId: 'another-user',
        status: 'APPROVED',
        submittedAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({
      code: 'APPLICATION_INVALID_STATE',
      fieldErrors: {
        id: expect.any(Array),
        userId: expect.any(Array),
        status: expect.any(Array),
        submittedAt: expect.any(Array),
        decidedAt: expect.any(Array),
      },
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED', 'DRAFT'] as const)(
    'does not allow a founder to assign status %s',
    async (status) => {
      const findUnique = vi.fn();
      const service = new ApplicationService({
        founderApplication: { findUnique },
      } as unknown as PrismaService);

      await expect(service.update('user-1', { status })).rejects.toMatchObject({
        code: 'APPLICATION_INVALID_STATE',
        fieldErrors: { status: expect.any(Array) },
      });
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('validates required submission fields and unsafe websites', async () => {
    const invalidWebsiteService = new ApplicationService({
      founderApplication: { findUnique: vi.fn() },
    } as unknown as PrismaService);
    await expect(
      invalidWebsiteService.update('user-1', {
        website: 'javascript:alert(1)',
      }),
    ).rejects.toMatchObject({
      fieldErrors: { website: expect.any(Array) },
    });

    const { eventCreate, service } = transitionService({
      ...completeApplication,
      companyName: '',
      buildingSummary: 'Too short',
    });
    await expect(service.submit('user-1')).rejects.toMatchObject({
      fieldErrors: {
        companyName: expect.any(Array),
        buildingSummary: expect.any(Array),
      },
    });
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('rejects a race loser without creating a duplicate transition event', async () => {
    const { eventCreate, service } = transitionService(completeApplication, 0);

    await expect(service.submit('user-1')).rejects.toBeInstanceOf(ApiError);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('does not report success when atomic event creation fails', async () => {
    const { eventCreate, service, tx } = transitionService(completeApplication);
    eventCreate.mockRejectedValueOnce(new Error('event write failed'));

    await expect(service.submit('user-1')).rejects.toThrow(
      'event write failed',
    );
    expect(tx.founderApplication.updateMany).toHaveBeenCalledOnce();
  });

  it('rejects submitting NOT_CURRENTLY_BUILDING without a status event', async () => {
    const { eventCreate, service, tx } = transitionService({
      ...completeApplication,
      eligibilityRole: 'NOT_CURRENTLY_BUILDING',
    });

    await expect(service.submit('user-1')).rejects.toMatchObject({
      fieldErrors: { eligibilityRole: expect.any(Array) },
    });
    expect(tx.founderApplication.updateMany).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('turns a unique-userId create collision into an update', async () => {
    const created = { ...completeApplication, events: [] };
    const prisma = {
      founderApplication: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'application-1', status: 'DRAFT' })
          .mockResolvedValueOnce(created),
        create: vi.fn().mockRejectedValue({ code: 'P2002' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new ApplicationService(prisma as unknown as PrismaService);

    await expect(
      service.update('user-1', { companyName: 'FounderChatters' }),
    ).resolves.toMatchObject({
      application: { id: 'application-1', status: 'DRAFT' },
    });
    expect(prisma.founderApplication.create).toHaveBeenCalledOnce();
    expect(prisma.founderApplication.updateMany).toHaveBeenCalledOnce();
  });

  it.each([
    ['id', 'forged-application'],
    ['userId', 'another-user'],
    ['status', 'APPROVED'],
    ['submittedAt', '2026-09-28T00:00:00.000Z'],
    ['decidedAt', '2026-09-28T00:00:00.000Z'],
  ] as const)('rejects founder assignment of %s', async (field, value) => {
    const findUnique = vi.fn();
    const service = new ApplicationService({
      founderApplication: { findUnique },
    } as unknown as PrismaService);

    await expect(
      service.update('user-1', { [field]: value }),
    ).rejects.toMatchObject({
      fieldErrors: { [field]: expect.any(Array) },
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
