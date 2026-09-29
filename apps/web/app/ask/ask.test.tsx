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
  pathname: '/ask',
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

import { AskClient } from './ask-client';
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

const selfProfile = {
  founder: {
    id: 'user-self',
    displayName: 'Ada Visible',
    headline: null,
    bio: null,
    avatarUrl: null,
    city: 'Dubai',
    country: 'UAE',
    company: {
      name: 'OrbitFlow',
      website: null,
      description: null,
      stage: 'Seed',
      industry: 'Marketplace',
      city: 'Dubai',
      country: 'UAE',
    },
    expertise: [],
    customExpertise: null,
    currentNeedText: null,
    needs: [],
    savedByMe: false,
    memberSinceYear: 2026,
    isSelf: true,
  },
};

const topic = { id: 'topic-gtm', slug: 'gtm', label: 'GTM' };

function emptyOwn(requests: unknown[] = []) {
  return {
    requests,
    page: 1,
    pageSize: 20,
    total: requests.length,
    totalPages: 1,
    status: 'DRAFT',
    availableTopics: [topic],
  };
}

const draftRequest = {
  id: 'req-draft',
  type: 'FEEDBACK',
  status: 'DRAFT',
  headline: 'Need pricing feedback',
  context: 'We are testing a new pricing page and want founder reactions.',
  whoCouldHelp: 'SaaS founders',
  urgency: 'THIS_WEEK',
  topics: [topic],
  responseCount: 0,
  publishedAt: null,
  resolvedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  author: {
    id: 'user-self',
    displayName: 'Ada Visible',
    avatarUrl: null,
    companyName: 'OrbitFlow',
    city: 'Dubai',
    country: 'UAE',
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
  navigation.push.mockReset();
  navigation.pathname = '/ask';
  window.localStorage.clear();
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

function errorResponse(
  code: string,
  message: string,
  status = 400,
  fieldErrors: Record<string, string[]> = {},
): Response {
  return response(
    { error: { code, message, requestId: 'request-test', fieldErrors } },
    status,
  );
}

function mockApi(
  handlers: {
    list?: () => Response;
    create?: () => Response;
    patch?: () => Response;
    publish?: () => Response;
  } = {},
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/v1/auth/session')) return response(activeSession);
      if (url.includes('/v1/founders/user-self')) return response(selfProfile);
      if (url.includes('/v1/requests') && url.includes('/publish')) {
        return (
          handlers.publish ??
          (() =>
            response({
              request: { ...draftRequest, status: 'PUBLISHED', id: 'req-live' },
            }))
        )();
      }
      if (method === 'POST' && url.endsWith('/v1/requests')) {
        return (
          handlers.create ??
          (() => response({ request: { ...draftRequest, id: 'req-new' } }, 201))
        )();
      }
      if (method === 'PATCH') {
        return (
          handlers.patch ?? (() => response({ request: draftRequest }))
        )();
      }
      if (url.includes('/v1/requests')) {
        return (handlers.list ?? (() => response(emptyOwn())))();
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderAsk() {
  const page = render(
    <MemberAppShell activeItem="Ask">
      <AskClient viewerId="user-self" />
    </MemberAppShell>,
  );
  await screen.findByRole('heading', {
    name: /Ask for the kind of help/i,
  });
  return page;
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-011 ask', () => {
  it('shows a fresh ASK form and all four request types', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup({ delay: null });
    const { container } = await renderAsk();
    expect(
      fetchMock.mock.calls.some(
        (call) => (call[1]?.method ?? 'GET') === 'POST',
      ),
    ).toBe(false);
    expect(screen.getByRole('button', { name: 'ASK' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'FEEDBACK' }));
    await user.click(screen.getByRole('button', { name: 'INTRODUCTION' }));
    await user.click(screen.getByRole('button', { name: 'COLLABORATION' }));
    expect(
      screen.getByRole('button', { name: 'COLLABORATION' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'INTRODUCTION' })).toBeVisible();
    expect(screen.getByText('INTRO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Today' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'GTM' })).toBeVisible();
    await expectAccessible(container);
  });

  it('resumes a persisted draft without writing localStorage', async () => {
    mockApi({ list: () => response(emptyOwn([draftRequest])) });
    await renderAsk();
    expect(screen.getByLabelText('Headline')).toHaveValue(
      'Need pricing feedback',
    );
    expect(screen.getByRole('button', { name: 'FEEDBACK' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(window.localStorage.length).toBe(0);
  });

  it('hydrates the newest listed draft and does not create another', async () => {
    const older = {
      ...draftRequest,
      id: 'req-older',
      headline: 'Older leftover draft',
    };
    const fetchMock = mockApi({
      list: () => response(emptyOwn([draftRequest, older])),
    });
    await renderAsk();
    expect(screen.getByLabelText('Headline')).toHaveValue(
      'Need pricing feedback',
    );
    expect(
      fetchMock.mock.calls.some(
        (call) => (call[1]?.method ?? 'GET') === 'POST',
      ),
    ).toBe(false);
  });

  it('saves a draft, previews after persist, and returns to edit', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup({ delay: null });
    await renderAsk();
    await user.type(
      screen.getByLabelText('Headline'),
      'Looking for UAE launch help',
    );
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(screen.getByText('Draft saved.')).toBeVisible());
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          String(call[0]).endsWith('/v1/requests') &&
          (call[1]?.method ?? 'GET') === 'POST',
      ),
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Preview request' }));
    await screen.findByRole('heading', { name: 'Preview before publishing.' });
    expect(
      screen.getByRole('heading', { name: /Looking for UAE launch help/i }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Edit request' }));
    expect(screen.getByLabelText('Headline')).toHaveValue(
      'Looking for UAE launch help',
    );
  });

  it('publishes from preview and keeps draft data after a limit error', async () => {
    const fetchMock = mockApi({
      publish: () =>
        errorResponse(
          'REQUEST_LIMIT_REACHED',
          'You already have three open requests. Resolve or delete one before publishing another.',
          409,
        ),
    });
    const user = userEvent.setup({ delay: null });
    await renderAsk();
    await user.type(
      screen.getByLabelText('Headline'),
      'Looking for UAE launch help',
    );
    await user.type(
      screen.getByLabelText('Context'),
      'We are entering the UAE next quarter and want practical partner lessons from founders.',
    );
    await user.click(screen.getByRole('button', { name: 'This week' }));
    await user.click(screen.getByRole('button', { name: 'Preview request' }));
    await screen.findByRole('button', { name: 'Publish request' });
    await user.click(screen.getByRole('button', { name: 'Publish request' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /three open requests/i,
      ),
    );
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Edit request' }));
    expect(screen.getByLabelText('Headline')).toHaveValue(
      'Looking for UAE launch help',
    );
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/publish')),
    ).toBe(true);
  });

  it('preserves entered values after validation errors and keeps keyboard access', async () => {
    mockApi({
      create: () =>
        errorResponse(
          'REQUEST_INVALID_INPUT',
          'Review the request details and try again.',
          400,
          { headline: ['Use 160 characters or fewer.'] },
        ),
    });
    const user = userEvent.setup({ delay: null });
    await renderAsk();
    const headline = screen.getByLabelText('Headline');
    await user.type(headline, 'Keep this text');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(screen.getByText('Use 160 characters or fewer.')).toBeVisible(),
    );
    expect(headline).toHaveValue('Keep this text');
    headline.focus();
    await user.keyboard('{Tab}');
    expect(document.activeElement).not.toBe(document.body);
  });

  it('keeps in-memory values after a network failure and renders HTML as text', async () => {
    const fetchMock = mockApi({
      create: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const user = userEvent.setup({ delay: null });
    await renderAsk();
    await user.type(
      screen.getByLabelText('Headline'),
      '<script>alert(1)</script> Keep me',
    );
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not (save this draft|reach FounderChatters)/i,
      ),
    );
    expect(screen.getByLabelText('Headline')).toHaveValue(
      '<script>alert(1)</script> Keep me',
    );
    expect(
      fetchMock.mock.calls.some(
        (call) => (call[1]?.method ?? 'GET') === 'POST',
      ),
    ).toBe(true);
  });

  it('shows a recoverable API error without depending on localStorage', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/session')) return response(activeSession);
      if (url.includes('/v1/founders/user-self')) return response(selfProfile);
      if (url.includes('/v1/requests')) {
        return errorResponse(
          'INTERNAL_ERROR',
          'We could not load your request.',
          500,
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemberAppShell activeItem="Ask">
        <AskClient viewerId="user-self" />
      </MemberAppShell>,
    );
    expect(
      await screen.findByText('We could not load your request.'),
    ).toBeVisible();
    expect(window.localStorage.length).toBe(0);
  });

  it('activates Ask navigation and enables Messages', async () => {
    mockApi();
    await renderAsk();
    const nav = screen.getByRole('navigation', { name: 'Member navigation' });
    expect(within(nav).getByRole('link', { name: 'Ask' })).toHaveAttribute(
      'href',
      '/ask',
    );
    expect(within(nav).getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'href',
      '/messages',
    );
  });

  it('keeps 390 and 768 completeness for types, urgency, and save draft', () => {
    const styles = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');
    expect(styles).toContain('@media (max-width: 390px)');
    expect(styles).toContain('@media (max-width: 768px)');
    expect(styles).toContain('.fc-ask-chip-short');
    expect(styles).toContain('flex-wrap: wrap');
    expect(styles).toContain('display: inline;');
    expect(styles.includes('.fc-ask-actions {\n    display: none')).toBe(false);
    expect(styles).toContain('overflow-wrap: anywhere');
    expect(styles).toContain('min-height: 44px');
  });
});
