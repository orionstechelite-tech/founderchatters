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
  MemberHelpResponsesResponse,
  MemberRequest,
} from '@founderchatters/contracts';
import { MemberAppShell } from '../../member/member-app-shell';
import { initialsFrom, memberRequestUrl } from '../../member/member-format';
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

const ownerRequest: MemberRequest = {
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

function emptyThread(canOfferHelp = false): MemberHelpResponsesResponse {
  return {
    responses: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    viewerResponseTypes: [],
    canOfferHelp,
  };
}

function mockApi(request = ownerRequest, thread = emptyThread()) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/v1/auth/session')) return response(activeSession);
      if (url.includes('/resolve')) {
        return response({
          request: {
            ...request,
            status: 'RESOLVED',
            resolvedAt: '2026-01-03T00:00:00.000Z',
          },
        });
      }
      if (method === 'DELETE') return response({ deleted: true });
      if (method === 'PATCH') {
        return response({
          request: { ...request, headline: 'Updated published headline' },
        });
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
  return fetchMock;
}

async function renderDetail(
  request = ownerRequest,
  viewerId = 'user-self',
  thread = emptyThread(
    viewerId !== request.author.id && request.status === 'PUBLISHED',
  ),
) {
  mockApi(request, thread);
  const page = render(
    <MemberAppShell activeItem="Ask">
      <RequestDetailClient requestId="req-live" viewerId={viewerId} />
    </MemberAppShell>,
  );
  await screen.findByRole('heading', { name: request.headline });
  return page;
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-011 request detail', () => {
  it('renders request text as plain text without injecting markup', async () => {
    await renderDetail({
      ...ownerRequest,
      headline: '<script>alert(1)</script> Headline',
      context: '<img src=x onerror=alert(1)> Context',
      whoCouldHelp: '<b>helper</b>',
    });
    expect(
      screen.getByRole('heading', {
        name: '<script>alert(1)</script> Headline',
      }),
    ).toBeVisible();
    expect(
      screen.getByText('<img src=x onerror=alert(1)> Context'),
    ).toBeVisible();
    expect(screen.getByText('<b>helper</b>')).toBeVisible();
    expect(document.querySelector('script')).toBeNull();
  });

  it('shows owner published actions and empty responses', async () => {
    const { container } = await renderDetail();
    expect(screen.getByRole('button', { name: 'Edit request' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mark resolved' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Share request' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Delete request' }),
    ).toBeVisible();
    expect(screen.getByText(/Responses · 0/i)).toBeVisible();
    expect(await screen.findByText(/No responses yet/i)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'I can help' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Message' }),
    ).not.toBeInTheDocument();
    await expectAccessible(container);
  });

  it('hides edit once a response exists and shows the live thread', async () => {
    await renderDetail({ ...ownerRequest, responseCount: 2 }, 'user-self', {
      responses: [
        {
          id: 'res-1',
          type: 'ADVICE',
          createdAt: '2026-01-02T00:00:00.000Z',
          author: {
            id: 'user-helper',
            displayName: 'Chaitanya',
            avatarUrl: null,
            companyName: 'Northwind',
            city: 'Dubai',
            country: 'UAE',
          },
          body: 'Don’t start with a broad distributor. Validate access first.',
          introduction: null,
        },
        {
          id: 'res-2',
          type: 'PRIVATE_CHAT_OFFER',
          createdAt: '2026-01-02T01:00:00.000Z',
          author: {
            id: 'user-helper-2',
            displayName: 'Maya',
            avatarUrl: null,
            companyName: 'Harbor',
            city: 'Dubai',
            country: 'UAE',
          },
          body: null,
          introduction: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
      viewerResponseTypes: [],
      canOfferHelp: false,
    });
    expect(
      screen.queryByRole('button', { name: 'Edit request' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/Responses · 2/i)).toBeVisible();
    expect(await screen.findByText('Chaitanya · Public advice')).toBeVisible();
    expect(
      await screen.findByText('Maya · Private help offered'),
    ).toBeVisible();
  });

  it('renders resolved owner state as read-only except share', async () => {
    await renderDetail({
      ...ownerRequest,
      status: 'RESOLVED',
      resolvedAt: '2026-01-03T00:00:00.000Z',
    });
    expect(screen.getByText('Resolved')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Share request' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Edit request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark resolved' }),
    ).not.toBeInTheDocument();
  });

  it('keeps non-owner published detail without owner actions and shows I can help', async () => {
    await renderDetail(
      {
        ...ownerRequest,
        author: { ...ownerRequest.author, id: 'user-other' },
      },
      'user-self',
    );
    expect(
      screen.queryByRole('button', { name: 'Edit request' }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'I can help' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Message' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Share request' }),
    ).not.toBeInTheDocument();
  });

  it('copies the member request URL and confirms delete with Escape', async () => {
    const user = userEvent.setup({ delay: null });
    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Share request' }));
    expect(memberRequestUrl('req-live')).toMatch(/\/requests\/req-live$/);
    await waitFor(() =>
      expect(screen.getByText(/Link copied\./)).toHaveTextContent(
        /\/requests\/req-live/,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Delete request' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete request?' });
    expect(dialog).toBeVisible();
    expect(
      within(dialog).getByText(
        /This removes the request from the member network. This can’t be undone./,
      ),
    ).toBeVisible();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));

    await user.click(screen.getByRole('button', { name: 'Delete request' }));
    const opened = screen.getByRole('dialog', { name: 'Delete request?' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(opened).not.toHaveAttribute('open'));
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('exposes accessible clipboard failure feedback', async () => {
    const user = userEvent.setup({ delay: null });
    await renderDetail();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(
      new Error('denied'),
    );
    await user.click(screen.getByRole('button', { name: 'Share request' }));
    expect(await screen.findByText(/Could not copy the link/i)).toBeVisible();
  });

  it('uses initials fallback and keeps the 390 layout contract', async () => {
    await renderDetail();
    expect(screen.getByText('AV')).toBeVisible();
    expect(initialsFrom('Ada Visible')).toBe('AV');
    const styles = readFileSync(
      resolve(__dirname, '../../globals.css'),
      'utf8',
    );
    expect(styles).toContain('.fc-request-detail');
    expect(styles).toContain('@media (max-width: 390px)');
    expect(styles).toContain('.fc-help-option');
  });
});
