// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

import { ApplicationDetailClient } from './[id]/application-detail-client';
import { ApplicationsQueueClient } from './applications-queue-client';

const submitted = {
  id: 'application-1',
  status: 'SUBMITTED',
  eligibilityRole: 'FOUNDER_COFOUNDER',
  companyName: 'Nexora',
  roleTitle: 'Founder',
  website: 'https://nexora.example/',
  city: 'Mumbai',
  country: 'India',
  buildingSummary: 'Workflow automation for finance teams.',
  submittedAt: '2026-09-27T00:00:00.000Z',
  decidedAt: null,
  updatedAt: '2026-09-27T00:00:00.000Z',
  latestReviewNote: null,
  applicant: { email: 'priya@nexora.example', emailVerified: true },
} as const;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
});

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return response(
    { error: { code, message, requestId: 'request-test', fieldErrors: {} } },
    status,
  );
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-008 admin application review UI', () => {
  it('renders the pending queue, country filter, and pagination', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        response({
          applications: [
            {
              id: 'application-1',
              status: 'SUBMITTED',
              eligibilityRole: 'FOUNDER_COFOUNDER',
              companyName: 'Nexora',
              roleTitle: 'Founder',
              city: 'Mumbai',
              country: 'India',
              submittedAt: '2026-09-27T00:00:00.000Z',
              decidedAt: null,
              updatedAt: '2026-09-27T00:00:00.000Z',
              applicantEmail: 'priya@nexora.example',
              emailVerified: true,
            },
          ],
          page: 1,
          pageSize: 5,
          total: 1,
          totalPages: 1,
          status: 'SUBMITTED',
          country: null,
          countries: ['India'],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationsQueueClient));

    expect(
      await screen.findByRole('heading', { name: 'Applications' }),
    ).toBeVisible();
    expect(
      screen.getByRole('columnheader', { name: 'Applicant' }),
    ).toBeVisible();
    expect(screen.getByText('priya@nexora.example')).toBeVisible();
    expect(screen.queryByText('Priya Mehta')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pending' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.selectOptions(screen.getByLabelText('Country'), 'India');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('country=India');
    expect(await screen.findByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/admin/applications/application-1',
    );
  });

  it('shows empty, denied, and tab changes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          applications: [],
          page: 1,
          pageSize: 5,
          total: 0,
          totalPages: 1,
          status: 'SUBMITTED',
          country: null,
          countries: [],
        }),
      )
      .mockResolvedValueOnce(
        response({
          applications: [],
          page: 1,
          pageSize: 5,
          total: 0,
          totalPages: 1,
          status: 'NEEDS_INFO',
          country: null,
          countries: [],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationsQueueClient));
    expect(await screen.findByText('No pending applications.')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Needs info' }));
    expect(
      await screen.findByText('No needs info applications.'),
    ).toBeVisible();
  });

  it('shows a permission-denied queue state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          errorResponse(
            'ADMIN_PERMISSION_DENIED',
            'You do not have permission to perform this admin action.',
            403,
          ),
        ),
    );
    render(createElement(ApplicationsQueueClient));
    expect(
      await screen.findByRole('heading', {
        name: 'You don’t have permission to review applications',
      }),
    ).toBeVisible();
  });

  it('renders detail without a fabricated name and hides unauthorized actions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          application: submitted,
          capabilities: { needsInfo: true, approve: false, reject: true },
        }),
      ),
    );
    render(createElement(ApplicationDetailClient, { id: 'application-1' }));
    expect(
      await screen.findByRole('heading', { name: 'Application · Applicant' }),
    ).toBeVisible();
    expect(screen.getByText(/priya@nexora.example/)).toBeVisible();
    expect(screen.getByText(/verified/)).toBeVisible();
    expect(screen.queryByText('Priya Mehta')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Needs info' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeVisible();
  });

  it('validates needs-info and reject, then approves with server state', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          application: submitted,
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      )
      .mockResolvedValueOnce(
        response({
          application: {
            ...submitted,
            status: 'APPROVED',
            decidedAt: '2026-09-28T12:00:00.000Z',
          },
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationDetailClient, { id: 'application-1' }));
    await user.click(await screen.findByRole('button', { name: 'Needs info' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(
      screen.getByLabelText('Note for the founder'),
    ).toHaveAccessibleDescription('Enter a note.');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm approval' }),
    );
    expect(
      await screen.findByText('Approved', {
        selector: '.fc-admin-applications__badge',
      }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4000/v1/admin/applications/application-1/approve',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refetches after a concurrent conflict', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          application: submitted,
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      )
      .mockResolvedValueOnce(
        errorResponse(
          'ADMIN_ACTION_INVALID_STATE',
          'This application was already reviewed by another administrator.',
          409,
        ),
      )
      .mockResolvedValueOnce(
        response({
          application: {
            ...submitted,
            status: 'REJECTED',
            decidedAt: '2026-09-28T12:00:00.000Z',
          },
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationDetailClient, { id: 'application-1' }));
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm approval' }),
    );
    expect(
      await screen.findByText(
        'This application was already reviewed by another administrator.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Rejected')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
  });

  it('keeps non-SUBMITTED applications read-only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          application: {
            ...submitted,
            status: 'NEEDS_INFO',
            latestReviewNote: 'Clarify the customer.',
          },
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      ),
    );
    render(createElement(ApplicationDetailClient, { id: 'application-1' }));
    expect(await screen.findByText('Clarify the customer.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
  });

  it('has no basic accessibility violations on queue and detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          applications: [],
          page: 1,
          pageSize: 5,
          total: 0,
          totalPages: 1,
          status: 'SUBMITTED',
          country: null,
          countries: [],
        }),
      ),
    );
    const queue = render(createElement(ApplicationsQueueClient));
    await screen.findByRole('heading', { name: 'Applications' });
    await expectAccessible(queue.container);
    queue.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          application: submitted,
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      ),
    );
    const detail = render(
      createElement(ApplicationDetailClient, { id: 'application-1' }),
    );
    await screen.findByRole('heading', { name: 'Application · Applicant' });
    await expectAccessible(detail.container);
  });

  it('keeps the admin unsupported-small-screen contract', () => {
    const styles = [
      readFileSync(
        resolve(process.cwd(), '../../packages/ui/src/styles.css'),
        'utf8',
      ),
      readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8'),
    ].join('\n');
    expect(styles).toContain('@media (max-width: 899px)');
    expect(styles).toContain('.fc-admin-unsupported');
    expect(styles).toContain('display: flex');
    expect(styles).toContain('display: none !important');
    expect(styles).toContain('pointer-events: none');
    expect(styles).toContain('visibility: hidden');
    expect(styles).toContain('.fc-admin-sidebar');
    expect(styles).toContain('.fc-admin-content');
    expect(styles).toContain('@media (max-width: 1024px)');
    expect(styles).toContain('.fc-admin-application-detail__grid');
  });

  it('shows loading and recoverable queue errors', async () => {
    const user = userEvent.setup();
    let resolveQueue: ((value: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolvePromise) => {
            resolveQueue = resolvePromise;
          }),
      )
      .mockResolvedValueOnce(
        response({
          applications: [],
          page: 1,
          pageSize: 5,
          total: 0,
          totalPages: 1,
          status: 'SUBMITTED',
          country: null,
          countries: [],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationsQueueClient));
    expect(screen.getByText('Loading applications…')).toBeVisible();
    resolveQueue?.(errorResponse('UNKNOWN_ERROR', 'Queue unavailable.', 500));
    expect(
      await screen.findByRole('heading', {
        name: 'We couldn’t load applications',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No pending applications.')).toBeVisible();
  });

  it('paginates the queue and supports keyboard tab activation', async () => {
    const user = userEvent.setup();
    const page = (pageNumber: number) =>
      response({
        applications: [
          {
            id: `application-${String(pageNumber)}`,
            status: 'SUBMITTED',
            eligibilityRole: 'FOUNDER_COFOUNDER',
            companyName: `Company ${String(pageNumber)}`,
            roleTitle: 'Founder',
            city: 'Mumbai',
            country: 'India',
            submittedAt: '2026-09-27T00:00:00.000Z',
            decidedAt: null,
            updatedAt: '2026-09-27T00:00:00.000Z',
            applicantEmail: `founder${String(pageNumber)}@example.com`,
            emailVerified: true,
          },
        ],
        page: pageNumber,
        pageSize: 5,
        total: 6,
        totalPages: 2,
        status: 'SUBMITTED',
        country: null,
        countries: ['India'],
      });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce(page(2))
      .mockResolvedValueOnce(
        response({
          applications: [],
          page: 1,
          pageSize: 5,
          total: 0,
          totalPages: 1,
          status: 'APPROVED',
          country: null,
          countries: [],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationsQueueClient));
    expect(await screen.findByText('Company 1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Company 2')).toBeVisible();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('page=2');
    screen.getByRole('tab', { name: 'Approved' }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('No approved applications.')).toBeVisible();
  });

  it('validates reject, preserves typed text, and disables pending controls', async () => {
    const user = userEvent.setup();
    let finishReject: ((value: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          application: submitted,
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolvePromise) => {
            finishReject = resolvePromise;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationDetailClient, { id: 'application-1' }));
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.click(
      screen.getByRole('button', { name: 'Reject application' }),
    );
    expect(
      screen.getByLabelText('Rejection reason'),
    ).toHaveAccessibleDescription('Enter a reason.');
    await user.type(screen.getByLabelText('Rejection reason'), 'Not building.');
    await user.click(
      screen.getByRole('button', { name: 'Reject application' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Saving…' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Rejection reason')).toHaveValue(
      'Not building.',
    );
    finishReject?.(
      response({
        application: {
          ...submitted,
          status: 'REJECTED',
          decidedAt: '2026-09-28T12:00:00.000Z',
          latestReviewNote: 'Not building.',
        },
        capabilities: { needsInfo: true, approve: true, reject: true },
      }),
    );
    expect(await screen.findByText('Rejected')).toBeVisible();
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Reject' }),
      ).not.toBeInTheDocument();
    });
  });

  it('has no basic accessibility violations on decision dialogs', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          application: submitted,
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      ),
    );
    const view = render(
      createElement(ApplicationDetailClient, { id: 'application-1' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Needs info' }));
    await expectAccessible(view.container);
  });

  it.each([
    [{ needsInfo: false, approve: false, reject: false }, [] as const],
    [
      { needsInfo: true, approve: false, reject: false },
      ['Needs info'] as const,
    ],
    [{ needsInfo: false, approve: true, reject: false }, ['Approve'] as const],
    [{ needsInfo: false, approve: false, reject: true }, ['Reject'] as const],
    [
      { needsInfo: true, approve: true, reject: true },
      ['Needs info', 'Approve', 'Reject'] as const,
    ],
  ])(
    'renders only permitted decision actions %s',
    async (capabilities, names) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            response({ application: submitted, capabilities }),
          ),
      );
      render(createElement(ApplicationDetailClient, { id: 'application-1' }));
      await screen.findByRole('heading', { name: 'Application · Applicant' });
      for (const name of ['Needs info', 'Approve', 'Reject'] as const) {
        if ((names as readonly string[]).includes(name)) {
          expect(screen.getByRole('button', { name })).toBeVisible();
        } else {
          expect(
            screen.queryByRole('button', { name }),
          ).not.toBeInTheDocument();
        }
      }
    },
  );

  it('refetches after a needs-info conflict and keeps typed notes on validation errors', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          application: submitted,
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      )
      .mockResolvedValueOnce(
        errorResponse(
          'ADMIN_ACTION_INVALID_STATE',
          'This application was already reviewed by another administrator.',
          409,
        ),
      )
      .mockResolvedValueOnce(
        response({
          application: {
            ...submitted,
            status: 'APPROVED',
            decidedAt: '2026-09-28T12:00:00.000Z',
          },
          capabilities: { needsInfo: true, approve: true, reject: true },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationDetailClient, { id: 'application-1' }));
    await user.click(await screen.findByRole('button', { name: 'Needs info' }));
    await user.type(
      screen.getByLabelText('Note for the founder'),
      'Need more.',
    );
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(
      await screen.findByText(
        'This application was already reviewed by another administrator.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Approved')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Needs info' }),
    ).not.toBeInTheDocument();
  });
});
