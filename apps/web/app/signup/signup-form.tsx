'use client';

import type {
  AuthSessionResponse,
  SignupRequest,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { destinationForAccessState } from '../auth/access-destination';
import { AuthApiError, postAuth } from '../auth/auth-api';

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    let invalid = false;
    if (!normalized || !normalized.includes('@')) {
      setEmailError('Enter a valid work email.');
      invalid = true;
    } else {
      setEmailError('');
    }
    if (password.length < 12 || password.length > 128) {
      setPasswordError('Use between 12 and 128 characters.');
      invalid = true;
    } else {
      setPasswordError('');
    }
    if (invalid) return;

    setMessage('');
    setSubmitting(true);
    try {
      const request: SignupRequest = {
        email: normalized,
        password,
      };
      const session = await postAuth<AuthSessionResponse>('signup', request);
      router.push(destinationForAccessState(session.access.state));
      router.refresh();
    } catch (error) {
      if (error instanceof AuthApiError) {
        setEmailError(error.fieldErrors.email?.[0] ?? '');
        setPasswordError(error.fieldErrors.password?.[0] ?? '');
        setMessage(
          Object.keys(error.fieldErrors).length > 0 ? '' : error.message,
        );
        return;
      }
      setMessage(
        error instanceof Error
          ? error.message
          : 'We could not create your account. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fc-auth-form">
      <p className="fc-auth-kicker">Join the network</p>
      <h1>Create your founder account</h1>
      <p className="fc-auth-copy">
        Start with a work email and a password. You will verify the email before
        submitting a founder application.
      </p>
      <form className="fc-auth-fields" onSubmit={submit} noValidate>
        <Field
          autoComplete="email"
          autoFocus
          disabled={submitting}
          error={emailError}
          label="Work email"
          name="email"
          onChange={(event) => setEmail(event.currentTarget.value)}
          placeholder="you@company.com"
          type="email"
          value={email}
        />
        <Field
          autoComplete="new-password"
          disabled={submitting}
          error={passwordError}
          label="Password"
          name="password"
          onChange={(event) => setPassword(event.currentTarget.value)}
          type="password"
          value={password}
        />
        {message ? (
          <p className="fc-auth-error" role="alert">
            {message}
          </p>
        ) : null}
        <Button className="fc-auth-submit" disabled={submitting} type="submit">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="fc-auth-meta">
        Already have an account? <a href="/signin">Sign in</a>
      </p>
    </div>
  );
}
