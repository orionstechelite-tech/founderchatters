'use client';

import type {
  AcceptedResponse,
  EmailRequest,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { AuthApiError, postAuth } from '../auth/auth-api';
import {
  captureVerificationToken,
  clearVerificationToken,
} from '../auth/sensitive-token';

type VerifyState = 'idle' | 'verifying' | 'verified' | 'expired' | 'error';

export function VerifyEmailClient({
  token,
}: {
  readonly token?: string | undefined;
}) {
  const started = useRef(false);
  const [state, setState] = useState<VerifyState>(token ? 'verifying' : 'idle');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (started.current) return;
    const activeToken = captureVerificationToken(token);
    if (!activeToken) return;
    started.current = true;
    const request: VerifyEmailRequest = { token: activeToken };
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setState('verifying');
      try {
        await postAuth<VerifyEmailResponse>('verify-email', request);
        if (cancelled) return;
        clearVerificationToken();
        setState('verified');
      } catch (error: unknown) {
        if (cancelled) return;
        if (
          error instanceof AuthApiError &&
          error.code === 'VERIFY_TOKEN_EXPIRED'
        ) {
          clearVerificationToken();
          setState('expired');
        } else {
          if (
            !(error instanceof AuthApiError) ||
            error.code !== 'NETWORK_ERROR'
          ) {
            clearVerificationToken();
          }
          setMessage(
            error instanceof Error
              ? error.message
              : 'This verification link is not valid.',
          );
          setState('error');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      setEmailError('Enter the email address you used to sign up.');
      return;
    }
    setEmailError('');
    setMessage('');
    setSending(true);
    try {
      const request: EmailRequest = {
        email: normalized,
      };
      await postAuth<AcceptedResponse>('resend-verification', request);
      setSent(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'We could not send the email. Please try again.',
      );
    } finally {
      setSending(false);
    }
  }

  if (state === 'verifying') {
    return (
      <StatusCard
        busy
        title="Verifying your email"
        message="Hold on while we confirm your secure link."
      />
    );
  }

  if (state === 'verified') {
    return (
      <StatusCard
        title="Email verified"
        message="Your email is confirmed. You can continue your FounderChatters application."
        actionHref="/application"
        actionLabel="Continue"
      />
    );
  }

  return (
    <div className="fc-auth-form">
      <p className="fc-auth-kicker">Confirm your email</p>
      <h1>
        {state === 'expired'
          ? 'Your link has expired'
          : state === 'error'
            ? 'That link did not work'
            : 'Verify your email'}
      </h1>
      <p className="fc-auth-copy">
        {state === 'expired'
          ? 'Verification links expire after 30 minutes. Request a fresh link below.'
          : state === 'error'
            ? message
            : 'We sent a verification link to your inbox. Open it within 30 minutes to continue.'}
      </p>

      {sent ? (
        <div className="fc-auth-notice" role="status" tabIndex={-1}>
          <strong>Check your inbox</strong>
          <span>
            If that address is eligible, a new verification link is on its way.
          </span>
        </div>
      ) : (
        <form className="fc-auth-fields" onSubmit={resend} noValidate>
          <Field
            autoComplete="email"
            disabled={sending}
            error={emailError}
            label="Email address"
            name="email"
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder="you@company.com"
            type="email"
            value={email}
          />
          {message && state !== 'error' ? (
            <p className="fc-auth-error" role="alert">
              {message}
            </p>
          ) : null}
          <Button className="fc-auth-submit" disabled={sending} type="submit">
            {sending ? 'Sending…' : 'Resend verification email'}
          </Button>
        </form>
      )}
      <p className="fc-auth-meta">
        Already verified? <a href="/signin">Sign in</a>
      </p>
    </div>
  );
}

function StatusCard({
  actionHref,
  actionLabel,
  busy = false,
  message,
  title,
}: {
  readonly actionHref?: string;
  readonly actionLabel?: string;
  readonly busy?: boolean;
  readonly message: string;
  readonly title: string;
}) {
  return (
    <div className="fc-auth-status" aria-live="polite">
      <div className="fc-auth-status__icon" aria-hidden="true">
        {busy ? '···' : '✓'}
      </div>
      <h1>{title}</h1>
      <p>{message}</p>
      {actionHref && actionLabel ? (
        <a className="fc-auth-link-button" href={actionHref}>
          {actionLabel}
        </a>
      ) : null}
    </div>
  );
}
