'use client';

import type { MemberAccountSettingsResponse } from '@founderchatters/contracts';
import { Button } from '@founderchatters/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getAccountSettings } from '../../member/member-api';
import { OnboardingApiError } from '../../onboarding/onboarding-api';
import { DeleteAccountSheet } from './delete-account-sheet';

export function AccountSettingsClient() {
  const router = useRouter();
  const [payload, setPayload] = useState<MemberAccountSettingsResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getAccountSettings()
      .then((response) => {
        if (cancelled) return;
        setPayload(response);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'Account settings are unavailable.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="fc-settings-section-header">
        <p className="fc-label">Account</p>
        <h2>Account details</h2>
        <p>Your sign-in identity and current FounderChatters account state.</p>
      </header>

      {error ? (
        <p className="fc-settings-error" role="alert">
          {error}
        </p>
      ) : !payload ? (
        <p className="fc-settings-status">Loading account details…</p>
      ) : (
        <dl className="fc-settings-detail-list">
          <div>
            <dt>Email</dt>
            <dd>{payload.account.email}</dd>
          </div>
          <div>
            <dt>Email verification</dt>
            <dd>
              {payload.account.emailVerified ? 'Verified' : 'Not verified'}
            </dd>
          </div>
          <div>
            <dt>Account status</dt>
            <dd>
              {payload.account.status === 'ACTIVE'
                ? 'Active'
                : payload.account.status}
            </dd>
          </div>
        </dl>
      )}

      <aside className="fc-settings-note">
        Email changes, phone numbers, billing, and subscription preferences are
        not available in the current member settings contract.
      </aside>

      <section className="fc-settings-danger" aria-labelledby="delete-account">
        <p className="fc-label">Danger zone</p>
        <h3 id="delete-account">Delete account</h3>
        <p>
          Account access ends, every session is revoked, and your public
          identity is anonymized. Some historical records may remain in
          anonymized form for integrity. This implementation does not promise a
          legal retention period.
        </p>
        <Button
          onClick={() => setDeleteOpen(true)}
          type="button"
          variant="secondary"
        >
          Delete account
        </Button>
      </section>

      <DeleteAccountSheet
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          router.replace('/signin');
          router.refresh();
        }}
        open={deleteOpen}
      />
    </>
  );
}
