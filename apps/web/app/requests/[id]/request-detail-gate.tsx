'use client';

import type { AuthSessionResponse } from '@founderchatters/contracts';
import { useEffect, useState } from 'react';

import { authSessionRequest } from '../../member/member-api';
import { RequestDetailClient } from './request-detail-client';

export function RequestDetailGate({ requestId }: { requestId: string }) {
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
    return <p className="fc-discover-status">Loading request…</p>;
  }

  return (
    <RequestDetailClient requestId={requestId} viewerId={session.user.id} />
  );
}
