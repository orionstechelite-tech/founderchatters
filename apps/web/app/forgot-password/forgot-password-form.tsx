'use client';

import type {
  AcceptedResponse,
  EmailRequest,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { postAuth } from '../auth/auth-api';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError('');
    setMessage('');
    setSending(true);
    try {
      const request: EmailRequest = {
        email: normalized,
      };
      await postAuth<AcceptedResponse>('forgot-password', request);
      setSent(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'We could not submit your request. Please try again.',
      );
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="fc-auth-status" aria-live="polite">
        <div className="fc-auth-status__icon" aria-hidden="true">
          →
        </div>
        <h1>Check your inbox</h1>
        <p>
          If an account exists for {email.trim()}, we sent a password reset
          link. It expires in 30 minutes.
        </p>
        <a className="fc-auth-link-button" href="/signin">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="fc-auth-form">
      <p className="fc-auth-kicker">Account recovery</p>
      <h1>Reset your password</h1>
      <p className="fc-auth-copy">
        Enter your account email and we’ll send you a secure reset link.
      </p>
      <form className="fc-auth-fields" onSubmit={submit} noValidate>
        <Field
          autoComplete="email"
          autoFocus
          disabled={sending}
          error={emailError}
          label="Email address"
          name="email"
          onChange={(event) => setEmail(event.currentTarget.value)}
          placeholder="you@company.com"
          type="email"
          value={email}
        />
        {message ? (
          <p className="fc-auth-error" role="alert">
            {message}
          </p>
        ) : null}
        <Button className="fc-auth-submit" disabled={sending} type="submit">
          {sending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="fc-auth-meta">
        Remembered it? <a href="/signin">Back to sign in</a>
      </p>
    </div>
  );
}
