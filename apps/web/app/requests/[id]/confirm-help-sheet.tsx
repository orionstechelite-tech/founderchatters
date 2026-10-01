'use client';

import type {
  HelpOutcome,
  MemberHelpResponse,
  MemberRequest,
} from '@founderchatters/contracts';
import {
  HELP_CONFIRMATION_LIMITS,
  HELP_OUTCOMES,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { OnboardingApiError } from '../../onboarding/onboarding-api';
import {
  createHelpConfirmation,
  createThankYouNote,
} from '../../member/member-api';

type SheetState = 'form' | 'helped' | 'still' | 'not' | 'thank';

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || 'this founder';
}

export function ConfirmHelpSheet({
  open,
  request,
  response,
  mode,
  onClose,
  onRecorded,
}: {
  open: boolean;
  request: MemberRequest;
  response: MemberHelpResponse;
  mode: 'confirm' | 'update' | 'thank';
  onClose: () => void;
  onRecorded: () => Promise<void>;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inflight = useRef(false);
  const helperName = response.author?.displayName ?? 'this founder';
  const existing = response.helpConfirmation;
  const [state, setState] = useState<SheetState>(
    mode === 'thank' ? 'thank' : 'form',
  );
  const [outcome, setOutcome] = useState<HelpOutcome>(
    existing?.outcome && existing.outcome !== HELP_OUTCOMES.helped
      ? existing.outcome
      : HELP_OUTCOMES.helped,
  );
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [recordedTopics, setRecordedTopics] = useState<string[]>([]);
  const [recordedNote, setRecordedNote] = useState<string | null>(null);
  const [confirmationId, setConfirmationId] = useState<string | null>(
    existing?.id ?? null,
  );

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  function toggleTopic(id: string) {
    setTopicIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= HELP_CONFIRMATION_LIMITS.topicIdsMax) {
        return current;
      }
      return [...current, id];
    });
  }

  async function submitConfirmation(skipNote: boolean) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload =
        outcome === HELP_OUTCOMES.helped
          ? {
              responseId: response.id,
              outcome,
              topicIds,
            }
          : { responseId: response.id, outcome };
      const result = await createHelpConfirmation(request.id, payload);
      setConfirmationId(result.confirmation.id);
      await onRecorded();
      if (outcome === HELP_OUTCOMES.stillTalking) {
        setState('still');
        return;
      }
      if (outcome === HELP_OUTCOMES.notHelpful) {
        setState('not');
        return;
      }
      const selectedLabels = request.topics
        .filter((topic) => result.confirmation.topicIds.includes(topic.id))
        .map((topic) => topic.label);
      setRecordedTopics(selectedLabels);
      if (!skipNote && note.trim()) {
        try {
          const thankYou = await createThankYouNote(
            result.confirmation.id,
            note,
          );
          setRecordedNote(thankYou.thankYou.body);
        } catch (cause: unknown) {
          setRecordedNote(null);
          setError(
            cause instanceof OnboardingApiError
              ? cause.message
              : 'Help was recorded. We could not save the thank-you note yet.',
          );
        }
      } else {
        setRecordedNote(null);
      }
      setState('helped');
    } catch (cause: unknown) {
      if (cause instanceof OnboardingApiError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors ?? {});
      } else {
        setError('We could not record that help confirmation.');
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function submitThankYou() {
    if (inflight.current || !confirmationId) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const thankYou = await createThankYouNote(confirmationId, note);
      setRecordedNote(thankYou.thankYou.body);
      await onRecorded();
      setState('helped');
    } catch (cause: unknown) {
      if (cause instanceof OnboardingApiError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors ?? {});
      } else {
        setError('We could not save that thank-you note.');
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const helped = outcome === HELP_OUTCOMES.helped;

  return (
    <dialog
      aria-labelledby={titleId}
      aria-modal="true"
      className="fc-filter-sheet fc-help-sheet fc-confirm-sheet"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      ref={dialogRef}
    >
      {state === 'form' ? (
        <>
          <p className="fc-label">Close the loop</p>
          <h2 className="fc-help-sheet__title" id={titleId}>
            Confirm help
          </h2>
          <p className="fc-help-sheet__lead">
            Did {firstName(helperName)}’s help move you forward?
          </p>
          <div className="fc-confirm-outcomes">
            {(
              [
                [
                  HELP_OUTCOMES.helped,
                  'Yes — this helped',
                  'Record a contribution and optionally write a thank-you.',
                ],
                [
                  HELP_OUTCOMES.stillTalking,
                  'We’re still talking',
                  'Keep the request open; no reputation change yet.',
                ],
                [
                  HELP_OUTCOMES.notHelpful,
                  'No / not yet',
                  'Close without penalizing the helper.',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                aria-label={label}
                className={
                  outcome === value
                    ? 'fc-confirm-outcome fc-confirm-outcome--selected'
                    : 'fc-confirm-outcome'
                }
                key={value}
                onClick={() => setOutcome(value)}
                type="button"
              >
                <span>{label}</span>
                <small>{hint}</small>
              </button>
            ))}
          </div>
          {helped && request.topics.length > 0 ? (
            <fieldset className="fc-confirm-topics">
              <legend>What did they help with?</legend>
              <div className="fc-confirm-topic-list">
                {request.topics.map((topic) => (
                  <label className="fc-confirm-topic" key={topic.id}>
                    <input
                      checked={topicIds.includes(topic.id)}
                      onChange={() => toggleTopic(topic.id)}
                      type="checkbox"
                    />
                    <span>{topic.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {helped ? (
            <Field
              fieldType="textarea"
              hint={`This note can appear on ${firstName(helperName)}’s contribution history. ${String(HELP_CONFIRMATION_LIMITS.thankYouMax)} characters max.`}
              label="Add a thank-you note"
              maxLength={HELP_CONFIRMATION_LIMITS.thankYouMax}
              onChange={(event) => setNote(event.target.value)}
              value={note}
              {...(fieldErrors.body?.[0] ? { error: fieldErrors.body[0] } : {})}
            />
          ) : null}
          {error ? (
            <p className="fc-ask-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="fc-filter-sheet__actions">
            {helped ? (
              <>
                <Button
                  disabled={busy}
                  onClick={() => void submitConfirmation(false)}
                  type="button"
                >
                  Confirm help
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void submitConfirmation(true)}
                  type="button"
                  variant="secondary"
                >
                  Skip note
                </Button>
              </>
            ) : (
              <Button
                disabled={busy}
                onClick={() => void submitConfirmation(true)}
                type="button"
              >
                Continue
              </Button>
            )}
            <Button onClick={onClose} type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </>
      ) : null}

      {state === 'thank' ? (
        <>
          <h2 className="fc-help-sheet__title" id={titleId}>
            Add a thank-you note
          </h2>
          <p className="fc-help-sheet__lead">
            This note can appear on {firstName(helperName)}’s contribution
            history.
          </p>
          <Field
            fieldType="textarea"
            label="Thank-you note"
            maxLength={HELP_CONFIRMATION_LIMITS.thankYouMax}
            onChange={(event) => setNote(event.target.value)}
            value={note}
            {...(fieldErrors.body?.[0] ? { error: fieldErrors.body[0] } : {})}
          />
          {error ? (
            <p className="fc-ask-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="fc-filter-sheet__actions">
            <Button
              disabled={busy || !note.trim()}
              onClick={() => void submitThankYou()}
              type="button"
            >
              Save thank-you
            </Button>
            <Button onClick={onClose} type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </>
      ) : null}

      {state === 'helped' ? (
        <div className="fc-confirm-success">
          <p className="fc-label">Contribution recorded</p>
          <h2 className="fc-help-sheet__title" id={titleId}>
            Thank you
          </h2>
          <div className="fc-confirm-recorded">
            <p className="fc-confirm-recorded__kicker">Contribution recorded</p>
            <p className="fc-confirm-recorded__metric">+1 confirmed help</p>
            {recordedTopics.length > 0 ? (
              <>
                <p className="fc-confirm-recorded__kicker">Recognized for</p>
                <ul className="fc-confirm-recorded__topics">
                  {recordedTopics.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {recordedNote ? (
              <>
                <p className="fc-confirm-recorded__kicker">Your note</p>
                <p className="fc-confirm-recorded__note">“{recordedNote}”</p>
              </>
            ) : null}
          </div>
          {error ? (
            <p className="fc-ask-error" role="alert">
              {error}
            </p>
          ) : null}
          {error && confirmationId && note.trim() && !recordedNote ? (
            <Button
              disabled={busy}
              onClick={() => void submitThankYou()}
              type="button"
            >
              Retry thank-you
            </Button>
          ) : null}
          <div className="fc-filter-sheet__actions">
            <Link
              className="fc-button fc-button--medium fc-button--primary"
              href="/reputation"
            >
              View reputation
            </Link>
            <Button onClick={onClose} type="button" variant="secondary">
              Back to request
            </Button>
          </div>
          <p className="fc-help-sheet__note">
            Reputation is earned from confirmed help, not likes.
          </p>
        </div>
      ) : null}

      {state === 'still' ? (
        <>
          <h2 className="fc-help-sheet__title" id={titleId}>
            Recorded — you can update this later.
          </h2>
          <p className="fc-help-sheet__lead">
            No contribution was created. This request stays as it is.
          </p>
          <Button onClick={onClose} type="button">
            Back to request
          </Button>
        </>
      ) : null}

      {state === 'not' ? (
        <>
          <h2 className="fc-help-sheet__title" id={titleId}>
            Recorded — this does not affect their public reputation.
          </h2>
          <p className="fc-help-sheet__lead">
            You can confirm this help later if it becomes useful.
          </p>
          <Button onClick={onClose} type="button">
            Back to request
          </Button>
        </>
      ) : null}
    </dialog>
  );
}
