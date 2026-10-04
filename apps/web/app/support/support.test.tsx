// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupportForm, resolveSupportCategory } from './support-form';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('public support form', () => {
  it('preselects a valid category and falls back to other', () => {
    expect(resolveSupportCategory('safety')).toBe('safety');
    expect(resolveSupportCategory('billing')).toBe('other');
    expect(resolveSupportCategory(undefined)).toBe('other');
  });

  it('keeps typed values after a recoverable server error', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'PUBLIC_SUPPORT_INVALID_INPUT',
              message: 'Enter a valid email address.',
              fieldErrors: { email: ['Enter a valid email address.'] },
            },
          },
          400,
        ),
      ),
    );
    render(<SupportForm initialCategory="technical" />);
    expect(screen.getByLabelText('Category')).toHaveValue('technical');
    await user.type(screen.getByLabelText('Email'), 'keep-me@example.com');
    await user.type(screen.getByLabelText('Subject'), 'Saved subject');
    await user.type(screen.getByLabelText('Message'), 'Saved message body');
    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('keep-me@example.com');
    expect(screen.getByLabelText('Subject')).toHaveValue('Saved subject');
    expect(screen.getByLabelText('Message')).toHaveValue('Saved message body');
  });

  it('shows a received reference without claiming email delivery or an SLA', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ caseId: 'case_public_1', status: 'OPEN' }, 201),
        ),
    );
    render(<SupportForm initialCategory="other" />);
    await user.type(screen.getByLabelText('Email'), 'guest@example.com');
    await user.type(screen.getByLabelText('Subject'), 'Need help');
    await user.type(screen.getByLabelText('Message'), 'Please take a look.');
    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    await waitFor(() => {
      expect(
        screen.getByText('Your support request has been received.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Reference:/)).toHaveTextContent('case_public_1');
    expect(
      screen.getByText(
        /The support team can use the email associated with this support request to reach you/,
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /email you provided|we emailed you|24\/7|guaranteed response/i,
    );
  });
});
