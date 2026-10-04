'use client';

import type {
  AuthSessionResponse,
  SigninRequest,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { destinationForAccessState } from '../auth/access-destination';
import { AuthApiError, postAuth } from '../auth/auth-api';

export function SigninForm() {
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
      setEmailError('Enter a valid email address.');
      invalid = true;
    } else {
      setEmailError('');
    }
    if (!password) {
      setPasswordError('Enter your password.');
      invalid = true;
    } else {
      setPasswordError('');
    }
    if (invalid) return;

    setMessage('');
    setSubmitting(true);
    try {
      const request: SigninRequest = {
        email: normalized,
        password,
      };
      const session = await postAuth<AuthSessionResponse>('signin', request);
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
          : 'We could not sign you in. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fc-auth-form">
      <p className="fc-auth-kicker">Welcome back</p>
      <h1>Sign in</h1>
      <p className="fc-auth-copy">
        Use the email and password for your FounderChatters account.
      </p>
      <form className="fc-auth-fields" onSubmit={submit} noValidate>
        <Field
          autoComplete="email"
          autoFocus
          disabled={submitting}
          error={emailError}
          label="Email"
          name="email"
          onChange={(event) => setEmail(event.currentTarget.value)}
          placeholder="you@company.com"
          type="email"
          value={email}
        />
        <Field
          autoComplete="current-password"
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
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="fc-auth-meta">
        <a href="/forgot-password">Forgot password</a>
      </p>
      <p className="fc-auth-meta">
        New here? <a href="/signup">Create account</a>
      </p>
    </div>
  );
}
