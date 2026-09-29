'use client';

import type {
  MemberRequest,
  MemberRequestAuthor,
  MemberTopicRef,
  RequestType,
  RequestUrgency,
} from '@founderchatters/contracts';
import {
  REQUEST_TYPES,
  REQUEST_URGENCIES,
  REQUEST_URGENCY_LABELS,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

import { OnboardingApiError } from '../onboarding/onboarding-api';
import {
  createRequest,
  getFounderProfile,
  listOwnRequests,
  patchRequest,
  publishRequest,
} from '../member/member-api';
import { initialsFrom, requestAuthorMeta } from '../member/member-format';

type FormState = {
  type: RequestType;
  headline: string;
  context: string;
  whoCouldHelp: string;
  urgency: RequestUrgency | null;
  topicIds: string[];
};

const emptyForm: FormState = {
  type: REQUEST_TYPES.ask,
  headline: '',
  context: '',
  whoCouldHelp: '',
  urgency: null,
  topicIds: [],
};

const REQUEST_TYPE_VALUES = Object.values(REQUEST_TYPES);
const URGENCY_VALUES = Object.values(REQUEST_URGENCIES);

export function AskClient({ viewerId }: { viewerId: string }) {
  const router = useRouter();
  const titleId = useId();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [topics, setTopics] = useState<MemberTopicRef[]>([]);
  const [author, setAuthor] = useState<MemberRequestAuthor | null>(null);
  const [mode, setMode] = useState<'compose' | 'preview'>('compose');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listOwnRequests('DRAFT'), getFounderProfile(viewerId)])
      .then(([own, profile]) => {
        if (cancelled) return;
        const draft = own.requests[0] ?? null;
        setTopics(own.availableTopics);
        setAuthor({
          id: profile.founder.id,
          displayName: profile.founder.displayName,
          avatarUrl: profile.founder.avatarUrl,
          companyName: profile.founder.company.name,
          city: profile.founder.city,
          country: profile.founder.country,
        });
        if (draft) {
          setDraftId(draft.id);
          setForm(formFromRequest(draft));
        }
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(messageFrom(cause, 'We could not load your request.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleTopic(id: string) {
    setForm((current) => {
      if (current.topicIds.includes(id)) {
        return {
          ...current,
          topicIds: current.topicIds.filter((topicId) => topicId !== id),
        };
      }
      if (current.topicIds.length >= 3) return current;
      return { ...current, topicIds: [...current.topicIds, id] };
    });
  }

  async function persist(): Promise<MemberRequest> {
    const body = toBody(form);
    if (!draftId) {
      try {
        const created = await createRequest(body);
        setDraftId(created.request.id);
        return created.request;
      } catch (cause: unknown) {
        if (
          cause instanceof OnboardingApiError &&
          cause.code === 'REQUEST_INVALID_STATE'
        ) {
          const own = await listOwnRequests('DRAFT');
          const existing = own.requests[0];
          if (!existing) throw cause;
          const patched = await patchRequest(existing.id, body);
          setDraftId(existing.id);
          return patched.request;
        }
        throw cause;
      }
    }
    const patched = await patchRequest(draftId, body);
    return patched.request;
  }

  async function saveDraft() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await persist();
      setStatus('Draft saved.');
    } catch (cause: unknown) {
      applyError(cause, 'We could not save this draft.');
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await persist();
      setMode('preview');
      setStatus(null);
    } catch (cause: unknown) {
      applyError(cause, 'We could not preview this request.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const saved = await persist();
      const published = await publishRequest(saved.id);
      router.push(`/requests/${published.request.id}`);
    } catch (cause: unknown) {
      applyError(cause, 'We could not publish this request.');
    } finally {
      setBusy(false);
    }
  }

  function applyError(cause: unknown, fallback: string) {
    if (cause instanceof OnboardingApiError) {
      setError(cause.message);
      setFieldErrors(cause.fieldErrors);
      return;
    }
    setError(fallback);
  }

  if (loading) {
    return <p className="fc-discover-status">Loading your request…</p>;
  }

  if (error && topics.length === 0 && !draftId && form.headline === '') {
    return (
      <div className="fc-discover-state" role="alert">
        <h1>Request unavailable</h1>
        <p>{error}</p>
      </div>
    );
  }

  const selectedTopics = topics.filter((topic) =>
    form.topicIds.includes(topic.id),
  );

  return (
    <div className="fc-ask">
      <section className="fc-ask-hero">
        <div>
          <p className="fc-label">Ask</p>
          <h1 id={titleId}>
            {mode === 'preview'
              ? 'Preview before publishing.'
              : 'Ask for the kind of help another founder can actually give.'}
          </h1>
          <p>
            {mode === 'preview'
              ? 'This is exactly how other founders will read your request.'
              : 'Clear asks get better responses. Tell people what you need, what you’ve tried, and who could be useful.'}
          </p>
        </div>
      </section>

      {error ? (
        <p className="fc-ask-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="fc-ask-live" aria-live="polite">
        {status}
      </p>

      {mode === 'compose' ? (
        <div className="fc-ask-layout">
          <form
            aria-labelledby={titleId}
            className="fc-ask-form"
            onSubmit={(event) => {
              event.preventDefault();
              void preview();
            }}
          >
            <fieldset className="fc-ask-fieldset">
              <legend className="fc-label">Request type</legend>
              <div className="fc-ask-chips">
                {REQUEST_TYPE_VALUES.map((type) => (
                  <button
                    aria-label={type}
                    aria-pressed={form.type === type}
                    className="fc-ask-chip"
                    key={type}
                    onClick={() => update('type', type)}
                    type="button"
                  >
                    <span className="fc-ask-chip-full">{type}</span>
                    <span className="fc-ask-chip-short">
                      {type === REQUEST_TYPES.introduction ? 'INTRO' : type}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <Field
              error={fieldErrors.headline?.[0] ?? ''}
              label="Headline"
              onChange={(event) => update('headline', event.target.value)}
              placeholder="Looking for someone who has launched B2B SaaS in the UAE"
              value={form.headline}
            />
            <Field
              error={fieldErrors.context?.[0] ?? ''}
              fieldType="textarea"
              label="Context"
              onChange={(event) => update('context', event.target.value)}
              placeholder="We’re entering the UAE next quarter. I’d love to hear how founders found their first channel or local distribution partners, and what they would avoid doing again."
              value={form.context}
            />
            <Field
              error={fieldErrors.whoCouldHelp?.[0] ?? ''}
              label="Who could help?"
              onChange={(event) => update('whoCouldHelp', event.target.value)}
              placeholder="Founders with UAE / MENA B2B GTM experience"
              value={form.whoCouldHelp}
            />

            <fieldset className="fc-ask-fieldset">
              <legend className="fc-label">Topics</legend>
              <p className="fc-ask-hint">Optional. Choose up to 3.</p>
              <div className="fc-ask-chips">
                {topics.map((topic) => (
                  <button
                    aria-pressed={form.topicIds.includes(topic.id)}
                    className="fc-ask-chip"
                    key={topic.id}
                    onClick={() => toggleTopic(topic.id)}
                    type="button"
                  >
                    {topic.label}
                  </button>
                ))}
              </div>
              {fieldErrors.topicIds?.[0] ? (
                <p className="fc-field__message fc-field__message--error">
                  {fieldErrors.topicIds[0]}
                </p>
              ) : null}
            </fieldset>

            <fieldset className="fc-ask-fieldset">
              <legend className="fc-label">Urgency</legend>
              <div className="fc-ask-chips">
                {URGENCY_VALUES.map((value) => (
                  <button
                    aria-pressed={form.urgency === value}
                    className="fc-ask-chip"
                    key={value}
                    onClick={() => update('urgency', value)}
                    type="button"
                  >
                    {REQUEST_URGENCY_LABELS[value]}
                  </button>
                ))}
              </div>
              {fieldErrors.urgency?.[0] ? (
                <p className="fc-field__message fc-field__message--error">
                  {fieldErrors.urgency[0]}
                </p>
              ) : null}
            </fieldset>

            <div className="fc-ask-actions">
              <Button disabled={busy} type="submit">
                Preview request
              </Button>
              <Button
                disabled={busy}
                onClick={() => void saveDraft()}
                type="button"
                variant="secondary"
              >
                Save draft
              </Button>
            </div>
          </form>
          <aside className="fc-ask-note">
            <h2>A strong ask is specific.</h2>
            <p>Good:</p>
            <ul>
              <li>clear problem</li>
              <li>enough context</li>
              <li>who could help</li>
              <li>useful timeframe</li>
            </ul>
            <p>Avoid:</p>
            <ul>
              <li>vague networking requests</li>
              <li>sales pitches</li>
              <li>promotional posts</li>
            </ul>
          </aside>
        </div>
      ) : (
        <div className="fc-ask-preview">
          <RequestPreviewCard
            author={author}
            form={form}
            topics={selectedTopics}
          />
          <div className="fc-ask-actions">
            <Button
              disabled={busy}
              onClick={() => void publish()}
              type="button"
            >
              Publish request
            </Button>
            <Button
              disabled={busy}
              onClick={() => setMode('compose')}
              type="button"
              variant="secondary"
            >
              Edit request
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestPreviewCard({
  author,
  form,
  topics,
}: {
  author: MemberRequestAuthor | null;
  form: FormState;
  topics: MemberTopicRef[];
}) {
  const meta = author ? requestAuthorMeta(author) : '';
  return (
    <article className="fc-request-preview">
      <p className="fc-request-type-pill">{form.type}</p>
      <div className="fc-request-identity">
        {author?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="fc-request-avatar" src={author.avatarUrl} />
        ) : (
          <span aria-hidden="true" className="fc-request-avatar">
            {initialsFrom(author?.displayName ?? 'FC')}
          </span>
        )}
        <div>
          <p className="fc-request-name">{author?.displayName ?? 'You'}</p>
          {meta ? <p className="fc-request-meta">{meta}</p> : null}
        </div>
      </div>
      <h2>{form.headline || 'Untitled request'}</h2>
      <p className="fc-request-context">{form.context}</p>
      {form.whoCouldHelp ? (
        <p className="fc-request-help">{form.whoCouldHelp}</p>
      ) : null}
      <ul className="fc-request-chips">
        {topics.map((topic) => (
          <li key={topic.id}>{topic.label}</li>
        ))}
        {form.urgency ? <li>{REQUEST_URGENCY_LABELS[form.urgency]}</li> : null}
      </ul>
    </article>
  );
}

function formFromRequest(request: MemberRequest): FormState {
  return {
    type: request.type,
    headline: request.headline,
    context: request.context,
    whoCouldHelp: request.whoCouldHelp ?? '',
    urgency: request.urgency,
    topicIds: request.topics.map((topic) => topic.id),
  };
}

function toBody(form: FormState) {
  return {
    type: form.type,
    headline: form.headline,
    context: form.context,
    whoCouldHelp: form.whoCouldHelp,
    urgency: form.urgency,
    topicIds: form.topicIds,
  };
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof OnboardingApiError ? cause.message : fallback;
}
