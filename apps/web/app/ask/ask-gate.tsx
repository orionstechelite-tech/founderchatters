'use client';

import type { AuthSessionResponse } from '@founderchatters/contracts';
import { useEffect, useState } from 'react';

import { authSessionRequest } from '../member/member-api';
import { AskClient } from './ask-client';

export function AskGate() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authSessionRequest()
      .then((next) => {
        if (!cancelled) setSession(next);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!session) {
    return <p className="fc-discover-status">Loading your request…</p>;
  }

  return <AskClient viewerId={session.user.id} />;
}
