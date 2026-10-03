// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_NAV_GROUPS, AdminShell } from '@founderchatters/ui';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminAppShell } from './admin-app-shell';
import {
  AnalyticsScreen,
  AuditScreen,
  JobsScreen,
  MemberDetailScreen,
  MembersScreen,
  NotificationDetailScreen,
  OverviewScreen,
  ReputationScreen,
  RequestDetailScreen,
  RequestsScreen,
  SearchScreen,
  SettingsScreen,
  SupportScreen,
  SystemScreen,
  TaxonomyScreen,
  TemplatesScreen,
} from './admin-screens';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      response({
        user: { id: 'admin-1', email: 'ops@example.com' },
        roles: ['SUPER_ADMIN'],
        permissions: [
          'admin.overview.read',
          'admin.members.read',
          'admin.members.suspend',
          'admin.requests.read',
          'admin.support.read',
          'admin.reputation.read',
          'admin.notifications.read',
          'admin.notifications.retry',
          'admin.taxonomy.read',
          'admin.taxonomy.manage',
          'admin.analytics.read',
          'admin.audit.read',
          'admin.settings.read',
          'admin.system.read',
          'admin.jobs.read',
          'admin.search.read',
        ],
      }),
    ),
  );
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status = 403): Response {
  return response({ error: { code, message, fieldErrors: {} } }, status);
}

describe('FC-019 admin operations UI', () => {
  it('exposes the frozen admin IA destinations', () => {
    render(
      <AdminShell activeItem="Overview">
        <h1>Command Center</h1>
      </AdminShell>,
    );
    const hrefs = ADMIN_NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(hrefs).toEqual([
      '/admin',
      '/admin/applications',
      '/admin/members',
      '/admin/requests',
      '/admin/support',
      '/admin/reports',
      '/admin/reputation',
      '/admin/notifications',
      '/admin/taxonomy',
      '/admin/analytics',
      '/admin/admins',
      '/admin/audit',
      '/admin/settings',
      '/admin/system',
    ]);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/admin/reports',
    );
    expect(
      screen.getByRole('link', { name: 'Admins & Roles' }),
    ).toHaveAttribute('href', '/admin/admins');
    expect(
      screen.queryByRole('link', { name: 'Moderation' }),
    ).not.toBeInTheDocument();
  });

  it('shows the permission-denied state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          errorResponse(
            'ADMIN_PERMISSION_DENIED',
            'You do not have permission.',
          ),
        ),
    );
    render(
      <AdminAppShell activeItem="Overview" required="admin.overview.read">
        <h1>Hidden</h1>
      </AdminAppShell>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Permission denied' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Hidden' }),
    ).not.toBeInTheDocument();
  });

  it('renders command-center metrics from persisted counts', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/v1/admin/session')) {
        return response({
          user: { id: 'admin-1', email: 'ops@example.com' },
          roles: ['SUPER_ADMIN'],
          permissions: ['admin.overview.read'],
        });
      }
      return response({
        metrics: {
          submittedApplications: 2,
          openReports: 1,
          publishedRequests: 4,
          openSupportCases: 3,
          queuedNotificationDeliveries: 5,
          unresolvedJobFailures: 0,
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(OverviewScreen));
    expect(
      await screen.findByRole('heading', { name: 'Command Center' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Submitted applications')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.queryByText(/68%/)).not.toBeInTheDocument();
  });

  it('renders members, requests, support, and reputation queues', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const path = String(url);
      if (path.includes('/members')) {
        return response({
          items: [
            {
              id: 'u1',
              displayName: 'Priya',
              email: 'priya@example.com',
              companyName: 'Nexora',
              status: 'ACTIVE',
              emailVerified: true,
              applicationStatus: 'APPROVED',
              onboardingCompleted: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              deleted: false,
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        });
      }
      if (path.includes('/requests')) {
        return response({
          items: [
            {
              id: 'r1',
              headline: 'Need pricing help',
              status: 'PUBLISHED',
              type: 'ASK',
              authorId: 'u1',
              authorDisplayName: 'Priya',
              responseCount: 0,
              publishedAt: '2026-01-01T00:00:00.000Z',
              resolvedAt: null,
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        });
      }
      if (path.includes('/support')) {
        return response({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 1,
        });
      }
      if (path.includes('/reputation')) {
        return response({
          items: [
            {
              id: 'c1',
              helperId: 'h1',
              helperDisplayName: 'Omar',
              confirmerId: 'u1',
              requestId: 'r1',
              createdAt: '2026-01-01T00:00:00.000Z',
              hasThankYou: false,
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        });
      }
      return response({});
    });
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(MembersScreen));
    expect(await screen.findByText('Priya')).toBeInTheDocument();
    cleanup();
    render(createElement(RequestsScreen));
    expect(await screen.findByText('Need pricing help')).toBeInTheDocument();
    cleanup();
    render(createElement(SupportScreen));
    expect(
      await screen.findByText('No support cases yet.'),
    ).toBeInTheDocument();
    cleanup();
    render(createElement(ReputationScreen));
    expect(await screen.findByText('Omar')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /score/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps request detail free of private-message editing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          id: 'r1',
          headline: 'Need pricing help',
          context: 'Looking for SaaS pricing advice.',
          status: 'PUBLISHED',
          type: 'ASK',
          authorId: 'u1',
          authorDisplayName: 'Priya',
          responseCount: 0,
          publishedAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: null,
        }),
      ),
    );
    render(createElement(RequestDetailScreen, { id: 'r1' }));
    expect(
      await screen.findByText('Looking for SaaS pricing advice.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /resolve/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps notification templates and settings read-only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/templates')) {
          return response({
            templates: [
              {
                id: 't1',
                key: 'application-status',
                version: 'v1',
                subject: 'Update',
                isActive: true,
              },
            ],
          });
        }
        if (String(url).includes('/settings')) {
          return response({
            settings: [
              { key: 'openPublishedRequestLimit', source: 'code', value: 3 },
            ],
          });
        }
        return response({});
      }),
    );
    render(createElement(TemplatesScreen));
    expect(await screen.findByText(/application-status/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /save/i }),
    ).not.toBeInTheDocument();
    cleanup();
    render(createElement(SettingsScreen));
    expect(
      await screen.findByText('openPublishedRequestLimit'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /save settings/i }),
    ).not.toBeInTheDocument();
  });

  it('shows taxonomy manage, analytics, audit, system, jobs, and search states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const path = String(url);
        if (path.includes('/session')) {
          return response({
            user: { id: 'admin-1', email: 'ops@example.com' },
            roles: ['SUPER_ADMIN'],
            permissions: [
              'admin.taxonomy.manage',
              'admin.taxonomy.read',
              'admin.search.read',
            ],
          });
        }
        if (path.includes('/taxonomy')) {
          return response({ topics: [] });
        }
        if (path.includes('/analytics')) {
          return response({
            publishedRequests: 1,
            requestsWithResponse: 0,
            confirmedHelped: 0,
            activeHelpers: 0,
            requestsWithNoResponse: 1,
            submittedApplications: 2,
          });
        }
        if (path.includes('/audit')) {
          return response({
            items: [],
            page: 1,
            pageSize: 20,
            total: 0,
            totalPages: 1,
          });
        }
        if (path.includes('/system/jobs')) {
          return response({
            items: [],
            page: 1,
            pageSize: 20,
            total: 0,
            totalPages: 1,
          });
        }
        if (path.includes('/system')) {
          return response({
            api: 'ok',
            database: 'ok',
            notificationBacklog: 0,
            unresolvedJobFailures: 0,
          });
        }
        if (path.includes('/search')) {
          return response({ q: 'pr', results: [] });
        }
        return response({});
      }),
    );
    render(createElement(TaxonomyScreen));
    expect(
      await screen.findByRole('button', { name: 'Add topic' }),
    ).toBeInTheDocument();
    cleanup();
    render(createElement(AnalyticsScreen));
    expect(await screen.findByText('Published requests')).toBeInTheDocument();
    cleanup();
    render(createElement(AuditScreen));
    expect(
      await screen.findByText('No audit entries match.'),
    ).toBeInTheDocument();
    cleanup();
    render(createElement(SystemScreen));
    expect(await screen.findByText('Database')).toBeInTheDocument();
    cleanup();
    render(createElement(JobsScreen));
    expect(
      await screen.findByText('No job failures recorded.'),
    ).toBeInTheDocument();
    cleanup();
    render(createElement(SearchScreen, { initialQuery: 'pr' }));
    expect(
      await screen.findByText('No matching operational records.'),
    ).toBeInTheDocument();
  });

  it('shows loading and recoverable member errors', async () => {
    const user = userEvent.setup();
    let resolveMembers: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolvePromise) => {
          resolveMembers = resolvePromise;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(MembersScreen));
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    resolveMembers?.(errorResponse('UNKNOWN_ERROR', 'Queue unavailable.', 500));
    expect(await screen.findByText('Queue unavailable.')).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(
      response({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
      }),
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'ACTIVE');
    await waitFor(() => {
      expect(
        screen.getByText('No members match those filters.'),
      ).toBeInTheDocument();
    });
  });

  it('does not invite notification retry for sent deliveries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/session')) {
          return response({
            user: { id: 'admin-1', email: 'ops@example.com' },
            roles: ['SUPER_ADMIN'],
            permissions: ['admin.notifications.retry'],
          });
        }
        return response({
          id: 'd1',
          notificationId: 'n1',
          type: 'APPLICATION_APPROVED',
          title: 'Approved',
          recipientUserId: 'u1',
          recipientEmail: 'a@example.com',
          channel: 'EMAIL',
          status: 'SENT',
          attemptCount: 1,
          lastErrorCode: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          sentAt: '2026-01-01T00:01:00.000Z',
          templateVersion: 'v1',
        });
      }),
    );
    render(createElement(NotificationDetailScreen, { id: 'd1' }));
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry delivery' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /edit template/i }),
    ).not.toBeInTheDocument();
  });

  it('shows founder 360 without a conversation browser', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/session')) {
          return response({
            user: { id: 'admin-1', email: 'ops@example.com' },
            roles: ['MODERATOR'],
            permissions: ['admin.members.read', 'admin.members.suspend'],
          });
        }
        return response({
          id: 'u1',
          displayName: 'Priya',
          email: 'priya@example.com',
          companyName: 'Nexora',
          status: 'ACTIVE',
          emailVerified: true,
          applicationStatus: 'APPROVED',
          onboardingCompleted: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          deleted: false,
          city: 'Mumbai',
          country: 'India',
          suspendedUntil: null,
          suspensionReason: null,
          requestCount: 1,
          responseCount: 0,
          reportCount: 0,
          contributionCount: 0,
        });
      }),
    );
    render(createElement(MemberDetailScreen, { id: 'u1' }));
    expect(
      await screen.findByRole('heading', { name: 'Priya' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Suspend member' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/private message/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /messages/i }),
    ).not.toBeInTheDocument();
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
    expect(styles).toContain('@media (max-width: 1024px)');
    render(
      <AdminShell>
        <p>ops</p>
      </AdminShell>,
    );
    expect(
      screen.getByRole('heading', { name: 'Larger screen required' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Return to member app' }),
    ).toHaveAttribute('href', '/home');
  });

  it('does not treat 1024 as the unsupported state', () => {
    const styles = readFileSync(
      resolve(process.cwd(), '../../packages/ui/src/styles.css'),
      'utf8',
    );
    const desktop = styles.split('@media (max-width: 899px)')[0];
    expect(desktop).toContain('@media (max-width: 1024px)');
    expect(desktop).toContain('.fc-admin-unsupported {\n  display: none;');
  });
});
