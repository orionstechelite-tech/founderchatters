// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  pathname: '/reputation',
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

import type { MemberReputationResponse } from '@founderchatters/contracts';
import { MemberAppShell } from '../member/member-app-shell';
import { ReputationClient } from './reputation-client';

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

const emptyReputation: MemberReputationResponse = {
  founder: {
    id: 'user-self',
    displayName: 'Ada Self',
    avatarUrl: null,
    companyName: 'OrbitFlow',
    city: 'Dubai',
    country: 'UAE',
  },
  isSelf: true,
  summary: {
    foundersHelped: 0,
    confirmedHelps: 0,
    introductions: 0,
    helpfulTopics: [],
    mostRecognizedTopic: null,
  },
  contributions: [],
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
};

const filledReputation: MemberReputationResponse = {
  ...emptyReputation,
  summary: {
    foundersHelped: 2,
    confirmedHelps: 3,
    introductions: 1,
    helpfulTopics: [
      { id: 'topic-gtm', slug: 'gtm', label: 'GTM', count: 2 },
      { id: 'topic-b2b', slug: 'b2b-sales', label: 'B2B sales', count: 1 },
    ],
    mostRecognizedTopic: {
      id: 'topic-gtm',
      slug: 'gtm',
      label: 'GTM',
      count: 2,
    },
  },
  contributions: [
    {
      id: 'c1',
      type: 'ADVICE',
      label: 'Advice confirmed helpful',
      topics: [{ id: 'topic-gtm', slug: 'gtm', label: 'GTM' }],
      createdAt: '2026-01-03T00:00:00.000Z',
      confirmer: {
        id: 'user-sarah',
        displayName: 'Sarah Chen',
        avatarUrl: null,
        companyName: 'Northwind',
        city: 'Dubai',
        country: 'UAE',
      },
      thankYou: '<script>alert(1)</script> Grateful note.',
      requestAvailable: true,
      requestId: 'req-1',
    },
    {
      id: 'c2',
      type: 'INTRODUCTION_OFFER',
      label: 'Introduction confirmed helpful',
      topics: [],
      createdAt: '2026-01-02T00:00:00.000Z',
      confirmer: null,
      thankYou: null,
      requestAvailable: false,
      requestId: null,
    },
  ],
  total: 2,
  totalPages: 1,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockApi(payload: MemberReputationResponse = emptyReputation) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/v1/auth/session')) return response(activeSession);
    if (url.includes('/v1/me/reputation')) return response(payload);
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-014 reputation', () => {
  it('shows a useful empty state without sample fixtures', async () => {
    mockApi();
    const page = render(
      <MemberAppShell activeItem="Profile">
        <ReputationClient />
      </MemberAppShell>,
    );
    expect(
      await screen.findByText('No confirmed contributions yet'),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Your contribution history appears here when another founder explicitly confirms/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Help another founder' }),
    ).toHaveAttribute('href', '/home');
    expect(screen.queryByText('18 founders helped')).not.toBeInTheDocument();
    expect(screen.queryByText('Maya thanked you')).not.toBeInTheDocument();
    await expectAccessible(page.container);
  });

  it('renders live metrics, deterministic labels, and plain-text thank-you', async () => {
    mockApi(filledReputation);
    render(
      <MemberAppShell activeItem="Profile">
        <ReputationClient />
      </MemberAppShell>,
    );
    expect(await screen.findByText('Ada Self')).toBeVisible();
    expect(screen.getByText(/founders helped/i)).toBeVisible();
    expect(screen.getByText('Confirmed helps')).toBeVisible();
    expect(screen.getByText('Advice confirmed helpful')).toBeVisible();
    expect(screen.getByText('Introduction confirmed helpful')).toBeVisible();
    expect(screen.getByText('Helped Sarah Chen')).toBeVisible();
    expect(
      screen.getAllByText('A founder confirmed this helped').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Grateful note/)).toBeVisible();
    expect(
      screen.queryByText('Looking for UAE GTM help'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/repeat founder/i)).not.toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(document.body.innerHTML).not.toContain('dangerouslySetInnerHTML');
    expect(document.body.textContent).toContain('<script>alert(1)</script>');
  });

  it('keeps reputation out of primary nav and matches responsive contract', async () => {
    mockApi();
    render(
      <MemberAppShell activeItem="Profile">
        <ReputationClient />
      </MemberAppShell>,
    );
    await screen.findByText('No confirmed contributions yet');
    expect(
      screen.queryByRole('link', { name: 'Reputation' }),
    ).not.toBeInTheDocument();
    const styles = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');
    expect(styles).toContain('.fc-reputation');
    expect(styles).toContain('.fc-contribution-card');
    expect(styles).toContain('@media (max-width: 1024px)');
    expect(styles).toContain('@media (max-width: 768px)');
    expect(styles).toContain('@media (max-width: 390px)');
    expect(styles).toContain('overflow-x: hidden');
    expect(styles).toContain('min-height: 44px');
  });
});
