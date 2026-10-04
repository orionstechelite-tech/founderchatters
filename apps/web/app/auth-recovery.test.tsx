// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordForm } from './forgot-password/forgot-password-form';
import { ResetPasswordForm } from './reset-password/[token]/reset-password-form';
import {
  hasVerifyEmailJobForTests,
  resetVerifyEmailJobsForTests,
  VerifyEmailClient,
} from './verify-email/verify-email-client';

afterEach(() => {
  cleanup();
  resetVerifyEmailJobsForTests();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('FC-006 auth recovery forms', () => {
  it('validates reset-request email and renders enumeration-safe success', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ accepted: true }, 202));
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ForgotPasswordForm));

    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
      'Enter a valid email address.',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText('Email address'),
      'Founder@Example.COM',
    );
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(
      await screen.findByRole('heading', { name: 'Check your inbox' }),
    ).toBeVisible();
    expect(screen.getByText(/If an account exists/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v1/auth/forgot-password',
      expect.objectContaining({
        body: JSON.stringify({ email: 'founder@example.com' }),
        credentials: 'include',
      }),
    );
  });

  it('shows an expired verification-link recovery state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            error: {
              code: 'VERIFY_TOKEN_EXPIRED',
              message: 'This verification link has expired.',
            },
          },
          400,
        ),
      ),
    );
    render(createElement(VerifyEmailClient, { token: 'expired-token' }));

    expect(
      await screen.findByRole('heading', { name: 'Your link has expired' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Email address')).toBeEnabled();
  });

  it.each([
    ['VERIFY_TOKEN_INVALID', 'This verification link is not valid.'],
    ['VERIFY_TOKEN_INVALID', 'This verification link has already been used.'],
  ])('shows a safe verification failure for %s: %s', async (code, message) => {
    window.history.replaceState({}, '', '/verify-email?token=sensitive-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ error: { code, message } }, 400)),
    );
    render(createElement(VerifyEmailClient, { token: 'sensitive-token' }));

    expect(
      await screen.findByRole('heading', { name: 'That link did not work' }),
    ).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    expect(window.location.href).not.toContain('sensitive-token');
    expect(window.sessionStorage.length).toBe(0);
  });

  it('keeps verification progress across a remount and applies the first result', async () => {
    let resolveVerify: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveVerify = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = render(
      createElement(VerifyEmailClient, { token: 'live-verify-token' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Verifying your email' }),
    ).toBeVisible();
    first.unmount();

    render(createElement(VerifyEmailClient, { token: 'live-verify-token' }));
    expect(
      screen.getByRole('heading', { name: 'Verifying your email' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveVerify?.(response({ verified: true }));
    expect(
      await screen.findByRole('heading', { name: 'Email verified' }),
    ).toBeVisible();
    expect(hasVerifyEmailJobForTests('live-verify-token')).toBe(false);
  });

  it('retries verification after a settled network error', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response({ verified: true }));
    vi.stubGlobal('fetch', fetchMock);

    const first = render(
      createElement(VerifyEmailClient, { token: 'retry-verify-token' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'That link did not work' }),
    ).toBeVisible();
    expect(hasVerifyEmailJobForTests('retry-verify-token')).toBe(false);
    first.unmount();

    render(createElement(VerifyEmailClient, { token: 'retry-verify-token' }));
    expect(
      await screen.findByRole('heading', { name: 'Email verified' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hasVerifyEmailJobForTests('retry-verify-token')).toBe(false);
  });

  it('does not retain a successful verification job for later remounts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ verified: true }));
    vi.stubGlobal('fetch', fetchMock);

    const first = render(
      createElement(VerifyEmailClient, { token: 'settled-verify-token' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Email verified' }),
    ).toBeVisible();
    expect(hasVerifyEmailJobForTests('settled-verify-token')).toBe(false);
    first.unmount();

    render(createElement(VerifyEmailClient, { token: 'settled-verify-token' }));
    expect(
      await screen.findByRole('heading', { name: 'Email verified' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hasVerifyEmailJobForTests('settled-verify-token')).toBe(false);
  });

  it('renders the generic successful resend state', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ accepted: true }, 202)),
    );
    render(createElement(VerifyEmailClient));

    await user.type(
      screen.getByLabelText('Email address'),
      'founder@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'Resend verification email' }),
    );
    expect(await screen.findByText('Check your inbox')).toBeVisible();
    expect(screen.getByText(/If that address is eligible/i)).toBeVisible();
  });

  it('requires matching passwords and handles a successful reset', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ passwordReset: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(ResetPasswordForm, { token: 'reset-token' }));

    await user.type(
      screen.getByLabelText('New password'),
      'a sufficiently long password',
    );
    await user.type(
      screen.getByLabelText('Confirm new password'),
      'a different long password',
    );
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(
      screen.getByLabelText('Confirm new password'),
    ).toHaveAccessibleDescription('Passwords must match.');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(
      screen.getByLabelText('Confirm new password'),
      'a sufficiently long password',
    );
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Password updated' }),
      ).toBeVisible(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v1/auth/reset-password',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it.each([
    ['RESET_TOKEN_EXPIRED', 'Your link has expired'],
    ['RESET_TOKEN_INVALID', 'Link unavailable'],
  ])('handles reset-token error %s', async (code, heading) => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      '',
      '/reset-password/sensitive-reset-token',
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response({ error: { code, message: 'Safe reset error' } }, 400),
        ),
    );
    render(
      createElement(ResetPasswordForm, {
        token: 'sensitive-reset-token',
      }),
    );

    await user.type(
      screen.getByLabelText('New password'),
      'a sufficiently long password',
    );
    await user.type(
      screen.getByLabelText('Confirm new password'),
      'a sufficiently long password',
    );
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(window.location.pathname).toBe('/reset-password/recover');
    expect(window.location.href).not.toContain('sensitive-reset-token');
    expect(window.sessionStorage.length).toBe(0);
  });

  it('has no basic accessibility violations in the recovery form', async () => {
    const { container } = render(createElement(ForgotPasswordForm));
    const result = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it('keeps the deterministic 390px layout contract', () => {
    const styles = readFileSync(
      resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );
    expect(styles).toContain('@media (max-width: 390px)');
    expect(styles).toMatch(
      /\.fc-auth-main\s*\{[\s\S]*?padding:\s*28px 20px 40px;/,
    );
    expect(styles).toMatch(
      /\.fc-auth-panel\s*\{[\s\S]*?max-width:\s*500px;[\s\S]*?width:\s*100%;/,
    );
    expect(styles).toContain('min-width: 0;');
  });
});
