'use client';

import type { MemberFounderProfile } from '@founderchatters/contracts';
import { Button } from '@founderchatters/ui';
import { useEffect, useState } from 'react';

import { OnboardingApiError } from '../../onboarding/onboarding-api';
import {
  getFounderProfile,
  saveFounder,
  unsaveFounder,
} from '../../member/member-api';
import { initialsFrom, profileMeta } from '../../member/member-format';

export function FounderProfileClient({ founderId }: { founderId: string }) {
  const [founder, setFounder] = useState<MemberFounderProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getFounderProfile(founderId)
      .then((payload) => {
        if (cancelled) return;
        setFounder(payload.founder);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'That founder is not available.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [founderId]);

  async function toggleSave() {
    if (!founder || founder.isSelf || busy) return;
    setBusy(true);
    try {
      const result = founder.savedByMe
        ? await unsaveFounder(founder.id)
        : await saveFounder(founder.id);
      setFounder({ ...founder, savedByMe: result.saved });
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not update this saved founder.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (error && !founder) {
    return (
      <div className="fc-founder-profile-state" role="alert">
        <h1>Founder unavailable</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!founder) {
    return <p className="fc-discover-status">Loading founder profile…</p>;
  }

  const helpItems = [
    ...founder.expertise.map((topic) => topic.label),
    founder.customExpertise,
  ].filter((value): value is string => Boolean(value?.trim()));
  const needLabels = founder.needs.map((topic) => topic.label);
  const meta = profileMeta(founder);
  const title = founder.headline ?? founder.displayName;

  return (
    <article className="fc-founder-profile">
      <section className="fc-founder-hero">
        {founder.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="fc-founder-avatar" src={founder.avatarUrl} />
        ) : (
          <span aria-hidden="true" className="fc-founder-avatar">
            {initialsFrom(founder.displayName)}
          </span>
        )}
        <div className="fc-founder-hero__copy">
          {founder.headline ? (
            <p className="fc-label">{founder.displayName}</p>
          ) : null}
          <h1>{title}</h1>
          <p className="fc-founder-company">{founder.company.name}</p>
          {meta ? <p className="fc-founder-meta">{meta}</p> : null}
          {founder.company.description ? (
            <p className="fc-founder-summary">{founder.company.description}</p>
          ) : null}
          {founder.memberSinceYear ? (
            <p className="fc-founder-since">
              Member since {founder.memberSinceYear}
            </p>
          ) : null}
        </div>
        {founder.isSelf ? null : (
          <div className="fc-founder-hero__actions">
            <Button
              aria-pressed={founder.savedByMe}
              disabled={busy}
              onClick={() => void toggleSave()}
              type="button"
              variant={founder.savedByMe ? 'primary' : 'secondary'}
            >
              {founder.savedByMe ? 'Saved' : 'Save founder'}
            </Button>
          </div>
        )}
      </section>

      {founder.bio ? (
        <section className="fc-founder-section" aria-labelledby="about-heading">
          <h2 className="fc-label" id="about-heading">
            About
          </h2>
          <p>{founder.bio}</p>
        </section>
      ) : null}

      {helpItems.length > 0 ? (
        <section className="fc-founder-section" aria-labelledby="help-heading">
          <h2 className="fc-label" id="help-heading">
            Can help with
          </h2>
          <ul className="fc-founder-chips">
            {helpItems.map((label, index) => (
              <li
                className={
                  index === 0
                    ? 'fc-founder-chip fc-founder-chip--emphasis'
                    : 'fc-founder-chip'
                }
                key={label}
              >
                {label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {founder.currentNeedText || needLabels.length > 0 ? (
        <section className="fc-founder-section" aria-labelledby="need-heading">
          <h2 className="fc-label" id="need-heading">
            Currently looking for
          </h2>
          {founder.currentNeedText ? <p>{founder.currentNeedText}</p> : null}
          {needLabels.length > 0 ? (
            <p className="fc-founder-need-topics">{needLabels.join(' · ')}</p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p className="fc-founder-inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
