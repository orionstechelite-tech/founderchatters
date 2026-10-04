// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => navigation,
}));

import { HomeGate } from '../home/home-gate';
import { resetMemberSessionJobForTests } from '../member/member-app-shell';
import { OnboardingClient } from './onboarding-client';

const topics = {
  expertise: [
    { id: 'exp-1', slug: 'b2b-sales', label: 'B2B sales' },
    { id: 'exp-2', slug: 'marketplace-gtm', label: 'Marketplace GTM' },
    { id: 'exp-3', slug: 'product', label: 'Product' },
    { id: 'exp-4', slug: 'engineering-hiring', label: 'Engineering hiring' },
    { id: 'exp-5', slug: 'fundraising', label: 'Fundraising' },
    { id: 'exp-6', slug: 'operations', label: 'Operations' },
    { id: 'exp-7', slug: 'india-market', label: 'India market' },
    { id: 'exp-8', slug: 'travel-mobility', label: 'Travel / mobility' },
    { id: 'exp-9', slug: 'growth-marketing', label: 'Growth marketing' },
    { id: 'exp-10', slug: 'partnerships', label: 'Partnerships' },
    { id: 'exp-11', slug: 'pricing', label: 'Pricing' },
    { id: 'exp-12', slug: 'founder-operations', label: 'Founder operations' },
  ],
  needs: [
    { id: 'need-1', slug: 'gtm', label: 'GTM' },
    { id: 'need-2', slug: 'fundraising', label: 'Fundraising' },
    { id: 'need-3', slug: 'hiring', label: 'Hiring' },
  ],
};

const emptyProfile = {
  profile: {
    displayName: null,
    city: 'Rajkot',
    country: 'India',
    customExpertise: null,
    currentNeedText: null,
    onboardingCompleted: false,
  },
  company: {
    name: 'FounderChatters',
    website: 'https://founderchatters.com/',
    description: 'A founder-to-founder support network.',
    stage: null,
    industry: null,
    city: 'Rajkot',
    country: 'India',
  },
  applicationRoleTitle: 'Founder',
  expertise: [],
  needs: [],
  topics,
};

const readyProfile = {
  ...emptyProfile,
  profile: {
    ...emptyProfile.profile,
    displayName: 'Chaitanya Pandita',
    customExpertise: null,
    currentNeedText:
      'Finding founders who have launched a B2B product in the UAE.',
  },
  expertise: [topics.expertise[1]],
  needs: [],
};

afterEach(() => {
  cleanup();
  resetMemberSessionJobForTests();
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
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

const onboardingSession = {
  user: {
    id: 'user-1',
    email: 'founder@example.com',
    emailVerified: true,
    status: 'ACTIVE',
  },
  access: {
    state: 'ONBOARDING',
    applicationStatus: 'APPROVED',
    onboardingCompleted: false,
  },
};

const activeSession = {
  ...onboardingSession,
  access: {
    state: 'ACTIVE',
    applicationStatus: 'APPROVED',
    onboardingCompleted: true,
  },
};

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-009 onboarding', { timeout: 30_000 }, () => {
  it('prefills application data and walks all four steps', async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(onboardingSession))
      .mockResolvedValueOnce(response(emptyProfile))
      .mockResolvedValueOnce(
        response({
          ...emptyProfile,
          profile: {
            ...emptyProfile.profile,
            displayName: 'Chaitanya Pandita',
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          ...readyProfile,
          profile: {
            ...readyProfile.profile,
            currentNeedText: null,
          },
          expertise: [topics.expertise[0]],
        }),
      )
      .mockResolvedValueOnce(response(readyProfile))
      .mockResolvedValueOnce(
        response({
          completed: true,
          onboardingCompletedAt: '2026-09-29T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(response(activeSession));
    vi.stubGlobal('fetch', fetchMock);
    const page = render(createElement(OnboardingClient));

    expect(
      await screen.findByRole('heading', { name: /What are you building/i }),
    ).toBeVisible();
    expect(screen.getByLabelText('Company')).toHaveValue('FounderChatters');
    expect(screen.getByLabelText('City')).toHaveValue('Rajkot');
    await expectAccessible(page.container);

    await user.click(screen.getByLabelText('Display name'));
    await user.paste('Chaitanya Pandita');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByRole('heading', {
        name: /What can you help another founder with/i,
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /B2B sales/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(screen.getByRole('button', { name: /B2B sales/i }));
    expect(screen.getByRole('button', { name: /B2B sales/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /India market/i })).toBeVisible();
    await expectAccessible(page.container);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByRole('heading', {
        name: /What do you need help with right now/i,
      }),
    ).toBeVisible();
    await user.click(screen.getByLabelText('Current need'));
    await user.paste(
      'Finding founders who have launched a B2B product in the UAE.',
    );
    await expectAccessible(page.container);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByRole('heading', {
        name: /You’re ready to enter the network/i,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Chaitanya Pandita' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Ask the community/i }),
    ).toBeNull();
    await expectAccessible(page.container);
    await user.click(
      screen.getByRole('button', { name: 'Enter FounderChatters' }),
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/home'),
    );
  });

  it('skips step 1 without fabricating a name and returns to step 1 from later validation', async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(onboardingSession))
        .mockResolvedValueOnce(response(emptyProfile))
        .mockResolvedValueOnce(
          response(
            {
              error: {
                code: 'APPLICATION_INVALID_STATE',
                message: 'Save your name and company before continuing.',
                requestId: 'request-test',
                fieldErrors: { displayName: ['Enter your name.'] },
              },
            },
            400,
          ),
        ),
    );
    render(createElement(OnboardingClient));
    expect(
      await screen.findByRole('heading', { name: /What are you building/i }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(
      await screen.findByRole('heading', {
        name: /What can you help another founder with/i,
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: /B2B sales/i }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByRole('heading', { name: /What are you building/i }),
    ).toBeVisible();
    expect(screen.getByLabelText('Display name')).toHaveValue('');
    await expectAccessible(screen.getByRole('main'));
  });

  it('returns from step 4 completion errors to the missing display name step', async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(onboardingSession))
        .mockResolvedValueOnce(response(readyProfile))
        .mockResolvedValueOnce(
          response(
            {
              error: {
                code: 'ONBOARDING_INCOMPLETE',
                message: 'Finish onboarding before entering the network.',
                requestId: 'request-test',
                fieldErrors: { displayName: ['Enter your name.'] },
              },
            },
            400,
          ),
        ),
    );
    const page = render(createElement(OnboardingClient));
    expect(
      await screen.findByRole('heading', {
        name: /You’re ready to enter the network/i,
      }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Enter FounderChatters' }),
    );
    expect(
      await screen.findByRole('heading', { name: /What are you building/i }),
    ).toBeVisible();
    expect(screen.getByLabelText('Display name')).toBeVisible();
    await expectAccessible(page.container);
  });

  it('sends active members visiting onboarding to home', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(response(activeSession)),
    );
    render(createElement(OnboardingClient));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/home'),
    );
  });

  it('keeps entered values after a validation error', async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(onboardingSession))
        .mockResolvedValueOnce(response(emptyProfile))
        .mockResolvedValueOnce(
          response(
            {
              error: {
                code: 'APPLICATION_INVALID_STATE',
                message: 'Review the onboarding details and try again.',
                requestId: 'request-test',
                fieldErrors: { displayName: ['Enter your name.'] },
              },
            },
            400,
          ),
        ),
    );
    render(createElement(OnboardingClient));
    const displayName = await screen.findByLabelText('Display name');
    await user.clear(displayName);
    await user.type(displayName, 'Kept Name');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByLabelText('Display name')).toHaveValue('Kept Name');
  });

  it('gates /home to ACTIVE members', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(response(onboardingSession)),
    );
    render(createElement(HomeGate));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/onboarding'),
    );
  });

  it('sends unverified /home visitors to verify email', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response({
          ...onboardingSession,
          user: { ...onboardingSession.user, emailVerified: false },
          access: {
            state: 'VERIFY_EMAIL',
            applicationStatus: null,
            onboardingCompleted: false,
          },
        }),
      ),
    );
    render(createElement(HomeGate));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/verify-email'),
    );
  });

  it('renders truthful home copy for an active member', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(activeSession)));
    render(createElement(HomeGate));
    expect(
      await screen.findByRole('heading', { name: 'You’re in the network.' }),
    ).toBeVisible();
    expect(screen.getByText(/request-linked conversations/i)).toBeVisible();
    expect(screen.queryByText(/later task/i)).not.toBeInTheDocument();
  });

  it('sends unauthenticated /home visitors to sign in', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          errorResponse('AUTH_SESSION_EXPIRED', 'Session expired.', 401),
        ),
    );
    render(createElement(HomeGate));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/signin'),
    );
  });
});
