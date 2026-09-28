import { describe, expect, it, vi } from 'vitest';

import type { ApplicationStatus } from '@founderchatters/contracts';

import { ApplicationReviewService } from '../src/admin/application-review.service.js';
import type { AdminAuthService } from '../src/admin/admin-auth.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { ApiError } from '../src/http/api-error.js';

const submittedApplication = {
  id: 'application-1',
  status: 'SUBMITTED' as const,
  eligibilityRole: 'FOUNDER_COFOUNDER',
  companyName: 'Nexora',
  roleTitle: 'Founder',
  website: 'https://nexora.example/',
  city: 'Mumbai',
  country: 'India',
  buildingSummary: 'Workflow automation for finance teams in private alpha.',
  submittedAt: new Date('2026-09-27T00:00:00.000Z'),
  decidedAt: null as Date | null,
  createdAt: new Date('2026-09-26T00:00:00.000Z'),
  updatedAt: new Date('2026-09-27T00:00:00.000Z'),
  user: { email: 'priya@nexora.example', emailVerifiedAt: new Date() },
  events: [] as Array<{ note: string | null; toStatus: ApplicationStatus }>,
};

const principal = {
  sessionId: 'session-1',
  user: {
    id: 'admin-1',
    email: 'reviewer@example.com',
    emailVerifiedAt: new Date(),
    status: 'ACTIVE' as const,
    onboardingCompletedAt: null,
    application: null,
  },
  permissions: new Set([
    'admin.applications.read',
    'admin.applications.needs_info',
    'admin.applications.approve',
    'admin.applications.reject',
  ]),
};

function reviewService(
  application: Omit<typeof submittedApplication, 'status'> & {
    status: ApplicationStatus;
  },
  claimed = 1,
) {
  const eventCreate = vi.fn().mockResolvedValue({});
  const auditCreate = vi.fn().mockResolvedValue({});
  const tx = {
    founderApplication: {
      findUnique: vi.fn().mockResolvedValue(application),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        ...application,
        status: 'APPROVED',
        decidedAt: new Date('2026-09-28T12:00:00.000Z'),
      }),
      updateMany: vi.fn().mockResolvedValue({ count: claimed }),
    },
    applicationStatusEvent: { create: eventCreate },
    auditLog: { create: auditCreate },
  };
  const prisma = {
    $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
    founderApplication: {
      findUnique: vi.fn().mockResolvedValue(application),
    },
  };
  const auth = {
    capabilities: () => ({ needsInfo: true, approve: true, reject: true }),
  };
  return {
    auditCreate,
    eventCreate,
    prisma,
    service: new ApplicationReviewService(
      prisma as unknown as PrismaService,
      auth as unknown as AdminAuthService,
    ),
    tx,
  };
}

describe('ApplicationReviewService state machine', () => {
  it('records NEEDS_INFO without writing decidedAt', async () => {
    const { auditCreate, eventCreate, service, tx } = reviewService({
      ...submittedApplication,
    });
    tx.founderApplication.findUniqueOrThrow.mockResolvedValue({
      ...submittedApplication,
      status: 'NEEDS_INFO',
      events: [{ note: 'Clarify the customer.', toStatus: 'NEEDS_INFO' }],
    });

    await expect(
      service.requestInfo(principal, 'application-1', 'Clarify the customer.'),
    ).resolves.toMatchObject({
      application: { status: 'NEEDS_INFO', decidedAt: null },
    });
    expect(tx.founderApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 'application-1', status: 'SUBMITTED' },
      data: { status: 'NEEDS_INFO' },
    });
    expect(
      tx.founderApplication.updateMany.mock.calls[0]?.[0].data,
    ).not.toHaveProperty('decidedAt');
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        applicationId: 'application-1',
        fromStatus: 'SUBMITTED',
        toStatus: 'NEEDS_INFO',
        actorUserId: 'admin-1',
        note: 'Clarify the customer.',
      },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-1',
        action: 'application.needs_info',
        targetType: 'FounderApplication',
        targetId: 'application-1',
        reason: 'Clarify the customer.',
      },
    });
  });

  it('approves SUBMITTED and sets decidedAt', async () => {
    const { auditCreate, eventCreate, service, tx } =
      reviewService(submittedApplication);

    await expect(
      service.approve(principal, 'application-1'),
    ).resolves.toMatchObject({
      application: { status: 'APPROVED' },
    });
    expect(tx.founderApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 'application-1', status: 'SUBMITTED' },
      data: {
        status: 'APPROVED',
        decidedAt: expect.any(Date),
      },
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: 'SUBMITTED',
        toStatus: 'APPROVED',
        actorUserId: 'admin-1',
        note: null,
      }),
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'application.approved',
        reason: null,
      }),
    });
  });

  it('rejects SUBMITTED with a reason and decidedAt', async () => {
    const { eventCreate, service, tx } = reviewService(submittedApplication);
    tx.founderApplication.findUniqueOrThrow.mockResolvedValue({
      ...submittedApplication,
      status: 'REJECTED',
      decidedAt: new Date('2026-09-28T12:00:00.000Z'),
    });

    await service.reject(principal, 'application-1', 'Not actively building.');
    expect(tx.founderApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 'application-1', status: 'SUBMITTED' },
      data: {
        status: 'REJECTED',
        decidedAt: expect.any(Date),
      },
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        toStatus: 'REJECTED',
        note: 'Not actively building.',
      }),
    });
  });

  it.each(['DRAFT', 'NEEDS_INFO', 'APPROVED', 'REJECTED'] as const)(
    'does not allow an admin decision from %s',
    async (status) => {
      const { auditCreate, eventCreate, service } = reviewService({
        ...submittedApplication,
        status,
      });
      if (status === 'DRAFT') {
        await expect(
          service.approve(principal, 'application-1'),
        ).rejects.toMatchObject({ code: 'APPLICATION_NOT_FOUND' });
      } else {
        await expect(
          service.approve(principal, 'application-1'),
        ).rejects.toMatchObject({ code: 'ADMIN_ACTION_INVALID_STATE' });
      }
      expect(eventCreate).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    },
  );

  it('rejects a race loser without creating event or audit records', async () => {
    const { auditCreate, eventCreate, service } = reviewService(
      submittedApplication,
      0,
    );
    await expect(
      service.approve(principal, 'application-1'),
    ).rejects.toBeInstanceOf(ApiError);
    expect(eventCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('does not report success when audit creation fails', async () => {
    const { auditCreate, eventCreate, service, tx } =
      reviewService(submittedApplication);
    auditCreate.mockRejectedValueOnce(new Error('audit write failed'));
    await expect(service.approve(principal, 'application-1')).rejects.toThrow(
      'audit write failed',
    );
    expect(tx.founderApplication.updateMany).toHaveBeenCalledOnce();
    expect(eventCreate).toHaveBeenCalledOnce();
  });

  it('only exposes a review note that belongs to the current status', async () => {
    const { prisma, service } = reviewService({
      ...submittedApplication,
      status: 'APPROVED',
      decidedAt: new Date('2026-09-28T12:00:00.000Z'),
      events: [{ note: 'Clarify the customer.', toStatus: 'NEEDS_INFO' }],
    });
    prisma.founderApplication.findUnique.mockResolvedValue({
      ...submittedApplication,
      status: 'APPROVED',
      decidedAt: new Date('2026-09-28T12:00:00.000Z'),
      events: [{ note: 'Clarify the customer.', toStatus: 'NEEDS_INFO' }],
    });
    await expect(
      service.get(principal, 'application-1'),
    ).resolves.toMatchObject({
      application: { status: 'APPROVED', latestReviewNote: null },
    });

    prisma.founderApplication.findUnique.mockResolvedValue({
      ...submittedApplication,
      status: 'NEEDS_INFO',
      events: [{ note: 'Clarify the customer.', toStatus: 'NEEDS_INFO' }],
    });
    await expect(
      service.get(principal, 'application-1'),
    ).resolves.toMatchObject({
      application: {
        status: 'NEEDS_INFO',
        latestReviewNote: 'Clarify the customer.',
      },
    });
  });
});
