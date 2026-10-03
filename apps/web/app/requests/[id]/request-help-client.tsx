'use client';

import type {
  MemberHelpResponse,
  MemberHelpResponsesResponse,
  MemberRequest,
  ResponseType,
} from '@founderchatters/contracts';
import {
  HELP_RESPONSE_LIMITS,
  RESPONSE_TYPES,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { OnboardingApiError } from '../../onboarding/onboarding-api';
import {
  cancelIntroduction,
  consentIntroduction,
  createAdviceResponse,
  createConversation,
  createIntroductionResponse,
  createPrivateChatResponse,
  declineIntroduction,
  listRequestResponses,
} from '../../member/member-api';
import { ReportSheet } from '../../safety/report-sheet';
import { ConfirmHelpSheet } from './confirm-help-sheet';

type ConfirmAction = 'consent' | 'decline' | 'cancel' | null;

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || 'this founder';
}

function helperLabel(response: MemberHelpResponse): string {
  return response.author?.displayName ?? 'Member unavailable';
}

function typeLabel(type: ResponseType): string {
  if (type === RESPONSE_TYPES.advice) return 'Public advice';
  if (type === RESPONSE_TYPES.introductionOffer) return 'Introduction offered';
  return 'Private help offered';
}

export function RequestHelpThread({
  request,
  isOwner,
  viewerId,
}: {
  request: MemberRequest;
  isOwner: boolean;
  viewerId?: string;
}) {
  const router = useRouter();
  const chooserTitleId = useId();
  const adviceTitleId = useId();
  const introTitleId = useId();
  const confirmTitleId = useId();
  const helpButtonRef = useRef<HTMLSpanElement>(null);
  const chooserRef = useRef<HTMLDialogElement>(null);
  const adviceRef = useRef<HTMLDialogElement>(null);
  const introRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [thread, setThread] = useState<MemberHelpResponsesResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const [advice, setAdvice] = useState('');
  const [personName, setPersonName] = useState('');
  const [reason, setReason] = useState('');
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: ConfirmAction;
    introductionId: string;
  } | null>(null);
  const [reportResponseId, setReportResponseId] = useState<string | null>(null);
  const [confirmHelp, setConfirmHelp] = useState<{
    response: MemberHelpResponse;
    mode: 'confirm' | 'update' | 'thank';
  } | null>(null);

  async function refresh() {
    const payload = await listRequestResponses(request.id);
    setThread(payload);
  }

  useEffect(() => {
    let cancelled = false;
    void listRequestResponses(request.id)
      .then((payload) => {
        if (!cancelled) {
          setThread(payload);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'Help responses are unavailable.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  const used = new Set(thread?.viewerResponseTypes ?? []);
  const canHelp =
    !isOwner &&
    request.status === 'PUBLISHED' &&
    (thread?.canOfferHelp ?? false);

  function openChooser() {
    chooserRef.current?.showModal();
  }

  function closeSheets() {
    chooserRef.current?.close();
    adviceRef.current?.close();
    introRef.current?.close();
    helpButtonRef.current?.querySelector('button')?.focus();
  }

  function openAdvice() {
    chooserRef.current?.close();
    adviceRef.current?.showModal();
  }

  function openIntro() {
    chooserRef.current?.close();
    introRef.current?.showModal();
  }

  async function submitAdvice() {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setFieldErrors({});
    try {
      await createAdviceResponse(request.id, advice);
      await refresh();
      setAdvice('');
      closeSheets();
      setError(null);
    } catch (cause: unknown) {
      if (cause instanceof OnboardingApiError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors ?? {});
      } else {
        setError('We could not publish that advice.');
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function submitIntro() {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setFieldErrors({});
    try {
      await createIntroductionResponse(request.id, {
        personName,
        reason,
        permissionConfirmed,
      });
      await refresh();
      setPersonName('');
      setReason('');
      setPermissionConfirmed(false);
      closeSheets();
      setError(null);
    } catch (cause: unknown) {
      if (cause instanceof OnboardingApiError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors ?? {});
      } else {
        setError('We could not offer that introduction.');
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function submitPrivate() {
    if (inflight.current || used.has(RESPONSE_TYPES.privateChatOffer)) return;
    inflight.current = true;
    setBusy(true);
    try {
      await createPrivateChatResponse(request.id);
      await refresh();
      closeSheets();
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not offer private help.',
      );
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  function askConfirm(
    action: Exclude<ConfirmAction, null>,
    introductionId: string,
  ) {
    setConfirm({ action, introductionId });
    confirmRef.current?.showModal();
  }

  async function runConfirm() {
    if (!confirm || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    try {
      if (confirm.action === 'consent') {
        await consentIntroduction(confirm.introductionId);
      } else if (confirm.action === 'decline') {
        await declineIntroduction(confirm.introductionId);
      } else {
        await cancelIntroduction(confirm.introductionId);
      }
      await refresh();
      confirmRef.current?.close();
      setConfirm(null);
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not update that introduction.',
      );
      confirmRef.current?.close();
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function startPrivateChat(responseId: string) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    try {
      const payload = await createConversation(responseId);
      setError(null);
      router.push(`/messages/${payload.conversation.id}`);
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not start that conversation.',
      );
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const responses = thread?.responses ?? [];
  const count = thread?.total ?? 0;
  const threadReady = thread !== null || error !== null;

  return (
    <div className="fc-request-responses">
      <p className="fc-label">Responses · {count}</p>
      {error ? (
        <p className="fc-ask-error" role="alert">
          {error}
        </p>
      ) : null}
      {canHelp ? (
        <span ref={helpButtonRef}>
          <Button onClick={openChooser} type="button">
            I can help
          </Button>
        </span>
      ) : null}

      {!threadReady ? (
        <p>Loading responses…</p>
      ) : count === 0 ? (
        <p>
          No responses yet. Relevant founders can share advice, offer an
          introduction, or move the conversation private.
        </p>
      ) : (
        <ul className="fc-help-thread">
          {responses.map((response) => {
            const introduction = response.introduction;
            return (
              <li className="fc-help-card" key={response.id}>
                <p className="fc-help-card__title">
                  {helperLabel(response)} · {typeLabel(response.type)}
                </p>
                {response.type === RESPONSE_TYPES.advice ? (
                  <p className="fc-help-card__body">{response.body}</p>
                ) : null}
                {response.type === RESPONSE_TYPES.introductionOffer &&
                introduction ? (
                  <>
                    {introduction.reason ? (
                      <p className="fc-help-card__body">
                        {introduction.reason}
                      </p>
                    ) : null}
                    {introduction.personName ? (
                      <p className="fc-help-card__body">
                        Introduction: {introduction.personName}
                      </p>
                    ) : null}
                    <div className="fc-help-card__actions">
                      {introduction.canConsent ? (
                        <Button
                          onClick={() => askConfirm('consent', introduction.id)}
                          type="button"
                        >
                          Accept introduction
                        </Button>
                      ) : null}
                      {introduction.canDecline ? (
                        <Button
                          onClick={() => askConfirm('decline', introduction.id)}
                          type="button"
                          variant="secondary"
                        >
                          Decline
                        </Button>
                      ) : null}
                      {introduction.canCancel ? (
                        <Button
                          onClick={() => askConfirm('cancel', introduction.id)}
                          type="button"
                          variant="secondary"
                        >
                          Cancel offer
                        </Button>
                      ) : null}
                    </div>
                  </>
                ) : null}
                {response.type === RESPONSE_TYPES.privateChatOffer &&
                response.privateChat ? (
                  <div className="fc-help-card__actions">
                    {response.privateChat.canStart ? (
                      <Button
                        disabled={busy}
                        onClick={() => void startPrivateChat(response.id)}
                        type="button"
                      >
                        Start private chat
                      </Button>
                    ) : null}
                    {response.privateChat.canOpen &&
                    response.privateChat.conversationId ? (
                      <Button
                        onClick={() =>
                          router.push(
                            `/messages/${response.privateChat!.conversationId}`,
                          )
                        }
                        type="button"
                      >
                        Open private chat
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {isOwner && response.helpConfirmation?.outcome === 'HELPED' ? (
                  <p className="fc-help-confirmed">Help confirmed</p>
                ) : null}
                {isOwner && response.helpConfirmation ? (
                  <div className="fc-help-card__actions">
                    {response.helpConfirmation.canConfirm ? (
                      <Button
                        onClick={() =>
                          setConfirmHelp({ response, mode: 'confirm' })
                        }
                        type="button"
                      >
                        Confirm help
                      </Button>
                    ) : null}
                    {response.helpConfirmation.canUpdate ? (
                      <Button
                        onClick={() =>
                          setConfirmHelp({ response, mode: 'update' })
                        }
                        type="button"
                        variant="secondary"
                      >
                        Update help outcome
                      </Button>
                    ) : null}
                    {response.helpConfirmation.canThank ? (
                      <Button
                        onClick={() =>
                          setConfirmHelp({ response, mode: 'thank' })
                        }
                        type="button"
                        variant="secondary"
                      >
                        Add thank-you
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {response.author && response.author.id !== viewerId ? (
                  <div className="fc-help-card__actions">
                    <Button
                      onClick={() => setReportResponseId(response.id)}
                      type="button"
                      variant="secondary"
                    >
                      Report response
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <dialog
        aria-labelledby={chooserTitleId}
        aria-modal="true"
        className="fc-filter-sheet fc-help-sheet"
        onCancel={(event) => {
          event.preventDefault();
          closeSheets();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeSheets();
          }
        }}
        ref={chooserRef}
      >
        <h2 className="fc-help-sheet__title" id={chooserTitleId}>
          I can help
        </h2>
        <p className="fc-help-sheet__lead">
          How would you like to help {firstName(request.author.displayName)}?
        </p>
        <div className="fc-help-options">
          <button
            className="fc-help-option fc-help-option--advice"
            disabled={used.has(RESPONSE_TYPES.advice) || busy}
            onClick={openAdvice}
            type="button"
          >
            <span>Share advice</span>
            <small>
              {used.has(RESPONSE_TYPES.advice)
                ? 'Already shared'
                : 'Public response'}
            </small>
            <span aria-hidden="true">→</span>
          </button>
          <button
            className="fc-help-option fc-help-option--intro"
            disabled={used.has(RESPONSE_TYPES.introductionOffer) || busy}
            onClick={openIntro}
            type="button"
          >
            <span>Offer introduction</span>
            <small>
              {used.has(RESPONSE_TYPES.introductionOffer)
                ? 'Already offered'
                : 'Warm intro'}
            </small>
            <span aria-hidden="true">→</span>
          </button>
          <button
            className="fc-help-option fc-help-option--private"
            disabled={used.has(RESPONSE_TYPES.privateChatOffer) || busy}
            onClick={() => void submitPrivate()}
            type="button"
          >
            <span>Chat privately</span>
            <small>
              {used.has(RESPONSE_TYPES.privateChatOffer)
                ? 'Already offered'
                : 'Request-linked DM'}
            </small>
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className="fc-help-sheet__note">
          Choose the action that matches what you can genuinely contribute.
        </p>
        <Button onClick={closeSheets} type="button" variant="secondary">
          Cancel
        </Button>
      </dialog>

      <dialog
        aria-labelledby={adviceTitleId}
        aria-modal="true"
        className="fc-filter-sheet fc-help-sheet"
        onCancel={(event) => {
          event.preventDefault();
          closeSheets();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeSheets();
          }
        }}
        ref={adviceRef}
      >
        <h2 className="fc-help-sheet__title" id={adviceTitleId}>
          Share advice
        </h2>
        <div className="fc-help-context">
          <p>{request.headline}</p>
          <p>
            {request.author.displayName} · {request.author.companyName}
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitAdvice();
          }}
        >
          <Field
            fieldType="textarea"
            hint={`Public advice becomes part of the request thread. ${String(HELP_RESPONSE_LIMITS.adviceMin)}–${String(HELP_RESPONSE_LIMITS.adviceMax)} characters.`}
            label="Your advice"
            onChange={(event) => setAdvice(event.target.value)}
            value={advice}
            {...(fieldErrors.body?.[0] ? { error: fieldErrors.body[0] } : {})}
          />
          <div className="fc-filter-sheet__actions">
            <Button disabled={busy} type="submit">
              Publish advice
            </Button>
            <Button onClick={closeSheets} type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby={introTitleId}
        aria-modal="true"
        className="fc-filter-sheet fc-help-sheet"
        onCancel={(event) => {
          event.preventDefault();
          closeSheets();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeSheets();
          }
        }}
        ref={introRef}
      >
        <h2 className="fc-help-sheet__title" id={introTitleId}>
          Offer an introduction
        </h2>
        <div className="fc-help-context">
          <p>{request.headline}</p>
          <p>
            {request.author.displayName} · {request.author.companyName}
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitIntro();
          }}
        >
          <Field
            hint="Name, role or company only. Do not include phone, email or contact links."
            label="Who can you introduce?"
            onChange={(event) => setPersonName(event.target.value)}
            placeholder="Name / role / company"
            value={personName}
            {...(fieldErrors.personName?.[0]
              ? { error: fieldErrors.personName[0] }
              : {})}
          />
          <Field
            fieldType="textarea"
            label="Why this person may be relevant"
            onChange={(event) => setReason(event.target.value)}
            placeholder={`Why this person may be relevant to ${firstName(request.author.displayName)}’s request…`}
            value={reason}
            {...(fieldErrors.reason?.[0]
              ? { error: fieldErrors.reason[0] }
              : {})}
          />
          <label className="fc-help-consent">
            <input
              checked={permissionConfirmed}
              onChange={(event) => setPermissionConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>I have their permission to make this intro</span>
          </label>
          {fieldErrors.permissionConfirmed?.[0] ? (
            <p className="fc-ask-error" role="alert">
              {fieldErrors.permissionConfirmed[0]}
            </p>
          ) : null}
          <p className="fc-help-sheet__note">
            Warm introductions should be consent-based.
          </p>
          <div className="fc-filter-sheet__actions">
            <Button disabled={busy} type="submit">
              Offer introduction
            </Button>
            <Button onClick={closeSheets} type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby={confirmTitleId}
        aria-modal="true"
        className="fc-filter-sheet fc-request-dialog"
        onCancel={(event) => {
          event.preventDefault();
          confirmRef.current?.close();
          setConfirm(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            confirmRef.current?.close();
            setConfirm(null);
          }
        }}
        ref={confirmRef}
      >
        <h2 id={confirmTitleId}>
          {confirm?.action === 'consent'
            ? 'Accept this introduction?'
            : confirm?.action === 'decline'
              ? 'Decline this introduction?'
              : 'Cancel this introduction offer?'}
        </h2>
        <p>
          {confirm?.action === 'consent'
            ? 'The requester will be able to see the introduced person’s name, role or company.'
            : confirm?.action === 'decline'
              ? 'This introduction will be marked declined and cannot be accepted later.'
              : 'This pending introduction offer will be cancelled.'}
        </p>
        <div className="fc-filter-sheet__actions">
          <Button
            onClick={() => {
              confirmRef.current?.close();
              setConfirm(null);
            }}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => void runConfirm()}
            type="button"
          >
            {confirm?.action === 'consent'
              ? 'Accept introduction'
              : confirm?.action === 'decline'
                ? 'Decline'
                : 'Cancel offer'}
          </Button>
        </div>
      </dialog>
      {confirmHelp ? (
        <ConfirmHelpSheet
          key={`${confirmHelp.response.id}-${confirmHelp.mode}`}
          mode={confirmHelp.mode}
          onClose={() => setConfirmHelp(null)}
          onRecorded={refresh}
          open
          request={request}
          response={confirmHelp.response}
        />
      ) : null}
      <ReportSheet
        onClose={() => setReportResponseId(null)}
        open={Boolean(reportResponseId)}
        targetId={reportResponseId ?? ''}
        targetType="RESPONSE"
      />
    </div>
  );
}
