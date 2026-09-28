'use client';

import type {
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { AuthApiError, postAuth } from '../../auth/auth-api';
import {
  capturePasswordResetToken,
  clearPasswordResetToken,
} from '../../auth/sensitive-token';

type ResetState = 'form' | 'success' | 'expired' | 'invalid';

export function ResetPasswordForm({ token }: { readonly token: string }) {
  const [activeToken, setActiveToken] = useState(
    token === 'recover' ? '' : token,
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<ResetState>('form');

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const captured = capturePasswordResetToken(token);
      if (captured) {
        setActiveToken(captured);
      } else {
        setState('invalid');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let invalid = false;
    if (password.length < 12 || password.length > 128) {
      setPasswordError('Use between 12 and 128 characters.');
      invalid = true;
    } else {
      setPasswordError('');
    }
    if (confirmPassword !== password) {
      setConfirmError('Passwords must match.');
      invalid = true;
    } else {
      setConfirmError('');
    }
    if (invalid) return;

    setMessage('');
    setSubmitting(true);
    try {
      const request: ResetPasswordRequest = {
        token: activeToken,
        password,
        confirmPassword,
      };
      await postAuth<ResetPasswordResponse>('reset-password', request);
      clearPasswordResetToken();
      setState('success');
    } catch (error) {
      if (
        error instanceof AuthApiError &&
        error.code === 'RESET_TOKEN_EXPIRED'
      ) {
        clearPasswordResetToken();
        setState('expired');
      } else if (
        error instanceof AuthApiError &&
        error.code === 'RESET_TOKEN_INVALID'
      ) {
        clearPasswordResetToken();
        setState('invalid');
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : 'We could not reset your password. Please try again.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'success') {
    return (
      <ResetStatus
        icon="✓"
        title="Password updated"
        message="Your old sessions have been signed out. Sign in again with your new password."
      />
    );
  }
  if (state === 'expired' || state === 'invalid') {
    return (
      <ResetStatus
        icon="!"
        title={
          state === 'expired' ? 'Your link has expired' : 'Link unavailable'
        }
        message={
          state === 'expired'
            ? 'Reset links expire after 30 minutes. Request a fresh link to continue.'
            : 'This reset link is invalid or has already been used.'
        }
      />
    );
  }

  return (
    <div className="fc-auth-form">
      <p className="fc-auth-kicker">Account recovery</p>
      <h1>Set a new password</h1>
      <p className="fc-auth-copy">
        Choose a password you have not used elsewhere.
      </p>
      <form className="fc-auth-fields" onSubmit={submit} noValidate>
        <Field
          autoComplete="new-password"
          autoFocus
          disabled={submitting}
          error={passwordError}
          hint="12–128 characters"
          label="New password"
          name="password"
          onChange={(event) => setPassword(event.currentTarget.value)}
          type="password"
          value={password}
        />
        <Field
          autoComplete="new-password"
          disabled={submitting}
          error={confirmError}
          label="Confirm new password"
          name="confirmPassword"
          onChange={(event) => setConfirmPassword(event.currentTarget.value)}
          type="password"
          value={confirmPassword}
        />
        {message ? (
          <p className="fc-auth-error" role="alert">
            {message}
          </p>
        ) : null}
        <Button
          className="fc-auth-submit"
          disabled={submitting || !activeToken}
          type="submit"
        >
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </div>
  );
}

function ResetStatus({
  icon,
  message,
  title,
}: {
  readonly icon: string;
  readonly message: string;
  readonly title: string;
}) {
  return (
    <div className="fc-auth-status" aria-live="polite">
      <div className="fc-auth-status__icon" aria-hidden="true">
        {icon}
      </div>
      <h1>{title}</h1>
      <p>{message}</p>
      <a
        className="fc-auth-link-button"
        href={title === 'Password updated' ? '/signin' : '/forgot-password'}
      >
        {title === 'Password updated' ? 'Sign in' : 'Request a new link'}
      </a>
    </div>
  );
}
