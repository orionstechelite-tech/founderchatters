'use client';

import type {
  MemberRequest,
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
import { useEffect, useId, useRef, useState } from 'react';

import { OnboardingApiError } from '../../onboarding/onboarding-api';
import {
  deleteRequest,
  getRequest,
  patchRequest,
  resolveRequest,
} from '../../member/member-api';
import {
  initialsFrom,
  memberRequestUrl,
  requestAuthorMeta,
} from '../../member/member-format';
import { BlockSheet } from '../../safety/block-sheet';
import { ReportSheet } from '../../safety/report-sheet';
import { RequestHelpThread } from './request-help-client';

export function RequestDetailClient({
  requestId,
  viewerId,
}: {
  requestId: string;
  viewerId: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const dialogTitleId = useId();
  const deleteButtonRef = useRef<HTMLSpanElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<MemberRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [safety, setSafety] = useState<
    'report-request' | 'report-founder' | 'block' | null
  >(null);
  const [form, setForm] = useState({
    type: REQUEST_TYPES.ask as RequestType,
    headline: '',
    context: '',
    whoCouldHelp: '',
    urgency: null as RequestUrgency | null,
    topicIds: [] as string[],
  });

  useEffect(() => {
    let cancelled = false;
    void getRequest(requestId)
      .then((payload) => {
        if (cancelled) return;
        setRequest(payload.request);
        setForm({
          type: payload.request.type,
          headline: payload.request.headline,
          context: payload.request.context,
          whoCouldHelp: payload.request.whoCouldHelp ?? '',
          urgency: payload.request.urgency,
          topicIds: payload.request.topics.map((topic) => topic.id),
        });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setRequest(null);
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'That request is not available.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const isOwner = request?.author.id === viewerId;
  const canEdit =
    isOwner && request?.status === 'PUBLISHED' && request.responseCount === 0;

  function openDelete() {
    dialogRef.current?.showModal();
  }

  function closeDelete() {
    dialogRef.current?.close();
  }

  async function share() {
    const url = memberRequestUrl(requestId);
    try {
      await navigator.clipboard.writeText(url);
      setStatus(`Link copied. ${url}`);
    } catch {
      setStatus(
        'Could not copy the link. You can copy it from the address bar.',
      );
    }
  }

  async function markResolved() {
    if (!request || busy) return;
    setBusy(true);
    try {
      const payload = await resolveRequest(request.id);
      setRequest(payload.request);
      setStatus('Request marked resolved.');
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not resolve this request.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!request || busy) return;
    setBusy(true);
    try {
      await deleteRequest(request.id);
      closeDelete();
      router.push('/ask');
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not delete this request.',
      );
      closeDelete();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!request || busy) return;
    setBusy(true);
    setFieldErrors({});
    try {
      const payload = await patchRequest(request.id, {
        type: form.type,
        headline: form.headline,
        context: form.context,
        whoCouldHelp: form.whoCouldHelp,
        urgency: form.urgency,
        topicIds: form.topicIds,
      });
      setRequest(payload.request);
      setEditing(false);
      setError(null);
      setStatus('Request updated.');
    } catch (cause: unknown) {
      if (cause instanceof OnboardingApiError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors);
      } else {
        setError('We could not update this request.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (error && !request) {
    return (
      <div className="fc-discover-state" role="alert">
        <h1>Request unavailable</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!request) {
    return <p className="fc-discover-status">Loading request…</p>;
  }

  const heroTitle =
    isOwner && request.status === 'PUBLISHED'
      ? 'Your request is live.'
      : request.status === 'RESOLVED'
        ? 'Resolved request'
        : 'Request';
  const heroCopy =
    isOwner && request.status === 'PUBLISHED'
      ? 'Responses stay attached to the actual problem so public advice, private help and introductions retain context.'
      : 'A founder request in the FounderChatters network.';
  const statusLabel = request.status === 'RESOLVED' ? 'Resolved' : 'Open';

  return (
    <div className="fc-request-detail">
      <section className="fc-ask-hero">
        <div>
          <p className="fc-label">Request</p>
          <h1 id={titleId}>{heroTitle}</h1>
          <p>{heroCopy}</p>
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

      <div className="fc-request-detail-layout">
        <article className="fc-request-main">
          <div className="fc-request-identity">
            {request.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="fc-request-avatar"
                src={request.author.avatarUrl}
              />
            ) : (
              <span aria-hidden="true" className="fc-request-avatar">
                {initialsFrom(request.author.displayName)}
              </span>
            )}
            <div>
              <p className="fc-request-name">{request.author.displayName}</p>
              <p className="fc-request-meta">
                {requestAuthorMeta(request.author)}
              </p>
            </div>
          </div>

          {editing ? (
            <form
              className="fc-ask-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdit();
              }}
            >
              <fieldset className="fc-ask-fieldset">
                <legend className="fc-label">Request type</legend>
                <div className="fc-ask-chips">
                  {Object.values(REQUEST_TYPES).map((type) => (
                    <button
                      aria-pressed={form.type === type}
                      className="fc-ask-chip"
                      key={type}
                      onClick={() => setForm({ ...form, type })}
                      type="button"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Field
                error={fieldErrors.headline?.[0] ?? ''}
                label="Headline"
                onChange={(event) =>
                  setForm({ ...form, headline: event.target.value })
                }
                value={form.headline}
              />
              <Field
                error={fieldErrors.context?.[0] ?? ''}
                fieldType="textarea"
                label="Context"
                onChange={(event) =>
                  setForm({ ...form, context: event.target.value })
                }
                value={form.context}
              />
              <Field
                error={fieldErrors.whoCouldHelp?.[0] ?? ''}
                label="Who could help?"
                onChange={(event) =>
                  setForm({ ...form, whoCouldHelp: event.target.value })
                }
                value={form.whoCouldHelp}
              />
              <fieldset className="fc-ask-fieldset">
                <legend className="fc-label">Urgency</legend>
                <div className="fc-ask-chips">
                  {Object.values(REQUEST_URGENCIES).map((value) => (
                    <button
                      aria-pressed={form.urgency === value}
                      className="fc-ask-chip"
                      key={value}
                      onClick={() => setForm({ ...form, urgency: value })}
                      type="button"
                    >
                      {REQUEST_URGENCY_LABELS[value]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="fc-ask-actions">
                <Button disabled={busy} type="submit">
                  Save changes
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => setEditing(false)}
                  type="button"
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <h2 className="fc-request-headline">{request.headline}</h2>
              <p className="fc-request-context">{request.context}</p>
              {request.whoCouldHelp ? (
                <p className="fc-request-help">{request.whoCouldHelp}</p>
              ) : null}
              <ul className="fc-request-chips">
                {request.topics.map((topic) => (
                  <li key={topic.id}>{topic.label}</li>
                ))}
                {request.urgency ? (
                  <li>{REQUEST_URGENCY_LABELS[request.urgency]}</li>
                ) : null}
              </ul>
            </>
          )}

          <RequestHelpThread
            isOwner={isOwner}
            request={request}
            viewerId={viewerId}
          />
        </article>

        <aside className="fc-request-sidebar">
          <p className="fc-label">Request status</p>
          <p className="fc-request-status">{statusLabel}</p>
          <p>
            Visible to active members in the network. This page does not rank or
            match founders automatically.
          </p>
          {isOwner ? (
            <>
              <hr />
              <p className="fc-label">Useful actions</p>
              <div className="fc-request-actions">
                {canEdit && !editing ? (
                  <Button
                    onClick={() => setEditing(true)}
                    type="button"
                    variant="secondary"
                  >
                    Edit request
                  </Button>
                ) : null}
                {request.status === 'PUBLISHED' ? (
                  <Button
                    disabled={busy}
                    onClick={() => void markResolved()}
                    type="button"
                    variant="secondary"
                  >
                    Mark resolved
                  </Button>
                ) : null}
                <Button
                  onClick={() => void share()}
                  type="button"
                  variant="secondary"
                >
                  Share request
                </Button>
                {request.status === 'PUBLISHED' ? (
                  <span ref={deleteButtonRef}>
                    <Button
                      onClick={openDelete}
                      type="button"
                      variant="secondary"
                    >
                      Delete request
                    </Button>
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <hr />
              <p className="fc-label">Safety</p>
              <div className="fc-request-actions">
                <Button
                  onClick={() => setSafety('report-request')}
                  type="button"
                  variant="secondary"
                >
                  Report request
                </Button>
                <Button
                  onClick={() => setSafety('report-founder')}
                  type="button"
                  variant="secondary"
                >
                  Report founder
                </Button>
                <Button
                  onClick={() => setSafety('block')}
                  type="button"
                  variant="secondary"
                >
                  Block founder
                </Button>
              </div>
            </>
          )}
        </aside>
      </div>

      <dialog
        aria-labelledby={dialogTitleId}
        aria-modal="true"
        className="fc-filter-sheet fc-request-dialog"
        onCancel={(event) => {
          event.preventDefault();
          closeDelete();
        }}
        onClose={() =>
          deleteButtonRef.current?.querySelector('button')?.focus()
        }
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeDelete();
          }
        }}
        ref={dialogRef}
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmDelete();
          }}
        >
          <h2 id={dialogTitleId}>Delete request?</h2>
          <p>
            This removes the request from the member network. This can’t be
            undone.
          </p>
          <div className="fc-filter-sheet__actions">
            <Button onClick={closeDelete} type="button" variant="secondary">
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              Delete request
            </Button>
          </div>
        </form>
      </dialog>
      <ReportSheet
        onClose={() => setSafety(null)}
        open={safety === 'report-request'}
        targetId={request.id}
        targetType="REQUEST"
      />
      <ReportSheet
        onClose={() => setSafety(null)}
        open={safety === 'report-founder'}
        targetId={request.author.id}
        targetType="USER"
      />
      <BlockSheet
        founderId={request.author.id}
        founderName={request.author.displayName}
        onClose={() => setSafety(null)}
        open={safety === 'block'}
      />
    </div>
  );
}
