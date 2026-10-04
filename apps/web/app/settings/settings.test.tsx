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
  pathname: '/settings/profile',
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

import type {
  MemberProfileSettingsResponse,
  MemberSessionsResponse,
} from '@founderchatters/contracts';

import { MemberAppShell } from '../member/member-app-shell';
import { AccountSettingsClient } from './account/account-settings-client';
import { ProfileSettingsClient } from './profile/profile-settings-client';
import { SecuritySettingsClient } from './security/security-settings-client';
import { SettingsFrame } from './settings-frame';

const activeSession = {
  user: {
    id: 'user-self',
    email: 'founder@example.com',
    emailVerified: true,
    status: 'ACTIVE',
  },
  access: {
    state: 'ACTIVE',
    applicationStatus: 'APPROVED',
    onboardingCompleted: true,
  },
};

const profileResponse: MemberProfileSettingsResponse = {
  profile: {
    displayName: 'Ada Founder',
    companyName: 'Ada Labs',
    city: 'Ahmedabad',
    country: 'India',
    headline: 'Building useful founder tools',
    bio: 'Helping founders solve practical operating problems.',
  },
};

const sessionsResponse: MemberSessionsResponse = {
  sessions: [
    {
      id: 'session-current',
      userAgent: 'Chrome on Windows',
      createdAt: '2026-10-03T08:00:00.000Z',
      expiresAt: '2026-11-02T08:00:00.000Z',
      current: true,
    },
    {
      id: 'session-other',
      userAgent: 'Safari on iPhone',
      createdAt: '2026-10-02T08:00:00.000Z',
      expiresAt: '2026-11-01T08:00:00.000Z',
      current: false,
    },
  ],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockApi(
  extra?: (
    url: string,
    method: string,
    init?: RequestInit,
  ) => Response | null | Promise<Response | null>,
) {
  let sessions = [...sessionsResponse.sessions];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const override = extra ? await extra(url, method, init) : null;
      if (override) return override;

      if (url.endsWith('/v1/auth/session') && method === 'GET') {
        return response(activeSession);
      }

      if (url.endsWith('/v1/auth/signout') && method === 'POST') {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/v1/me/settings/profile') && method === 'GET') {
        return response(profileResponse);
      }

      if (url.endsWith('/v1/me/settings/profile') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<
          string,
          unknown
        >;

        if (body.displayName === 'X') {
          return response(
            {
              error: {
                code: 'SETTINGS_INVALID_INPUT',
                message: 'Review the settings and try again.',
                requestId: 'req-profile-invalid',
                fieldErrors: {
                  displayName: ['Enter your name.'],
                },
              },
            },
            400,
          );
        }

        return response({
          profile: {
            ...profileResponse.profile,
            ...body,
          },
        });
      }

      if (url.endsWith('/v1/me/settings/account') && method === 'GET') {
        return response({
          account: {
            email: 'founder@example.com',
            emailVerified: true,
            status: 'ACTIVE',
          },
        });
      }

      if (url.endsWith('/v1/me/sessions') && method === 'GET') {
        return response({ sessions });
      }

      if (
        url.endsWith('/v1/me/sessions/session-other') &&
        method === 'DELETE'
      ) {
        sessions = sessions.filter((item) => item.id !== 'session-other');
        return response({
          sessionId: 'session-other',
          revoked: true,
        });
      }

      if (url.endsWith('/v1/me/sessions/revoke-others') && method === 'POST') {
        const revokedCount = sessions.filter((item) => !item.current).length;
        sessions = sessions.filter((item) => item.current);
        return response({ revokedCount }, 201);
      }

      if (url.endsWith('/v1/me/password') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          currentPassword?: string;
          newPassword?: string;
          confirmPassword?: string;
        };

        if (body.currentPassword === 'wrong password') {
          return response(
            {
              error: {
                code: 'SETTINGS_CURRENT_PASSWORD_INVALID',
                message: 'The current password is incorrect.',
                requestId: 'req-password-invalid',
                fieldErrors: {
                  currentPassword: ['The current password is incorrect.'],
                },
              },
            },
            400,
          );
        }

        sessions = sessions.filter((item) => item.current);

        return response(
          {
            changed: true,
            revokedSessionCount: 1,
          },
          201,
        );
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    },
  );

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
    },
  });

  expect(result.violations).toEqual([]);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();

  navigation.pathname = '/settings/profile';
  navigation.replace.mockReset();
  navigation.refresh.mockReset();
  navigation.push.mockReset();
});

describe('FC-016 settings', () => {
  it('keeps six Settings sections while primary member navigation stays exactly five and neutral', async () => {
    mockApi();
    navigation.pathname = '/settings/profile';

    render(
      <MemberAppShell activeItem="Profile">
        <SettingsFrame>
          <p>Settings content</p>
        </SettingsFrame>
      </MemberAppShell>,
    );

    expect(await screen.findByText('Settings content')).toBeVisible();

    const memberNav = screen.getByRole('navigation', {
      name: 'Member navigation',
    });

    const primaryLinks = within(memberNav).getAllByRole('link');

    expect(primaryLinks).toHaveLength(5);
    expect(primaryLinks.map((link) => link.textContent)).toEqual([
      'Home',
      'Discover',
      'Ask',
      'Messages',
      'Profile',
    ]);

    expect(primaryLinks.some((link) => link.hasAttribute('aria-current'))).toBe(
      false,
    );

    const settingsNav = screen.getByRole('navigation', {
      name: 'Settings navigation',
    });

    const settingsLinks = within(settingsNav).getAllByRole('link');

    expect(settingsLinks).toHaveLength(6);
    expect(settingsLinks.map((link) => link.textContent)).toEqual([
      'Profile',
      'Account',
      'Notifications',
      'Privacy',
      'Blocked users',
      'Security',
    ]);

    expect(
      within(settingsNav).getByRole('link', { name: 'Profile' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('loads real profile values and saves permitted profile fields', async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = mockApi();

    const { container } = render(<ProfileSettingsClient />);

    const displayName = await screen.findByLabelText('Display name');

    expect(displayName).toHaveValue('Ada Founder');
    expect(screen.getByLabelText('Company')).toHaveValue('Ada Labs');
    expect(screen.getByLabelText('City')).toHaveValue('Ahmedabad');
    expect(screen.getByLabelText('Country')).toHaveValue('India');
    expect(screen.getByLabelText('Headline')).toHaveValue(
      'Building useful founder tools',
    );
    expect(screen.getByLabelText('Bio')).toHaveValue(
      'Helping founders solve practical operating problems.',
    );

    await user.clear(displayName);
    await user.type(displayName, 'Ada Updated');

    await user.clear(screen.getByLabelText('Headline'));
    await user.type(
      screen.getByLabelText('Headline'),
      'Building the next founder network',
    );

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Changes saved.')).toBeVisible();

    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        if (
          !String(url).endsWith('/v1/me/settings/profile') ||
          (init as RequestInit | undefined)?.method !== 'PATCH'
        ) {
          return false;
        }

        const body = JSON.parse(String((init as RequestInit).body)) as Record<
          string,
          unknown
        >;

        return (
          body.displayName === 'Ada Updated' &&
          body.headline === 'Building the next founder network'
        );
      }),
    ).toBe(true);

    await expectAccessible(container);
  });

  it('shows API field validation without discarding typed profile values', async () => {
    const user = userEvent.setup({ delay: null });
    mockApi();

    render(<ProfileSettingsClient />);

    const displayName = await screen.findByLabelText('Display name');

    await user.clear(displayName);
    await user.type(displayName, 'X');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter your name.')).toBeVisible();
    expect(displayName).toHaveValue('X');
    expect(
      screen.getByText('Review the settings and try again.'),
    ).toBeVisible();
  });

  it('renders only truthful account information and no unsupported editable controls', async () => {
    mockApi();

    render(<AccountSettingsClient />);

    expect(await screen.findByText('founder@example.com')).toBeVisible();
    expect(screen.getByText('Verified')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();

    expect(
      screen.queryByLabelText('Type DELETE to confirm'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/change email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /phone|billing|subscription/i }),
    ).not.toBeInTheDocument();
  });

  it('lists active sessions and revokes another session', async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = mockApi();

    render(<SecuritySettingsClient />);

    expect(await screen.findByText('This device')).toBeVisible();
    expect(screen.getByText('Safari on iPhone')).toBeVisible();

    const revokeButton = screen.getByRole('button', {
      name: 'Revoke',
    });

    await user.click(revokeButton);

    await waitFor(() => {
      expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument();
    });

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/v1/me/sessions/session-other') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      ),
    ).toBe(true);

    expect(screen.getByText('This device')).toBeVisible();
  });

  it('revokes all other sessions while preserving the current session', async () => {
    const user = userEvent.setup({ delay: null });
    mockApi();

    render(<SecuritySettingsClient />);

    const revokeAll = await screen.findByRole('button', {
      name: 'Revoke all others',
    });

    await user.click(revokeAll);

    await waitFor(() => {
      expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument();
    });

    expect(screen.getByText('This device')).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: 'Revoke all others',
      }),
    ).not.toBeInTheDocument();
  });

  it('changes password, exposes validation safely, and keeps the current screen usable', async () => {
    const user = userEvent.setup({ delay: null });
    mockApi();

    const { container } = render(<SecuritySettingsClient />);

    await screen.findByText('This device');

    const current = screen.getByLabelText('Current password');
    const next = screen.getByLabelText('New password');
    const confirm = screen.getByLabelText('Confirm new password');

    await user.type(current, 'wrong password');
    await user.type(next, 'replacement secure password');
    await user.type(confirm, 'replacement secure password');

    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(
      await screen.findByText('The current password is incorrect.', {
        selector: '.fc-settings-error',
      }),
    ).toBeVisible();

    expect(current).toHaveValue('wrong password');

    await user.clear(current);
    await user.type(current, 'original secure password');

    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Password changed.')).toBeVisible();

    expect(current).toHaveValue('');
    expect(next).toHaveValue('');
    expect(confirm).toHaveValue('');
    expect(screen.getByText('This device')).toBeVisible();

    await expectAccessible(container);
  });

  it('turns the member more menu into real Settings, Notifications, and Sign out actions', async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = mockApi();

    render(
      <MemberAppShell activeItem="Home">
        <p>Workspace</p>
      </MemberAppShell>,
    );

    expect(await screen.findByText('Workspace')).toBeVisible();

    const menuButton = screen.getByRole('button', {
      name: 'Open member menu',
    });

    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(menuButton);

    expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    const menu = screen.getByRole('navigation', {
      name: 'Member menu',
    });

    expect(
      within(menu).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('href', '/settings/profile');

    expect(
      within(menu).getByRole('link', { name: 'Notifications' }),
    ).toHaveAttribute('href', '/notifications');

    await user.click(within(menu).getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith('/v1/auth/signout') &&
            (init as RequestInit | undefined)?.method === 'POST',
        ),
      ).toBe(true);
    });

    expect(navigation.replace).toHaveBeenCalledWith('/signin');
  });

  it('keeps all six route files inside the member Settings shell', () => {
    const routes = [
      'profile',
      'account',
      'notifications',
      'privacy',
      'blocked',
      'security',
    ];

    for (const route of routes) {
      const source = readFileSync(
        resolve(process.cwd(), `app/settings/${route}/page.tsx`),
        'utf8',
      );

      expect(source).toContain('<MemberAppShell');
      expect(source).toContain('<SettingsFrame>');
    }
  });

  it('does not invent notification preferences, privacy persistence, or FC-017 block actions', () => {
    const notificationSource = readFileSync(
      resolve(process.cwd(), 'app/settings/notifications/page.tsx'),
      'utf8',
    );

    const privacySource = readFileSync(
      resolve(process.cwd(), 'app/settings/privacy/page.tsx'),
      'utf8',
    );

    const blockedSource = readFileSync(
      resolve(process.cwd(), 'app/settings/blocked/page.tsx'),
      'utf8',
    );

    const notificationText = notificationSource.replace(/\s+/g, ' ');
    const privacyText = privacySource.replace(/\s+/g, ' ');
    const blockedText = blockedSource.replace(/\s+/g, ' ');

    expect(notificationText).toContain('not currently configurable');
    expect(notificationSource).not.toMatch(
      /type=["']checkbox["']|pushEnabled|emailEnabled/i,
    );

    expect(privacyText).toContain('no fake “save privacy settings” action');
    expect(privacySource).not.toMatch(
      /Save privacy settings|type=["']checkbox["']/,
    );

    expect(blockedText).toContain('BlockedSettingsClient');
    expect(blockedSource).not.toMatch(/reportMember/);
  });

  it('contains the canonical 390 Settings responsive and touch-target rules', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

    expect(css).toContain('@media (max-width: 390px)');
    expect(css).toContain('.fc-member-shell__content:has(.fc-settings)');
    expect(css).toContain('overflow-x: hidden');
    expect(css).toContain('min-height: 44px');
  });

  it('requires typed DELETE confirmation before submitting account deletion', async () => {
    const user = userEvent.setup({ delay: null });
    let failOnce = true;
    mockApi(async (url, method, init) => {
      if (url.endsWith('/v1/me/account/delete') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          confirmation?: string;
        };
        expect(body.confirmation).toBe('DELETE');
        if (failOnce) {
          failOnce = false;
          return new Response(
            JSON.stringify({
              error: {
                code: 'ACCOUNT_DELETION_CONFIRMATION_REQUIRED',
                message: 'Type DELETE to confirm account deletion.',
              },
            }),
            {
              status: 400,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        return new Response(null, { status: 204 });
      }
      return null;
    });

    render(<AccountSettingsClient />);
    expect(await screen.findByText('founder@example.com')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Delete account' }),
    ).toBeVisible();
    expect(screen.queryByText(/retention period of/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete your account?')).toBeVisible();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/anonymization rules/i)).toBeVisible();
    expect(
      within(dialog).getByText(/may retain anonymized records/i),
    ).toBeVisible();
    const confirm = within(dialog).getByLabelText('Type DELETE to confirm');
    const submit = within(dialog).getByRole('button', {
      name: 'Delete account',
    });
    expect(submit).toBeDisabled();
    expect(confirm).toHaveFocus();

    await user.type(confirm, 'delete');
    expect(submit).toBeDisabled();
    await user.clear(confirm);
    await user.type(confirm, 'DELETE');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(
      await screen.findByText('Type DELETE to confirm account deletion.'),
    ).toBeVisible();
    expect(confirm).toHaveValue('DELETE');
    await user.click(submit);
    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/signin');
    });
  });

  it('closes the delete-account sheet with Escape and stays accessible', async () => {
    const user = userEvent.setup({ delay: null });
    mockApi();
    const { container } = render(<AccountSettingsClient />);
    await screen.findByText('founder@example.com');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = screen.getByRole('dialog');
    await expectAccessible(container);
    await user.keyboard('{Escape}');
    expect(dialog).not.toBeInTheDocument();
    expect(screen.queryByText('Delete your account?')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Delete account' }),
      ).toHaveFocus();
    });
  });

  it('cancels account deletion without calling the API', async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = mockApi();
    render(<AccountSettingsClient />);
    await screen.findByText('founder@example.com');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Keep my account' }));
    expect(screen.queryByText('Delete your account?')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/v1/me/account/delete'),
      ),
    ).toBe(false);
  });
});
