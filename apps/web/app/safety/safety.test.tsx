// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  pathname: '/founders/user-other',
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    replace: navigation.replace,
    refresh: navigation.refresh,
    push: navigation.push,
  }),
}));

import { ReportDetailClient } from '../admin/reports/[id]/report-detail-client';
import { ReportsQueueClient } from '../admin/reports/reports-queue-client';
import { FounderProfileClient } from '../founders/[id]/founder-profile-client';
import { BlockedSettingsClient } from '../settings/blocked/blocked-settings-client';
import { SuspendedClient } from '../suspended/suspended-client';
import { BlockSheet } from './block-sheet';
import { ReportSheet } from './report-sheet';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigation.replace.mockReset();
});

describe('FC-017 safety UI', () => {
  it('submits a report, keeps details after a recoverable error, and confirms success', async () => {
    const user = userEvent.setup({ delay: null });
    let failOnce = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/v1/reports') && (init?.method ?? 'GET') === 'POST') {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            details?: string;
          };
          if (failOnce) {
            failOnce = false;
            return response(
              {
                error: {
                  code: 'SAFETY_INVALID_INPUT',
                  message: 'Review the report and try again.',
                  fieldErrors: {},
                },
              },
              400,
            );
          }
          expect(body.details).toBe('Kept after the first failure.');
          return response({ report: { id: 'report-1', status: 'OPEN' } });
        }
        throw new Error(`Unexpected ${url}`);
      }),
    );

    const { container } = render(
      <ReportSheet
        onClose={() => undefined}
        open
        targetId="user-other"
        targetType="USER"
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Harassment or abuse' }),
    );
    await user.type(
      screen.getByLabelText('Additional context'),
      'Kept after the first failure.',
    );
    await user.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(
      await screen.findByText('Review the report and try again.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Additional context')).toHaveValue(
      'Kept after the first failure.',
    );
    await user.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(await screen.findByText(/Report submitted/)).toBeVisible();
    expect(
      screen.getByText(/won’t see who submitted the report/),
    ).toBeVisible();

    const axeResult = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(axeResult.violations).toEqual([]);
  });

  it('confirms a block using the founder name', async () => {
    const user = userEvent.setup({ delay: null });
    const onBlocked = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain('/v1/me/blocks/user-other');
        return response({ blocked: true, userId: 'user-other' });
      }),
    );

    render(
      <BlockSheet
        founderId="user-other"
        founderName="Ada Helper"
        onBlocked={onBlocked}
        onClose={() => undefined}
        open
      />,
    );

    expect(screen.getByText('Block Ada Helper?')).toBeVisible();
    expect(screen.getByText('Direct messaging stops')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Block founder' }));
    await waitFor(() => expect(onBlocked).toHaveBeenCalled());
  });

  it('loads the real block list and unblocks a founder', async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.includes('/v1/me/blocks/user-blocked') &&
          init?.method === 'DELETE'
        ) {
          return response({ blocked: false, userId: 'user-blocked' });
        }
        if (url.includes('/v1/me/blocks')) {
          return response({
            founders: [
              {
                id: 'user-blocked',
                displayName: 'Blocked Founder',
                companyName: 'Blocked Co',
                blockedAt: '2026-10-03T00:00:00.000Z',
              },
            ],
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
          });
        }
        throw new Error(url);
      }),
    );

    render(<BlockedSettingsClient />);
    expect(await screen.findByText('Blocked Founder')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Unblock' }));
    await waitFor(() => {
      expect(screen.queryByText('Blocked Founder')).not.toBeInTheDocument();
    });
  });

  it('renders the suspended state from real session data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain('/v1/auth/session');
        return response({
          user: {
            id: 'user-self',
            email: 'suspended@example.com',
            emailVerified: true,
            status: 'SUSPENDED',
          },
          access: {
            state: 'SUSPENDED',
            applicationStatus: 'APPROVED',
            onboardingCompleted: true,
            suspensionReason: 'Fraud or impersonation',
            suspendedUntil: null,
          },
        });
      }),
    );

    render(<SuspendedClient />);
    expect(await screen.findByText('Your account is suspended.')).toBeVisible();
    expect(screen.getByText(/Fraud or impersonation/)).toBeVisible();
    expect(screen.queryByText(/appeal submitted/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  it('exposes report and block actions on a founder profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/founders/user-other/reputation')) {
          return response({
            founder: {
              id: 'user-other',
              displayName: 'Ada Helper',
              avatarUrl: null,
              companyName: 'Ada Labs',
              city: null,
              country: null,
            },
            isSelf: false,
            summary: {
              foundersHelped: 0,
              confirmedHelps: 0,
              introductions: 0,
              helpfulTopics: [],
              mostRecognizedTopic: null,
            },
            contributions: [],
            page: 1,
            pageSize: 5,
            total: 0,
            totalPages: 1,
          });
        }
        if (url.includes('/v1/founders/user-other')) {
          return response({
            founder: {
              id: 'user-other',
              displayName: 'Ada Helper',
              headline: 'Operator',
              bio: null,
              avatarUrl: null,
              city: null,
              country: null,
              memberSinceYear: 2026,
              customExpertise: null,
              currentNeedText: null,
              isSelf: false,
              savedByMe: false,
              company: { name: 'Ada Labs', description: null },
              expertise: [],
              needs: [],
            },
          });
        }
        throw new Error(url);
      }),
    );

    render(<FounderProfileClient founderId="user-other" />);
    expect(
      await screen.findByRole('button', { name: 'Report founder' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Block founder' })).toBeVisible();
  });

  it('keeps 390 safety overflow and 44px touch-target rules', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    expect(css).toContain('@media (max-width: 390px)');
    expect(css).toContain('.fc-safety-overlay');
    expect(css).toContain('overflow-x: hidden');
    expect(css).toContain('min-height: 44px');
  });

  it('wires request and message safety entry points without a conversation browser', () => {
    const requestDetail = readFileSync(
      resolve(process.cwd(), 'app/requests/[id]/request-detail-client.tsx'),
      'utf8',
    );
    const requestHelp = readFileSync(
      resolve(process.cwd(), 'app/requests/[id]/request-help-client.tsx'),
      'utf8',
    );
    const messages = readFileSync(
      resolve(process.cwd(), 'app/messages/messages-client.tsx'),
      'utf8',
    );
    const reportDetail = readFileSync(
      resolve(process.cwd(), 'app/admin/reports/[id]/report-detail-client.tsx'),
      'utf8',
    );
    const memberNav = readFileSync(
      resolve(process.cwd(), 'app/member/member-app-shell.tsx'),
      'utf8',
    );
    expect(requestDetail).toContain('Report request');
    expect(requestDetail).toContain('Block founder');
    expect(requestHelp).toContain('Report response');
    expect(messages).toContain('Report message');
    expect(reportDetail).toContain('Reported message');
    expect(reportDetail).toContain(
      'This view contains only the message attached to this report.',
    );
    expect(reportDetail).not.toMatch(/view conversation|browse conversation/i);
    expect(memberNav).toContain("label: 'Home'");
    expect(memberNav).toContain("label: 'Discover'");
    expect(memberNav).toContain("label: 'Ask'");
    expect(memberNav).toContain("label: 'Messages'");
    expect(memberNav).toContain("label: 'Profile'");
    expect(memberNav.match(/label: '/g)?.length).toBe(5);
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
    expect(styles).toContain('display: none !important');
    expect(styles).toContain('.fc-admin-sidebar');
    expect(styles).toContain('.fc-admin-content');
    expect(styles).toContain('@media (max-width: 1024px)');
  });

  it('loads the admin report queue and shows only scoped MESSAGE evidence', async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/v1/admin/reports')) {
          return response({
            reports: [
              {
                id: 'report-message',
                status: 'OPEN',
                targetType: 'MESSAGE',
                targetId: 'message-1',
                reasonCode: 'HARASSMENT_ABUSE',
                createdAt: '2026-10-03T00:00:00.000Z',
              },
            ],
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
            status: null,
          });
        }
        if (url.endsWith('/v1/admin/reports/report-message')) {
          return response({
            report: {
              id: 'report-message',
              status: 'OPEN',
              targetType: 'MESSAGE',
              targetId: 'message-1',
              reasonCode: 'HARASSMENT_ABUSE',
              details: 'Optional context',
              createdAt: '2026-10-03T00:00:00.000Z',
              reporter: { id: 'user-reporter', displayName: 'Reporter' },
              evidence: {
                kind: 'MESSAGE',
                messageId: 'message-1',
                conversationId: 'conversation-1',
                sender: { id: 'user-other', displayName: 'Ada Helper' },
                createdAt: '2026-10-03T00:00:00.000Z',
                deletedAt: null,
                body: 'EXACT_REPORTED_MESSAGE_BODY',
              },
            },
          });
        }
        if (
          url.endsWith('/v1/admin/reports/report-message/review') &&
          init?.method === 'POST'
        ) {
          return response({
            report: {
              id: 'report-message',
              status: 'UNDER_REVIEW',
              targetType: 'MESSAGE',
              targetId: 'message-1',
              reasonCode: 'HARASSMENT_ABUSE',
              details: 'Optional context',
              createdAt: '2026-10-03T00:00:00.000Z',
              reporter: { id: 'user-reporter', displayName: 'Reporter' },
              evidence: {
                kind: 'MESSAGE',
                messageId: 'message-1',
                conversationId: 'conversation-1',
                sender: { id: 'user-other', displayName: 'Ada Helper' },
                createdAt: '2026-10-03T00:00:00.000Z',
                deletedAt: null,
                body: 'EXACT_REPORTED_MESSAGE_BODY',
              },
            },
          });
        }
        throw new Error(url);
      }),
    );

    render(<ReportsQueueClient />);
    expect(await screen.findByText(/MESSAGE/)).toBeVisible();
    expect(screen.getByText(/HARASSMENT_ABUSE/)).toBeVisible();

    const detail = render(<ReportDetailClient reportId="report-message" />);
    expect(await screen.findByText('Reported message')).toBeVisible();
    expect(screen.getByText('EXACT_REPORTED_MESSAGE_BODY')).toBeVisible();
    expect(screen.getByText(/Ada Helper/)).toBeVisible();
    expect(
      screen.getByText(
        'This view contains only the message attached to this report.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/NEIGHBOR_/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /conversation/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /view conversation|browse/i }),
    ).not.toBeInTheDocument();

    const axeResult = await axe.run(detail.container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(axeResult.violations).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText(/UNDER_REVIEW/)).toBeVisible();
  });

  it('shows a permission error instead of message evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain('/v1/admin/reports/report-denied');
        return response(
          {
            error: {
              code: 'ADMIN_PERMISSION_DENIED',
              message:
                'You do not have permission to perform this admin action.',
            },
          },
          403,
        );
      }),
    );

    render(<ReportDetailClient reportId="report-denied" />);
    expect(
      await screen.findByText(
        'You do not have permission to perform this admin action.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Reported message')).not.toBeInTheDocument();
  });
});
