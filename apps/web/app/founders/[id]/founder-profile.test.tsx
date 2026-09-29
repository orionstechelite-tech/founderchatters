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
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

import { FounderProfileClient } from './founder-profile-client';
import { MemberAppShell } from '../../member/member-app-shell';
import { initialsFrom } from '../../member/member-format';

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

const otherProfile = {
  id: 'user-other',
  displayName: 'Ada Visible',
  headline: null,
  bio: 'I help founders enter the UAE without copying a playbook.',
  avatarUrl: null,
  city: 'Dubai',
  country: 'UAE',
  company: {
    name: 'OrbitFlow',
    website: null,
    description: 'Workflow software for regional operations teams.',
    stage: 'Seed',
    industry: 'Marketplace',
    city: 'Dubai',
    country: 'UAE',
  },
  expertise: [{ id: 'topic-b2b', slug: 'b2b-sales', label: 'B2B sales' }],
  customExpertise: 'UAE market entry',
  currentNeedText: 'Hiring a senior product leader in travel.',
  needs: [{ id: 'need-hiring', slug: 'hiring', label: 'Hiring' }],
  savedByMe: false,
  memberSinceYear: 2026,
  isSelf: false,
};

const selfProfile = {
  ...otherProfile,
  id: 'user-self',
  headline: 'Operator in public markets',
  isSelf: true,
  savedByMe: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
  navigation.pathname = '/founders/user-other';
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockApi(profile: unknown = { founder: otherProfile }, status = 200) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/session')) return response(activeSession);
      if (url.endsWith('/v1/founders/user-other/save')) {
        return response({
          saved: init?.method !== 'DELETE',
          savedCount: init?.method === 'DELETE' ? 0 : 1,
        });
      }
      if (url.includes('/v1/founders/')) {
        return response(profile, status);
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderProfile(id: string) {
  const page = render(
    <MemberAppShell activeItem="Profile">
      <FounderProfileClient founderId={id} />
    </MemberAppShell>,
  );
  return page;
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-010 founder profile', () => {
  it('renders real fields and omits deferred Message, Ask, and contribution blocks', async () => {
    mockApi();
    const page = await renderProfile('user-other');
    expect(
      await screen.findByRole('heading', { name: 'Ada Visible' }),
    ).toBeVisible();
    expect(screen.getByText('OrbitFlow')).toBeVisible();
    expect(screen.getByText('Dubai, UAE · Marketplace · Seed')).toBeVisible();
    expect(
      screen.getByText('Workflow software for regional operations teams.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'I help founders enter the UAE without copying a playbook.',
      ),
    ).toBeVisible();
    expect(screen.getByText('B2B sales')).toBeVisible();
    expect(screen.getByText('UAE market entry')).toBeVisible();
    expect(
      screen.getByText('Hiring a senior product leader in travel.'),
    ).toBeVisible();
    expect(screen.getByText('Member since 2026')).toBeVisible();
    expect(screen.getByText('AV')).toBeVisible();
    expect(page.container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(page.container.querySelector('a[href^="data:"]')).toBeNull();
    expect(
      screen.queryByRole('link', { name: /OrbitFlow/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Message' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ask for help' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/CONTRIBUTION/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/founders helped/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Founder at OrbitFlow/i)).not.toBeInTheDocument();
    await expectAccessible(page.container);
  });

  it('renders HTML-like current-need and bio text without executing markup', async () => {
    mockApi({
      founder: {
        ...otherProfile,
        company: {
          ...otherProfile.company,
          website: 'javascript:alert(1)',
        },
        bio: '<img src=x onerror=alert(1)>',
        currentNeedText: '<script>alert(1)</script>',
        displayName: '  Ada   Visible  ',
      },
    });
    const page = await renderProfile('user-other');
    expect(await screen.findByText('<script>alert(1)</script>')).toBeVisible();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(page.container.querySelector('script')).toBeNull();
    expect(page.container.querySelector('img[src="x"]')).toBeNull();
    expect(page.container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('omits save on own profile and shows a stored headline', async () => {
    navigation.pathname = '/founders/user-self';
    mockApi({ founder: selfProfile });
    await renderProfile('user-self');
    expect(
      await screen.findByRole('heading', {
        name: 'Operator in public markets',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Save founder' }),
    ).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Member navigation' });
    expect(nav.querySelector('[data-nav-item="profile"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('saves and unsaves another founder', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup({ delay: null });
    await renderProfile('user-other');
    const save = await screen.findByRole('button', { name: 'Save founder' });
    await user.click(save);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Saved' })).toBeVisible(),
    );
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          String(call[0]).includes('/founders/user-other/save') &&
          call[1]?.method === 'POST',
      ),
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Saved' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save founder' }),
      ).toBeVisible(),
    );
  });

  it('omits ABOUT when bio is blank', async () => {
    mockApi({
      founder: {
        ...otherProfile,
        bio: null,
        headline: null,
        customExpertise: null,
        currentNeedText: null,
        needs: [],
      },
    });
    await renderProfile('user-other');
    expect(
      await screen.findByRole('heading', { name: 'Ada Visible' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'About' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Currently looking for' }),
    ).not.toBeInTheDocument();
  });

  it('uses a safe unavailable state', async () => {
    mockApi(
      {
        error: {
          code: 'FOUNDER_NOT_FOUND',
          message: 'That founder is not available.',
          requestId: 'request-test',
          fieldErrors: {},
        },
      },
      404,
    );
    await renderProfile('missing');
    expect(
      await screen.findByText('That founder is not available.'),
    ).toBeVisible();
    expect(screen.queryByText(/suspended/i)).not.toBeInTheDocument();
  });

  it('keeps the 390px profile layout contract', () => {
    const styles = readFileSync(
      resolve(__dirname, '../../globals.css'),
      'utf8',
    );
    expect(styles).toContain('.fc-founder-hero');
    expect(styles).toContain('@media (max-width: 390px)');
    expect(styles).toContain('padding-inline: 18px');
  });

  it('derives initials for display only and falls back safely', () => {
    expect(initialsFrom('Ada Visible')).toBe('AV');
    expect(initialsFrom('   ')).toBe('FC');
    expect(initialsFrom('---')).toBe('FC');
    expect(initialsFrom('Ada')).toBe('AD');
  });
});
