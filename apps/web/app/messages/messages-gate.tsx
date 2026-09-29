'use client';

import type { AuthSessionResponse } from '@founderchatters/contracts';
import { useEffect, useState } from 'react';

import { authSessionRequest } from '../member/member-api';
import { MessagesClient } from './messages-client';

export function MessagesGate({ conversationId }: { conversationId?: string }) {
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
    return <p className="fc-discover-status">Loading messages…</p>;
  }

  return conversationId ? (
    <MessagesClient
      conversationId={conversationId}
      viewerId={session.user.id}
    />
  ) : (
    <MessagesClient viewerId={session.user.id} />
  );
}
