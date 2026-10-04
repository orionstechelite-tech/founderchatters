// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { destinationForAccessState } from './auth/access-destination';
import { AuthShell } from './auth/auth-shell';
import { SigninForm } from './signin/signin-form';
import { SignupForm } from './signup/signup-form';

const navigation = {
  push: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.push.mockReset();
  navigation.refresh.mockReset();
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('FC-021 signin and signup pages', () => {
  it('maps access states to the frozen admission destinations', () => {
    expect(destinationForAccessState('VERIFY_EMAIL')).toBe('/verify-email');
    expect(destinationForAccessState('APPLICATION')).toBe('/application');
    expect(destinationForAccessState('ONBOARDING')).toBe('/onboarding');
    expect(destinationForAccessState('ACTIVE')).toBe('/home');
    expect(destinationForAccessState('SUSPENDED')).toBe('/suspended');
  });

  it('validates sign-in fields and keeps typed values after a recoverable error', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        {
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
            message: 'Email or password is incorrect.',
          },
        },
        401,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(AuthShell, null, createElement(SigninForm)));

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Forgot password' }),
    ).toHaveAttribute('href', '/forgot-password');
    expect(
      screen.getByRole('link', { name: 'Create account' }),
    ).toHaveAttribute('href', '/signup');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address.',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Email'), 'Founder@Example.COM');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect.',
    );
    expect(screen.getByLabelText('Email')).toHaveValue('Founder@Example.COM');
    expect(screen.getByLabelText('Password')).toHaveValue('wrong-password');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v1/auth/signin',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'founder@example.com',
          password: 'wrong-password',
        }),
        credentials: 'include',
      }),
    );
    expect(
      (
        await axe.run(document.body, {
          rules: { 'color-contrast': { enabled: false } },
        })
      ).violations,
    ).toEqual([]);
  });

  it('routes an active founder from sign-in to /home', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          user: {
            id: 'user-1',
            email: 'ada@example.com',
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
    render(createElement(SigninForm));
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(navigation.push).toHaveBeenCalledWith('/home');
  });

  it('creates an account with email and password only and continues to verify-email', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        {
          user: {
            id: 'user-2',
            email: 'founder@example.com',
            emailVerified: false,
            status: 'ACTIVE',
          },
          access: {
            state: 'VERIFY_EMAIL',
            applicationStatus: null,
            onboardingCompleted: false,
          },
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(AuthShell, null, createElement(SignupForm)));

    expect(
      screen.getByRole('heading', { name: 'Create your founder account' }),
    ).toBeVisible();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin',
    );

    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Work email')).toHaveAccessibleDescription(
      'Enter a valid work email.',
    );
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Use between 12 and 128 characters.',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText('Work email'),
      '  Founder@Example.COM  ',
    );
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v1/auth/signup',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'founder@example.com',
          password: 'correct horse',
        }),
        credentials: 'include',
      }),
    );
    expect(navigation.push).toHaveBeenCalledWith('/verify-email');
    expect(
      (
        await axe.run(document.body, {
          rules: { 'color-contrast': { enabled: false } },
        })
      ).violations,
    ).toEqual([]);
  });
});
