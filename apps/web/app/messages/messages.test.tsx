// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
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
  pathname: '/messages',
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
  MemberConversation,
  MemberConversationsResponse,
  MemberMessage,
} from '@founderchatters/contracts';
import { MemberAppShell } from '../member/member-app-shell';
import { MessagesClient } from './messages-client';

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

const counterpart = {
  id: 'user-helper',
  displayName: 'Ada Helper',
  avatarUrl: null,
  companyName: 'Northwind',
  city: 'Dubai',
  country: 'UAE',
};

function conversation(
  overrides: Partial<MemberConversation> = {},
): MemberConversation {
  return {
    id: 'convo-1',
    status: 'ACTIVE',
    updatedAt: '2026-01-02T03:00:00.000Z',
    counterpart,
    requestContext: {
      available: true,
      id: 'req-1',
      type: 'ASK',
      status: 'PUBLISHED',
      headline: 'Looking for UAE GTM help',
      topics: [{ id: 'topic-1', slug: 'uae-gtm', label: 'UAE GTM' }],
    },
    latestMessage: {
      id: 'msg-1',
      senderIsViewer: false,
      body: 'Happy to share what worked.',
      createdAt: '2026-01-02T03:00:00.000Z',
    },
    canSend: true,
    ...overrides,
  };
}

function inbox(
  conversations: MemberConversation[] = [conversation()],
  extras: Partial<MemberConversationsResponse> = {},
): MemberConversationsResponse {
  return {
    conversations,
    page: 1,
    pageSize: 20,
    total: conversations.length,
    totalPages: 1,
    q: null,
    ...extras,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigation.replace.mockReset();
  navigation.push.mockReset();
  navigation.pathname = '/messages';
});

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
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
    { error: { code, message, requestId: 'req', fieldErrors: {} } },
    status,
  );
}

function mockApi(
  options: {
    inbox?: MemberConversationsResponse;
    conversation?: MemberConversation | null;
    messages?: MemberMessage[];
    send?: () => Response | Promise<Response>;
  } = {},
) {
  const listed = options.inbox ?? inbox();
  const detail =
    options.conversation === undefined ? conversation() : options.conversation;
  const messages =
    options.messages ??
    ([
      {
        id: 'msg-1',
        senderId: 'user-helper',
        createdAt: '2026-01-02T03:00:00.000Z',
        body: 'Happy to share what worked.',
        removed: false,
      },
      {
        id: 'msg-2',
        senderId: 'user-self',
        createdAt: '2026-01-02T03:01:00.000Z',
        body: 'That would be useful.',
        removed: false,
      },
    ] satisfies MemberMessage[]);
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/v1/auth/session')) return response(activeSession);
      if (url.includes('/v1/conversations/') && url.endsWith('/messages')) {
        if (method === 'POST') {
          return (
            options.send ??
            (() =>
              response({
                message: {
                  id: 'msg-new',
                  senderId: 'user-self',
                  createdAt: '2026-01-02T04:00:00.000Z',
                  body: 'Sent from composer',
                  removed: false,
                },
              }))
          )();
        }
        return response({ messages, nextBefore: null });
      }
      if (/\/v1\/conversations\/[^/?]+$/.test(url) && method === 'GET') {
        if (!detail)
          return errorResponse('CONVERSATION_NOT_FOUND', 'missing', 404);
        return response({ conversation: detail });
      }
      if (url.includes('/v1/conversations')) {
        const parsed = new URL(url);
        const q = parsed.searchParams.get('q');
        if (q) {
          const filtered = listed.conversations.filter((row) => {
            const name = row.counterpart?.displayName ?? '';
            const company = row.counterpart?.companyName ?? '';
            const headline = row.requestContext.available
              ? row.requestContext.headline
              : '';
            return `${name} ${company} ${headline}`
              .toLowerCase()
              .includes(q.toLowerCase());
          });
          return response({
            ...listed,
            q,
            conversations: filtered,
            total: filtered.length,
          });
        }
        return response(listed);
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderMessages(
  conversationId?: string,
  options: Parameters<typeof mockApi>[0] = {},
) {
  navigation.pathname = conversationId
    ? `/messages/${conversationId}`
    : '/messages';
  const fetchMock = mockApi(options);
  const page = render(
    <MemberAppShell activeItem="Messages">
      {conversationId ? (
        <MessagesClient conversationId={conversationId} viewerId="user-self" />
      ) : (
        <MessagesClient viewerId="user-self" />
      )}
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

describe('FC-013 messages', () => {
  it('shows a real empty inbox without sample fixtures', async () => {
    const { container } = await renderMessages(undefined, {
      inbox: inbox([], { total: 0 }),
    });
    expect(
      await screen.findByRole('heading', { name: 'No conversations yet' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute(
      'href',
      '/home',
    );
    expect(screen.queryByText('Sarah Chen')).not.toBeInTheDocument();
    expect(screen.queryByText('Maya Patel')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Member navigation' });
    expect(within(nav).getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'href',
      '/messages',
    );
    expect(within(nav).getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectAccessible(container);
  });

  it('lists real conversations, searches, and shows filtered zero', async () => {
    const user = userEvent.setup({ delay: null });
    await renderMessages();
    expect(await screen.findByText('Ada Helper')).toBeVisible();
    expect(screen.getByText('Happy to share what worked.')).toBeVisible();
    await user.type(
      screen.getByLabelText('Search conversations'),
      'zzzz-not-found',
    );
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', { name: 'No conversations found' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('Ada Helper')).toBeVisible();
  });

  it('selects the open conversation on desktop and keeps split CSS', async () => {
    await renderMessages('convo-1');
    const selected = await screen.findByRole('link', { name: /Ada Helper/ });
    expect(selected).toHaveAttribute('aria-current', 'page');
    expect(selected.className).toContain('fc-messages-row--active');
    const styles = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');
    expect(styles).toContain('grid-template-columns: 380px minmax(0, 1fr)');
    expect(styles).toContain('@media (max-width: 1024px)');
    expect(styles).toContain('@media (max-width: 768px)');
    expect(styles).toContain('@media (max-width: 390px)');
    expect(styles).toContain("data-pane='inbox'] .fc-messages-detail");
    expect(styles).toContain("data-pane='detail'] .fc-messages-inbox");
    expect(styles).toContain('min-height: 44px');
    expect(styles).toContain('overflow-x: hidden');
  });

  it('renders request context, counterpart, bubbles, and tombstones', async () => {
    const { container } = await renderMessages('convo-1', {
      messages: [
        {
          id: 'msg-1',
          senderId: 'user-helper',
          createdAt: '2026-01-02T03:00:00.000Z',
          body: 'Incoming help.',
          removed: false,
        },
        {
          id: 'msg-2',
          senderId: 'user-self',
          createdAt: '2026-01-02T03:01:00.000Z',
          body: 'Outgoing thanks.',
          removed: false,
        },
        {
          id: 'msg-3',
          senderId: 'user-helper',
          createdAt: '2026-01-02T03:02:00.000Z',
          body: null,
          removed: true,
        },
      ],
    });
    expect(await screen.findByText('Looking for UAE GTM help')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Looking for UAE GTM help' }),
    ).toHaveAttribute('href', '/requests/req-1');
    expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute(
      'href',
      '/founders/user-helper',
    );
    expect(screen.getByText('Incoming help.')).toBeVisible();
    expect(screen.getByText('Outgoing thanks.')).toBeVisible();
    expect(screen.getByText('Message removed')).toBeVisible();
    expect(document.querySelector('.fc-messages-bubble--mine')).not.toBeNull();
    expect(screen.queryByText('Confirm help')).not.toBeInTheDocument();
    expect(screen.queryByText('Thank')).not.toBeInTheDocument();
    await expectAccessible(container);
  });

  it('hides unavailable context and counterpart actions', async () => {
    await renderMessages('convo-1', {
      conversation: conversation({
        counterpart: null,
        canSend: false,
        requestContext: { available: false },
      }),
    });
    expect(await screen.findByText('Request unavailable')).toBeVisible();
    expect(screen.getAllByText('Member unavailable').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('link', { name: 'View profile' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Looking for UAE GTM help' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Messaging is unavailable.')).toBeVisible();
    expect(screen.queryByLabelText('Write a message')).not.toBeInTheDocument();
  });

  it('preserves drafts on errors, reuses clientMessageId, and blocks double submits', async () => {
    const user = userEvent.setup({ delay: null });
    const uuid = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-4111-8111-111111111111');
    let sends = 0;
    const { fetchMock } = await renderMessages('convo-1', {
      send: () => {
        sends += 1;
        return errorResponse(
          'MESSAGING_RATE_LIMITED',
          'Too many messages.',
          429,
        );
      },
    });
    const composer = await screen.findByLabelText('Write a message');
    await user.type(composer, 'Keep this draft');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many messages.',
    );
    expect(composer).toHaveValue('Keep this draft');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const bodies = fetchMock.mock.calls
      .filter(([url, init]) => {
        return (
          String(url).includes('/messages') &&
          (init as RequestInit | undefined)?.method === 'POST'
        );
      })
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.clientMessageId).toBe(bodies[1]?.clientMessageId);
    expect(uuid).toHaveBeenCalledTimes(1);

    await user.type(composer, ' edited');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(uuid).toHaveBeenCalledTimes(2);
    expect(sends).toBe(3);
  });

  it('appends a successful send and ignores a second in-flight submit', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '22222222-2222-4222-8222-222222222222',
    );
    let resolveSend: ((value: Response) => void) | null = null;
    const { fetchMock } = await renderMessages('convo-1', {
      send: () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    });
    await user.type(
      await screen.findByLabelText('Write a message'),
      'Sent from composer',
    );
    const form = document.querySelector('.fc-messages-composer');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/messages') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toHaveLength(1);
    resolveSend!(
      response({
        message: {
          id: 'msg-new',
          senderId: 'user-self',
          createdAt: '2026-01-02T04:00:00.000Z',
          body: 'Sent from composer',
          removed: false,
        },
      }),
    );
    expect(await screen.findByText('Sent from composer')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText('Write a message')).toHaveValue(''),
    );
  });

  it('renders HTML-like bodies as text and disables composer when closed', async () => {
    const { container } = await renderMessages('convo-1', {
      conversation: conversation({ status: 'CLOSED', canSend: false }),
      messages: [
        {
          id: 'msg-xss',
          senderId: 'user-helper',
          createdAt: '2026-01-02T03:00:00.000Z',
          body: '<script>alert(1)</script><img onerror="alert(1)">',
          removed: false,
        },
      ],
    });
    expect(
      await screen.findByText(
        '<script>alert(1)</script><img onerror="alert(1)">',
      ),
    ).toBeVisible();
    expect(container.querySelector('.fc-messages-bubble script')).toBeNull();
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
    expect(screen.queryByLabelText('Write a message')).not.toBeInTheDocument();
    expect(screen.getByText('Messaging is unavailable.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /close conversation/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Confirm help')).not.toBeInTheDocument();
    const styles = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');
    expect(styles).toContain('white-space: pre-wrap');
  });
});
