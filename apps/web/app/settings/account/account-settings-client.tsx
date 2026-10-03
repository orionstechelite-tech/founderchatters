'use client';

import type { MemberAccountSettingsResponse } from '@founderchatters/contracts';
import { useEffect, useState } from 'react';

import { getAccountSettings } from '../../member/member-api';
import { OnboardingApiError } from '../../onboarding/onboarding-api';

export function AccountSettingsClient() {
  const [payload, setPayload] = useState<MemberAccountSettingsResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

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
    </>
  );
}
