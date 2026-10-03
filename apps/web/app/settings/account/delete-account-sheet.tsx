'use client';

import { ACCOUNT_DELETION_CONFIRMATION } from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useEffect, useState } from 'react';

import { deleteMemberAccount } from '../../member/member-api';
import { OnboardingApiError } from '../../onboarding/onboarding-api';

export function DeleteAccountSheet({
  open,
  onClose,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function dismiss() {
    if (busy) return;
    setConfirmation('');
    setError(null);
    onClose();
  }

  useEffect(() => {
    if (!open || busy) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmation('');
        setError(null);
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  const canDelete = confirmation === ACCOUNT_DELETION_CONFIRMATION;

  async function submit() {
    if (busy || confirmation !== ACCOUNT_DELETION_CONFIRMATION) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMemberAccount({ confirmation });
      onDeleted();
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not delete that account.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fc-safety-overlay">
      <div
        aria-labelledby="delete-account-title"
        aria-modal="true"
        className="fc-safety-sheet"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            dismiss();
          }
        }}
        role="dialog"
      >
        <h2 id="delete-account-title">Delete your account?</h2>
        <p>
          This is destructive. Your account access ends and public history
          follows the product’s anonymization rules.
        </p>
        <div className="fc-settings-warning">
          <p className="fc-label">Before you delete</p>
          <p>
            Open conversations and contribution history may retain anonymized
            records where needed for integrity.
          </p>
        </div>
        {error ? (
          <p className="fc-settings-error" role="alert">
            {error}
          </p>
        ) : null}
        <Field
          autoFocus
          label="Type DELETE to confirm"
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="DELETE"
          value={confirmation}
        />
        <Button disabled={busy || !canDelete} onClick={() => void submit()}>
          {busy ? 'Deleting…' : 'Delete account'}
        </Button>
        <Button disabled={busy} onClick={dismiss} variant="secondary">
          Keep my account
        </Button>
        <p className="fc-settings-note">
          Implementation must require a deliberate confirmation step and audit
          the destructive action. Legal retention periods are not promised here.
        </p>
      </div>
    </div>
  );
}
