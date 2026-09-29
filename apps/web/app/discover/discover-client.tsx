'use client';

import type { DiscoverFoundersResponse } from '@founderchatters/contracts';
import { Button, Field, FounderCard } from '@founderchatters/ui';
import { useEffect, useId, useRef, useState } from 'react';

import { OnboardingApiError } from '../onboarding/onboarding-api';
import { listFounders } from '../member/member-api';
import {
  canHelpSummary,
  discoverMeta,
  initialsFrom,
} from '../member/member-format';

type Filters = {
  country: string | null;
  industry: string | null;
  stage: string | null;
  expertiseTopicId: string | null;
  saved: boolean | null;
};

const emptyFilters: Filters = {
  country: null,
  industry: null,
  stage: null,
  expertiseTopicId: null,
  saved: null,
};

function padIndex(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function DiscoverClient() {
  const searchId = useId();
  const titleId = useId();
  const sheetTitleId = useId();
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DiscoverFoundersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listFounders({
      page,
      ...filters,
      ...(submittedQuery ? { q: submittedQuery } : {}),
    })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'We could not load founders. Please try again.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, page, reload, submittedQuery]);

  const b2bTopic = data?.expertiseTopics?.find(
    (topic) => topic.label === 'B2B sales',
  );
  const hasFilters =
    Boolean(filters.country) ||
    Boolean(filters.industry) ||
    Boolean(filters.stage) ||
    Boolean(filters.expertiseTopicId) ||
    filters.saved === true;

  function applyFilters(next: Filters) {
    setLoading(true);
    setPage(1);
    setFilters(next);
  }

  function openSheet() {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.showModal();
    const firstField = sheet.querySelector<HTMLElement>(
      'input, select, button',
    );
    firstField?.focus();
  }

  function closeSheet() {
    sheetRef.current?.close();
    filtersButtonRef.current?.focus();
  }

  return (
    <div className="fc-discover">
      <section className="fc-discover-hero" aria-labelledby={titleId}>
        <div>
          <p className="fc-label">Discover founders</p>
          <h1 id={titleId}>
            Find someone who has
            <br />
            actually done it.
          </h1>
          <p>
            Search by experience, geography, industry, or stage — then decide
            from context, not follower counts.
          </p>
        </div>
        <form
          className="fc-discover-search"
          onSubmit={(event) => {
            event.preventDefault();
            setLoading(true);
            setPage(1);
            setSubmittedQuery(query.trim());
          }}
        >
          <Field
            className="fc-discover-search-field"
            id={searchId}
            label="Search founders"
            name="q"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search founders, expertise, places…"
            value={query}
          />
        </form>
      </section>

      <div className="fc-discover-toolbar">
        <p className="fc-label">Filters</p>
        <div
          className="fc-discover-chips"
          role="group"
          aria-label="Quick filters"
        >
          <Chip
            pressed={!hasFilters}
            onClick={() => applyFilters(emptyFilters)}
          >
            All founders
          </Chip>
          <Chip
            pressed={filters.country === 'UAE'}
            onClick={() =>
              applyFilters({
                ...filters,
                country: filters.country === 'UAE' ? null : 'UAE',
              })
            }
          >
            UAE
          </Chip>
          <Chip
            pressed={filters.industry === 'Marketplace'}
            onClick={() =>
              applyFilters({
                ...filters,
                industry:
                  filters.industry === 'Marketplace' ? null : 'Marketplace',
              })
            }
          >
            Marketplace
          </Chip>
          <Chip
            pressed={filters.stage === 'Seed'}
            onClick={() =>
              applyFilters({
                ...filters,
                stage: filters.stage === 'Seed' ? null : 'Seed',
              })
            }
          >
            Seed
          </Chip>
          {b2bTopic ? (
            <Chip
              pressed={filters.expertiseTopicId === b2bTopic.id}
              onClick={() =>
                applyFilters({
                  ...filters,
                  expertiseTopicId:
                    filters.expertiseTopicId === b2bTopic.id
                      ? null
                      : b2bTopic.id,
                })
              }
            >
              B2B sales
            </Chip>
          ) : null}
          <Chip
            pressed={filters.saved === true}
            onClick={() =>
              applyFilters({
                ...filters,
                saved: filters.saved === true ? null : true,
              })
            }
          >
            {`Saved${data ? ` · ${String(data.savedCount)}` : ''}`}
          </Chip>
        </div>
        <button
          className="fc-button fc-button--medium fc-button--secondary fc-discover-filters-trigger"
          onClick={openSheet}
          ref={filtersButtonRef}
          type="button"
        >
          Filters
        </button>
      </div>

      <div className="fc-discover-layout">
        <section aria-labelledby="founders-heading">
          <p className="fc-label" id="founders-heading">
            Founders
          </p>
          {loading ? (
            <p className="fc-discover-status">Loading founders…</p>
          ) : error ? (
            <div className="fc-discover-state" role="alert">
              <p>{error}</p>
              <Button
                onClick={() => {
                  setLoading(true);
                  setReload((current) => current + 1);
                }}
                type="button"
              >
                Try again
              </Button>
            </div>
          ) : data && data.founders.length === 0 ? (
            <div className="fc-discover-state">
              <p>
                {hasFilters || submittedQuery
                  ? 'No founders match these filters.'
                  : 'No founders to discover yet.'}
              </p>
            </div>
          ) : (
            <ol className="fc-discover-list">
              {data?.founders.map((founder, index) => (
                <li key={founder.id}>
                  <FounderCard className="fc-discover-row">
                    <span className="fc-discover-index" aria-hidden="true">
                      {padIndex((data.page - 1) * data.pageSize + index)}
                    </span>
                    {founder.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="fc-discover-avatar"
                        src={founder.avatarUrl}
                      />
                    ) : (
                      <span className="fc-discover-avatar" aria-hidden="true">
                        {initialsFrom(founder.displayName)}
                      </span>
                    )}
                    <div className="fc-discover-identity">
                      <h2>{founder.displayName}</h2>
                      <p>{discoverMeta(founder)}</p>
                    </div>
                    <p className="fc-discover-help">
                      {canHelpSummary(founder) ?? ' '}
                    </p>
                    <a
                      className="fc-discover-view"
                      href={`/founders/${founder.id}`}
                    >
                      <span className="fc-discover-view-desktop">
                        View profile
                      </span>
                      <span className="fc-discover-view-mobile">View →</span>
                    </a>
                  </FounderCard>
                </li>
              ))}
            </ol>
          )}
          {data && data.totalPages > 1 ? (
            <div className="fc-discover-pagination">
              <Button
                disabled={data.page <= 1}
                onClick={() => {
                  setLoading(true);
                  setPage((current) => Math.max(1, current - 1));
                }}
                type="button"
                variant="secondary"
              >
                Previous
              </Button>
              <p>
                Page {data.page} of {data.totalPages}
              </p>
              <Button
                disabled={data.page >= data.totalPages}
                onClick={() => {
                  setLoading(true);
                  setPage((current) => current + 1);
                }}
                type="button"
                variant="secondary"
              >
                Next
              </Button>
            </div>
          ) : null}
        </section>
        <aside className="fc-discover-note">
          <p className="fc-label">Why this feels different</p>
          <h2>No follower counts.</h2>
          <p>
            Profiles lead with what someone has built, what they can help with,
            and how they’ve contributed.
          </p>
          <p className="fc-discover-saved-count">
            Saved founders {data ? data.savedCount : 0}
          </p>
        </aside>
      </div>

      <dialog
        aria-labelledby={sheetTitleId}
        aria-modal="true"
        className="fc-filter-sheet"
        onCancel={(event) => {
          event.preventDefault();
          closeSheet();
        }}
        onClose={() => filtersButtonRef.current?.focus()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeSheet();
          }
        }}
        ref={sheetRef}
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            applyFilters({
              country: textValue(form.get('country')),
              industry: textValue(form.get('industry')),
              stage: textValue(form.get('stage')),
              expertiseTopicId: textValue(form.get('expertiseTopicId')),
              saved: form.get('saved') === 'true' ? true : null,
            });
            closeSheet();
          }}
        >
          <div className="fc-filter-sheet__header">
            <h2 id={sheetTitleId}>Filters</h2>
            <Button onClick={closeSheet} type="button" variant="secondary">
              Close
            </Button>
          </div>
          <Field
            label="Country"
            name="country"
            defaultValue={filters.country ?? ''}
          />
          <Field
            label="Industry"
            name="industry"
            defaultValue={filters.industry ?? ''}
          />
          <Field
            label="Stage"
            name="stage"
            defaultValue={filters.stage ?? ''}
          />
          <div className="fc-field">
            <label
              className="fc-field__label"
              htmlFor={`${searchId}-expertise`}
            >
              Expertise
            </label>
            <select
              className="fc-field__control"
              defaultValue={filters.expertiseTopicId ?? ''}
              id={`${searchId}-expertise`}
              name="expertiseTopicId"
            >
              <option value="">Any expertise</option>
              {(data?.expertiseTopics ?? []).map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.label}
                </option>
              ))}
            </select>
          </div>
          <label className="fc-filter-sheet__saved">
            <input
              defaultChecked={filters.saved === true}
              name="saved"
              type="checkbox"
              value="true"
            />
            Saved founders only
          </label>
          <div className="fc-filter-sheet__actions">
            <Button
              onClick={() => {
                applyFilters(emptyFilters);
                closeSheet();
              }}
              type="button"
              variant="secondary"
            >
              Clear
            </Button>
            <Button type="submit">Apply filters</Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function Chip({
  children,
  onClick,
  pressed,
}: {
  children: string;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <button
      aria-pressed={pressed}
      className="fc-discover-chip"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function textValue(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
