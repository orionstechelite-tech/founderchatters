'use client';

import type { AuthSessionResponse } from '@founderchatters/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  authSessionRequest,
  OnboardingApiError,
} from '../onboarding/onboarding-api';

export function HomeGate() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authSessionRequest()
      .then((session: AuthSessionResponse) => {
        if (cancelled) return;
        if (session.access.state !== 'ACTIVE') {
          if (session.access.state === 'VERIFY_EMAIL') {
            router.replace('/verify-email');
            return;
          }
          if (session.access.state === 'APPLICATION') {
            router.replace('/application');
            return;
          }
          if (session.access.state === 'ONBOARDING') {
            router.replace('/onboarding');
            return;
          }
          router.replace('/signin');
          return;
        }
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof OnboardingApiError &&
          error.code === 'AUTH_SESSION_EXPIRED'
        ) {
          router.replace('/signin');
          return;
        }
        router.replace('/signin');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <main className="fc-onboarding-shell">
        <p className="fc-onboarding-status">Loading your workspace…</p>
      </main>
    );
  }

  return (
    <main className="fc-onboarding-shell">
      <header className="fc-onboarding-topbar">
        <p className="fc-onboarding-wordmark">FOUNDERCHATTERS</p>
      </header>
      <section className="fc-onboarding-hero">
        <p className="fc-onboarding-step-label">HOME</p>
        <h1>You’re in the network.</h1>
        <p>
          This is a temporary signed-in landing after onboarding. Member Home,
          Discover, and requests are not implemented here.
        </p>
      </section>
    </main>
  );
}
