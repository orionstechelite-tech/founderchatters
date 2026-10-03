'use client';

import type { AuthSessionResponse } from '@founderchatters/contracts';
import { Button } from '@founderchatters/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { authSessionRequest, signOutMember } from '../member/member-api';
import { OnboardingApiError } from '../onboarding/onboarding-api';

export function SuspendedClient() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authSessionRequest()
      .then((next) => {
        if (cancelled) return;
        if (next.access.state !== 'SUSPENDED') {
          router.replace(next.access.state === 'ACTIVE' ? '/home' : '/signin');
          return;
        }
        setSession(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof OnboardingApiError &&
          error.code === 'AUTH_ACCOUNT_SUSPENDED'
        ) {
          setSession({
            user: {
              id: '',
              email: '',
              emailVerified: false,
              status: 'SUSPENDED',
            },
            access: {
              state: 'SUSPENDED',
              applicationStatus: null,
              onboardingCompleted: false,
              suspensionReason: null,
              suspendedUntil: null,
            },
          });
          return;
        }
        router.replace('/signin');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutMember();
    } finally {
      router.replace('/signin');
      router.refresh();
    }
  }

  if (!session) {
    return <p className="fc-onboarding-status">Checking account status…</p>;
  }

  return (
    <main className="fc-suspended">
      <p className="fc-label">FounderChatters</p>
      <h1>Your account is suspended.</h1>
      <p>Access to member features is temporarily unavailable.</p>
      <section
        className="fc-suspended-card"
        aria-labelledby="suspension-status"
      >
        <p className="fc-label">Status</p>
        <h2 id="suspension-status">Suspended</h2>
        <p>
          Reason category:{' '}
          {session.access.suspensionReason ?? 'Community guidelines'}
        </p>
        {session.access.suspendedUntil ? (
          <p>Review continues until {session.access.suspendedUntil}.</p>
        ) : (
          <p>This restriction stays in place until a moderator reviews it.</p>
        )}
        <p className="fc-suspended-note">
          Public support and appeal pages are not available in this release.
        </p>
      </section>
      <Button
        disabled={signingOut}
        onClick={() => void signOut()}
        variant="secondary"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </main>
  );
}
