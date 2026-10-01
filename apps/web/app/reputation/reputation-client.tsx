'use client';

import type { MemberReputationResponse } from '@founderchatters/contracts';
import { Button } from '@founderchatters/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { OnboardingApiError } from '../onboarding/onboarding-api';
import { getMyReputation } from '../member/member-api';

function confirmerLine(
  item: MemberReputationResponse['contributions'][number],
) {
  if (item.confirmer?.displayName) {
    return `${item.confirmer.displayName} confirmed this helped`;
  }
  return 'A founder confirmed this helped';
}

export function ReputationClient() {
  const [payload, setPayload] = useState<MemberReputationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    void getMyReputation({ page })
      .then((next) => {
        if (cancelled) return;
        setPayload(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'Reputation is unavailable.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  if (error && !payload) {
    return (
      <div className="fc-reputation-state" role="alert">
        <h1>Reputation unavailable</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!payload) {
    return <p className="fc-discover-status">Loading reputation…</p>;
  }

  const empty = payload.summary.confirmedHelps === 0;

  return (
    <article className="fc-reputation">
      <header className="fc-reputation-hero">
        <p className="fc-label">Reputation</p>
        <h1>{payload.founder.displayName}</h1>
        <p className="fc-reputation-lead">
          Only explicitly confirmed help appears here.
        </p>
        <p className="fc-reputation-metrics">
          <strong>{payload.summary.foundersHelped}</strong> founders helped
          <span aria-hidden="true"> · </span>
          <strong>{payload.summary.introductions}</strong> introductions
        </p>
      </header>

      {empty ? (
        <section className="fc-reputation-empty">
          <h2>No confirmed contributions yet</h2>
          <p>
            Your contribution history appears here when another founder
            explicitly confirms that your help moved them forward.
          </p>
          <Link
            className="fc-button fc-button--medium fc-button--primary"
            href="/home"
          >
            Help another founder
          </Link>
        </section>
      ) : (
        <>
          <section className="fc-reputation-summary">
            <p className="fc-label">Helpful in</p>
            {payload.summary.helpfulTopics.length > 0 ? (
              <ul className="fc-founder-chips">
                {payload.summary.helpfulTopics.map((topic) => (
                  <li className="fc-founder-chip" key={topic.id}>
                    {topic.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No topic recognition yet.</p>
            )}
            <dl className="fc-reputation-snapshot">
              <div>
                <dt>Confirmed helps</dt>
                <dd>{payload.summary.confirmedHelps}</dd>
              </div>
              <div>
                <dt>Introductions</dt>
                <dd>{payload.summary.introductions}</dd>
              </div>
              {payload.summary.mostRecognizedTopic ? (
                <div>
                  <dt>Most-recognized expertise</dt>
                  <dd>{payload.summary.mostRecognizedTopic.label}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="fc-reputation-history">
            <p className="fc-label">Contribution history</p>
            <ul className="fc-contribution-list">
              {payload.contributions.map((item) => (
                <li className="fc-contribution-card" key={item.id}>
                  <p className="fc-contribution-card__kicker">{item.label}</p>
                  <p className="fc-contribution-card__title">
                    {item.confirmer
                      ? `Helped ${item.confirmer.displayName}`
                      : 'A founder confirmed this helped'}
                  </p>
                  {item.topics.length > 0 ? (
                    <p className="fc-contribution-card__topics">
                      {item.topics.map((topic) => topic.label).join(' · ')}
                    </p>
                  ) : null}
                  {item.thankYou ? (
                    <p className="fc-contribution-card__note">
                      “{item.thankYou}”
                    </p>
                  ) : null}
                  <p className="fc-contribution-card__meta">
                    {confirmerLine(item)}
                  </p>
                </li>
              ))}
            </ul>
            {payload.totalPages > 1 ? (
              <div className="fc-reputation-pagination">
                <Button
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  type="button"
                  variant="secondary"
                >
                  Previous
                </Button>
                <p>
                  Page {payload.page} of {payload.totalPages}
                </p>
                <Button
                  disabled={page >= payload.totalPages}
                  onClick={() =>
                    setPage((current) =>
                      Math.min(payload.totalPages, current + 1),
                    )
                  }
                  type="button"
                  variant="secondary"
                >
                  Next
                </Button>
              </div>
            ) : null}
          </section>
        </>
      )}

      <p className="fc-reputation-contract">
        Still talking creates no reputation. Topic history is preserved after
        request resolution.
      </p>
      {error ? (
        <p className="fc-ask-error" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
