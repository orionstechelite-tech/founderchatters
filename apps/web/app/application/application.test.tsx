// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

import { ApplicationClient } from './application-client';

const completeApplication = {
  id: 'application-1',
  status: 'DRAFT',
  eligibilityRole: 'FOUNDER_COFOUNDER',
  companyName: 'FounderChatters',
  roleTitle: 'Founder',
  website: 'https://founderchatters.com/',
  city: 'Delhi',
  country: 'India',
  buildingSummary:
    'A focused founder support network for useful founder conversations.',
  submittedAt: null,
  decidedAt: null,
  updatedAt: '2026-09-28T12:00:00.000Z',
  needsInfoNote: null,
} as const;

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

function errorResponse(code: string, message: string, status = 400): Response {
  return response(
    { error: { code, message, requestId: 'request-test', fieldErrors: {} } },
    status,
  );
}

async function expectAccessible(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

describe('FC-007 founder application', () => {
  it('starts at eligibility and supports keyboard selection', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        errorResponse(
          'APPLICATION_NOT_FOUND',
          'No founder application exists yet.',
          404,
        ),
      )
      .mockResolvedValueOnce(
        response({
          application: { ...completeApplication, companyName: null },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationClient));

    expect(
      await screen.findByRole('heading', {
        name: /A founder network should start with founders/i,
      }),
    ).toBeVisible();
    const founder = screen.getByRole('radio', {
      name: 'Founder / Co-founder',
    });
    founder.focus();
    await user.keyboard(' ');
    expect(founder).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByRole('heading', {
        name: /Tell us what you’re building/i,
      }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4000/v1/application/me',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify({ eligibilityRole: 'FOUNDER_COFOUNDER' }),
      }),
    );
  });

  it('keeps NOT_CURRENTLY_BUILDING drafts on eligibility after refresh', async () => {
    const user = userEvent.setup();
    const ineligible = {
      ...completeApplication,
      eligibilityRole: 'NOT_CURRENTLY_BUILDING',
    } as const;
    const eligible = {
      ...ineligible,
      eligibilityRole: 'FOUNDER_COFOUNDER',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ application: ineligible }))
      .mockResolvedValueOnce(response({ application: eligible }));
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationClient));

    expect(
      await screen.findByRole('heading', {
        name: /A founder network should start with founders/i,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('radio', { name: 'Not currently building' }),
    ).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(
      /requires an active company build/i,
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(
      screen.queryByRole('heading', { name: /Tell us what you’re building/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('radio', { name: 'Founder / Co-founder' }),
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByRole('heading', {
        name: /Tell us what you’re building/i,
      }),
    ).toBeVisible();
    expect(screen.getByLabelText('Company / startup')).toHaveValue(
      'FounderChatters',
    );
  });

  it('does not continue from a fresh NOT_CURRENTLY_BUILDING selection', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        errorResponse(
          'APPLICATION_NOT_FOUND',
          'No founder application exists yet.',
          404,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationClient));

    await user.click(
      await screen.findByRole('radio', { name: 'Not currently building' }),
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      /requires an active company build/i,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates details, preserves values, reviews, and submits', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ application: completeApplication }))
      .mockResolvedValueOnce(response({ application: completeApplication }))
      .mockResolvedValueOnce(
        response({
          application: {
            ...completeApplication,
            status: 'SUBMITTED',
            submittedAt: '2026-09-28T12:30:00.000Z',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationClient));

    const company = await screen.findByLabelText('Company / startup');
    await user.clear(company);
    await user.type(company, 'A');
    await user.click(
      screen.getByRole('button', { name: 'Review application' }),
    );
    expect(company).toHaveValue('A');
    expect(company).toHaveAccessibleDescription(
      'Enter your company or startup name.',
    );

    await user.clear(company);
    await user.type(company, 'FounderChatters');
    await user.click(
      screen.getByRole('button', { name: 'Review application' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: /Review your application/i,
      }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Submit application' }),
    );
    expect(
      await screen.findByRole('heading', { name: /Pending review/i }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4000/v1/application/me/submit',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('refetches server state after a duplicate submit conflict', async () => {
    const user = userEvent.setup();
    const submitted = {
      ...completeApplication,
      status: 'SUBMITTED',
      submittedAt: '2026-09-28T12:30:00.000Z',
    } as const;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ application: completeApplication }))
      .mockResolvedValueOnce(response({ application: completeApplication }))
      .mockResolvedValueOnce(
        errorResponse(
          'APPLICATION_ALREADY_SUBMITTED',
          'This application has already been submitted.',
          409,
        ),
      )
      .mockResolvedValueOnce(response({ application: submitted }));
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationClient));

    await user.click(
      await screen.findByRole('button', { name: 'Review application' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Submit application' }),
    );
    expect(
      await screen.findByRole('heading', { name: /Pending review/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'View application' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Submit application' }),
    ).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      'http://localhost:4000/v1/application/me',
    );
    expect(fetchMock.mock.calls[3]?.[1]).not.toEqual(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows submitted applications read-only with a view action', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          application: {
            ...completeApplication,
            status: 'SUBMITTED',
            submittedAt: '2026-09-28T12:30:00.000Z',
          },
        }),
      ),
    );
    render(createElement(ApplicationClient));

    expect(
      await screen.findByRole('heading', { name: /Pending review/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /edit application/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View application' }));
    expect(
      screen.getByRole('heading', { name: /Your founder application/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Submit application' }),
    ).not.toBeInTheDocument();
  });

  it('supports needs-info editing and resubmission', async () => {
    const user = userEvent.setup();
    const needsInfo = {
      ...completeApplication,
      status: 'NEEDS_INFO',
      submittedAt: '2026-09-27T12:00:00.000Z',
      needsInfoNote: 'Clarify your customer and current stage.',
    } as const;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ application: needsInfo }))
      .mockResolvedValueOnce(response({ application: needsInfo }))
      .mockResolvedValueOnce(
        response({
          application: {
            ...needsInfo,
            status: 'SUBMITTED',
            needsInfoNote: null,
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationClient));

    expect(
      await screen.findByText('Clarify your customer and current stage.'),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Update application' }),
    );
    const summary = screen.getByLabelText('What are you building?');
    expect(summary).toHaveValue(completeApplication.buildingSummary);
    await user.type(summary, ' Current stage: private alpha.');
    await user.click(screen.getByRole('button', { name: 'Review updates' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Resubmit application',
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4000/v1/application/me/resubmit',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refetches server state after a stale resubmit conflict', async () => {
    const user = userEvent.setup();
    const needsInfo = {
      ...completeApplication,
      status: 'NEEDS_INFO',
      submittedAt: '2026-09-27T12:00:00.000Z',
      needsInfoNote: 'Clarify your customer and current stage.',
    } as const;
    const submitted = {
      ...needsInfo,
      status: 'SUBMITTED',
      needsInfoNote: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ application: needsInfo }))
      .mockResolvedValueOnce(response({ application: needsInfo }))
      .mockResolvedValueOnce(
        errorResponse(
          'APPLICATION_INVALID_STATE',
          'This application has already been resubmitted.',
          409,
        ),
      )
      .mockResolvedValueOnce(response({ application: submitted }));
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationClient));

    await user.click(
      await screen.findByRole('button', { name: 'Update application' }),
    );
    await user.click(screen.getByRole('button', { name: 'Review updates' }));
    await user.click(
      await screen.findByRole('button', { name: 'Resubmit application' }),
    );
    expect(
      await screen.findByRole('heading', { name: /Pending review/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Resubmit application' }),
    ).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      'http://localhost:4000/v1/application/me',
    );
  });

  it('renders rejected status and forwards approved founders by access state', async () => {
    const rejectedFetch = vi.fn().mockResolvedValue(
      response({
        application: { ...completeApplication, status: 'REJECTED' },
      }),
    );
    vi.stubGlobal('fetch', rejectedFetch);
    const rejected = render(createElement(ApplicationClient));
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: /Not approved/i,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Contact support' }),
    ).toHaveAttribute('href', '/support');
    rejected.unmount();

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            application: { ...completeApplication, status: 'APPROVED' },
          }),
        )
        .mockResolvedValueOnce(
          response({
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
          }),
        ),
    );
    const approved = render(createElement(ApplicationClient));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/onboarding'),
    );
    approved.unmount();
    navigation.replace.mockReset();

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            application: { ...completeApplication, status: 'APPROVED' },
          }),
        )
        .mockResolvedValueOnce(
          response({
            user: {
              id: 'user-1',
              email: 'founder@example.com',
              emailVerified: true,
              status: 'ACTIVE',
            },
            access: {
              state: 'ACTIVE',
              applicationStatus: 'APPROVED',
              onboardingCompleted: true,
            },
          }),
        ),
    );
    render(createElement(ApplicationClient));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/home'),
    );
  });

  it('shows a distinct permission-denied state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          errorResponse(
            'AUTH_FORBIDDEN',
            'This account cannot access the service.',
            403,
          ),
        ),
    );
    render(createElement(ApplicationClient));

    expect(
      await screen.findByRole('heading', {
        name: 'You can’t access this application',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Contact support' }),
    ).toHaveAttribute('href', '/support');
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
  });

  it('persists eligibility before Save & exit', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        errorResponse(
          'APPLICATION_NOT_FOUND',
          'No founder application exists yet.',
          404,
        ),
      )
      .mockResolvedValueOnce(
        response({
          application: { ...completeApplication, status: 'APPROVED' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationClient));

    await user.click(
      await screen.findByRole('radio', {
        name: 'Founder / Co-founder',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Save & exit' }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4000/v1/application/me',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ eligibilityRole: 'FOUNDER_COFOUNDER' }),
      }),
    );
    expect(navigation.replace).toHaveBeenCalledWith('/');
  });

  it('preserves entered data after server validation errors', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ application: completeApplication }))
      .mockResolvedValueOnce(
        response(
          {
            error: {
              code: 'APPLICATION_INVALID_STATE',
              message: 'Review the application details and try again.',
              requestId: 'request-test',
              fieldErrors: { website: ['The website could not be verified.'] },
            },
          },
          400,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ApplicationClient));

    const company = await screen.findByLabelText('Company / startup');
    await user.clear(company);
    await user.type(company, 'Preserved Company');
    await user.click(
      screen.getByRole('button', { name: 'Review application' }),
    );
    expect(company).toHaveValue('Preserved Company');
    expect(screen.getByLabelText('Website')).toHaveAccessibleDescription(
      'The website could not be verified.',
    );
  });

  it('saves a draft and disables form actions while pending', async () => {
    const user = userEvent.setup();
    let resolveSave: (value: Response) => void = () => {};
    const save = new Promise<Response>((resolvePromise) => {
      resolveSave = resolvePromise;
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ application: completeApplication }))
        .mockReturnValueOnce(save),
    );
    render(createElement(ApplicationClient));

    const saveButton = await screen.findByRole('button', {
      name: 'Save draft',
    });
    const reviewButton = screen.getByRole('button', {
      name: 'Review application',
    });
    await user.click(saveButton);
    expect(saveButton).toBeDisabled();
    expect(reviewButton).toBeDisabled();

    resolveSave(response({ application: completeApplication }));
    expect(await screen.findByText('Draft saved.')).toBeVisible();
    expect(saveButton).toBeEnabled();
  });

  it('keeps loading controls unavailable until server state resolves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    render(createElement(ApplicationClient));

    expect(
      screen.getByRole('heading', { name: 'Loading your application…' }),
    ).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has no basic accessibility violations on eligibility', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          errorResponse(
            'APPLICATION_NOT_FOUND',
            'No founder application exists yet.',
            404,
          ),
        ),
    );
    const { container } = render(createElement(ApplicationClient));
    await screen.findByRole('heading', {
      name: /A founder network should start with founders/i,
    });
    await expectAccessible(container);
  });

  it('has no basic accessibility violations on the founder/company form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ application: completeApplication })),
    );
    const { container } = render(createElement(ApplicationClient));
    await screen.findByLabelText('Company / startup');
    expect(screen.getByLabelText('Role')).toBeVisible();
    expect(screen.getByLabelText('City')).toBeVisible();
    expect(screen.getByLabelText('Country')).toBeVisible();
    await expectAccessible(container);
  });

  it('has no basic accessibility violations on review', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ application: completeApplication })),
    );
    const { container } = render(createElement(ApplicationClient));
    await user.click(
      await screen.findByRole('button', { name: 'Review application' }),
    );
    await screen.findByRole('heading', { name: /Review your application/i });
    await expectAccessible(container);
  });

  it('has no basic accessibility violations on submitted status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          application: {
            ...completeApplication,
            status: 'SUBMITTED',
            submittedAt: '2026-09-28T12:30:00.000Z',
          },
        }),
      ),
    );
    const { container } = render(createElement(ApplicationClient));
    await screen.findByRole('heading', { name: /Pending review/i });
    await expectAccessible(container);
  });

  it('has no basic accessibility violations on needs-info status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          application: {
            ...completeApplication,
            status: 'NEEDS_INFO',
            submittedAt: '2026-09-27T12:00:00.000Z',
            needsInfoNote: 'Clarify your customer and current stage.',
          },
        }),
      ),
    );
    const { container } = render(createElement(ApplicationClient));
    await screen.findByText('Clarify your customer and current stage.');
    await expectAccessible(container);
  });

  it('has no basic accessibility violations on rejected status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          application: { ...completeApplication, status: 'REJECTED' },
        }),
      ),
    );
    const { container } = render(createElement(ApplicationClient));
    await screen.findByRole('heading', { level: 2, name: /Not approved/i });
    await expectAccessible(container);
  });

  it('keeps the deterministic 390px no-overflow contract', () => {
    const styles = readFileSync(
      resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );
    const shell = styles.match(/\.fc-application-shell\s*\{[^}]+\}/)?.[0];
    expect(shell).toMatch(/min-width:\s*0;/);
    expect(shell).not.toMatch(/overflow-x:\s*clip/);
    expect(styles).toContain('@media (max-width: 390px)');
    expect(styles).toMatch(
      /\.fc-application-shell\s*\{[\s\S]*?padding:\s*18px 20px 42px;/,
    );
    expect(styles).toMatch(
      /\.fc-application-form \.fc-field\s*\{[\s\S]*?min-width:\s*0;/,
    );
    expect(styles).toMatch(
      /\.fc-application-form \.fc-field__control\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/,
    );
    expect(styles).toMatch(
      /\.fc-application-location-fields\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /\.fc-application-review dd\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/,
    );
    expect(styles).toMatch(
      /\.fc-application-request\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/,
    );
    expect(styles).not.toContain('overflow-x: clip;');
    expect(styles).toMatch(
      /\.fc-application-actions \.fc-button,[\s\S]*?width:\s*100%;/,
    );
    expect(styles).toMatch(
      /\.fc-application-location-fields\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /\.fc-application-mobile-back\s*\{[\s\S]*?height:\s*44px;[\s\S]*?width:\s*44px;/,
    );
  });
});
