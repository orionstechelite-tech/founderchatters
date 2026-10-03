'use client';

import type {
  MemberProfileSettings,
  UpdateMemberProfileSettingsRequest,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useEffect, useState } from 'react';

import {
  getProfileSettings,
  updateProfileSettings,
} from '../../member/member-api';
import { OnboardingApiError } from '../../onboarding/onboarding-api';

const emptyProfile: MemberProfileSettings = {
  displayName: '',
  companyName: '',
  city: null,
  country: null,
  headline: null,
  bio: null,
};

export function ProfileSettingsClient() {
  const [profile, setProfile] = useState<MemberProfileSettings>(emptyProfile);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getProfileSettings()
      .then((response) => {
        if (cancelled) return;
        setProfile(response.profile);
        setLoaded(true);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'Profile settings are unavailable.',
        );
        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof MemberProfileSettings>(
    key: K,
    value: MemberProfileSettings[K],
  ) {
    setProfile((current) => ({
      ...current,
      [key]: value,
    }));
    setSaved(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setSaved(false);
    setError(null);
    setFieldErrors({});

    const body: UpdateMemberProfileSettingsRequest = {
      displayName: profile.displayName,
      companyName: profile.companyName,
      city: profile.city,
      country: profile.country,
      headline: profile.headline,
      bio: profile.bio,
    };

    try {
      const response = await updateProfileSettings(body);
      setProfile(response.profile);
      setSaved(true);
    } catch (cause: unknown) {
      if (cause instanceof OnboardingApiError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors);
      } else {
        setError('We could not save your profile settings.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p className="fc-settings-status">Loading profile settings…</p>;
  }

  return (
    <>
      <header className="fc-settings-section-header">
        <p className="fc-label">Profile</p>
        <h2>Founder profile</h2>
        <p>
          This is what other founders use to understand whether your experience
          is relevant.
        </p>
      </header>

      {error ? (
        <p className="fc-settings-error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="fc-settings-profile-form" onSubmit={submit}>
        <Field
          {...(fieldErrors.displayName?.[0]
            ? { error: fieldErrors.displayName[0] }
            : {})}
          label="Display name"
          maxLength={100}
          onChange={(event) => update('displayName', event.target.value)}
          required
          value={profile.displayName}
        />

        <Field
          {...(fieldErrors.companyName?.[0]
            ? { error: fieldErrors.companyName[0] }
            : {})}
          label="Company"
          maxLength={120}
          onChange={(event) => update('companyName', event.target.value)}
          required
          value={profile.companyName}
        />

        <Field
          {...(fieldErrors.city?.[0] ? { error: fieldErrors.city[0] } : {})}
          label="City"
          maxLength={100}
          onChange={(event) => update('city', event.target.value || null)}
          value={profile.city ?? ''}
        />

        <Field
          {...(fieldErrors.country?.[0]
            ? { error: fieldErrors.country[0] }
            : {})}
          label="Country"
          maxLength={100}
          onChange={(event) => update('country', event.target.value || null)}
          value={profile.country ?? ''}
        />

        <Field
          {...(fieldErrors.headline?.[0]
            ? { error: fieldErrors.headline[0] }
            : {})}
          label="Headline"
          maxLength={160}
          onChange={(event) => update('headline', event.target.value || null)}
          value={profile.headline ?? ''}
        />

        <Field
          {...(fieldErrors.bio?.[0] ? { error: fieldErrors.bio[0] } : {})}
          fieldType="textarea"
          label="Bio"
          maxLength={1000}
          onChange={(event) => update('bio', event.target.value || null)}
          rows={5}
          value={profile.bio ?? ''}
        />

        <div className="fc-settings-form-actions">
          <span aria-live="polite" className="fc-settings-save-status">
            {saved ? 'Changes saved.' : ''}
          </span>
          <Button disabled={saving} type="submit">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </>
  );
}
