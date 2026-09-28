'use client';

import {
  APPLICATION_ELIGIBILITY_ROLES,
  type AdminApplicationDetail,
  type AdminApplicationDetailResponse,
  type ApplicationEligibilityRole,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import {
  AdminApiError,
  decideAdminApplication,
  loadAdminApplication,
} from '../../admin-api';

const eligibilityLabels: Record<ApplicationEligibilityRole, string> = {
  [APPLICATION_ELIGIBILITY_ROLES.founder]: 'Founder / Co-founder',
  [APPLICATION_ELIGIBILITY_ROLES.operator]: 'Founding team / operator',
  [APPLICATION_ELIGIBILITY_ROLES.notBuilding]: 'Not currently building',
};

export function ApplicationDetailClient({ id }: { readonly id: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<AdminApplicationDetailResponse | null>(
    null,
  );
  const [view, setView] = useState<'loading' | 'ready' | 'error' | 'denied'>(
    'loading',
  );
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [noteError, setNoteError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [pending, setPending] = useState<
    'needs-info' | 'approve' | 'reject' | ''
  >('');
  const [dialog, setDialog] = useState<
    'needs-info' | 'approve' | 'reject' | null
  >(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const needsInfoRef = useRef<HTMLDialogElement>(null);
  const rejectRef = useRef<HTMLDialogElement>(null);
  const approveRef = useRef<HTMLDialogElement>(null);

  async function load() {
    const response = await loadAdminApplication(id);
    setPayload(response);
    setView('ready');
    setMessage('');
  }

  useEffect(() => {
    let cancelled = false;
    void loadAdminApplication(id)
      .then((response) => {
        if (cancelled) return;
        setPayload(response);
        setView('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        handleLoadError(error, router, setMessage, setView);
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  useEffect(() => {
    const node =
      dialog === 'needs-info'
        ? needsInfoRef.current
        : dialog === 'reject'
          ? rejectRef.current
          : dialog === 'approve'
            ? approveRef.current
            : null;
    if (!node) return;
    if (!node.open) node.showModal();
    const focusable = node.querySelector<HTMLElement>(
      'textarea, button:not([disabled])',
    );
    focusable?.focus();
    function onCancel(event: Event) {
      event.preventDefault();
      closeDialog();
    }
    node.addEventListener('cancel', onCancel);
    return () => node.removeEventListener('cancel', onCancel);
  }, [dialog]);

  function openDialog(
    next: 'needs-info' | 'approve' | 'reject',
    button: HTMLButtonElement,
  ) {
    opener.current = button;
    setDialog(next);
  }

  function closeDialog() {
    needsInfoRef.current?.close();
    rejectRef.current?.close();
    approveRef.current?.close();
    setDialog(null);
    opener.current?.focus();
  }

  async function recoverFromConflict(error: AdminApiError) {
    try {
      await load();
      closeDialog();
      setMessage(
        'This application was already reviewed by another administrator.',
      );
    } catch {
      setMessage(error.message);
    }
  }

  async function submitDecision(
    action: 'needs-info' | 'approve' | 'reject',
    body?: Record<string, string>,
  ) {
    setPending(action);
    try {
      const response = await decideAdminApplication(id, action, body);
      setPayload(response);
      setMessage('');
      setNoteError('');
      setReasonError('');
      closeDialog();
    } catch (error) {
      if (
        error instanceof AdminApiError &&
        (error.code === 'ADMIN_ACTION_INVALID_STATE' ||
          error.code === 'APPLICATION_INVALID_STATE') &&
        Object.keys(error.fieldErrors).length === 0
      ) {
        await recoverFromConflict(error);
        return;
      }
      if (error instanceof AdminApiError) {
        if (action === 'needs-info') {
          setNoteError(error.fieldErrors.note?.[0] ?? '');
        }
        if (action === 'reject') {
          setReasonError(
            error.fieldErrors.reason?.[0] ?? error.fieldErrors.note?.[0] ?? '',
          );
        }
        setMessage(error.message);
        return;
      }
      setMessage('Something went wrong. Please try again.');
    } finally {
      setPending('');
    }
  }

  function onNeedsInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) {
      setNoteError('Enter a note.');
      return;
    }
    void submitDecision('needs-info', { note });
  }

  function onReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) {
      setReasonError('Enter a reason.');
      return;
    }
    void submitDecision('reject', { reason });
  }

  if (view === 'loading') {
    return (
      <AdminState title="Loading application…">
        Checking review status.
      </AdminState>
    );
  }
  if (view === 'denied') {
    return (
      <AdminState title="You don’t have permission to review applications">
        {message}
      </AdminState>
    );
  }
  if (view === 'error' || !payload) {
    return (
      <AdminState title="We couldn’t load this application">
        {message}
        <Button
          onClick={() => {
            setView('loading');
            void load().catch((error: unknown) =>
              handleLoadError(error, router, setMessage, setView),
            );
          }}
          variant="secondary"
        >
          Try again
        </Button>
      </AdminState>
    );
  }

  const application = payload.application;
  const submitted = application.status === 'SUBMITTED';
  const canNeedsInfo = submitted && payload.capabilities.needsInfo;
  const canApprove = submitted && payload.capabilities.approve;
  const canReject = submitted && payload.capabilities.reject;

  return (
    <section className="fc-admin-application-detail">
      <p>
        <Link href="/admin/applications">Back to applications</Link>
      </p>
      <header className="fc-admin-applications__header">
        <h1>Application · Applicant</h1>
        <p>
          Founder admission should be explainable, evidence-backed and
          recoverable.
        </p>
      </header>
      <div className="fc-admin-application-detail__status">
        <span className="fc-admin-applications__badge">
          {statusLabel(application.status)}
        </span>
        <p>
          {application.submittedAt
            ? `Submitted ${formatDate(application.submittedAt)}`
            : 'Not submitted'}
          {application.decidedAt
            ? ` · Decided ${formatDate(application.decidedAt)}`
            : ''}
        </p>
        <div className="fc-admin-application-detail__actions">
          {canNeedsInfo ? (
            <Button
              disabled={Boolean(pending)}
              onClick={(event) => openDialog('needs-info', event.currentTarget)}
              variant="secondary"
            >
              Needs info
            </Button>
          ) : null}
          {canApprove ? (
            <Button
              disabled={Boolean(pending)}
              onClick={(event) => openDialog('approve', event.currentTarget)}
            >
              Approve
            </Button>
          ) : null}
          {canReject ? (
            <Button
              disabled={Boolean(pending)}
              onClick={(event) => openDialog('reject', event.currentTarget)}
              variant="secondary"
            >
              Reject
            </Button>
          ) : null}
        </div>
      </div>
      {message ? (
        <p className="fc-admin-applications__alert" role="status">
          {message}
        </p>
      ) : null}
      <div className="fc-admin-application-detail__grid">
        <article>
          <p className="fc-admin-applications__label">Applicant</p>
          <h2>Applicant</h2>
          <dl>
            <DetailItem label="Email">
              {application.applicant.email} ·{' '}
              {application.applicant.emailVerified
                ? 'verified'
                : 'not verified'}
            </DetailItem>
            <DetailItem label="Eligibility">
              {eligibilityLabel(application.eligibilityRole)}
            </DetailItem>
            <DetailItem label="Company">
              {application.companyName || '—'}
            </DetailItem>
            <DetailItem label="Role">{application.roleTitle || '—'}</DetailItem>
            <DetailItem label="Website">
              {application.website || 'Not provided'}
            </DetailItem>
            <DetailItem label="Location">
              {[application.city, application.country]
                .filter(Boolean)
                .join(', ') || '—'}
            </DetailItem>
            <DetailItem label="What are you building?">
              {application.buildingSummary || '—'}
            </DetailItem>
          </dl>
        </article>
        <aside>
          <p className="fc-admin-applications__label">Review</p>
          <h2>Decision history</h2>
          <p>{application.latestReviewNote || 'No previous decision note.'}</p>
        </aside>
      </div>

      <dialog
        aria-labelledby="needs-info-title"
        aria-modal="true"
        className="fc-admin-dialog"
        ref={needsInfoRef}
      >
        <form onSubmit={onNeedsInfo}>
          <h2 id="needs-info-title">Request more information</h2>
          <Field
            disabled={pending === 'needs-info'}
            error={noteError}
            fieldType="textarea"
            label="Note for the founder"
            name="note"
            onChange={(event) => {
              setNote(event.currentTarget.value);
              setNoteError('');
            }}
            value={note}
          />
          <div className="fc-admin-dialog__actions">
            <Button disabled={pending === 'needs-info'} type="submit">
              {pending === 'needs-info' ? 'Saving…' : 'Send request'}
            </Button>
            <Button
              disabled={pending === 'needs-info'}
              onClick={closeDialog}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby="reject-title"
        aria-modal="true"
        className="fc-admin-dialog"
        ref={rejectRef}
      >
        <form onSubmit={onReject}>
          <h2 id="reject-title">Reject application</h2>
          <Field
            disabled={pending === 'reject'}
            error={reasonError}
            fieldType="textarea"
            label="Rejection reason"
            name="reason"
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setReasonError('');
            }}
            value={reason}
          />
          <div className="fc-admin-dialog__actions">
            <Button disabled={pending === 'reject'} type="submit">
              {pending === 'reject' ? 'Saving…' : 'Reject application'}
            </Button>
            <Button
              disabled={pending === 'reject'}
              onClick={closeDialog}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby="approve-title"
        aria-modal="true"
        className="fc-admin-dialog"
        ref={approveRef}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitDecision('approve');
          }}
        >
          <h2 id="approve-title">Approve application</h2>
          <p>This admits the founder to onboarding. This cannot be undone.</p>
          <div className="fc-admin-dialog__actions">
            <Button disabled={pending === 'approve'} type="submit">
              {pending === 'approve' ? 'Saving…' : 'Confirm approval'}
            </Button>
            <Button
              disabled={pending === 'approve'}
              onClick={closeDialog}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </section>
  );
}

function handleLoadError(
  error: unknown,
  router: { replace: (href: string) => void },
  setMessage: (value: string) => void,
  setView: (value: 'loading' | 'ready' | 'error' | 'denied') => void,
) {
  if (error instanceof AdminApiError && error.code === 'AUTH_SESSION_EXPIRED') {
    router.replace('/signin');
    return;
  }
  if (
    error instanceof AdminApiError &&
    error.code === 'ADMIN_PERMISSION_DENIED'
  ) {
    setMessage(error.message);
    setView('denied');
    return;
  }
  setMessage(
    error instanceof Error
      ? error.message
      : 'We could not load this application.',
  );
  setView('error');
}

function AdminState({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <section className="fc-admin-applications-state">
      <h1>{title}</h1>
      <div>{children}</div>
    </section>
  );
}

function DetailItem({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  const id = useId();
  return (
    <div>
      <dt id={id}>{label}</dt>
      <dd aria-labelledby={id}>{children}</dd>
    </div>
  );
}

function eligibilityLabel(value: ApplicationEligibilityRole | null): string {
  return value ? eligibilityLabels[value] : 'Not provided';
}

function statusLabel(status: AdminApplicationDetail['status']): string {
  if (status === 'SUBMITTED') return 'Pending';
  if (status === 'NEEDS_INFO') return 'Needs info';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return 'Rejected';
  return status;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
