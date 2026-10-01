'use client';

import type { AuthSessionResponse } from '@founderchatters/contracts';
import { MemberShell } from '@founderchatters/ui';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { OnboardingApiError } from '../onboarding/onboarding-api';
import { authSessionRequest } from './member-api';
import { initialsFrom } from './member-format';

export function memberNavItems(userId: string) {
  return [
    { href: '/home', label: 'Home' },
    { href: '/discover', label: 'Discover' },
    { href: '/ask', label: 'Ask' },
    { href: '/messages', label: 'Messages' },
    { href: `/founders/${userId}`, label: 'Profile' },
  ];
}

function resolveActiveItem(
  pathname: string,
  userId: string,
  fallback: 'Home' | 'Discover' | 'Profile' | 'Ask' | 'Messages',
) {
  if (pathname === '/ask' || pathname.startsWith('/requests/')) return 'Ask';
  if (pathname === '/discover') return 'Discover';
  if (pathname === '/home') return 'Home';
  if (pathname === '/messages' || pathname.startsWith('/messages/')) {
    return 'Messages';
  }
  if (pathname === '/reputation') return 'Profile';
  if (pathname.startsWith('/founders/')) {
    return pathname === `/founders/${userId}` ? 'Profile' : '';
  }
  return fallback;
}

export function MemberAppShell({
  activeItem,
  children,
}: {
  activeItem: 'Home' | 'Discover' | 'Profile' | 'Ask' | 'Messages';
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSessionResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authSessionRequest()
      .then((next: AuthSessionResponse) => {
        if (cancelled) return;
        if (next.access.state !== 'ACTIVE') {
          if (next.access.state === 'VERIFY_EMAIL') {
            router.replace('/verify-email');
            return;
          }
          if (next.access.state === 'APPLICATION') {
            router.replace('/application');
            return;
          }
          if (next.access.state === 'ONBOARDING') {
            router.replace('/onboarding');
            return;
          }
          router.replace('/signin');
          return;
        }
        setSession(next);
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

  const items = useMemo(
    () => (session ? memberNavItems(session.user.id) : []),
    [session],
  );

  if (!session) {
    return (
      <main className="fc-onboarding-shell">
        <p className="fc-onboarding-status">Loading your workspace…</p>
      </main>
    );
  }

  const initials = initialsFrom(session.user.email.split('@')[0] ?? 'FC');

  return (
    <MemberShell
      actions={
        <>
          <a
            aria-label="Open your profile"
            className="fc-avatar"
            href={`/founders/${session.user.id}`}
          >
            {initials}
          </a>
          <button
            aria-label="Open member menu"
            className="fc-member-menu"
            type="button"
          >
            •••
          </button>
        </>
      }
      activeItem={resolveActiveItem(pathname, session.user.id, activeItem)}
      items={items}
    >
      {children}
    </MemberShell>
  );
}
