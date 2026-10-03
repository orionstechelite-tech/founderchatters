'use client';

import { Button } from '@founderchatters/ui';
import { useState } from 'react';

import { blockFounder } from '../member/member-api';
import { OnboardingApiError } from '../onboarding/onboarding-api';

export function BlockSheet({
  open,
  founderId,
  founderName,
  onClose,
  onBlocked,
}: {
  open: boolean;
  founderId: string;
  founderName: string;
  onClose: () => void;
  onBlocked?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await blockFounder(founderId);
      onBlocked?.();
      onClose();
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not block that founder.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fc-safety-overlay">
      <div
        className="fc-safety-sheet"
        role="dialog"
        aria-labelledby="block-title"
      >
        <h2 id="block-title">Block {founderName}?</h2>
        <p>
          They won’t be able to message you or start new direct interactions.
          Existing safety records and necessary history remain intact.
        </p>
        <div className="fc-safety-effects">
          <p className="fc-label">What changes</p>
          <p>Direct messaging stops</p>
          <p>New direct interactions stop</p>
        </div>
        {error ? (
          <p className="fc-settings-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Blocking…' : 'Block founder'}
        </Button>
        <Button disabled={busy} onClick={onClose} variant="secondary">
          Cancel
        </Button>
      </div>
    </div>
  );
}
