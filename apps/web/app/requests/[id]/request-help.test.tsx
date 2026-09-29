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
  pathname: '/requests/req-live',
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
  MemberHelpResponse,
  MemberHelpResponsesResponse,
  MemberRequest,
} from '@founderchatters/contracts';
import { MemberAppShell } from '../../member/member-app-shell';
import { RequestDetailClient } from './request-detail-client';

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

const ownerAuthor = {
  id: 'user-owner',
  displayName: 'Sarah Chen',
  avatarUrl: null,
  companyName: 'OrbitFlow',
  city: 'Dubai',
  country: 'UAE',
};

const helperAuthor = {
  id: 'user-self',
  displayName: 'Chaitanya',
  avatarUrl: null,
  companyName: 'Northwind',
  city: 'Dubai',
  country: 'UAE',
};

const publishedRequest: MemberRequest = {
  id: 'req-live',
  type: 'ASK',
  status: 'PUBLISHED',
  headline: 'Looking for someone who has launched B2B SaaS in the UAE.',
  context:
    'We’re entering the UAE next quarter. I’d love to hear how founders found their first channel.',
  whoCouldHelp: 'Founders with UAE GTM experience',
  urgency: 'THIS_WEEK',
  topics: [{ id: 'topic-gtm', slug: 'gtm', label: 'GTM' }],
  responseCount: 0,
  publishedAt: '2026-01-02T00:00:00.000Z',
  resolvedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  author: ownerAuthor,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
  navigation.push.mockReset();
  navigation.pathname = '/requests/req-live';
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

function threadPayload(
  rows: MemberHelpResponse[],
  extras: Partial<MemberHelpResponsesResponse> = {},
): MemberHelpResponsesResponse {
  return {
    responses: rows,
    page: 1,
    pageSize: 20,
    total: rows.length,
    totalPages: 1,
    viewerResponseTypes: extras.viewerResponseTypes ?? [],
    canOfferHelp: extras.canOfferHelp ?? true,
  };
}

function adviceCard(
  overrides: Partial<MemberHelpResponse> = {},
): MemberHelpResponse {
  return {
    id: 'res-advice',
    type: 'ADVICE',
    createdAt: '2026-01-02T00:00:00.000Z',
    author: helperAuthor,
    body: 'The biggest mistake we made was signing a broad distributor too early.',
    introduction: null,
    privateChat: null,
    ...overrides,
  };
}

function introCard(
  overrides: Partial<MemberHelpResponse> = {},
): MemberHelpResponse {
  return {
    id: 'res-intro',
    type: 'INTRODUCTION_OFFER',
    createdAt: '2026-01-02T01:00:00.000Z',
    author: helperAuthor,
    body: null,
    introduction: {
      id: 'intro-1',
      status: 'CONSENT_PENDING',
      personName: null,
      reason: 'Relevant UAE operator.',
      canConsent: false,
      canDecline: false,
      canCancel: false,
    },
    privateChat: null,
    ...overrides,
  };
}

function privateCard(
  overrides: Partial<MemberHelpResponse> = {},
): MemberHelpResponse {
  return {
    id: 'res-private',
    type: 'PRIVATE_CHAT_OFFER',
    createdAt: '2026-01-02T02:00:00.000Z',
    author: helperAuthor,
    body: null,
    introduction: null,
    privateChat: null,
    ...overrides,
  };
}

function mockApi(
  options: {
    request?: MemberRequest;
    thread?: MemberHelpResponsesResponse;
    advice?: () => Response;
    introduction?: () => Response;
    privateChat?: () => Response;
    startConversation?: () => Response;
    consent?: () => Response;
    decline?: () => Response;
    cancel?: () => Response;
  } = {},
) {
  const request = options.request ?? publishedRequest;
  let thread =
    options.thread ??
    threadPayload([], { canOfferHelp: request.status === 'PUBLISHED' });
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/v1/auth/session')) return response(activeSession);
      if (url.includes('/introductions/') && url.endsWith('/consent')) {
        return (
          options.consent ?? (() => errorResponse('UNKNOWN', 'missing'))
        )();
      }
      if (url.includes('/introductions/') && url.endsWith('/decline')) {
        return (
          options.decline ?? (() => errorResponse('UNKNOWN', 'missing'))
        )();
      }
      if (url.includes('/introductions/') && url.endsWith('/cancel')) {
        return (
          options.cancel ?? (() => errorResponse('UNKNOWN', 'missing'))
        )();
      }
      if (url.endsWith('/v1/conversations') && method === 'POST') {
        return (
          options.startConversation ??
          (() => errorResponse('UNKNOWN', 'missing'))
        )();
      }
      if (url.includes('/responses/advice') && method === 'POST') {
        return (
          options.advice ?? (() => errorResponse('UNKNOWN', 'missing'))
        )();
      }
      if (url.includes('/responses/introduction') && method === 'POST') {
        return (
          options.introduction ?? (() => errorResponse('UNKNOWN', 'missing'))
        )();
      }
      if (url.includes('/responses/private-chat') && method === 'POST') {
        return (
          options.privateChat ?? (() => errorResponse('UNKNOWN', 'missing'))
        )();
      }
      if (url.includes('/responses')) {
        return response(thread);
      }
      if (url.includes('/v1/requests/req-live')) {
        return response({ request });
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    setThread(next: MemberHelpResponsesResponse) {
      thread = next;
    },
  };
}

async function renderHelp(
  options: Parameters<typeof mockApi>[0] = {},
  viewerId = 'user-self',
) {
  const api = mockApi(options);
  const page = render(
    <MemberAppShell activeItem="Ask">
      <RequestDetailClient requestId="req-live" viewerId={viewerId} />
    </MemberAppShell>,
  );
  await screen.findByRole('heading', { name: publishedRequest.headline });
  return { ...page, ...api };
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-012 request help', () => {
  it('shows I can help for non-owners of published requests only', async () => {
    const { container } = await renderHelp();
    expect(
      await screen.findByRole('button', { name: 'I can help' }),
    ).toBeVisible();
    for (const item of screen.getAllByRole('link', { name: 'Messages' })) {
      expect(item).toHaveAttribute('href', '/messages');
      expect(item).not.toHaveAttribute('aria-disabled', 'true');
    }
    await expectAccessible(container);

    cleanup();
    vi.unstubAllGlobals();
    await renderHelp({
      request: {
        ...publishedRequest,
        author: { ...ownerAuthor, id: 'user-self' },
      },
      thread: threadPayload([], { canOfferHelp: false }),
    });
    expect(
      screen.queryByRole('button', { name: 'I can help' }),
    ).not.toBeInTheDocument();

    cleanup();
    vi.unstubAllGlobals();
    await renderHelp({
      request: {
        ...publishedRequest,
        status: 'RESOLVED',
        resolvedAt: '2026-01-03T00:00:00.000Z',
      },
      thread: threadPayload([], { canOfferHelp: false }),
    });
    expect(
      screen.queryByRole('button', { name: 'I can help' }),
    ).not.toBeInTheDocument();
  });

  it('opens the frozen chooser and disables used response types', async () => {
    const user = userEvent.setup({ delay: null });
    await renderHelp({
      thread: threadPayload([], {
        canOfferHelp: true,
        viewerResponseTypes: ['ADVICE'],
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'I can help' }));
    const chooser = screen.getByRole('dialog', { name: 'I can help' });
    expect(
      within(chooser).getByText(/How would you like to help Sarah/),
    ).toBeVisible();
    expect(
      within(chooser).getByRole('button', { name: /Share advice/ }),
    ).toBeDisabled();
    expect(
      within(chooser).getByRole('button', { name: /Offer introduction/ }),
    ).toBeEnabled();
    expect(
      within(chooser).getByRole('button', { name: /Chat privately/ }),
    ).toBeEnabled();
    expect(within(chooser).queryByRole('textbox')).not.toBeInTheDocument();
    await expectAccessible(chooser);
  });

  it('validates advice, preserves typed text on error, and renders the thread on success', async () => {
    const user = userEvent.setup({ delay: null });
    const typed =
      'The biggest mistake we made was signing a broad distributor too early.';
    const { setThread } = await renderHelp({
      advice: () =>
        errorResponse(
          'HELP_RESPONSE_INVALID_INPUT',
          'Review your advice and try again.',
          400,
          { body: ['Use at least 20 characters.'] },
        ),
    });
    await user.click(await screen.findByRole('button', { name: 'I can help' }));
    await user.click(screen.getByRole('button', { name: /Share advice/ }));
    const adviceDialog = screen.getByRole('dialog', { name: 'Share advice' });
    const textarea = within(adviceDialog).getByLabelText('Your advice');
    await user.type(textarea, typed);
    await user.click(
      within(adviceDialog).getByRole('button', { name: 'Publish advice' }),
    );
    expect(
      await screen.findByText('Use at least 20 characters.'),
    ).toBeVisible();
    expect(textarea).toHaveValue(typed);

    setThread(
      threadPayload([adviceCard()], {
        canOfferHelp: true,
        viewerResponseTypes: ['ADVICE'],
      }),
    );
    const fetchImpl = vi.mocked(fetch);
    fetchImpl.mockImplementationOnce(async (input, init) => {
      const url = String(input);
      if (url.includes('/responses/advice')) {
        return response({ response: adviceCard() }, 201);
      }
      throw new Error(`Unexpected ${url} ${String(init?.method)}`);
    });
    await user.click(
      within(adviceDialog).getByRole('button', { name: 'Publish advice' }),
    );
    expect(await screen.findByText(/Chaitanya · Public advice/)).toBeVisible();
    expect(
      screen.getByText(/signing a broad distributor too early/),
    ).toBeVisible();
  });

  it('collects introduction fields with privacy copy and requester consent', async () => {
    const user = userEvent.setup({ delay: null });
    const pending = introCard({
      introduction: {
        id: 'intro-1',
        status: 'CONSENT_PENDING',
        personName: null,
        reason: 'Relevant UAE operator.',
        canConsent: true,
        canDecline: true,
        canCancel: false,
      },
    });
    const introduced = introCard({
      introduction: {
        id: 'intro-1',
        status: 'INTRODUCED',
        personName: 'Noura GTM',
        reason: 'Relevant UAE operator.',
        canConsent: false,
        canDecline: false,
        canCancel: false,
      },
    });
    const { setThread } = await renderHelp(
      {
        request: {
          ...publishedRequest,
          author: { ...ownerAuthor, id: 'user-self' },
        },
        thread: threadPayload([pending], { canOfferHelp: false }),
        consent: () => response({ response: introduced }),
      },
      'user-self',
    );
    expect(
      await screen.findByText('Chaitanya · Introduction offered'),
    ).toBeVisible();
    expect(screen.getByText('Relevant UAE operator.')).toBeVisible();
    expect(screen.queryByText('Noura GTM')).not.toBeInTheDocument();
    setThread(threadPayload([introduced], { canOfferHelp: false }));
    await user.click(
      screen.getByRole('button', { name: 'Accept introduction' }),
    );
    const confirm = screen.getByRole('dialog', {
      name: 'Accept this introduction?',
    });
    await user.click(
      within(confirm).getByRole('button', { name: 'Accept introduction' }),
    );
    expect(await screen.findByText(/Introduction: Noura GTM/)).toBeVisible();
  });

  it('opens the introduction composer with permission and privacy guidance', async () => {
    const user = userEvent.setup({ delay: null });
    const created = introCard({
      introduction: {
        id: 'intro-1',
        status: 'CONSENT_PENDING',
        personName: 'Noura GTM',
        reason: 'Relevant UAE operator.',
        canConsent: false,
        canDecline: false,
        canCancel: true,
      },
    });
    const { setThread } = await renderHelp({
      introduction: () =>
        errorResponse(
          'HELP_RESPONSE_INVALID_INPUT',
          'Review the introduction and try again.',
          400,
          {
            permissionConfirmed: [
              'Confirm you have permission to offer this introduction.',
            ],
          },
        ),
    });
    await user.click(await screen.findByRole('button', { name: 'I can help' }));
    await user.click(
      screen.getByRole('button', { name: /Offer introduction/ }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Offer an introduction',
    });
    expect(
      await within(dialog).findByText(
        /Name, role or company only. Do not include phone, email or contact links./,
      ),
    ).toBeVisible();
    await user.type(
      within(dialog).getByLabelText('Who can you introduce?'),
      'Noura GTM',
    );
    await user.type(
      within(dialog).getByLabelText('Why this person may be relevant'),
      'Relevant UAE operator.',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Offer introduction' }),
    );
    expect(
      await screen.findByText(
        'Confirm you have permission to offer this introduction.',
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText('Who can you introduce?')).toHaveValue(
      'Noura GTM',
    );

    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'I have their permission to make this intro',
      }),
    );
    setThread(
      threadPayload([created], {
        canOfferHelp: true,
        viewerResponseTypes: ['INTRODUCTION_OFFER'],
      }),
    );
    const fetchImpl = vi.mocked(fetch);
    fetchImpl.mockImplementationOnce(async (input) => {
      if (String(input).includes('/responses/introduction')) {
        return response({ response: created }, 201);
      }
      throw new Error(`Unexpected ${String(input)}`);
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Offer introduction' }),
    );
    expect(
      await screen.findByText(/Chaitanya · Introduction offered/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel offer' })).toBeVisible();
    expect(await screen.findByText('Introduction: Noura GTM')).toBeVisible();
  });

  it('lets the requester decline and the helper cancel pending intros', async () => {
    const user = userEvent.setup({ delay: null });
    const pending = introCard({
      introduction: {
        id: 'intro-1',
        status: 'CONSENT_PENDING',
        personName: null,
        reason: 'Relevant UAE operator.',
        canConsent: true,
        canDecline: true,
        canCancel: false,
      },
    });
    const { setThread } = await renderHelp(
      {
        request: {
          ...publishedRequest,
          author: { ...ownerAuthor, id: 'user-self' },
        },
        thread: threadPayload([pending], { canOfferHelp: false }),
        decline: () =>
          response({
            response: introCard({
              introduction: {
                id: 'intro-1',
                status: 'DECLINED',
                personName: null,
                reason: 'Relevant UAE operator.',
                canConsent: false,
                canDecline: false,
                canCancel: false,
              },
            }),
          }),
      },
      'user-self',
    );
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    setThread(
      threadPayload(
        [
          introCard({
            introduction: {
              id: 'intro-1',
              status: 'DECLINED',
              personName: null,
              reason: 'Relevant UAE operator.',
              canConsent: false,
              canDecline: false,
              canCancel: false,
            },
          }),
        ],
        { canOfferHelp: false },
      ),
    );
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Decline this introduction?' }),
      ).getByRole('button', { name: 'Decline' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Accept introduction' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('submits private help directly without a composer or messages navigation', async () => {
    const user = userEvent.setup({ delay: null });
    const created = privateCard();
    const { fetchMock, setThread } = await renderHelp({
      privateChat: () => response({ response: created }, 201),
    });
    await user.click(await screen.findByRole('button', { name: 'I can help' }));
    setThread(
      threadPayload([created], {
        canOfferHelp: true,
        viewerResponseTypes: ['PRIVATE_CHAT_OFFER'],
      }),
    );
    await user.click(screen.getByRole('button', { name: /Chat privately/ }));
    expect(
      await screen.findByText(/Chaitanya · Private help offered/),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes('/responses/private-chat') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(true);
    expect(screen.queryByLabelText(/private note/i)).not.toBeInTheDocument();
    for (const item of screen.getAllByRole('link', { name: 'Messages' })) {
      expect(item).toHaveAttribute('href', '/messages');
    }
  });

  it('renders oldest-first thread privacy and member unavailable fallback', async () => {
    await renderHelp({
      thread: threadPayload(
        [
          adviceCard(),
          introCard({ introduction: null }),
          privateCard(),
          adviceCard({
            id: 'res-gone',
            createdAt: '2026-01-02T03:00:00.000Z',
            author: null,
            body: 'Historical advice stays on the thread.',
          }),
        ],
        { canOfferHelp: true },
      ),
    });
    expect(await screen.findByText('Chaitanya · Public advice')).toBeVisible();
    const titles = Array.from(
      document.querySelectorAll('.fc-help-card__title'),
      (node) => node.textContent,
    );
    expect(titles).toEqual([
      'Chaitanya · Public advice',
      'Chaitanya · Introduction offered',
      'Chaitanya · Private help offered',
      'Member unavailable · Public advice',
    ]);
    expect(screen.queryByText('Noura GTM')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Relevant UAE operator.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Historical advice stays on the thread.'),
    ).toBeVisible();
  });

  it('renders untrusted help text as text and keeps used types disabled', async () => {
    const user = userEvent.setup({ delay: null });
    const payload = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    await renderHelp({
      thread: threadPayload(
        [
          adviceCard({ body: payload }),
          introCard({
            introduction: {
              id: 'intro-1',
              status: 'CONSENT_PENDING',
              personName: payload,
              reason: payload,
              canConsent: false,
              canDecline: false,
              canCancel: true,
            },
          }),
        ],
        { canOfferHelp: true },
      ),
    });
    expect(await screen.findByText(/Chaitanya · Public advice/)).toBeVisible();
    expect(
      screen.getAllByText(payload, { exact: true }).length,
    ).toBeGreaterThan(0);
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[onerror]')).toBeNull();

    cleanup();
    vi.unstubAllGlobals();
    await renderHelp({
      thread: threadPayload([], {
        canOfferHelp: true,
        viewerResponseTypes: ['ADVICE'],
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'I can help' }));
    const chooser = screen.getByRole('dialog', { name: 'I can help' });
    expect(
      within(chooser).getByRole('button', { name: /Share advice/ }),
    ).toBeDisabled();
    expect(within(chooser).getByText('Already shared')).toBeVisible();
    expect(
      within(chooser).getByRole('button', { name: /Offer introduction/ }),
    ).toBeEnabled();
  });

  it('keeps advice drafts on cancel and does not post', async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock } = await renderHelp();
    await user.click(await screen.findByRole('button', { name: 'I can help' }));
    await user.click(screen.getByRole('button', { name: /Share advice/ }));
    const adviceDialog = screen.getByRole('dialog', { name: 'Share advice' });
    await user.type(
      within(adviceDialog).getByLabelText('Your advice'),
      'Typed advice that must survive cancel.',
    );
    await user.click(
      within(adviceDialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes('/responses/advice') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('lets the requester start or open a request-linked private chat', async () => {
    const user = userEvent.setup({ delay: null });
    const offer = privateCard({
      privateChat: {
        conversationId: null,
        canStart: true,
        canOpen: false,
      },
    });
    await renderHelp({
      request: {
        ...publishedRequest,
        author: { ...ownerAuthor, id: 'user-self' },
      },
      thread: threadPayload([offer], { canOfferHelp: false }),
      startConversation: () =>
        response(
          {
            conversation: {
              id: 'convo-1',
              status: 'ACTIVE',
              updatedAt: '2026-01-02T03:00:00.000Z',
              counterpart: helperAuthor,
              requestContext: {
                available: true,
                id: 'req-live',
                type: 'ASK',
                status: 'PUBLISHED',
                headline: publishedRequest.headline,
                topics: [],
              },
              latestMessage: null,
              canSend: true,
            },
          },
          201,
        ),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Start private chat' }),
    );
    expect(navigation.push).toHaveBeenCalledWith('/messages/convo-1');
  });

  it('lets the requester open an existing private chat', async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock } = await renderHelp({
      request: {
        ...publishedRequest,
        author: { ...ownerAuthor, id: 'user-self' },
      },
      thread: threadPayload(
        [
          privateCard({
            privateChat: {
              conversationId: 'convo-1',
              canStart: false,
              canOpen: true,
            },
          }),
        ],
        { canOfferHelp: false },
      ),
    });
    expect(
      await screen.findByRole('button', { name: 'Open private chat' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Start private chat' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open private chat' }));
    expect(navigation.push).toHaveBeenCalledWith('/messages/convo-1');
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/v1/conversations') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('hides private-chat conversation actions from unrelated viewers', async () => {
    await renderHelp({
      thread: threadPayload([privateCard()], { canOfferHelp: true }),
    });
    expect(
      await screen.findByText('Chaitanya · Private help offered'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Start private chat' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open private chat' }),
    ).not.toBeInTheDocument();
  });

  it('lets the helper open an existing private chat and not start one', async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock } = await renderHelp({
      thread: threadPayload(
        [
          privateCard({
            author: { ...helperAuthor, id: 'user-self' },
            privateChat: {
              conversationId: 'convo-9',
              canStart: false,
              canOpen: true,
            },
          }),
        ],
        { canOfferHelp: true, viewerResponseTypes: ['PRIVATE_CHAT_OFFER'] },
      ),
    });
    expect(
      await screen.findByRole('button', { name: 'Open private chat' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Start private chat' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open private chat' }));
    expect(navigation.push).toHaveBeenCalledWith('/messages/convo-9');
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/v1/conversations') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('keeps 390 help sheets and targets within the frozen contract', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = await renderHelp();
    await user.click(await screen.findByRole('button', { name: 'I can help' }));
    const chooser = screen.getByRole('dialog', { name: 'I can help' });
    expect(chooser.className).toContain('fc-help-sheet');
    fireEvent.keyDown(chooser, { key: 'Escape' });
    await waitFor(() => expect(chooser).not.toHaveAttribute('open'));

    const styles = readFileSync(
      resolve(__dirname, '../../globals.css'),
      'utf8',
    );
    expect(styles).toContain('.fc-help-option');
    expect(styles).toContain('.fc-help-option--intro');
    expect(styles).toContain('.fc-help-option--private');
    expect(styles).toContain('min-height: 44px');
    expect(styles).toContain('overflow-x: hidden');
    expect(styles).toContain('@media (max-width: 390px)');
    await expectAccessible(container);
  });
});
