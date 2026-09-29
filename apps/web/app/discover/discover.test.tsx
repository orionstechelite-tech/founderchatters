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
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  pathname: '/discover',
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

import { DiscoverClient } from './discover-client';
import { MemberAppShell } from '../member/member-app-shell';

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

const otherFounder = {
  id: 'user-other',
  displayName: 'Ada Visible',
  avatarUrl: null,
  city: 'Dubai',
  country: 'UAE',
  companyName: 'OrbitFlow',
  industry: 'Marketplace',
  stage: 'Seed',
  expertise: [{ id: 'topic-b2b', slug: 'b2b-sales', label: 'B2B sales' }],
  customExpertise: 'UAE GTM',
  savedByMe: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
  navigation.pathname = '/discover';
});

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
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

function discoverPayload(
  founders = [otherFounder],
  extra: Record<string, unknown> = {},
) {
  return {
    founders,
    page: 1,
    pageSize: 20,
    total: founders.length,
    totalPages: 1,
    savedCount: 1,
    q: null,
    country: null,
    industry: null,
    stage: null,
    expertiseTopicId: null,
    saved: null,
    expertiseTopics: [
      { id: 'topic-b2b', slug: 'b2b-sales', label: 'B2B sales' },
    ],
    ...extra,
  };
}

function mockApi(
  foundersResponse: () => Response = () => response(discoverPayload()),
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/v1/auth/session')) return response(activeSession);
    if (url.includes('/v1/founders')) return foundersResponse();
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function founderUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('/v1/founders'));
}

async function renderDiscover() {
  const page = render(
    <MemberAppShell activeItem="Discover">
      <DiscoverClient />
    </MemberAppShell>,
  );
  await screen.findByRole('heading', {
    name: /Find someone who has/i,
  });
  return page;
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-010 discover', () => {
  it('renders real API results without fixture names or follower counts', async () => {
    const fetchMock = mockApi();
    const page = await renderDiscover();
    expect(
      await screen.findByRole('heading', { name: 'Ada Visible' }),
    ).toBeVisible();
    expect(screen.getByText('OrbitFlow · Dubai, UAE')).toBeVisible();
    expect(screen.getByText('Can help with B2B sales · UAE GTM')).toBeVisible();
    expect(screen.getByRole('link', { name: /View profile/i })).toHaveAttribute(
      'href',
      '/founders/user-other',
    );
    expect(screen.queryByText(/Sarah Chen/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'No follower counts.' }),
    ).toBeVisible();
    expect(screen.queryByText(/\d+\s+followers/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Saved founders 1/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Travel' }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes('/v1/founders'),
      ),
    ).toBe(true);
    await expectAccessible(page.container);
  });

  it('searches and applies approved filters including saved-only', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup({ delay: null });
    await renderDiscover();
    await user.type(screen.getByLabelText('Search founders'), 'Ada');
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(founderUrls(fetchMock).some((url) => url.includes('q=Ada'))).toBe(
        true,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'UAE' }));
    await waitFor(() =>
      expect(
        founderUrls(fetchMock).some((url) => url.includes('country=UAE')),
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'Marketplace' }));
    await waitFor(() =>
      expect(
        founderUrls(fetchMock).some((url) =>
          url.includes('industry=Marketplace'),
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'Seed' }));
    await waitFor(() =>
      expect(
        founderUrls(fetchMock).some((url) => url.includes('stage=Seed')),
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'B2B sales' }));
    await waitFor(() =>
      expect(
        founderUrls(fetchMock).some((url) =>
          url.includes('expertiseTopicId=topic-b2b'),
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: /Saved/ }));
    await waitFor(() =>
      expect(
        founderUrls(fetchMock).some((url) => url.includes('saved=true')),
      ).toBe(true),
    );
    expect(
      founderUrls(fetchMock).some(
        (url) =>
          url.includes('country=UAE') &&
          url.includes('industry=Marketplace') &&
          url.includes('stage=Seed') &&
          url.includes('expertiseTopicId=topic-b2b') &&
          url.includes('saved=true'),
      ),
    ).toBe(true);
  });

  it('shows empty and no-results states', async () => {
    mockApi(() => response(discoverPayload([])));
    await renderDiscover();
    expect(
      await screen.findByText('No founders to discover yet.'),
    ).toBeVisible();
    cleanup();
    mockApi(() =>
      response(
        discoverPayload([], {
          q: 'zzzz',
          total: 0,
        }),
      ),
    );
    const user = userEvent.setup({ delay: null });
    await renderDiscover();
    await user.type(screen.getByLabelText('Search founders'), 'zzzz');
    await user.keyboard('{Enter}');
    expect(
      await screen.findByText('No founders match these filters.'),
    ).toBeVisible();
  });

  it('shows an API failure state', async () => {
    mockApi(() =>
      errorResponse(
        'UNKNOWN_ERROR',
        'Discover is temporarily unavailable.',
        500,
      ),
    );
    await renderDiscover();
    expect(
      await screen.findByText('Discover is temporarily unavailable.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('opens the filter sheet from the keyboard and returns focus', async () => {
    mockApi();
    const user = userEvent.setup({ delay: null });
    const page = await renderDiscover();
    const trigger = screen.getByRole('button', { name: 'Filters' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText('Country')).toBeVisible();
    expect(within(dialog).getByLabelText('Industry')).toBeVisible();
    expect(within(dialog).getByLabelText('Stage')).toBeVisible();
    expect(within(dialog).getByLabelText('Expertise')).toBeVisible();
    expect(within(dialog).getByLabelText('Saved founders only')).toBeVisible();
    expect(within(dialog).getByRole('checkbox')).toHaveAccessibleName(
      'Saved founders only',
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(trigger).toHaveFocus();
    await expectAccessible(page.container);
  });

  it('does not fetch founder data until the caller is ACTIVE', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/session')) {
        return response({
          user: {
            id: 'user-self',
            email: 'self@example.com',
            emailVerified: true,
            status: 'ACTIVE',
          },
          access: {
            state: 'ONBOARDING',
            applicationStatus: 'APPROVED',
            onboardingCompleted: false,
          },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemberAppShell activeItem="Discover">
        <DiscoverClient />
      </MemberAppShell>,
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/onboarding'),
    );
    expect(founderUrls(fetchMock)).toEqual([]);
    expect(
      screen.queryByRole('heading', { name: 'Ada Visible' }),
    ).not.toBeInTheDocument();
  });

  it('keeps Home, Discover, Ask, and Profile navigable and disables Messages', async () => {
    mockApi();
    await renderDiscover();
    const nav = screen.getByRole('navigation', { name: 'Member navigation' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/home',
    );
    expect(within(nav).getByRole('link', { name: 'Discover' })).toHaveAttribute(
      'href',
      '/discover',
    );
    expect(within(nav).getByRole('link', { name: 'Ask' })).toHaveAttribute(
      'href',
      '/ask',
    );
    expect(within(nav).getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/founders/user-self',
    );
    expect(within(nav).getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const messages = within(nav).getByRole('link', { name: 'Messages' });
    expect(messages.tagName).toBe('SPAN');
    expect(messages.getAttribute('href')).toBeNull();
    expect(nav.querySelector('a[href="/messages"]')).toBeNull();
    expect(nav.querySelector('a[href="#messages"]')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Open your profile' }),
    ).toHaveAttribute('href', '/founders/user-self');
  });

  it('keeps the 390px stacked card contract', () => {
    const styles = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');
    expect(styles).toContain('@media (max-width: 390px)');
    expect(styles).toContain('padding-inline: 18px');
    expect(styles).toContain('fc-discover-view-mobile');
    expect(styles).toContain('@media (max-width: 768px)');
    expect(styles).toContain('@media (max-width: 1024px)');
  });
});
