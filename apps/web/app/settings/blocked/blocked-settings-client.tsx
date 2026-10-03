'use client';

import { Button } from '@founderchatters/ui';
import { useEffect, useState } from 'react';

import { listBlockedFounders, unblockFounder } from '../../member/member-api';
import { OnboardingApiError } from '../../onboarding/onboarding-api';

type BlockedRow = {
  id: string;
  displayName: string;
  companyName: string;
};

export function BlockedSettingsClient() {
  const [founders, setFounders] = useState<BlockedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listBlockedFounders()
      .then((payload) => {
        if (cancelled) return;
        setFounders(payload.founders);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'Blocked founders are unavailable.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function unblock(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await unblockFounder(id);
      setFounders((current) =>
        (current ?? []).filter((founder) => founder.id !== id),
      );
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not unblock that founder.',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="fc-settings-section-header">
        <p className="fc-label">Blocked users</p>
        <h2>Blocked founders</h2>
        <p>
          Founders you block cannot start new messages or other new direct
          interactions with you.
        </p>
      </header>
      {error ? (
        <p className="fc-settings-error" role="alert">
          {error}
        </p>
      ) : founders === null ? (
        <p className="fc-settings-status">Loading blocked founders…</p>
      ) : founders.length === 0 ? (
        <div className="fc-settings-empty-card">
          <p className="fc-label">Member safety</p>
          <h3>No blocked founders</h3>
          <p>You have not blocked anyone yet.</p>
        </div>
      ) : (
        <ul className="fc-settings-session-list">
          {founders.map((founder) => (
            <li key={founder.id}>
              <div>
                <p className="fc-settings-session-title">
                  {founder.displayName}
                </p>
                <p className="fc-settings-session-meta">
                  {founder.companyName}
                </p>
              </div>
              <Button
                disabled={busyId === founder.id}
                onClick={() => void unblock(founder.id)}
                size="small"
                type="button"
                variant="secondary"
              >
                {busyId === founder.id ? 'Unblocking…' : 'Unblock'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
