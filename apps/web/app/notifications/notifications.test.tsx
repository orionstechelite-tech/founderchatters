// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  pathname: '/notifications',
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    replace: navigation.replace,
    push: navigation.push,
  }),
}));

import type {
  MemberNotification,
  MemberNotificationsResponse,
} from '@founderchatters/contracts';
import { MemberAppShell } from '../member/member-app-shell';
import { NotificationsClient } from './notifications-client';

const activeSession = {
  user: {
    id: 'user-self',
    email: 'self@example.com',
    emailVerified: true,
    status: 'ACTIVE',
  },
  access: {
    state: 'ACTIVE',
    applicationStatus: 'APPROVED',
    onboardingCompleted: true,
  },
};

function notification(
  overrides: Partial<MemberNotification> = {},
): MemberNotification {
  return {
    id: 'notification-1',
    type: 'REQUEST_ADVICE',
    title: 'Ada Helper shared public advice',
    body: 'Ada Helper responded to your request.',
    href: '/requests/request-1',
    readAt: null,
    createdAt: '2026-10-02T10:00:00.000Z',
    ...overrides,
  };
}

function notificationsResponse(
  notifications: MemberNotification[] = [notification()],
  nextBefore: string | null = null,
): MemberNotificationsResponse {
  return {
    notifications,
    nextBefore,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigation.pathname = '/notifications';
  navigation.replace.mockReset();
  navigation.push.mockReset();
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockApi(
  initial: MemberNotificationsResponse = notificationsResponse(),
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/v1/auth/session')) {
        return response(activeSession);
      }

      if (url.endsWith('/v1/notifications/read-all') && method === 'POST') {
        return response({
          updatedCount: initial.notifications.filter(
            (item) => item.readAt === null,
          ).length,
        });
      }

      const readMatch = url.match(/\/v1\/notifications\/([^/?]+)\/read$/);
      if (readMatch && method === 'POST') {
        const id = decodeURIComponent(readMatch[1] ?? '');
        const found = initial.notifications.find((item) => item.id === id);
        if (!found) {
          return response(
            {
              error: {
                code: 'NOTIFICATION_NOT_FOUND',
                message: 'Notification not found.',
                requestId: 'req',
                fieldErrors: {},
              },
            },
            404,
          );
        }

        return response({
          notification: {
            ...found,
            readAt: found.readAt ?? '2026-10-02T10:05:00.000Z',
          },
        });
      }

      if (url.includes('/v1/notifications') && method === 'GET') {
        return response(initial);
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    },
  );

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderNotifications(
  payload: MemberNotificationsResponse = notificationsResponse(),
) {
  const fetchMock = mockApi(payload);
  const page = render(
    <MemberAppShell activeItem="Home">
      <NotificationsClient />
    </MemberAppShell>,
  );
  return { ...page, fetchMock };
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-015 notifications', () => {
  it('renders notifications newest-first with unread and read states', async () => {
    const newest = notification({
      id: 'notification-new',
      title: 'Application approved',
      type: 'APPLICATION_APPROVED',
      href: '/application',
      createdAt: '2026-10-02T10:00:00.000Z',
      readAt: null,
    });
    const older = notification({
      id: 'notification-old',
      title: 'Introduction offered',
      type: 'INTRODUCTION_OFFERED',
      createdAt: '2026-10-02T09:00:00.000Z',
      readAt: '2026-10-02T09:30:00.000Z',
    });

    const { container } = await renderNotifications(
      notificationsResponse([newest, older]),
    );

    expect(await screen.findByText('Application approved')).toBeVisible();
    const rows = container.querySelectorAll('.fc-notifications-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Application approved');
    expect(rows[1]).toHaveTextContent('Introduction offered');
    expect(rows[0]?.className).toContain('fc-notifications-row--unread');
    expect(rows[1]?.className).not.toContain('fc-notifications-row--unread');

    const dots = container.querySelectorAll('.fc-notifications-dot');
    expect(dots[0]).toHaveAttribute('data-read', 'false');
    expect(dots[1]).toHaveAttribute('data-read', 'true');

    await expectAccessible(container);
  });

  it('marks one notification read and keeps its deep link usable', async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock } = await renderNotifications();

    const link = await screen.findByRole('link', {
      name: /Ada Helper shared public advice/,
    });
    expect(link).toHaveAttribute('href', '/requests/request-1');

    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) => {
          return (
            String(url).endsWith('/v1/notifications/notification-1/read') &&
            (init as RequestInit | undefined)?.method === 'POST'
          );
        }),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(link.className).not.toContain('fc-notifications-row--unread');
    });
  });

  it('marks all unread notifications read', async () => {
    const user = userEvent.setup({ delay: null });
    const payload = notificationsResponse([
      notification({ id: 'notification-1' }),
      notification({
        id: 'notification-2',
        title: 'Private help offered',
        type: 'PRIVATE_HELP_OFFER',
      }),
    ]);
    const { fetchMock, container } = await renderNotifications(payload);

    expect(await screen.findByText('2 unread')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) => {
          return (
            String(url).endsWith('/v1/notifications/read-all') &&
            (init as RequestInit | undefined)?.method === 'POST'
          );
        }),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByText('You are all caught up.')).toBeVisible();
    });
    expect(
      container.querySelectorAll('.fc-notifications-row--unread'),
    ).toHaveLength(0);
  });

  it('renders the useful empty state without sample notification fixtures', async () => {
    const { container } = await renderNotifications(notificationsResponse([]));

    expect(
      await screen.findByRole('heading', {
        name: 'Nothing needs your attention.',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'When something needs a response or an update, it will appear here.',
      ),
    ).toBeVisible();

    expect(screen.queryByText('Application approved')).not.toBeInTheDocument();
    expect(screen.queryByText('Introduction offered')).not.toBeInTheDocument();
    await expectAccessible(container);
  });

  it('keeps exactly five primary nav destinations and none active', async () => {
    await renderNotifications(notificationsResponse([]));

    await screen.findByRole('heading', {
      name: 'Nothing needs your attention.',
    });

    const nav = screen.getByRole('navigation', {
      name: 'Member navigation',
    });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(5);
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      'Discover',
      'Ask',
      'Messages',
      'Profile',
    ]);
    expect(
      links.filter((link) => link.hasAttribute('aria-current')),
    ).toHaveLength(0);
  });

  it('contains the frozen desktop and 390px notification presentation', async () => {
    await renderNotifications();

    expect(
      await screen.findByText('Only what needs your attention.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Activity that needs your attention.'),
    ).toBeInTheDocument();

    const styles = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');
    expect(styles).toContain('/* FC-015 Notifications */');
    expect(styles).toContain('@media (max-width: 390px)');
    expect(styles).toContain('.fc-notifications-title-mobile');
    expect(styles).toContain('.fc-notifications-title-desktop');
    expect(styles).toContain('.fc-notifications-row--unread');
    expect(styles).toContain("data-read='true'");
    expect(styles).toContain('overflow-x: hidden');
  });
});
