'use client';

import type {
  MemberFounderProfile,
  MemberReputationResponse,
} from '@founderchatters/contracts';
import { Button } from '@founderchatters/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { OnboardingApiError } from '../../onboarding/onboarding-api';
import {
  getFounderProfile,
  getFounderReputation,
  saveFounder,
  unsaveFounder,
} from '../../member/member-api';
import { initialsFrom, profileMeta } from '../../member/member-format';
import { BlockSheet } from '../../safety/block-sheet';
import { ReportSheet } from '../../safety/report-sheet';

export function FounderProfileClient({ founderId }: { founderId: string }) {
  const [founder, setFounder] = useState<MemberFounderProfile | null>(null);
  const [reputation, setReputation] = useState<MemberReputationResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

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
    void getFounderReputation(founderId, { pageSize: 5 })
      .then((payload) => {
        if (cancelled) return;
        setReputation(payload);
      })
      .catch(() => {
        if (cancelled) return;
        setReputation(null);
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
            <Button
              onClick={() => setReportOpen(true)}
              type="button"
              variant="secondary"
            >
              Report founder
            </Button>
            <Button
              onClick={() => setBlockOpen(true)}
              type="button"
              variant="secondary"
            >
              Block founder
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

      <section
        className="fc-founder-section fc-founder-contribution"
        aria-labelledby="contribution-heading"
      >
        <h2 className="fc-label" id="contribution-heading">
          Contribution
        </h2>
        {reputation && reputation.summary.confirmedHelps > 0 ? (
          <>
            <p className="fc-founder-reputation-metrics">
              {reputation.summary.foundersHelped} founders helped ·{' '}
              {reputation.summary.introductions} introductions
            </p>
            {reputation.summary.helpfulTopics.length > 0 ? (
              <>
                <p className="fc-label">Most helpful in</p>
                <ul className="fc-founder-chips">
                  {reputation.summary.helpfulTopics.map((topic) => (
                    <li className="fc-founder-chip" key={topic.id}>
                      {topic.label}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {reputation.contributions.find((item) => item.thankYou) ? (
              <blockquote className="fc-founder-thankyou">
                “
                {
                  reputation.contributions.find((item) => item.thankYou)
                    ?.thankYou
                }
                ”
              </blockquote>
            ) : null}
            {reputation.contributions.length > 0 ? (
              <ul className="fc-contribution-list">
                {reputation.contributions.slice(0, 3).map((item) => (
                  <li className="fc-contribution-card" key={item.id}>
                    <p className="fc-contribution-card__kicker">{item.label}</p>
                    <p className="fc-contribution-card__title">
                      {item.confirmer
                        ? `Helped ${item.confirmer.displayName}`
                        : 'A founder confirmed this helped'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p>No confirmed contributions yet.</p>
        )}
        {founder.isSelf ? (
          <p>
            <Link className="fc-founder-reputation-link" href="/reputation">
              View reputation
            </Link>
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="fc-founder-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <ReportSheet
        onClose={() => setReportOpen(false)}
        open={reportOpen}
        targetId={founder.id}
        targetType="USER"
      />
      <BlockSheet
        founderId={founder.id}
        founderName={founder.displayName}
        onClose={() => setBlockOpen(false)}
        open={blockOpen}
      />
    </article>
  );
}
